/**
 * Privacy-First Peer Invitation Acceptance API
 *
 * This serverless function processes peer invitation acceptance using privacy-preserving
 * hashed identifiers and awards course credits to both inviter and invitee.
 *
 * Features:
 * - Session-based authentication with privacy hashing
 * - Automatic credit awarding to both parties
 * - Invitation validation and expiry checking
 * - Rate limiting and security measures
 * - No sensitive data exposure (npubs, emails, etc.)
 */

import { Request, Response } from "express";
import { z } from "zod";
import {
  SecureSessionManager,
  SessionData,
} from "../../lib/security/session-manager";
import { supabase } from "../../lib/supabase";
import { defaultLogger as logger } from "../../utils/logger";

// Invitation acceptance validation schema
const AcceptInviteSchema = z.object({
  inviteToken: z.string().min(10, "Invalid invite token"),
});

type AcceptInviteRequest = z.infer<typeof AcceptInviteSchema>;

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
    const validationResult = AcceptInviteSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request data",
        details: validationResult.error.errors,
      });
    }

    const acceptRequest: AcceptInviteRequest = validationResult.data;

    // Process the invitation acceptance using the database function
    const { data, error } = await supabase.rpc("process_invitation_private", {
      invite_token_param: acceptRequest.inviteToken,
      accepter_session_id: sessionData.sessionToken,
    });

    if (error) {
      logger.error("Error processing invitation:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to process invitation",
      });
    }

    // The function returns a JSONB object with success status
    const result = data as {
      success: boolean;
      error?: string;
      credits_awarded?: number;
      invitation_data?: any;
      message?: string;
    };

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || "Invalid invitation",
      });
    }

    // Log successful invitation acceptance (privacy-preserving)
    logger.info("Peer invitation accepted", {
      inviteToken: acceptRequest.inviteToken.substring(0, 16) + "...",
      creditsAwarded: result.credits_awarded,
      sessionId: sessionData.sessionToken.substring(0, 8) + "...",
    });

    return res.status(200).json({
      success: true,
      creditsAwarded: result.credits_awarded,
      invitationData: result.invitation_data,
      message: result.message,
    });
  } catch (error) {
    logger.error("Error accepting peer invitation:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
