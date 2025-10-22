/*
 * Unified NFC (NTAG424) Netlify Function
 * ESM-only, memory-optimized, privacy-first. Zero-knowledge: never store raw secrets.
 * Routes:
 *  - POST   /nfc-unified/verify
 *  - POST   /nfc-unified/register
 *  - POST   /nfc-unified/status        (check if a tag is initialized)
 *  - POST   /nfc-unified/initialize    (proxy to hardware bridge; optional)
 *  - GET    /nfc-unified/preferences
 *  - POST   /nfc-unified/preferences
 *  - PUT    /nfc-unified/preferences
 *  - DELETE /nfc-unified/preferences (delete tag by id)
 */

// Netlify ESM: export const handler
// Use .js extensions for local imports (even from TS) per repo guideline
import { SecureSessionManager } from "./security/session-manager.js";
import { getRequestClient } from "./supabase.js";
import { allowRequest } from "./utils/rate-limiter.js";

import type { Handler } from "@netlify/functions";

// Optional external hardware bridge base URL (e.g., https://bridge.example.com)
const BRIDGE_URL =
  process.env.NTAG424_BRIDGE_URL ||
  process.env.NTAG424_HARDWARE_BRIDGE_URL ||
  "";

async function bridgeFetch(path: string, payload: Record<string, unknown>) {
  if (!BRIDGE_URL) {
    return {
      ok: false,
      status: 501,
      json: async () => ({
        success: false,
        error: "Hardware bridge not configured",
        meta: { code: "bridge_unconfigured" },
      }),
    } as any;
  }
  const url = `${BRIDGE_URL.replace(/\/$/, "")}${
    path.startsWith("/") ? path : `/${path}`
  }`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  return res;
}

type JsonRecord = Record<string, unknown>;

type ApiResponse = {
  success: boolean;
  data?: JsonRecord | JsonRecord[] | null;
  error?: string;
  meta?: JsonRecord;
};

const json = (
  statusCode: number,
  body: ApiResponse,
  headers?: Record<string, string>
) => ({
  statusCode,
  headers: {
    ...buildCorsHeaders(),
    ...(headers || {}),
  },
  body: JSON.stringify(body),
});

function buildCorsHeaders(): Record<string, string> {
  const isProd = process.env.NODE_ENV === "production";
  const allowedOrigin = isProd
    ? process.env.FRONTEND_URL || "https://www.satnam.pub"
    : "*";
  const allowCredentials = allowedOrigin !== "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": String(allowCredentials),
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

function getLastPathSegment(path: string): string {
  const parts = (path || "").split("/").filter(Boolean);
  return (parts[parts.length - 1] || "").toLowerCase();
}

function parseJSON<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function clientIpFromEvent(event: any): string {
  const xfwd =
    event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
  const ip = Array.isArray(xfwd) ? xfwd[0] : (xfwd || "").split(",")[0]?.trim();
  return ip || "unknown";
}

// --- PIN hashing helpers (PBKDF2-SHA512, 100k iterations) ---
async function pbkdf2HashHex(pin: string, saltB64: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const saltBytes = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-512",
    },
    keyMaterial,
    512
  );
  const out = new Uint8Array(derivedBits);
  return Array.from(out)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSaltBase64(len: number = 24): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

async function setRlsContext(supabase: any, ownerHash: string): Promise<void> {
  try {
    // Preferred helper (if present)
    await supabase.rpc("set_app_current_user_hash", { val: ownerHash });
  } catch {
    // Fallback helpers (keep broad compatibility in this repo)
    try {
      await supabase.rpc("set_app_config", {
        setting_name: "app.current_user_hash",
        setting_value: ownerHash,
        is_local: true,
      });
    } catch {
      try {
        await supabase.rpc("app_set_config", {
          setting_name: "app.current_user_hash",
          setting_value: ownerHash,
          is_local: true,
        });
      } catch {}
    }
  }
}

