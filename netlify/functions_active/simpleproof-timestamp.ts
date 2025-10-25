/*
 * SimpleProof Timestamp Creation Function
 * POST /.netlify/functions/simpleproof-timestamp
 *
 * Creates OpenTimestamps proofs anchored to Bitcoin blockchain
 * - Accepts: data (string), verification_id (UUID)
 * - Returns: ots_proof, bitcoin_block, bitcoin_tx, verified_at
 * - Rate limiting: 10 requests/hour per user
 * - Privacy-first: No PII stored, only hashes and proofs
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env.js";
import { allowRequest } from "./utils/rate-limiter.js";

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
  supabase: ReturnType<typeof createClient>,
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

  return data.id;
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
    const rateLimitKey = `simpleproof:${clientIp}`;

    // 10 requests per hour (3600000 ms) for timestamp creation
    // 100 requests per hour for other actions
    const action = JSON.parse(event.body || "{}").action || "create";
    const rateLimit = action === "create" ? 10 : 100;

    if (!allowRequest(rateLimitKey, rateLimit, 3600000)) {
      return json(429, {
        error: `Rate limit exceeded: ${rateLimit} requests per hour`,
      });
    }

    // Parse request body
    let body: SimpleProofRequest;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return badRequest("Invalid JSON in request body");
    }

    // Route based on action (default: "create" for backward compatibility)
    const requestAction = body.action || "create";

    switch (requestAction) {
      case "create":
        return await handleCreateTimestamp(body);
      default:
        return badRequest(`Unknown action: ${requestAction}`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("SimpleProof timestamp handler error:", errorMsg);
    return serverError("Internal server error");
  }
};

// ============================================================================
// ACTION HANDLERS
// ============================================================================

async function handleCreateTimestamp(body: SimpleProofRequest) {
  // Validate input
  if (!body.data || typeof body.data !== "string") {
    return badRequest("Missing or invalid required field: data (string)");
  }

  if (!body.verification_id || typeof body.verification_id !== "string") {
    return badRequest(
      "Missing or invalid required field: verification_id (UUID)"
    );
  }

  // Validate UUID format (basic check)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(body.verification_id)) {
    return badRequest("Invalid verification_id format (must be UUID)");
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
  let apiResult: SimpleProofApiResponse;
  try {
    apiResult = await callSimpleProofApi(body.data!, apiKey, apiUrl);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("SimpleProof API call failed:", errorMsg);

    // Graceful degradation: return error but don't crash
    if (errorMsg.includes("abort")) {
      return serverError("SimpleProof API timeout (>10s)");
    }
    return serverError(`SimpleProof API error: ${errorMsg}`);
  }

  // Validate API response
  if (!apiResult.ots_proof) {
    console.error("SimpleProof API returned invalid response:", apiResult);
    return serverError("Invalid response from SimpleProof API");
  }

  // Store in database
  const supabase = createClient(
    getEnvVar("VITE_SUPABASE_URL"),
    getEnvVar("VITE_SUPABASE_ANON_KEY")
  );

  let timestampId: string;
  try {
    timestampId = await storeTimestamp(
      supabase,
      body.verification_id!,
      apiResult.ots_proof,
      apiResult.bitcoin_block || null,
      apiResult.bitcoin_tx || null
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to store timestamp:", errorMsg);
    return serverError(`Database error: ${errorMsg}`);
  }

  // Return success response
  const response: SimpleProofResponse = {
    ots_proof: apiResult.ots_proof,
    bitcoin_block: apiResult.bitcoin_block || null,
    bitcoin_tx: apiResult.bitcoin_tx || null,
    verified_at: Math.floor(Date.now() / 1000),
  };

  console.log(
    `SimpleProof timestamp created: ${timestampId} for verification ${body.verification_id}`
  );

  return json(200, response, {
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
}
