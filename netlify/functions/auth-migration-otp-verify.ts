// Netlify Function: auth-migration-otp-verify
// Purpose: Verify user-submitted TOTP for Account Migration with replay protection and rate limiting

import type { Handler } from "@netlify/functions";
import { TOTP_CONFIG, verifyTOTP } from "../../utils/crypto";
import { supabase } from "./supabase.js";

// Security utilities (Phase 4 hardening)
import {
  checkRateLimit,
  createRateLimitIdentifier,
  getClientIP,
  RATE_LIMITS,
} from "../functions_active/utils/enhanced-rate-limiter.js";
import {
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "../functions_active/utils/error-handler.js";
import {
  errorResponse,
  getSecurityHeaders,
  preflightResponse,
} from "../functions_active/utils/security-headers.js";

// Old helper functions removed - using centralized security utilities

// Maintain a minimal in-memory replay cache as additional defense (per instance)
const recentCodes = new Map<string, { code: string; ts: number }[]>(); // key: sessionId

export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 auth-migration-otp-verify handler started:", {
    requestId,
    method: event.httpMethod,
    timestamp: new Date().toISOString(),
  });

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  // Database-backed rate limiting: 20 requests/hour for OTP verification
  const rateLimitId = createRateLimitIdentifier(undefined, clientIP);
  const rateLimitAllowed = await checkRateLimit(
    rateLimitId,
    RATE_LIMITS.AUTH_REFRESH // 60 req/hr - using closest available config
  );

  if (!rateLimitAllowed) {
    return createRateLimitErrorResponse(requestId, requestOrigin);
  }

  // Parse request body
  let sessionId: string;
  let npub: string;
  let code: string;
  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    sessionId = body?.sessionId;
    npub = body?.npub;
    code = body?.code;
  } catch (e) {
    return createValidationErrorResponse(
      "Invalid JSON payload",
      requestId,
      requestOrigin
    );
  }
  // Validate sessionId
  if (!sessionId || typeof sessionId !== "string") {
    return createValidationErrorResponse(
      "Missing sessionId",
      requestId,
      requestOrigin
    );
  }

  // Validate npub
  if (!npub || typeof npub !== "string" || !npub.startsWith("npub1")) {
    return createValidationErrorResponse(
      "Invalid or missing npub",
      requestId,
      requestOrigin
    );
  }

  // Validate code
  if (!code || typeof code !== "string" || code.length !== TOTP_CONFIG.DIGITS) {
    return createValidationErrorResponse(
      "Invalid code",
      requestId,
      requestOrigin
    );
  }

  try {
    // Load session
    const { data: session, error } = await supabase
      .from("migration_otp_sessions")
      .select(
        "session_id, npub, totp_secret, used_codes, attempt_count, created_at, expires_at, last_attempt_at"
      )
      .eq("session_id", sessionId)
      .eq("npub", npub)
      .single();

    if (error || !session) {
      logError(error || new Error("Session not found"), {
        requestId,
        endpoint: "auth-migration-otp-verify",
        action: "load_session",
      });
      return errorResponse(404, "Session not found", requestOrigin);
    }

    const now = Date.now();
    const exp = Date.parse(session.expires_at);
    if (isNaN(exp) || now > exp) {
      const headers = getSecurityHeaders(requestOrigin);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Code expired",
          expired: true,
        }),
      };
    }

    // Enforce max 3 verification attempts per 15 minutes per npub
    const lastAttempt = session.last_attempt_at
      ? Date.parse(session.last_attempt_at)
      : 0;
    const withinWindow = now - 15 * 60 * 1000 < (lastAttempt || 0);
    const attempts = Number(session.attempt_count) || 0;
    if (attempts >= 3 && withinWindow) {
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Replay protection (DB + in-memory)
    try {
      const recentForSession = (recentCodes.get(sessionId) || []).filter(
        (e) => now - e.ts <= 5 * 60 * 1000
      );
      if (recentForSession.some((e) => e.code === code)) {
        const headers = getSecurityHeaders(requestOrigin);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: "Code already used",
            replayAttack: true,
          }),
        };
      }
    } catch {}

    // Verify TOTP (RFC 6238, SHA-256, 120s windows, ±1)
    const result = await verifyTOTP(code, session.totp_secret);
    if (!result.valid) {
      // Increment attempt count and update last_attempt_at
      await supabase
        .from("migration_otp_sessions")
        .update({
          attempt_count: attempts + 1,
          last_attempt_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId);
      return errorResponse(401, "Invalid code", requestOrigin);
    }

    // Mark code as used (replay blacklist) and optionally shorten session expiry
    const usedList: Array<{ code: string; used_at: string }> = Array.isArray(
      session.used_codes
    )
      ? session.used_codes
      : [];
    // Keep only codes within the last 5 minutes
    const pruned = usedList.filter((e) => {
      const t = Date.parse(e.used_at);
      return !isNaN(t) && now - t <= 5 * 60 * 1000;
    });
    pruned.push({ code, used_at: new Date().toISOString() });

    await supabase
      .from("migration_otp_sessions")
      .update({
        used_codes: pruned,
        attempt_count: attempts + 1,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId);

    // Update in-memory replay cache (best-effort)
    const arr = (recentCodes.get(sessionId) || []).filter(
      (e) => now - e.ts <= 5 * 60 * 1000
    );
    arr.push({ code, ts: now });
    recentCodes.set(sessionId, arr);

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        verified: true,
        period: TOTP_CONFIG.PERIOD,
      }),
    };
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      requestId,
      endpoint: "auth-migration-otp-verify",
      action: "handler_error",
    });
    return errorResponse(
      500,
      error instanceof Error ? error.message : "Internal error",
      requestOrigin
    );
  }
};

export default { handler };
