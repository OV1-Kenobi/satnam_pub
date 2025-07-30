import { nip19, SimplePool } from "nostr-tools";
import { z } from "zod";
import { vault } from "../../lib/vault.js";
import { RebuildingCamelotOTPService } from "../../netlify/functions/nostr-otp-service.js";
import { SecureSessionManager } from "../../netlify/functions/security/session-manager.js";
import { supabase } from "../../netlify/functions/supabase.js";
import { generateSecureToken } from "../../utils/crypto.js";

function getEnvVar(key) {
  return process.env[key];
}

async function getApiBaseUrl() {
  try {
    const vaultUrl = await vault.getCredentials("api_base_url");
    if (vaultUrl) {
      return vaultUrl;
    }
  } catch (error) {
    // Vault not available, fall back to environment variables
  }

  const envUrl = getEnvVar("API_BASE_URL") || getEnvVar("VITE_API_BASE_URL");
  if (envUrl) {
    return envUrl;
  }

  return "https://api.satnam.pub";
}

/**
 * @typedef {Object} WhitelistEntry
 * @property {boolean} is_whitelisted
 * @property {"private"|"offspring"|"adult"|"steward"|"guardian"} family_role
 * @property {number} voting_power
 * @property {boolean} guardian_approved
 * @property {boolean} steward_approved
 */

/**
 * @typedef {Object} OTPData
 * @property {string} otp
 * @property {string} npub
 * @property {string} [nip05]
 * @property {number} createdAt
 * @property {number} attempts
 */

/**
 * @typedef {Object} UserData
 * @property {string} npub
 * @property {string} [nip05]
 * @property {"private"|"offspring"|"adult"|"steward"|"guardian"} federationRole
 * @property {"otp"|"nwc"} authMethod
 * @property {boolean} isWhitelisted
 * @property {number} votingPower
 * @property {boolean} guardianApproved
 * @property {boolean} stewardApproved
 * @property {string} sessionToken
 */

const otpStorage = new Map();
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 3;
const PROGRESSIVE_DELAYS = [0, 1000, 2000, 5000, 10000];

async function applyProgressiveDelay(attempts) {
  const delayIndex = Math.min(attempts, PROGRESSIVE_DELAYS.length - 1);
  const delay = PROGRESSIVE_DELAYS[delayIndex];

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function hashForLogging(data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data + "satnam-logging-salt-2024");
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16);
}

