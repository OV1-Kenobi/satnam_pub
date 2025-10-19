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
  // Validate optional fields
  if (body.verificationMethod !== undefined && typeof body.verificationMethod !== "string") {
    return { valid: false, error: "verificationMethod must be a string" };
  }

  if (body.errorMessage !== undefined && typeof body.errorMessage !== "string") {
    return { valid: false, error: "errorMessage must be a string" };
  }

  if (body.userDuid !== undefined && typeof body.userDuid !== "string") {
    return { valid: false, error: "userDuid must be a string" };
  }

  if (body.ipAddressHash !== undefined && typeof body.ipAddressHash !== "string") {
    return { valid: false, error: "ipAddressHash must be a string" };
  }

  if (body.responseTimeMs !== undefined && typeof body.responseTimeMs !== "number") {
    return { valid: false, error: "responseTimeMs must be a number" };
  }

  if (body.responseTimeMs && body.responseTimeMs < 0) {
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

/**
 * Get client IP from request
 */
function getClientIp(event: any): string {
  const headers = event.headers || {};
  return (
    headers["x-forwarded-for"]?.split(",")[0].trim() ||
    headers["x-real-ip"] ||
    headers["client-ip"] ||
    "unknown"
  );
}

/**
 * Main handler
 */
export const handler: Handler = async (event) => {
  try {
    // Only allow POST requests
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Method not allowed. Use POST.",
        }),
      };
    }

    // Parse request body
    let body: any;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (error) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Invalid JSON in request body",
        }),
      };
    }

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: validation.error,
        }),
      };
    }

    const data = validation.data!;

    // Get and hash client IP
    const clientIp = getClientIp(event);
    const ipAddressHash = data.ipAddressHash || hashIpAddress(clientIp);

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
      console.error("Error logging verification failure:", insertError);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Failed to log verification failure",
        }),
      };
    }

    // Log to console for monitoring
    console.log(`📊 Verification failure logged: ${data.failureType}`, {
      method: data.verificationMethod,
      responseTime: data.responseTimeMs,
      user: data.userDuid ? "authenticated" : "anonymous",
    });

    const response: LogFailureResponse = {
      success: true,
      failureId: insertedData?.id,
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Verification failure logging error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
