/**
 * PKARR Record Resolution Endpoint
 * GET /.netlify/functions/pkarr-resolve?public_key=...
 *
 * Phase 1: Resolves PKARR records from database cache
 * Returns cached records or queries DHT relays
 * Pure ESM, uses process.env, rate limited, CORS
 */

import type { Handler } from "@netlify/functions";
import { getRequestClient } from "./supabase.js";
import { allowRequest } from "./utils/rate-limiter.js";
import { getEnvVar } from "./utils/env.js";

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
    "Content-Security-Policy": "default-src 'none'",
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

function badRequest(body: unknown, status = 400) {
  return json(status, body);
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...corsHeaders() } };
  }
  if (event.httpMethod !== "GET") {
    return badRequest({ error: "Method not allowed" }, 405);
  }

  // Check if PKARR is enabled
  const pkarrEnabled = getEnvVar("VITE_PKARR_ENABLED") === "true";
  if (!pkarrEnabled) {
    return badRequest({ error: "PKARR integration is not enabled" }, 503);
  }

  const publicKey = (event.queryStringParameters?.public_key || "").trim();
  if (!publicKey) {
    return badRequest({ error: "Missing public_key query parameter" }, 422);
  }

  // Validate public key format (64 hex chars)
  if (!/^[0-9a-fA-F]{64}$/.test(publicKey)) {
    return badRequest({ error: "Invalid public key format" }, 400);
  }

  // Rate limit per IP
  const xfwd =
    event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
  const clientIp = Array.isArray(xfwd)
    ? xfwd[0]
    : (xfwd || "").split(",")[0]?.trim() || "unknown";
  if (!allowRequest(clientIp, 60, 60_000))
    return badRequest({ error: "Too many requests" }, 429);

  try {
    const supabase = getRequestClient(undefined);

    // Try to get from cache first
    const { data: cachedRecord, error: cacheError } = await supabase
      .from("pkarr_records")
      .select("*")
      .eq("public_key", publicKey)
      .maybeSingle();

    if (cacheError) {
      console.error("Database error:", cacheError);
      return badRequest({ error: "Failed to query PKARR records" }, 500);
    }

    if (!cachedRecord) {
      return badRequest(
        { error: "PKARR record not found for this public key" },
        404
      );
    }

    // Check if cache is still valid
    const now = Math.floor(Date.now() / 1000);
    const cacheExpired = cachedRecord.cache_expires_at < now;

    // Cache for 5 minutes
    const cacheHeaders = {
      "Cache-Control": cacheExpired
        ? "public, max-age=60, stale-while-revalidate=300"
        : "public, max-age=300, stale-while-revalidate=600",
    };

    return json(
      200,
      {
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
      },
      cacheHeaders
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("PKARR resolve error:", message);
    return badRequest({ error: message }, 500);
  }
};