async function logSecurityEvent(event, details, req) {
  try {
    await supabase.from("security_audit_log").insert({
      event_type: event,
      details: JSON.stringify(details),
      ip_address: req.ip || null,
      user_agent: req.headers?.["user-agent"] || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Silent failure for security logging
  }
}

const otpService = new RebuildingCamelotOTPService();

/**
 * Generate and send OTP via Nostr DM
 * POST /api/auth/otp/initiate
 */
export async function initiateOTP(req, res) {
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

    let targetNpub;
    let targetPubkey;
    let targetNip05 = nip05;

    try {
      if (npub) {
        const { type, data } = nip19.decode(npub);
        if (type !== "npub") {
          throw new Error("Invalid npub format");
        }
        targetNpub = npub;
        targetPubkey = data;
      } else if (pubkey) {
        if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
          throw new Error("Invalid pubkey format");
        }
        targetPubkey = pubkey.toLowerCase();
        targetNpub = nip19.npubEncode(targetPubkey);
      } else {
        res.status(400).json({
          success: false,
          error: "NIP-05 resolution not yet implemented. Please provide npub or pubkey.",
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

    if (!targetNip05) {
      try {
        const pool = new SimplePool();
        const relays = [
          "wss://relay.damus.io",
          "wss://nos.lol",
          "wss://relay.nostr.band",
        ];

        const userFilter = { kinds: [0], authors: [targetPubkey] };
        const profileEvent = await pool.get(relays, userFilter);

        if (profileEvent) {
          try {
            const profileContent = JSON.parse(profileEvent.content);
            targetNip05 = profileContent.nip05 || undefined;
          } catch (e) {
            // Profile parsing failed, continue without NIP-05
          }
        }

        pool.close(relays);
      } catch (error) {
        // Profile fetch failed, continue without NIP-05
      }
    }

    const otpResult = await otpService.sendOTPDM(targetNpub, targetNip05);

    if (!otpResult.success) {
      await logSecurityEvent(
        "otp_send_failed",
        {
          npubHash: targetNpub ? await hashForLogging(targetNpub) : null,
          nip05Hash: targetNip05 ? await hashForLogging(targetNip05) : null,
          errorType: otpResult.error || "unknown",
          hasNpub: !!targetNpub,
          hasNip05: !!targetNip05,
        },
        req
      );

      res.status(500).json({
        success: false,
        error: "Failed to send OTP via Nostr DM",
        details: "OTP delivery service temporarily unavailable",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    await logSecurityEvent(
      "otp_send_success",
      {
        npubHash: targetNpub ? await hashForLogging(targetNpub) : null,
        nip05Hash: targetNip05 ? await hashForLogging(targetNip05) : null,
        messageType: otpResult.messageType || "unknown",
        hasMessageId: !!otpResult.messageId,
        expiryMinutes: Math.floor((otpResult.expiresAt.getTime() - Date.now()) / (60 * 1000)),
      },
      req
    );

    const otpKey = `${targetNpub}_${Date.now()}`;

    otpStorage.set(otpKey, {
      otp: otpResult.otp,
      npub: targetNpub,
      nip05: targetNip05,
      createdAt: Date.now(),
      attempts: 0,
    });

    cleanupExpiredOTPs();
    await otpService.cleanupExpiredOTPs();

    res.status(200).json({
      success: true,
      data: {
        message: `OTP sent successfully via ${otpResult.messageType === "gift-wrap" ? "gift-wrapped" : "encrypted"} Nostr DM from Rebuilding Camelot`,
        otpKey,
        npub: targetNpub,
        nip05: targetNip05,
        expiresIn: Math.floor((otpResult.expiresAt.getTime() - Date.now()) / 1000),
        messageId: otpResult.messageId,
        sentVia: "nostr-dm",
        messageType: otpResult.messageType || "nip04",
        privacyLevel: otpResult.messageType === "gift-wrap" ? "enhanced" : "standard",
        sender: "RebuildingCamelot@satnam.pub",
        encryption: {
          method: otpResult.messageType === "gift-wrap" ? "NIP-59 Gift-Wrapped" : "NIP-04 Encrypted",
          description: otpResult.messageType === "gift-wrap"
            ? "Enhanced privacy with metadata protection"
            : "Standard Nostr DM encryption",
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        production: true,
        privacyFirst: true,
      },
    });
  } catch (error) {
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
 * Verify OTP code and complete authentication
 * POST /api/auth/otp/verify
 */
export async function verifyOTP(req, res) {
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

    await applyProgressiveDelay(otpData.attempts);

    if (otpData.attempts >= MAX_OTP_ATTEMPTS) {
      otpStorage.delete(otpKey);

      await logSecurityEvent(
        "otp_max_attempts_exceeded",
        {
          npubHash: otpData.npub ? await hashForLogging(otpData.npub) : null,
          nip05Hash: otpData.nip05 ? await hashForLogging(otpData.nip05) : null,
          attempts: otpData.attempts,
          hasOtpKey: !!otpKey,
        },
        req
      );

      await supabase.rpc("log_otp_verification_attempt", {
        p_npub: otpData.npub,
        p_nip05_address: otpData.nip05 || null,
        p_otp_code: otp,
        p_success: false,
        p_error_message: "Maximum attempts exceeded",
        p_ip_address: req.ip || null,
        p_user_agent: req.get?.("User-Agent") || null,
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

    const dbVerificationResult = await otpService.verifyOTP(otpData.npub, otp);
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

      await logSecurityEvent(
        "otp_verification_failed",
        {
          npubHash: otpData.npub ? await hashForLogging(otpData.npub) : null,
          nip05Hash: otpData.nip05 ? await hashForLogging(otpData.nip05) : null,
          attempts: otpData.attempts,
          verificationMethod,
          expired: dbVerificationResult.expired,
          hasOtpKey: !!otpKey,
        },
        req
      );

      await supabase.rpc("log_otp_verification_attempt", {
        p_npub: otpData.npub,
        p_nip05_address: otpData.nip05 || null,
        p_otp_code: otp,
        p_success: false,
        p_error_message: dbVerificationResult.expired ? "OTP expired" : "Invalid OTP code",
        p_ip_address: req.ip || null,
        p_user_agent: req.get?.("User-Agent") || null,
      });

      res.status(400).json({
        success: false,
        error: dbVerificationResult.expired ? "OTP has expired" : "Invalid OTP code",
        attemptsRemaining: MAX_OTP_ATTEMPTS - otpData.attempts,
        meta: {
          timestamp: new Date().toISOString(),
          verificationMethod,
        },
      });
      return;
    }

    otpStorage.delete(otpKey);

    await logSecurityEvent(
      "otp_verification_success",
      {
        npubHash: otpData.npub ? await hashForLogging(otpData.npub) : null,
        nip05Hash: otpData.nip05 ? await hashForLogging(otpData.nip05) : null,
        verificationMethod,
        hasOtpKey: !!otpKey,
      },
      req
    );

    await supabase.rpc("log_otp_verification_attempt", {
      p_npub: otpData.npub,
      p_nip05_address: otpData.nip05 || null,
      p_otp_code: otp,
      p_success: true,
      p_ip_address: req.ip || null,
      p_user_agent: req.get?.("User-Agent") || null,
    });

    let whitelistEntry = null;
    let isWhitelisted = false;

    if (otpData.nip05) {
      const { data: whitelistResult, error: whitelistError } = await supabase.rpc("check_federation_whitelist", {
        p_nip05_address: otpData.nip05,
      });

      if (!whitelistError) {
        whitelistEntry = whitelistResult?.[0];
        isWhitelisted = whitelistEntry?.is_whitelisted || false;
      }
    }

    if (otpData.nip05 && !isWhitelisted) {
      res.status(403).json({
        success: false,
        error: "Access denied: NIP-05 not authorized for Family Federation access",
        whitelisted: false,
        nip05: otpData.nip05,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const sessionToken = await generateSecureToken(64);

    const userData = {
      npub: otpData.npub,
      nip05: otpData.nip05,
      federationRole: whitelistEntry?.family_role || "offspring",
      authMethod: /** @type {"otp"} */ ("otp"),
      isWhitelisted,
      votingPower: whitelistEntry?.voting_power || 0,
      guardianApproved: whitelistEntry?.guardian_approved || false,
      stewardApproved: whitelistEntry?.steward_approved || false,
      sessionToken,
    };

    const jwtToken = await SecureSessionManager.createSession(res, userData);
    const refreshToken = await SecureSessionManager.createRefreshToken({
      userId: userData.npub,
      npub: userData.npub,
    });

    const { error: sessionError } = await supabase.rpc("create_auth_session", {
      p_npub: otpData.npub,
      p_nip05_address: otpData.nip05 || null,
      p_session_token: sessionToken,
      p_auth_method: "otp",
      p_federation_role: whitelistEntry?.family_role || null,
      p_is_whitelisted: isWhitelisted,
    });

    if (sessionError) {
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
        sessionToken: jwtToken,
        refreshToken: refreshToken,
        userAuth: userData,
        message: "OTP verification successful",
        verificationMethod,
        otpSender: verificationMethod === "database" ? "RebuildingCamelot@satnam.pub" : "legacy-system",
        privacyProtection: {
          giftWrappedSupported: true,
          encryptionMethod: "Enhanced privacy-first messaging",
          metadataProtection: "Active",
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
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
 * Get current session information using JWT tokens
 * GET /api/auth/session
 */
export async function getSession(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const sessionData = await SecureSessionManager.validateSessionFromHeader(authHeader);
    const sessionInfo = SecureSessionManager.getSessionInfo(sessionData);

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
export async function validateSession(req, res) {
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

    const { data: sessionResult, error: sessionError } = await supabase.rpc("validate_session_token", {
      p_session_token: sessionToken,
    });

    if (sessionError) {
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
export async function logout(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const sessionData = await SecureSessionManager.validateSessionFromHeader(authHeader);

    if (sessionData) {
      try {
        await supabase
          .from("family_auth_sessions")
          .update({
            is_active: false,
            last_accessed: new Date().toISOString(),
          })
          .eq("npub", sessionData.npub);
      } catch (dbError) {
        // Continue with logout even if database cleanup fails
      }
    }

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
export async function refreshSession(req, res) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        error: "Refresh token is required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const newSessionToken = await SecureSessionManager.refreshSession(refreshToken);

    if (!newSessionToken) {
      res.status(401).json({
        success: false,
        error: "Unable to refresh session - invalid or expired refresh token",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        sessionToken: newSessionToken,
        message: "Session refreshed successfully",
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Internal server error during session refresh",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}

function cleanupExpiredOTPs() {
  const now = Date.now();
  const keysToDelete = [];

  otpStorage.forEach((data, key) => {
    if (now - data.createdAt > OTP_EXPIRY_MS) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => otpStorage.delete(key));
}
