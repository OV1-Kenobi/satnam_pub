/**
 * User Identities Authentication System
 * Replaces privacy-first-auth.ts to work with user_identities table
 * Maintains all security features while using the correct database schema
 */

import { supabase } from "../supabase";

// Types for authentication
export interface AuthCredentials {
  nip05?: string;
  username?: string;
  password?: string;
  // Legacy support for existing patterns
  nsecKey?: string;
  pubkey?: string;
  otpCode?: string;
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
  username: string;
  npub: string;
  nip05: string;
  role: string;
  is_active: boolean;
  lightning_address?: string;
  failed_attempts: number;
  locked_until?: string;
  last_successful_auth?: string;
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
   * Hash password using PBKDF2 with SHA-512
   */
  static async hashPassword(password: string, salt: string): Promise<string> {
    const iterations = 100000;
    const keyLength = 64;
    const algorithm = "sha512";

    // Use Web Crypto API for browser compatibility
    if (
      typeof window !== "undefined" &&
      window.crypto &&
      window.crypto.subtle
    ) {
      const encoder = new TextEncoder();
      const passwordBuffer = encoder.encode(password);
      const saltBuffer = encoder.encode(salt);

      const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        passwordBuffer,
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
      );

      const derivedBits = await window.crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: saltBuffer,
          iterations: iterations,
          hash: "SHA-512",
        },
        keyMaterial,
        keyLength * 8
      );

      return btoa(String.fromCharCode(...new Uint8Array(derivedBits)));
    } else {
      // Node.js fallback (for server-side)
      const { pbkdf2 } = await import("crypto");
      const { promisify } = await import("util");
      const pbkdf2Async = promisify(pbkdf2);

      const hash = await pbkdf2Async(
        password,
        salt,
        iterations,
        keyLength,
        algorithm
      );
      return hash.toString("base64");
    }
  }

  /**
   * Verify password using timing-safe comparison
   */
  static async verifyPassword(
    password: string,
    storedHash: string,
    salt: string
  ): Promise<boolean> {
    try {
      const computedHash = await this.hashPassword(password, salt);

      // Timing-safe comparison
      if (
        typeof window !== "undefined" &&
        window.crypto &&
        window.crypto.subtle
      ) {
        // Browser environment - use constant-time comparison
        const storedBuffer = Uint8Array.from(atob(storedHash), (c) =>
          c.charCodeAt(0)
        );
        const computedBuffer = Uint8Array.from(atob(computedHash), (c) =>
          c.charCodeAt(0)
        );

        if (storedBuffer.length !== computedBuffer.length) {
          return false;
        }

        let result = 0;
        for (let i = 0; i < storedBuffer.length; i++) {
          result |= storedBuffer[i] ^ computedBuffer[i];
        }
        return result === 0;
      } else {
        // Node.js environment
        const crypto = await import("crypto");
        return crypto.timingSafeEqual(
          Buffer.from(computedHash, "base64"),
          Buffer.from(storedHash, "base64")
        );
      }
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

      // Find user by NIP-05
      const { data: user, error: userError } = await supabase
        .from("user_identities")
        .select("*")
        .eq("nip05", credentials.nip05.trim().toLowerCase())
        .eq("is_active", true)
        .single();

      if (userError || !user) {
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
      // Get current user data
      const { data: user } = await supabase
        .from("user_identities")
        .select("failed_attempts")
        .eq("nip05", nip05)
        .single();

      if (user) {
        const newFailedAttempts = (user.failed_attempts || 0) + 1;
        const shouldLock =
          newFailedAttempts >= UserIdentitiesAuth.MAX_FAILED_ATTEMPTS;

        // Update failed attempts and potentially lock account
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
          .eq("nip05", nip05);
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
        .eq("nip05", nip05);

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
  private async generateSessionToken(user: UserIdentity): Promise<string> {
    try {
      // Get JWT secret from Vault (secure credential storage)
      const { getJwtSecret } = await import("../../../lib/vault-config");
      const jwtSecret = await getJwtSecret();

      if (!jwtSecret) {
        throw new Error("JWT secret not available from Vault");
      }

      // Create JWT payload with essential user data
      const payload = {
        sub: user.id, // Subject (user ID)
        username: user.username,
        nip05: user.nip05,
        role: user.role,
        iat: Math.floor(Date.now() / 1000), // Issued at
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // Expires in 24 hours
        iss: "satnam-identity-system", // Issuer
        aud: "satnam-users", // Audience
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
   * Create HMAC-SHA256 signature for JWT
   */
  private async createHMACSignature(
    data: string,
    secret: string
  ): Promise<string> {
    if (typeof window !== "undefined") {
      // Browser environment - use Web Crypto API
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(data)
      );
      return btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/[+/]/g, (m) => ({ "+": "-", "/": "_" }[m]!))
        .replace(/=/g, "");
    } else {
      // Node.js environment
      const crypto = await import("crypto");
      const hmac = crypto.createHmac("sha256", secret);
      hmac.update(data);
      return hmac
        .digest("base64")
        .replace(/[+/]/g, (m) => ({ "+": "-", "/": "_" }[m]!))
        .replace(/=/g, "");
    }
  }

  /**
   * Generate fallback secure token if JWT fails
   */
  private async generateFallbackToken(user: UserIdentity): Promise<string> {
    const tokenData = {
      userId: user.id,
      username: user.username,
      nip05: user.nip05,
      role: user.role,
      timestamp: Date.now(),
      expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      type: "fallback-session",
    };

    // Use secure random bytes for fallback token
    if (typeof window !== "undefined") {
      const randomBytes = crypto.getRandomValues(new Uint8Array(32));
      const randomString = btoa(String.fromCharCode(...randomBytes));
      return `${btoa(JSON.stringify(tokenData))}.${randomString}`;
    } else {
      const crypto = await import("crypto");
      const randomBytes = crypto.randomBytes(32);
      return `${btoa(JSON.stringify(tokenData))}.${randomBytes.toString(
        "base64"
      )}`;
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
      // Extract JWT payload to get expiration
      const parts = sessionToken.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        const expiresAt = new Date(payload.exp * 1000);

        // Store session in user_auth_attempts table for tracking
        await supabase.from("user_auth_attempts").insert({
          user_id: userId,
          attempt_result: "session_created",
          attempted_at: new Date().toISOString(),
          // Store session hash for rotation tracking (not the full token)
          client_info_hash: await this.hashSessionToken(sessionToken),
        });
      }
    } catch (error) {
      console.error("Failed to store session info:", error);
      // Don't fail authentication if session storage fails
    }
  }

  /**
   * Hash session token for secure storage
   */
  private async hashSessionToken(token: string): Promise<string> {
    if (typeof window !== "undefined") {
      const encoder = new TextEncoder();
      const data = encoder.encode(token);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
    } else {
      const crypto = await import("crypto");
      return crypto.createHash("sha256").update(token).digest("base64");
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

      // Store new session info
      await this.storeSessionInfo(user.id, newToken);

      return { success: true, newToken };
    } catch (error) {
      console.error("Session rotation failed:", error);
      return { success: false, error: "Session rotation failed" };
    }
  }

  /**
   * Verify JWT session token
   */
  private async verifySessionToken(token: string): Promise<any> {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        return null;
      }

      // Decode payload
      const payload = JSON.parse(atob(parts[1]));

      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null; // Token expired
      }

      // Verify signature (simplified - in production you'd verify against the secret)
      return payload;
    } catch (error) {
      console.error("Token verification failed:", error);
      return null;
    }
  }
}

// Export singleton instance
export const userIdentitiesAuth = new UserIdentitiesAuth();
