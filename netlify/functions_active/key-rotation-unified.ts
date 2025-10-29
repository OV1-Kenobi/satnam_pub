// netlify/functions_active/key-rotation-unified.ts
// Unified Key Rotation Function: start, complete, status, rollback (route-dispatch)
// ESM-only, static imports, process.env access only

import type { Handler } from "@netlify/functions";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getRequestClient } from "../functions/supabase.js";
import {
  RATE_LIMITS,
  checkRateLimit,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.js";
import {
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.js";
import {
  errorResponse,
  getSecurityHeaders,
  preflightResponse,
} from "./utils/security-headers.js";

// --- Shared utilities (Phase 2 hardening) ---

function getLastPathSegment(path: string): string {
  const parts = (path || "").split("/").filter(Boolean);
  return (parts[parts.length - 1] || "").toLowerCase();
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
async function handleStart(
  event: any,
  requestId: string,
  requestOrigin: string | undefined,
  clientIP: string
) {
  if (event.httpMethod !== "POST")
    return errorResponse(405, "Method not allowed", requestOrigin);

  // Database-backed rate limiting
  const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
  const rateLimitAllowed = await checkRateLimit(
    rateLimitKey,
    RATE_LIMITS.IDENTITY_PUBLISH
  );

  if (!rateLimitAllowed) {
    logError(new Error("Rate limit exceeded"), {
      requestId,
      endpoint: "key-rotation-unified",
      action: "start",
    });
    return createRateLimitErrorResponse(requestId, requestOrigin);
  }

  const token = getBearerToken(event);
  if (!token || !isValidJwtStructure(token))
    return errorResponse(
      401,
      "Invalid or missing Authorization",
      requestOrigin
    );

  const supabase = getRequestClient(token);
  const { data: me, error: meErr } = await supabase.auth.getUser();
  if (meErr || !me?.user?.id)
    return errorResponse(401, "Unauthorized", requestOrigin);
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
    if (error) {
      logError(error, {
        requestId,
        endpoint: "key-rotation-unified",
        action: "start",
      });
      return errorResponse(500, "Database error", requestOrigin);
    }
    if (recent && recent.length)
      return errorResponse(
        429,
        "Rotation recently initiated. Try later.",
        requestOrigin
      );
  }
  {
    const { count, error } = await supabase
      .from("key_rotation_events")
      .select("id", { count: "exact", head: true })
      .eq("user_duid", user_duid)
      .gte("started_at", isoDay);
    if (error) {
      logError(error, {
        requestId,
        endpoint: "key-rotation-unified",
        action: "start",
      });
      return errorResponse(500, "Database error", requestOrigin);
    }
    if ((count ?? 0) >= 3)
      return errorResponse(
        429,
        "Daily key rotation limit reached",
        requestOrigin
      );
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
  if (insErr) {
    logError(insErr, {
      requestId,
      endpoint: "key-rotation-unified",
      action: "start",
    });
    return errorResponse(500, "Failed to create audit", requestOrigin);
  }

  const domains = (process.env.NIP05_WHITELIST_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => !!d);
  return {
    statusCode: 200,
    headers: getSecurityHeaders(requestOrigin),
    body: JSON.stringify({
      success: true,
      rotationId,
      current,
      whitelists: { nip05Domains: domains },
      deprecationDays,
    }),
  };
}

async function handleComplete(
  event: any,
  requestId: string,
  requestOrigin: string | undefined,
  clientIP: string
) {
  if (event.httpMethod !== "POST")
    return errorResponse(405, "Method not allowed", requestOrigin);

  // Database-backed rate limiting
  const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
  const rateLimitAllowed = await checkRateLimit(
    rateLimitKey,
    RATE_LIMITS.IDENTITY_PUBLISH
  );

  if (!rateLimitAllowed) {
    logError(new Error("Rate limit exceeded"), {
      requestId,
      endpoint: "key-rotation-unified",
      action: "complete",
    });
    return createRateLimitErrorResponse(requestId, requestOrigin);
  }

  const token = getBearerToken(event);
  if (!token || !isValidJwtStructure(token))
    return errorResponse(
      401,
      "Invalid or missing Authorization",
      requestOrigin
    );

  const body = parseJson<CompleteBody>(event.body);
  if (!body || !body.rotationId)
    return createValidationErrorResponse(
      "rotationId required",
      requestId,
      requestOrigin
    );
  if (!body.oldNpub)
    return createValidationErrorResponse(
      "oldNpub required",
      requestId,
      requestOrigin
    );
  if (!body.newNpub)
    return createValidationErrorResponse(
      "newNpub required",
      requestId,
      requestOrigin
    );

  // NIP-05 whitelist enforcement
  const nip05Strategy = body.nip05?.strategy === "create" ? "create" : "keep";
  const nip05Identifier = body.nip05?.identifier?.trim();
  if (nip05Strategy === "create" && nip05Identifier) {
    const parts = nip05Identifier.split("@");
    if (parts.length !== 2)
      return createValidationErrorResponse(
        "Invalid NIP-05 format",
        requestId,
        requestOrigin
      );
    const domain = parts[1].toLowerCase();
    const allowed = (process.env.NIP05_WHITELIST_DOMAINS || "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter((d) => !!d);
    if (allowed.length && !allowed.includes(domain))
      return errorResponse(403, "NIP-05 domain not allowed", requestOrigin);
  }
  const lightningStrategy =
    body.lightning?.strategy === "create" ? "create" : "keep";
  const lightningAddress = body.lightning?.address?.trim();

  const supabase = getRequestClient(token);
  const { data: me, error: meErr } = await supabase.auth.getUser();
  if (meErr || !me?.user?.id)
    return errorResponse(401, "Unauthorized", requestOrigin);
  const user_duid: string = me.user.id;

  const { data: rot, error: rotErr } = await supabase
    .from("key_rotation_events")
    .select(
      "id, rotation_id, user_duid, old_npub, new_npub, status, started_at"
    )
    .eq("user_duid", user_duid)
    .eq("rotation_id", body.rotationId)
    .maybeSingle();
  if (rotErr) {
    logError(rotErr, {
      requestId,
      endpoint: "key-rotation-unified",
      action: "complete",
    });
    return errorResponse(500, "Database error", requestOrigin);
  }
  if (!rot) return errorResponse(404, "Rotation not found", requestOrigin);
  if (rot.status !== "pending")
    return errorResponse(400, "Rotation already finalized", requestOrigin);

  if (!constantTimeEq(body.oldNpub, rot.old_npub || ""))
    return createValidationErrorResponse(
      "oldNpub mismatch",
      requestId,
      requestOrigin
    );

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
    logError(rpcErr, {
      requestId,
      endpoint: "key-rotation-unified",
      action: "complete",
    });
    return errorResponse(
      500,
      "Failed to complete key rotation atomically",
      requestOrigin
    );
  }

  if (!result?.success) {
    logError(new Error(result?.error || "Key rotation completion failed"), {
      requestId,
      endpoint: "key-rotation-unified",
      action: "complete",
    });
    return errorResponse(500, "Key rotation completion failed", requestOrigin);
  }

  return {
    statusCode: 200,
    headers: getSecurityHeaders(requestOrigin),
    body: JSON.stringify({ success: true }),
  };
}

async function handleStatus(
  event: any,
  requestId: string,
  requestOrigin: string | undefined,
  clientIP: string
) {
  if (event.httpMethod !== "GET")
    return errorResponse(405, "Method not allowed", requestOrigin);

  // Database-backed rate limiting
  const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
  const rateLimitAllowed = await checkRateLimit(
    rateLimitKey,
    RATE_LIMITS.IDENTITY_VERIFY
  );

  if (!rateLimitAllowed) {
    logError(new Error("Rate limit exceeded"), {
      requestId,
      endpoint: "key-rotation-unified",
      action: "status",
    });
    return createRateLimitErrorResponse(requestId, requestOrigin);
  }

  const token = getBearerToken(event);
  if (!token || !isValidJwtStructure(token))
    return errorResponse(
      401,
      "Invalid or missing Authorization",
      requestOrigin
    );

  const rotationId = event.queryStringParameters?.rotationId || "";
  if (!rotationId)
    return createValidationErrorResponse(
      "rotationId required",
      requestId,
      requestOrigin
    );

  const supabase = getRequestClient(token);
  const { data: me, error: meErr } = await supabase.auth.getUser();
  if (meErr || !me?.user?.id)
    return errorResponse(401, "Unauthorized", requestOrigin);
  const user_duid: string = me.user.id;

  const { data, error } = await supabase
    .from("key_rotation_events")
    .select(
      "rotation_id, old_npub, new_npub, status, error_reason, started_at, completed_at, nip05_action, nip05_identifier, lightning_action, lightning_address, ceps_event_ids"
    )
    .eq("user_duid", user_duid)
    .eq("rotation_id", rotationId)
    .maybeSingle();
  if (error) {
    logError(error, {
      requestId,
      endpoint: "key-rotation-unified",
      action: "status",
    });
    return errorResponse(500, "Database error", requestOrigin);
  }
  if (!data) return errorResponse(404, "Rotation not found", requestOrigin);

  return {
    statusCode: 200,
    headers: getSecurityHeaders(requestOrigin),
    body: JSON.stringify({ success: true, rotation: data }),
  };
}

async function handleRollback(
  event: any,
  requestId: string,
  requestOrigin: string | undefined,
  clientIP: string
) {
  if (event.httpMethod !== "POST")
    return errorResponse(405, "Method not allowed", requestOrigin);

  // Database-backed rate limiting
  const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
  const rateLimitAllowed = await checkRateLimit(
    rateLimitKey,
    RATE_LIMITS.IDENTITY_PUBLISH
  );

  if (!rateLimitAllowed) {
    logError(new Error("Rate limit exceeded"), {
      requestId,
      endpoint: "key-rotation-unified",
      action: "rollback",
    });
    return createRateLimitErrorResponse(requestId, requestOrigin);
  }

  const token = getBearerToken(event);
  if (!token || !isValidJwtStructure(token))
    return errorResponse(
      401,
      "Invalid or missing Authorization",
      requestOrigin
    );

  const body = parseJson<RollbackBody>(event.body);
  if (!body || !body.rotationId)
    return createValidationErrorResponse(
      "rotationId required",
      requestId,
      requestOrigin
    );

  const supabase = getRequestClient(token);
  const { data: me, error: meErr } = await supabase.auth.getUser();
  if (meErr || !me?.user?.id)
    return errorResponse(401, "Unauthorized", requestOrigin);
  const user_duid: string = me.user.id;

  const { data: rot, error: rotErr } = await supabase
    .from("key_rotation_events")
    .select(
      "id, rotation_id, status, old_npub, new_npub, completed_at, ceps_event_ids, nip05_action, nip05_identifier, lightning_action, lightning_address"
    )
    .eq("user_duid", user_duid)
    .eq("rotation_id", body.rotationId)
    .maybeSingle();
  if (rotErr) {
    logError(rotErr, {
      requestId,
      endpoint: "key-rotation-unified",
      action: "rollback",
    });
    return errorResponse(500, "Database error", requestOrigin);
  }
  if (!rot) return errorResponse(404, "Rotation not found", requestOrigin);
  if (rot.status !== "completed")
    return errorResponse(400, "Rotation not completed", requestOrigin);

  const completedAt = rot.completed_at ? new Date(rot.completed_at) : null;
  const days = Number(process.env.KEY_DEPRECATION_DAYS || 30) || 30;
  if (
    !completedAt ||
    Date.now() - completedAt.getTime() > days * 24 * 60 * 60 * 1000
  ) {
    return errorResponse(403, "Deprecation window expired", requestOrigin);
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
    logError(rpcErr, {
      requestId,
      endpoint: "key-rotation-unified",
      action: "rollback",
    });
    return errorResponse(
      500,
      "Failed to rollback key rotation atomically",
      requestOrigin
    );
  }

  if (!result?.success) {
    logError(new Error(result?.error || "Key rotation rollback failed"), {
      requestId,
      endpoint: "key-rotation-unified",
      action: "rollback",
    });
    return errorResponse(500, "Key rotation rollback failed", requestOrigin);
  }

  return {
    statusCode: 200,
    headers: getSecurityHeaders(requestOrigin),
    body: JSON.stringify({ success: true }),
  };
}

// --- Dispatcher ---
export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    (event.headers || {}) as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 Key rotation handler started:", {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  try {
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return preflightResponse(requestOrigin);
    }

    const segment = getLastPathSegment(event.path || "");
    switch (segment) {
      case "start":
        return await handleStart(event, requestId, requestOrigin, clientIP);
      case "complete":
        return await handleComplete(event, requestId, requestOrigin, clientIP);
      case "status":
        return await handleStatus(event, requestId, requestOrigin, clientIP);
      case "rollback":
        return await handleRollback(event, requestId, requestOrigin, clientIP);
      default:
        return errorResponse(404, "Route not found", requestOrigin);
    }
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "key-rotation-unified",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
