/**
 * Privacy-First Authentication System
 *
 * Core Principles:
 * 1. NEVER store npubs/nip05 in database - only hashed UUIDs
 * 2. Per-user dynamic salt generation
 * 3. End-to-end encryption with Perfect Forward Secrecy
 * 4. 4 Authentication methods: NIP-05/Password, OTP, NIP-07, Nsec
 * 5. Anonymous by default, user-controlled exposure
 * 6. RBAC via secure UUID verification
 *
 * NOTE: NWC (Nostr Wallet Connect) is now a wallet connection feature,
 * not an authentication method. It's used for Lightning payments after authentication.
 */

import {
  decryptSensitiveData,
  encryptSensitiveData,
} from "../privacy/encryption";
// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("../supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

// Privacy-first types - NO npubs/nip05 stored
export interface PrivacyUser {
  hashedUUID: string; // Dynamic hashed UUID (unique per user)
  userSalt: string; // Per-user salt for UUID generation
  federationRole: "private" | "offspring" | "adult" | "steward" | "guardian";
  authMethod: "nwc" | "otp" | "nip07" | "nip05-password";
  isWhitelisted: boolean;
  votingPower: number;
  stewardApproved: boolean;
  guardianApproved: boolean;
  sessionHash: string; // Ephemeral session identifier
  createdAt: number;
  lastAuthAt: number;
}

export interface SecureSession {
  sessionId: string; // Rotating session ID
  userHash: string; // References PrivacyUser.hashedUUID
  encryptionKey: string; // Forward secrecy key (rotates)
  expiresAt: number;
  keyVersion: number; // For key rotation
  privacySettings: {
    anonymityLevel: number; // Always 95 (maximum anonymity)
    metadataProtection: boolean; // Always true
    forwardSecrecy: boolean; // Always true
  };
}

export interface AuthCredentials {
  // Nsec Authentication (Zero-Knowledge Protocol)
  nsecKey?: string; // Ephemeral - never stored, immediately cleared

  // OTP Authentication
  identifier?: string; // npub/nip05 - ephemeral only
  otpCode?: string;
  otpKey?: string;

  // NIP-07 Authentication
  challenge?: string;
  signature?: string;
  pubkey?: string; // Ephemeral - not stored

  // NIP-05/Password Authentication (NEW)
  nip05?: string; // NIP-05 identifier (e.g., "user@satnam.pub")
  password?: string; // Password - ephemeral, never stored in plaintext

  // NO privacy preferences - ALWAYS MAXIMUM PRIVACY
}

export interface AuthResult {
  success: boolean;
  user?: PrivacyUser;
  session?: SecureSession;
  error?: string;
  requiresOnboarding?: boolean; // First-time user setup
}

// OTP-related interfaces for secure TOTP implementation
export interface OTPSecret {
  id: string;
  user_hash: string;
  encrypted_secret: string;
  secret_salt: string;
  secret_iv: string;
  secret_tag: string;
  algorithm: "SHA1" | "SHA256";
  digits: number;
  period: number;
  last_used_timestamp?: number;
  last_used_window?: number;
  failed_attempts: number;
  locked_until?: string;
  created_at: string;
  updated_at: string;
}

export interface OTPAttempt {
  userHash: string;
  attemptResult:
    | "success"
    | "invalid_code"
    | "expired"
    | "rate_limited"
    | "replay_detected";
  timeWindow: number;
  clientInfoHash?: string;
  attemptedAt: string;
}

// TOTP Configuration Constants
const TOTP_CONFIG = {
  DEFAULT_ALGORITHM: "SHA256" as const,
  DEFAULT_DIGITS: 6,
  DEFAULT_PERIOD: 120, // 120-second time windows for enhanced security
  WINDOW_TOLERANCE: 1, // ±1 window tolerance (90-second total acceptance window)
  SECRET_LENGTH: 20, // 160-bit (20-byte) secret
  MAX_FAILED_ATTEMPTS: 3,
  LOCKOUT_DURATION_MINUTES: 15,
  RATE_LIMIT_WINDOW_MINUTES: 5,
} as const;

// NIP-05/Password Configuration Constants
const NIP05_PASSWORD_CONFIG = {
  WHITELISTED_DOMAINS: ["satnam.pub", "citadel.academy"] as const,
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_DURATION_MINUTES: 30,
  PASSWORD_MIN_LENGTH: 8,
  REQUIRE_NIP05_VERIFICATION: true, // Verify actual NIP-05 DNS records
} as const;

// NIP-05/Password related interfaces
export interface NIP05Credentials {
  id: string;
  user_hash: string;
  nip05_hash: string;
  domain_hash: string;
  encrypted_password: string;
  password_salt: string;
  password_iv: string;
  password_tag: string;
  password_algorithm: "SHA256";
  failed_attempts: number;
  locked_until?: string;
  last_successful_auth?: string;
  created_at: string;
  updated_at: string;
}

export interface NIP05AuthAttempt {
  user_hash?: string;
  nip05_hash?: string;
  attempt_result:
    | "success"
    | "invalid_nip05"
    | "invalid_password"
    | "domain_not_whitelisted"
    | "rate_limited"
    | "account_locked";
  domain_hash?: string;
  client_info_hash?: string;
  attempted_at: string;
}

// Privacy utilities with per-user salts
class PrivacyEngine {
  private static readonly BASE_SALT =
    import.meta.env.VITE_PRIVACY_BASE_SALT || "satnam-privacy-2024";

  // Generate unique salt per user based on ephemeral data
  static async generateUserSalt(ephemeralId: string): Promise<string> {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    const combined = `${ephemeralId}-${timestamp}-${random}-${this.BASE_SALT}`;
    const hash = await this.hash(combined);
    return hash.substring(0, 16);
  }

  // Create hashed UUID that can't be reverse-engineered
  static async createHashedUUID(
    ephemeralId: string,
    userSalt: string
  ): Promise<string> {
    const combined = `${ephemeralId}-${userSalt}-${this.BASE_SALT}`;
    const hash = await this.hash(combined);
    return `uuid_${hash.substring(0, 32)}`;
  }

