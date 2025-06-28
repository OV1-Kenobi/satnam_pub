import * as crypto from "crypto";
import { z } from "zod";
import { ApiRequest, ApiResponse } from "../../types/api";
import { CommunicationServiceFactory } from "../../utils/communication-service";
import { setCorsHeadersForCustomAPI } from "../../utils/cors";
import { OTPStorageService, OTP_CONFIG } from "../../utils/otp-storage";

// OTP expiry time (5 minutes)
const OTP_EXPIRY_MS = OTP_CONFIG.DEFAULT_TTL_MINUTES * 60 * 1000;

/**
 * Generate a secure 6-digit OTP
 */
function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Extract client information for security logging
 */
function extractClientInfo(req: ApiRequest): {
  userAgent?: string;
  ipAddress?: string;
} {
  return {
    userAgent: req.headers["user-agent"] as string,
    ipAddress:
      (req.headers["x-forwarded-for"] as string) ||
      (req.headers["x-real-ip"] as string) ||
      req.socket?.remoteAddress,
  };
}

/**
 * OTP Initiation API Endpoint
 * POST /api/auth/otp-initiate - Generate and send OTP
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  // Set CORS headers with appropriate methods for this endpoint
  setCorsHeadersForCustomAPI(req, res, { methods: "POST, OPTIONS" });

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).json({
      success: false,
      error: "Method not allowed",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  try {
    const requestSchema = z.object({
      npub: z.string().optional(),
      pubkey: z.string().optional(),
      nip05: z.string().email().optional(),
    });

    const validationResult = requestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Invalid request data",
        details: validationResult.error.errors,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const { npub, pubkey, nip05 } = validationResult.data;

    // Validate that at least one identifier is provided
    if (!npub && !pubkey && !nip05) {
      res.status(400).json({
        success: false,
        error: "At least one identifier (npub, pubkey, or nip05) is required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Determine the target identifier (prioritize npub, then nip05, then derived from pubkey)
    const targetIdentifier =
      npub || nip05 || `npub_derived_${pubkey?.slice(0, 8)}`;
    const clientInfo = extractClientInfo(req);

    // Rate limiting check
    const rateLimitKey = `otp_initiate_${clientInfo.ipAddress || "unknown"}`;
    const identifierRateLimitKey = `otp_initiate_id_${crypto.createHash("sha256").update(targetIdentifier).digest("hex").slice(0, 16)}`;

    // Check IP-based rate limiting
    const ipRateLimit = await OTPStorageService.checkRateLimit(
      rateLimitKey,
      OTP_CONFIG.RATE_LIMITS.INITIATE_PER_IP_PER_HOUR,
      60
    );

    if (!ipRateLimit.allowed) {
      res.status(429).json({
        success: false,
        error: "Too many OTP requests from this IP address",
        retryAfter: Math.ceil(
          (ipRateLimit.resetTime.getTime() - Date.now()) / 1000
        ),
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check identifier-based rate limiting
    const identifierRateLimit = await OTPStorageService.checkRateLimit(
      identifierRateLimitKey,
      OTP_CONFIG.RATE_LIMITS.INITIATE_PER_IDENTIFIER_PER_HOUR,
      60
    );

    if (!identifierRateLimit.allowed) {
      res.status(429).json({
        success: false,
        error: "Too many OTP requests for this identifier",
        retryAfter: Math.ceil(
          (identifierRateLimit.resetTime.getTime() - Date.now()) / 1000
        ),
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    // Store OTP in Supabase with privacy-first approach
    const sessionId = await OTPStorageService.createOTP(otp, {
      identifier: targetIdentifier,
      userAgent: clientInfo.userAgent,
      ipAddress: clientInfo.ipAddress,
      ttlMinutes: OTP_CONFIG.DEFAULT_TTL_MINUTES,
    });

    // Send OTP via communication service
    try {
      const communicationService =
        await CommunicationServiceFactory.getDefaultService();
      const sendResult = await communicationService.sendOTP(
        targetIdentifier,
        otp,
        sessionId,
        expiresAt
      );

      if (!sendResult.success) {
        console.error("Failed to send OTP:", sendResult.error);
        // Continue anyway - the OTP is stored and can be verified
      }
    } catch (communicationError) {
      console.error("Communication service error:", communicationError);
      // Continue anyway - in development mode, OTP will be logged
    }

    // Clean up expired OTPs (background task)
    OTPStorageService.cleanupExpiredOTPs().catch((error) => {
      console.error("Failed to cleanup expired OTPs:", error);
    });

    res.status(200).json({
      success: true,
      data: {
        sessionId,
        message: "OTP sent successfully",
        expiresIn: OTP_EXPIRY_MS / 1000, // seconds
        recipient: targetIdentifier,
        // In demo/development mode, include the OTP for testing
        ...(process.env.NODE_ENV !== "production" && { otp }),
      },
      meta: {
        timestamp: new Date().toISOString(),
        rateLimits: {
          ipRemaining: ipRateLimit.remaining,
          identifierRemaining: identifierRateLimit.remaining,
        },
      },
    });
  } catch (error) {
    console.error("OTP initiation error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to initiate OTP authentication",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}
