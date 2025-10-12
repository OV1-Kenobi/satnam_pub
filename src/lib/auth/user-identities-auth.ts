/**
 * User Identities Authentication System
 * Replaces privacy-first-auth.ts to work with user_identities table
 * Maintains all security features while using the correct database schema
 */

import { resolvePlatformLightningDomain } from "../../config/domain.client";
import { supabase } from "../supabase";

/**

 * Web Crypto API utilities for browser-only serverless architecture
 */
class CryptoUtils {
  /**
   * Get Web Crypto API instance with fallback handling
   */
  static getCrypto(): Crypto {
    const crypto =
      globalThis.crypto ||
      (typeof window !== "undefined" ? window.crypto : null);
    if (!crypto) {
      throw new Error(
        "Web Crypto API not available - browser-only serverless architecture requires modern browser"
      );
    }
    return crypto;
  }

  /**
   * Get SubtleCrypto instance with availability check
   */
  static getSubtleCrypto(): SubtleCrypto {
    const crypto = this.getCrypto();
    if (!crypto.subtle) {
      throw new Error(
        "SubtleCrypto not available - secure context (HTTPS) required"
      );
    }
    return crypto.subtle;
  }

  /**
   * Generate cryptographically secure random bytes
   */
  static getRandomBytes(length: number): Uint8Array {
    const crypto = this.getCrypto();
    return crypto.getRandomValues(new Uint8Array(length));
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  static arrayBufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  /**
   * Convert base64 string to Uint8Array
   */
  static base64ToUint8Array(base64: string): Uint8Array {
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  }
}

// Types for authentication
export interface AuthCredentials {
  nip05?: string;
  username?: string;
  password?: string;
  // Legacy support for existing patterns
  nsecKey?: string;
  pubkey?: string;
  otpCode?: string;
  // Additional properties for compatibility
  identifier?: string;
  challenge?: string;
  signature?: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  user?: UserIdentity;
  sessionToken?: string;
  session?: any; // For backward compatibility
  requiresOnboarding?: boolean; // For backward compatibility
}

export interface UserIdentity {
  id: string;
  user_salt: string; // Unique salt for this user

  // Encrypted nsec storage (decryptable)
  encrypted_nsec?: string;
  encrypted_nsec_iv?: string | null;

  // MAXIMUM ENCRYPTION: Hashed columns only - no plaintext storage
  hashed_username?: string;
  hashed_npub?: string;
  hashed_nip05?: string;
  hashed_lightning_address?: string;

  // Password security
  password_hash: string;
  password_salt: string;
  password_created_at?: string;
  password_updated_at?: string;
  failed_attempts: number;
  locked_until?: string;
  requires_password_change?: boolean;

  // Metadata (non-sensitive)
  role: string;
  spending_limits?: Record<string, any>;
  privacy_settings?: {
    privacy_level: "maximum";
    zero_knowledge_enabled: true;
    over_encryption: true;
    is_imported_account?: boolean;
    detected_profile_data?: any;
  };
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  last_successful_auth?: string;

  // Additional properties for compatibility
  federationRole?: "private" | "offspring" | "adult" | "steward" | "guardian";
  familyId?: string; // Optional family federation ID - only for family federation members
  hashedUUID?: string;
  hashedId?: string; // HMAC-SHA256 protected identifier for secure tokens
  authMethod?: "nip05-password" | "nip07" | "otp" | "nsec";
  isWhitelisted?: boolean;
  votingPower?: number;
  stewardApproved?: boolean;
  guardianApproved?: boolean;
}

export interface AuthAttempt {
  user_id?: string;
  nip05?: string;
  username?: string;
  attempt_result:
    | "success"
    | "invalid_nip05"
    | "invalid_password"
    | "invalid_username"
    | "account_locked"
    | "rate_limited";
  client_info_hash?: string;
  ip_address_hash?: string;
}

/**
 * Password hashing utilities (matching register-identity.js)
 */
class PasswordUtils {
  /**
   * Hash password using PBKDF2 with SHA-512 (Web Crypto API only)
   */
  static async hashPassword(password: string, salt: string): Promise<string> {
    const iterations = 100000;
    const keyLength = 64;

    try {
      // Use Web Crypto API for browser-only serverless architecture
      const subtle = CryptoUtils.getSubtleCrypto();
      const encoder = new TextEncoder();
      const passwordBuffer = encoder.encode(password);
      const saltBuffer = encoder.encode(salt);

      const keyMaterial = await subtle.importKey(
        "raw",
        passwordBuffer,
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
      );

      const derivedBits = await subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: saltBuffer,
          iterations: iterations,
          hash: "SHA-512",
        },
        keyMaterial,
        keyLength * 8
      );

