/**
 * Privacy-First Peer Invitation Generation API
 *
 * This serverless function generates peer invitations using privacy-preserving
 * hashed identifiers instead of exposing npubs or other sensitive data.
 *
 * Features:
 * - Session-based authentication with privacy hashing
 * - QR code generation for invitations
 * - Configurable course credits and expiry
 * - Rate limiting and security measures
 * - No sensitive data exposure (npubs, emails, etc.)
 */

import { createHash, randomBytes } from "crypto";
import { Request, Response } from "../../types/netlify-functions";
import QRCode from "qrcode";
import { z } from "zod";
import { RATE_LIMITS, formatTimeWindow } from "../../lib/config/rate-limits";
import {
  SecureSessionManager,
  SessionData,
} from "../../lib/security/session-manager";
import { supabase } from "../../../lib/supabase";
import { defaultLogger as logger } from "../../utils/logger";

// Gift-wrap functionality imports (would need to be implemented based on your Nostr setup)
// import { createGiftWrapMessage, sendNostrDM } from "../../lib/nostr/gift-wrap";

// Rate limiting configuration (now imported from config)
const { limit: INVITE_RATE_LIMIT, windowMs: RATE_LIMIT_WINDOW } =
  RATE_LIMITS.PEER_INVITES;

// Invitation request validation schema (privacy-first with gift-wrap support)
const InviteRequestSchema = z.object({
  personalMessage: z.string().max(500, "Personal message too long").optional(),
  courseCredits: z.number().int().min(1).max(5).default(1),
  expiryDays: z.number().int().min(1).max(90).default(30),
  inviterNip05: z.string().optional(), // Only for spam prevention in gift-wrapped messages
  recipientNostrPubkey: z.string().optional(), // npub for gift-wrapped DM
  sendAsGiftWrappedDM: z.boolean().default(false),
});

type InviteRequest = z.infer<typeof InviteRequestSchema>;

/**
 * Generate privacy-preserving hash for user identification
 */
function generatePrivacyHash(sessionToken: string): string {
  const salt = process.env.PRIVACY_SALT || "default_salt";
  return createHash("sha256")
    .update(salt + sessionToken + salt)
    .digest("hex");
}

/**
 * Generate a secure invitation token
 */
function generateInviteToken(): string {
  return `invite_${Date.now()}_${randomBytes(16).toString("hex")}`;
}

/**
 * Generate a unique hashed invite ID
 */
function generateHashedInviteId(): string {
  return createHash("sha256")
    .update(`invite_${Date.now()}_${randomBytes(8).toString("hex")}`)
    .digest("hex");
}

/**
 * Generate QR code for invitation URL
 */
async function generateQRCode(inviteUrl: string): Promise<string> {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(inviteUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: "#7C3AED", // Purple color to match your theme
        light: "#FFFFFF",
      },
    });
    return qrCodeDataUrl;
  } catch (error) {
    logger.error("Failed to generate QR code:", error);
    throw new Error("Failed to generate QR code");
  }
}

/**
 * Create gift-wrapped invitation message (privacy-preserving)
 */
async function createGiftWrappedMessage(
  inviteUrl: string,
  inviterNip05: string,
  personalMessage: string,
  courseCredits: number,
  recipientPubkey: string
): Promise<string> {
  try {
    // Create the invitation message content
    const messageContent = `🎓 You've been invited to join Satnam.pub!

${personalMessage ? `Personal message: ${personalMessage}` : ""}

🎁 Course Credits: ${courseCredits} (you'll receive these upon joining)
🔗 Invitation Link: ${inviteUrl}

From: ${inviterNip05}

Join the sovereign Bitcoin education community at Satnam.pub - where privacy meets learning.

This invitation is privacy-first and secure. Click the link to get started!`;

    // Note: In a real implementation, you would use proper Nostr gift-wrapping
    // For now, returning the message content that would be gift-wrapped
    // The actual gift-wrapping would involve:
    // 1. Creating a kind-14 gift wrap event
    // 2. Encrypting the message for the recipient
    // 3. Sending via Nostr relays

    logger.info("Gift-wrapped message created", {
      recipientPubkey: recipientPubkey.substring(0, 16) + "...",
      inviterNip05,
      messageLength: messageContent.length,
    });

    return messageContent;
  } catch (error) {
    logger.error("Failed to create gift-wrapped message:", error);
    throw new Error("Failed to create gift-wrapped message");
  }
}

/**
 * Send gift-wrapped DM via Nostr (placeholder implementation)
 */
