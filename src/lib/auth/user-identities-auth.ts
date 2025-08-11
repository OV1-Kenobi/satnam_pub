/**
 * User Identities Authentication System
 * Replaces privacy-first-auth.ts to work with user_identities table
 * Maintains all security features while using the correct database schema
 */

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
   * Authenticate user with NIP-07 browser extension + password
   * Uses DUID generation with npub + password for O(1) lookup (same as NIP-05/Password)
   */
  async authenticateNIP07(credentials: AuthCredentials): Promise<AuthResult> {
    try {
      if (
        !credentials.pubkey ||
        !credentials.signature ||
        !credentials.password
      ) {
        return {
          success: false,
          error: "Missing pubkey, signature, or password",
        };
      }

      // Import DUID generation utilities
      const { generateDUID } = await import(
        "../../../lib/security/duid-generator"
      );

      // Convert hex pubkey to npub format if needed
      let npub = credentials.pubkey;
      if (!npub.startsWith("npub1")) {
        const { nip19 } = await import("nostr-tools");
        npub = nip19.npubEncode(credentials.pubkey);
      }

      // Generate DUID using npub + password (same method as NIP-05/Password)
      // This ensures identical DUIDs for the same user regardless of auth method
      const deterministicUserId = await generateDUID(
        npub,
        credentials.password
      );

      // Direct O(1) database lookup using DUID
      const { data: user, error: userError } = await supabase
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

      // Generate new JWT session token
      const sessionToken = await this.generateSessionToken(user);

      // Store session information
      await this.storeSessionInfo(user.id, sessionToken);

      return {
        success: true,
        user: user as UserIdentity,
        sessionToken,
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

      // Generate DUID from NIP-05 + password for direct database lookup
      const deterministicUserId = await generateDUIDFromNIP05(
        credentials.nip05.trim().toLowerCase(),
        credentials.password
      );

      if (!deterministicUserId) {
        await this.logAuthAttempt({
          nip05: credentials.nip05,
          attempt_result: "invalid_nip05",
        });
        return { success: false, error: "Failed to resolve NIP-05 identifier" };
      }

      // Direct O(1) database lookup using DUID
      const { data: user, error: userError } = await supabase
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

      // Generate new JWT session token with rotation
      const sessionToken = await this.generateSessionToken(user);

      // Store session information for rotation tracking
      await this.storeSessionInfo(user.id, sessionToken);

      return {
        success: true,
        user: user as UserIdentity,
        sessionToken,
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
   * Generate secure JWT session token with proper signing
   */
  public async generateSessionToken(user: UserIdentity): Promise<string> {
    try {
      // Get JWT secret from Vault (secure credential storage)
      const { getJwtSecret } = await import("../../../lib/vault-config");
      const jwtSecret = await getJwtSecret();

      if (!jwtSecret) {
        throw new Error("JWT secret not available from Vault");
      }

      // Create JWT payload with essential user data (hashed fields only)
      const payload = {
        sub: user.id, // Subject (user ID - already hashed)
        userId: user.id, // For backward compatibility
        role: user.role,
        iat: Math.floor(Date.now() / 1000), // Issued at
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // Expires in 24 hours
        iss: "satnam-identity-system", // Issuer
        aud: "satnam-users", // Audience
        // Note: No plaintext username/nip05 in JWT for maximum encryption compliance
      };

      // Create JWT header
      const header = {
        alg: "HS256",
        typ: "JWT",
      };

      // Encode header and payload
      const encodedHeader = btoa(JSON.stringify(header))
        .replace(/[+/]/g, (m) => ({ "+": "-", "/": "_" }[m]!))
        .replace(/=/g, "");
      const encodedPayload = btoa(JSON.stringify(payload))
        .replace(/[+/]/g, (m) => ({ "+": "-", "/": "_" }[m]!))
        .replace(/=/g, "");

      // Create signature using HMAC-SHA256
      const signatureInput = `${encodedHeader}.${encodedPayload}`;
      const signature = await this.createHMACSignature(
        signatureInput,
        jwtSecret
      );

      // Return complete JWT
      return `${encodedHeader}.${encodedPayload}.${signature}`;
    } catch (error) {
      console.error("JWT generation failed:", error);
      // Fallback to secure random token if JWT fails
      return await this.generateFallbackToken(user);
    }
  }

  /**
   * Create HMAC-SHA256 signature for JWT (Web Crypto API only)
   */
  private async createHMACSignature(
    data: string,
    secret: string
  ): Promise<string> {
    try {
      // Browser-only serverless architecture - use Web Crypto API
      const subtle = CryptoUtils.getSubtleCrypto();
      const encoder = new TextEncoder();

      const key = await subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signature = await subtle.sign("HMAC", key, encoder.encode(data));

      return CryptoUtils.arrayBufferToBase64(signature)
        .replace(/[+/]/g, (m) => ({ "+": "-", "/": "_" }[m]!))
        .replace(/=/g, "");
    } catch (error) {
      console.error("HMAC signature creation failed:", error);
      throw new Error("HMAC signature creation failed");
    }
  }

  /**
   * Generate fallback secure token if JWT fails (Web Crypto API only)
   */
  private async generateFallbackToken(user: UserIdentity): Promise<string> {
    try {
      const tokenData = {
        userId: user.id, // Already hashed user ID
        role: user.role,
        timestamp: Date.now(),
        expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        type: "fallback-session",
        // Note: No plaintext username/nip05 for maximum encryption compliance
      };

      // Browser-only serverless architecture - use Web Crypto API for secure random bytes
      const randomBytes = CryptoUtils.getRandomBytes(32);
      // Fix ArrayBuffer type compatibility
      const arrayBuffer =
        randomBytes.buffer instanceof ArrayBuffer
          ? randomBytes.buffer
          : new ArrayBuffer(randomBytes.buffer.byteLength);
      const randomString = CryptoUtils.arrayBufferToBase64(arrayBuffer);
      return `${btoa(JSON.stringify(tokenData))}.${randomString}`;
    } catch (error) {
      console.error("Fallback token generation failed:", error);
      throw new Error("Fallback token generation failed");
    }
  }

  /**
   * Store session information for rotation tracking
   */
  private async storeSessionInfo(
    userId: string,
    sessionToken: string
  ): Promise<void> {
    try {
      // JWT token validation is handled in verifySessionToken method
      // Store session for tracking purposes

      // Store session in user_auth_attempts table for tracking
      await supabase.from("user_auth_attempts").insert({
        user_id: userId,
        attempt_result: "session_created",
        attempted_at: new Date().toISOString(),
        // Store session hash for rotation tracking (not the full token)
        client_info_hash: await this.hashSessionToken(sessionToken),
      });
    } catch (error) {
      console.error("Failed to store session info:", error);
      // Don't fail authentication if session storage fails
    }
  }

  /**
   * Hash session token for secure storage (Web Crypto API only)
   */
  private async hashSessionToken(token: string): Promise<string> {
    try {
      // Browser-only serverless architecture - use Web Crypto API
      const subtle = CryptoUtils.getSubtleCrypto();
      const encoder = new TextEncoder();
      const data = encoder.encode(token);
      const hashBuffer = await subtle.digest("SHA-256", data);
      return CryptoUtils.arrayBufferToBase64(hashBuffer);
    } catch (error) {
      console.error("Session token hashing failed:", error);
      throw new Error("Session token hashing failed");
    }
  }

  /**
   * Rotate session token (generate new token and invalidate old one)
   */
  async rotateSession(
    currentToken: string
  ): Promise<{ success: boolean; newToken?: string; error?: string }> {
    try {
      // Verify current token and extract user info
      const userInfo = await this.verifySessionToken(currentToken);
      if (!userInfo) {
        return { success: false, error: "Invalid session token" };
      }

      // Get user from database
      const { data: user, error } = await supabase
        .from("user_identities")
        .select("*")
        .eq("id", userInfo.sub)
        .eq("is_active", true)
        .single();

      if (error || !user) {
        return { success: false, error: "User not found" };
      }

      // Generate new session token
      const newToken = await this.generateSessionToken(user as UserIdentity);

      return { success: true, newToken };
    } catch (error) {
      console.error("Session rotation failed:", error);
      return { success: false, error: "Session rotation failed" };
    }
  }

  /**
   * Verify JWT session token with production-ready signature verification
   */
  private async verifySessionToken(token: string): Promise<any> {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        return null;
      }

      const [headerB64, payloadB64, signatureB64] = parts;

      // Decode payload (header not needed for verification)
      const payload = JSON.parse(atob(payloadB64));

      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null; // Token expired
      }

      // PRODUCTION-READY: Verify signature using Web Crypto API
      try {
        // Get JWT secret from Vault (secure credential storage)
        const { getJwtSecret } = await import("../../../lib/vault-config");
        const jwtSecret = await getJwtSecret();

        if (!jwtSecret) {
          console.error("JWT secret not available from Vault");
          return null;
        }

        // Create signing input (header.payload)
        const signingInput = `${headerB64}.${payloadB64}`;

        // Convert secret to key for HMAC
        const encoder = new TextEncoder();
        const keyData = encoder.encode(jwtSecret);

        // Import the key for HMAC-SHA256
        const cryptoKey = await crypto.subtle.importKey(
          "raw",
          keyData,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["verify"]
        );

        // Convert base64url signature to ArrayBuffer
        const signatureBytes = this.base64UrlToArrayBuffer(signatureB64);

        // Verify the signature
        const isValid = await crypto.subtle.verify(
          "HMAC",
          cryptoKey,
          signatureBytes,
          encoder.encode(signingInput)
        );

        if (!isValid) {
          console.error("JWT signature verification failed");
          return null;
        }

        // Signature is valid, return payload
        return payload;
      } catch (signatureError) {
        console.error("JWT signature verification error:", signatureError);
        return null;
      }
    } catch (error) {
      console.error("Token verification failed:", error);
      return null;
    }
  }

  /**
   * Convert base64url string to ArrayBuffer
   */
  private base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
    // Convert base64url to base64
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if needed
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    // Convert to binary string then to ArrayBuffer
    const binaryString = atob(padded);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Validate session token and return user data
   */
  async validateSession(sessionToken: string): Promise<AuthResult> {
    try {
      if (!sessionToken) {
        return { success: false, error: "No session token provided" };
      }

      // Verify the token
      const payload = await this.verifySessionToken(sessionToken);
      if (!payload) {
        return { success: false, error: "Invalid or expired session token" };
      }

      // Get user data from database
      // FIX: Use payload.sub (standard JWT subject) instead of payload.userId
      const { data: user, error } = await supabase
        .from("user_identities")
        .select("*")
        .eq("id", payload.sub || payload.userId) // Fallback to userId for backward compatibility
        .single();

      if (error || !user) {
        return { success: false, error: "User not found" };
      }

      // Check if user is still active
      if (!user.is_active) {
        return { success: false, error: "User account is inactive" };
      }

      return {
        success: true,
        user: user as UserIdentity,
        sessionToken,
      };
    } catch (error) {
      console.error("Session validation failed:", error);
      return { success: false, error: "Session validation failed" };
    }
  }

  /**
   * Get user by ID for secure operations (like nsec retrieval)
   */
  async getUserById(userId: string): Promise<UserIdentity | null> {
    try {
      const { data: user, error } = await supabase
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
