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
import { allowRequest } from "./utils/rate-limiter.js";
import { computeTrustScore, type TrustInputs } from "../../src/lib/trust/trust-score.ts";

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
    "Content-Security-Policy": "default-src 'none'",
  } as const;
}

function json(status: number, body: unknown) {
  return { statusCode: status, headers: { "Content-Type": "application/json", ...corsHeaders() }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...corsHeaders() }, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { success: false, error: "Method not allowed" });
  }

  // Rate limit per IP
  const xfwd = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
  const clientIp = Array.isArray(xfwd) ? xfwd[0] : (xfwd || "").split(",")[0]?.trim() || "unknown";
  if (!allowRequest(clientIp, 120, 60_000)) return json(429, { success: false, error: "Too many requests" });

  try {
    const body = (() => { try { return JSON.parse(event.body || "{}"); } catch { return {}; } })() as TrustInputs;
    const result = computeTrustScore(body || {});
    return json(200, { success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(500, { success: false, error: message });
  }
};

