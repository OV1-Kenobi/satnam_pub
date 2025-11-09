/*
 * SimpleProof Verification Function
 * POST /.netlify/functions/simpleproof-verify
 *
 * Verifies OpenTimestamps proofs and Bitcoin blockchain confirmations
 * - Accepts: ots_proof (string)
 * - Returns: is_valid, bitcoin_block, bitcoin_tx, confidence
 * - Caching: 24-hour TTL for verified proofs
 * - Privacy-first: No PII stored, only proofs and verification results
 *
 * Phase 2B-2 Day 15: Enhanced with structured logging + Sentry error tracking
 */

import type { Handler } from "@netlify/functions";
import { createHash } from "node:crypto";
import {
  createLogger,
  logApiCall,
  logCacheEvent,
} from "../functions/utils/logging.js";
import {
  addSimpleProofBreadcrumb,
  captureSimpleProofError,
  initializeSentry,
} from "../functions/utils/sentry.server.js";
import { getEnvVar } from "./utils/env.js";

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

// Security: Input validation patterns
const MAX_OTS_PROOF_LENGTH = 100000; // 100KB max for OTS proof

interface SimpleProofVerifyRequest {
  ots_proof: string;
}

interface SimpleProofVerifyResponse {
  is_valid: boolean;
  bitcoin_block: number | null;
  bitcoin_tx: string | null;
  confidence: string; // "high", "medium", "low", "unconfirmed"
  verified_at: number;
}

interface SimpleProofApiVerifyResponse {
  is_valid: boolean;
  bitcoin_block?: number;
  bitcoin_tx?: string;
  confidence?: string;
}

// In-memory cache for verified proofs (24-hour TTL)
const verificationCache = new Map<
  string,
  { result: SimpleProofVerifyResponse; timestamp: number }
>();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Old helper functions removed - now using centralized security utilities

function getCacheKey(otsProof: string): string {
  // Use hash of full proof as cache key for collision-free uniqueness
  const hash = createHash("sha256").update(otsProof).digest("hex");
  return `verify:${hash}`;
}

function getCachedResult(cacheKey: string): SimpleProofVerifyResponse | null {
  const cached = verificationCache.get(cacheKey);
  if (!cached) return null;

  // Check if cache entry is still valid
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    verificationCache.delete(cacheKey);
    return null;
  }

  return cached.result;
}

function setCachedResult(
  cacheKey: string,
  result: SimpleProofVerifyResponse
): void {
  verificationCache.set(cacheKey, {
    result,
    timestamp: Date.now(),
  });
}

