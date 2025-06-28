/**
 * PhoenixD Liquidity Management API Endpoint
 *
 * Handle automated liquidity management, emergency protocols,
 * and allowance preparation for Satnam family banking
 *
 * @fileoverview PhoenixD liquidity management endpoint
 */

import { getFamilyMember } from "../../lib/family-api";
import { FamilyPhoenixdManager } from "../../src/lib/family-phoenixd-manager";

interface LiquidityRequest {
  username: string;
  type: "allowance" | "emergency" | "manual";
  amount?: number;
  urgency?: "low" | "medium" | "high" | "critical";
  reason?: string;
  maxFees?: number;
}

interface LiquidityStatusRequest {
  username: string;
  includeHistory?: boolean;
}

interface LiquidityResponse {
  success: boolean;
  familyMember: {
    username: string;
    name: string;
    role: string;
  };
  liquidityOperation: {
    type: "allowance" | "emergency" | "manual" | "status_check";
    approved: boolean;
    amount: number;
    fees: number;
    channelId?: string;
    reason: string;
  };
  currentStatus: {
    balance: number;
    channelCapacity: number;
    needsLiquidity: boolean;
    recommendedAction: string;
    allowanceStatus: {
      nextPayment: string;
      amount: number;
      daysUntilNext: number;
    };
  };
  timestamp: string;
}

interface LiquidityErrorResponse {
  status: "ERROR";
  error: string;
  username?: string;
  timestamp: string;
}

/**
 * Liquidity management endpoint handler
 */
export default async function handler(req: Request): Promise<Response> {
  try {
    const method = req.method;

    console.log(`💧 Liquidity management API: ${method} request`);

    const familyManager = new FamilyPhoenixdManager();

    switch (method) {
      case "GET":
        return handleGetLiquidityStatus(req, familyManager);
      case "POST":
        return handleLiquidityRequest(req, familyManager);
      default:
        return errorResponse("Method not allowed", 405);
    }
  } catch (error) {
    console.error("❌ Liquidity management API error:", error);
    return errorResponse(`Liquidity operation failed: ${error}`);
  }
}

/**
 * Handle GET request - Get liquidity status for family member
 */
async function handleGetLiquidityStatus(
  req: Request,
  familyManager: FamilyPhoenixdManager
): Promise<Response> {
  try {
    const url = new URL(req.url);
    const username = url.searchParams.get("username");

    if (!username) {
      return errorResponse("Username parameter required", 400);
    }

    console.log(`📊 Getting liquidity status for ${username}`);

    // Get family member details
    const familyMember = await getFamilyMember(username);
    if (!familyMember) {
      return errorResponse("Family member not found", 404, username);
    }

    // Get comprehensive liquidity status
    const liquidityStatus =
      await familyManager.getFamilyLiquidityStatus(username);

    const response: LiquidityResponse = {
      success: true,
      familyMember: {
        username: familyMember.username,
        name: familyMember.name,
        role: familyMember.role,
      },
      liquidityOperation: {
        type: "status_check",
        approved: true,
        amount: liquidityStatus.currentBalance,
        fees: 0,
        reason: "Status check completed",
      },
      currentStatus: {
        balance: liquidityStatus.currentBalance,
        channelCapacity: liquidityStatus.channelCapacity,
        needsLiquidity: liquidityStatus.needsLiquidity,
        recommendedAction: liquidityStatus.recommendedAction,
        allowanceStatus: {
          nextPayment:
            liquidityStatus.allowanceStatus.nextPayment.toISOString(),
          amount: liquidityStatus.allowanceStatus.amount,
          daysUntilNext: liquidityStatus.allowanceStatus.daysUntilNext,
        },
      },
      timestamp: new Date().toISOString(),
    };

    console.log(`✅ Liquidity status retrieved for ${username}:`, {
      balance: liquidityStatus.currentBalance,
      needsLiquidity: liquidityStatus.needsLiquidity,
      recommendedAction: liquidityStatus.recommendedAction,
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, max-age=30", // Cache for 30 seconds
      },
    });
  } catch (error) {
    console.error("❌ Failed to get liquidity status:", error);
    throw error;
  }
}

/**
 * Handle POST request - Process liquidity request
 */
