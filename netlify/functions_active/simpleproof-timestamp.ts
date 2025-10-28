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
import {
  createLogger,
  logApiCall,
  logDatabaseOperation,
  logRateLimitEvent,
} from "../functions/utils/logging.js";
import {
  addSimpleProofBreadcrumb,
  captureSimpleProofError,
  initializeSentry,
} from "../functions/utils/sentry.server.js";
import { getEnvVar } from "./utils/env.js";
import { allowRequest } from "./utils/rate-limiter.js";

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

// Security: Whitelist of allowed origins for CORS
const ALLOWED_ORIGINS = [
  "https://www.satnam.pub",
  "https://satnam.pub",
  "https://app.satnam.pub",
];

// Add localhost for development
if (process.env.NODE_ENV === "development") {
  ALLOWED_ORIGINS.push("http://localhost:5173", "http://localhost:3000");
}

function corsHeaders(origin?: string) {
  // Validate origin against whitelist
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400", // 24 hours
    Vary: "Origin",
    // Security headers
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  } as const;
}

function json(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function badRequest(message: string, status = 400) {
  return json(status, { error: message });
}

function serverError(message: string) {
  return json(500, { error: message });
}

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
  const origin = event.headers.origin || event.headers.Origin;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(origin),
    };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    logger.warn("Method not allowed", {
      metadata: { method: event.httpMethod },
    });
    return badRequest("Method not allowed", 405);
  }

  try {
    // Rate limiting: use x-forwarded-for or fallback to generic key
    const clientIp =
      event.headers["x-forwarded-for"]?.split(",")[0].trim() || "anonymous";
    const rateLimitKey = `simpleproof:${clientIp}`;

    // 10 requests per hour (3600000 ms) for timestamp creation
    // 100 requests per hour for other actions
    const action = JSON.parse(event.body || "{}").action || "create";
    const rateLimit = action === "create" ? 10 : 100;

    const allowed = allowRequest(rateLimitKey, rateLimit, 3600000);
    logRateLimitEvent(allowed, rateLimitKey, rateLimit, rateLimit, {
      component: "simpleproof-timestamp",
      action,
    });

    if (!allowed) {
      logger.warn("Rate limit exceeded", {
        action,
        metadata: { clientIp, limit: rateLimit },
      });
      return json(429, {
        error: `Rate limit exceeded: ${rateLimit} requests per hour`,
      });
    }

    // Parse request body
    let body: SimpleProofRequest;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      logger.error("Invalid JSON in request body");
      return badRequest("Invalid JSON in request body");
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
        const result = await handleCreateTimestamp(body);
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
        return badRequest(`Unknown action: ${requestAction}`);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logger.error("Handler error", {
      metadata: { error: errorMsg, duration },
    });

    // Capture error in Sentry
    captureSimpleProofError(
      error instanceof Error ? error : new Error(errorMsg),
      {
        component: "simpleproof-timestamp",
        action: "handler",
        metadata: {
          duration,
          httpMethod: event.httpMethod,
        },
      }
    );

    return serverError("Internal server error");
  }
};

// ============================================================================
// ACTION HANDLERS
// ============================================================================

async function handleCreateTimestamp(body: SimpleProofRequest) {
  // Security: Validate input
  if (!body.data || typeof body.data !== "string") {
    return badRequest("Missing or invalid required field: data (string)");
  }

  // Security: Prevent DoS via large payloads
  if (body.data.length > MAX_DATA_LENGTH) {
    return badRequest(
      `Data field exceeds maximum length of ${MAX_DATA_LENGTH} characters`
    );
  }

  if (!body.verification_id || typeof body.verification_id !== "string") {
    return badRequest(
      "Missing or invalid required field: verification_id (UUID)"
    );
  }

  // Security: Validate UUID format to prevent injection attacks
  if (!UUID_PATTERN.test(body.verification_id)) {
    return badRequest("Invalid verification_id format (must be valid UUID)");
  }

  // Get API credentials
  const apiKey = getEnvVar("VITE_SIMPLEPROOF_API_KEY");
  const apiUrl =
    getEnvVar("VITE_SIMPLEPROOF_API_URL") || "https://api.simpleproof.com";

  if (!apiKey) {
    logger.error("SimpleProof API key not configured");
    return serverError("SimpleProof service not configured");
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
      return serverError("SimpleProof API timeout (>10s)");
    }
    return serverError(`SimpleProof API error: ${errorMsg}`);
  }

  // Validate API response
  if (!apiResult.ots_proof) {
    logger.error("Invalid response from SimpleProof API", {
      action: "create",
      verificationId: body.verification_id,
    });
    return serverError("Invalid response from SimpleProof API");
  }

  // Store in database
  const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
  const supabaseKey = getEnvVar("VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    logger.error("Missing Supabase configuration", {
      action: "create",
      verificationId: body.verification_id,
    });
    return serverError("Database configuration error");
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
    return serverError(`Database error: ${errorMsg}`);
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

  return json(200, response, {
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
}
