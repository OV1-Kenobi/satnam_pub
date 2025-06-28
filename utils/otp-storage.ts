/**
 * Privacy-First OTP Storage System with Supabase Integration
 *
 * This module provides secure OTP storage using Supabase with privacy-first architecture:
 * - Uses hashed identifiers instead of storing npub/nip05 directly
 * - Implements session-based authentication
 * - Includes comprehensive rate limiting and security measures
 * - Ready for Nostr giftwrapping integration
 */

import * as crypto from "crypto";
import { supabase } from "../lib/supabase";

export interface OTPCreateOptions {
  identifier: string; // npub or nip05
  userAgent?: string;
  ipAddress?: string;
  ttlMinutes?: number;
}

export interface OTPVerifyOptions {
  sessionId: string;
  otp: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface OTPVerifyResult {
  success: boolean;
  data?: {
    hashedIdentifier: string;
    attemptsRemaining?: number;
  };
  error?: string;
}

/**
 * OTP Configuration
 */
export const OTP_CONFIG = {
  DEFAULT_TTL_MINUTES: 5,
  MAX_ATTEMPTS: 3,
  RATE_LIMITS: {
    INITIATE_PER_IDENTIFIER_PER_HOUR: 10,
    INITIATE_PER_IP_PER_HOUR: 50,
    VERIFY_PER_SESSION_PER_MINUTE: 5,
    VERIFY_PER_IP_PER_MINUTE: 20,
  },
} as const;

/**
 * Generate a privacy-preserving identifier hash
 */
function hashIdentifier(identifier: string): string {
  return crypto.createHash("sha256").update(identifier).digest("hex");
}

/**
 * Generate a salted OTP hash
 */
function hashOTPWithSalt(otp: string, salt: string): string {
  return crypto
    .createHash("sha256")
    .update(otp + salt)
    .digest("hex");
}

/**
 * Generate a unique encrypted session ID
 * Combines timestamp, random bytes, and additional entropy for uniqueness
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString();
  const randomBytes = crypto.randomBytes(24).toString("hex");
  const entropy = crypto.randomBytes(8).toString("hex");

  // Create a unique identifier by hashing combined data
  const uniqueData = `${timestamp}-${randomBytes}-${entropy}`;
  const sessionId = crypto
    .createHash("sha256")
    .update(uniqueData)
    .digest("hex");

  return sessionId;
}

/**
 * Generate a secure salt
 */
function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Extract domain from nip05 for privacy-safe analytics
 */
function extractDomain(identifier: string): string | undefined {
  if (identifier.includes("@")) {
    return identifier.split("@")[1];
  }
  return undefined;
}

/**
 * Create OTP Storage Service
 */
export class OTPStorageService {
  /**
   * Store OTP with privacy-first approach
   */
  static async createOTP(
    otp: string,
    options: OTPCreateOptions
  ): Promise<string> {
    const sessionId = generateSessionId();
    const salt = generateSalt();
    const hashedIdentifier = hashIdentifier(options.identifier);
    const otpHash = hashOTPWithSalt(otp, salt);

    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() +
        (options.ttlMinutes || OTP_CONFIG.DEFAULT_TTL_MINUTES)
    );

    // Store in Supabase using direct insert (fallback if functions don't exist)
    try {
      const { error } = await supabase.from("family_otp_verification").insert({
        id: sessionId,
        recipient_npub: hashedIdentifier, // Store hash, not actual npub
        otp_hash: otpHash,
        expires_at: expiresAt.toISOString(),
        salt: salt,
        attempts: 0,
        metadata: {
          userAgent: options.userAgent,
          ipAddress: options.ipAddress,
          nip05Domain: extractDomain(options.identifier),
        },
      });

      if (error) {
        console.error("Failed to store OTP:", error);
        throw new Error("Failed to store OTP verification data");
      }

      // Log security event
      await this.logSecurityEvent("otp_created", {
        sessionId,
        hashedIdentifier,
        expiresAt: expiresAt.toISOString(),
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      });

      return sessionId;
    } catch (error) {
      console.error("OTP storage error:", error);
      throw new Error("Failed to create OTP session");
    }
  }