async function sendGiftWrappedDM(
  giftWrappedContent: string,
  recipientPubkey: string,
  inviterNip05: string
): Promise<boolean> {
  try {
    // Note: In a real implementation, this would:
    // 1. Connect to Nostr relays
    // 2. Create a properly formatted gift-wrap event (kind 1059)
    // 3. Send the encrypted message
    // 4. Return success/failure status

    logger.info("Gift-wrapped DM would be sent", {
      recipientPubkey: recipientPubkey.substring(0, 16) + "...",
      inviterNip05,
      messagePreview: giftWrappedContent.substring(0, 100) + "...",
    });

    // For now, we'll return true to indicate successful "sending"
    // In production, implement actual Nostr gift-wrap sending
    return true;
  } catch (error) {
    logger.error("Failed to send gift-wrapped DM:", error);
    return false;
  }
}

/**
 * Rate limit response interface
 */
interface RateLimitResult {
  allowed: boolean;
  current_count: number;
  rate_limit: number;
  reset_time?: number;
  window_ms: number;
  error?: string;
}

/**
 * Check rate limiting using database-backed storage
 * This function uses Supabase RPC to atomically check and update rate limits
 */
async function checkRateLimit(userHash: string): Promise<boolean> {
  try {
    logger.debug("Checking rate limit for user", {
      hashedUserId: userHash.substring(0, 8) + "...",
      rateLimit: INVITE_RATE_LIMIT,
      windowMs: RATE_LIMIT_WINDOW,
    });

    const { data, error } = await supabase.rpc("check_and_update_rate_limit", {
      user_hash: userHash,
      rate_limit: INVITE_RATE_LIMIT,
      window_ms: RATE_LIMIT_WINDOW,
    });

    if (error) {
      logger.error("Database error in rate limit check:", error);
      // On database error, allow the request but log the issue
      // This prevents complete service failure due to database issues
      return true;
    }

    const result = data as RateLimitResult;

    if (result.error) {
      logger.error("RPC function error in rate limit check:", result.error);
      // On RPC error, allow the request but log the issue
      return true;
    }

    // Log rate limit status for monitoring
    logger.info("Rate limit check completed", {
      hashedUserId: userHash.substring(0, 8) + "...",
      allowed: result.allowed,
      currentCount: result.current_count,
      rateLimit: result.rate_limit,
      resetTime: result.reset_time
        ? new Date(result.reset_time).toISOString()
        : null,
    });

    return result.allowed;
  } catch (error) {
    logger.error("Unexpected error in rate limit check:", error);
    // On unexpected error, allow the request but log the issue
    // This ensures service availability even if rate limiting fails
    return true;
  }
}

/**
 * Get current rate limit status for a user (read-only)
 * Useful for providing feedback to users about their remaining quota
 */
async function getRateLimitStatus(
  userHash: string
): Promise<RateLimitResult | null> {
  try {
    const { data, error } = await supabase
      .from("rate_limits")
      .select("request_count, reset_time")
      .eq("hashed_user_id", userHash)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No records found - user hasn't made any requests yet
        return {
          allowed: true,
          current_count: 0,
          rate_limit: INVITE_RATE_LIMIT,
          window_ms: RATE_LIMIT_WINDOW,
        };
      }
      logger.error("Error fetching rate limit status:", error);
      return null;
    }

    const now = new Date();
    const resetTime = new Date(data.reset_time);
    const isExpired = now > resetTime;

    return {
      allowed: isExpired || data.request_count < INVITE_RATE_LIMIT,
      current_count: isExpired ? 0 : data.request_count,
      rate_limit: INVITE_RATE_LIMIT,
      reset_time: resetTime.getTime(),
      window_ms: RATE_LIMIT_WINDOW,
    };
  } catch (error) {
    logger.error("Unexpected error fetching rate limit status:", error);
    return null;
  }
}

/**
 * Store invitation in database (privacy-preserving)
 */
async function storeInvitation(
  inviteToken: string,
  hashedInviteId: string,
  hashedInviterId: string,
  invitationData: any,
  courseCredits: number,
  expiresAt: Date
): Promise<void> {
  try {
    const { error } = await supabase
      .from("authenticated_peer_invitations")
      .insert({
        invite_token: inviteToken,
        hashed_invite_id: hashedInviteId,
        hashed_inviter_id: hashedInviterId,
        invitation_data: invitationData,
        course_credits: courseCredits,
        expires_at: expiresAt.toISOString(),
      });

    if (error) {
      logger.error("Failed to store invitation:", error);
      throw new Error("Failed to store invitation");
    }
  } catch (error) {
    logger.error("Database error storing invitation:", error);
    throw new Error("Database error");
  }
}

/**
 * Handle CORS for the API endpoint
 */