async function requireSession(event: any) {
  const headers = event.headers || {};
  const authHeader =
    headers.authorization ||
    headers.Authorization ||
    headers["authorization"] ||
    headers["Authorization"];
  const session = await SecureSessionManager.validateSessionFromHeader(
    typeof authHeader === "string" ? authHeader : undefined
  );
  if (!session) return null;
  return session;
}

// ---------- Handlers ----------

async function handleVerify(event: any) {
  if ((event.httpMethod || "POST").toUpperCase() !== "POST") {
    return json(405, { success: false, error: "Method not allowed" });
  }

  const ip = clientIpFromEvent(event);
  if (!allowRequest(ip, 10, 60_000)) {
    return json(429, { success: false, error: "Too many attempts" });
  }

  const session = await requireSession(event);
  if (!session || !session.hashedId) {
    return json(401, { success: false, error: "Unauthorized" });
  }

  const body = parseJSON<{
    tagUID?: string;
    encryptedResponse?: string;
    challengeData?: string;
  }>(event.body);
  if (!body || !body.tagUID) {
    return json(400, { success: false, error: "Missing tagUID" });
  }

  const supabase = getRequestClient(
    (
      event.headers?.authorization ||
      event.headers?.Authorization ||
      ""
    ).replace(/^Bearer\s+/i, "")
  );
  await setRlsContext(supabase, session.hashedId!);

  // Derive privacy-preserving tag hash: HMAC(user-hash || tagUID)
  let hashedTag: string;
  try {
    const { createHmac } = await import("node:crypto");
    const duidSecret =
      process.env.DUID_SERVER_SECRET || process.env.DUID_SECRET_KEY;
    if (!duidSecret)
      return json(500, { success: false, error: "Server configuration error" });
    hashedTag = createHmac("sha256", duidSecret)
      .update(`${session.hashedId}:${body.tagUID}`)
      .digest("hex");
  } catch {
    return json(500, { success: false, error: "Hashing failed" });
  }

  // Lookup registration (support both hashed_tag_uid and legacy uid)
  const { data: reg, error } = await supabase
    .from("ntag424_registrations")
    .select(
      "id, owner_hash, hashed_tag_uid, uid, family_role, encrypted_config, pin_salt_base64, pin_hash_hex, pin_algo"
    )
    .or(`hashed_tag_uid.eq.${hashedTag},uid.eq.${body.tagUID}`)
    .limit(1)
    .maybeSingle();

  if (error || !reg) {
    return json(404, { success: false, error: "Tag not registered" });
  }

  // 1) PIN verification (if PIN is configured for this tag)
  if (reg.pin_hash_hex) {
    const pin = (parseJSON<{ pin?: string }>(event.body)?.pin || "").trim();
    if (!pin) {
      await supabase.from("ntag424_operations_log").insert({
        owner_hash: reg.owner_hash,
        hashed_tag_uid: reg.hashed_tag_uid || hashedTag,
        operation_type: "auth",
        success: false,
        timestamp: new Date().toISOString(),
        metadata: { reason: "pin_required" },
      });
      return json(401, { success: false, error: "PIN required" });
    }
    try {
      const computed = await pbkdf2HashHex(pin, reg.pin_salt_base64 as string);
      if (computed !== reg.pin_hash_hex) {
        await supabase.from("ntag424_operations_log").insert({
          owner_hash: reg.owner_hash,
          hashed_tag_uid: reg.hashed_tag_uid || hashedTag,
          operation_type: "auth",
          success: false,
          timestamp: new Date().toISOString(),
          metadata: { reason: "pin_invalid" },
        });
        return json(401, { success: false, error: "Invalid PIN" });
      }
    } catch {
      return json(500, { success: false, error: "PIN verification error" });
    }
  }

  // 2) SUN verification via hardware bridge if challenge provided and bridge configured
  let sunVerified: boolean | null = null;
  if (body.challengeData && body.encryptedResponse) {
    try {
      const res = await bridgeFetch("/ntag424/verify", {
        tagUID: body.tagUID,
        challengeData: body.challengeData,
        encryptedResponse: body.encryptedResponse,
        userHash: session.hashedId,
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && (j?.success || j?.data?.valid === true)) {
        sunVerified = true;
      } else if (
        res.status === 501 ||
        j?.meta?.code === "bridge_unconfigured"
      ) {
        sunVerified = null; // not enforced when bridge unconfigured
      } else {
        sunVerified = false;
      }
    } catch {
      sunVerified = false;
    }

    if (sunVerified === false) {
      await supabase.from("ntag424_operations_log").insert({
        owner_hash: reg.owner_hash,
        hashed_tag_uid: reg.hashed_tag_uid || hashedTag,
        operation_type: "auth",
        success: false,
        timestamp: new Date().toISOString(),
        metadata: { reason: "sun_verification_failed" },
      });
      return json(401, { success: false, error: "SUN verification failed" });
    }
  }

  await supabase.from("ntag424_operations_log").insert({
    owner_hash: reg.owner_hash,
    hashed_tag_uid: reg.hashed_tag_uid || hashedTag,
    operation_type: "auth",
    success: true,
    timestamp: new Date().toISOString(),
    metadata: {
      sunVerified:
        sunVerified === true
          ? "true"
          : sunVerified === false
          ? "false"
          : "not_enforced",
    },
  });

  return json(200, {
    success: true,
    data: { sessionMetadata: { role: reg.family_role || "private" } },
  });
}

async function handleStatus(event: any) {
  if ((event.httpMethod || "POST").toUpperCase() !== "POST") {
    return json(405, { success: false, error: "Method not allowed" });
  }

  const ip = clientIpFromEvent(event);
  if (!allowRequest(ip, 10, 60_000)) {
    return json(429, { success: false, error: "Too many attempts" });
  }

  const session = await requireSession(event);
  if (!session || !session.hashedId) {
    return json(401, { success: false, error: "Unauthorized" });
  }

  const body = parseJSON<{ tagUID?: string }>(event.body);
  if (!body || !body.tagUID) {
    return json(400, { success: false, error: "Missing tagUID" });
  }

  // Try querying external hardware bridge for initialization status
  try {
    const res = await bridgeFetch("/ntag424/status", {
      tagUID: body.tagUID,
      userHash: session.hashedId,
    });
    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      // If bridge unconfigured, return a helpful hint rather than an error
      const code = j?.meta?.code || j?.code;
      if (res.status === 501 || code === "bridge_unconfigured") {
        return json(200, {
          success: true,
          data: {
            initialized: false,
            source: "none",
            hint: "bridge_unconfigured",
          },
        });
      }
      return json(200, {
        success: true,
        data: { initialized: false, source: "bridge", hint: "bridge_error" },
      });
    }

    const initialized = Boolean(
      (j && (j.initialized ?? j.data?.initialized)) ?? false
    );
    return json(200, {
      success: true,
      data: { initialized, source: "bridge" },
    });
  } catch (e) {
    return json(200, {
      success: true,
      data: { initialized: false, source: "none", hint: "unknown_error" },
      meta: { message: e instanceof Error ? e.message : "Unknown error" },
    });
  }
}