  /**
   * Verify OTP using session-based approach
   */
  static async verifyOTP(options: OTPVerifyOptions): Promise<OTPVerifyResult> {
    try {
      // Get OTP record (don't filter by used status yet)
      const { data: otpRecord, error: fetchError } = await supabase
        .from("family_otp_verification")
        .select("*")
        .eq("id", options.sessionId)
        .single();

      if (fetchError || !otpRecord) {
        await this.logSecurityEvent("otp_verify_failed", {
          sessionId: options.sessionId,
          reason: "session_not_found",
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
        });
        return { success: false, error: "Invalid or expired OTP session" };
      }

      // Check if already used
      if (otpRecord.used) {
        await this.logSecurityEvent("otp_verify_failed", {
          sessionId: options.sessionId,
          reason: "already_used",
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
        });
        return { success: false, error: "OTP has already been used" };
      }

      // Check expiration
      if (new Date() > new Date(otpRecord.expires_at)) {
        // Clean up expired OTP
        await supabase
          .from("family_otp_verification")
          .update({ used: true, used_at: new Date().toISOString() })
          .eq("id", options.sessionId);

        await this.logSecurityEvent("otp_verify_failed", {
          sessionId: options.sessionId,
          reason: "expired",
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
        });

        return { success: false, error: "OTP has expired" };
      }

      // Check max attempts
      const currentAttempts = otpRecord.attempts || 0;
      if (currentAttempts >= OTP_CONFIG.MAX_ATTEMPTS) {
        // Mark as used after max attempts
        await supabase
          .from("family_otp_verification")
          .update({ used: true, used_at: new Date().toISOString() })
          .eq("id", options.sessionId);

        await this.logSecurityEvent("otp_verify_failed", {
          sessionId: options.sessionId,
          reason: "max_attempts_exceeded",
          attempts: currentAttempts,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
        });

        return { success: false, error: "Maximum OTP attempts exceeded" };
      }

      // Verify OTP using timing-safe comparison
      const expectedHash = hashOTPWithSalt(options.otp, otpRecord.salt);
      const actualHash = otpRecord.otp_hash;

      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedHash, "hex"),
        Buffer.from(actualHash, "hex")
      );

      if (!isValid) {
        // Increment attempts
        const newAttempts = currentAttempts + 1;
        const { error: updateError } = await supabase
          .from("family_otp_verification")
          .update({
            attempts: newAttempts,
          })
          .eq("id", options.sessionId);

        if (updateError) {
          console.error("Failed to update attempts:", updateError);
        }

        await this.logSecurityEvent("otp_verify_failed", {
          sessionId: options.sessionId,
          reason: "invalid_otp",
          attempts: newAttempts,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
        });

        return {
          success: false,
          error: "Invalid OTP",
          data: {
            hashedIdentifier: otpRecord.recipient_npub,
            attemptsRemaining: OTP_CONFIG.MAX_ATTEMPTS - newAttempts,
          },
        };
      }

      // OTP verified successfully - mark as used
      await supabase
        .from("family_otp_verification")
        .update({
          used: true,
          used_at: new Date().toISOString(),
        })
        .eq("id", options.sessionId);

      await this.logSecurityEvent("otp_verified_success", {
        sessionId: options.sessionId,
        hashedIdentifier: otpRecord.recipient_npub,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      });