function setCorsHeaders(req: Request, res: Response): void {
  const allowedOrigins =
    process.env.NODE_ENV === "production"
      ? [process.env.FRONTEND_URL || "https://satnam.pub"]
      : [
          "http://localhost:3000",
          "http://localhost:5173",
          "http://localhost:3002",
          "http://localhost:4173",
        ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

/**
 * Main API handler
 */
export default async function handler(req: Request, res: Response) {
  setCorsHeaders(req, res);

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    // Validate session
    const sessionData: SessionData | null =
      SecureSessionManager.validateSession(req);

    if (!sessionData?.isAuthenticated || !sessionData.sessionToken) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Generate privacy hash for user identification
    const hashedUserId = generatePrivacyHash(sessionData.sessionToken);

    // Rate limiting check (now async)
    const rateLimitAllowed = await checkRateLimit(hashedUserId);
    if (!rateLimitAllowed) {
      // Get detailed rate limit info for better user feedback
      const rateLimitStatus = await getRateLimitStatus(hashedUserId);

      const resetTimeFormatted = rateLimitStatus?.reset_time
        ? new Date(rateLimitStatus.reset_time).toLocaleString()
        : null;

      return res.status(429).json({
        success: false,
        error: `Rate limit exceeded. You have generated ${rateLimitStatus?.current_count || "maximum"} of ${INVITE_RATE_LIMIT} allowed invitations. Please try again ${resetTimeFormatted ? `after ${resetTimeFormatted}` : `in ${formatTimeWindow(RATE_LIMIT_WINDOW)}`}.`,
        rateLimitInfo: rateLimitStatus
          ? {
              currentCount: rateLimitStatus.current_count,
              rateLimit: rateLimitStatus.rate_limit,
              resetTime: rateLimitStatus.reset_time
                ? new Date(rateLimitStatus.reset_time).toISOString()
                : null,
              windowDescription: RATE_LIMITS.PEER_INVITES.description,
            }
          : null,
      });
    }

    // Validate request body
    const validationResult = InviteRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request data",
        details: validationResult.error.errors,
      });
    }

    const inviteRequest: InviteRequest = validationResult.data;

    // Generate invitation data
    const inviteToken = generateInviteToken();
    const hashedInviteId = generateHashedInviteId();
    const expiresAt = new Date(
      Date.now() + inviteRequest.expiryDays * 24 * 60 * 60 * 1000
    );

    // Create invitation URL
    const baseUrl = process.env.FRONTEND_URL || "https://satnam.pub";
    const inviteUrl = `${baseUrl}/invite/${inviteToken}`;

    // Prepare privacy-safe invitation data
    const invitationData = {
      personalMessage: inviteRequest.personalMessage,
      courseCredits: inviteRequest.courseCredits,
      expiryDays: inviteRequest.expiryDays,
      createdAt: new Date().toISOString(),
    };

    // Store invitation in database
    await storeInvitation(
      inviteToken,
      hashedInviteId,
      hashedUserId,
      invitationData,
      inviteRequest.courseCredits,
      expiresAt
    );

    // Generate QR code (only if not sending as gift-wrapped DM)
    let qrCodeImage = null;
    let giftWrappedMessage = null;

    if (!inviteRequest.sendAsGiftWrappedDM) {
      qrCodeImage = await generateQRCode(inviteUrl);
    } else {
      // Create and send gift-wrapped message
      if (inviteRequest.recipientNostrPubkey && inviteRequest.inviterNip05) {
        giftWrappedMessage = await createGiftWrappedMessage(
          inviteUrl,
          inviteRequest.inviterNip05,
          inviteRequest.personalMessage || "",
          inviteRequest.courseCredits,
          inviteRequest.recipientNostrPubkey
        );

        // Send the gift-wrapped DM
        const dmSent = await sendGiftWrappedDM(
          giftWrappedMessage,
          inviteRequest.recipientNostrPubkey,
          inviteRequest.inviterNip05
        );

        if (!dmSent) {
          logger.warn(
            "Failed to send gift-wrapped DM, falling back to regular invitation"
          );
          qrCodeImage = await generateQRCode(inviteUrl);
          giftWrappedMessage = null;
        }
      } else {
        logger.warn(
          "Missing required fields for gift-wrapped DM, falling back to QR code"
        );
        qrCodeImage = await generateQRCode(inviteUrl);
      }
    }

    // Log successful invitation generation (privacy-preserving)
    logger.info("Peer invitation generated", {
      hashedInviteId,
      hashedInviterId: hashedUserId.substring(0, 8) + "...", // Truncated for privacy
      courseCredits: inviteRequest.courseCredits,
      expiryDays: inviteRequest.expiryDays,
      isGiftWrapped: !!giftWrappedMessage,
      inviterNip05: inviteRequest.inviterNip05 || "not provided",
    });

    return res.status(200).json({
      success: true,
      inviteToken,
      inviteUrl,
      qrCodeImage,
      giftWrappedMessage,
      expiryDate: expiresAt.toISOString(),
      courseCredits: inviteRequest.courseCredits,
      personalMessage: inviteRequest.personalMessage,
    });
  } catch (error) {
    logger.error("Error generating peer invitation:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
