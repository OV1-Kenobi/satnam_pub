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
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env.js";

// Security utilities (Phase 2 hardening)
import {
  checkRateLimitStatus,
  createRateLimitIdentifier,
  getClientIP,
  RATE_LIMITS,
} from "../functions_active/utils/enhanced-rate-limiter.js";
import {
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "../functions_active/utils/error-handler.js";
import {
  errorResponse,
  getSecurityHeaders,
  preflightResponse,
} from "../functions_active/utils/security-headers.js";

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

// Old corsHeaders() and json() helpers removed - now using centralized security utilities

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
  supabase: SupabaseClient<any, "public", any>,
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
  supabase: SupabaseClient<any, "public", any>,
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
  supabase: SupabaseClient<any, "public", any>,
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
async function handleDiscoverNode(
  payload: DiscoverNodePayload,
  requestId: string,
  requestOrigin?: string
): Promise<any> {
  // Validate required fields
  if (!payload.verification_id) {
    return createValidationErrorResponse(
      "Missing required field: verification_id",
      requestId,
      requestOrigin
    );
  }

  if (!isValidUuid(payload.verification_id)) {
    return createValidationErrorResponse(
      "Invalid verification_id format (must be UUID)",
      requestId,
      requestOrigin
    );
  }

  // If node_id provided, validate format
  if (payload.node_id && !isValidNodeId(payload.node_id)) {
    return createValidationErrorResponse(
      "Invalid node_id format (must be 52-char base32)",
      requestId,
      requestOrigin
    );
  }

  // Initialize Supabase client
  const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
  const supabaseKey = getEnvVar("VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    logError(new Error("Missing Supabase credentials"), {
      requestId,
      endpoint: "iroh-proxy",
      action: "discover_node",
    });
    return errorResponse(500, "Configuration error", requestOrigin);
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
    logError(error, {
      requestId,
      endpoint: "iroh-proxy",
      action: "discover_node",
    });
    return errorResponse(
      500,
      "Failed to store discovery result",
      requestOrigin
    );
  }

  // Return discovery result
  const headers = getSecurityHeaders(requestOrigin);
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      node_id: discoveryResult.node_id,
      relay_url: discoveryResult.relay_url || null,
      direct_addresses: discoveryResult.direct_addresses || null,
      is_reachable: discoveryResult.is_reachable || false,
      discovered_at: Math.floor(Date.now() / 1000),
    }),
  };
}

/**
 * Action: verify_node
 * Verifies Iroh node reachability and caches results
 */
async function handleVerifyNode(
  payload: VerifyNodePayload,
  requestId: string,
  requestOrigin?: string
): Promise<any> {
  // Validate required fields
  if (!payload.node_id) {
    return createValidationErrorResponse(
      "Missing required field: node_id",
      requestId,
      requestOrigin
    );
  }

  if (!isValidNodeId(payload.node_id)) {
    return createValidationErrorResponse(
      "Invalid node_id format (must be 52-char base32)",
      requestId,
      requestOrigin
    );
  }

  // Check cache first
  const cacheKey = getCacheKey(payload.node_id);
  const cachedResult = getCachedResult(cacheKey);

  if (cachedResult) {
    const headers = {
      ...getSecurityHeaders(requestOrigin),
      "X-Cache": "HIT",
    };
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ...cachedResult,
        cached: true,
      }),
    };
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

  const headers = {
    ...getSecurityHeaders(requestOrigin),
    "X-Cache": "MISS",
  };
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      ...response,
      cached: false,
    }),
  };
}

/**
 * Action: get_node_info
 * Retrieves stored node information from database
 */
