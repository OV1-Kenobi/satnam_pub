/*
 * DID Document service for /.well-known/did.json
 * - Pure ESM (Netlify functions)
 * - process.env for configuration
 * - CORS and rate limiting per repo patterns
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

import { buildDidDocument } from "../../src/lib/vc/jwk-did.ts";

export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 DID JSON handler started:", {
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
    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitResult = await checkRateLimitStatus(
      rateLimitKey,
      RATE_LIMITS.IDENTITY_VERIFY
    );

    if (!rateLimitResult.allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "did-json",
        method: event.httpMethod,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Config from env; all public
    const nip05 = process.env.DIDJSON_NIP05;
    const jwkX = process.env.DIDJSON_JWK_X;
    const jwkY = process.env.DIDJSON_JWK_Y;
    const mirrorsCsv = process.env.DIDJSON_MIRRORS || "https://www.satnam.pub";

    if (!nip05 || !jwkX || !jwkY) {
      return errorResponse(
        500,
        "Server not configured: DIDJSON_NIP05, DIDJSON_JWK_X, DIDJSON_JWK_Y required",
        requestOrigin
      );
    }

    const mirrors = mirrorsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.includes("://") ? s : `https://${s}`));

    const jwk = { kty: "EC", crv: "secp256k1", x: jwkX, y: jwkY } as const;

    const didDoc = await buildDidDocument({ nip05, jwk, mirrors });

    // Return success response with security headers
    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(didDoc),
    };
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "did-json",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
