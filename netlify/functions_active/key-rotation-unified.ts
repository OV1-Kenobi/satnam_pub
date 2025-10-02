// netlify/functions_active/key-rotation-unified.ts
// Unified Key Rotation Function: start, complete, status, rollback (route-dispatch)
// ESM-only, static imports, process.env access only

import type { Handler } from "@netlify/functions";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getRequestClient } from "../functions/supabase.js";
import { allowRequest } from "../functions/utils/rate-limiter.js";

// --- Shared utilities ---
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

function json(
  statusCode: number,
  body: unknown,
  headers?: Record<string, string>
) {
  return {
    statusCode,
    headers: { ...buildCorsHeaders(), ...(headers || {}) },
    body: JSON.stringify(body),
  };
}

function getLastPathSegment(path: string): string {
  const parts = (path || "").split("/").filter(Boolean);
  return (parts[parts.length - 1] || "").toLowerCase();
}

function clientIpFrom(event: {
  headers?: Record<string, string | string[]>;
}): string {
  const xfwd =
    event.headers?.["x-forwarded-for"] ||
    event.headers?.["X-Forwarded-For"] ||
    "";
  return (
    (Array.isArray(xfwd) ? xfwd[0] : xfwd).split(",")[0]?.trim() ||
    (event.headers?.["x-real-ip"] as string) ||
    "unknown"
  );
}

