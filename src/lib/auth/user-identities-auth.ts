/**
 * User Identities Authentication System
 * Replaces privacy-first-auth.ts to work with user_identities table
 * Maintains all security features while using the correct database schema
 */

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("../supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

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

  // MAXIMUM ENCRYPTION: Hashed columns only - no plaintext storage
  hashed_username?: string;
  hashed_npub?: string;
  hashed_nip05?: string;
  hashed_lightning_address?: string;
  hashed_encrypted_nsec?: string;

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
   * Authenticate user with NIP-07 browser extension (no password)
   * Generates DUID using npub only (stable across methods)
   */
  async authenticateNIP07(credentials: AuthCredentials): Promise<AuthResult> {
    try {
      if (!credentials.pubkey || !credentials.signature) {
        return {
          success: false,
          error: "Missing pubkey or signature",
        };
      }

      // Import DUID generation utilities
      const { generateDUID } = await import(
        "../../../lib/security/duid-generator"
      );

      // Convert hex pubkey to npub format if needed
      let npub = credentials.pubkey;
      if (!npub.startsWith("npub1")) {
        const { central_event_publishing_service } = await import(
          "../../../lib/central_event_publishing_service"
        );
        npub = central_event_publishing_service.encodeNpub(credentials.pubkey);
      }

      // Generate DUID using npub only (stable across auth methods)
      const deterministicUserId = await generateDUID(npub);

      // Direct O(1) database lookup using DUID
      const { data: user, error: userError } = await (await getSupabaseClient())
        .from("user_identities")
        .select("*")
        .eq("id", deterministicUserId)
        .eq("is_active", true)
        .single();

      if (userError || !user) {
        await this.logAuthAttempt({
          user_id: deterministicUserId,
          attempt_result: "invalid_nip05", // Using existing type
        });
        return { success: false, error: "Invalid NIP-07 credentials" };
      }

      // Check if account is locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        await this.logAuthAttempt({
          user_id: user.id,
          attempt_result: "account_locked",
        });
        return {
          success: false,
          error:
            "Account is temporarily locked due to too many failed attempts",
        };
      }

      // NIP-07 authentication successful - reset failed attempts
      await this.handleSuccessfulAuth(
        user.id,
        credentials.pubkey || "nip07_auth"
      );

      // Session tokens are issued by server; perform a server-side signin to get token
      try {
        const response = await fetch("/api/auth/nip07-signin", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challenge: credentials.challenge,
            signature: credentials.signature,
            pubkey: credentials.pubkey,
          }),
        });
        if (response.ok) {
          const json = await response.json();
          return json as AuthResult;
        }
      } catch (e) {
        // Fall through
      }

      return {
        success: false,
        error: "NIP-07 authentication failed at server endpoint",
      };
    } catch (error) {
      console.error("NIP-07 authentication error:", error);
      return { success: false, error: "NIP-07 authentication failed" };
    }
  }

  /**
   * Authenticate user with NIP-05 and password
   */
  async authenticateNIP05Password(
    credentials: AuthCredentials
  ): Promise<AuthResult> {
    try {
      if (!credentials.nip05 || !credentials.password) {
        return { success: false, error: "Missing NIP-05 or password" };
      }

      // Validate NIP-05 format and domain
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

      // DETERMINISTIC USER ID: O(1) authentication lookup using DUID
      // Import DUID generation utilities
      const { generateDUIDFromNIP05 } = await import(
        "../../../lib/security/duid-generator"
      );

      // Generate DUID from NIP-05 (password is not part of DUID derivation)
      const deterministicUserId = await generateDUIDFromNIP05(
        credentials.nip05.trim().toLowerCase()
      );

      if (!deterministicUserId) {
        await this.logAuthAttempt({
          nip05: credentials.nip05,
          attempt_result: "invalid_nip05",
        });
        return { success: false, error: "Failed to resolve NIP-05 identifier" };
      }

      // Direct O(1) database lookup using DUID
      const { data: user, error: userError } = await (await getSupabaseClient())
        .from("user_identities")
        .select("*")
        .eq("id", deterministicUserId)
        .eq("is_active", true)
        .single();

      if (userError || !user) {
        await this.logAuthAttempt({
          nip05: credentials.nip05,
          attempt_result: "invalid_nip05",
        });
        return { success: false, error: "Invalid credentials" };
      }

      if (!user) {
        await this.logAuthAttempt({
          nip05: credentials.nip05,
          attempt_result: "invalid_nip05",
        });
        return { success: false, error: "Invalid credentials" };
      }

      // Check if account is locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        await this.logAuthAttempt({
          user_id: user.id,
          nip05: credentials.nip05,
          attempt_result: "account_locked",
        });
        return {
          success: false,
          error:
            "Account is temporarily locked due to too many failed attempts",
        };
      }

      // Verify password
      const isValidPassword = await PasswordUtils.verifyPassword(
        credentials.password,
        user.password_hash,
        user.password_salt
      );

      if (!isValidPassword) {
        await this.handleFailedAttempt(user.id, credentials.nip05);
        return { success: false, error: "Invalid credentials" };
      }

      // Password is valid - reset failed attempts and update last auth
      await this.handleSuccessfulAuth(user.id, credentials.nip05);

      // Session tokens are issued by server; perform server-side signin to get token
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
        if (response.ok) {
          const json = await response.json();
          return json as AuthResult;
        }
      } catch (e) {
        // Fall through
      }

      return {
        success: false,
        error: "NIP-05/password authentication failed at server endpoint",
      };
    } catch (error) {
      console.error("Authentication error:", error);
      return { success: false, error: "Authentication failed" };
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
      const { data: user } = await (await getSupabaseClient())
        .from("user_identities")
        .select("failed_attempts")
        .eq("id", userId)
        .single();

      if (user) {
        const newFailedAttempts = (user.failed_attempts || 0) + 1;
        const shouldLock =
          newFailedAttempts >= UserIdentitiesAuth.MAX_FAILED_ATTEMPTS;

        // Update failed attempts and potentially lock account using user ID
        await (
          await getSupabaseClient()
        )
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
      await (
        await getSupabaseClient()
      )
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
      await (await getSupabaseClient()).from("user_auth_attempts").insert([
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
      const { data: user, error } = await (await getSupabaseClient())
        .from("user_identities")
        .select("*")
        .eq("id", userId)
        .eq("is_active", true)
        .single();

      if (error || !user) {
        console.error("Failed to retrieve user:", error);
        return null;
      }

      return user as UserIdentity;
    } catch (error) {
      console.error("Error retrieving user:", error);
      return null;
    }
  }
}

// Export singleton instance
export const userIdentitiesAuth = new UserIdentitiesAuth();
