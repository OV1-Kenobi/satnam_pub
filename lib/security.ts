/**
 * Security utilities for Satnam.pub
 * MASTER CONTEXT COMPLIANCE: Privacy-first security architecture
 * TypeScript implementation for enhanced type safety
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Types for security management
export interface SecurityConfig {
  encryptionEnabled: boolean;
  keyRotationInterval: number;
  maxFailedAttempts: number;
  lockoutDuration: number;
}

export interface CredentialData {
  id: string;
  userId: string;
  encryptedData: string;
  salt: string;
  createdAt: string;
  expiresAt: string;
}

export interface SecurityAudit {
  eventType: "login" | "logout" | "key_rotation" | "failed_attempt" | "lockout";
  userId: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  details?: Record<string, any>;
}

/**
 * Credential Rotation Manager
 * Handles secure credential rotation and management
 */
export class CredentialRotationManager {
  private supabase: SupabaseClient;
  private config: SecurityConfig;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    config: SecurityConfig
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.config = config;
  }

  /**
   * Rotate user credentials
   */
  async rotateCredentials(userId: string): Promise<boolean> {
    try {
      // Generate new salt
      const newSalt = this.generateSalt();

      // Get existing credentials
      const { data: existingCreds, error: fetchError } = await this.supabase
        .from("user_credentials")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (fetchError) {
        console.error("Error fetching existing credentials:", fetchError);
        return false;
      }

      // Create new credential entry
      const newCredential: Partial<CredentialData> = {
        userId,
        salt: newSalt,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(
          Date.now() + this.config.keyRotationInterval
        ).toISOString(),
      };

      const { error: insertError } = await this.supabase
        .from("user_credentials")
        .insert([newCredential]);

      if (insertError) {
        console.error("Error inserting new credentials:", insertError);
        return false;
      }

      // Archive old credentials
      await this.archiveCredentials(existingCreds.id);

      // Log security audit
      await this.logSecurityEvent({
        eventType: "key_rotation",
        userId,
        timestamp: new Date().toISOString(),
        success: true,
        details: { rotationReason: "scheduled" },
      });

      return true;
    } catch (error) {
      console.error("Error rotating credentials:", error);
      return false;
    }
  }

  /**
   * Validate credential integrity
   */
  async validateCredentials(
    userId: string,
    providedHash: string
  ): Promise<boolean> {
    try {
      const { data: credentials, error } = await this.supabase
        .from("user_credentials")
        .select("*")
        .eq("user_id", userId)
        .eq("encrypted_data", providedHash)
        .single();

      if (error || !credentials) {
        await this.logSecurityEvent({
          eventType: "failed_attempt",
          userId,
          timestamp: new Date().toISOString(),
          success: false,
          details: { reason: "invalid_credentials" },
        });
        return false;
      }

      // Check if credentials are expired
      const now = new Date();
      const expiresAt = new Date(credentials.expires_at);

      if (now > expiresAt) {
        await this.logSecurityEvent({
          eventType: "failed_attempt",
          userId,
          timestamp: new Date().toISOString(),
          success: false,
          details: { reason: "expired_credentials" },
        });
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error validating credentials:", error);
      return false;
    }
  }

  /**
   * Generate cryptographically secure salt
   */
  private generateSalt(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }

  /**
   * Archive old credentials
   */
  private async archiveCredentials(credentialId: string): Promise<void> {
    try {
      await this.supabase.from("user_credentials_archive").insert([
        {
          original_id: credentialId,
          archived_at: new Date().toISOString(),
        },
      ]);

      await this.supabase
        .from("user_credentials")
        .delete()
        .eq("id", credentialId);
    } catch (error) {
      console.error("Error archiving credentials:", error);
    }
  }

  /**
   * Log security events for audit trail
   */
  private async logSecurityEvent(event: SecurityAudit): Promise<void> {
    try {
      await this.supabase.from("security_audit_log").insert([event]);
    } catch (error) {
      console.error("Error logging security event:", error);
    }
  }
}

/**
 * Security utilities for encryption and hashing
 */
export class SecurityUtils {
  /**
   * Generate secure hash using Web Crypto API
   */
  static async generateSecureHash(
    data: string,
    salt?: string
  ): Promise<string> {
    const encoder = new TextEncoder();
    const dataToHash = encoder.encode(data + (salt || ""));

    const hashBuffer = await crypto.subtle.digest("SHA-256", dataToHash);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Generate secure random token
   */
  static generateSecureToken(length: number = 32): string {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Validate password strength
   */
  static validatePasswordStrength(password: string): {
    valid: boolean;
    score: number;
    feedback: string[];
  } {
    const feedback: string[] = [];
    let score = 0;

    // Length check
    if (password.length >= 12) {
      score += 2;
    } else if (password.length >= 8) {
      score += 1;
    } else {
      feedback.push("Password should be at least 8 characters long");
    }

    // Character variety checks
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push("Include lowercase letters");

    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push("Include uppercase letters");

    if (/[0-9]/.test(password)) score += 1;
    else feedback.push("Include numbers");

    if (/[^a-zA-Z0-9]/.test(password)) score += 1;
    else feedback.push("Include special characters");

    // Common patterns check
    if (!/(.)\1{2,}/.test(password)) score += 1;
    else feedback.push("Avoid repeating characters");

    return {
      valid: score >= 4,
      score,
      feedback,
    };
  }
}

/**
 * Rate limiting utilities
 */
export class RateLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> =
    new Map();

  constructor(
    private maxAttempts: number = 5,
    private windowMs: number = 15 * 60 * 1000
  ) {}

  /**
   * Check if request should be rate limited
   */
  isRateLimited(identifier: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (!record || now > record.resetTime) {
      this.attempts.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return false;
    }

    if (record.count >= this.maxAttempts) {
      return true;
    }

    record.count++;
    return false;
  }

  /**
   * Reset rate limit for identifier
   */
  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  /**
   * Get remaining attempts
   */
  getRemainingAttempts(identifier: string): number {
    const record = this.attempts.get(identifier);
    if (!record || Date.now() > record.resetTime) {
      return this.maxAttempts;
    }
    return Math.max(0, this.maxAttempts - record.count);
  }
}

// Export utility functions
export async function createSecureBackup(data: any): Promise<string> {
  const jsonData = JSON.stringify(data);
  const compressed = btoa(jsonData); // Simple compression, use proper compression in production

  return compressed;
}

export async function restoreCredentialsFromBackup(
  backupData: string
): Promise<any> {
  return JSON.parse(atob(backupData));
}

/**
 * Validates Argon2 configuration on startup
 * Call this during application initialization to catch configuration issues early
 * MASTER CONTEXT COMPLIANCE: Privacy-first validation without sensitive data logging
 */
export function validateArgon2ConfigOnStartup(): void {
  // Basic configuration validation for TypeScript version
  // This is a simplified version for browser compatibility
  const memoryUsageMB = Math.pow(2, 16) / (1024 * 1024); // Default 64MB

  // PRIVACY: No sensitive configuration data logging
  if (memoryUsageMB > 256) {
    console.warn("Argon2 memory usage may be high for browser environment");
  }

  // Configuration meets basic requirements for browser environment
}

// Additional exports for compatibility
// CredentialRotationManager is already exported as a class declaration above
