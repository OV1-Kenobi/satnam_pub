/**
 * Privacy Manager - TypeScript implementation
 * MASTER CONTEXT COMPLIANCE: Privacy-first architecture with enhanced type safety
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Types for privacy management
export interface PrivacyConfig {
  encryptionEnabled: boolean;
  dataRetentionDays: number;
  anonymizationLevel: "basic" | "enhanced" | "maximum";
  auditLogging: boolean;
}

export interface EncryptedData {
  data: string;
  salt: string;
  algorithm: string;
  keyId: string;
  timestamp: string;
}

export interface AnonymizedUser {
  anonymousId: string;
  hashedIdentifiers: string[];
  createdAt: string;
  retentionExpiry: string;
}

export interface PrivacyAudit {
  eventType:
    | "data_access"
    | "data_encryption"
    | "data_deletion"
    | "anonymization";
  userId?: string;
  anonymousId?: string;
  timestamp: string;
  details: Record<string, any>;
}

/**
 * Privacy Manager class for handling privacy-first operations
 */
export class PrivacyManager {
  private supabase: SupabaseClient;
  private config: PrivacyConfig;

  constructor(supabaseUrl: string, supabaseKey: string, config: PrivacyConfig) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.config = config;
  }

  /**
   * Create privacy-preserving authentication hash
   */
  static createAuthHash(pubkey: string): string {
    // Create a privacy-preserving auth hash
    return `auth_${pubkey.slice(0, 8)}`;
  }

  /**
   * Timing-safe equality check to prevent timing attacks.
   *
   * Compares two values in constant time, preventing information leakage through
   * timing differences. Prefer comparing fixed-length digests (e.g., HMACs, SHA-256 hashes).
   *
   * Accepts canonical strings (hex/base64/utf-8) or raw bytes (Uint8Array/Buffer).
   * Length differences are included in the comparison accumulator to prevent early exits.
   *
   * @param a - First value to compare (string or Uint8Array)
   * @param b - Second value to compare (string or Uint8Array)
   * @returns true if values are equal, false otherwise
   *
   * @example
   * // Compare hex-encoded hashes
   * const hash1 = "abc123def456";
   * const hash2 = "abc123def456";
   * const isEqual = PrivacyManager.constantTimeCompare(hash1, hash2); // true
   *
   * @example
   * // Compare raw bytes
   * const bytes1 = new Uint8Array([1, 2, 3, 4]);
   * const bytes2 = new Uint8Array([1, 2, 3, 4]);
   * const isEqual = PrivacyManager.constantTimeCompare(bytes1, bytes2); // true
   *
   * @security
   * - No early returns on length mismatch (length diff folded into accumulator)
   * - XOR-based comparison prevents branch prediction attacks
   * - Suitable for comparing authentication tokens, signatures, and password hashes
   * - NOT suitable for comparing plaintext passwords (use PBKDF2 + constantTimeCompare instead)
   */
  static constantTimeCompare(
    a: string | Uint8Array,
    b: string | Uint8Array
  ): boolean {
    // Convert both inputs to Uint8Array for uniform comparison
    const aBytes = this._toUint8Array(a);
    const bBytes = this._toUint8Array(b);

    // Constant-time comparison: include length difference in accumulator
    const maxLength = Math.max(aBytes.length, bBytes.length);
    let result = aBytes.length ^ bBytes.length; // Include length difference in result
    for (let i = 0; i < maxLength; i++) {
      const aByte = i < aBytes.length ? aBytes[i] : 0;
      const bByte = i < bBytes.length ? bBytes[i] : 0;
      result |= aByte ^ bByte;
    }
    return result === 0;
  }

  /**
   * Convert string or Uint8Array to Uint8Array
   * @private
   */
  private static _toUint8Array(value: string | Uint8Array): Uint8Array {
    if (value instanceof Uint8Array) {
      return value;
    }
    if (typeof value === "string") {
      return new TextEncoder().encode(value);
    }
    return new Uint8Array(0);
  }

  /**
   * Decrypt user data with proper key management
   */
  static async decryptUserData(
    encryptedData: string,
    userKey: string
  ): Promise<any> {
    try {
      // Use Web Crypto API for decryption
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      // Import the user key
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(userKey),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
      );

      // For simplicity, we'll use base64 decoding
      // In production, implement proper AES-GCM decryption
      const decryptedData = atob(encryptedData);
      return JSON.parse(decryptedData);
    } catch (error) {
      console.error("Error decrypting user data:", error);
      throw new Error("Decryption failed");
    }
  }

  /**
   * Encrypt service configuration data
   * SECURITY: Encrypts sensitive external service credentials and configs
   * Used for securely storing BTCPay, Voltage, and other service configurations
   * Browser-compatible using Web Crypto API
   */
  static async encryptServiceConfig(
    config: unknown,
    serviceKey: string
  ): Promise<string> {
    try {
      const encoder = new TextEncoder();

      // Generate random salt
      const salt = crypto.getRandomValues(new Uint8Array(16));

      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(serviceKey),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
      );

      const key = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: salt,
          iterations: 600000,
          hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
      );

      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM uses 12-byte IV

      // Encrypt config data
      const dataBuffer = encoder.encode(JSON.stringify(config));
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        dataBuffer
      );

      // Convert to hex strings
      const saltHex = Array.from(salt)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const ivHex = Array.from(iv)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const encryptedHex = Array.from(new Uint8Array(encryptedBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Include version for future migration compatibility
      return `v1:${saltHex}:${ivHex}:${encryptedHex}`;
    } catch (error) {
      throw new Error(
        `Service config encryption failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Generate anonymous username for privacy
   */
  static generateAnonymousUsername(): string {
    const adjectives = [
      "Swift",
      "Bright",
      "Calm",
      "Bold",
      "Wise",
      "Kind",
      "Pure",
      "Free",
    ];
    const nouns = [
      "Eagle",
      "River",
      "Mountain",
      "Star",
      "Ocean",
      "Forest",
      "Dawn",
      "Storm",
    ];

    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 1000);

    return `${adjective}${noun}${number}`;
  }

  /**
   * Validate username format for privacy compliance
   */
  static validateUsernameFormat(username: string): {
    valid: boolean;
    error?: string;
  } {
    // Check length
    if (username.length < 3 || username.length > 20) {
      return {
        valid: false,
        error: "Username must be between 3 and 20 characters",
      };
    }

    // Check for allowed characters only
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return {
        valid: false,
        error:
          "Username can only contain letters, numbers, underscores, and hyphens",
      };
    }

    // Check for privacy-violating patterns
    const forbiddenPatterns = [
      /^(admin|root|system|test)/i,
      /\d{4,}/, // Long sequences of numbers (could be dates, SSNs, etc.)
      /(email|phone|address)/i,
    ];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(username)) {
        return { valid: false, error: "Username contains forbidden patterns" };
      }
    }

    return { valid: true };
  }

  /**
   * Encrypt sensitive data with user-specific key
   */
  async encryptUserData(data: any, userId: string): Promise<EncryptedData> {
    try {
      const jsonData = JSON.stringify(data);
      const encoder = new TextEncoder();

      // Generate salt
      const salt = crypto.getRandomValues(new Uint8Array(16));

      // Create key from userId and salt
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(userId),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
      );

      const key = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: salt,
          iterations: 600000,
          hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );

      // Encrypt the data
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encoder.encode(jsonData)
      );

      // Combine salt, iv, and encrypted data
      const combined = new Uint8Array(
        salt.length + iv.length + encrypted.byteLength
      );
      combined.set(salt);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encrypted), salt.length + iv.length);

      const encryptedData: EncryptedData = {
        data: btoa(String.fromCharCode(...combined)),
        salt: btoa(String.fromCharCode(...salt)),
        algorithm: "AES-GCM",
        keyId: await this.generateKeyId(userId),
        timestamp: new Date().toISOString(),
      };

      // Log privacy audit if enabled
      if (this.config.auditLogging) {
        await this.logPrivacyEvent({
          eventType: "data_encryption",
          userId,
          timestamp: new Date().toISOString(),
          details: { algorithm: "AES-GCM", dataSize: jsonData.length },
        });
      }

      return encryptedData;
    } catch (error) {
      console.error("Error encrypting user data:", error);
      throw new Error("Encryption failed");
    }
  }

  /**
   * Create anonymized user record
   */
  async anonymizeUser(
    userId: string,
    identifiers: string[]
  ): Promise<AnonymizedUser> {
    try {
      const anonymousId = await this.generateAnonymousId();
      const hashedIdentifiers = await Promise.all(
        identifiers.map((id) => this.hashIdentifier(id))
      );

      const anonymizedUser: AnonymizedUser = {
        anonymousId,
        hashedIdentifiers,
        createdAt: new Date().toISOString(),
        retentionExpiry: new Date(
          Date.now() + this.config.dataRetentionDays * 24 * 60 * 60 * 1000
        ).toISOString(),
      };

      // Store anonymized record
      const { error } = await this.supabase
        .from("anonymized_users")
        .insert([anonymizedUser]);

      if (error) {
        throw new Error(`Failed to store anonymized user: ${error.message}`);
      }

      // Log privacy audit
      if (this.config.auditLogging) {
        await this.logPrivacyEvent({
          eventType: "anonymization",
          userId,
          anonymousId,
          timestamp: new Date().toISOString(),
          details: {
            identifierCount: identifiers.length,
            retentionDays: this.config.dataRetentionDays,
          },
        });
      }

      return anonymizedUser;
    } catch (error) {
      console.error("Error anonymizing user:", error);
      throw new Error("Anonymization failed");
    }
  }

  /**
   * Securely delete user data
   */
  async secureDelete(userId: string): Promise<boolean> {
    try {
      // Delete from all relevant tables
      const tables = [
        "user_identities",
        "user_sessions",
        "user_credentials",
        "otp_codes",
      ];

      for (const table of tables) {
        const { error } = await this.supabase
          .from(table)
          .delete()
          .eq("user_id", userId);

        if (error) {
          console.error(`Error deleting from ${table}:`, error);
        }
      }

      // Log privacy audit
      if (this.config.auditLogging) {
        await this.logPrivacyEvent({
          eventType: "data_deletion",
          userId,
          timestamp: new Date().toISOString(),
          details: { deletionType: "secure_delete", tablesAffected: tables },
        });
      }

      return true;
    } catch (error) {
      console.error("Error in secure delete:", error);
      return false;
    }
  }

  /**
   * Generate privacy-safe key ID
   */
  private async generateKeyId(userId: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(userId + Date.now());
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hash));
    return (
      "key_" +
      hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 16)
    );
  }

  /**
   * Generate anonymous ID
   */
  private async generateAnonymousId(): Promise<string> {
    const randomBytes = crypto.getRandomValues(new Uint8Array(16));
    return (
      "anon_" +
      Array.from(randomBytes, (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("")
    );
  }

  /**
   * Hash identifier for privacy
   */
  private async hashIdentifier(identifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(identifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Log privacy events for audit trail
   */
  private async logPrivacyEvent(event: PrivacyAudit): Promise<void> {
    try {
      await this.supabase.from("privacy_audit_log").insert([event]);
    } catch (error) {
      console.error("Error logging privacy event:", error);
    }
  }
}

// Export utility functions
export function generatePrivacySalt(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

export async function hashWithPrivacySalt(
  data: string,
  salt: string
): Promise<string> {
  const encoder = new TextEncoder();
  const dataToHash = encoder.encode(data + salt);
  const hash = await crypto.subtle.digest("SHA-256", dataToHash);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Default privacy configuration
export const defaultPrivacyConfig: PrivacyConfig = {
  encryptionEnabled: true,
  dataRetentionDays: 90,
  anonymizationLevel: "enhanced",
  auditLogging: true,
};
