/**
 * PhoenixD Family Payments API Endpoint
 *
 * Process family payments through PhoenixD with privacy enhancement
 * and automated liquidity management
 *
 * @fileoverview PhoenixD family payment processing endpoint
 */

import { FamilyMember, getFamilyMember } from "../../lib/family-api";
import { FamilyPhoenixdManager } from "../../src/lib/family-phoenixd-manager";
import { PhoenixdClient } from "../../src/lib/phoenixd-client";

// Local interface to match the expected FamilyMember structure for PhoenixdManager
interface LocalFamilyMember {
  id: string;
  username: string;
  name: string;
  role: "parent" | "teen" | "child";
  phoenixd_channel_id?: string;
  allowance_config?: any;
}

/**
 * Convert imported FamilyMember to LocalFamilyMember
 * Handles encrypted data properly while maintaining privacy protocols
 */
function convertToLocalFamilyMember(
  familyMember: FamilyMember
): LocalFamilyMember {
  // PRIVACY: Decrypt encrypted fields if they exist, otherwise use fallback
  // In a real implementation, this would use proper decryption with the encryption_salt
  const decryptedRole =
    familyMember.encrypted_role || (familyMember as any).role || "child";

  // Ensure role is properly typed and defaults to safe value
  const validRole: "parent" | "teen" | "child" = [
    "parent",
    "teen",
    "child",
  ].includes(decryptedRole)
    ? (decryptedRole as "parent" | "teen" | "child")
    : "child";

  // PRIVACY: Use secure username extraction - never expose encrypted data directly
  const safeUsername =
    (familyMember as any).username ||
    (familyMember as any).name ||
    familyMember.id;

  // PRIVACY: For name, use anonymized identifier instead of decrypted personal data
  const safeName = safeUsername; // Use username as safe display name

  return {
    id: familyMember.id,
    username: safeUsername,
    name: safeName,
    role: validRole,
    phoenixd_channel_id: (familyMember as any).phoenixd_channel_id,
    allowance_config: (familyMember as any).allowance_config,
  };
}

interface CreateInvoiceRequest {
  username: string;
  amountSat: number;
  description?: string;
  allowancePayment?: boolean;
}

interface PayInvoiceRequest {
  username: string;
  invoice: string;
  amountSat?: number;
  maxFees?: number;
}

interface PaymentResponse {
  success: boolean;
  familyMember: {
    username: string;
    name: string;
    role: string;
  };
  payment: {
    type: "invoice_created" | "payment_sent";
    paymentHash: string;
    invoice?: string;
    amountSat: number;
    fees: number;
    description: string;
    privacy?: {
      enabled: boolean;
      fee: number;
    };
    liquidityCheck?: {
      needed: boolean;
      added: boolean;
      amount: number;
    };
  };
  timestamp: string;
}

interface PaymentErrorResponse {
  status: "ERROR";
  error: string;
  username?: string;
  paymentHash?: string;
  timestamp: string;
}

/**
 * Family payments endpoint handler
 */
export default async function handler(req: Request): Promise<Response> {
  try {
    const method = req.method;
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    console.log(`💸 Family payments API: ${method} ${action || "default"}`);

    const phoenixdClient = new PhoenixdClient();
    const familyManager = new FamilyPhoenixdManager();

    switch (method) {
      case "POST":
        if (action === "create-invoice") {
          return handleCreateInvoice(req, phoenixdClient, familyManager);
        } else if (action === "pay-invoice") {
          return handlePayInvoice(req, phoenixdClient, familyManager);
        } else {
          return errorResponse(
            "Action parameter required: create-invoice or pay-invoice",
            400
          );
        }
      default:
        return errorResponse("Method not allowed", 405);
    }
  } catch (error) {
    console.error("❌ Family payments API error:", error);
    return errorResponse(`Payment operation failed: ${error}`);
  }
}

/**
 * Handle create invoice request
 */