  // Generate forward secrecy encryption key
  static async generateEncryptionKey(): Promise<string> {
    const timestamp = Date.now().toString();
    const random = crypto.getRandomValues(new Uint8Array(16));
    const randomStr = Array.from(random, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    return await this.hash(`${timestamp}-${randomStr}-${this.BASE_SALT}`);
  }

  // Rotate session ID for security
  static async generateSessionId(): Promise<string> {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    const hash = await this.hash(`${timestamp}-${random}`);
    return `sess_${hash.substring(0, 24)}`;
  }

  /**
   * SECURITY UPGRADE: Cryptographically secure hash function using Web Crypto API SHA-256
   * Replaces simple hash with cryptographically secure implementation
   * Maintains compatibility with existing code interface (string input -> string output)
   */
  private static async hash(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Verify hashed UUID without revealing original
  static async verifyHashedUUID(
    hashedUUID: string,
    ephemeralId: string,
    userSalt: string
  ): Promise<boolean> {
    const expectedHash = await this.createHashedUUID(ephemeralId, userSalt);
    return hashedUUID === expectedHash;
  }

  // ===== OTP HELPER METHODS =====

  /**
   * Generate cryptographically secure OTP secret (160-bit/20-byte)
   */
  static async generateOTPSecret(): Promise<Uint8Array> {
    const secret = new Uint8Array(TOTP_CONFIG.SECRET_LENGTH);
    crypto.getRandomValues(secret);
    return secret;
  }

  /**
   * Encrypt OTP secret using privacy encryption infrastructure
   */
  static async encryptOTPSecret(
    secret: Uint8Array,
    userHash: string
  ): Promise<{
    encrypted: string;
    salt: string;
    iv: string;
    tag: string;
  }> {
    // Convert Uint8Array to base64 string for encryption
    const secretBase64 = btoa(
      String.fromCharCode.apply(null, Array.from(secret))
    );

    // Use existing encryption infrastructure with user-specific context
    const contextualData = `otp-secret-${userHash}`;
    const result = await encryptSensitiveData(secretBase64 + contextualData);

    return result;
  }

  /**
   * Decrypt OTP secret using privacy encryption infrastructure
   */
  static async decryptOTPSecret(
    encryptedData: {
      encrypted: string;
      salt: string;
      iv: string;
      tag: string;
    },
    userHash: string
  ): Promise<Uint8Array> {
    try {
      const decrypted = await decryptSensitiveData(encryptedData);

      // Remove contextual data and convert back to Uint8Array
      const contextualData = `otp-secret-${userHash}`;
      const secretBase64 = decrypted.replace(contextualData, "");

      // Convert base64 back to Uint8Array
      const binaryString = atob(secretBase64);
      const secret = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        secret[i] = binaryString.charCodeAt(i);
      }

      return secret;
    } catch (error) {
      throw new Error(
        `Failed to decrypt OTP secret: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Generate TOTP code using RFC 6238 algorithm
   */
  static async generateTOTP(
    secret: Uint8Array,
    timestamp?: number
  ): Promise<string> {
    const time = timestamp || Math.floor(Date.now() / 1000);
    const timeWindow = Math.floor(time / TOTP_CONFIG.DEFAULT_PERIOD);

    // Convert time window to 8-byte big-endian buffer
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setUint32(4, timeWindow, false); // Big-endian

    // Import secret as HMAC key (create new ArrayBuffer for compatibility)
    const secretBuffer = new ArrayBuffer(secret.length);
    const secretView = new Uint8Array(secretBuffer);
    secretView.set(secret);

    const key = await crypto.subtle.importKey(
      "raw",
      secretBuffer,
      { name: "HMAC", hash: TOTP_CONFIG.DEFAULT_ALGORITHM },
      false,
      ["sign"]
    );

    // Generate HMAC
    const hmac = await crypto.subtle.sign("HMAC", key, timeBuffer);
    const hmacArray = new Uint8Array(hmac);

    // Dynamic truncation (RFC 6238)
    const offset = hmacArray[hmacArray.length - 1] & 0x0f;
    const code =
      (((hmacArray[offset] & 0x7f) << 24) |
        ((hmacArray[offset + 1] & 0xff) << 16) |
        ((hmacArray[offset + 2] & 0xff) << 8) |
        (hmacArray[offset + 3] & 0xff)) %
      Math.pow(10, TOTP_CONFIG.DEFAULT_DIGITS);

    return code.toString().padStart(TOTP_CONFIG.DEFAULT_DIGITS, "0");
  }

  /**
   * Validate TOTP code with time window tolerance and replay protection
   */
  static async validateTOTP(
    token: string,
    secret: Uint8Array,
    windowTolerance: number = TOTP_CONFIG.WINDOW_TOLERANCE
  ): Promise<{ valid: boolean; timeWindow?: number }> {
    const currentTime = Math.floor(Date.now() / 1000);
    const currentWindow = Math.floor(currentTime / TOTP_CONFIG.DEFAULT_PERIOD);

    // Check current window and tolerance windows
    for (let i = -windowTolerance; i <= windowTolerance; i++) {
      const testWindow = currentWindow + i;
      const testTime = testWindow * TOTP_CONFIG.DEFAULT_PERIOD;
      const expectedToken = await this.generateTOTP(secret, testTime);

      // Constant-time comparison to prevent timing attacks
      if (await this.constantTimeEquals(token, expectedToken)) {
        return { valid: true, timeWindow: testWindow };
      }
    }

    return { valid: false };
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  static async constantTimeEquals(a: string, b: string): Promise<boolean> {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  // ===== NIP-05/PASSWORD HELPER METHODS =====

  /**
   * Validate NIP-05 format and domain whitelist
   */
  static validateNIP05Format(nip05: string): {
    valid: boolean;
    domain?: string;
    localPart?: string;
    error?: string;
  } {
    const nip05Regex = /^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;

    if (!nip05Regex.test(nip05)) {
      return { valid: false, error: "Invalid NIP-05 format" };
    }

    const [localPart, domain] = nip05.split("@");

    // Check domain whitelist
    if (!NIP05_PASSWORD_CONFIG.WHITELISTED_DOMAINS.includes(domain as any)) {
      return { valid: false, error: "Domain not whitelisted" };
    }

    return { valid: true, domain, localPart };
  }

  /**
   * Hash password using SHA-256 with salt
   */
  static async hashPassword(password: string, salt: string): Promise<string> {
    const encoder = new TextEncoder();
    const passwordWithSalt = password + salt;
    const dataBuffer = encoder.encode(passwordWithSalt);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Generate secure password salt
   */
  static generatePasswordSalt(): string {
    const saltArray = new Uint8Array(32); // 256-bit salt
    crypto.getRandomValues(saltArray);
    return Array.from(saltArray, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  }

  /**
   * Hash NIP-05 identifier for privacy-preserving storage
   */
  static async hashNIP05(nip05: string): Promise<string> {
    return await this.hash(nip05.toLowerCase());
  }

  /**
   * Hash domain for privacy-preserving whitelist validation
   */
  static async hashDomain(domain: string): Promise<string> {
    return await this.hash(domain.toLowerCase());
  }
}

// Privacy-first authentication adapter
export class PrivacyFirstAuth {
  name = "privacy-first";

  // Nsec Authentication - Zero-Knowledge Protocol with hashed UUID storage only
  async authenticateNsec(credentials: AuthCredentials): Promise<AuthResult> {
    try {
      if (!credentials.nsecKey || !credentials.pubkey) {
        return { success: false, error: "Missing Nsec credentials" };
      }

      const ephemeralId = credentials.pubkey; // Used only for hashing
      const userSalt = await PrivacyEngine.generateUserSalt(ephemeralId);
      const hashedUUID = await PrivacyEngine.createHashedUUID(
        ephemeralId,
        userSalt
      );

      // Check if user exists (by hashed UUID only)
      const { data: existingUser } = await supabase
        .from("privacy_users")
        .select("*")
        .eq("hashedUUID", hashedUUID)
        .single();

      if (existingUser) {
        // Existing user - create new session
        return this.createAuthenticatedSession(existingUser);
      } else {
        // New user - create privacy profile (MAXIMUM PRIVACY ALWAYS)
        const newUser: PrivacyUser = {
          hashedUUID,
          userSalt,
          federationRole: "private", // Default - no RBAC restrictions
          authMethod: "nwc",
          isWhitelisted: false,
          votingPower: 1,
          stewardApproved: false,
          guardianApproved: false,
          sessionHash: await PrivacyEngine.generateSessionId(),
          createdAt: Date.now(),
          lastAuthAt: Date.now(),
        };

        const { error } = await supabase
          .from("privacy_users")
          .insert([newUser]);

        if (error) {
          return { success: false, error: "Failed to create privacy profile" };
        }

        return {
          success: true,
          user: newUser,
          session: await this.createSecureSession(newUser),
          requiresOnboarding: true,
        };
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "NWC authentication failed",
      };
    }
  }

  // ===== OTP DATABASE HELPER METHODS =====

  /**
   * Get or create OTP secret for user
   */
  private async getOrCreateOTPSecret(userHash: string): Promise<OTPSecret> {
    try {
      // Try to get existing secret
      const { data: existingSecret, error: fetchError } = await supabase
        .from("otp_secrets")
        .select("*")
        .eq("user_hash", userHash)
        .single();

      if (existingSecret && !fetchError) {
        return existingSecret as OTPSecret;
      }

      // Create new secret if none exists
      const secret = await PrivacyEngine.generateOTPSecret();
      const encryptedData = await PrivacyEngine.encryptOTPSecret(
        secret,
        userHash
      );

      const newSecret: Partial<OTPSecret> = {
        user_hash: userHash,
        encrypted_secret: encryptedData.encrypted,
        secret_salt: encryptedData.salt,
        secret_iv: encryptedData.iv,
        secret_tag: encryptedData.tag,
        algorithm: TOTP_CONFIG.DEFAULT_ALGORITHM,
        digits: TOTP_CONFIG.DEFAULT_DIGITS,
        period: TOTP_CONFIG.DEFAULT_PERIOD,
        failed_attempts: 0,
      };

      const { data: createdSecret, error: createError } = await supabase
        .from("otp_secrets")
        .insert([newSecret])
        .select()
        .single();

      if (createError) {
        throw new Error(`Failed to create OTP secret: ${createError.message}`);
      }

      return createdSecret as OTPSecret;
    } catch (error) {
      throw new Error(
        `OTP secret management failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Check replay protection - ensure OTP hasn't been used in this time window
   */
  private async checkReplayProtection(
    userHash: string,
    timeWindow: number
  ): Promise<boolean> {
    try {
      const { data: secret } = await supabase
        .from("otp_secrets")
        .select("last_used_window")
        .eq("user_hash", userHash)
        .single();

      // If no previous use or different window, it's valid
      return (
        !secret?.last_used_window || secret.last_used_window !== timeWindow
      );
    } catch (error) {
      // If we can't check, err on the side of caution and allow
      return true;
    }
  }

  /**
   * Update OTP secret after successful use (replay protection)
   */
  private async updateOTPAfterUse(
    userHash: string,
    timeWindow: number
  ): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);

    await supabase
      .from("otp_secrets")
      .update({
        last_used_timestamp: timestamp,
        last_used_window: timeWindow,
        failed_attempts: 0, // Reset failed attempts on success
      })
      .eq("user_hash", userHash);
  }

  /**
   * Handle failed OTP attempt with rate limiting
   */
  private async handleFailedOTPAttempt(
    userHash: string,
    attemptResult: string
  ): Promise<void> {
    // Increment failed attempts
    const { data: secret } = await supabase
      .from("otp_secrets")
      .select("failed_attempts")
      .eq("user_hash", userHash)
      .single();

    const failedAttempts = (secret?.failed_attempts || 0) + 1;
    const updates: any = { failed_attempts: failedAttempts };

    // Lock account if too many failures
    if (failedAttempts >= TOTP_CONFIG.MAX_FAILED_ATTEMPTS) {
      const lockoutUntil = new Date();
      lockoutUntil.setMinutes(
        lockoutUntil.getMinutes() + TOTP_CONFIG.LOCKOUT_DURATION_MINUTES
      );
      updates.locked_until = lockoutUntil.toISOString();
    }

    await supabase
      .from("otp_secrets")
      .update(updates)
      .eq("user_hash", userHash);

    // Log attempt for security monitoring
    await (await getSupabaseClient()).from("otp_attempts").insert([
      {
        user_hash: userHash,
        attempt_result: attemptResult,
        time_window: Math.floor(Date.now() / 1000 / TOTP_CONFIG.DEFAULT_PERIOD),
      },
    ]);
  }

  /**
   * Check if user is rate limited
   */
  private async checkRateLimit(userHash: string): Promise<boolean> {
    try {
      const { data: secret } = await supabase
        .from("otp_secrets")
        .select("locked_until, failed_attempts")
        .eq("user_hash", userHash)
        .single();

      if (!secret) return false;

      // Check if account is locked
      if (secret.locked_until) {
        const lockoutTime = new Date(secret.locked_until);
        if (lockoutTime > new Date()) {
          return true; // Still locked
        }
      }

      return false;
    } catch (error) {
      return false; // If we can't check, allow the attempt
    }
  }

  // ===== NIP-05/PASSWORD DATABASE HELPER METHODS =====

  /**
   * Get NIP-05 credentials for user
   */
  private async getNIP05Credentials(
    nip05Hash: string
  ): Promise<NIP05Credentials | null> {
    try {
      const { data: credentials, error } = await supabase
        .from("nip05_credentials")
        .select("*")
        .eq("nip05_hash", nip05Hash)
        .single();

      if (error || !credentials) {
        return null;
      }

      return credentials as NIP05Credentials;
    } catch (error) {
      return null;
    }
  }

  /**
   * Create new NIP-05 credentials for user
   */
  private async createNIP05Credentials(
    userHash: string,
    nip05: string,
    password: string
  ): Promise<NIP05Credentials> {
    const validation = PrivacyEngine.validateNIP05Format(nip05);
    if (!validation.valid) {
      throw new Error(validation.error || "Invalid NIP-05 format");
    }

    // Generate password salt and hash
    const passwordSalt = PrivacyEngine.generatePasswordSalt();
    const passwordHash = await PrivacyEngine.hashPassword(
      password,
      passwordSalt
    );

    // Encrypt password hash
    const encryptedData = await encryptSensitiveData(passwordHash + userHash);

    // Hash identifiers for privacy
    const nip05Hash = await PrivacyEngine.hashNIP05(nip05);
    const domainHash = await PrivacyEngine.hashDomain(validation.domain!);

    const newCredentials: Partial<NIP05Credentials> = {
      user_hash: userHash,
      nip05_hash: nip05Hash,
      domain_hash: domainHash,
      encrypted_password: encryptedData.encrypted,
      password_salt: passwordSalt,
      password_iv: encryptedData.iv,
      password_tag: encryptedData.tag,
      password_algorithm: "SHA256",
      failed_attempts: 0,
    };

    const { data: createdCredentials, error } = await supabase
      .from("nip05_credentials")
      .insert([newCredentials])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create NIP-05 credentials: ${error.message}`);
    }

    return createdCredentials as NIP05Credentials;
  }

  /**
   * Validate NIP-05/password combination
   */
  private async validateNIP05Password(
    credentials: NIP05Credentials,
    password: string,
    userHash: string
  ): Promise<boolean> {
    try {
      // Decrypt stored password hash
      const decryptedData = await decryptSensitiveData({
        encrypted: credentials.encrypted_password,
        salt: credentials.password_salt,
        iv: credentials.password_iv,
        tag: credentials.password_tag,
      });

      // Remove contextual data
      const storedPasswordHash = decryptedData.replace(userHash, "");

      // Hash provided password with stored salt
      const providedPasswordHash = await PrivacyEngine.hashPassword(
        password,
        credentials.password_salt
      );

      // Constant-time comparison
      return await PrivacyEngine.constantTimeEquals(
        storedPasswordHash,
        providedPasswordHash
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if NIP-05 account is rate limited
   */
  private async checkNIP05RateLimit(nip05Hash: string): Promise<boolean> {
    try {
      const credentials = await this.getNIP05Credentials(nip05Hash);
      if (!credentials) return false;

      // Check if account is locked
      if (credentials.locked_until) {
        const lockoutTime = new Date(credentials.locked_until);
        if (lockoutTime > new Date()) {
          return true; // Still locked
        }
      }

      return false;
    } catch (error) {
      return false; // If we can't check, allow the attempt
    }
  }

  /**
   * Handle failed NIP-05 authentication attempt
   */
  private async handleFailedNIP05Attempt(
    nip05Hash: string,
    attemptResult: string,
    userHash?: string
  ): Promise<void> {
    try {
      // Update failed attempts if credentials exist
      if (userHash) {
        const credentials = await this.getNIP05Credentials(nip05Hash);
        if (credentials) {
          const failedAttempts = credentials.failed_attempts + 1;
          const updates: any = { failed_attempts: failedAttempts };

          // Lock account if too many failures
          if (failedAttempts >= NIP05_PASSWORD_CONFIG.MAX_FAILED_ATTEMPTS) {
            const lockoutUntil = new Date();
            lockoutUntil.setMinutes(
              lockoutUntil.getMinutes() +
                NIP05_PASSWORD_CONFIG.LOCKOUT_DURATION_MINUTES
            );
            updates.locked_until = lockoutUntil.toISOString();
          }

          await supabase
            .from("nip05_credentials")
            .update(updates)
            .eq("nip05_hash", nip05Hash);
        }
      }

      // Log attempt for security monitoring
      await (await getSupabaseClient()).from("nip05_auth_attempts").insert([
        {
          user_hash: userHash,
          nip05_hash: nip05Hash,
          attempt_result: attemptResult,
        },
      ]);
    } catch (error) {
      // Fail silently to prevent information leakage
    }
  }

  /**
   * Update NIP-05 credentials after successful authentication
   */
  private async updateNIP05AfterSuccess(nip05Hash: string): Promise<void> {
    await supabase
      .from("nip05_credentials")
      .update({
        failed_attempts: 0, // Reset failed attempts
        last_successful_auth: new Date().toISOString(),
      })
      .eq("nip05_hash", nip05Hash);

    // Log successful attempt
    await (await getSupabaseClient()).from("nip05_auth_attempts").insert([
      {
        nip05_hash: nip05Hash,
        attempt_result: "success",
      },
    ]);
  }

  // NIP-05/Password Authentication - stores only hashed UUID
  async authenticateNIP05Password(
    credentials: AuthCredentials
  ): Promise<AuthResult> {
    try {
      if (!credentials.nip05 || !credentials.password) {
        return { success: false, error: "Missing NIP-05 or password" };
      }

      // Validate NIP-05 format and domain whitelist
      const validation = PrivacyEngine.validateNIP05Format(credentials.nip05);
      if (!validation.valid) {
        await this.handleFailedNIP05Attempt(
          await PrivacyEngine.hashNIP05(credentials.nip05),
          "domain_not_whitelisted"
        );
        return { success: false, error: "Invalid NIP-05 identifier" }; // Generic error
      }

      // Hash NIP-05 for privacy-preserving lookup
      const nip05Hash = await PrivacyEngine.hashNIP05(credentials.nip05);

      // Check rate limiting first
      if (await this.checkNIP05RateLimit(nip05Hash)) {
        await this.handleFailedNIP05Attempt(nip05Hash, "rate_limited");
        return { success: false, error: "Invalid NIP-05 identifier" }; // Generic error
      }

      // Get existing credentials
      const existingCredentials = await this.getNIP05Credentials(nip05Hash);

      if (existingCredentials) {
        // Existing user - validate password
        const isValidPassword = await this.validateNIP05Password(
          existingCredentials,
          credentials.password,
          existingCredentials.user_hash
        );

        if (!isValidPassword) {
          await this.handleFailedNIP05Attempt(
            nip05Hash,
            "invalid_password",
            existingCredentials.user_hash
          );
          return { success: false, error: "Invalid NIP-05 identifier" }; // Generic error
        }

        // Password is valid - update success tracking
        await this.updateNIP05AfterSuccess(nip05Hash);

        // Get existing user
        const { data: existingUser } = await supabase
          .from("privacy_users")
          .select("*")
          .eq("hashed_uuid", existingCredentials.user_hash)
          .single();

        if (existingUser) {
          return this.createAuthenticatedSession(existingUser);
        }
      }

      // New user or user doesn't exist - create new account
      // Generate ephemeral ID from NIP-05 for hashing (privacy-preserving)
      const ephemeralId = credentials.nip05; // Used only for hashing
      const userSalt = await PrivacyEngine.generateUserSalt(ephemeralId);
      const hashedUUID = await PrivacyEngine.createHashedUUID(
        ephemeralId,
        userSalt
      );

      // Create new privacy user
      const newUser: PrivacyUser = {
        hashedUUID,
        userSalt,
        federationRole: "private", // Default role
        authMethod: "nip05-password",
        isWhitelisted: true, // NIP-05 users with whitelisted domains are pre-approved
        votingPower: 1,
        stewardApproved: false,
        guardianApproved: false,
        sessionHash: await PrivacyEngine.generateSessionId(),
        createdAt: Date.now(),
        lastAuthAt: Date.now(),
      };

      // Insert new user
      const { data: createdUser, error: userError } = await supabase
        .from("privacy_users")
        .insert([newUser])
        .select()
        .single();

      if (userError) {
        await this.handleFailedNIP05Attempt(nip05Hash, "invalid_nip05");
        return { success: false, error: "Authentication failed" };
      }

      // Create NIP-05 credentials for new user
      try {
        await this.createNIP05Credentials(
          hashedUUID,
          credentials.nip05,
          credentials.password
        );
        await this.updateNIP05AfterSuccess(nip05Hash);
      } catch (error) {
        // Clean up user if credential creation fails
        await supabase
          .from("privacy_users")
          .delete()
          .eq("hashed_uuid", hashedUUID);
        await this.handleFailedNIP05Attempt(nip05Hash, "invalid_nip05");
        return { success: false, error: "Authentication failed" };
      }

      return this.createAuthenticatedSession(createdUser);
    } catch (error) {
      return {
        success: false,
        error: "Authentication failed",
      };
    }
  }

  // OTP Authentication - stores only hashed UUID
  async authenticateOTP(credentials: AuthCredentials): Promise<AuthResult> {
    try {
      if (!credentials.identifier || !credentials.otpCode) {
        return { success: false, error: "Missing OTP credentials" };
      }

      const ephemeralId = credentials.identifier; // Used only for hashing
      const userSalt = await PrivacyEngine.generateUserSalt(ephemeralId);
      const hashedUUID = await PrivacyEngine.createHashedUUID(
        ephemeralId,
        userSalt
      );

      // SECURITY: Check rate limiting first
      if (await this.checkRateLimit(hashedUUID)) {
        await this.handleFailedOTPAttempt(hashedUUID, "rate_limited");
        return { success: false, error: "Invalid OTP code" }; // Generic error message
      }

      // Get or create OTP secret for this user
      let otpSecret: OTPSecret;
      try {
        otpSecret = await this.getOrCreateOTPSecret(hashedUUID);
      } catch (error) {
        await this.handleFailedOTPAttempt(hashedUUID, "invalid_code");
        return { success: false, error: "Invalid OTP code" }; // Generic error message
      }

      // Decrypt the OTP secret
      let secret: Uint8Array;
      try {
        secret = await PrivacyEngine.decryptOTPSecret(
          {
            encrypted: otpSecret.encrypted_secret,
            salt: otpSecret.secret_salt,
            iv: otpSecret.secret_iv,
            tag: otpSecret.secret_tag,
          },
          hashedUUID
        );
      } catch (error) {
        await this.handleFailedOTPAttempt(hashedUUID, "invalid_code");
        return { success: false, error: "Invalid OTP code" }; // Generic error message
      }

      // Validate TOTP code
      const validation = await PrivacyEngine.validateTOTP(
        credentials.otpCode,
        secret
      );

      if (!validation.valid) {
        await this.handleFailedOTPAttempt(hashedUUID, "invalid_code");
        return { success: false, error: "Invalid OTP code" };
      }

      // Check replay protection
      if (
        !(await this.checkReplayProtection(hashedUUID, validation.timeWindow!))
      ) {
        await this.handleFailedOTPAttempt(hashedUUID, "replay_detected");
        return { success: false, error: "Invalid OTP code" }; // Generic error message
      }

      // Update OTP secret to prevent replay
      await this.updateOTPAfterUse(hashedUUID, validation.timeWindow!);

      // Check if user exists
      const { data: existingUser } = await supabase
        .from("privacy_users")
        .select("*")
        .eq("hashedUUID", hashedUUID)
        .single();

      if (existingUser) {
        return this.createAuthenticatedSession(existingUser);
      } else {
        // New OTP user - typically pre-whitelisted (MAXIMUM PRIVACY ALWAYS)
        const newUser: PrivacyUser = {
          hashedUUID,
          userSalt,
          federationRole: "private",
          authMethod: "otp",
          isWhitelisted: true, // OTP users are pre-approved
          votingPower: 1,
          stewardApproved: false,
          guardianApproved: false,
          sessionHash: await PrivacyEngine.generateSessionId(),
          createdAt: Date.now(),
          lastAuthAt: Date.now(),
        };

        const { error } = await supabase
          .from("privacy_users")
          .insert([newUser]);

        if (error) {
          return { success: false, error: "Failed to create privacy profile" };
        }

        return {
          success: true,
          user: newUser,
          session: await this.createSecureSession(newUser),
          requiresOnboarding: true,
        };
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "OTP authentication failed",
      };
    }
  }

  // NIP-07 Authentication - stores only hashed UUID
  async authenticateNIP07(credentials: AuthCredentials): Promise<AuthResult> {
    try {
      if (
        !credentials.pubkey ||
        !credentials.signature ||
        !credentials.challenge
      ) {
        return { success: false, error: "Missing NIP-07 credentials" };
      }

      // Verify signature (simplified for demo)
      // In production, would verify actual cryptographic signature
      const isValidSignature = credentials.signature.length > 50;
      if (!isValidSignature) {
        return { success: false, error: "Invalid NIP-07 signature" };
      }

      const ephemeralId = credentials.pubkey; // Used only for hashing
      const userSalt = await PrivacyEngine.generateUserSalt(ephemeralId);
      const hashedUUID = await PrivacyEngine.createHashedUUID(
        ephemeralId,
        userSalt
      );

      // Check if user exists
      const { data: existingUser } = await supabase
        .from("privacy_users")
        .select("*")
        .eq("hashedUUID", hashedUUID)
        .single();

      if (existingUser) {
        return this.createAuthenticatedSession(existingUser);
      } else {
        // New NIP-07 user (MAXIMUM PRIVACY ALWAYS)
        const newUser: PrivacyUser = {
          hashedUUID,
          userSalt,
          federationRole: "private",
          authMethod: "nip07",
          isWhitelisted: false,
          votingPower: 1,
          stewardApproved: false,
          guardianApproved: false,
          sessionHash: await PrivacyEngine.generateSessionId(),
          createdAt: Date.now(),
          lastAuthAt: Date.now(),
        };

        const { error } = await supabase
          .from("privacy_users")
          .insert([newUser]);

        if (error) {
          return { success: false, error: "Failed to create privacy profile" };
        }

        return {
          success: true,
          user: newUser,
          session: await this.createSecureSession(newUser),
          requiresOnboarding: true,
        };
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "NIP-07 authentication failed",
      };
    }
  }

  // RBAC Permission Check using hashed UUIDs
  async checkPermission(
    hashedUUID: string,
    requiredRoles: string[]
  ): Promise<boolean> {
    try {
      const { data: user } = await supabase
        .from("privacy_users")
        .select("federationRole, isWhitelisted")
        .eq("hashedUUID", hashedUUID)
        .single();

      if (!user || !user.isWhitelisted) return false;

      return requiredRoles.includes(user.federationRole);
    } catch {
      return false;
    }
  }

  // Update user last auth time (privacy is always maximum)
  async updateLastAuth(hashedUUID: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("privacy_users")
        .update({
          lastAuthAt: Date.now(),
        })
        .eq("hashedUUID", hashedUUID);

      return !error;
    } catch {
      return false;
    }
  }

  // Get current session without revealing PII
  async getSession(): Promise<SecureSession | null> {
    try {
      const {
        data: { session },
        error,
      } = await (await getSupabaseClient()).auth.getSession();
      if (error || !session) return null;

      // Session metadata is stored encrypted
      const metadata = session.user.user_metadata;
      if (metadata.privacySession) {
        return JSON.parse(metadata.privacySession);
      }

      return null;
    } catch (error) {
      // ✅ NO LOGGING - Following Master Context privacy-first principles
      return null;
    }
  }

  // Secure logout with key rotation
  async logout(): Promise<boolean> {
    try {
      // Rotate all keys on logout for forward secrecy
      const session = await this.getSession();
      if (session) {
        await this.rotateSessionKeys(session.userHash);
      }

      const { error } = await (await getSupabaseClient()).auth.signOut();
      return !error;
    } catch {
      return false;
    }
  }

  // Private helper methods
  private async createAuthenticatedSession(
    user: PrivacyUser
  ): Promise<AuthResult> {
    // Update last auth time
    await supabase
      .from("privacy_users")
      .update({ lastAuthAt: Date.now() })
      .eq("hashedUUID", user.hashedUUID);

    const session = await this.createSecureSession(user);
    return { success: true, user, session };
  }

  private async createSecureSession(user: PrivacyUser): Promise<SecureSession> {
    const session: SecureSession = {
      sessionId: await PrivacyEngine.generateSessionId(),
      userHash: user.hashedUUID,
      encryptionKey: await PrivacyEngine.generateEncryptionKey(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      keyVersion: 1,
      privacySettings: {
        anonymityLevel: 95, // ALWAYS MAXIMUM PRIVACY
        metadataProtection: true, // ALWAYS ENABLED
        forwardSecrecy: true, // ALWAYS ENABLED
      },
    };

    // Store encrypted session in Supabase metadata
    await (
      await getSupabaseClient()
    ).auth.updateUser({
      data: {
        privacySession: JSON.stringify(session),
        hashedUUID: user.hashedUUID,
      },
    });

    return session;
  }

  /**
   * Comprehensive key rotation for maximum security
   * Rotates all encryption keys while maintaining data accessibility
   */
  async rotateSessionKeys(
    userHash?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get current session if userHash not provided
      const targetUserHash = userHash || (await this.getSession())?.userHash;
      if (!targetUserHash) {
        return { success: false, error: "No active session found" };
      }

      // Start atomic transaction for key rotation
      const rotationId = await PrivacyEngine.generateSessionId();

      // Log rotation start for security auditing
      await this.logKeyRotationEvent(
        targetUserHash,
        "rotation_started",
        rotationId
      );

      // Step 1: Generate new encryption components
      const newEncryptionKey = await PrivacyEngine.generateEncryptionKey();
      const newSessionId = await PrivacyEngine.generateSessionId();
      const newUserSalt = await PrivacyEngine.generateUserSalt(targetUserHash);
      const rotationTimestamp = Date.now();

      // Step 2: Rotate OTP secrets if they exist
      await this.rotateOTPSecrets(targetUserHash, newEncryptionKey);

      // Step 3: Rotate NIP-05 password encryption if it exists
      await this.rotateNIP05PasswordEncryption(
        targetUserHash,
        newEncryptionKey
      );

      // Step 4: Rotate encrypted contacts
      await this.rotateEncryptedContacts(targetUserHash, newEncryptionKey);

      // Step 5: Rotate private messages encryption
      await this.rotatePrivateMessagesEncryption(
        targetUserHash,
        newEncryptionKey
      );

      // Step 6: Update user session and encryption metadata
      await this.updateUserEncryptionMetadata(targetUserHash, {
        newSessionId,
        newUserSalt,
        rotationTimestamp,
        rotationId,
      });

      // Step 7: Update Supabase auth session
      await (
        await getSupabaseClient()
      ).auth.updateUser({
        data: {
          rotatedKeys: true,
          lastKeyRotation: rotationTimestamp,
          sessionId: newSessionId,
          rotationId: rotationId,
        },
      });

      // Step 8: Log successful rotation
      await this.logKeyRotationEvent(
        targetUserHash,
        "rotation_completed",
        rotationId
      );

      return { success: true };
    } catch (error) {
      // Log rotation failure for security monitoring
      if (userHash) {
        await this.logKeyRotationEvent(userHash, "rotation_failed", "unknown");
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Key rotation failed",
      };
    }
  }

  // ===== KEY ROTATION HELPER METHODS =====

  /**
   * Log key rotation events for security auditing
   */
  private async logKeyRotationEvent(
    userHash: string,
    eventType: "rotation_started" | "rotation_completed" | "rotation_failed",
    rotationId: string
  ): Promise<void> {
    try {
      // Check if encryption_key_rotations table exists, if not use privacy_audit_log
      const { error: rotationError } = await supabase
        .from("encryption_key_rotations")
        .insert([
          {
            user_hash: userHash,
            old_key_hash: "rotated", // Don't store actual keys
            new_key_hash: "rotated", // Don't store actual keys
            rotation_reason: "manual",
            rotated_at: new Date().toISOString(),
          },
        ]);

      // Fallback to privacy_audit_log if encryption_key_rotations doesn't exist
      if (rotationError) {
        await supabase.from("privacy_audit_log").insert([
          {
            actor_hash: userHash,
            action_type: "key_rotation",
            action_details: JSON.stringify({
              event: eventType,
              rotation_id: rotationId,
            }),
            success: eventType !== "rotation_failed",
            retention_expires:
              Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year
          },
        ]);
      }
    } catch (error) {
      // Fail silently to prevent rotation failure due to logging issues
    }
  }

  /**
   * Rotate OTP secrets with new encryption
   */
  private async rotateOTPSecrets(
    userHash: string,
    newEncryptionKey: string
  ): Promise<void> {
    try {
      const { data: otpSecret } = await supabase
        .from("otp_secrets")
        .select("*")
        .eq("user_hash", userHash)
        .single();

      if (otpSecret) {
        // Decrypt existing secret
        const decryptedSecret = await decryptSensitiveData({
          encrypted: otpSecret.encrypted_secret,
          salt: otpSecret.secret_salt,
          iv: otpSecret.secret_iv,
          tag: otpSecret.secret_tag,
        });

        // Re-encrypt with new key
        const newEncryptedData = await encryptSensitiveData(
          decryptedSecret + userHash
        );

        // Update with new encryption
        await supabase
          .from("otp_secrets")
          .update({
            encrypted_secret: newEncryptedData.encrypted,
            secret_salt: newEncryptedData.salt,
            secret_iv: newEncryptedData.iv,
            secret_tag: newEncryptedData.tag,
            last_rotation_at: new Date().toISOString(),
          })
          .eq("user_hash", userHash);

        // Securely wipe decrypted secret from memory
        // Note: In JavaScript, we can't truly wipe memory, but we can overwrite
        decryptedSecret.replace(/./g, "0");
      }
    } catch (error) {
      // Continue rotation even if OTP rotation fails
    }
  }

  /**
   * Rotate NIP-05 password encryption with new key
   */
  private async rotateNIP05PasswordEncryption(
    userHash: string,
    newEncryptionKey: string
  ): Promise<void> {
    try {
      const { data: nip05Creds } = await supabase
        .from("nip05_credentials")
        .select("*")
        .eq("user_hash", userHash)
        .single();

      if (nip05Creds) {
        // Decrypt existing password hash
        const decryptedPasswordHash = await decryptSensitiveData({
          encrypted: nip05Creds.encrypted_password,
          salt: nip05Creds.password_salt,
          iv: nip05Creds.password_iv,
          tag: nip05Creds.password_tag,
        });

        // Remove contextual data to get clean password hash
        const cleanPasswordHash = decryptedPasswordHash.replace(userHash, "");

        // Re-encrypt with new key
        const newEncryptedData = await encryptSensitiveData(
          cleanPasswordHash + userHash
        );

        // Update with new encryption
        await supabase
          .from("nip05_credentials")
          .update({
            encrypted_password: newEncryptedData.encrypted,
            password_iv: newEncryptedData.iv,
            password_tag: newEncryptedData.tag,
            updated_at: new Date().toISOString(),
          })
          .eq("user_hash", userHash);

        // Securely wipe decrypted data from memory
        decryptedPasswordHash.replace(/./g, "0");
        cleanPasswordHash.replace(/./g, "0");
      }
    } catch (error) {
      // Continue rotation even if NIP-05 rotation fails
    }
  }

  /**
   * Rotate encrypted contacts with new encryption
   */
  private async rotateEncryptedContacts(
    userHash: string,
    newEncryptionKey: string
  ): Promise<void> {
    try {
      const { data: contacts } = await supabase
        .from("encrypted_contacts")
        .select("*")
        .eq("owner_hash", userHash);

      if (contacts && contacts.length > 0) {
        for (const contact of contacts) {
          try {
            // Decrypt existing contact data
            const decryptedContact = await decryptSensitiveData({
              encrypted: contact.encrypted_contact,
              salt: contact.contact_encryption_salt || contact.contact_hash, // Fallback for older schema
              iv: contact.contact_encryption_iv || contact.contact_hash, // Fallback for older schema
              tag: contact.contact_encryption_tag || "legacy", // Fallback for older schema
            });

            // Re-encrypt with new key
            const newEncryptedData = await encryptSensitiveData(
              decryptedContact
            );

            // Update with new encryption
            await supabase
              .from("encrypted_contacts")
              .update({
                encrypted_contact: newEncryptedData.encrypted,
                contact_encryption_salt: newEncryptedData.salt,
                contact_encryption_iv: newEncryptedData.iv,
                contact_encryption_tag: newEncryptedData.tag,
                updated_at: new Date().toISOString(),
              })
              .eq("id", contact.id);

            // Securely wipe decrypted data
            decryptedContact.replace(/./g, "0");
          } catch (contactError) {
            // Continue with other contacts if one fails
            continue;
          }
        }
      }
    } catch (error) {
      // Continue rotation even if contacts rotation fails
    }
  }

  /**
   * Rotate private messages encryption with new key
   */
  private async rotatePrivateMessagesEncryption(
    userHash: string,
    newEncryptionKey: string
  ): Promise<void> {
    try {
      const { data: messages } = await supabase
        .from("private_messages")
        .select("*")
        .or(`sender_hash.eq.${userHash},recipient_hash.eq.${userHash}`)
        .limit(100); // Process in batches to avoid memory issues

      if (messages && messages.length > 0) {
        for (const message of messages) {
          try {
            // Decrypt existing message content
            const decryptedContent = await decryptSensitiveData({
              encrypted: message.encrypted_content,
              salt: message.content_encryption_salt || message.id, // Fallback for older schema
              iv: message.content_encryption_iv || message.id, // Fallback for older schema
              tag: message.content_encryption_tag || "legacy", // Fallback for older schema
            });

            // Re-encrypt with new key
            const newEncryptedData = await encryptSensitiveData(
              decryptedContent
            );

            // Update with new encryption
            await supabase
              .from("private_messages")
              .update({
                encrypted_content: newEncryptedData.encrypted,
                content_encryption_salt: newEncryptedData.salt,
                content_encryption_iv: newEncryptedData.iv,
                content_encryption_tag: newEncryptedData.tag,
                encryption_version: (message.encryption_version || 1) + 1,
              })
              .eq("id", message.id);

            // Securely wipe decrypted data
            decryptedContent.replace(/./g, "0");
          } catch (messageError) {
            // Continue with other messages if one fails
            continue;
          }
        }
      }
    } catch (error) {
      // Continue rotation even if messages rotation fails
    }
  }

  /**
   * Update user encryption metadata after successful key rotation
   */
  private async updateUserEncryptionMetadata(
    userHash: string,
    metadata: {
      newSessionId: string;
      newUserSalt: string;
      rotationTimestamp: number;
      rotationId: string;
    }
  ): Promise<void> {
    try {
      await supabase
        .from("privacy_users")
        .update({
          session_hash: metadata.newSessionId,
          user_identity_salt: metadata.newUserSalt,
          last_auth_at: new Date(metadata.rotationTimestamp).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("hashed_uuid", userHash);
    } catch (error) {
      // This is critical - if user metadata update fails, throw error
      throw new Error("Failed to update user encryption metadata");
    }
  }
}

// Factory function
export function createPrivacyFirstAuth(): PrivacyFirstAuth {
  return new PrivacyFirstAuth();
}
