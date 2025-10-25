/**
 * Iroh Verification Service
 * Phase 2B-2 Week 2: Iroh Integration
 *
 * Provides client-side wrapper around iroh-proxy endpoint for node discovery
 * and verification. Integrates with multi-method verification system as optional
 * 5th verification method (kind:0, PKARR, DNS, SimpleProof, Iroh).
 *
 * Feature Flag: VITE_IROH_ENABLED (default: false, opt-in)
 */

import { clientConfig } from "../config/env.client";

// ============================================================================
// TYPES & INTERFACES
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

export interface IrohNodeInfoRequest {
  verification_id: string;
}

export interface IrohNodeInfoResponse {
  success: boolean;
  nodes: Array<{
    id: string;
    node_id: string;
    relay_url: string | null;
    direct_addresses: any;
    discovered_at: number;
    last_seen: number;
    is_reachable: boolean;
  }>;
  error?: string;
}

// ============================================================================
// IROH VERIFICATION SERVICE
// ============================================================================

export class IrohVerificationService {
  private readonly endpoint = "/.netlify/functions/iroh-proxy";
  private readonly enabled: boolean;

  constructor() {
    // Check if Iroh is enabled via feature flag (default: false, opt-in)
    this.enabled = clientConfig.flags.irohEnabled || false;
  }

  /**
   * Check if Iroh verification is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Discover Iroh node via DHT lookup
   * Action: discover_node
   */
  async discoverNode(
    request: IrohDiscoveryRequest
  ): Promise<IrohDiscoveryResponse> {
    if (!this.enabled) {
      return {
        success: false,
        node_id: request.node_id || "",
        relay_url: null,
        direct_addresses: null,
        is_reachable: false,
        discovered_at: Math.floor(Date.now() / 1000),
        error: "Iroh verification is disabled (feature flag: VITE_IROH_ENABLED)",
      };
    }

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "discover_node",
          payload: request,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          node_id: request.node_id || "",
          relay_url: null,
          direct_addresses: null,
          is_reachable: false,
          discovered_at: Math.floor(Date.now() / 1000),
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Iroh discovery error:", error);
      return {
        success: false,
        node_id: request.node_id || "",
        relay_url: null,
        direct_addresses: null,
        is_reachable: false,
        discovered_at: Math.floor(Date.now() / 1000),
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Verify Iroh node reachability
   * Action: verify_node
   */
  async verifyNode(request: IrohVerifyRequest): Promise<IrohVerifyResponse> {
    if (!this.enabled) {
      return {
        success: false,
        is_reachable: false,
        relay_url: null,
        direct_addresses: null,
        last_seen: Math.floor(Date.now() / 1000),
        cached: false,
        error: "Iroh verification is disabled (feature flag: VITE_IROH_ENABLED)",
      };
    }

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "verify_node",
          payload: request,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          is_reachable: false,
          relay_url: null,
          direct_addresses: null,
          last_seen: Math.floor(Date.now() / 1000),
          cached: false,
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Iroh verification error:", error);
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

  /**
   * Get stored node information
   * Action: get_node_info
   */
  async getNodeInfo(
    request: IrohNodeInfoRequest
  ): Promise<IrohNodeInfoResponse> {
    if (!this.enabled) {
      return {
        success: false,
        nodes: [],
        error: "Iroh verification is disabled (feature flag: VITE_IROH_ENABLED)",
      };
    }

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "get_node_info",
          payload: request,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          nodes: [],
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Iroh get node info error:", error);
      return {
        success: false,
        nodes: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Extract Iroh node ID from kind:0 metadata (if present)
   * Looks for "iroh_node_id" field in metadata
   */
  extractNodeIdFromMetadata(metadata: any): string | null {
    if (!metadata || typeof metadata !== "object") {
      return null;
    }

    // Check for iroh_node_id field
    if (typeof metadata.iroh_node_id === "string") {
      return metadata.iroh_node_id;
    }

    // Check for iroh field with node_id
    if (
      metadata.iroh &&
      typeof metadata.iroh === "object" &&
      typeof metadata.iroh.node_id === "string"
    ) {
      return metadata.iroh.node_id;
    }

    return null;
  }
}

// Export singleton instance
export const irohVerificationService = new IrohVerificationService();