async function handleInitialize(event: any) {
  if ((event.httpMethod || "POST").toUpperCase() !== "POST") {
    return json(405, { success: false, error: "Method not allowed" });
  }

  const ip = clientIpFromEvent(event);
  if (!allowRequest(ip, 3, 60_000)) {
    return json(429, { success: false, error: "Too many attempts" });
  }

  const session = await requireSession(event);
  if (!session || !session.hashedId) {
    return json(401, { success: false, error: "Unauthorized" });
  }

  const body = parseJSON<Record<string, unknown>>(event.body) || {};

  // If no external bridge configured, acknowledge client-side mobile/PWA initialization
  if (!BRIDGE_URL) {
    try {
      const supabase = getRequestClient(
        (
          event.headers?.authorization ||
          event.headers?.Authorization ||
          ""
        ).replace(/^Bearer\s+/i, "")
      );
      await setRlsContext(supabase, session.hashedId!);
      // Store only minimal operational metadata (never keys/secrets)
      const safeMeta: Record<string, unknown> = {
        method: (body as any)?.method || "mobile_pwa",
        tagUID_present: Boolean((body as any)?.tagUID),
        clientInfo: (body as any)?.clientInfo ? "present" : "none",
      };
      await supabase.from("ntag424_operations_log").insert({
        owner_hash: session.hashedId,
        hashed_tag_uid: null,
        operation_type: "initialize",
        success: true,
        timestamp: new Date().toISOString(),
        metadata: safeMeta,
      });
    } catch (e) {
      // Best-effort logging only; do not fail initialization ack
    }
    return json(200, {
      success: true,
      data: { initialized: true, source: "mobile_pwa_ack" },
    });
  }

  // Else proxy to external bridge when configured
  const res = await bridgeFetch("/ntag424/initialize", {
    ...(body || {}),
    userHash: session.hashedId,
  });
  const j = await res.json().catch(() => ({}));

  if (res.status === 501 || j?.meta?.code === "bridge_unconfigured") {
    return json(501, {
      success: false,
      error: "Hardware bridge not configured",
      meta: { code: "bridge_unconfigured" },
    });
  }
  if (!res.ok) {
    return json(500, {
      success: false,
      error: j?.error || "Initialization failed",
      meta: { status: res.status },
    });
  }
  return json(200, {
    success: true,
    data: { initialized: true, bridge: j?.data || j || null },
  });
}