      return {
        success: true,
        data: {
          hashedIdentifier: otpRecord.recipient_npub,
        },
      };
    } catch (error) {
      console.error("OTP verification error:", error);
      return { success: false, error: "Verification failed" };
    }
  }

  /**
   * Check rate limits for OTP operations
   */
  static async checkRateLimit(
    key: string,
    maxRequests: number,
    windowMinutes: number = 60
  ): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - windowMinutes);

    try {
      // Use Supabase function if available, otherwise implement simple rate limiting
      const { data, error } = await supabase.rpc("check_rate_limit", {
        p_key: key,
        p_window_start: windowStart.toISOString(),
        p_max_requests: maxRequests,
      });

      if (error) {
        console.warn("Rate limit check failed, allowing request:", error);
        // Fail open - allow the request if rate limiting fails
        return {
          allowed: true,
          remaining: maxRequests,
          resetTime: new Date(Date.now() + windowMinutes * 60 * 1000),
        };
      }

      const totalHits = data?.[0]?.total_hits || 0;
      const allowed = totalHits <= maxRequests;
      const remaining = Math.max(0, maxRequests - totalHits);

      const resetTime = new Date(windowStart);
      resetTime.setMinutes(resetTime.getMinutes() + windowMinutes);

      return { allowed, remaining, resetTime };
    } catch (error) {
      console.warn("Rate limit check error, failing open:", error);
      // Fail open - allow the request if there's an error
      return {
        allowed: true,
        remaining: maxRequests,
        resetTime: new Date(Date.now() + windowMinutes * 60 * 1000),
      };
    }
  }

  /**
   * Clean up expired OTP records
   */
  static async cleanupExpiredOTPs(): Promise<number> {
    try {
      const { count, error } = await supabase
        .from("family_otp_verification")
        .delete({ count: "exact" })
        .lt("expires_at", new Date().toISOString());

      if (error) {
        console.error("Failed to cleanup expired OTPs:", error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error("Cleanup error:", error);
      return 0;
    }
  }

  /**
   * Log security events for monitoring
   */
  private static async logSecurityEvent(
    eventType: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await supabase.from("security_audit_log").insert({
        event_type: eventType,
        details,
        ip_address: details.ipAddress,
        user_agent: details.userAgent,
        session_id: details.sessionId,
      });
    } catch (error) {
      console.error("Failed to log security event:", error);
      // Don't throw - logging failures shouldn't break auth flow
    }
  }

  /**
   * Get OTP statistics for monitoring (privacy-safe)
   */
  static async getOTPStatistics(hours: number = 24): Promise<{
    totalCreated: number;
    totalVerified: number;
    totalExpired: number;
    totalFailed: number;
    averageAttempts: number;
  }> {
    try {
      const since = new Date();
      since.setHours(since.getHours() - hours);

      const { data: auditLogs } = await supabase
        .from("security_audit_log")
        .select("event_type, details")
        .gte("timestamp", since.toISOString())
        .in("event_type", [
          "otp_created",
          "otp_verified_success",
          "otp_verify_failed",
        ]);

      const stats = {
        totalCreated: 0,
        totalVerified: 0,
        totalExpired: 0,
        totalFailed: 0,
        totalAttempts: 0,
        attemptCount: 0,
      };

      auditLogs?.forEach((log) => {
        switch (log.event_type) {
          case "otp_created":
            stats.totalCreated++;
            break;
          case "otp_verified_success":
            stats.totalVerified++;
            break;
          case "otp_verify_failed":
            stats.totalFailed++;
            if (log.details?.reason === "expired") stats.totalExpired++;
            if (log.details?.attempts) {
              stats.totalAttempts += log.details.attempts;
              stats.attemptCount++;
            }
            break;
        }
      });

      return {
        totalCreated: stats.totalCreated,
        totalVerified: stats.totalVerified,
        totalExpired: stats.totalExpired,
        totalFailed: stats.totalFailed,
        averageAttempts:
          stats.attemptCount > 0 ? stats.totalAttempts / stats.attemptCount : 0,
      };
    } catch (error) {
      console.error("Failed to get OTP statistics:", error);
      return {
        totalCreated: 0,
        totalVerified: 0,
        totalExpired: 0,
        totalFailed: 0,
        averageAttempts: 0,
      };
    }
  }
}