      return CryptoUtils.arrayBufferToBase64(derivedBits);
    } catch (error) {
      console.error("Password hashing failed:", error);
      throw new Error("Password hashing failed");
    }
  }

  /**
   * Verify password using timing-safe comparison (Web Crypto API only)
   */
  static async verifyPassword(
    password: string,
    storedHash: string,
    salt: string
  ): Promise<boolean> {
    try {
      const computedHash = await this.hashPassword(password, salt);

      // Browser-only timing-safe comparison using constant-time algorithm
      const storedBuffer = CryptoUtils.base64ToUint8Array(storedHash);
      const computedBuffer = CryptoUtils.base64ToUint8Array(computedHash);

      if (storedBuffer.length !== computedBuffer.length) {
        return false;
      }

      // Constant-time comparison to prevent timing attacks
      let result = 0;
      for (let i = 0; i < storedBuffer.length; i++) {
        result |= storedBuffer[i] ^ computedBuffer[i];
      }
      return result === 0;
    } catch (error) {
      console.error("Password verification failed:", error);
      return false;
    }
  }
}

/**
 * NIP-05 validation utilities
 */
class NIP05Utils {
  private static readonly WHITELISTED_DOMAINS = [
    "satnam.pub",
    "citadel.academy",
  ];

  /**
   * Validate NIP-05 format and domain whitelist
   */
  static validateNIP05(nip05: string): {
    valid: boolean;
    error?: string;
    domain?: string;
  } {
    if (!nip05 || typeof nip05 !== "string") {
      return { valid: false, error: "NIP-05 identifier is required" };
    }

    const trimmed = nip05.trim().toLowerCase();

    // Check format: name@domain
    const parts = trimmed.split("@");
    if (parts.length !== 2) {
      return { valid: false, error: "NIP-05 must be in format: name@domain" };
    }

    const [name, domain] = parts;

    // Validate name part
    if (!name || name.length < 1) {
      return { valid: false, error: "NIP-05 name cannot be empty" };
    }

    if (!/^[a-z0-9_-]+$/.test(name)) {
      return {
        valid: false,
        error:
          "NIP-05 name can only contain lowercase letters, numbers, underscores, and hyphens",
      };
    }

    // Validate domain whitelist
    if (!this.WHITELISTED_DOMAINS.includes(domain)) {
      return {
        valid: false,
        error: `Domain ${domain} is not whitelisted. Allowed domains: ${this.WHITELISTED_DOMAINS.join(
          ", "
        )}`,
      };
    }

    return { valid: true, domain };
  }
}

/**
 * Main authentication class for user_identities table
 */
export class UserIdentitiesAuth {
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_MINUTES = 30;