async function handleRegister(event: any) {
  if ((event.httpMethod || "POST").toUpperCase() !== "POST") {
    return json(405, { success: false, error: "Method not allowed" });
  }

  const ip = clientIpFromEvent(event);
  if (!allowRequest(ip, 6, 60_000)) {
    return json(429, { success: false, error: "Too many attempts" });
  }

  const session = await requireSession(event);
  if (!session || !session.hashedId) {
    return json(401, { success: false, error: "Unauthorized" });
  }

  const body = parseJSON<{
    tagUID?: string;
    encryptedMetadata?: string;
    familyRole?: string;
    pin?: string; // optional during registration
  }>(event.body);
  if (!body || !body.tagUID || !body.encryptedMetadata) {
    return json(400, { success: false, error: "Missing required fields" });
  }

  const supabase = getRequestClient(
    (
      event.headers?.authorization ||
      event.headers?.Authorization ||
      ""
    ).replace(/^Bearer\s+/i, "")
  );
  await setRlsContext(supabase, session.hashedId!);

  // Derive privacy-preserving tag hash
  let hashedTag: string;
  try {
    const { createHmac } = await import("node:crypto");
    const duidSecret =
      process.env.DUID_SERVER_SECRET || process.env.DUID_SECRET_KEY;
    if (!duidSecret)
      return json(500, { success: false, error: "Server configuration error" });
    hashedTag = createHmac("sha256", duidSecret)
      .update(`${session.hashedId}:${body.tagUID}`)
      .digest("hex");
  } catch {
    return json(500, { success: false, error: "Hashing failed" });
  }

  // Ensure not already registered
  const { data: existing } = await supabase
    .from("ntag424_registrations")
    .select("id")
    .eq("owner_hash", session.hashedId)
    .eq("hashed_tag_uid", hashedTag)
    .maybeSingle();

  if (existing) {
    return json(409, { success: false, error: "Tag already registered" });
  }

  // Optional PIN storage (PBKDF2-SHA512, 100k) - never store plaintext PIN
  let pinSaltB64: string | null = null;
  let pinHashHex: string | null = null;
  if (typeof body.pin === "string" && body.pin.trim()) {
    pinSaltB64 = randomSaltBase64(24);
    pinHashHex = await pbkdf2HashHex(body.pin.trim(), pinSaltB64);
  }

  const { data, error } = await supabase
    .from("ntag424_registrations")
    .insert({
      owner_hash: session.hashedId,
      hashed_tag_uid: hashedTag,
      uid: null, // never store raw UID in privacy-first mode
      encrypted_config: body.encryptedMetadata,
      family_role: body.familyRole || "private",
      pin_salt_base64: pinSaltB64,
      pin_hash_hex: pinHashHex,
      pin_algo: pinHashHex ? "pbkdf2-sha512-100k" : null,
      created_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
    })
    .select("id, hashed_tag_uid")
    .single();

  if (error || !data) {
    return json(500, { success: false, error: "Registration failed" });
  }

  await supabase.from("ntag424_operations_log").insert({
    owner_hash: session.hashedId,
    hashed_tag_uid: hashedTag,
    operation_type: "register",
    success: true,
    timestamp: new Date().toISOString(),
    metadata: { family_role: body.familyRole || "private" },
  });

  return json(200, {
    success: true,
    data: { tagId: data.id, hashedTag: data.hashed_tag_uid },
  });
}

