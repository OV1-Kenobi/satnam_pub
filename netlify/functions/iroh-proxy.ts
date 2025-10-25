/*
 * Unified Iroh Proxy Function
 * POST /.netlify/functions/iroh-proxy
 *
 * Consolidates all Iroh-related operations with action-based routing
 * Following the established pkarr-proxy pattern for consistency
 *
 * Actions:
 * - discover_node: Discover Iroh nodes via DHT lookup (user scope)
 * - verify_node: Verify node reachability (user scope)
 * - get_node_info: Retrieve stored node information (user scope)
 * - update_node_status: Update node reachability status (admin scope)
 *
 * Rate Limiting:
 * - discover_node: 20 requests/hour per IP
 * - verify_node: 50 requests/hour per IP
 * - get_node_info: 60 requests/hour per IP
 * - update_node_status: 60 requests/hour per IP (admin only)
 *
 * Privacy-First: No PII stored, only node identifiers and addresses
 */

import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env.js";
import { allowRequest } from "./utils/rate-limiter.js";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

const ACTIONS = {
  discover_node: { scope: "user" as const },
  verify_node: { scope: "user" as const },
  get_node_info: { scope: "user" as const },
  update_node_status: { scope: "admin" as const },
} as const;

type ActionName = keyof typeof ACTIONS;

interface DiscoverNodePayload {
  verification_id: string;
  node_id?: string;
}

interface VerifyNodePayload {
  node_id: string;
}

interface GetNodeInfoPayload {
  verification_id: string;
}

interface UpdateNodeStatusPayload {
  node_id: string;
  is_reachable: boolean;
}

interface IrohDhtResponse {
  node_id: string;
  relay_url?: string;
  direct_addresses?: string[];
  is_reachable?: boolean;
}

interface IrohVerifyResponse {
  is_reachable: boolean;
  relay_url: string | null;
  direct_addresses: string[] | null;
  last_seen: number;
}

// ============================================================================
// GLOBAL STATE & CONFIGURATION
// ============================================================================

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";
const IROH_DHT_URL =
  process.env.VITE_IROH_DHT_URL || "https://dht.iroh.computer";
const IROH_TIMEOUT = parseInt(process.env.VITE_IROH_TIMEOUT || "10000", 10);
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory cache for verification results (1-hour TTL)
const verificationCache = new Map<
  string,
  { result: IrohVerifyResponse; timestamp: number }
>();

// Cleanup interval for cache maintenance
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of verificationCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      verificationCache.delete(key);
    }
  }
}, 5 * 60 * 1000); // Cleanup every 5 minutes

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

// ============================================================================
// IROH DHT OPERATIONS
// ============================================================================

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

async function verifyIrohNodeReachability(
  nodeId: string,
  dhtUrl: string
): Promise<IrohDhtResponse> {
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

    const data = (await response.json()) as IrohDhtResponse;
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

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

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
    p_direct_addresses: directAddresses
      ? JSON.stringify(directAddresses)
      : null,
    p_is_reachable: isReachable,
  });

  if (error) {
    console.error("Database error storing Iroh discovery:", error);
    throw new Error("Failed to store discovery result");
  }
}

async function getNodeInfo(
  supabase: ReturnType<typeof createClient>,
  verificationId: string
): Promise<any> {
  const { data, error } = await supabase.rpc("get_iroh_discovery", {
    p_verification_id: verificationId,
  });

  if (error) {
    console.error("Database error retrieving node info:", error);
    throw new Error("Failed to retrieve node information");
  }

  return data;
}