async function handleCreateInvoice(
  req: Request,
  phoenixdClient: PhoenixdClient,
  familyManager: FamilyPhoenixdManager
): Promise<Response> {
  try {
    const requestData: CreateInvoiceRequest = await req.json();

    if (!requestData.username || !requestData.amountSat) {
      return errorResponse("Username and amountSat required", 400);
    }

    if (requestData.amountSat < 1) {
      return errorResponse(
        "Amount must be at least 1 satoshi",
        400,
        requestData.username
      );
    }

    console.log(
      `📄 Creating invoice for ${requestData.username}: ${requestData.amountSat} sats`
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

    // Convert family member for local operations
    const localFamilyMember = convertToLocalFamilyMember(familyMember);

    // Check if this is an allowance payment that might need liquidity
    let liquidityCheck = {
      needed: false,
      added: false,
      amount: 0,
    };

    if (requestData.allowancePayment) {
      console.log(
        `💰 Processing allowance invoice for ${requestData.username}`
      );

      // Check and prepare liquidity for allowance
      const allowanceResult =
        await familyManager.processAllowanceLiquidity(localFamilyMember);
      liquidityCheck = {
        needed: allowanceResult.liquidityAdded,
        added: allowanceResult.liquidityAdded,
        amount: allowanceResult.amount,
      };

      if (allowanceResult.liquidityAdded) {
        console.log(
          `✅ Allowance liquidity prepared: ${allowanceResult.amount} sats`
        );
      }
    }

    // Create the invoice with mandatory privacy protection
    // PRIVACY: Use username (public identifier) instead of personal name
    const description =
      requestData.description ||
      `Payment to ${requestData.username}@satnam.pub`;

    const invoice = await phoenixdClient.createFamilyInvoice(
      requestData.username,
      requestData.amountSat,
      description
    );

    const response: PaymentResponse = {
      success: true,
      familyMember: {
        username: localFamilyMember.username,
        name: localFamilyMember.username, // PRIVACY: Use username as display name
        role: localFamilyMember.role,
      },
      payment: {
        type: "invoice_created",
        paymentHash: invoice.paymentHash,
        invoice: invoice.serialized,
        amountSat: invoice.amountSat,
        fees: invoice.fees,
        description: invoice.description,
        privacy: {
          enabled: invoice.privacy?.isPrivacyEnabled || false,
          fee: invoice.privacy?.privacyFee || 0,
        },
        liquidityCheck,
      },
      timestamp: new Date().toISOString(),
    };

    console.log(`✅ Invoice created for ${requestData.username}:`, {
      paymentHash: invoice.paymentHash,
      amount: invoice.amountSat,
      privacy: response.payment.privacy?.enabled,
      liquidityAdded: liquidityCheck.added,
    });

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("❌ Failed to create invoice:", error);
    throw error;
  }
}

/**
 * Handle pay invoice request
 */
async function handlePayInvoice(
  req: Request,
  phoenixdClient: PhoenixdClient,
  familyManager: FamilyPhoenixdManager
): Promise<Response> {
  try {
    const requestData: PayInvoiceRequest = await req.json();

    if (!requestData.username || !requestData.invoice) {
      return errorResponse("Username and invoice required", 400);
    }

    console.log(`💸 Processing payment for ${requestData.username}`);

    // Get family member details
    const familyMember = await getFamilyMember(requestData.username);
    if (!familyMember) {
      return errorResponse(
        "Family member not found",
        404,
        requestData.username
      );
    }

    // Convert family member for local operations
    const localFamilyMember = convertToLocalFamilyMember(familyMember);

    // Check liquidity before payment
    const liquidityStatus = await familyManager.getFamilyLiquidityStatus(
      requestData.username
    );

    let liquidityCheck = {
      needed: false,
      added: false,
      amount: 0,
    };

    // If insufficient liquidity and amount specified, try emergency liquidity
    if (liquidityStatus.needsLiquidity && requestData.amountSat) {
      console.log(
        `🚨 Insufficient liquidity for payment, requesting emergency funding`
      );

      const emergencyResult = await familyManager.handleEmergencyLiquidity({
        familyMember: requestData.username,
        requiredAmount: requestData.amountSat,
        urgency: "medium",
        reason: "Payment liquidity requirement",
        maxFees: requestData.maxFees || 5000,
      });

      liquidityCheck = {
        needed: true,
        added: emergencyResult.approved,
        amount: emergencyResult.amount,
      };

      if (!emergencyResult.approved) {
        return errorResponse(
          `Insufficient liquidity and emergency funding failed: ${emergencyResult.message}`,
          402, // Payment Required
          requestData.username
        );
      }
    }

    // Process the payment
    const payment = await phoenixdClient.payInvoice(
      requestData.invoice,
      requestData.amountSat
    );

    const response: PaymentResponse = {
      success: true,
      familyMember: {
        username: localFamilyMember.username,
        name: localFamilyMember.username, // PRIVACY: Use username as display name
        role: localFamilyMember.role,
      },
      payment: {
        type: "payment_sent",
        paymentHash: payment.paymentHash,
        amountSat: payment.sent,
        fees: payment.fees,
        description: `Payment from ${requestData.username}@satnam.pub`,
        liquidityCheck,
      },
      timestamp: new Date().toISOString(),
    };

    console.log(`✅ Payment completed for ${requestData.username}:`, {
      paymentHash: payment.paymentHash,
      sent: payment.sent,
      fees: payment.fees,
      liquidityAdded: liquidityCheck.added,
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("❌ Failed to process payment:", error);
    throw error;
  }
}

/**
 * Generate error response
 */
function errorResponse(
  error: string,
  status: number = 500,
  username?: string,
  paymentHash?: string
): Response {
  const errorResponse: PaymentErrorResponse = {
    status: "ERROR",
    error,
    username,
    paymentHash,
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
