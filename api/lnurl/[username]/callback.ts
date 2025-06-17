/**
 * Lightning Address Callback Endpoint
 *
 * Generates Lightning invoices when someone pays to a Lightning Address
 * Supports Nostr Zaps and privacy-enhanced payments
 *
 * @fileoverview LNURL callback for invoice generation
 */

import { getFamilyMember } from "../../../lib/family-api";
import { logPrivacyOperation } from "../../../lib/privacy";
import { FamilyPhoenixdManager } from "../../../src/lib/family-phoenixd-manager";
import { PhoenixdClient } from "../../../src/lib/phoenixd-client";

const phoenixdClient = new PhoenixdClient();
const familyManager = new FamilyPhoenixdManager();

interface CallbackQuery {
  amount: string; // Amount in millisatoshis
  comment?: string; // Payment comment/memo
  nostr?: string; // Nostr event for zaps (JSON string)
}

interface LNURLCallbackResponse {
  pr: string; // Payment request (Lightning invoice)
  successAction?: {
    tag: "message" | "url" | "aes";
    message?: string;
    url?: string;
    ciphertext?: string;
    iv?: string;
  };
  disposable?: boolean;
  routes?: any[];
}

interface LNURLErrorResponse {
  status: "ERROR";
  reason: string;
}

/**
 * LNURL callback handler for generating Lightning invoices
 *
 * @param req - HTTP Request with payment parameters
 * @returns Lightning invoice or error response
 */
export default async function handler(req: Request): Promise<Response> {
  try {
    // Only allow GET requests for LNURL callbacks
    if (req.method !== "GET") {
      return errorResponse("Method not allowed", 405);
    }

    const url = new URL(req.url);
    // Remove trailing slash and split path - more robust username extraction
    const cleanPath = url.pathname.replace(/\/$/, "");
    const pathParts = cleanPath.split("/");
    const username = pathParts[pathParts.length - 2]; // Get username from path

    if (!username || username === "[username]") {
      return errorResponse("Username required");
    }

    // Parse query parameters
    const query: CallbackQuery = {
      amount: url.searchParams.get("amount") || "",
      comment: url.searchParams.get("comment") || undefined,
      nostr: url.searchParams.get("nostr") || undefined,
    };

    console.log(
      `💰 Lightning Address payment request for ${username}@satnam.pub:`,
      {
        amount: query.amount,
        hasComment: !!query.comment,
        hasNostr: !!query.nostr,
      },
    );

    // Validate required parameters
    if (!query.amount) {
      return errorResponse("Amount parameter required");
    }

    const amountMillisats = parseInt(query.amount, 10);
    if (isNaN(amountMillisats) || amountMillisats <= 0) {
      return errorResponse("Invalid amount");
    }

    // Check if amount is evenly divisible by 1000 (exact satoshi conversion)
    if (amountMillisats % 1000 !== 0) {
      return errorResponse(
        "Amount must be a whole number of satoshis (divisible by 1000 millisatoshis)",
      );
    }

    const amountSats = amountMillisats / 1000;

    // Look up family member
    const familyMember = await getFamilyMember(username);
    if (!familyMember) {
      return errorResponse("Family member not found", 404);
    }

    // Validate amount against limits
    const limits = calculatePaymentLimits(familyMember);
    if (
      amountMillisats < limits.minSendable ||
      amountMillisats > limits.maxSendable
    ) {
      return errorResponse(
        `Amount must be between ${limits.minSendable / 1000} and ${limits.maxSendable / 1000} sats`,
      );
    }

    // Handle Nostr Zap if provided
    let zapInfo: any = null;
    if (query.nostr) {
      try {
        zapInfo = JSON.parse(query.nostr);
        console.log("⚡ Processing Nostr Zap request:", {
          kind: zapInfo.kind,
          pubkey: zapInfo.pubkey?.substring(0, 8) + "...",
          amount: amountSats,
        });
      } catch (error) {
        console.warn("Invalid Nostr event format:", error);
        // Continue without zap - don't fail the payment
      }
    }

    // Generate payment description
    const description = generatePaymentDescription(
      familyMember.name,
      username,
      query.comment,
      zapInfo,
      amountSats,
    );

    console.log(`📝 Generated description: ${description}`);

    // Check and prepare liquidity if needed
    await familyManager.processAllowanceLiquidity(familyMember);

    // Create invoice with privacy protection using PhoenixD
    const invoice = await phoenixdClient.createFamilyInvoice(
      username,
      amountSats,
      description,
    );

    // Log privacy operation for audit
    await logPrivacyOperation({
      operation: "lightning_address_invoice",
      details: {
        username,
        amount: amountSats,
        privacyEnabled: invoice.privacy.isPrivacyEnabled,
        privacyFee: invoice.privacy.privacyFee,
        hasNostrZap: !!zapInfo,
      },
      timestamp: new Date(),
    });

    console.log(
      `✅ Generated invoice for ${username}: ${amountSats} sats (Privacy: ${invoice.privacy.isPrivacyEnabled ? "ON" : "OFF"})`,
    );

    // Create success response
    const response: LNURLCallbackResponse = {
      pr: invoice.serialized, // Privacy-wrapped PhoenixD invoice
      successAction: {
        tag: "message",
        message: zapInfo
          ? `⚡ Nostr Zap of ${amountSats} sats sent to ${familyMember.name}!`
          : `💰 Payment of ${amountSats} sats sent to ${familyMember.name} at Satnam Family Banking!`,
      },
      disposable: true, // Invoice can only be paid once
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache", // Don't cache invoices
      },
    });
  } catch (error) {
    console.error("❌ Lightning Address callback error:", error);

    if (
      error instanceof Error &&
      error.message.includes("Privacy protection failed")
    ) {
      // Still try to return invoice without privacy
      console.warn(
        "⚠️ Falling back to non-privacy invoice due to privacy service failure",
      );
      return errorResponse(
        "Payment temporarily unavailable - privacy service down",
      );
    }

    return errorResponse("Failed to generate invoice");
  }
}

