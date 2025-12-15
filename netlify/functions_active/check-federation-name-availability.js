/**
 * Federation Name Availability Check (Netlify Function)
 *
 * - Validates federation handle format (2-64 chars, a-z0-9._-)
 * - Uses supabaseAdmin (service role) to bypass RLS for existence checks
 * - Protected by centralized enhanced-rate-limiter
 * - Follows the same security/error-handling patterns as check-username-availability.js
 */

import { supabaseAdmin } from "../../netlify/functions/supabase.js";
import {
  RATE_LIMITS,
  checkRateLimit,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.ts";
import {
  createRateLimitErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.ts";
import { errorResponse, preflightResponse } from "./utils/security-headers.ts";

console.log(
  "🔒 Secure federation name availability function initialized (service-role Supabase client)"
);

function validateFederationName(rawName) {
  const value = (rawName || "").trim().toLowerCase();

  if (!value) {
    return { valid: false, normalized: "", error: "Federation name is required" };
  }

  if (value.length < 2 || value.length > 64) {
    return {
      valid: false,
      normalized: value,
      error:
        "Federation name must be between 2 and 64 characters and use only lowercase letters, numbers, dots, underscores, or hyphens.",
    };
  }

  const pattern = /^[a-z0-9._-]{2,64}$/;
  if (!pattern.test(value)) {
    return {
      valid: false,
      normalized: value,
      error:
        "Federation name must be 2-64 characters and use only lowercase letters, numbers, dots, underscores, or hyphens.",
    };
  }

  return { valid: true, normalized: value };
}

/**
 * Main Netlify Function handler
 * @param {Object} event - Netlify event object
 * @returns {Promise<Object>} Netlify response object
 */
export const handler = async (event, context) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(event.headers || {});
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  // This endpoint is POST-only
  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  try {
    // Rate limiting: reuse IDENTITY_VERIFY bucket used for username checks
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const allowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.IDENTITY_VERIFY
    );

    if (!allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "check-federation-name-availability",
        method: event.httpMethod,
        rateLimitConfig: `${RATE_LIMITS.IDENTITY_VERIFY.limit} requests per ${
          RATE_LIMITS.IDENTITY_VERIFY.windowMs / 1000 / 60
        } minutes`,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Parse request body
    let federationName;
    try {
      const body = JSON.parse(event.body || "{}");
      federationName = body.federationName;
    } catch {
      return errorResponse(400, "Invalid JSON in request body", requestOrigin);
    }

    const validation = validateFederationName(federationName);
    if (!validation.valid) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": requestOrigin || "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          success: true,
          available: false,
          error: validation.error,
        }),
      };
    }

    if (!supabaseAdmin) {
      console.error(
        "❌ supabaseAdmin is null - SUPABASE_SERVICE_ROLE_KEY not configured in environment"
      );
      return errorResponse(500, "Server configuration error", requestOrigin);
    }

    const { data, error } = await supabaseAdmin
      .from("family_federations")
      .select("id")
      .eq("federation_name", validation.normalized)
      .limit(1);

    if (error) {
      console.error("Federation name availability check failed:", error);
      logError(error, {
        requestId,
        endpoint: "check-federation-name-availability",
        method: event.httpMethod,
      });
      return errorResponse(
        500,
        "Failed to check federation name availability",
        requestOrigin
      );
    }

    const isAvailable = !data || data.length === 0;

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": requestOrigin || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        available: isAvailable,
      }),
    };
  } catch (error) {
    console.error("Federation name availability handler error:", error);
    logError(error, {
      requestId,
      endpoint: "check-federation-name-availability",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};

