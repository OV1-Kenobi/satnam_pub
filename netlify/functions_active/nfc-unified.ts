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
      "id, owner_hash, hashed_tag_uid, uid, family_role, encrypted_config"
    )
    .or(`hashed_tag_uid.eq.${hashedTag},uid.eq.${body.tagUID}`)
    .limit(1)
    .maybeSingle();

  if (error || !reg) {
    return json(404, { success: false, error: "Tag not registered" });
  }

  // TODO: Implement SUN/crypto verification using stored metadata (requires key management plan)
  // For now: mark success if registration exists; log operation with anti-abuse rate limit above.
  await supabase.from("ntag424_operations_log").insert({
    owner_hash: session.hashedId,
    hashed_tag_uid: reg.hashed_tag_uid || hashedTag,
    operation_type: "auth",
    success: true,
    timestamp: new Date().toISOString(),
    metadata: { challengeData: body.challengeData ? "present" : "none" },
  });

  return json(200, {
    success: true,
    data: { sessionMetadata: { role: reg.family_role || "private" } },
  });

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

  const { data, error } = await supabase
    .from("ntag424_registrations")
    .insert({
      owner_hash: session.hashedId,
      hashed_tag_uid: hashedTag,
      uid: null, // never store raw UID in privacy-first mode
      encrypted_config: body.encryptedMetadata,
      family_role: body.familyRole || "private",
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
