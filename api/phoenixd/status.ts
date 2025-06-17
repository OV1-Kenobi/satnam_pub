/**
 * PhoenixD Status API Endpoint
 *
 * Get PhoenixD node status, balance, and health information
 * for Satnam family banking dashboard
 *
 * @fileoverview PhoenixD node status endpoint
 */

import { FamilyPhoenixdManager } from "../../src/lib/family-phoenixd-manager";
import { PhoenixdClient } from "../../src/lib/phoenixd-client";

interface PhoenixdStatusResponse {
  status: "healthy" | "degraded" | "unhealthy";
  nodeInfo: {
    nodeId: string;
    alias: string;
    blockHeight: number;
    version: string;
    network: string;
  };
  balance: {
    balanceSat: number;
    feeCreditSat: number;
    totalSat: number;
  };
  channels: {
    total: number;
    active: number;
    totalLiquidity: number;
  };
  familyBanking: {
    enabled: boolean;
    privacyEnabled: boolean;
    ready: boolean;
  };
  timestamp: string;
}

interface PhoenixdErrorResponse {
  status: "ERROR";
  error: string;
  timestamp: string;
}

/**
 * PhoenixD status endpoint handler
 */
export default async function handler(req: Request): Promise<Response> {
  try {
    // Only allow GET requests
    if (req.method !== "GET") {
      return errorResponse("Method not allowed", 405);
    }

    console.log("📊 Getting PhoenixD status...");

    const phoenixdClient = new PhoenixdClient();
    const familyManager = new FamilyPhoenixdManager();

    // Get comprehensive status information
    const [nodeStatus, serviceHealth] = await Promise.all([
      phoenixdClient.getFamilyNodeStatus(),
      familyManager.checkServiceHealth(),
    ]);

    // Determine overall health status
    let overallStatus: PhoenixdStatusResponse["status"] = "healthy";
    if (!serviceHealth.familyBankingReady) {
      overallStatus = "unhealthy";
    } else if (!serviceHealth.privacyHealthy) {
      overallStatus = "degraded";
    }

    const statusResponse: PhoenixdStatusResponse = {
      status: overallStatus,
      nodeInfo: {
        nodeId: nodeStatus.nodeInfo.nodeId,
        alias: nodeStatus.nodeInfo.alias,
        blockHeight: nodeStatus.nodeInfo.blockHeight,
        version: nodeStatus.nodeInfo.version,
        network: nodeStatus.nodeInfo.network,
      },
      balance: {
        balanceSat: nodeStatus.balance.balanceSat,
        feeCreditSat: nodeStatus.balance.feeCreditSat,
        totalSat:
          nodeStatus.balance.balanceSat + nodeStatus.balance.feeCreditSat,
      },
      channels: {
        total: nodeStatus.channels.length,
        active: nodeStatus.activeChannels,
        totalLiquidity: nodeStatus.totalLiquidity,
      },
      familyBanking: {
        enabled: phoenixdClient.getConfig().familyEnabled,
        privacyEnabled: serviceHealth.privacyHealthy,
        ready: serviceHealth.familyBankingReady,
      },
      timestamp: new Date().toISOString(),
    };

    console.log("✅ PhoenixD status retrieved:", {
      status: overallStatus,
      balance: statusResponse.balance.totalSat,
      channels: statusResponse.channels.total,
      familyReady: statusResponse.familyBanking.ready,
    });

    return new Response(JSON.stringify(statusResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, max-age=10", // Cache for 10 seconds max
      },
    });
  } catch (error) {
    console.error("❌ PhoenixD status error:", error);
    return errorResponse(`Failed to get PhoenixD status: ${error}`);
  }
}

/**
 * Generate error response
 */
function errorResponse(error: string, status: number = 500): Response {
  const errorResponse: PhoenixdErrorResponse = {
    status: "ERROR",
    error,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
