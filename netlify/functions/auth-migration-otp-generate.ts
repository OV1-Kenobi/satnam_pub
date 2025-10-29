// Netlify Function: auth-migration-otp-generate
// Purpose: Initiate secure Account Migration by sending a TOTP via Nostr DM to the existing account
// ESM-only; uses process.env; integrates CEPS for DM delivery; stores TOTP secret with 10-minute TTL

import type { Handler } from "@netlify/functions";
import { central_event_publishing_service as CEPS } from "../../lib/central_event_publishing_service";
import {
  generateTOTP,
  generateTOTPSecret,
  TOTP_CONFIG,
} from "../../utils/crypto";
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

export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 auth-migration-otp-generate handler started:", {
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

  // Database-backed rate limiting: 60 requests/hour for OTP generation
  const rateLimitId = createRateLimitIdentifier(undefined, clientIP);
  const rateLimitAllowed = await checkRateLimit(
    rateLimitId,
    RATE_LIMITS.AUTH_REFRESH // 60 req/hr
  );

  if (!rateLimitAllowed) {
    return createRateLimitErrorResponse(requestId, requestOrigin);
  }

  // Parse request body
  let npub: string;
  let nip05: string;
  let lightningAddress: string | undefined;
  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    npub = body?.npub;
    nip05 = body?.nip05;
    lightningAddress = body?.lightningAddress;
  } catch (e) {
    return createValidationErrorResponse(
      "Invalid JSON payload",
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

  // Validate NIP-05
  if (!nip05 || typeof nip05 !== "string" || !nip05.includes("@")) {
    return createValidationErrorResponse(
      "Invalid or missing NIP-05 identifier",
      requestId,
      requestOrigin
    );
  }

  try {
    // Enforce generation rate: max 3 new sessions per 15 minutes per npub
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: recent, error: recentErr } = await supabase
      .from("migration_otp_sessions")
      .select("session_id, created_at")
      .eq("npub", npub)
      .gte("created_at", fifteenMinAgo);
    if (recentErr) {
      logError(recentErr, {
        requestId,
        endpoint: "auth-migration-otp-generate",
        action: "check_recent_sessions",
      });
      throw recentErr;
    }
    if (Array.isArray(recent) && recent.length >= 3) {
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Create or refresh a session (10-minute TTL)
    const secret = await generateTOTPSecret();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const insertRes = await supabase
      .from("migration_otp_sessions")
      .insert({
        npub,
        totp_secret: secret,
        expires_at: expiresAt.toISOString(),
        attempt_count: 0,
        used_codes: [],
      })
      .select("session_id, expires_at")
      .single();

    if (insertRes.error || !insertRes.data) {
      logError(insertRes.error || new Error("Failed to create session"), {
        requestId,
        endpoint: "auth-migration-otp-generate",
        action: "create_session",
      });
      throw insertRes.error || new Error("Failed to create session");
    }

    // Compute current TOTP to include in DM (valid for 120s ±1 window)
    const code = await generateTOTP(secret);

    // Build migration message per spec
    const la =
      typeof lightningAddress === "string" && lightningAddress.length
        ? lightningAddress
        : "";
    const message =
      `Your account is being migrated to Satnam.pub. New NIP-05: ${nip05}.` +
      (la ? ` New Lightning Address: ${la}.` : "") +
      ` Verification code: ${code}`;

    // Send encrypted DM to existing account via CEPS (server-managed DM)
    try {
      await CEPS.sendServerDM(npub, message);
    } catch (e) {
      // Non-fatal: still return session so user can retry send
      logError(e instanceof Error ? e : new Error(String(e)), {
        requestId,
        endpoint: "auth-migration-otp-generate",
        action: "send_dm",
      });
    }

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        sessionId: insertRes.data.session_id,
        expiresAt: insertRes.data.expires_at,
        period: TOTP_CONFIG.PERIOD,
        digits: TOTP_CONFIG.DIGITS,
      }),
    };
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      requestId,
      endpoint: "auth-migration-otp-generate",
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
