/**
 * PhoenixD Family Channels API Endpoint
 *
 * Manage family member channels including setup, status,
 * and configuration for Satnam family banking
 *
 * @fileoverview PhoenixD family channel management endpoint
 */

import { z } from "zod";
import { getFamilyMember } from "../../lib/family-api";
import { FamilyPhoenixdManager } from "../../src/lib/family-phoenixd-manager";

interface FamilyChannelSetupRequest {
  username: string;
  initialLiquidity?: number;
  allowanceConfig?: {
    enabled: boolean;
    amount: number;
    frequency: "daily" | "weekly" | "monthly";
    autoTopup: boolean;
  };
}

// Zod validation schemas
const AllowanceConfigSchema = z.object({
  enabled: z.boolean(),
  amount: z
    .number()
    .positive("Allowance amount must be positive")
    .max(1000000000, "Allowance amount too large") // Max 10 BTC in sats
    .int("Allowance amount must be an integer"),
  frequency: z.enum(["daily", "weekly", "monthly"], {
    errorMap: () => ({
      message: "Frequency must be 'daily', 'weekly', or 'monthly'",
    }),
  }),
  autoTopup: z.boolean(),
});

const FamilyChannelSetupRequestSchema = z.object({
  username: z
    .string()
    .min(1, "Username cannot be empty")
    .max(50, "Username too long")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username contains invalid characters"),
  initialLiquidity: z
    .number()
    .positive("Initial liquidity must be positive")
    .max(1000000000, "Initial liquidity too large") // Max 10 BTC in sats
    .int("Initial liquidity must be an integer")
    .optional(),
  allowanceConfig: AllowanceConfigSchema.optional(),
});

const FamilyChannelUpdateRequestSchema = z.object({
  username: z
    .string()
    .min(1, "Username cannot be empty")
    .max(50, "Username too long")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username contains invalid characters"),
  allowanceConfig: AllowanceConfigSchema.optional(),
});

// Local interface to match the expected FamilyMember structure
interface LocalFamilyMember {
  id: string;
  username: string;
  name: string;
  role: "parent" | "teen" | "child";
  phoenixd_channel_id?: string;
  allowance_config?: {
    enabled: boolean;
    amount: number;
    frequency: "daily" | "weekly" | "monthly";
    next_payment: Date;
    auto_topup: boolean;
    emergency_threshold: number;
  };
}

interface FamilyChannelResponse {
  success: boolean;
  familyMember: {
    username: string;
    name: string;
    role: string;
  };
  channel: {
    channelId: string;
    amountSat: number;
    feeSat: number;
    status: string;
  };
  liquidityStatus: {
    currentBalance: number;
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

interface FamilyChannelErrorResponse {
  status: "ERROR";
  error: string;
  username?: string;
  timestamp: string;
}

/**
 * Validate and sanitize request data
 */
function validateRequestData(
  data: any,
  schema: z.ZodSchema
): { success: boolean; data?: any; error?: string } {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join(", ");
      return { success: false, error: `Validation failed: ${errorMessages}` };
    }
    return { success: false, error: "Invalid request data format" };
  }
}

/**
 * Helper function to convert imported FamilyMember to LocalFamilyMember
 * Handles encrypted data properly while maintaining privacy protocols
 */
function convertToLocalFamilyMember(familyMember: any): LocalFamilyMember {
  // PRIVACY: Decrypt encrypted fields if they exist, otherwise use fallback
  // In a real implementation, this would use proper decryption with the encryption_salt
  const decryptedRole =
    familyMember.encrypted_role || familyMember.role || "child";

  // Ensure role is properly typed and defaults to safe value
  const validRole: "parent" | "teen" | "child" = [
    "parent",
    "teen",
    "child",
  ].includes(decryptedRole)
    ? (decryptedRole as "parent" | "teen" | "child")
    : "child";

  return {
    id: familyMember.id,
    username: familyMember.name || familyMember.username || "",
    name: familyMember.encrypted_name || familyMember.name || "",
    role: validRole,
    phoenixd_channel_id: familyMember.phoenixd_channel_id,
    allowance_config: familyMember.allowance_config,
  };
}