/**
 * Generate payment description for invoice
 *
 * @param memberName - Family member's display name
 * @param username - Lightning address username
 * @param comment - Optional payment comment
 * @param zapInfo - Optional Nostr zap information
 * @param amountSats - Payment amount in satoshis
 * @returns Formatted payment description
 */
function generatePaymentDescription(
  memberName: string,
  username: string,
  comment?: string,
  zapInfo?: any,
  amountSats?: number,
): string {
  let description = `Payment to ${memberName}@satnam.pub`;

  if (zapInfo) {
    description = `⚡ Nostr Zap: ${description}`;
    if (amountSats) {
      description += ` (${amountSats} sats)`;
    }
  }

  if (comment) {
    // Sanitize comment and limit length
    const sanitizedComment = comment
      .replace(/[^\w\s\-.,!?@#]/g, "")
      .substring(0, 200);
    description += ` - ${sanitizedComment}`;
  }

  return description;
}

/**
 * Calculate payment limits (same as main endpoint)
 */
function calculatePaymentLimits(familyMember: any): {
  minSendable: number;
  maxSendable: number;
} {
  const minSendable = 1000; // 1 sat minimum

  let maxSendable: number;

  switch (familyMember.role) {
    case "parent":
      maxSendable = 100000000; // 100,000 sats
      break;
    case "teen":
      maxSendable = 50000000; // 50,000 sats
      break;
    case "child":
      maxSendable = 10000000; // 10,000 sats
      break;
    default:
      maxSendable = 25000000; // 25,000 sats
  }

  if (familyMember.dailyLimit && familyMember.dailyLimit > 0) {
    const dailyLimitMillisats = familyMember.dailyLimit * 1000;
    maxSendable = Math.min(maxSendable, dailyLimitMillisats);
  }

  return { minSendable, maxSendable };
}

/**
 * Generate error response
 *
 * @param reason - Error message
 * @param status - HTTP status code
 * @returns Error response
 */
function errorResponse(reason: string, status: number = 400): Response {
  const errorResponse: LNURLErrorResponse = {
    status: "ERROR",
    reason,
  };

  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
