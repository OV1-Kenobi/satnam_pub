/*
 * Iroh Node Discovery Function
 * POST /.netlify/functions/iroh-discover-node
 *
 * Discovers Iroh nodes via DHT lookup and stores discovery results
 * - Accepts: verification_id (UUID), optional node_id (string)
 * - Returns: node_id, relay_url, direct_addresses, is_reachable
 * - Rate limiting: 20 requests/hour per user
 * - Privacy-first: No PII stored, only node identifiers and addresses
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env.js";
import { allowRequest } from "./utils/rate-limiter.js";

interface IrohDiscoveryRequest {
  verification_id: string;
  node_id?: string;
}

interface IrohDiscoveryResponse {
  node_id: string;
  relay_url: string | null;
  direct_addresses: string[] | null;
  is_reachable: boolean;
  discovered_at: number;
}

interface IrohDhtResponse {
  node_id: string;
  relay_url?: string;
  direct_addresses?: string[];
  is_reachable?: boolean;
}

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

function isValidUuid(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

function isValidNodeId(nodeId: string): boolean {
  // Iroh node IDs are base32 encoded, 52 characters
  const nodeIdRegex = /^[a-z2-7]{52}$/;
  return nodeIdRegex.test(nodeId);
}

async function discoverIrohNode(
  nodeId: string,
  dhtUrl: string
): Promise<IrohDhtResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IROH_TIMEOUT);

  try {
    const response = await fetch(`${dhtUrl}/lookup/${nodeId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`DHT lookup failed: ${response.status}`);
    }

    const data = (await response.json()) as IrohDhtResponse;
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Iroh DHT lookup timeout (>10s)");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function storeDiscoveryResult(
  supabase: ReturnType<typeof createClient>,
  verificationId: string,
  nodeId: string,
  relayUrl: string | null,
  directAddresses: string[] | null,
  isReachable: boolean
): Promise<void> {
  const { error } = await supabase.rpc("store_iroh_discovery", {
    p_verification_id: verificationId,
    p_node_id: nodeId,
    p_relay_url: relayUrl,
    p_direct_addresses: directAddresses ? JSON.stringify(directAddresses) : null,
    p_is_reachable: isReachable,
  });

  if (error) {
    console.error("Database error storing Iroh discovery:", error);
    throw new Error("Failed to store discovery result");
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
    let request: IrohDiscoveryRequest;
    try {
      request = JSON.parse(event.body || "{}");
    } catch {
      return badRequest("Invalid JSON in request body");
    }

    // Validate required fields
    if (!request.verification_id) {
      return badRequest("Missing required field: verification_id");
    }

    if (!isValidUuid(request.verification_id)) {
      return badRequest("Invalid verification_id format (must be UUID)");
    }

    // If node_id provided, validate format
    if (request.node_id && !isValidNodeId(request.node_id)) {
      return badRequest("Invalid node_id format (must be 52-char base32)");
    }

    // Rate limiting: 20 requests/hour per user
    const rateLimitKey = `iroh-discover:${event.headers["x-forwarded-for"] || "unknown"}`;
    if (!allowRequest(rateLimitKey, 20, 3600000)) {
      return badRequest("Rate limit exceeded (20 requests/hour)", 429);
    }

    // Initialize Supabase client
    const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
    const supabaseKey = getEnvVar("VITE_SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase credentials");
      return serverError("Configuration error");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // If no node_id provided, generate one (for testing/demo)
    // In production, this would come from user's Iroh node
    const nodeId = request.node_id || "a" + "b".repeat(51); // Demo node ID

    // Discover node via DHT
    let discoveryResult: IrohDhtResponse;
    try {
      discoveryResult = await discoverIrohNode(nodeId, IROH_DHT_URL);
    } catch (error) {
      // Graceful degradation: return empty result if DHT lookup fails
      console.error(
        "Iroh DHT lookup error:",
        error instanceof Error ? error.message : "Unknown error"
      );
      discoveryResult = {
        node_id: nodeId,
        relay_url: null,
        direct_addresses: null,
        is_reachable: false,
      };
    }

    // Store discovery result in database
    try {
      await storeDiscoveryResult(
        supabase,
        request.verification_id,
        discoveryResult.node_id,
        discoveryResult.relay_url || null,
        discoveryResult.direct_addresses || null,
        discoveryResult.is_reachable || false
      );
    } catch (error) {
      console.error(
        "Database error:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return serverError("Failed to store discovery result");
    }

    // Return discovery result
    const response: IrohDiscoveryResponse = {
      node_id: discoveryResult.node_id,
      relay_url: discoveryResult.relay_url || null,
      direct_addresses: discoveryResult.direct_addresses || null,
      is_reachable: discoveryResult.is_reachable || false,
      discovered_at: Math.floor(Date.now() / 1000),
    };

    return json(200, response);
  } catch (error) {
    console.error(
      "Iroh discovery error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return serverError("Internal server error");
  }
};

export { handler };