async function callSimpleProofVerifyApi(
  otsProof: string,
  apiKey: string,
  apiUrl: string
): Promise<SimpleProofApiVerifyResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const response = await fetch(`${apiUrl}/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ots_proof: otsProof }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `SimpleProof API error: ${response.status} ${response.statusText}`
      );
    }

    const result = (await response.json()) as SimpleProofApiVerifyResponse;
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Create logger instance
const logger = createLogger({ component: "simpleproof-verify" });

export const handler: Handler = async (event) => {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  // Initialize Sentry for error tracking
  initializeSentry();

  logger.info("🚀 SimpleProof verify handler started");

  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  try {
    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const allowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.IDENTITY_VERIFY
    );

    if (!allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "simpleproof-verify",
        method: event.httpMethod,
      });
      logger.warn("Rate limit exceeded");
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Parse request body
    let body: SimpleProofVerifyRequest;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      logger.error("Invalid JSON in request body");
      return errorResponse(400, "Invalid JSON in request body", requestOrigin);
    }

    // Security: Validate input
    if (!body.ots_proof || typeof body.ots_proof !== "string") {
      logger.warn("Missing or invalid ots_proof field");
      return errorResponse(
        400,
        "Missing or invalid required field: ots_proof (string)",
        requestOrigin
      );
    }

    // Security: Prevent DoS via large payloads
    if (body.ots_proof.length > MAX_OTS_PROOF_LENGTH) {
      logger.warn("OTS proof exceeds maximum length", {
        metadata: { length: body.ots_proof.length, max: MAX_OTS_PROOF_LENGTH },
      });
      return errorResponse(
        400,
        `OTS proof exceeds maximum length of ${MAX_OTS_PROOF_LENGTH} characters`,
        requestOrigin
      );
    }

    logger.info("Verification request received", {
      action: "verify",
    });

    // Add Sentry breadcrumb for request
    addSimpleProofBreadcrumb("SimpleProof verification request received", {
      action: "verify",
    });

    // Check cache first
    const cacheKey = getCacheKey(body.ots_proof);
    const cachedResult = getCachedResult(cacheKey);
    if (cachedResult) {
      logCacheEvent(true, cacheKey, {
        component: "simpleproof-verify",
        action: "verify",
      });
      logger.info("Cache hit", {
        action: "verify",
        metadata: { cacheKey: cacheKey.substring(0, 16) + "..." },
      });

      // Add Sentry breadcrumb for cache hit
      addSimpleProofBreadcrumb("SimpleProof verification cache hit", {
        cached: true,
      });

      const duration = Date.now() - startTime;
      logger.info("Request completed", {
        action: "verify",
        metadata: { duration, statusCode: 200, cached: true },
      });

      const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
        "X-Cache": "HIT",
        "Access-Control-Allow-Origin":
          requestOrigin ||
          process.env.VITE_CORS_ORIGIN ||
          "https://www.satnam.pub",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      };

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(cachedResult),
      };
    }

    logCacheEvent(false, cacheKey, {
      component: "simpleproof-verify",
      action: "verify",
    });

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
    let apiResult: SimpleProofApiVerifyResponse;
    const apiStartTime = Date.now();
    try {
      logger.debug("Calling SimpleProof API", { action: "verify" });
      apiResult = await callSimpleProofVerifyApi(
        body.ots_proof,
        apiKey,
        apiUrl
      );
      const apiDuration = Date.now() - apiStartTime;
      logApiCall("POST", apiUrl, 200, apiDuration, {
        component: "simpleproof-verify",
        action: "verify",
      });
    } catch (error) {
      const apiDuration = Date.now() - apiStartTime;
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("SimpleProof API call failed", {
        action: "verify",
        metadata: { error: errorMsg, duration: apiDuration },
      });

      // Capture error in Sentry
      captureSimpleProofError(
        error instanceof Error ? error : new Error(errorMsg),
        {
          component: "simpleproof-verify",
          action: "verifyTimestamp",
          metadata: {
            apiUrl,
            duration: apiDuration,
            status: "api_error",
          },
        }
      );

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

    // Build response
    const response: SimpleProofVerifyResponse = {
      is_valid: apiResult.is_valid ?? false,
      bitcoin_block: apiResult.bitcoin_block ?? null,
      bitcoin_tx: apiResult.bitcoin_tx ?? null,
      confidence: apiResult.confidence ?? "unconfirmed",
      verified_at: Math.floor(Date.now() / 1000),
    };

    // Cache the result
    setCachedResult(cacheKey, response);

    logger.info("Verification completed successfully", {
      action: "verify",
      metadata: {
        isValid: response.is_valid,
        bitcoinBlock: response.bitcoin_block,
        confidence: response.confidence,
      },
    });

    // Add Sentry breadcrumb for success
    addSimpleProofBreadcrumb(
      "SimpleProof verification completed successfully",
      {
        is_valid: response.is_valid,
        confidence: response.confidence,
      }
    );

    const duration = Date.now() - startTime;
    logger.info("Request completed", {
      action: "verify",
      metadata: { duration, statusCode: 200, cached: false },
    });

    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
      "X-Cache": "MISS",
      "Access-Control-Allow-Origin":
        requestOrigin ||
        process.env.VITE_CORS_ORIGIN ||
        "https://www.satnam.pub",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(error, {
      requestId,
      endpoint: "simpleproof-verify",
      method: event.httpMethod,
      duration,
    });

    // Capture error in Sentry
    captureSimpleProofError(
      error instanceof Error ? error : new Error(String(error)),
      {
        component: "simpleproof-verify",
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
