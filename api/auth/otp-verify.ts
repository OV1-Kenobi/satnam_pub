import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { ApiRequest, ApiResponse } from "../../types/api";
import { generateSessionToken } from "../../utils/auth-crypto";
import { setCorsHeadersForCustomAPI } from "../../utils/cors";
import { OTPStorageService, OTP_CONFIG } from "../../utils/otp-storage";

// OTP configuration
const MAX_OTP_ATTEMPTS = OTP_CONFIG.MAX_ATTEMPTS;

// Progressive delay for failed attempts (in milliseconds)
const PROGRESSIVE_DELAYS = [0, 1000, 2000, 5000, 10000]; // 0s, 1s, 2s, 5s, 10s

/**
 * Apply progressive delay based on failed attempts
 */
async function applyProgressiveDelay(attempts: number): Promise<void> {
  const delayIndex = Math.min(attempts, PROGRESSIVE_DELAYS.length - 1);
  const delay = PROGRESSIVE_DELAYS[delayIndex];

  if (delay > 0) {
    console.log(
      `🕐 Applying progressive delay: ${delay}ms for attempt ${attempts + 1}`
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
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
 * Create session in database
 */
async function createAuthSession(
  hashedIdentifier: string,
  sessionToken: string,
  clientInfo: { userAgent?: string; ipAddress?: string }
): Promise<{ success: boolean; userData?: any; error?: string }> {
  try {
    // In a real implementation, this would link to user profile
    // For now, we'll create a mock user profile based on the hashed identifier
    const userData = {
      id: hashedIdentifier,
      hashedIdentifier,
      role: "family_member",
      permissions: ["read", "write", "transfer"],
      sessionToken,
      createdAt: new Date().toISOString(),
    };

    // Store session in family_auth_sessions table
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const { error: sessionError } = await supabase.rpc("create_auth_session", {
      p_npub: hashedIdentifier,
      p_username: `user_${hashedIdentifier.slice(0, 8)}`,
      p_session_token: sessionToken,
      p_expires_at: expiresAt.toISOString(),
      p_metadata: {
        userAgent: clientInfo.userAgent,
        ipAddress: clientInfo.ipAddress,
        loginMethod: "otp",
      },
    });

    if (sessionError) {
      console.error("Failed to create auth session:", sessionError);
      return {
        success: false,
        error: "Failed to create authentication session",
      };
    }

    return { success: true, userData };
  } catch (error) {
    console.error("Error creating auth session:", error);
    return { success: false, error: "Failed to create authentication session" };
  }
}

// Note: Session token generation is now handled by the shared auth-crypto module

/**
 * OTP Verification API Endpoint
 * POST /api/auth/otp-verify - Verify OTP and create session
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
      sessionId: z.string().min(1, "Session ID is required"),
      otp: z.string().length(6, "OTP must be 6 digits"),
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

    const { sessionId, otp } = validationResult.data;
    const clientInfo = extractClientInfo(req);

    // Rate limiting check
    const sessionRateLimitKey = `otp_verify_session_${sessionId}`;
    const ipRateLimitKey = `otp_verify_ip_${clientInfo.ipAddress || "unknown"}`;

    // Check session-based rate limiting
    const sessionRateLimit = await OTPStorageService.checkRateLimit(
      sessionRateLimitKey,
      OTP_CONFIG.RATE_LIMITS.VERIFY_PER_SESSION_PER_MINUTE,
      1
    );

    if (!sessionRateLimit.allowed) {
      res.status(429).json({
        success: false,
        error: "Too many verification attempts for this session",
        retryAfter: Math.ceil(
          (sessionRateLimit.resetTime.getTime() - Date.now()) / 1000
        ),
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check IP-based rate limiting
    const ipRateLimit = await OTPStorageService.checkRateLimit(
      ipRateLimitKey,
      OTP_CONFIG.RATE_LIMITS.VERIFY_PER_IP_PER_MINUTE,
      1
    );

    if (!ipRateLimit.allowed) {
      res.status(429).json({
        success: false,
        error: "Too many verification attempts from this IP",
        retryAfter: Math.ceil(
          (ipRateLimit.resetTime.getTime() - Date.now()) / 1000
        ),
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Apply progressive delay (simulate processing time to prevent timing attacks)
    await new Promise((resolve) =>
      setTimeout(resolve, 500 + Math.random() * 1000)
    );

    // Verify OTP using the storage service
    const verificationResult = await OTPStorageService.verifyOTP({
      sessionId,
      otp,
      userAgent: clientInfo.userAgent,
      ipAddress: clientInfo.ipAddress,
    });

    if (!verificationResult.success) {
      // Additional progressive delay for failed attempts
      if (verificationResult.data?.attemptsRemaining !== undefined) {
        const failedAttempts =
          MAX_OTP_ATTEMPTS - verificationResult.data.attemptsRemaining;
        await applyProgressiveDelay(failedAttempts);
      }

      const statusCode = verificationResult.error?.includes("expired")
        ? 400
        : verificationResult.error?.includes("Maximum")
          ? 429
          : 400;

      res.status(statusCode).json({
        success: false,
        error: verificationResult.error,
        attemptsRemaining: verificationResult.data?.attemptsRemaining,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // OTP verified successfully - create session
    const sessionToken = generateSessionToken();
    const sessionResult = await createAuthSession(
      verificationResult.data!.hashedIdentifier,
      sessionToken,
      clientInfo
    );

    if (!sessionResult.success) {
      res.status(500).json({
        success: false,
        error: sessionResult.error || "Failed to create authentication session",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Set secure session cookie
    const cookieOptions = [
      `session=${sessionToken}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${24 * 60 * 60}`,
      ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
    ];

    res.setHeader("Set-Cookie", cookieOptions.join("; "));

    res.status(200).json({
      success: true,
      data: {
        user: sessionResult.userData,
        sessionToken,
        expiresAt: expiresAt.toISOString(),
        message: "Authentication successful",
      },
      meta: {
        timestamp: new Date().toISOString(),
        sessionId,
      },
    });
  } catch (error) {
    console.error("OTP verification error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to verify OTP",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}
