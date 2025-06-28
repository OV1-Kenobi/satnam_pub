import NDK from "@nostr-dev-kit/ndk";
import crypto from "crypto";
import { Request, Response } from "express";
import { nip19 } from "nostr-tools";
import { z } from "zod";
import { RebuildingCamelotOTPService } from "../../lib/nostr-otp-service";
import { SecureSessionManager } from "../../lib/security/session-manager";
import { supabase } from "../../lib/supabase";
import { generateSecureToken } from "../../utils/crypto";

// In-memory OTP storage (in production, use Redis or database)
const otpStorage = new Map<
  string,
  {
    otp: string;
    npub: string;
    nip05?: string;
    createdAt: number;
    attempts: number;
  }
>();

// OTP expiry time (5 minutes)
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 3;

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
 * Create privacy-preserving hash for logging purposes
 * Uses a consistent salt to allow correlation while protecting privacy
 */
async function hashForLogging(data: string): Promise<string> {
  const salt = process.env.LOGGING_SALT;
  if (!salt) {
    throw new Error("LOGGING_SALT environment variable is required");
  }
  const hash = crypto.createHash("sha256");
  hash.update(data + salt);
  return hash.digest("hex").substring(0, 16); // Truncate for privacy
}

/**
 * Log security event for monitoring
 * Ensures no sensitive data is logged while maintaining security monitoring
 */