async function handleLiquidityRequest(
  req: Request,
  familyManager: FamilyPhoenixdManager
): Promise<Response> {
  try {
    const requestData: LiquidityRequest = await req.json();

    if (!requestData.username || !requestData.type) {
      return errorResponse("Username and type required in request body", 400);
    }

    console.log(
      `💰 Processing ${requestData.type} liquidity request for ${requestData.username}`
    );

    // Get family member details
    const familyMember = await getFamilyMember(requestData.username);
    if (!familyMember) {
      return errorResponse(
        "Family member not found",
        404,
        requestData.username
      );
    }

    let liquidityResult: {
      approved: boolean;
      amount: number;
      fees: number;
      channelId?: string;
      message: string;
    };

    // Process different types of liquidity requests
    switch (requestData.type) {
      case "allowance": {
        const allowanceResult =
          await familyManager.processAllowanceLiquidity(familyMember);
        liquidityResult = {
          approved: allowanceResult.liquidityAdded,
          amount: allowanceResult.amount,
          fees: allowanceResult.fees,
          message: allowanceResult.reason,
        };
        break;
      }

      case "emergency": {
        if (
          !requestData.amount ||
          !requestData.urgency ||
          !requestData.reason
        ) {
          return errorResponse(
            "Emergency requests require amount, urgency, and reason",
            400,
            requestData.username
          );
        }

        liquidityResult = await familyManager.handleEmergencyLiquidity({
          familyMember: requestData.username,
          requiredAmount: requestData.amount,
          urgency: requestData.urgency,
          reason: requestData.reason,
          maxFees: requestData.maxFees || 5000, // Default 5k sat max fees
        });
        break;
      }

      case "manual": {
        if (!requestData.amount) {
          return errorResponse(
            "Manual requests require amount",
            400,
            requestData.username
          );
        }

        // For manual requests, treat as emergency with low urgency
        liquidityResult = await familyManager.handleEmergencyLiquidity({
          familyMember: requestData.username,
          requiredAmount: requestData.amount,
          urgency: "low",
          reason: requestData.reason || "Manual liquidity request",
          maxFees: requestData.maxFees || 10000, // Default 10k sat max fees for manual
        });
        break;
      }

      default:
        return errorResponse(
          `Invalid liquidity request type: ${requestData.type}`,
          400,
          requestData.username
        );
    }

    // Get updated liquidity status
    const liquidityStatus = await familyManager.getFamilyLiquidityStatus(
      requestData.username
    );

    const response: LiquidityResponse = {
      success: liquidityResult.approved,
      familyMember: {
        username: familyMember.username,
        name: familyMember.name,
        role: familyMember.role,
      },
      liquidityOperation: {
        type: requestData.type,
        approved: liquidityResult.approved,
        amount: liquidityResult.amount,
        fees: liquidityResult.fees,
        channelId: liquidityResult.channelId,
        reason: liquidityResult.message,
      },
      currentStatus: {
        balance: liquidityStatus.currentBalance,
        channelCapacity: liquidityStatus.channelCapacity,
        needsLiquidity: liquidityStatus.needsLiquidity,
        recommendedAction: liquidityStatus.recommendedAction,
        allowanceStatus: {
          nextPayment:
            liquidityStatus.allowanceStatus.nextPayment.toISOString(),
          amount: liquidityStatus.allowanceStatus.amount,
          daysUntilNext: liquidityStatus.allowanceStatus.daysUntilNext,
        },
      },
      timestamp: new Date().toISOString(),
    };

    const statusCode = liquidityResult.approved ? 200 : 400;

    console.log(
      `${liquidityResult.approved ? "✅" : "❌"} Liquidity request ${liquidityResult.approved ? "approved" : "denied"} for ${requestData.username}:`,
      {
        type: requestData.type,
        amount: liquidityResult.amount,
        fees: liquidityResult.fees,
        reason: liquidityResult.message,
      }
    );

    return new Response(JSON.stringify(response), {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("❌ Failed to process liquidity request:", error);
    throw error;
  }
}

/**
 * Generate error response
 */
function errorResponse(
  error: string,
  status: number = 500,
  username?: string
): Response {
  const errorResponse: LiquidityErrorResponse = {
    status: "ERROR",
    error,
    username,
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
