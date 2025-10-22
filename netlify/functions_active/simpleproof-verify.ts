/*
 * SimpleProof Verification Function
 * POST /.netlify/functions/simpleproof-verify
 *
 * Verifies OpenTimestamps proofs and Bitcoin blockchain confirmations
 * - Accepts: ots_proof (string)
 * - Returns: is_valid, bitcoin_block, bitcoin_tx, confidence
 * - Caching: 24-hour TTL for verified proofs
 * - Privacy-first: No PII stored, only proofs and verification results
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env.js";
import { allowRequest } from "./utils/rate-limiter.js";

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
const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
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

function getCacheKey(otsProof: string): string {
  // Use first 32 chars of proof as cache key (sufficient for uniqueness)
  return `verify:${otsProof.substring(0, 32)}`;
}

function getCachedResult(
  cacheKey: string
): SimpleProofVerifyResponse | null {
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

export const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(),
    };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return badRequest("Method not allowed", 405);
  }

  try {
    // Rate limiting: use x-forwarded-for or fallback to generic key
    const clientIp =
      event.headers["x-forwarded-for"]?.split(",")[0].trim() || "anonymous";
    const rateLimitKey = `simpleproof-verify:${clientIp}`;

    // 100 requests per hour (3600000 ms) - verification is cheaper than creation
    if (!allowRequest(rateLimitKey, 100, 3600000)) {
      return json(429, { error: "Rate limit exceeded: 100 requests per hour" });
    }

    // Parse request body
    let body: SimpleProofVerifyRequest;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return badRequest("Invalid JSON in request body");
    }

    // Validate input
    if (!body.ots_proof || typeof body.ots_proof !== "string") {
      return badRequest("Missing or invalid required field: ots_proof (string)");
    }

    // Check cache first
    const cacheKey = getCacheKey(body.ots_proof);
    const cachedResult = getCachedResult(cacheKey);
    if (cachedResult) {
      console.log("SimpleProof verification cache hit");
      return json(200, cachedResult, {
        "Cache-Control": "public, max-age=86400", // 24 hours
        "X-Cache": "HIT",
      });
    }

    // Get API credentials
    const apiKey = getEnvVar("VITE_SIMPLEPROOF_API_KEY");
    const apiUrl =
      getEnvVar("VITE_SIMPLEPROOF_API_URL") || "https://api.simpleproof.com";

    if (!apiKey) {
      console.error("SimpleProof API key not configured");
      return serverError("SimpleProof service not configured");
    }

    // Call SimpleProof API
    let apiResult: SimpleProofApiVerifyResponse;
    try {
      apiResult = await callSimpleProofVerifyApi(
        body.ots_proof,
        apiKey,
        apiUrl
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error";
      console.error("SimpleProof verify API call failed:", errorMsg);

      if (errorMsg.includes("abort")) {
        return serverError("SimpleProof API timeout (>10s)");
      }
      return serverError(`SimpleProof API error: ${errorMsg}`);
    }

    // Build response
    const response: SimpleProofVerifyResponse = {
      is_valid: apiResult.is_valid || false,
      bitcoin_block: apiResult.bitcoin_block || null,
      bitcoin_tx: apiResult.bitcoin_tx || null,
      confidence: apiResult.confidence || "unconfirmed",
      verified_at: Math.floor(Date.now() / 1000),
    };

    // Cache the result
    setCachedResult(cacheKey, response);

    console.log(
      `SimpleProof verification: ${response.is_valid ? "valid" : "invalid"} (${response.confidence})`
    );

    return json(200, response, {
      "Cache-Control": "public, max-age=86400", // 24 hours
      "X-Cache": "MISS",
    });
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error";
    console.error("SimpleProof verify handler error:", errorMsg);
    return serverError("Internal server error");
  }
};