function parseJson<T>(body: string | null | undefined): T | null {
  if (!body) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

function getBearerToken(event: { headers?: Record<string, string> }): string {
  const h = event.headers || {};
  const raw = h.authorization || (h as any).Authorization || "";
  return raw.replace(/^Bearer\s+/i, "");
}

function isValidJwtStructure(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

function constantTimeEq(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return ha.length === hb.length && timingSafeEqual(ha, hb);
}

// --- Types ---
interface StartBody {
  desiredNip05Strategy?: "keep" | "create";
  desiredLightningStrategy?: "keep" | "create";
}
interface CurrentIdentity {
  npub: string | null;
  nip05: string | null;
  lightningAddress: string | null;
}
interface CompleteBody {
  rotationId: string;
  oldNpub: string;
  newNpub: string;
  nip05?: { strategy: "keep" | "create"; identifier?: string };
  lightning?: { strategy: "keep" | "create"; address?: string };
  ceps?: {
    delegationEventId?: string;
    kind0EventIds?: string[];
    noticeEventIds?: string[];
    profileUpdateEventId?: string;
  };
}
interface RollbackBody {
  rotationId: string;
}

// --- Route handlers ---
async function handleStart(event: any) {
  if (event.httpMethod !== "POST")
    return json(405, { success: false, error: "Method not allowed" });
  const ip = clientIpFrom(event);
  if (!allowRequest(ip, 1, 15 * 60 * 1000))
    return json(429, { success: false, error: "Too many attempts" });

  const token = getBearerToken(event);
  if (!token || !isValidJwtStructure(token))
    return json(401, {
      success: false,
      error: "Invalid or missing Authorization",
    });

  const supabase = getRequestClient(token);
  const { data: me, error: meErr } = await supabase.auth.getUser();
  if (meErr || !me?.user?.id)
    return json(401, { success: false, error: "Unauthorized" });
  const user_duid: string = me.user.id;

  // Per-user rate limits
  const now = Date.now();
  const iso15 = new Date(now - 15 * 60 * 1000).toISOString();
  const isoDay = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  {
    const { data: recent, error } = await supabase
      .from("key_rotation_events")
      .select("id, started_at")
      .eq("user_duid", user_duid)
      .gte("started_at", iso15)
      .limit(1);
    if (error)
      return json(500, { success: false, error: error.message || "DB error" });
    if (recent && recent.length)
      return json(429, {
        success: false,
        error: "Rotation recently initiated. Try later.",
      });
  }
  {
    const { count, error } = await supabase
      .from("key_rotation_events")
      .select("id", { count: "exact", head: true })
      .eq("user_duid", user_duid)
      .gte("started_at", isoDay);
    if (error)
      return json(500, { success: false, error: error.message || "DB error" });
    if ((count ?? 0) >= 3)
      return json(429, {
        success: false,
        error: "Daily key rotation limit reached",
      });
  }

  const body = parseJson<StartBody>(event.body);
  const nip05Strategy =
    body?.desiredNip05Strategy === "create" ? "create" : "keep";
  const lightningStrategy =
    body?.desiredLightningStrategy === "create" ? "create" : "keep";

  // Current identity snapshot
  let current: CurrentIdentity = {
    npub: null,
    nip05: null,
    lightningAddress: null,
  };
  {
    interface IdentityRow {
      npub?: string | null;
      nip05?: string | null;
      lightning_address?: string | null;
    }
    const { data, error } = await supabase
      .from("user_identities")
      .select("npub, nip05, lightning_address")
      .eq("id", user_duid)
      .maybeSingle();
    if (!error && data) {
      const row = data as Partial<IdentityRow>;
      current = {
        npub: row.npub ?? null,
        nip05: row.nip05 ?? null,
        lightningAddress: row.lightning_address ?? null,
      };
    }
  }

  const rotationId = randomBytes(16).toString("hex");
  const deprecationDays = Number(process.env.KEY_DEPRECATION_DAYS || 30) || 30;

  const { error: insErr } = await supabase.from("key_rotation_events").insert({
    user_duid,
    rotation_id: rotationId,
    old_npub: current.npub || "",
    new_npub: current.npub || "",
    nip05_action: nip05Strategy,
    lightning_action: lightningStrategy,
    started_at: new Date().toISOString(),
    status: "pending",
  });
  if (insErr)
    return json(500, {
      success: false,
      error: insErr.message || "Failed to create audit",
    });

  const domains = (process.env.NIP05_WHITELIST_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => !!d);
  return json(200, {
    success: true,
    rotationId,
    current,
    whitelists: { nip05Domains: domains },
    deprecationDays,
  });
}

async function handleComplete(event: any) {
  if (event.httpMethod !== "POST")
    return json(405, { success: false, error: "Method not allowed" });
  const ip = clientIpFrom(event);
  if (!allowRequest(ip, 1, 15 * 60 * 1000))
    return json(429, { success: false, error: "Too many attempts" });

  const token = getBearerToken(event);
  if (!token || !isValidJwtStructure(token))
    return json(401, {
      success: false,
      error: "Invalid or missing Authorization",
    });

  const body = parseJson<CompleteBody>(event.body);
  if (!body || !body.rotationId)
    return json(400, { success: false, error: "rotationId required" });
  if (!body.oldNpub)
    return json(400, { success: false, error: "oldNpub required" });
  if (!body.newNpub)
    return json(400, { success: false, error: "newNpub required" });

  // NIP-05 whitelist enforcement
  const nip05Strategy = body.nip05?.strategy === "create" ? "create" : "keep";
  const nip05Identifier = body.nip05?.identifier?.trim();
  if (nip05Strategy === "create" && nip05Identifier) {
    const parts = nip05Identifier.split("@");
    if (parts.length !== 2)
      return json(400, { success: false, error: "Invalid NIP-05 format" });
    const domain = parts[1].toLowerCase();
    const allowed = (process.env.NIP05_WHITELIST_DOMAINS || "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter((d) => !!d);
    if (allowed.length && !allowed.includes(domain))
      return json(403, { success: false, error: "NIP-05 domain not allowed" });
  }
  const lightningStrategy =
    body.lightning?.strategy === "create" ? "create" : "keep";
  const lightningAddress = body.lightning?.address?.trim();

  const supabase = getRequestClient(token);
  const { data: me, error: meErr } = await supabase.auth.getUser();
  if (meErr || !me?.user?.id)
    return json(401, { success: false, error: "Unauthorized" });
  const user_duid: string = me.user.id;

  const { data: rot, error: rotErr } = await supabase
    .from("key_rotation_events")
    .select(
      "id, rotation_id, user_duid, old_npub, new_npub, status, started_at"
    )
    .eq("user_duid", user_duid)
    .eq("rotation_id", body.rotationId)
    .maybeSingle();
  if (rotErr)
    return json(500, { success: false, error: rotErr.message || "DB error" });
  if (!rot) return json(404, { success: false, error: "Rotation not found" });
  if (rot.status !== "pending")
    return json(400, { success: false, error: "Rotation already finalized" });

  if (!constantTimeEq(body.oldNpub, rot.old_npub || ""))
    return json(400, { success: false, error: "oldNpub mismatch" });

  // Snapshot previous values
  let prevNip05: string | null = null;
  let prevLA: string | null = null;
  {
    interface IdentityRow {
      npub?: string | null;
      nip05?: string | null;
      lightning_address?: string | null;
    }
    const { data: ident } = await supabase
      .from("user_identities")
      .select("npub, nip05, lightning_address")
      .eq("id", user_duid)
      .maybeSingle();
    const row = (ident ?? {}) as Partial<IdentityRow>;
    prevNip05 = row.nip05 ?? null;
    prevLA = row.lightning_address ?? null;
  }

  // Prepare CEPS payload
  const cepsPayload: Record<string, unknown> = {
    ...(body.ceps || {}),
    prev: { nip05: prevNip05, lightning: prevLA },
  };

  // Use atomic RPC function to ensure transactional guarantees
  const { data: result, error: rpcErr } = await supabase.rpc(
    "complete_key_rotation_atomic",
    {
      p_user_duid: user_duid,
      p_rotation_id: body.rotationId,
      p_old_npub: body.oldNpub,
      p_new_npub: body.newNpub,
      p_nip05_strategy: nip05Strategy,
      p_nip05_identifier: nip05Identifier || null,
      p_prev_nip05: prevNip05,
      p_lightning_strategy: lightningStrategy,
      p_lightning_address: lightningAddress || null,
      p_prev_lightning_address: prevLA,
      p_ceps_payload: cepsPayload as unknown,
    }
  );

  if (rpcErr) {
    return json(500, {
      success: false,
      error: rpcErr.message || "Failed to complete key rotation atomically",
    });
  }

  if (!result?.success) {
    return json(500, {
      success: false,
      error: result?.error || "Key rotation completion failed",
    });
  }

  return json(200, { success: true });
}

async function handleStatus(event: any) {
  if (event.httpMethod !== "GET")
    return json(405, { success: false, error: "Method not allowed" });
  const ip = clientIpFrom(event);
  if (!allowRequest(ip, 10, 15 * 60 * 1000))
    return json(429, { success: false, error: "Too many attempts" });

  const token = getBearerToken(event);
  if (!token || !isValidJwtStructure(token))
    return json(401, {
      success: false,
      error: "Invalid or missing Authorization",
    });

  const rotationId = event.queryStringParameters?.rotationId || "";
  if (!rotationId)
    return json(400, { success: false, error: "rotationId required" });

  const supabase = getRequestClient(token);
  const { data: me, error: meErr } = await supabase.auth.getUser();
  if (meErr || !me?.user?.id)
    return json(401, { success: false, error: "Unauthorized" });
  const user_duid: string = me.user.id;

  const { data, error } = await supabase
    .from("key_rotation_events")
    .select(
      "rotation_id, old_npub, new_npub, status, error_reason, started_at, completed_at, nip05_action, nip05_identifier, lightning_action, lightning_address, ceps_event_ids"
    )
    .eq("user_duid", user_duid)
    .eq("rotation_id", rotationId)
    .maybeSingle();
  if (error)
    return json(500, { success: false, error: error.message || "DB error" });
  if (!data) return json(404, { success: false, error: "Rotation not found" });

  return json(200, { success: true, rotation: data });
}

async function handleRollback(event: any) {
  if (event.httpMethod !== "POST")
    return json(405, { success: false, error: "Method not allowed" });
  const ip = clientIpFrom(event);
  if (!allowRequest(ip, 1, 15 * 60 * 1000))
    return json(429, { success: false, error: "Too many attempts" });

  const token = getBearerToken(event);
  if (!token || !isValidJwtStructure(token))
    return json(401, {
      success: false,
      error: "Invalid or missing Authorization",
    });

  const body = parseJson<RollbackBody>(event.body);
  if (!body || !body.rotationId)
    return json(400, { success: false, error: "rotationId required" });

  const supabase = getRequestClient(token);
  const { data: me, error: meErr } = await supabase.auth.getUser();
  if (meErr || !me?.user?.id)
    return json(401, { success: false, error: "Unauthorized" });
  const user_duid: string = me.user.id;

  const { data: rot, error: rotErr } = await supabase
    .from("key_rotation_events")
    .select(
      "id, rotation_id, status, old_npub, new_npub, completed_at, ceps_event_ids, nip05_action, nip05_identifier, lightning_action, lightning_address"
    )
    .eq("user_duid", user_duid)
    .eq("rotation_id", body.rotationId)
    .maybeSingle();
  if (rotErr)
    return json(500, { success: false, error: rotErr.message || "DB error" });
  if (!rot) return json(404, { success: false, error: "Rotation not found" });
  if (rot.status !== "completed")
    return json(400, { success: false, error: "Rotation not completed" });

  const completedAt = rot.completed_at ? new Date(rot.completed_at) : null;
  const days = Number(process.env.KEY_DEPRECATION_DAYS || 30) || 30;
  if (
    !completedAt ||
    Date.now() - completedAt.getTime() > days * 24 * 60 * 60 * 1000
  ) {
    return json(403, { success: false, error: "Deprecation window expired" });
  }

  // Recover previous values from audit JSON
  let prevNip05: string | null = null;
  let prevLA: string | null = null;
  try {
    const metaUnknown: unknown = (
      rot as unknown as { ceps_event_ids?: unknown }
    ).ceps_event_ids;
    if (
      metaUnknown &&
      typeof metaUnknown === "object" &&
      "prev" in (metaUnknown as Record<string, unknown>)
    ) {
      const prev = (
        metaUnknown as {
          prev?: { nip05?: string | null; lightning?: string | null };
        }
      ).prev;
      if (prev) {
        prevNip05 = typeof prev.nip05 === "string" ? prev.nip05 : null;
        prevLA = typeof prev.lightning === "string" ? prev.lightning : null;
      }
    }
  } catch {}

  // Use atomic RPC function to ensure transactional guarantees for rollback
  const { data: result, error: rpcErr } = await supabase.rpc(
    "rollback_key_rotation_atomic",
    {
      p_user_duid: user_duid,
      p_rotation_id: body.rotationId,
      p_old_npub: rot.old_npub,
      p_prev_nip05: prevNip05,
      p_prev_lightning_address: prevLA,
    }
  );

  if (rpcErr) {
    return json(500, {
      success: false,
      error: rpcErr.message || "Failed to rollback key rotation atomically",
    });
  }

  if (!result?.success) {
    return json(500, {
      success: false,
      error: result?.error || "Key rotation rollback failed",
    });
  }

  return json(200, { success: true });
}

// --- Dispatcher ---
export const handler: Handler = async (event) => {
  try {
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: buildCorsHeaders(), body: "" };
    }

    const segment = getLastPathSegment(event.path || "");
    switch (segment) {
      case "start":
        return await handleStart(event);
      case "complete":
        return await handleComplete(event);
      case "status":
        return await handleStatus(event);
      case "rollback":
        return await handleRollback(event);
      default:
        return json(404, { success: false, error: "Route not found" });
    }
  } catch (error) {
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "Server error",
    });
  }
};
