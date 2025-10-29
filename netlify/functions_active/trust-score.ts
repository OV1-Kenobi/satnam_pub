/*
 * Trust Score Calculation Endpoint
 * POST /.netlify/functions/trust-score
 * Body: {
 *   physicallyVerified?: boolean,
 *   vpVerified?: boolean,
 *   socialAttestations?: { count: number, distinctIssuers?: number, recentCount30d?: number },
 *   recencyDays?: number
 * }
 *
 * Returns: { success, data: { score, components, level } }
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
  generateRequestId,
  logError,
} from "./utils/error-handler.ts";
import {
  errorResponse,
  getSecurityHeaders,
  preflightResponse,
} from "./utils/security-headers.ts";

import {
  computeTrustScore,
  type TrustInputs,
} from "../../src/lib/trust/trust-score.ts";

export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 Trust score handler started:", {
    requestId,
    method: event.httpMethod,
    timestamp: new Date().toISOString(),
  });

  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  try {
    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitResult = await checkRateLimitStatus(
      rateLimitKey,
      RATE_LIMITS.IDENTITY_VERIFY
    );

    if (!rateLimitResult.allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "trust-score",
        method: event.httpMethod,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    const body = (() => {
      try {
        return JSON.parse(event.body || "{}");
      } catch {
        return {};
      }
    })() as TrustInputs;
    const result = computeTrustScore(body || {});

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data: result }),
    };
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "trust-score",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