// Top-level login handler (moved from nested scope under handlePreferences)
async function handleLogin(event: any) {
  if ((event.httpMethod || "POST").toUpperCase() !== "POST") {
    return json(405, { success: false, error: "Method not allowed" });
  }

  const ip = clientIpFromEvent(event);
  if (!allowRequest(ip, 6, 60_000)) {
    return json(429, { success: false, error: "Too many attempts" });
  }

  const body = parseJSON<{
    tagId?: string; // registration id returned at register time
    tagUID?: string;
    pin?: string;
    challengeData?: string;
    encryptedResponse?: string;
  }>(event.body);

  if (!body || !body.tagId) {
    return json(400, { success: false, error: "Missing tagId" });
  }

  const supabase = getRequestClient(""); // no session token for login flow

  // Load registration by ID
  const { data: reg, error: regErr } = await supabase
    .from("ntag424_registrations")
    .select(
      "id, owner_hash, hashed_tag_uid, family_role, pin_salt_base64, pin_hash_hex, pin_algo"
    )
    .eq("id", body.tagId)
    .maybeSingle();

  if (regErr || !reg) {
    return json(404, { success: false, error: "Registration not found" });
  }

  // PIN verification if configured
  if (reg.pin_hash_hex) {
    const pin = (body.pin || "").trim();
    if (!pin) {
      await supabase.from("ntag424_operations_log").insert({
        owner_hash: reg.owner_hash,
        hashed_tag_uid: reg.hashed_tag_uid,
        operation_type: "login",
        success: false,
        timestamp: new Date().toISOString(),
        metadata: { reason: "pin_required" },
      });
      return json(401, { success: false, error: "PIN required" });
    }
    try {
      const computed = await pbkdf2HashHex(pin, reg.pin_salt_base64 as string);
      if (computed !== reg.pin_hash_hex) {
        await supabase.from("ntag424_operations_log").insert({
          owner_hash: reg.owner_hash,
          hashed_tag_uid: reg.hashed_tag_uid,
          operation_type: "login",
          success: false,
          timestamp: new Date().toISOString(),
          metadata: { reason: "pin_invalid" },
        });
        return json(401, { success: false, error: "Invalid PIN" });
      }
    } catch {
      return json(500, { success: false, error: "PIN verification error" });
    }
  }

  // Optional SUN verification via bridge (if provided)
  let sunVerified: boolean | null = null;
  if (body.tagUID && body.challengeData && body.encryptedResponse) {
    try {
      const res = await bridgeFetch("/ntag424/verify", {
        tagUID: body.tagUID,
        challengeData: body.challengeData,
        encryptedResponse: body.encryptedResponse,
        userHash: reg.owner_hash,
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && (j?.success || j?.data?.valid === true)) {
        sunVerified = true;
      } else if (
        res.status === 501 ||
        j?.meta?.code === "bridge_unconfigured"
      ) {
        sunVerified = null;
      } else {
        sunVerified = false;
      }
    } catch {
      sunVerified = false;
    }
    if (sunVerified === false) {
      await supabase.from("ntag424_operations_log").insert({
        owner_hash: reg.owner_hash,
        hashed_tag_uid: reg.hashed_tag_uid,
        operation_type: "login",
        success: false,
        timestamp: new Date().toISOString(),
        metadata: { reason: "sun_verification_failed" },
      });
      return json(401, { success: false, error: "SUN verification failed" });
    }
  }

  // Load user identity for session creation
  const { data: user } = await supabase
    .from("user_identities")
    .select("id, role, hashed_npub, hashed_nip05")
    .eq("id", reg.owner_hash)
    .maybeSingle();

  if (!user) {
    return json(404, { success: false, error: "User not found" });
  }

  // Create session token (map hashed_npub into npub field for consistency with existing server endpoints)
  const sessionToken = await SecureSessionManager.createSession(
    {} as any,
    {
      npub: user.hashed_npub || reg.owner_hash,
      nip05: undefined,
      federationRole: (user.role as any) || "private",
      authMethod: "nfc",
      isWhitelisted: false,
      votingPower: 0,
      stewardApproved: false,
      guardianApproved: false,
      sessionToken: "",
    } as any
  );

  await supabase.from("ntag424_operations_log").insert({
    owner_hash: reg.owner_hash,
    hashed_tag_uid: reg.hashed_tag_uid,
    operation_type: "login",
    success: true,
    timestamp: new Date().toISOString(),
    metadata: {
      sunVerified:
        sunVerified === true
          ? "true"
          : sunVerified === false
          ? "false"
          : "not_enforced",
    },
  });

  return json(200, {
    success: true,
    data: { sessionToken, user: { role: user.role, npub: user.hashed_npub } },
  });
}

async function handlePreferences(event: any) {
  const method = (event.httpMethod || "GET").toUpperCase();
  const ip = clientIpFromEvent(event);
  if (!allowRequest(ip, 30, 60_000)) {
    return json(429, { success: false, error: "Too many attempts" });
  }

  const session = await requireSession(event);
  if (!session || !session.hashedId) {
    return json(401, { success: false, error: "Unauthorized" });
  }

  const supabase = getRequestClient(
    (
      event.headers?.authorization ||
      event.headers?.Authorization ||
      ""
    ).replace(/^Bearer\s+/i, "")
  );
  await setRlsContext(supabase, session.hashedId!);

  if (method === "GET") {
    const { data: prefs, error } = await supabase
      .from("user_signing_preferences")
      .select("*")
      .eq("owner_hash", session.hashedId)
      .maybeSingle();

    const { data: tags } = await supabase
      .from("ntag424_registrations")
      .select("id, hashed_tag_uid, family_role, created_at, last_used")
      .eq("owner_hash", session.hashedId);

    if (error)
      return json(200, {
        success: true,
        data: { preferences: null, registeredTags: tags || [] },
      });

    return json(200, {
      success: true,
      data: { preferences: prefs || null, registeredTags: tags || [] },
    });
  }

  if (method === "POST" || method === "PUT") {
    const body = parseJSON<{
      preferences?: {
        nfc_pin_timeout_seconds?: number;
        nfc_require_confirmation?: boolean;
        preferred_method?: string;
        fallback_method?: string;
        require_nfc_for_unlock?: boolean;
      };
    }>(event.body);
    if (!body || !body.preferences) {
      return json(400, { success: false, error: "Missing preferences" });
    }

    // Upsert by owner_hash
    const updates: Record<string, unknown> = { owner_hash: session.hashedId };
    if (typeof body.preferences.nfc_pin_timeout_seconds === "number") {
      updates.nfc_pin_timeout_seconds =
        body.preferences.nfc_pin_timeout_seconds;
    }
    if (typeof body.preferences.nfc_require_confirmation === "boolean") {
      updates.nfc_require_confirmation =
        body.preferences.nfc_require_confirmation;
    }
    if (typeof body.preferences.preferred_method === "string")
      updates.preferred_method = body.preferences.preferred_method;
    if (typeof body.preferences.fallback_method === "string")
      updates.fallback_method = body.preferences.fallback_method;
    if (typeof body.preferences.require_nfc_for_unlock === "boolean")
      updates.require_nfc_for_unlock = body.preferences.require_nfc_for_unlock;

    const { data, error } = await supabase
      .from("user_signing_preferences")
      .upsert(updates, { onConflict: "owner_hash" })
      .select("*")
      .maybeSingle();

    if (error)
      return json(500, { success: false, error: "Failed to save preferences" });
    return json(200, { success: true, data: { preferences: data } });
  }

  if (method === "DELETE") {
    const body = parseJSON<{ tagId?: string }>(event.body);
    if (!body || !body.tagId)
      return json(400, { success: false, error: "Missing tagId" });

    const { error } = await supabase
      .from("ntag424_registrations")
      .delete()
      .eq("id", body.tagId)
      .eq("owner_hash", session.hashedId);

    if (error)
      return json(500, { success: false, error: "Failed to delete tag" });
    return json(200, { success: true, data: { deleted: true } });
  }

  return json(405, { success: false, error: "Method not allowed" });
}

// --- Additional NFC operations: read/program/verify-tag/erase ---
async function handleRead(event: any) {
  if ((event.httpMethod || "POST").toUpperCase() !== "POST") {
    return json(405, { success: false, error: "Method not allowed" });
  }
  const ip = clientIpFromEvent(event);
  if (!allowRequest(ip, 15, 60_000)) {
    return json(429, { success: false, error: "Too many attempts" });
  }
  const session = await requireSession(event);
  if (!session || !session.hashedId) {
    return json(401, { success: false, error: "Unauthorized" });
  }
  const body = parseJSON<{ tagUID?: string }>(event.body);
  if (!body?.tagUID)
    return json(400, { success: false, error: "Missing tagUID" });

  // Prefer hardware bridge if configured
  try {
    const res = await bridgeFetch("/ntag424/read", {
      tagUID: body.tagUID,
      userHash: session.hashedId,
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && (j?.success || j?.data)) {
      return json(200, { success: true, data: { sdm: j?.data?.sdm ?? null } });
    }
    if (res.status === 501 || j?.meta?.code === "bridge_unconfigured") {
      return json(200, {
        success: true,
        data: { sdm: { configured: false, source: "none" } },
      });
    }
  } catch {}
  return json(200, {
    success: true,
    data: { sdm: { configured: false, source: "unknown" } },
  });
}

async function handleProgram(event: any) {
  if ((event.httpMethod || "POST").toUpperCase() !== "POST") {
    return json(405, { success: false, error: "Method not allowed" });
  }
  const ip = clientIpFromEvent(event);
  if (!allowRequest(ip, 5, 60_000)) {
    return json(429, { success: false, error: "Too many attempts" });
  }
  const session = await requireSession(event);
  if (!session || !session.hashedId) {
    return json(401, { success: false, error: "Unauthorized" });
  }
  const body = parseJSON<{ url?: string; pin?: string; enableSDM?: boolean }>(
    event.body
  );
  if (!body?.url) return json(400, { success: false, error: "Missing url" });

  // Log the program intent (never store PIN; store only flags)
  try {
    const supabase = getRequestClient(
      (
        event.headers?.authorization ||
        event.headers?.Authorization ||
        ""
      ).replace(/^Bearer\s+/i, "")
    );
    await setRlsContext(supabase, session.hashedId!);
    await supabase.from("ntag424_operations_log").insert({
      owner_hash: session.hashedId,
      hashed_tag_uid: null,
      operation_type: "program_intent",
      success: true,
      timestamp: new Date().toISOString(),
      metadata: { url: body.url, enableSDM: !!body.enableSDM },
    });
  } catch {}

  // If bridge configured, proxy an instruction
  try {
    const res = await bridgeFetch("/ntag424/program", {
      url: body.url,
      enableSDM: !!body.enableSDM,
      userHash: session.hashedId,
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && (j?.success || j?.data)) {
      return json(200, {
        success: true,
        data: { programmed: true, bridge: j?.data ?? null },
      });
    }
    if (res.status === 501 || j?.meta?.code === "bridge_unconfigured") {
      return json(200, {
        success: true,
        data: { programmed: false, hint: "bridge_unconfigured" },
      });
    }
  } catch {}

  return json(200, {
    success: true,
    data: { programmed: false, hint: "recorded_intent_only" },
  });
}

async function handleVerifyTag(event: any) {
  if ((event.httpMethod || "POST").toUpperCase() !== "POST") {
    return json(405, { success: false, error: "Method not allowed" });
  }
  const ip = clientIpFromEvent(event);
  if (!allowRequest(ip, 10, 60_000)) {
    return json(429, { success: false, error: "Too many attempts" });
  }
  const session = await requireSession(event);
  if (!session || !session.hashedId) {
    return json(401, { success: false, error: "Unauthorized" });
  }
  try {
    const res = await bridgeFetch("/ntag424/verify-tag", {
      userHash: session.hashedId,
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && (j?.success || j?.data?.ok)) {
      return json(200, { success: true, data: { ok: true } });
    }
    if (res.status === 501 || j?.meta?.code === "bridge_unconfigured") {
      return json(200, {
        success: true,
        data: { ok: true, hint: "not_enforced" },
      });
    }
  } catch {}
  return json(200, { success: true, data: { ok: false } });
}

async function handleErase(event: any) {
  if ((event.httpMethod || "POST").toUpperCase() !== "POST") {
    return json(405, { success: false, error: "Method not allowed" });
  }
  const ip = clientIpFromEvent(event);
  if (!allowRequest(ip, 3, 60_000)) {
    return json(429, { success: false, error: "Too many attempts" });
  }
  const session = await requireSession(event);
  if (!session || !session.hashedId) {
    return json(401, { success: false, error: "Unauthorized" });
  }
  const body = parseJSON<{ tagUID?: string }>(event.body);
  if (!body?.tagUID) {
    return json(400, { success: false, error: "Missing tagUID" });
  }

  // Log erase intent
  try {
    const supabase = getRequestClient(
      (
        event.headers?.authorization ||
        event.headers?.Authorization ||
        ""
      ).replace(/^Bearer\s+/i, "")
    );
    await setRlsContext(supabase, session.hashedId!);
    // Derive privacy-preserving tag hash
    let hashedTag: string | null = null;
    try {
      const { createHmac } = await import("node:crypto");
      const duidSecret =
        process.env.DUID_SERVER_SECRET || process.env.DUID_SECRET_KEY;
      if (duidSecret) {
        hashedTag = createHmac("sha256", duidSecret)
          .update(`${session.hashedId}:${body.tagUID}`)
          .digest("hex");
      }
    } catch {}

    await supabase.from("ntag424_operations_log").insert({
      owner_hash: session.hashedId,
      hashed_tag_uid: hashedTag,
      operation_type: "erase_intent",
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch {}

  // Try bridge if available
  try {
    const res = await bridgeFetch("/ntag424/erase", {
      tagUID: body.tagUID,
      userHash: session.hashedId,
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && (j?.success || j?.data?.erased)) {
      return json(200, { success: true, data: { erased: true } });
    }
    if (res.status === 501 || j?.meta?.code === "bridge_unconfigured") {
      return json(200, {
        success: true,
        data: { erased: false, hint: "recorded_intent_only" },
      });
    }
  } catch {}

  return json(200, {
    success: true,
    data: { erased: false, hint: "recorded_intent_only" },
  });
}

export const handler: Handler = async (event, _context) => {
  if ((event.httpMethod || "").toUpperCase() === "OPTIONS") {
    return { statusCode: 204, headers: buildCorsHeaders(), body: "" };
  }

  const op = getLastPathSegment(event.path || "");
  try {
    switch (op) {
      case "verify":
        return await handleVerify(event);
      case "register":
        return await handleRegister(event);
      case "status":
        return await handleStatus(event);
      case "initialize":
        return await handleInitialize(event);
      case "preferences":
        return await handlePreferences(event);
      case "login":
        return await handleLogin(event);
      case "read":
        return await handleRead(event);
      case "program":
        return await handleProgram(event);
      case "verify-tag":
        return await handleVerifyTag(event);
      case "erase":
        return await handleErase(event);
      default:
        return json(404, { success: false, error: "Not found" });
    }
  } catch (e) {
    return json(500, {
      success: false,
      error: "Internal server error",
      meta: { message: e instanceof Error ? e.message : "Unknown error" },
    });
  }
};
