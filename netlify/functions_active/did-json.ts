/*
 * DID Document service for /.well-known/did.json
 * - Pure ESM (Netlify functions)
 * - process.env for configuration
 * - CORS and rate limiting per repo patterns
 */

import type { Handler } from "@netlify/functions";
import { buildDidDocument } from "../../src/lib/vc/jwk-did.ts";
import { allowRequest } from "./utils/rate-limiter.js";

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

function badRequest(body: unknown, status = 400) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...corsHeaders() } };
  }
  if (event.httpMethod !== "GET") {
    return badRequest({ error: "Method not allowed" }, 405);
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
    // Config from env; all public
    const nip05 = process.env.DIDJSON_NIP05;
    const jwkX = process.env.DIDJSON_JWK_X;
    const jwkY = process.env.DIDJSON_JWK_Y;
    const mirrorsCsv = process.env.DIDJSON_MIRRORS || "https://www.satnam.pub";

    if (!nip05 || !jwkX || !jwkY) {
      return badRequest(
        {
          error:
            "Server not configured: DIDJSON_NIP05, DIDJSON_JWK_X, DIDJSON_JWK_Y required",
        },
        500
      );
    }

    const mirrors = mirrorsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.includes("://") ? s : `https://${s}`));

    const jwk = { kty: "EC", crv: "secp256k1", x: jwkX, y: jwkY } as const;

    const didDoc = await buildDidDocument({ nip05, jwk, mirrors });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
      body: JSON.stringify(didDoc),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return badRequest({ error: message }, 500);
  }
};