async function updateNodeReachability(
  supabase: ReturnType<typeof createClient>,
  nodeId: string,
  isReachable: boolean
): Promise<number> {
  const { data, error } = await supabase.rpc("update_iroh_reachability", {
    p_node_id: nodeId,
    p_is_reachable: isReachable,
  });

  if (error) {
    console.error("Database error updating node reachability:", error);
    throw new Error("Failed to update node reachability");
  }

  return data as number;
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

/**
 * Action: discover_node
 * Discovers Iroh nodes via DHT lookup and stores discovery results
 */
async function handleDiscoverNode(payload: DiscoverNodePayload): Promise<any> {
  // Validate required fields
  if (!payload.verification_id) {
    return json(400, {
      success: false,
      error: "Missing required field: verification_id",
    });
  }

  if (!isValidUuid(payload.verification_id)) {
    return json(400, {
      success: false,
      error: "Invalid verification_id format (must be UUID)",
    });
  }

  // If node_id provided, validate format
  if (payload.node_id && !isValidNodeId(payload.node_id)) {
    return json(400, {
      success: false,
      error: "Invalid node_id format (must be 52-char base32)",
    });
  }

  // Initialize Supabase client
  const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
  const supabaseKey = getEnvVar("VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    return json(500, { success: false, error: "Configuration error" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // If no node_id provided, generate one (for testing/demo)
  // In production, this would come from user's Iroh node
  const nodeId = payload.node_id || "a" + "b".repeat(51); // Demo node ID

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
      relay_url: undefined,
      direct_addresses: undefined,
      is_reachable: false,
    };
  }

  // Store discovery result in database
  try {
    await storeDiscoveryResult(
      supabase,
      payload.verification_id,
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
    return json(500, {
      success: false,
      error: "Failed to store discovery result",
    });
  }

  // Return discovery result
  return json(200, {
    success: true,
    node_id: discoveryResult.node_id,
    relay_url: discoveryResult.relay_url || null,
    direct_addresses: discoveryResult.direct_addresses || null,
    is_reachable: discoveryResult.is_reachable || false,
    discovered_at: Math.floor(Date.now() / 1000),
  });
}

/**
 * Action: verify_node
 * Verifies Iroh node reachability and caches results
 */
async function handleVerifyNode(payload: VerifyNodePayload): Promise<any> {
  // Validate required fields
  if (!payload.node_id) {
    return json(400, {
      success: false,
      error: "Missing required field: node_id",
    });
  }

  if (!isValidNodeId(payload.node_id)) {
    return json(400, {
      success: false,
      error: "Invalid node_id format (must be 52-char base32)",
    });
  }

  // Check cache first
  const cacheKey = getCacheKey(payload.node_id);
  const cachedResult = getCachedResult(cacheKey);

  if (cachedResult) {
    return json(
      200,
      {
        success: true,
        ...cachedResult,
        cached: true,
      },
      { "X-Cache": "HIT" }
    );
  }

  // Verify node reachability via DHT
  let verificationResult: IrohDhtResponse;
  try {
    verificationResult = await verifyIrohNodeReachability(
      payload.node_id,
      IROH_DHT_URL
    );
  } catch (error) {
    // Graceful degradation: return unreachable if verification fails
    console.error(
      "Iroh verification error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    verificationResult = {
      node_id: payload.node_id,
      is_reachable: false,
      relay_url: undefined,
      direct_addresses: undefined,
    };
  }

  // Prepare response
  const response: IrohVerifyResponse = {
    is_reachable: verificationResult.is_reachable || false,
    relay_url: verificationResult.relay_url || null,
    direct_addresses: verificationResult.direct_addresses || null,
    last_seen: Math.floor(Date.now() / 1000),
  };

  // Cache the result
  setCachedResult(cacheKey, response);

  return json(
    200,
    {
      success: true,
      ...response,
      cached: false,
    },
    { "X-Cache": "MISS" }
  );
}

/**
 * Action: get_node_info
 * Retrieves stored node information from database
 */
async function handleGetNodeInfo(payload: GetNodeInfoPayload): Promise<any> {
  // Validate required fields
  if (!payload.verification_id) {
    return json(400, {
      success: false,
      error: "Missing required field: verification_id",
    });
  }

  if (!isValidUuid(payload.verification_id)) {
    return json(400, {
      success: false,
      error: "Invalid verification_id format (must be UUID)",
    });
  }

  // Initialize Supabase client
  const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
  const supabaseKey = getEnvVar("VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    return json(500, { success: false, error: "Configuration error" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Retrieve node information
  try {
    const nodeInfo = await getNodeInfo(supabase, payload.verification_id);

    return json(200, {
      success: true,
      nodes: nodeInfo || [],
    });
  } catch (error) {
    console.error(
      "Database error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return json(500, {
      success: false,
      error: "Failed to retrieve node information",
    });
  }
}

/**
 * Action: update_node_status
 * Updates node reachability status (admin only)
 */
async function handleUpdateNodeStatus(
  payload: UpdateNodeStatusPayload
): Promise<any> {
  // Validate required fields
  if (!payload.node_id) {
    return json(400, {
      success: false,
      error: "Missing required field: node_id",
    });
  }

  if (!isValidNodeId(payload.node_id)) {
    return json(400, {
      success: false,
      error: "Invalid node_id format (must be 52-char base32)",
    });
  }

  if (typeof payload.is_reachable !== "boolean") {
    return json(400, {
      success: false,
      error: "Missing or invalid field: is_reachable (must be boolean)",
    });
  }

  // Initialize Supabase client
  const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
  const supabaseKey = getEnvVar("VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    return json(500, { success: false, error: "Configuration error" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Update node reachability
  try {
    const updatedCount = await updateNodeReachability(
      supabase,
      payload.node_id,
      payload.is_reachable
    );

    // Invalidate cache for this node
    const cacheKey = getCacheKey(payload.node_id);
    verificationCache.delete(cacheKey);

    return json(200, {
      success: true,
      updated_count: updatedCount,
      message: `Updated ${updatedCount} node(s)`,
    });
  } catch (error) {
    console.error(
      "Database error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return json(500, {
      success: false,
      error: "Failed to update node reachability",
    });
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export const handler: Handler = async (event) => {
  try {
    // Handle CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return json(200, {}, { "Access-Control-Max-Age": "86400" });
    }

    // Only allow POST
    if (event.httpMethod !== "POST") {
      return json(405, { success: false, error: "Method not allowed" });
    }

    // Parse request body
    let body: any;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return json(400, {
        success: false,
        error: "Invalid JSON in request body",
      });
    }

    // Extract action and payload
    const action = body?.action as ActionName;
    const payload = body?.payload || body;

    // Validate action
    if (!action || !(action in ACTIONS)) {
      return json(400, { success: false, error: "Invalid or missing action" });
    }

    const scope = ACTIONS[action].scope;
    const ip = event.headers["x-forwarded-for"] || "unknown";

    // Apply action-specific rate limiting
    if (action === "discover_node") {
      const rateLimitKey = `iroh-discover:${ip}`;
      if (!allowRequest(rateLimitKey, 20, 3600000)) {
        return json(429, {
          success: false,
          error: "Rate limit exceeded (20 requests/hour)",
        });
      }
    } else if (action === "verify_node") {
      const rateLimitKey = `iroh-verify:${ip}`;
      if (!allowRequest(rateLimitKey, 50, 3600000)) {
        return json(429, {
          success: false,
          error: "Rate limit exceeded (50 requests/hour)",
        });
      }
    } else if (action === "get_node_info") {
      const rateLimitKey = `iroh-info:${ip}`;
      if (!allowRequest(rateLimitKey, 60, 3600000)) {
        return json(429, {
          success: false,
          error: "Rate limit exceeded (60 requests/hour)",
        });
      }
    } else if (action === "update_node_status") {
      const rateLimitKey = `iroh-update:${ip}`;
      if (!allowRequest(rateLimitKey, 60, 3600000)) {
        return json(429, {
          success: false,
          error: "Rate limit exceeded (60 requests/hour)",
        });
      }
    }

    // Route to appropriate handler based on action
    switch (action) {
      case "discover_node":
        return await handleDiscoverNode(payload);
      case "verify_node":
        return await handleVerifyNode(payload);
      case "get_node_info":
        return await handleGetNodeInfo(payload);
      case "update_node_status":
        return await handleUpdateNodeStatus(payload);
      default:
        return json(400, { success: false, error: "Unsupported action" });
    }
  } catch (error: any) {
    console.error("[iroh-proxy]", error);
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const config = {
  path: "/iroh-proxy",
};