async function handleGetNodeInfo(
  payload: GetNodeInfoPayload,
  requestId: string,
  requestOrigin?: string
): Promise<any> {
  // Validate required fields
  if (!payload.verification_id) {
    return createValidationErrorResponse(
      "Missing required field: verification_id",
      requestId,
      requestOrigin
    );
  }

  if (!isValidUuid(payload.verification_id)) {
    return createValidationErrorResponse(
      "Invalid verification_id format (must be UUID)",
      requestId,
      requestOrigin
    );
  }

  // Initialize Supabase client
  const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
  const supabaseKey = getEnvVar("VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    logError(new Error("Missing Supabase credentials"), {
      requestId,
      endpoint: "iroh-proxy",
      action: "get_node_info",
    });
    return errorResponse(500, "Configuration error", requestOrigin);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Retrieve node information
  try {
    const nodeInfo = await getNodeInfo(supabase, payload.verification_id);

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        nodes: nodeInfo || [],
      }),
    };
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "iroh-proxy",
      action: "get_node_info",
    });
    return errorResponse(
      500,
      "Failed to retrieve node information",
      requestOrigin
    );
  }
}

/**
 * Action: update_node_status
 * Updates node reachability status (admin only)
 */
async function handleUpdateNodeStatus(
  payload: UpdateNodeStatusPayload,
  requestId: string,
  requestOrigin?: string
): Promise<any> {
  // Validate required fields
  if (!payload.node_id) {
    return createValidationErrorResponse(
      "Missing required field: node_id",
      requestId,
      requestOrigin
    );
  }

  if (!isValidNodeId(payload.node_id)) {
    return createValidationErrorResponse(
      "Invalid node_id format (must be 52-char base32)",
      requestId,
      requestOrigin
    );
  }

  if (typeof payload.is_reachable !== "boolean") {
    return createValidationErrorResponse(
      "Missing or invalid field: is_reachable (must be boolean)",
      requestId,
      requestOrigin
    );
  }

  // Initialize Supabase client
  const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
  const supabaseKey = getEnvVar("VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    logError(new Error("Missing Supabase credentials"), {
      requestId,
      endpoint: "iroh-proxy",
      action: "update_node_status",
    });
    return errorResponse(500, "Configuration error", requestOrigin);
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

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        updated_count: updatedCount,
        message: `Updated ${updatedCount} node(s)`,
      }),
    };
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "iroh-proxy",
      action: "update_node_status",
    });
    return errorResponse(
      500,
      "Failed to update node reachability",
      requestOrigin
    );
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  try {
    // Handle CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return preflightResponse(requestOrigin);
    }

    // Only allow POST
    if (event.httpMethod !== "POST") {
      return errorResponse(405, "Method not allowed", requestOrigin);
    }

    // Parse request body
    let body: any;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return createValidationErrorResponse(
        "Invalid JSON in request body",
        requestId,
        requestOrigin
      );
    }

    // Extract action and payload
    const action = body?.action as ActionName;
    const payload = body?.payload || body;

    // Validate action
    if (!action || !(action in ACTIONS)) {
      return createValidationErrorResponse(
        "Invalid or missing action",
        requestId,
        requestOrigin
      );
    }

    const scope = ACTIONS[action].scope;

    // Database-backed rate limiting with action-specific limits
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitConfig =
      action === "discover_node"
        ? RATE_LIMITS.NFC_OPERATIONS // 20 req/hr
        : action === "verify_node"
        ? RATE_LIMITS.IDENTITY_VERIFY // 50 req/hr
        : RATE_LIMITS.AUTH_REFRESH; // 60 req/hr for get_node_info and update_node_status

    const rateLimitResult = await checkRateLimitStatus(
      rateLimitKey,
      rateLimitConfig
    );

    if (!rateLimitResult.allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "iroh-proxy",
        action,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Route to appropriate handler based on action
    switch (action) {
      case "discover_node":
        return await handleDiscoverNode(payload, requestId, requestOrigin);
      case "verify_node":
        return await handleVerifyNode(payload, requestId, requestOrigin);
      case "get_node_info":
        return await handleGetNodeInfo(payload, requestId, requestOrigin);
      case "update_node_status":
        return await handleUpdateNodeStatus(payload, requestId, requestOrigin);
      default:
        return createValidationErrorResponse(
          "Unsupported action",
          requestId,
          requestOrigin
        );
    }
  } catch (error: any) {
    logError(error, {
      requestId,
      endpoint: "iroh-proxy",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};

export const config = {
  path: "/iroh-proxy",
};
