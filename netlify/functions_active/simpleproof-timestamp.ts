/*
 * SimpleProof Timestamp Creation Function
 * POST /.netlify/functions/simpleproof-timestamp
 *
 * Creates OpenTimestamps proofs anchored to Bitcoin blockchain
 * - Accepts: data (string), verification_id (UUID)
 * - Returns: ots_proof, bitcoin_block, bitcoin_tx, verified_at
 * - Rate limiting: 10 requests/hour per user
 * - Privacy-first: No PII stored, only hashes and proofs
 *
 * Phase 2B-2 Day 15: Enhanced with structured logging + Sentry error tracking
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

// Security utilities (Phase 3 hardening)
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

import {
  createLogger,
  logApiCall,
  logDatabaseOperation,
} from "../functions/utils/logging.js";
import {
  addSimpleProofBreadcrumb,
  captureSimpleProofError,
  initializeSentry,
} from "../functions/utils/sentry.server.js";
import { getEnvVar } from "./utils/env.js";

// Security: Input validation patterns
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DATA_LENGTH = 10000; // 10KB max for data field

interface SimpleProofRequest {
  action?: string; // Action-based routing: "create", "verify", "history", "get"
  data?: string;
  verification_id?: string;
  user_id?: string;
  timestamp_id?: string;
  limit?: number;
}

interface SimpleProofResponse {
  ots_proof: string;
  bitcoin_block: number | null;
  bitcoin_tx: string | null;
  verified_at: number;
}

interface SimpleProofApiResponse {
  ots_proof: string;
  bitcoin_block?: number;
  bitcoin_tx?: string;
  timestamp?: number;
}

// Old helper functions removed - now using centralized security utilities

async function callSimpleProofApi(
  data: string,
  apiKey: string,
  apiUrl: string
): Promise<SimpleProofApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const response = await fetch(`${apiUrl}/timestamp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `SimpleProof API error: ${response.status} ${response.statusText}`
      );
    }

    const result = (await response.json()) as SimpleProofApiResponse;
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function storeTimestamp(
  supabase: any,
  verificationId: string,
  otsProof: string,
  bitcoinBlock: number | null,
  bitcoinTx: string | null
): Promise<string> {
  const { data, error } = await supabase
    .from("simpleproof_timestamps")
    .insert({
      verification_id: verificationId,
      ots_proof: otsProof,
      bitcoin_block: bitcoinBlock,
      bitcoin_tx: bitcoinTx,
      verified_at: Math.floor(Date.now() / 1000),
      is_valid: true,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error("Failed to store timestamp: no ID returned");
  }

  return data.id as string;
}

// Create logger instance
const logger = createLogger({ component: "simpleproof-timestamp" });

// PERFORMANCE: Initialize Sentry once at module load time (not per request)
initializeSentry();

export const handler: Handler = async (event) => {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  logger.info("🚀 SimpleProof timestamp handler started");

  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  if (event.httpMethod !== "POST") {
    logger.warn("Method not allowed", {
      metadata: { method: event.httpMethod, requestId },
    });
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  try {
    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const allowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.IDENTITY_PUBLISH
    );

    if (!allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "simpleproof-timestamp",
        method: event.httpMethod,
      });
      logger.warn("Rate limit exceeded", {
        metadata: { clientIP, requestId },
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Parse request body
    let body: SimpleProofRequest;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      logger.error("Invalid JSON in request body");
      return errorResponse(400, "Invalid JSON in request body", requestOrigin);
    }

    // Route based on action (default: "create" for backward compatibility)
    const requestAction = body.action || "create";

    logger.info("Request received", {
      action: requestAction,
      verificationId: body.verification_id,
    });

    // Add Sentry breadcrumb for request
    addSimpleProofBreadcrumb("SimpleProof timestamp request received", {
      action: requestAction,
      verification_id: body.verification_id,
    });

    switch (requestAction) {
      case "create":
        const result = await handleCreateTimestamp(body, requestOrigin);
        const duration = Date.now() - startTime;
        logger.info("Request completed", {
          action: requestAction,
          verificationId: body.verification_id,
          metadata: { duration, statusCode: result.statusCode },
        });

        // Add Sentry breadcrumb for success
        addSimpleProofBreadcrumb("SimpleProof timestamp created successfully", {
          verification_id: body.verification_id,
          duration,
        });

        return result;
      default:
        logger.warn("Unknown action", {
          action: requestAction,
          metadata: { requestedAction: requestAction },
        });
        return errorResponse(
          400,
          `Unknown action: ${requestAction}`,
          requestOrigin
        );
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(error, {
      requestId,
      endpoint: "simpleproof-timestamp",
      method: event.httpMethod,
      duration,
    });

    // Capture error in Sentry
    captureSimpleProofError(
      error instanceof Error ? error : new Error(String(error)),
      {
        component: "simpleproof-timestamp",
        action: "handler",
        metadata: {
          duration,
          httpMethod: event.httpMethod,
          requestId,
        },
      }
    );

    return errorResponse(500, "Internal server error", requestOrigin);
  }
};

// ============================================================================
// ACTION HANDLERS
// ============================================================================

async function handleCreateTimestamp(
  body: SimpleProofRequest,
  requestOrigin?: string
) {
  // Security: Validate input
  if (!body.data || typeof body.data !== "string") {
    return errorResponse(
      400,
      "Missing or invalid required field: data (string)",
      requestOrigin
    );
  }

  // Security: Prevent DoS via large payloads
  if (body.data.length > MAX_DATA_LENGTH) {
    return errorResponse(
      400,
      `Data field exceeds maximum length of ${MAX_DATA_LENGTH} characters`,
      requestOrigin
    );
  }

  if (!body.verification_id || typeof body.verification_id !== "string") {
    return errorResponse(
      400,
      "Missing or invalid required field: verification_id (UUID)",
      requestOrigin
    );
  }

  // Security: Validate UUID format to prevent injection attacks
  if (!UUID_PATTERN.test(body.verification_id)) {
    return errorResponse(
      400,
      "Invalid verification_id format (must be valid UUID)",
      requestOrigin
    );
  }

  // Get API credentials
  const apiKey = getEnvVar("VITE_SIMPLEPROOF_API_KEY");
  const apiUrl =
    getEnvVar("VITE_SIMPLEPROOF_API_URL") || "https://api.simpleproof.com";

  if (!apiKey) {
    logger.error("SimpleProof API key not configured");
    return errorResponse(
      500,
      "SimpleProof service not configured",
      requestOrigin
    );
  }

  // Call SimpleProof API
  let apiResult: SimpleProofApiResponse;
  const apiStartTime = Date.now();
  try {
    logger.debug("Calling SimpleProof API", {
      action: "create",
      verificationId: body.verification_id,
    });
    apiResult = await callSimpleProofApi(body.data!, apiKey, apiUrl);
    const apiDuration = Date.now() - apiStartTime;
    logApiCall("POST", apiUrl, 200, apiDuration, {
      component: "simpleproof-timestamp",
      action: "create",
      verificationId: body.verification_id,
    });
  } catch (error) {
    const apiDuration = Date.now() - apiStartTime;
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logger.error("SimpleProof API call failed", {
      action: "create",
      verificationId: body.verification_id,
      metadata: { error: errorMsg, duration: apiDuration },
    });

    // Capture error in Sentry
    captureSimpleProofError(
      error instanceof Error ? error : new Error(errorMsg),
      {
        component: "simpleproof-timestamp",
        action: "createTimestamp",
        verificationId: body.verification_id,
        metadata: {
          apiUrl,
          duration: apiDuration,
          status: "api_error",
        },
      }
    );

    // Graceful degradation: return error but don't crash
    if (errorMsg.includes("abort")) {
      return errorResponse(
        500,
        "SimpleProof API timeout (>10s)",
        requestOrigin
      );
    }
    return errorResponse(
      500,
      `SimpleProof API error: ${errorMsg}`,
      requestOrigin
    );
  }

  // Validate API response
  if (!apiResult.ots_proof) {
    logger.error("Invalid response from SimpleProof API", {
      action: "create",
      verificationId: body.verification_id,
    });
    return errorResponse(
      500,
      "Invalid response from SimpleProof API",
      requestOrigin
    );
  }

  // Store in database
  const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
  const supabaseKey = getEnvVar("VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    logger.error("Missing Supabase configuration", {
      action: "create",
      verificationId: body.verification_id,
    });
    return errorResponse(500, "Database configuration error", requestOrigin);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let timestampId: string;
  const dbStartTime = Date.now();
  try {
    timestampId = await storeTimestamp(
      supabase,
      body.verification_id!,
      apiResult.ots_proof,
      apiResult.bitcoin_block || null,
      apiResult.bitcoin_tx || null
    );
    const dbDuration = Date.now() - dbStartTime;
    logDatabaseOperation("INSERT", "simpleproof_timestamps", true, dbDuration, {
      component: "simpleproof-timestamp",
      action: "create",
      verificationId: body.verification_id,
    });
  } catch (error) {
    const dbDuration = Date.now() - dbStartTime;
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logDatabaseOperation(
      "INSERT",
      "simpleproof_timestamps",
      false,
      dbDuration,
      {
        component: "simpleproof-timestamp",
        action: "create",
        verificationId: body.verification_id,
        metadata: { error: errorMsg },
      }
    );
    logger.error("Failed to store timestamp", {
      action: "create",
      verificationId: body.verification_id,
      metadata: { error: errorMsg },
    });
    return errorResponse(500, `Database error: ${errorMsg}`, requestOrigin);
  }

  // Return success response
  const response: SimpleProofResponse = {
    ots_proof: apiResult.ots_proof,
    bitcoin_block: apiResult.bitcoin_block || null,
    bitcoin_tx: apiResult.bitcoin_tx || null,
    verified_at: Math.floor(Date.now() / 1000),
  };

  logger.info("Timestamp created successfully", {
    action: "create",
    verificationId: body.verification_id,
    metadata: {
      timestampId,
      bitcoinBlock: apiResult.bitcoin_block,
    },
  });

  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Access-Control-Allow-Origin":
      requestOrigin || process.env.VITE_CORS_ORIGIN || "https://www.satnam.pub",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(response),
  };
}