  /**
   * CLIENT-SIDE: Resolve npub to NIP-05 identifier using public .well-known/nostr.json
   * This method runs in the browser and fetches public NIP-05 records
   * @param pubkey - Nostr public key (hex format)
   * @returns NIP-05 identifier (username@domain) or null if not found
   */
  private async resolveNpubToNIP05(pubkey: string): Promise<string | null> {
    try {
      // Validate input pubkey format
      if (!pubkey || typeof pubkey !== "string") {
        console.error("Invalid pubkey format");
        return null;
      }

      // Fetch the public NIP-05 JSON from .well-known endpoint
      // Consider using absolute URL or environment variable for production
      const baseUrl = window.location.origin;
      const response = await fetch(`${baseUrl}/.well-known/nostr.json`);

      if (!response.ok) {
        console.error("Failed to fetch NIP-05 records:", response.status);
        return null;
      }

      // Validate content type
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("Invalid response type from NIP-05 endpoint");
        return null;
      }

      const nip05Data = await response.json();

      if (!nip05Data.names || typeof nip05Data.names !== "object") {
        console.error("Invalid NIP-05 JSON format");
        return null;
      }

      // Convert pubkey to npub format for comparison (CLIENT-SIDE OPERATION)
      let npubToFind = pubkey;
      if (!pubkey.startsWith("npub1")) {
        try {
          const { nip19 } = await import("nostr-tools");
          npubToFind = nip19.npubEncode(pubkey);
        } catch (error) {
          console.error("Failed to encode pubkey to npub:", error);
          return null;
        }
      }

      // Search for the npub in the names object (CLIENT-SIDE OPERATION)
      for (const [username, npub] of Object.entries(nip05Data.names)) {
        // Ensure npub is a string before comparison
        if (typeof npub !== "string") {
          continue;
        }
        if (npub === npubToFind) {
          const domain = resolvePlatformLightningDomain();
          return `${username}@${domain}`;
        }
      }

      return null; // npub not found in NIP-05 records
    } catch (error) {
      console.error("Error resolving npub to NIP-05:", error);
      return null;
    }
  }
  /**
   * Authenticate user with NIP-07 browser extension (server-only verification)
   * Delegates to /api/auth/nip07-signin to avoid client-side DUID generation
   */
  async authenticateNIP07(credentials: AuthCredentials): Promise<AuthResult> {
    // Require pubkey and signed challenge for secure verification
    if (
      !credentials.pubkey ||
      !credentials.signature ||
      !credentials.challenge
    ) {
      return {
        success: false,
        error: "Missing NIP-07 parameters (pubkey, signature, challenge)",
      };
    }

    try {
      const response = await fetch("/api/auth/nip07-signin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: credentials.pubkey,
          signature: credentials.signature,
          challenge: credentials.challenge,
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `NIP-07 signin failed (${response.status})`,
        };
      }

      const json = (await response.json()) as AuthResult;
      return json;
    } catch (error) {
      console.error("NIP-07 authentication error:", error);
      return { success: false, error: "NIP-07 authentication failed" };
    }
  }

  /**
   * Authenticate user with NIP-05 and password (server-only flow)
   * Delegates authentication to /api/auth/signin to avoid client-side DUID generation
   */
  async authenticateNIP05Password(
    credentials: AuthCredentials
  ): Promise<AuthResult> {
    if (!credentials.nip05 || !credentials.password) {
      return { success: false, error: "Missing NIP-05 or password" };
    }

    // Basic NIP-05 format validation only (no DUID operations client-side)
    const validation = NIP05Utils.validateNIP05(credentials.nip05);
    if (!validation.valid) {
      await this.logAuthAttempt({
        nip05: credentials.nip05,
        attempt_result: "invalid_nip05",
      });
      return {
        success: false,
        error: validation.error || "Invalid NIP-05 identifier",
      };
    }

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nip05: credentials.nip05,
          password: credentials.password,
          authMethod: "nip05-password",
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Server authentication failed (${response.status})`,
        };
      }

      const json = (await response.json()) as AuthResult;
      return json;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Authentication failed",
      };
    }
  }

  /**
   * Handle failed authentication attempt
   */
  private async handleFailedAttempt(
    userId: string,
    nip05: string
  ): Promise<void> {
    try {
      // MAXIMUM ENCRYPTION: Use user ID instead of plaintext nip05
      // Get current user data by ID (which is already hashed)
      const { data: user } = await supabase
        .from("user_identities")
        .select("failed_attempts")
        .eq("id", userId)
        .single();

      if (user) {
        const newFailedAttempts = (user.failed_attempts || 0) + 1;
        const shouldLock =
          newFailedAttempts >= UserIdentitiesAuth.MAX_FAILED_ATTEMPTS;

        // Update failed attempts and potentially lock account using user ID
        await supabase
          .from("user_identities")
          .update({
            failed_attempts: newFailedAttempts,
            last_attempt_at: new Date().toISOString(),
            locked_until: shouldLock
              ? new Date(
                  Date.now() + UserIdentitiesAuth.LOCKOUT_MINUTES * 60 * 1000
                ).toISOString()
              : null,
          })
          .eq("id", userId);
      }

      // Log the attempt
      await this.logAuthAttempt({
        user_id: userId,
        nip05: nip05,
        attempt_result: "invalid_password",
      });
    } catch (error) {
      console.error("Failed to handle failed attempt:", error);
    }
  }

  /**
   * Handle successful authentication
   */
  private async handleSuccessfulAuth(
    userId: string,
    nip05: string
  ): Promise<void> {
    try {
      // Reset failed attempts and update last successful auth
      await supabase
        .from("user_identities")
        .update({
          failed_attempts: 0,
          locked_until: null,
          last_successful_auth: new Date().toISOString(),
        })
        .eq("id", userId); // MAXIMUM ENCRYPTION: Use user ID instead of plaintext nip05

      // Log successful attempt
      await this.logAuthAttempt({
        user_id: userId,
        nip05: nip05,
        attempt_result: "success",
      });
    } catch (error) {
      console.error("Failed to handle successful auth:", error);
    }
  }

  /**
   * Log authentication attempt
   */
  private async logAuthAttempt(attempt: AuthAttempt): Promise<void> {
    try {
      await supabase.from("user_auth_attempts").insert([
        {
          user_id: attempt.user_id || null,
          nip05: attempt.nip05 || null,
          username: attempt.username || null,
          attempt_result: attempt.attempt_result,
          client_info_hash: attempt.client_info_hash || null,
          ip_address_hash: attempt.ip_address_hash || null,
        },
      ]);
    } catch (error) {
      console.error("Failed to log auth attempt:", error);
    }
  }

  /**
   * Get user by ID for secure operations (like nsec retrieval)
   */
  async getUserById(userId: string): Promise<UserIdentity | null> {
    try {
      console.log("🔐 UserIdentitiesAuth.getUserById: Starting user retrieval");
      console.log("🔐 UserIdentitiesAuth.getUserById: userId:", userId);

      const { data: user, error } = await supabase
        .from("user_identities")
        .select("*")
        .eq("id", userId)
        .eq("is_active", true)
        .single();

      console.log("🔐 UserIdentitiesAuth.getUserById: Query completed");
      console.log("🔐 UserIdentitiesAuth.getUserById: Error:", error);
      console.log("🔐 UserIdentitiesAuth.getUserById: User found:", !!user);

      if (user) {
        console.log(
          "🔐 UserIdentitiesAuth.getUserById: User keys:",
          Object.keys(user)
        );
        console.log(
          "🔐 UserIdentitiesAuth.getUserById: Has encrypted_nsec:",
          !!user.encrypted_nsec
        );
        console.log(
          "🔐 UserIdentitiesAuth.getUserById: Has user_salt:",
          !!user.user_salt
        );
        console.log(
          "🔐 UserIdentitiesAuth.getUserById: encrypted_nsec type:",
          typeof user.encrypted_nsec
        );
        console.log(
          "🔐 UserIdentitiesAuth.getUserById: encrypted_nsec length:",
          user.encrypted_nsec?.length
        );
        console.log(
          "🔐 UserIdentitiesAuth.getUserById: encrypted_nsec first 50 chars:",
          user.encrypted_nsec?.substring(0, 50)
        );
        console.log(
          "🔐 UserIdentitiesAuth.getUserById: user_salt type:",
          typeof user.user_salt
        );
        console.log(
          "🔐 UserIdentitiesAuth.getUserById: user_salt length:",
          user.user_salt?.length
        );
      }

      if (error || !user) {
        console.error(
          "🔐 UserIdentitiesAuth.getUserById: Failed to retrieve user:",
          error
        );
        return null;
      }

      return user as UserIdentity;
    } catch (error) {
      console.error(
        "🔐 UserIdentitiesAuth.getUserById: Error retrieving user:",
        error
      );
      return null;
    }
  }
}

// Export singleton instance
export const userIdentitiesAuth = new UserIdentitiesAuth();
