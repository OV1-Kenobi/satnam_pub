/**
 * Privacy-First User Credits API
 *
 * This serverless function manages user course credits with privacy-preserving
 * hashed identifiers. Allows checking balance and credit history.
 *
 * Features:
 * - Session-based authentication with privacy hashing
 * - Get current credit balance
 * - View referral history (without exposing sensitive data)
 * - Privacy-first approach throughout
 */

import { createHash } from "crypto";
import { Request, Response } from "../../types/netlify-functions";
import {
  SecureSessionManager,
  SessionData,
} from "../../lib/security/session-manager";
import { supabase } from "../../../lib/supabase";
import { setCorsHeaders } from "../../utils/cors";
import { defaultLogger as logger } from "../../utils/logger";

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
 * Get user's current course credits (includes checking for pending inviter credits)
 */
async function getUserCredits(sessionToken: string): Promise<number> {
  try {
    // First, check for and award any pending inviter credits
    await supabase.rpc("award_pending_inviter_credits", {
      user_session_id: sessionToken,
    });

    // Then get the current balance
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
 * Get user's referral activity (privacy-preserving)
 */
async function getUserReferralActivity(hashedUserId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from("authenticated_referral_events")
      .select(
        `
        credits_amount,
        event_type,
        created_at,
        metadata
      `
      )
      .or(
        `hashed_inviter_id.eq.${hashedUserId},hashed_invitee_id.eq.${hashedUserId}`
      )
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      logger.error("Error fetching referral activity:", error);
      return [];
    }

    // Return privacy-safe referral data
    return (data || []).map((event) => ({
      creditsAmount: event.credits_amount,
      eventType: event.event_type,
      createdAt: event.created_at,
      description:
        event.event_type === "authenticated_referral"
          ? "Peer invitation successful"
          : "Bonus award",
    }));
  } catch (error) {
    logger.error("Error fetching referral activity:", error);
    return [];
  }
}

/**
 * Get user's invitation statistics (privacy-preserving)
 */
async function getUserInvitationStats(hashedUserId: string): Promise<any> {
  try {
    const { data, error } = await supabase
      .from("authenticated_peer_invitations")
      .select(
        `
        used,
        course_credits,
        created_at
      `
      )
      .eq("hashed_inviter_id", hashedUserId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Error fetching invitation stats:", error);
      return {
        totalInvitations: 0,
        successfulInvitations: 0,
        pendingInvitations: 0,
        totalCreditsOffered: 0,
      };
    }

    const invitations = data || [];
    const totalInvitations = invitations.length;
    const successfulInvitations = invitations.filter((inv) => inv.used).length;
    const pendingInvitations = totalInvitations - successfulInvitations;
    const totalCreditsOffered = invitations.reduce(
      (sum, inv) => sum + (inv.course_credits || 0),
      0
    );

    return {
      totalInvitations,
      successfulInvitations,
      pendingInvitations,
      totalCreditsOffered,
      successRate:
        totalInvitations > 0
          ? Math.round((successfulInvitations / totalInvitations) * 100)
          : 0,
    };
  } catch (error) {
    logger.error("Error fetching invitation stats:", error);
    return {
      totalInvitations: 0,
      successfulInvitations: 0,
      pendingInvitations: 0,
      totalCreditsOffered: 0,
      successRate: 0,
    };
  }
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

  // Only allow GET requests
  if (req.method !== "GET") {
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

    // Get user's current credits
    const currentCredits = await getUserCredits(sessionData.sessionToken);

    // Get referral activity
    const referralActivity = await getUserReferralActivity(hashedUserId);

    // Get invitation statistics
    const invitationStats = await getUserInvitationStats(hashedUserId);

    // Log successful request (privacy-preserving)
    logger.info("User credits requested", {
      hashedUserId: hashedUserId.substring(0, 8) + "...", // Truncated for privacy
      currentCredits,
      totalInvitations: invitationStats.totalInvitations,
    });

    return res.status(200).json({
      success: true,
      currentCredits,
      referralActivity,
      invitationStats,
      summary: {
        totalCreditsEarned: referralActivity.reduce(
          (sum, event) => sum + event.creditsAmount,
          0
        ),
        totalInvitationsSent: invitationStats.totalInvitations,
        successfulReferrals: invitationStats.successfulInvitations,
        pendingInvitations: invitationStats.pendingInvitations,
      },
    });
  } catch (error) {
    logger.error("Error fetching user credits:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
