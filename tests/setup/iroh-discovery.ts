/**
 * Iroh Node Discovery Helpers for Integration Tests
 * Phase 2 Week 3: Real Integration Testing
 *
 * Provides helpers for discovering and verifying real Iroh nodes
 * via DHT. Uses actual iroh-proxy endpoint.
 *
 * Usage:
 * ```typescript
 * const discovery = await discoverIrohNode(nodeId, verificationId);
 * const verification = await verifyIrohNode(nodeId);
 * const info = await getIrohNodeInfo(nodeId);
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export interface IrohDiscoveryRequest {
  verification_id: string;
  node_id?: string;
}

export interface IrohDiscoveryResponse {
  success: boolean;
  node_id: string;
  relay_url: string | null;
  direct_addresses: string[] | null;
  is_reachable: boolean;
  discovered_at: number;
  error?: string;
}

export interface IrohVerifyRequest {
  node_id: string;
}

export interface IrohVerifyResponse {
  success: boolean;
  is_reachable: boolean;
  relay_url: string | null;
  direct_addresses: string[] | null;
  last_seen: number;
  cached: boolean;
  error?: string;
}

export interface IrohNodeInfo {
  node_id: string;
  relay_url?: string;
  direct_addresses?: string[];
  is_reachable?: boolean;
  last_seen?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const IROH_PROXY_ENDPOINT = "/.netlify/functions/iroh-proxy";
const REQUEST_TIMEOUT = 10000; // 10 seconds

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Fetch with timeout for Iroh proxy requests
 */
async function fetchWithTimeout(
  action: string,
  payload: any
): Promise<Response> {
  return Promise.race([
    fetch(IROH_PROXY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    }),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), REQUEST_TIMEOUT)
    ),
  ]);
}

// ============================================================================
// NODE DISCOVERY
// ============================================================================

/**
 * Discover an Iroh node via DHT
 */
export async function discoverIrohNode(
  nodeId: string,
  verificationId?: string
): Promise<IrohDiscoveryResponse> {
  const request: IrohDiscoveryRequest = {
    verification_id: verificationId || `test-verification-${Date.now()}`,
    node_id: nodeId,
  };

  try {
    const response = await fetchWithTimeout("discover_node", request);

    if (!response.ok) {
      return {
        success: false,
        node_id: nodeId,
        relay_url: null,
        direct_addresses: null,
        is_reachable: false,
        discovered_at: Math.floor(Date.now() / 1000),
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    return {
      success: false,
      node_id: nodeId,
      relay_url: null,
      direct_addresses: null,
      is_reachable: false,
      discovered_at: Math.floor(Date.now() / 1000),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// NODE VERIFICATION
// ============================================================================

/**
 * Verify Iroh node reachability
 */
export async function verifyIrohNode(
  nodeId: string
): Promise<IrohVerifyResponse> {
  const request: IrohVerifyRequest = { node_id: nodeId };

  try {
    const response = await fetchWithTimeout("verify_node", request);

    if (!response.ok) {
      return {
        success: false,
        is_reachable: false,
        relay_url: null,
        direct_addresses: null,
        last_seen: Math.floor(Date.now() / 1000),
        cached: false,
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    return {
      success: false,
      is_reachable: false,
      relay_url: null,
      direct_addresses: null,
      last_seen: Math.floor(Date.now() / 1000),
      cached: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// NODE INFORMATION
// ============================================================================

/**
 * Get Iroh node information from database
 */
export async function getIrohNodeInfo(
  nodeId: string
): Promise<IrohNodeInfo | null> {
  try {
    const response = await fetchWithTimeout("get_node_info", {
      node_id: nodeId,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data && typeof data.success === "boolean" && data.success) {
      return data.node_info || null;
    }
    return null;
  } catch (error) {
    console.warn("Failed to get node info:", error);
    return null;
  }
}

// ============================================================================
// NODE VALIDATION
// ============================================================================

/**
 * Validate Iroh node ID format (base32, 52 characters)
 */
export function isValidNodeId(nodeId: string): boolean {
  return /^[a-z2-7]{52}$/.test(nodeId);
}

/**
 * Generate a valid test node ID
 */
export function generateTestNodeId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz234567";
  let nodeId = "";
  for (let i = 0; i < 52; i++) {
    nodeId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nodeId;
}

/**
 * Validate discovery response structure
 */
export function isValidDiscoveryResponse(
  response: any
): response is IrohDiscoveryResponse {
  return (
    response &&
    typeof response.success === "boolean" &&
    typeof response.node_id === "string" &&
    (response.relay_url === null || typeof response.relay_url === "string") &&
    (response.direct_addresses === null ||
      Array.isArray(response.direct_addresses)) &&
    typeof response.is_reachable === "boolean" &&
    typeof response.discovered_at === "number"
  );
}

/**
 * Validate verification response structure
 */
export function isValidVerifyResponse(
  response: any
): response is IrohVerifyResponse {
  return (
    response &&
    typeof response.success === "boolean" &&
    typeof response.is_reachable === "boolean" &&
    (response.relay_url === null || typeof response.relay_url === "string") &&
    (response.direct_addresses === null ||
      Array.isArray(response.direct_addresses)) &&
    typeof response.last_seen === "number" &&
    typeof response.cached === "boolean"
  );
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Discover multiple Iroh nodes
 */
export async function discoverMultipleNodes(
  nodeIds: string[]
): Promise<IrohDiscoveryResponse[]> {
  return Promise.all(nodeIds.map((id) => discoverIrohNode(id)));
}

/**
 * Verify multiple Iroh nodes
 */
export async function verifyMultipleNodes(
  nodeIds: string[]
): Promise<IrohVerifyResponse[]> {
  return Promise.all(nodeIds.map((id) => verifyIrohNode(id)));
}