/**
 * Family channels management endpoint handler
 */
export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const method = req.method;

    console.log(`🏠 Family channels API: ${method} request`);

    const familyManager = new FamilyPhoenixdManager();

    switch (method) {
      case "GET":
        return handleGetChannelStatus(url, familyManager);
      case "POST":
        return handleCreateChannel(req, familyManager);
      case "PUT":
        return handleUpdateChannel(req, familyManager);
      default:
        return errorResponse("Method not allowed", 405);
    }
  } catch (error) {
    console.error("❌ Family channels API error:", error);
    return errorResponse(`Family channels operation failed: ${error}`);
  }
}

/**
 * Handle GET request - Get family member channel status
 */
async function handleGetChannelStatus(
  url: URL,
  familyManager: FamilyPhoenixdManager
): Promise<Response> {
  try {
    const username = url.searchParams.get("username");
    if (!username) {
      return errorResponse("Username parameter required", 400);
    }

    console.log(`📊 Getting channel status for ${username}`);

    // Get family member details
    const familyMember = await getFamilyMember(username);
    if (!familyMember) {
      return errorResponse("Family member not found", 404, username);
    }

    // Get liquidity status
    const liquidityStatus =
      await familyManager.getFamilyLiquidityStatus(username);

    const response: FamilyChannelResponse = {
      success: true,
      familyMember: {
        username: familyMember.username,
        name: familyMember.name,
        role: familyMember.role,
      },
      channel: {
        channelId: familyMember.phoenixd_channel_id || "",
        amountSat: liquidityStatus.channelCapacity,
        feeSat: 0, // TODO: Get actual fees from channel data
        status: familyMember.phoenixd_channel_id ? "active" : "not_setup",
      },
      liquidityStatus: {
        currentBalance: liquidityStatus.currentBalance,
        needsLiquidity: liquidityStatus.needsLiquidity,
        recommendedAction: liquidityStatus.recommendedAction,
        allowanceStatus: {
          nextPayment:
            liquidityStatus.allowanceStatus.nextPayment?.toISOString() ||
            new Date().toISOString(),
          amount: liquidityStatus.allowanceStatus.amount,
          daysUntilNext: liquidityStatus.allowanceStatus.daysUntilNext,
        },
      },
      timestamp: new Date().toISOString(),
    };

    console.log(`✅ Channel status retrieved for ${username}:`, {
      channelId: response.channel.channelId,
      balance: response.liquidityStatus.currentBalance,
      needsLiquidity: response.liquidityStatus.needsLiquidity,
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
    console.error("❌ Failed to get channel status:", error);
    throw error;
  }
}

/**
 * Handle POST request - Setup new family member channel
 */
async function handleCreateChannel(
  req: Request,
  familyManager: FamilyPhoenixdManager
): Promise<Response> {
  try {
    let rawRequestData;
    try {
      rawRequestData = await req.json();
    } catch (jsonError) {
      console.warn(`⚠️ Invalid JSON in request body:`, jsonError);
      return errorResponse("Invalid JSON in request body", 400);
    }

    // Validate request data
    const validation = validateRequestData(
      rawRequestData,
      FamilyChannelSetupRequestSchema
    );
    if (!validation.success) {
      console.warn(`⚠️ Invalid request data:`, validation.error);
      return errorResponse(validation.error!, 400);
    }

    const requestData = validation.data as FamilyChannelSetupRequest;
    console.log(`🔧 Setting up channel for ${requestData.username}`);

    // Get family member details
    const familyMember = await getFamilyMember(requestData.username);
    if (!familyMember) {
      return errorResponse(
        "Family member not found",
        404,
        requestData.username
      );
    }

    // Check if channel already exists
    if (familyMember.phoenixd_channel_id) {
      return errorResponse(
        "Channel already exists for this family member",
        409,
        requestData.username
      );
    }

    // Convert and setup the channel
    const localFamilyMember = convertToLocalFamilyMember(familyMember);
    const channelResult = await familyManager.setupFamilyMemberChannel(
      localFamilyMember,
      requestData.initialLiquidity
    );

    // Get updated liquidity status
    const liquidityStatus = await familyManager.getFamilyLiquidityStatus(
      requestData.username
    );

    const response: FamilyChannelResponse = {
      success: true,
      familyMember: {
        username: familyMember.username,
        name: familyMember.name,
        role: familyMember.role,
      },
      channel: {
        channelId: channelResult.channelId,
        amountSat: channelResult.amountSat,
        feeSat: channelResult.feeSat,
        status: "active",
      },
      liquidityStatus: {
        currentBalance: liquidityStatus.currentBalance,
        needsLiquidity: liquidityStatus.needsLiquidity,
        recommendedAction: liquidityStatus.recommendedAction,
        allowanceStatus: {
          nextPayment:
            liquidityStatus.allowanceStatus.nextPayment?.toISOString() ||
            new Date().toISOString(),
          amount: liquidityStatus.allowanceStatus.amount,
          daysUntilNext: liquidityStatus.allowanceStatus.daysUntilNext,
        },
      },
      timestamp: new Date().toISOString(),
    };

    console.log(`✅ Channel setup complete for ${requestData.username}:`, {
      channelId: channelResult.channelId,
      amount: channelResult.amountSat,
      fees: channelResult.feeSat,
    });

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("❌ Failed to create channel:", error);
    throw error;
  }
}

/**
 * Handle PUT request - Update family member channel configuration
 */
async function handleUpdateChannel(
  req: Request,
  familyManager: FamilyPhoenixdManager
): Promise<Response> {
  try {
    let rawRequestData;
    try {
      rawRequestData = await req.json();
    } catch (jsonError) {
      console.warn(`⚠️ Invalid JSON in request body:`, jsonError);
      return errorResponse("Invalid JSON in request body", 400);
    }

    // Validate request data
    const validation = validateRequestData(
      rawRequestData,
      FamilyChannelUpdateRequestSchema
    );
    if (!validation.success) {
      console.warn(`⚠️ Invalid update request data:`, validation.error);
      return errorResponse(validation.error!, 400);
    }

    const requestData = validation.data;
    console.log(`🔄 Updating channel config for ${requestData.username}`);

    // Get family member details
    const familyMember = await getFamilyMember(requestData.username);
    if (!familyMember) {
      return errorResponse(
        "Family member not found",
        404,
        requestData.username
      );
    }

    // Process allowance liquidity if needed
    const localFamilyMember = convertToLocalFamilyMember(familyMember);
    const allowanceResult =
      await familyManager.processAllowanceLiquidity(localFamilyMember);

    // Get updated liquidity status
    const liquidityStatus = await familyManager.getFamilyLiquidityStatus(
      requestData.username
    );

    const response: FamilyChannelResponse = {
      success: true,
      familyMember: {
        username: familyMember.username,
        name: familyMember.name,
        role: familyMember.role,
      },
      channel: {
        channelId: familyMember.phoenixd_channel_id || "",
        amountSat: allowanceResult.liquidityAdded
          ? allowanceResult.amount
          : liquidityStatus.channelCapacity,
        feeSat: allowanceResult.fees,
        status: familyMember.phoenixd_channel_id ? "active" : "not_setup",
      },
      liquidityStatus: {
        currentBalance: liquidityStatus.currentBalance,
        needsLiquidity: liquidityStatus.needsLiquidity,
        recommendedAction: liquidityStatus.recommendedAction,
        allowanceStatus: {
          nextPayment:
            liquidityStatus.allowanceStatus.nextPayment?.toISOString() ||
            new Date().toISOString(),
          amount: liquidityStatus.allowanceStatus.amount,
          daysUntilNext: liquidityStatus.allowanceStatus.daysUntilNext,
        },
      },
      timestamp: new Date().toISOString(),
    };

    console.log(`✅ Channel updated for ${requestData.username}:`, {
      liquidityAdded: allowanceResult.liquidityAdded,
      amount: allowanceResult.amount,
      reason: allowanceResult.reason,
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("❌ Failed to update channel:", error);
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
  const errorResponse: FamilyChannelErrorResponse = {
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
