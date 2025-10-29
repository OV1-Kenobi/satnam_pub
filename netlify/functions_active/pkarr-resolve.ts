/**
 * PKARR Record Resolution Endpoint
 * GET /.netlify/functions/pkarr-resolve?public_key=...
 *
 * Phase 1: Resolves PKARR records from database cache
 * Returns cached records or queries DHT relays
 * Pure ESM, uses process.env, rate limited, CORS
 */

import type { Handler } from "@netlify/functions";

// Security utilities (Phase 2 hardening)
import {
  RATE_LIMITS,
  checkRateLimitStatus,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.ts";
import {
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.ts";
import {
  errorResponse,
  getSecurityHeaders,
  preflightResponse,
} from "./utils/security-headers.ts";

import { getRequestClient } from "./supabase.js";
import { getEnvVar } from "./utils/env.js";

export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 PKARR resolve handler started:", {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  if (event.httpMethod !== "GET") {
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  try {
    // Check if PKARR is enabled
    const pkarrEnabled = getEnvVar("VITE_PKARR_ENABLED") === "true";
    if (!pkarrEnabled) {
      return errorResponse(
        503,
        "PKARR integration is not enabled",
        requestOrigin
      );
    }

    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitResult = await checkRateLimitStatus(
      rateLimitKey,
      RATE_LIMITS.IDENTITY_VERIFY
    );

    if (!rateLimitResult.allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "pkarr-resolve",
        method: event.httpMethod,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    const publicKey = (event.queryStringParameters?.public_key || "").trim();
    if (!publicKey) {
      return createValidationErrorResponse(
        "Missing public_key query parameter",
        requestId,
        requestOrigin
      );
    }

    // Validate public key format (64 hex chars)
    if (!/^[0-9a-fA-F]{64}$/.test(publicKey)) {
      return createValidationErrorResponse(
        "Invalid public key format",
        requestId,
        requestOrigin
      );
    }

    const supabase = getRequestClient(undefined);

    // Try to get from cache first
    const { data: cachedRecord, error: cacheError } = await supabase
      .from("pkarr_records")
      .select("*")
      .eq("public_key", publicKey)
      .maybeSingle();

    if (cacheError) {
      logError(cacheError, {
        requestId,
        endpoint: "pkarr-resolve",
        operation: "database_query",
      });
      return errorResponse(500, "Failed to query PKARR records", requestOrigin);
    }

    if (!cachedRecord) {
      return errorResponse(
        404,
        "PKARR record not found for this public key",
        requestOrigin
      );
    }

    // Check if cache is still valid
    const now = Math.floor(Date.now() / 1000);
    const cacheExpired = cachedRecord.cache_expires_at < now;

    // Return success response with security headers
    const headers = getSecurityHeaders(requestOrigin);
    const cacheControl = cacheExpired
      ? "public, max-age=60, stale-while-revalidate=300"
      : "public, max-age=300, stale-while-revalidate=600";

    return {
      statusCode: 200,
      headers: {
        ...headers,
        "Cache-Control": cacheControl,
      },
      body: JSON.stringify({
        success: true,
        data: {
          public_key: cachedRecord.public_key,
          records: cachedRecord.records,
          timestamp: cachedRecord.timestamp,
          sequence: cachedRecord.sequence,
          signature: cachedRecord.signature,
          verified: cachedRecord.verified,
          cacheExpired,
          cacheExpiresAt: cachedRecord.cache_expires_at,
          lastPublished: cachedRecord.last_published_at,
        },
      }),
    };
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "pkarr-resolve",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
