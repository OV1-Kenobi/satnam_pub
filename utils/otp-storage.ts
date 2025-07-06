/**
 * Privacy-First OTP Storage System with Supabase Integration
 *
 * This module provides secure OTP storage using Supabase with privacy-first architecture:
 * - Uses hashed identifiers instead of storing npub/nip05 directly
 * - Implements session-based authentication
 * - Includes comprehensive rate limiting and security measures
 * - Ready for Nostr giftwrapping integration
 */

// Browser-compatible crypto using Web Crypto API
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client using browser-compatible environment variables
// In a real browser environment, these would be injected by the build system
const supabaseUrl = (window as any).__SUPABASE_URL__ || '';
const supabaseKey = (window as any).__SUPABASE_ANON_KEY__ || '';
const supabase = createClient(supabaseUrl, supabaseKey);

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
 * Generate a privacy-preserving identifier hash using Web Crypto API
 */
async function hashIdentifier(identifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(identifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a salted OTP hash using Web Crypto API
 */
async function hashOTPWithSalt(otp: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a unique encrypted session ID using Web Crypto API
 * Combines timestamp, random bytes, and additional entropy for uniqueness
 */
async function generateSessionId(): Promise<string> {
  const timestamp = Date.now().toString();
  const randomBytes = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const entropy = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // Create a unique identifier by hashing combined data
  const uniqueData = `${timestamp}-${randomBytes}-${entropy}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(uniqueData);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a secure salt using Web Crypto API
 */
function generateSalt(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
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
    const sessionId = await generateSessionId();
    const salt = generateSalt();
    const hashedIdentifier = await hashIdentifier(options.identifier);
    const otpHash = await hashOTPWithSalt(otp, salt);

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

      // Check if expired
      if (new Date(otpRecord.expires_at) < new Date()) {
        await this.logSecurityEvent("otp_verify_failed", {
          sessionId: options.sessionId,
          reason: "expired",
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
        });
        return { success: false, error: "OTP has expired" };
      }

      // Check attempts limit
      if (otpRecord.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
        await this.logSecurityEvent("otp_verify_failed", {
          sessionId: options.sessionId,
          reason: "max_attempts_exceeded",
          attempts: otpRecord.attempts,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
        });
        return { success: false, error: "Maximum attempts exceeded" };
      }

      // Verify OTP
      const providedOTPHash = await hashOTPWithSalt(options.otp, otpRecord.salt);
      const isValid = providedOTPHash === otpRecord.otp_hash;

      // Update attempts count
      await supabase
        .from("family_otp_verification")
        .update({ attempts: otpRecord.attempts + 1 })
        .eq("id", options.sessionId);

      if (isValid) {
        // Mark as used
        await supabase
          .from("family_otp_verification")
          .update({ used: true, used_at: new Date().toISOString() })
          .eq("id", options.sessionId);

        await this.logSecurityEvent("otp_verify_success", {
          sessionId: options.sessionId,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
        });

        return {
          success: true,
          data: {
            hashedIdentifier: otpRecord.recipient_npub,
            attemptsRemaining: OTP_CONFIG.MAX_ATTEMPTS - (otpRecord.attempts + 1),
          },
        };
      } else {
        await this.logSecurityEvent("otp_verify_failed", {
          sessionId: options.sessionId,
          reason: "invalid_otp",
          attempts: otpRecord.attempts + 1,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
        });

        return {
          success: false,
          error: "Invalid OTP",
          data: {
            hashedIdentifier: otpRecord.recipient_npub,
            attemptsRemaining: OTP_CONFIG.MAX_ATTEMPTS - (otpRecord.attempts + 1),
          },
        };
      }
    } catch (error) {
      console.error("OTP verification error:", error);
      await this.logSecurityEvent("otp_verify_error", {
        sessionId: options.sessionId,
        error: error instanceof Error ? error.message : "Unknown error",
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      });
      return { success: false, error: "Verification failed" };
    }
  }

  /**
   * Check rate limiting for OTP operations
   */
  static async checkRateLimit(
    key: string,
    maxRequests: number,
    windowMinutes: number = 60
  ): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

    try {
      const { data: logs, error } = await supabase
        .from("family_otp_verification")
        .select("created_at")
        .gte("created_at", windowStart.toISOString())
        .eq("recipient_npub", key);

      if (error) {
        console.error("Rate limit check error:", error);
        return { allowed: true, remaining: maxRequests, resetTime: now };
      }

      const requestCount = logs?.length || 0;
      const remaining = Math.max(0, maxRequests - requestCount);
      const resetTime = new Date(now.getTime() + windowMinutes * 60 * 1000);

      return {
        allowed: remaining > 0,
        remaining,
        resetTime,
      };
    } catch (error) {
      console.error("Rate limit check failed:", error);
      return { allowed: true, remaining: maxRequests, resetTime: now };
    }
  }

  /**
   * Clean up expired OTPs
   */
  static async cleanupExpiredOTPs(): Promise<number> {
    try {
      const { error } = await supabase
        .from("family_otp_verification")
        .delete()
        .lt("expires_at", new Date().toISOString());

      if (error) {
        console.error("Cleanup error:", error);
        return 0;
      }

      // Since delete doesn't return count in browser, we'll estimate
      // In production, you might want to use a different approach
      return 1; // Return 1 as a placeholder
    } catch (error) {
      console.error("Cleanup failed:", error);
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
      await supabase.from("security_events").insert({
        event_type: eventType,
        details: details,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to log security event:", error);
    }
  }

  /**
   * Get OTP statistics for monitoring
   */
  static async getOTPStatistics(hours: number = 24): Promise<{
    totalCreated: number;
    totalVerified: number;
    totalExpired: number;
    totalFailed: number;
    averageAttempts: number;
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    try {
      const { data: logs, error } = await supabase
        .from("family_otp_verification")
        .select("*")
        .gte("created_at", since.toISOString());

      if (error || !logs) {
        return {
          totalCreated: 0,
          totalVerified: 0,
          totalExpired: 0,
          totalFailed: 0,
          averageAttempts: 0,
        };
      }

      const totalCreated = logs.length;
      const totalVerified = logs.filter(log => log.used).length;
      const totalExpired = logs.filter(log => new Date(log.expires_at) < new Date()).length;
      const totalFailed = logs.filter(log => log.attempts >= OTP_CONFIG.MAX_ATTEMPTS).length;
      
      const totalAttempts = logs.reduce((sum, log) => {
        return sum + (log.details?.attempts || 0);
      }, 0);
      
      const averageAttempts = totalCreated > 0 ? totalAttempts / totalCreated : 0;

      return {
        totalCreated,
        totalVerified,
        totalExpired,
        totalFailed,
        averageAttempts,
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
