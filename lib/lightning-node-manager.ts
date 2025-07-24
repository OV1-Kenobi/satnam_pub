/**
 * CRITICAL SECURITY: Multi-Node Lightning Network Manager for Bitcoin Banking Platform
 * Manages multiple Lightning node types with proper security validation and failover
 */

import { lightningConfig } from "../config/index.js";

/**
 * CRITICAL SECURITY: Master Context environment variable access pattern
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = import.meta as { env?: Record<string, string> };
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

export type LightningNodeType =
  | "voltage"
  | "phoenixd"
  | "breez"
  | "nwc"
  | "self-hosted";

export interface LightningNodeConfig {
  type: LightningNodeType;
  name: string;
  url: string;
  macaroon?: string;
  certPath?: string;
  connectionString?: string;
  isActive: boolean;
  isSecure: boolean;
  priority: number;
}

export interface NodeHealthStatus {
  nodeType: LightningNodeType;
  connected: boolean;
  latency?: number;
  blockHeight?: number;
  channels?: number;
  balance?: number;
  error?: string;
  lastChecked: Date;
}

export interface PaymentRouting {
  preferredNode: LightningNodeType;
  fallbackNodes: LightningNodeType[];
  reason: string;
}

/**
 * CRITICAL SECURITY: Multi-Node Lightning Network Manager
 * Handles node selection, health monitoring, and secure operations across all node types
 */
export class LightningNodeManager {
  private nodes: Map<LightningNodeType, LightningNodeConfig>;
  private healthStatus: Map<LightningNodeType, NodeHealthStatus>;

  constructor() {
    this.nodes = new Map();
    this.healthStatus = new Map();
    this.initializeNodes();
  }

  /**
   * CRITICAL SECURITY: Initialize all Lightning node configurations
   */
  private initializeNodes(): void {
    // Voltage Node (Default Lightning node for general operations)
    const voltageUrl =
      getEnvVar("VOLTAGE_LNBITS_URL") || getEnvVar("VITE_VOLTAGE_LNBITS_URL");
    const voltageKey =
      getEnvVar("VOLTAGE_LNBITS_ADMIN_KEY") ||
      getEnvVar("VITE_VOLTAGE_LNBITS_ADMIN_KEY");

    if (voltageUrl && voltageKey) {
      this.nodes.set("voltage", {
        type: "voltage",
        name: "Voltage LNBits",
        url: voltageUrl,
        macaroon: voltageKey,
        isActive: true,
        isSecure: voltageUrl.startsWith("https://"),
        priority: 1,
      });
    }

    // PhoenixD Node (Internal family-to-family payments)
    const phoenixdUrl = getEnvVar("PHOENIXD_NODE_URL");
    const phoenixdMacaroon = getEnvVar("PHOENIXD_MACAROON");

    if (phoenixdUrl && phoenixdMacaroon) {
      this.nodes.set("phoenixd", {
        type: "phoenixd",
        name: "PhoenixD Internal",
        url: phoenixdUrl,
        macaroon: phoenixdMacaroon,
        isActive: true,
        isSecure: phoenixdUrl.startsWith("https://"),
        priority: 2,
      });
    }

    // Breez Node (Custodial external wallet)
    const breezConfig = getEnvVar("BREEZ_NODE_CONFIG");

    if (breezConfig) {
      try {
        const config = JSON.parse(breezConfig);
        this.nodes.set("breez", {
          type: "breez",
          name: "Breez Custodial",
          url: config.url || "https://breez.technology",
          connectionString: breezConfig,
          isActive: true,
          isSecure: true,
          priority: 3,
        });
      } catch (error) {
        console.error("Failed to parse Breez configuration:", error);
      }
    }

    // NWC Nodes (User's Nostr Wallet Connect wallets)
    const nwcConnections = getEnvVar("NWC_CONNECTION_STRINGS");

    if (nwcConnections) {
      this.nodes.set("nwc", {
        type: "nwc",
        name: "NWC User Wallets",
        url: "nostr+walletconnect://",
        connectionString: nwcConnections,
        isActive: true,
        isSecure: true,
        priority: 4,
      });
    }

    // Self-Hosted Node (Legacy support)
    const selfHostedUrl =
      lightningConfig.nodeUrl || getEnvVar("LIGHTNING_NODE_URL");
    const selfHostedMacaroon =
      lightningConfig.macaroon || getEnvVar("LIGHTNING_MACAROON");

    if (selfHostedUrl && selfHostedMacaroon) {
      this.nodes.set("self-hosted", {
        type: "self-hosted",
        name: "Self-Hosted Node",
        url: selfHostedUrl,
        macaroon: selfHostedMacaroon,
        certPath: lightningConfig.certPath || getEnvVar("LIGHTNING_CERT_PATH"),
        isActive: true,
        isSecure: selfHostedUrl.startsWith("https://"),
        priority: 5,
      });
    }
  }

