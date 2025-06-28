/**
 * Privacy-First Invitation Validation API
 *
 * This public serverless function validates invitation tokens before users register.
 * Used on the invitation landing page to show invitation details while maintaining privacy.
 *
 * Features:
 * - Public endpoint (no authentication required)
 * - Privacy-preserving validation
 * - Returns only safe, non-sensitive invitation data
 * - Rate limiting to prevent abuse
 * - No exposure of user identifiers or sensitive information
 */

import { createHash } from "crypto";
import { Request, Response } from "express";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { defaultLogger as logger } from "../../utils/logger";

// Rate limiting for validation requests
const validationRateLimit = new Map<
  string,
  { count: number; resetTime: number }
>();
const VALIDATION_RATE_LIMIT = 20; // 20 validations per 5 minutes per IP
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes

// Invitation validation request schema
const ValidateInviteSchema = z.object({
  inviteToken: z.string().min(1, "Invitation token is required"),
});

type ValidateInviteRequest = z.infer<typeof ValidateInviteSchema>;

interface InvitationDetails {
  isValid: boolean;
  personalMessage?: string;
  courseCredits?: number;
  expiryDate?: string;
  isExpired?: boolean;
  isUsed?: boolean;
  error?: string;
  welcomeMessage?: string;
  creditsMessage?: string;
}

/**
 * Check rate limiting for validation requests
 */
function checkValidationRateLimit(ipAddress: string): boolean {
  const now = Date.now();
  const clientLimit = validationRateLimit.get(ipAddress);

  if (!clientLimit) {
    validationRateLimit.set(ipAddress, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return true;
  }

  if (now > clientLimit.resetTime) {
    validationRateLimit.set(ipAddress, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return true;
  }

  if (clientLimit.count >= VALIDATION_RATE_LIMIT) {
    return false;
  }

  clientLimit.count++;
  return true;
}

/**
 * Get invitation details from database (public safe fields only)
 */
async function getPublicInvitationDetails(
  inviteToken: string
): Promise<InvitationDetails> {
  try {
    const { data, error } = await supabase
      .from("authenticated_peer_invitations")
      .select(
        `
        invitation_data,
        course_credits,
        expires_at,
        used,
        used_at,
        created_at
      `
      )
      .eq("invite_token", inviteToken)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned
        return {
          isValid: false,
          error: "Invitation not found",
        };
      }
      throw error;
    }

    const now = new Date();
    const expiryDate = new Date(data.expires_at);
    const isExpired = expiryDate < now;
    const isUsed = data.used;

    // Extract safe data from invitation_data JSONB
    const invitationData = data.invitation_data || {};
    const personalMessage = invitationData.personalMessage;
    const courseCredits = data.course_credits;

    return {
      isValid: !isExpired && !isUsed,
      personalMessage: personalMessage,
      courseCredits: courseCredits,
      expiryDate: data.expires_at,
      isExpired,
      isUsed,
      error: isExpired
        ? "Invitation has expired"
        : isUsed
          ? "Invitation has already been used"
          : undefined,
      welcomeMessage: personalMessage
        ? `You've been invited to join Satnam.pub! ${personalMessage}`
        : `You've been invited to join Satnam.pub!`,
      creditsMessage: `You and your inviter will both receive ${courseCredits} course credits when you sign up.`,
    };
  } catch (error) {
    logger.error("Error fetching invitation details:", error);
    return {
      isValid: false,
      error: "Database error",
    };
  }
}

/**
 * Track invitation view for analytics (privacy-preserving)
 */
async function trackInvitationView(
  inviteToken: string,
  req: Request
): Promise<void> {
  try {
    // Create privacy-preserving analytics entry
    const eventData = {
      invite_token: inviteToken,
      event_type: "viewed",
      timestamp: new Date().toISOString(),
      // Only store hashed/anonymized data for privacy
      ip_hash: req.ip
        ? createHash("sha256")
            .update(req.ip + (process.env.PRIVACY_SALT || "default_salt"))
            .digest("hex")
            .substring(0, 16)
        : null,
      user_agent_hash: req.headers["user-agent"]
        ? createHash("sha256")
            .update(
              req.headers["user-agent"] +
                (process.env.PRIVACY_SALT || "default_salt")
            )
            .digest("hex")
            .substring(0, 16)
        : null,
    };

    // Log the view event (you can store this in an analytics table if needed)
    logger.info("Invitation view tracked", eventData);
  } catch (error) {
    logger.error("Error tracking invitation view:", error);
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

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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

  // Allow both GET and POST methods
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    // Get invitation token from query params (GET) or body (POST)
    let inviteToken: string;

    if (req.method === "GET") {
      inviteToken = req.query.token as string;
    } else {
      const validationResult = ValidateInviteSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request data",
          details: validationResult.error.errors,
        });
      }
      inviteToken = validationResult.data.inviteToken;
    }

    if (!inviteToken) {
      return res.status(400).json({
        success: false,
        error: "Invitation token is required",
      });
    }

    // Rate limiting check
    const clientIp = req.ip || req.connection.remoteAddress || "unknown";
    if (!checkValidationRateLimit(clientIp)) {
      return res.status(429).json({
        success: false,
        error: "Rate limit exceeded. Please try again later.",
      });
    }

    // Track the validation request (privacy-preserving)
    await trackInvitationView(inviteToken, req);

    // Get invitation details
    const invitationDetails = await getPublicInvitationDetails(inviteToken);

    if (!invitationDetails.isValid) {
      return res.status(400).json({
        success: false,
        isValid: false,
        error: invitationDetails.error,
      });
    }

    // Log successful validation (privacy-preserving)
    logger.info("Invitation validated", {
      inviteToken,
      courseCredits: invitationDetails.courseCredits,
      hasPersonalMessage: !!invitationDetails.personalMessage,
      clientIpHash: createHash("sha256")
        .update(clientIp + (process.env.PRIVACY_SALT || "default_salt"))
        .digest("hex")
        .substring(0, 16),
    });

    return res.status(200).json({
      success: true,
      isValid: true,
      personalMessage: invitationDetails.personalMessage,
      courseCredits: invitationDetails.courseCredits,
      expiryDate: invitationDetails.expiryDate,
      welcomeMessage: invitationDetails.welcomeMessage,
      creditsMessage: invitationDetails.creditsMessage,
    });
  } catch (error) {
    logger.error("Error validating peer invitation:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
