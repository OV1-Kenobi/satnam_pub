/**
 * Lightning Address LNURL Endpoint
 *
 * Handles Lightning Address requests for family members (e.g., daughter@satnam.pub)
 * Returns LNURL-pay information for invoice generation
 *
 * @fileoverview Lightning Address implementation for Satnam.pub family banking
 */

import { AppError, ErrorAnalyzer, ErrorCode } from "../../lib/error-handler";
import { getFamilyMember, type FamilyMember } from "../../lib/family-api";

interface LNURLPayResponse {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  tag: "payRequest";
  commentAllowed: number;
  allowsNostr?: boolean;
  nostrPubkey?: string;
}

/**
 * Main LNURL handler for Lightning Addresses
 *
 * @param req - HTTP Request
 * @returns LNURL-pay response or error
 */
export default async function handler(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();

  try {
    // Only allow GET requests for LNURL discovery
    if (req.method !== "GET") {
      throw new AppError(
        ErrorCode.VALIDATION_INVALID_FORMAT,
        `Method ${req.method} not allowed for Lightning Address lookup`,
        "Only GET requests are allowed for Lightning Address discovery.",
        { method: req.method, allowedMethods: ["GET"] },
        requestId
      );
    }

    // Extract username from URL path (e.g., /api/lnurl/daughter -> "daughter")
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const username = pathParts[pathParts.length - 1];

    if (!username || username === "[username]") {
      throw new AppError(
        ErrorCode.VALIDATION_REQUIRED_FIELD_MISSING,
        "Username parameter is required for Lightning Address lookup",
        "Please provide a valid username in the URL path.",
        { providedUsername: username, urlPath: url.pathname },
        requestId
      );
    }

    // Validate username format (alphanumeric, underscore, hyphen only)
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      throw new AppError(
        ErrorCode.VALIDATION_INVALID_FORMAT,
        `Invalid username format: ${username}. Only alphanumeric characters, underscores, and hyphens are allowed`,
        "Username can only contain letters, numbers, underscores, and hyphens.",
        { providedUsername: username, allowedPattern: "^[a-zA-Z0-9_-]+$" },
        requestId
      );
    }

    console.log(`🔍 Lightning Address lookup for: ${username}@satnam.pub`);

    // Look up family member
    const familyMember = await getFamilyMember(username);

    if (!familyMember) {
      console.log(`❌ Family member not found: ${username}`);
      throw new AppError(
        ErrorCode.FAMILY_MEMBER_NOT_FOUND,
        `Family member '${username}' not found in the system`,
        `Lightning Address ${username}@satnam.pub is not registered.`,
        {
          requestedUsername: username,
          lightningAddress: `${username}@satnam.pub`,
        },
        requestId
      );
    }

    console.log(
      `✅ Found family member: ${familyMember.name} (${familyMember.role})`
    );

    // Calculate payment limits based on family member role and settings
    const limits = calculatePaymentLimits(familyMember);

    // Create LNURL-pay response
    const lnurlResponse: LNURLPayResponse = {
      callback: `${getBaseUrl(req)}/api/lnurl/${username}/callback`,
      maxSendable: limits.maxSendable,
      minSendable: limits.minSendable,
      metadata: JSON.stringify([
        ["text/identifier", `${username}@satnam.pub`],
        [
          "text/plain",
          `Payment to ${familyMember.name} - Satnam Family Banking`,
        ],
        [
          "text/long-desc",
          `Sovereign family banking with privacy protection. Send Bitcoin to ${familyMember.name} using Lightning Address: ${username}@satnam.pub`,
        ],
      ]),
      tag: "payRequest",
      commentAllowed: 280, // Allow payment notes (Twitter-style limit)
      allowsNostr: true, // Enable Nostr Zaps
      nostrPubkey: familyMember.nostrPubkey || undefined,
    };

    console.log(
      `🔧 Generated LNURL response for ${username} with limits: ${limits.minSendable / 1000}-${limits.maxSendable / 1000} sats`
    );

    return new Response(JSON.stringify(lnurlResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error("❌ Lightning Address error:", error);

    // Use enhanced error handling
    if (error instanceof AppError) {
      const statusCode =
        error.code === ErrorCode.FAMILY_MEMBER_NOT_FOUND
          ? 404
          : error.code === ErrorCode.VALIDATION_REQUIRED_FIELD_MISSING ||
              error.code === ErrorCode.VALIDATION_INVALID_FORMAT
            ? 400
            : 500;

      return new Response(
        JSON.stringify({
          status: "ERROR",
          reason: error.userMessage || error.message,
          code: error.code,
          details: error.details,
          requestId: error.requestId,
        }),
        {
          status: statusCode,
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": error.requestId || requestId,
          },
        }
      );
    }

    // Handle unexpected errors
    const analyzedError = ErrorAnalyzer.analyzeError(
      error,
      "Lightning Address lookup",
      requestId
    );
    return new Response(
      JSON.stringify({
        status: "ERROR",
        reason:
          analyzedError.userMessage ||
          "Lightning Address service temporarily unavailable",
        code: analyzedError.code,
        requestId: analyzedError.requestId,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": analyzedError.requestId || requestId,
        },
      }
    );
  }
}

/**
 * Calculate payment limits for family member
 *
 * @param familyMember - Family member data
 * @returns Payment limits in millisatoshis
 */
function calculatePaymentLimits(familyMember: FamilyMember): {
  minSendable: number;
  maxSendable: number;
} {
  const minSendable = 1000; // 1 sat minimum (in millisats)

  let maxSendable: number;

  switch (familyMember.role) {
    case "parent":
      // Parents can receive larger amounts
      maxSendable = 100000000; // 100,000 sats (0.001 BTC)
      break;
    case "teen":
      // Teenagers have moderate limits
      maxSendable = 50000000; // 50,000 sats
      break;
    case "child":
      // Children have lower limits
      maxSendable = 10000000; // 10,000 sats
      break;
    default:
      // Default family member limit
      maxSendable = 25000000; // 25,000 sats
  }

  // Apply daily limit if configured
  if (familyMember.dailyLimit && familyMember.dailyLimit > 0) {
    const dailyLimitMillisats = familyMember.dailyLimit * 1000; // Convert sats to millisats
    maxSendable = Math.min(maxSendable, dailyLimitMillisats);
  }

  return { minSendable, maxSendable };
}

/**
 * Get base URL for callback generation
 *
 * @param req - HTTP Request
 * @returns Base URL string
 */
function getBaseUrl(req: Request): string {
  const url = new URL(req.url);

  // Check for custom domain from environment
  const customDomain =
    process.env.VITE_LIGHTNING_ADDRESS_DOMAIN ||
    process.env.LIGHTNING_ADDRESS_DOMAIN;
  if (customDomain) {
    return `https://${customDomain}`;
  }

  // Use request URL base
  return `${url.protocol}//${url.host}`;
}
