/**
 * Log Verification Failure Endpoint
 * Phase 1 Week 3: Track verification failures for monitoring and alerting
 *
 * Endpoint: POST /api/verification/log-failure
 * Body: {
 *   failureType: string,
 *   identifierHash: string,
 *   verificationMethod?: string,
 *   errorMessage?: string,
 *   responseTimeMs?: number,
 *   userDuid?: string,
 *   ipAddressHash?: string
 * }
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// Security utilities (centralized)
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

interface LogFailureRequest {
  failureType: string;
  identifierHash: string;
  verificationMethod?: string;
  errorMessage?: string;
  responseTimeMs?: number;
  userDuid?: string;
  ipAddressHash?: string;
}

interface LogFailureResponse {
  success: boolean;
  failureId?: string;
  error?: string;
}

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// Valid failure types
const VALID_FAILURE_TYPES = [
  "kind0_timeout",
  "kind0_error",
  "pkarr_timeout",
  "pkarr_error",
  "dns_timeout",
  "dns_error",
  "all_methods_failed",
  "invalid_identifier",
  "network_error",
];

/**
 * Validate request
 */
function validateRequest(body: any): {
  valid: boolean;
  error?: string;
  data?: LogFailureRequest;
} {
  if (!body) {
    return { valid: false, error: "Request body is required" };
  }

  const { failureType, identifierHash } = body;

  if (!failureType || !VALID_FAILURE_TYPES.includes(failureType)) {
    return {
      valid: false,
      error: `Invalid failureType. Must be one of: ${VALID_FAILURE_TYPES.join(
        ", "
      )}`,
    };
  }

  if (!identifierHash || typeof identifierHash !== "string") {
    return {
      valid: false,
      error: "identifierHash is required and must be a string",
    };
  }

  if (identifierHash.length !== 64) {
    return {
      valid: false,
      error: "identifierHash must be 64 characters (SHA-256 hex)",
    };
  }

  // Validate optional fields
  if (
    body.responseTimeMs !== undefined &&
    typeof body.responseTimeMs !== "number"
  ) {
    return { valid: false, error: "responseTimeMs must be a number" };
  }

  if (body.responseTimeMs !== undefined && body.responseTimeMs < 0) {
    return { valid: false, error: "responseTimeMs must be non-negative" };
  }

  return {
    valid: true,
    data: {
      failureType,
      identifierHash,
      verificationMethod: body.verificationMethod,
      errorMessage: body.errorMessage,
      responseTimeMs: body.responseTimeMs,
      userDuid: body.userDuid,
      ipAddressHash: body.ipAddressHash,
    },
  };
}

/**
 * Hash IP address for privacy
 */
function hashIpAddress(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

// Old getClientIp() function removed - now using getClientIP() from enhanced-rate-limiter

/**
 * Main handler
 */
export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  try {
    // Handle CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return preflightResponse(requestOrigin);
    }

    // Only allow POST requests
    if (event.httpMethod !== "POST") {
      return errorResponse(405, "Method not allowed", requestOrigin);
    }

    // Parse request body
    let body: any;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (error) {
      return createValidationErrorResponse(
        "Invalid JSON in request body",
        requestId,
        requestOrigin
      );
    }

    // Database-backed rate limiting (50 req/hr for verification logging)
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const allowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.IDENTITY_VERIFY
    );

    if (!allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "log-verification-failure",
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return createValidationErrorResponse(
        validation.error || "Validation failed",
        requestId,
        requestOrigin
      );
    }

    const data = validation.data!;

    // Get and hash client IP
    const ipAddressHash = data.ipAddressHash || hashIpAddress(clientIP);

    // Insert failure record into database
    const { data: insertedData, error: insertError } = await supabase
      .from("verification_failures")
      .insert({
        failure_type: data.failureType,
        identifier_hash: data.identifierHash,
        verification_method: data.verificationMethod,
        error_message: data.errorMessage,
        response_time_ms: data.responseTimeMs,
        user_duid: data.userDuid,
        ip_address_hash: ipAddressHash,
      })
      .select("id")
      .single();

    if (insertError) {
      logError(insertError, {
        requestId,
        endpoint: "log-verification-failure",
        context: "Database insert error",
      });
      return errorResponse(
        500,
        "Failed to log verification failure",
        requestOrigin
      );
    }

    // Privacy-safe: no logging of sensitive data

    const response: LogFailureResponse = {
      success: true,
      failureId: insertedData?.id,
    };

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "log-verification-failure",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