  /**
   * CRITICAL SECURITY: Get optimal node for payment routing
   * Selects appropriate node based on payment type and destination
   */
  getOptimalNodeForPayment(
    isInternalPayment: boolean,
    isFamilyPayment: boolean,
    amount: number,
    paymentType?: string
  ): PaymentRouting {
    const availableNodes = Array.from(this.nodes.values())
      .filter((node) => node.isActive)
      .sort((a, b) => a.priority - b.priority);

    if (availableNodes.length === 0) {
      throw new Error("No active Lightning nodes available");
    }

    // Enhanced node selection based on payment type
    if (paymentType) {
      switch (paymentType) {
        case "P2P_INTERNAL_LIGHTNING":
          const phoenixdInternal = availableNodes.find(
            (node) => node.type === "phoenixd"
          );
          if (phoenixdInternal) {
            return {
              preferredNode: "phoenixd",
              fallbackNodes: ["voltage", "self-hosted"],
              reason:
                "P2P internal Lightning payment - using PhoenixD for privacy",
            };
          }
          break;

        case "P2P_EXTERNAL_LIGHTNING":
          const breezExternal = availableNodes.find(
            (node) => node.type === "breez"
          );
          if (breezExternal) {
            return {
              preferredNode: "breez",
              fallbackNodes: ["voltage", "nwc", "self-hosted"],
              reason:
                "P2P external Lightning payment - using Breez custodial wallet",
            };
          }
          break;

        case "ECASH_FEDIMINT_TO_CASHU":
        case "ECASH_CASHU_TO_FEDIMINT":
        case "ECASH_FEDIMINT_TO_FEDIMINT":
          const phoenixdEcash = availableNodes.find(
            (node) => node.type === "phoenixd"
          );
          if (phoenixdEcash) {
            return {
              preferredNode: "phoenixd",
              fallbackNodes: ["voltage", "self-hosted"],
              reason:
                "Internal eCash bridge operation - using PhoenixD for atomic swaps",
            };
          }
          break;

        case "ECASH_CASHU_EXTERNAL_SWAP":
          const breezSwap = availableNodes.find(
            (node) => node.type === "breez"
          );
          if (breezSwap) {
            return {
              preferredNode: "breez",
              fallbackNodes: ["voltage", "nwc", "self-hosted"],
              reason:
                "External Cashu swap - using Breez for external operations",
            };
          }
          break;
      }
    }

    // Legacy logic for backward compatibility
    // Internal family payments prefer PhoenixD
    if (isInternalPayment && isFamilyPayment) {
      const phoenixd = availableNodes.find((node) => node.type === "phoenixd");
      if (phoenixd) {
        return {
          preferredNode: "phoenixd",
          fallbackNodes: ["voltage", "self-hosted"],
          reason: "Internal family payment - using PhoenixD for privacy",
        };
      }
    }

    // External payments prefer Breez for custodial convenience
    if (!isInternalPayment) {
      const breez = availableNodes.find((node) => node.type === "breez");
      if (breez) {
        return {
          preferredNode: "breez",
          fallbackNodes: ["voltage", "nwc", "self-hosted"],
          reason: "External payment - using Breez custodial wallet",
        };
      }
    }

    // Default to Voltage for general operations
    const voltage = availableNodes.find((node) => node.type === "voltage");
    if (voltage) {
      return {
        preferredNode: "voltage",
        fallbackNodes: ["self-hosted", "phoenixd"],
        reason: "General Lightning operation - using Voltage default",
      };
    }

    // Fallback to first available node
    return {
      preferredNode: availableNodes[0].type,
      fallbackNodes: availableNodes.slice(1).map((node) => node.type),
      reason: "Using first available node as fallback",
    };
  }

  /**
   * Get all configured nodes
   */
  getAllNodes(): LightningNodeConfig[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get specific node configuration
   */
  getNode(nodeType: LightningNodeType): LightningNodeConfig | undefined {
    return this.nodes.get(nodeType);
  }

  /**
   * CRITICAL SECURITY: Validate node security for production
   */
  validateNodeSecurity(nodeType: LightningNodeType): boolean {
    const node = this.nodes.get(nodeType);
    if (!node) return false;

    const environment = getEnvVar("NODE_ENV") || "development";

    if (environment === "production") {
      // All nodes must use HTTPS in production
      if (!node.isSecure) return false;

      // Validate credentials exist and meet minimum requirements
      if (node.macaroon && node.macaroon.length < 16) return false;
      if (node.macaroon === "demo-key") return false;
      if (node.url.includes("demo.lnbits.com")) return false;
    }

    return true;
  }

  /**
   * Get node health status
   */
  getNodeHealth(nodeType: LightningNodeType): NodeHealthStatus | undefined {
    return this.healthStatus.get(nodeType);
  }

  /**
   * Update node health status
   */
  updateNodeHealth(
    nodeType: LightningNodeType,
    status: Partial<NodeHealthStatus>
  ): void {
    const existing = this.healthStatus.get(nodeType) || {
      nodeType,
      connected: false,
      lastChecked: new Date(),
    };

    this.healthStatus.set(nodeType, {
      ...existing,
      ...status,
      lastChecked: new Date(),
    });
  }
}
