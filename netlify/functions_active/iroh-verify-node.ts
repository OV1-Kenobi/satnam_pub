/*
 * Iroh Node Verification Function
 * POST /.netlify/functions/iroh-verify-node
 *
 * Verifies Iroh node reachability and caches results
 * - Accepts: node_id (string)
 * - Returns: is_reachable, relay_url, direct_addresses, last_seen
 * - Caching: 1-hour TTL for verification results
 * - Rate limiting: 50 requests/hour per user
 * - Privacy-first: No PII stored, only node identifiers and reachability
 */

import type { Handler } from "@netlify/functions";
import { getEnvVar } from "./utils/env.js";
import { allowRequest } from "./utils/rate-limiter.js";

interface IrohVerifyRequest {
  node_id: string;
}

interface IrohVerifyResponse {
  is_reachable: boolean;
  relay_url: string | null;
  direct_addresses: string[] | null;
  last_seen: number;
}

interface IrohReachabilityResponse {
  is_reachable: boolean;
  relay_url?: string;
  direct_addresses?: string[];
}

// In-memory cache for verification results (1-hour TTL)
const verificationCache = new Map<
  string,
  { result: IrohVerifyResponse; timestamp: number }
>();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";
const IROH_DHT_URL = process.env.VITE_IROH_DHT_URL || "https://dht.iroh.computer";
const IROH_TIMEOUT = parseInt(process.env.VITE_IROH_TIMEOUT || "10000", 10);

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

function isValidNodeId(nodeId: string): boolean {
  // Iroh node IDs are base32 encoded, 52 characters
  const nodeIdRegex = /^[a-z2-7]{52}$/;
  return nodeIdRegex.test(nodeId);
}

function getCacheKey(nodeId: string): string {
  // Use first 32 chars of node ID as cache key
  return `verify:${nodeId.substring(0, 32)}`;
}

function getCachedResult(cacheKey: string): IrohVerifyResponse | null {
  const cached = verificationCache.get(cacheKey);
  if (!cached) return null;

  // Check if cache entry is still valid
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    verificationCache.delete(cacheKey);
    return null;
  }

  return cached.result;
}

function setCachedResult(cacheKey: string, result: IrohVerifyResponse): void {
  verificationCache.set(cacheKey, {
    result,
    timestamp: Date.now(),
  });
}

async function verifyIrohNodeReachability(
  nodeId: string,
  dhtUrl: string
): Promise<IrohReachabilityResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IROH_TIMEOUT);

  try {
    const response = await fetch(`${dhtUrl}/verify/${nodeId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Verification failed: ${response.status}`);
    }

    const data = (await response.json()) as IrohReachabilityResponse;
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Iroh verification timeout (>10s)");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return json(200, {}, { "Access-Control-Max-Age": "86400" });
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return badRequest("Method not allowed", 405);
  }

  try {
    // Parse request body
    let request: IrohVerifyRequest;
    try {
      request = JSON.parse(event.body || "{}");
    } catch {
      return badRequest("Invalid JSON in request body");
    }

    // Validate required fields
    if (!request.node_id) {
      return badRequest("Missing required field: node_id");
    }

    if (!isValidNodeId(request.node_id)) {
      return badRequest("Invalid node_id format (must be 52-char base32)");
    }

    // Rate limiting: 50 requests/hour per user
    const rateLimitKey = `iroh-verify:${event.headers["x-forwarded-for"] || "unknown"}`;
    if (!allowRequest(rateLimitKey, 50, 3600000)) {
      return badRequest("Rate limit exceeded (50 requests/hour)", 429);
    }

    // Check cache first
    const cacheKey = getCacheKey(request.node_id);
    const cachedResult = getCachedResult(cacheKey);

    if (cachedResult) {
      return json(200, cachedResult, { "X-Cache": "HIT" });
    }

    // Verify node reachability via DHT
    let verificationResult: IrohReachabilityResponse;
    try {
      verificationResult = await verifyIrohNodeReachability(
        request.node_id,
        IROH_DHT_URL
      );
    } catch (error) {
      // Graceful degradation: return unreachable if verification fails
      console.error(
        "Iroh verification error:",
        error instanceof Error ? error.message : "Unknown error"
      );
      verificationResult = {
        is_reachable: false,
        relay_url: null,
        direct_addresses: null,
      };
    }

    // Build response
    const response: IrohVerifyResponse = {
      is_reachable: verificationResult.is_reachable || false,
      relay_url: verificationResult.relay_url || null,
      direct_addresses: verificationResult.direct_addresses || null,
      last_seen: Math.floor(Date.now() / 1000),
    };

    // Cache the result
    setCachedResult(cacheKey, response);

    return json(200, response, { "X-Cache": "MISS" });
  } catch (error) {
    console.error(
      "Iroh verification error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return serverError("Internal server error");
  }
};

export { handler };

