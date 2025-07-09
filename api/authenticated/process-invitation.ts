/**
 * Privacy-First Invitation Processing API
 *
 * This serverless function processes invitation acceptance when users
 * register through a peer invitation link, using privacy-preserving hashes.
 *
 * Features:
 * - Privacy-first approach with hashed identifiers
 * - Session-based authentication
 * - Validates invitation tokens
 * - Awards course credits to both users
 * - Maintains audit trail without exposing sensitive data
 */

import { createHash, createHmac } from "crypto";
import { Request, Response } from "../../types/netlify-functions";
import { z } from "zod";
import {
  SecureSessionManager,
  SessionData,
} from "../../lib/security/session-manager";
import { supabase } from "../../../lib/supabase";
import { defaultLogger as logger } from "../../utils/logger";

// Invitation processing request validation schema
const ProcessInviteSchema = z.object({
  inviteToken: z.string().min(1, "Invitation token is required"),
});

interface InvitationResult {
  success: boolean;
  error?: string;
  creditsAwarded?: number;
  currentCredits?: number;
  personalMessage?: string;
  welcomeMessage?: string;
}

/**
 * Generate privacy-preserving hash for user identification
 */
function generatePrivacyHash(sessionToken: string): string {
  const salt = process.env.PRIVACY_SALT;
  if (!salt) {
    throw new Error("PRIVACY_SALT environment variable is required");
  }
  return createHmac("sha256", salt).update(sessionToken).digest("hex");
}

/**
 * Process invitation using database function
 */
async function processInvitationInDatabase(
  inviteToken: string,
  accepterSessionId: string
): Promise<InvitationResult> {
  try {
    const { data, error } = await supabase.rpc("process_invitation_private", {
      invite_token_param: inviteToken,
      accepter_session_id: accepterSessionId,
    });

    if (error) {
      logger.error("Database function error:", error);
      throw new Error("Failed to process invitation");
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.error || "Invalid or expired invitation",
      };
    }

    const personalMessage = data.invitation_data?.personalMessage;

    return {
      success: true,
      creditsAwarded: data.credits_awarded,
      personalMessage: personalMessage,
      welcomeMessage: personalMessage
        ? `Welcome to Satnam.pub! ${personalMessage}`
        : "Welcome to Satnam.pub! You've successfully joined through a peer invitation.",
    };
  } catch (error) {
    logger.error("Error processing invitation:", error);
    throw error;
  }
}

/**
 * Get user's current course credits (privacy-preserving)
 */
async function getUserCourseCredits(sessionToken: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc("get_user_credits_private", {
      user_session_id: sessionToken,
    });

    if (error) {
      logger.error("Error fetching user credits:", error);
      return 0;
    }

    return data || 0;
  } catch (error) {
    logger.error("Error fetching user credits:", error);
    return 0;
  }
}

/**
 * Track invitation processing event (privacy-preserving)
 */
async function trackInvitationEvent(
  inviteToken: string,
  eventType: string,
  hashedUserId: string,
  req?: Request
): Promise<void> {
  try {
    // Create a simple event log entry without exposing sensitive data
    const eventData = {
      invite_token: inviteToken,
      event_type: eventType,
      hashed_user_id: hashedUserId.substring(0, 8) + "...", // Truncated
      timestamp: new Date().toISOString(),
      metadata: {
        user_agent_hash: req
          ? createHash("sha256")
              .update(req.headers["user-agent"] || "")
              .digest("hex")
              .substring(0, 16)
          : null,
      },
    };

    // Log the event (you can store this in a separate events table if needed)
    logger.info("Invitation event tracked", eventData);
  } catch (error) {
    logger.error("Error tracking invitation event:", error);
    // Don't throw - tracking is not critical
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

    // Validate request body
    const validationResult = ProcessInviteSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request data",
        details: validationResult.error.errors,
      });
    }

    const { inviteToken } = validationResult.data;

    // Generate privacy hash for user identification
    const hashedUserId = generatePrivacyHash(sessionData.sessionToken);

    // Track the processing attempt
    await trackInvitationEvent(inviteToken, "processing", hashedUserId, req);

    // Process the invitation
    const result = await processInvitationInDatabase(
      inviteToken,
      sessionData.sessionToken
    );

    if (!result.success) {
      await trackInvitationEvent(inviteToken, "failed", hashedUserId, req);
      return res.status(400).json(result);
    }

    // Track successful processing
    await trackInvitationEvent(inviteToken, "completed", hashedUserId, req);

    // Get updated credit balance
    const currentCredits = await getUserCourseCredits(sessionData.sessionToken);

    // Log successful invitation processing (privacy-preserving)
    logger.info("Peer invitation processed successfully", {
      inviteToken,
      hashedUserId: hashedUserId.substring(0, 8) + "...", // Truncated for privacy
      creditsAwarded: result.creditsAwarded,
      currentCredits,
    });

    return res.status(200).json({
      success: true,
      creditsAwarded: result.creditsAwarded,
      currentCredits,
      welcomeMessage: result.welcomeMessage,
      personalMessage: result.personalMessage,
    });
  } catch (error) {
    logger.error("Error processing peer invitation:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