async function logSecurityEvent(
  event: string,
  details: Record<string, any>,
  req: Request
): Promise<void> {
  try {
    await supabase.from("security_audit_log").insert({
      event_type: event,
      details: JSON.stringify(details),
      ip_address: req.ip || null,
      user_agent: req.get("User-Agent") || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to log security event:", error);
  }
}

// Initialize Rebuilding Camelot OTP service
const otpService = new RebuildingCamelotOTPService();

/**
 * Generate and send OTP via Nostr DM
 * POST /api/auth/otp/initiate
 */
export async function initiateOTP(req: Request, res: Response): Promise<void> {
  try {
    const requestSchema = z.object({
      npub: z.string().optional(),
      pubkey: z.string().optional(),
      nip05: z.string().email().optional(),
    });

    const validationResult = requestSchema.safeParse(req.body);

    if (!validationResult.success) {
      await logSecurityEvent(
        "otp_initiate_validation_failed",
        {
          errors: validationResult.error.errors,
          // Only log non-sensitive validation info, never actual user data
          fieldCount: Object.keys(req.body || {}).length,
        },
        req
      );

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

    let targetNpub: string;
    let targetPubkey: string;
    let targetNip05: string | undefined = nip05;

    try {
      // Convert npub to pubkey if npub is provided
      if (npub) {
        const { type, data } = nip19.decode(npub);
        if (type !== "npub") {
          throw new Error("Invalid npub format");
        }
        targetNpub = npub;
        targetPubkey = data as string;
      } else if (pubkey) {
        // Validate pubkey format
        if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
          throw new Error("Invalid pubkey format");
        }
        targetPubkey = pubkey.toLowerCase();
        targetNpub = nip19.npubEncode(targetPubkey);
      } else {
        // If only NIP-05 is provided, we need to resolve it
        // For now, return an error asking for npub or pubkey
        res.status(400).json({
          success: false,
          error:
            "NIP-05 resolution not yet implemented. Please provide npub or pubkey.",
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }
    } catch (error) {
      res.status(400).json({
        success: false,
        error: `Invalid identifier: ${error instanceof Error ? error.message : String(error)}`,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Try to fetch user profile to get NIP-05 if not provided
    if (!targetNip05) {
      try {
        const ndk = new NDK({
          explicitRelayUrls: [
            "wss://relay.damus.io",
            "wss://nos.lol",
            "wss://relay.nostr.band",
          ],
        });

        await ndk.connect();

        const userFilter = { kinds: [0], authors: [targetPubkey] };
        const profileEvent = await ndk.fetchEvent(userFilter);

        if (profileEvent) {
          try {
            const profileContent = JSON.parse(profileEvent.content);
            targetNip05 = profileContent.nip05 || undefined;
          } catch (e) {
            console.warn("Failed to parse profile content:", e);
          }
        }
      } catch (error) {
        console.warn("Failed to fetch user profile:", error);
      }
    }

    // Send OTP via Rebuilding Camelot Nostr DM service
    const otpResult = await otpService.sendOTPDM(targetNpub, targetNip05);

    if (!otpResult.success) {
      res.status(500).json({
        success: false,
        error: "Failed to send OTP via Nostr DM",
        details: otpResult.error,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Generate OTP key for client reference (for backward compatibility)
    const otpKey = `${targetNpub}_${Date.now()}`;

    // Store OTP in memory for backward compatibility (will be removed in future)
    otpStorage.set(otpKey, {
      otp: otpResult.otp,
      npub: targetNpub,
      nip05: targetNip05,
      createdAt: Date.now(),
      attempts: 0,
    });

    // Clean up expired OTPs
    cleanupExpiredOTPs();
    await otpService.cleanupExpiredOTPs();

    console.log(
      `OTP sent via Nostr DM to ${targetNpub}, message ID: ${otpResult.messageId}`
    );

    res.status(200).json({
      success: true,
      data: {
        message: "OTP sent successfully via Nostr DM from Rebuilding Camelot",
        otpKey, // For backward compatibility
        npub: targetNpub,
        nip05: targetNip05,
        expiresIn: Math.floor(
          (otpResult.expiresAt.getTime() - Date.now()) / 1000
        ),
        messageId: otpResult.messageId,
        sentVia: "nostr-dm",
        sender: "RebuildingCamelot@satnam.pub",
      },
      meta: {
        timestamp: new Date().toISOString(),
        production: true,
      },
    });
  } catch (error) {
    console.error("OTP initiation error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during OTP initiation",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Verify OTP and authenticate
 * POST /api/auth/otp/verify
 */
export async function verifyOTP(req: Request, res: Response): Promise<void> {
  try {
    const requestSchema = z.object({
      otpKey: z.string().min(1, "OTP key is required"),
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

    const { otpKey, otp } = validationResult.data;

    // Retrieve OTP data
    const otpData = otpStorage.get(otpKey);

    if (!otpData) {
      res.status(400).json({
        success: false,
        error: "Invalid or expired OTP key",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check if OTP is expired
    if (Date.now() - otpData.createdAt > OTP_EXPIRY_MS) {
      otpStorage.delete(otpKey);
      res.status(400).json({
        success: false,
        error: "OTP has expired",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Apply progressive delay based on previous attempts
    await applyProgressiveDelay(otpData.attempts);

    // Check attempt limit
    if (otpData.attempts >= MAX_OTP_ATTEMPTS) {
      otpStorage.delete(otpKey);

      // Log security event for max attempts exceeded
      await logSecurityEvent(
        "otp_max_attempts_exceeded",
        {
          // Hash identifiers for privacy while maintaining security monitoring
          npubHash: otpData.npub ? await hashForLogging(otpData.npub) : null,
          nip05Hash: otpData.nip05 ? await hashForLogging(otpData.nip05) : null,
          attempts: otpData.attempts,
          // Don't log the actual OTP key, just indicate it existed
          hasOtpKey: !!otpKey,
        },
        req
      );

      // Log failed attempt
      await supabase.rpc("log_otp_verification_attempt", {
        p_npub: otpData.npub,
        p_nip05_address: otpData.nip05 || null,
        p_otp_code: otp,
        p_success: false,
        p_error_message: "Maximum attempts exceeded",
        p_ip_address: req.ip || null,
        p_user_agent: req.get("User-Agent") || null,
      });

      res.status(429).json({
        success: false,
        error: "Maximum OTP attempts exceeded",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Try to verify OTP using the new database-backed service first
    const dbVerificationResult = await otpService.verifyOTP(otpData.npub, otp);

    // Fallback to legacy in-memory verification if database verification fails
    let isValidOTP = false;
    let verificationMethod = "legacy";

    if (dbVerificationResult.valid) {
      isValidOTP = true;
      verificationMethod = "database";
    } else if (otpData.otp === otp) {
      isValidOTP = true;
      verificationMethod = "legacy";
    }

    if (!isValidOTP) {
      otpData.attempts++;
      otpStorage.set(otpKey, otpData);

      // Log security event for failed verification
      await logSecurityEvent(
        "otp_verification_failed",
        {
          // Hash identifiers for privacy while maintaining security monitoring
          npubHash: otpData.npub ? await hashForLogging(otpData.npub) : null,
          nip05Hash: otpData.nip05 ? await hashForLogging(otpData.nip05) : null,
          attempts: otpData.attempts,
          verificationMethod,
          expired: dbVerificationResult.expired,
          // Don't log the actual OTP key, just indicate it existed
          hasOtpKey: !!otpKey,
        },
        req
      );

      // Log failed attempt
      await supabase.rpc("log_otp_verification_attempt", {
        p_npub: otpData.npub,
        p_nip05_address: otpData.nip05 || null,
        p_otp_code: otp,
        p_success: false,
        p_error_message: dbVerificationResult.expired
          ? "OTP expired"
          : "Invalid OTP code",
        p_ip_address: req.ip || null,
        p_user_agent: req.get("User-Agent") || null,
      });

      res.status(400).json({
        success: false,
        error: dbVerificationResult.expired
          ? "OTP has expired"
          : "Invalid OTP code",
        attemptsRemaining: MAX_OTP_ATTEMPTS - otpData.attempts,
        meta: {
          timestamp: new Date().toISOString(),
          verificationMethod,
        },
      });
      return;
    }

    // OTP is valid, clean up
    otpStorage.delete(otpKey);

    // Log security event for successful verification
    await logSecurityEvent(
      "otp_verification_success",
      {
        // Hash identifiers for privacy while maintaining security monitoring
        npubHash: otpData.npub ? await hashForLogging(otpData.npub) : null,
        nip05Hash: otpData.nip05 ? await hashForLogging(otpData.nip05) : null,
        verificationMethod,
        // Don't log the actual OTP key, just indicate it existed
        hasOtpKey: !!otpKey,
      },
      req
    );

    // Log successful attempt
    await supabase.rpc("log_otp_verification_attempt", {
      p_npub: otpData.npub,
      p_nip05_address: otpData.nip05 || null,
      p_otp_code: otp,
      p_success: true,
      p_ip_address: req.ip || null,
      p_user_agent: req.get("User-Agent") || null,
    });

    // Check federation whitelist if NIP-05 is available
    let whitelistEntry: any = null;
    let isWhitelisted = false;

    if (otpData.nip05) {
      const { data: whitelistResult, error: whitelistError } =
        await supabase.rpc("check_federation_whitelist", {
          p_nip05_address: otpData.nip05,
        });

      if (whitelistError) {
        console.error("Whitelist check error:", whitelistError);
      } else {
        whitelistEntry = whitelistResult?.[0];
        isWhitelisted = whitelistEntry?.is_whitelisted || false;
      }
    }

    if (otpData.nip05 && !isWhitelisted) {
      res.status(403).json({
        success: false,
        error:
          "Access denied: NIP-05 not authorized for Family Federation access",
        whitelisted: false,
        nip05: otpData.nip05,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Generate session token for database storage (optional, for audit purposes)
    const sessionToken = await generateSecureToken(64);

    // Create user data for session
    const userData = {
      npub: otpData.npub,
      nip05: otpData.nip05,
      federationRole: (whitelistEntry?.family_role || "child") as
        | "parent"
        | "child"
        | "guardian",
      authMethod: "otp" as const,
      isWhitelisted,
      votingPower: whitelistEntry?.voting_power || 0,
      guardianApproved: whitelistEntry?.guardian_approved || false,
      sessionToken,
    };

    // Create secure session with HttpOnly cookies
    SecureSessionManager.createSession(res, userData);

    // Create authentication session in database
    const { error: sessionError } = await supabase.rpc("create_auth_session", {
      p_npub: otpData.npub,
      p_nip05_address: otpData.nip05 || null,
      p_session_token: sessionToken,
      p_auth_method: "otp",
      p_federation_role: whitelistEntry?.family_role || null,
      p_is_whitelisted: isWhitelisted,
    });

    if (sessionError) {
      console.error("Session creation error:", sessionError);
      res.status(500).json({
        success: false,
        error: "Failed to create authentication session",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        authenticated: true,
        userAuth: userData,
        message: "OTP verification successful",
        verificationMethod,
        otpSender:
          verificationMethod === "database"
            ? "RebuildingCamelot@satnam.pub"
            : "legacy-system",
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during OTP verification",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Get current session information using HttpOnly cookies
 * GET /api/auth/session
 */
export async function getSession(req: Request, res: Response): Promise<void> {
  try {
    const sessionInfo = SecureSessionManager.getSessionInfo(req);

    if (!sessionInfo.isAuthenticated) {
      res.status(401).json({
        success: false,
        error: "No active session",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: sessionInfo,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Session retrieval error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during session retrieval",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Validate existing session token
 * POST /api/auth/validate-session
 */
export async function validateSession(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const requestSchema = z.object({
      sessionToken: z.string().min(1, "Session token is required"),
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

    const { sessionToken } = validationResult.data;

    // Validate session token
    const { data: sessionResult, error: sessionError } = await supabase.rpc(
      "validate_session_token",
      {
        p_session_token: sessionToken,
      }
    );

    if (sessionError) {
      console.error("Session validation error:", sessionError);
      res.status(500).json({
        success: false,
        error: "Failed to validate session",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const sessionData = sessionResult?.[0];

    if (!sessionData?.is_valid) {
      res.status(401).json({
        success: false,
        error: "Invalid or expired session",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        valid: true,
        userAuth: {
          npub: sessionData.npub,
          nip05: sessionData.nip05_address,
          federationRole: sessionData.federation_role,
          authMethod: sessionData.auth_method,
          isWhitelisted: sessionData.is_whitelisted,
        },
        expiresAt: sessionData.expires_at,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Session validation error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during session validation",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Logout and invalidate session
 * POST /api/auth/logout
 */
export async function logout(req: Request, res: Response): Promise<void> {
  try {
    // Get session data from HttpOnly cookies
    const sessionData = SecureSessionManager.validateSession(req);

    if (sessionData) {
      // Invalidate session in database if it exists
      try {
        await supabase
          .from("family_auth_sessions")
          .update({
            is_active: false,
            last_accessed: new Date().toISOString(),
          })
          .eq("npub", sessionData.npub);
      } catch (dbError) {
        console.warn("Database session cleanup failed:", dbError);
        // Continue with logout even if database cleanup fails
      }
    }

    // Clear HttpOnly cookies
    SecureSessionManager.clearSession(res);

    res.status(200).json({
      success: true,
      data: {
        message: "Successfully logged out",
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Logout error:", error);

    // Even if there's an error, try to clear cookies
    SecureSessionManager.clearSession(res);

    res.status(500).json({
      success: false,
      error: "Internal server error during logout",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Refresh session using refresh token
 * POST /api/auth/refresh
 */
export async function refreshSession(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const refreshedSession = await SecureSessionManager.refreshSession(
      req,
      res
    );

    if (!refreshedSession) {
      res.status(401).json({
        success: false,
        error: "Unable to refresh session",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const sessionInfo = {
      isAuthenticated: true,
      user: {
        npub: refreshedSession.npub,
        nip05: refreshedSession.nip05,
        federationRole: refreshedSession.federationRole,
        authMethod: refreshedSession.authMethod,
        isWhitelisted: refreshedSession.isWhitelisted,
        votingPower: refreshedSession.votingPower,
        guardianApproved: refreshedSession.guardianApproved,
      },
    };

    res.status(200).json({
      success: true,
      data: sessionInfo,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Session refresh error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during session refresh",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Clean up expired OTPs from memory
 */
function cleanupExpiredOTPs(): void {
  const now = Date.now();
  for (const [key, data] of otpStorage.entries()) {
    if (now - data.createdAt > OTP_EXPIRY_MS) {
      otpStorage.delete(key);
    }
  }
}
