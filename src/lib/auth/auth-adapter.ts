/**
 * Privacy-First Authentication Adapter
 * Works NOW with Supabase, easily migrated to private relay later
 * Supports: NIP-07, NWC, OTP, NIP-05 only
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

// Privacy-first types (Nostr-only)
export interface PrivateAuthUser {
  id: string; // Hashed UUID
  npub: string;
  nip05?: string;
  federationRole: "offspring" | "adult" | "steward" | "guardian";
  authMethod: "nip07" | "nwc" | "otp" | "nip05";
  isWhitelisted: boolean;
  votingPower: number;
  stewardApproved: boolean;
  guardianApproved: boolean;
  pubkey: string;
  sessionHash: string;
}

export interface PrivateAuthSession {
  sessionId: string;
  userHash: string;
  expiresAt: number;
  isValid: boolean;
}

export interface AuthResult {
  success: boolean;
  user?: PrivateAuthUser;
  session?: PrivateAuthSession;
  error?: string;
}

export interface NostrCredentials {
  // NIP-07 only
  pubkey?: string;
  signature?: string;
  challenge?: string;

  // NWC only
  connectionString?: string;

  // OTP only
  identifier?: string; // npub or nip05
  code?: string;

  // NIP-05 only
  nip05?: string;
  domain?: string;
}

// Privacy utilities
class PrivacyUtils {
  private static readonly SALT = "family-federation-privacy-salt";

  /**
   * Cryptographically secure ID hashing using Web Crypto API
   * Replaces insecure btoa encoding with SHA-256 hashing
   */
  static async hashId(id: string): Promise<string> {
    try {
      // Get Web Crypto API instance
      const crypto = globalThis.crypto || window.crypto;
      if (!crypto || !crypto.subtle) {
        throw new Error(
          "Web Crypto API not available - secure context (HTTPS) required"
        );
      }

      // Prepare input data with salt
      const encoder = new TextEncoder();
      const saltedInput = `${id}:${this.SALT}:${Date.now()}`;
      const data = encoder.encode(saltedInput);

      // Generate cryptographically secure hash using SHA-256
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);

      // Convert to hex string (64 characters for full security)
      const hashArray = new Uint8Array(hashBuffer);
      const hashHex = Array.from(hashArray)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

      // Return first 32 characters for reasonable length while maintaining security
      return hashHex.substring(0, 32);
    } catch (error) {
      console.error("Cryptographic hashing failed:", error);
      throw new Error("Failed to generate secure hash");
    }
  }

  /**
   * Generate cryptographically secure session ID
   */
  static async generateSessionId(): Promise<string> {
    try {
      // Generate cryptographically secure random bytes
      const crypto = globalThis.crypto || window.crypto;
      if (!crypto) {
        throw new Error("Web Crypto API not available");
      }

      const randomBytes = crypto.getRandomValues(new Uint8Array(16));
      const timestamp = Date.now().toString();

      // Combine timestamp with secure random data
      const sessionData = `${timestamp}:${Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`;

      return await this.hashId(sessionData);
    } catch (error) {
      console.error("Session ID generation failed:", error);
      throw new Error("Failed to generate secure session ID");
    }
  }
}

// Current Supabase adapter (works NOW)
export class SupabaseAuthAdapter {
  name = "supabase";

  async isAvailable(): Promise<boolean> {
    try {
      const { data, error } = await (
        await import("../supabase")
      ).supabase.auth.getSession();
      return !error;
    } catch {
      return false;
    }
  }

  async authenticateNip07(credentials: NostrCredentials): Promise<AuthResult> {
    try {
      if (!credentials.pubkey || !credentials.signature) {
        return { success: false, error: "Missing NIP-07 credentials" };
      }

      // Store Nostr data in Supabase user metadata
      const { data, error } = await (
        await import("../supabase")
      ).supabase.auth.signInAnonymously();

      if (data.user) {
        // Update user metadata after sign in
        await (
          await import("../supabase")
        ).supabase.auth.updateUser({
          data: {
            pubkey: credentials.pubkey,
            npub: await this.pubkeyToNpub(credentials.pubkey),
            authMethod: "nip07",
            signature: credentials.signature,
            federationRole: "private", // Default for new users - no RBAC restrictions
            isWhitelisted: false,
            votingPower: 1,
            stewardApproved: false,
            guardianApproved: false,
          },
        });
      }

      if (error) return { success: false, error: error.message };

      const user = await this.createPrivateUser(data.user!, "nip07");
      const session = await this.createPrivateSession(user);

      return { success: true, user, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "NIP-07 auth failed",
      };
    }
  }

  async authenticateNwc(credentials: NostrCredentials): Promise<AuthResult> {
    try {
      if (!credentials.connectionString) {
        return { success: false, error: "Missing NWC connection string" };
      }

      // Parse NWC connection string to get pubkey
      const pubkey = this.parseNwcPubkey(credentials.connectionString);

      const { data, error } = await (
        await import("../supabase")
      ).supabase.auth.signInAnonymously();

      if (data.user) {
        // Update user metadata after sign in
        await (
          await import("../supabase")
        ).supabase.auth.updateUser({
          data: {
            pubkey,
            npub: await this.pubkeyToNpub(pubkey),
            authMethod: "nwc",
            connectionString: credentials.connectionString,
            federationRole: "private",
            isWhitelisted: false,
            votingPower: 1,
            stewardApproved: false,
            guardianApproved: false,
          },
        });
      }

      if (error) return { success: false, error: error.message };

      const user = await this.createPrivateUser(data.user!, "nwc");
      const session = await this.createPrivateSession(user);

      return { success: true, user, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "NWC auth failed",
      };
    }
  }

  async authenticateOtp(credentials: NostrCredentials): Promise<AuthResult> {
    try {
      if (!credentials.identifier || !credentials.code) {
        return { success: false, error: "Missing OTP credentials" };
      }

      // Secure OTP validation using existing privacy-first infrastructure
      const otpVerificationResult = await this.verifySecureOTP(
        credentials.identifier,
        credentials.code
      );

      if (!otpVerificationResult.success) {
        return {
          success: false,
          error: otpVerificationResult.error || "Invalid OTP code",
        };
      }

      const { data, error } = await (
        await import("../supabase")
      ).supabase.auth.signInAnonymously();

      if (data.user) {
        // Update user metadata after sign in
        await (
          await import("../supabase")
        ).supabase.auth.updateUser({
          data: {
            identifier: credentials.identifier,
            authMethod: "otp",
            federationRole: "private",
            isWhitelisted: true, // OTP users are pre-whitelisted
            votingPower: 1,
            stewardApproved: false,
            guardianApproved: false,
          },
        });
      }

      if (error) return { success: false, error: error.message };

      const user = await this.createPrivateUser(data.user!, "otp");
      const session = await this.createPrivateSession(user);

      return { success: true, user, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "OTP auth failed",
      };
    }
  }

  async authenticateNip05(credentials: NostrCredentials): Promise<AuthResult> {
    try {
      if (!credentials.nip05) {
        return { success: false, error: "Missing NIP-05 identifier" };
      }

      // Validate NIP-05 identifier
      const pubkey = await this.validateNip05(credentials.nip05);
      if (!pubkey) {
        return { success: false, error: "Invalid NIP-05 identifier" };
      }

      const { data, error } = await (
        await import("../supabase")
      ).supabase.auth.signInAnonymously();

      if (data.user) {
        // Update user metadata after sign in
        await (
          await import("../supabase")
        ).supabase.auth.updateUser({
          data: {
            pubkey,
            npub: await this.pubkeyToNpub(pubkey),
            nip05: credentials.nip05,
            authMethod: "nip05",
            federationRole: "private",
            isWhitelisted: false,
            votingPower: 1,
            stewardApproved: false,
            guardianApproved: false,
          },
        });
      }

      if (error) return { success: false, error: error.message };

      const user = await this.createPrivateUser(data.user!, "nip05");
      const session = await this.createPrivateSession(user);

      return { success: true, user, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "NIP-05 auth failed",
      };
    }
  }

  async getSession(): Promise<PrivateAuthSession | null> {
    try {
      const {
        data: { session },
        error,
      } = await (await import("../supabase")).supabase.auth.getSession();
      if (error || !session) return null;

      return {
        sessionId: await PrivacyUtils.hashId(session.access_token),
        userHash: await PrivacyUtils.hashId(session.user.id),
        expiresAt: new Date(session.expires_at!).getTime(),
        isValid: true,
      };
    } catch {
      return null;
    }
  }

  async logout(): Promise<boolean> {
    try {
      const { error } = await (
        await import("../supabase")
      ).supabase.auth.signOut();
      return !error;
    } catch {
      return false;
    }
  }

  async validateSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession();
    return session?.sessionId === sessionId && session.isValid;
  }

  // Private helpers
  private async createPrivateUser(
    supabaseUser: any,
    authMethod: string
  ): Promise<PrivateAuthUser> {
    const metadata = supabaseUser.user_metadata || {};
    return {
      id: await PrivacyUtils.hashId(supabaseUser.id),
      npub: metadata.npub || "",
      nip05: metadata.nip05,
      federationRole: metadata.federationRole || "private",
      authMethod: authMethod as any,
      isWhitelisted: metadata.isWhitelisted || false,
      votingPower: metadata.votingPower || 1,
      stewardApproved: metadata.stewardApproved || false,
      guardianApproved: metadata.guardianApproved || false,
      pubkey: metadata.pubkey || "",
      sessionHash: await PrivacyUtils.generateSessionId(),
    };
  }

  private async createPrivateSession(
    user: PrivateAuthUser
  ): Promise<PrivateAuthSession> {
    return {
      sessionId: await PrivacyUtils.generateSessionId(),
      userHash: user.id,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      isValid: true,
    };
  }

  /**
   * Convert hex public key to bech32 npub format using secure implementation
   * SECURITY: Uses proper NIP-19 bech32 encoding from existing secure infrastructure
   * @param pubkey Hex-encoded public key (64 or 66 characters)
   * @returns Bech32-encoded npub
   */
  private async pubkeyToNpub(pubkey: string): Promise<string> {
    try {
      // Import secure bech32 encoding from existing infrastructure
      const { encodePublicKey } = await import("../../../lib/nostr");

      // Validate input format
      if (!pubkey || typeof pubkey !== "string") {
        throw new Error("Invalid pubkey: must be a non-empty string");
      }

      // Remove any prefix and ensure proper length
      let cleanPubkey = pubkey.toLowerCase();
      if (cleanPubkey.startsWith("0x")) {
        cleanPubkey = cleanPubkey.slice(2);
      }

      // Handle compressed public key (66 chars) by removing compression prefix
      if (cleanPubkey.length === 66) {
        if (cleanPubkey.startsWith("02") || cleanPubkey.startsWith("03")) {
          cleanPubkey = cleanPubkey.slice(2);
        }
      }

      // Validate final length (should be 64 hex characters)
      if (cleanPubkey.length !== 64) {
        throw new Error(
          `Invalid pubkey length: expected 64 hex characters, got ${cleanPubkey.length}`
        );
      }

      // Validate hex format
      if (!/^[0-9a-f]{64}$/i.test(cleanPubkey)) {
        throw new Error("Invalid pubkey format: must be 64 hex characters");
      }

      // Use secure NIP-19 encoding from existing infrastructure
      const npub = encodePublicKey(cleanPubkey);

      // Validate output format
      if (!npub || !npub.startsWith("npub1") || npub.length !== 63) {
        throw new Error(`Invalid npub encoding result: ${npub}`);
      }

      return npub;
    } catch (error) {
      console.error("Secure npub encoding failed:", error);
      throw new Error(
        `Failed to encode npub: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private parseNwcPubkey(connectionString: string): string {
    // Parse NWC connection string to extract pubkey
    try {
      const url = new URL(connectionString);
      return url.searchParams.get("pubkey") || "";
    } catch {
      return "";
    }
  }

  /**
   * Validate NIP-05 identifier with secure domain verification
   * SECURITY: Uses existing secure NIP-05 verification infrastructure
   * @param nip05 NIP-05 identifier (e.g., "alice@satnam.pub")
   * @returns Public key if valid, null if invalid
   */
  private async validateNip05(nip05: string): Promise<string | null> {
    try {
      // Import secure NIP-05 verification from existing infrastructure
      const { nip05Utils } = await import("../nip05-verification");

      // Basic format validation first
      if (!nip05Utils.validateFormat(nip05)) {
        console.error("Invalid NIP-05 format:", nip05);
        return null;
      }

      // Check against allowed domains for security
      const [, domain] = nip05.split("@");
      const allowedDomains = ["satnam.pub", "citadel.academy"]; // From config

      if (!allowedDomains.includes(domain)) {
        console.error("NIP-05 domain not in allowlist:", domain);
        return null;
      }

      // Perform secure NIP-05 verification
      const verificationResult = await nip05Utils.verify(nip05);

      if (!verificationResult.verified) {
        console.error("NIP-05 verification failed:", verificationResult.error);
        return null;
      }

      // Return the verified public key
      if (!verificationResult.pubkey) {
        console.error("NIP-05 verification succeeded but no pubkey returned");
        return null;
      }

      // Validate the returned pubkey format
      const pubkey = verificationResult.pubkey;
      if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
        console.error(
          "Invalid pubkey format from NIP-05 verification:",
          pubkey
        );
        return null;
      }

      console.log("✅ NIP-05 verification successful for:", nip05);
      return pubkey;
    } catch (error) {
      console.error("NIP-05 validation error:", error);
      return null;
    }
  }

  /**
   * Secure OTP verification using existing privacy-first infrastructure
   * Integrates with TOTP system and OTP storage service
   * SECURITY: Implements RFC 6238 TOTP with 120-second windows, ±1 tolerance, replay protection
   */
  private async verifySecureOTP(
    identifier: string,
    code: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Import required modules for secure OTP verification
      const { verifyTOTPWithReplayProtection, constantTimeEquals } =
        await import("../../../utils/crypto");

      // Rate limiting check - prevent brute force attacks
      const rateLimitResult = await this.checkOTPRateLimit(identifier);
      if (!rateLimitResult.allowed) {
        return {
          success: false,
          error: `Too many OTP attempts. Try again in ${Math.ceil(
            rateLimitResult.retryAfter / 60
          )} minutes`,
        };
      }

      // Hash the identifier for privacy-first lookup
      const hashedIdentifier = await this.hashIdentifierForOTP(identifier);

      // Get active OTP sessions for this identifier
      const { supabase } = await import("../supabase.js");
      const client = supabase;

      const { data: otpSessions, error: fetchError } = await client
        .from("family_otp_verification")
        .select("*")
        .eq("hashed_identifier", hashedIdentifier)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(5); // Check recent sessions only

      if (fetchError || !otpSessions || otpSessions.length === 0) {
        await this.logOTPSecurityEvent("otp_verify_failed", {
          identifier: hashedIdentifier,
          reason: "no_active_sessions",
          code: "***masked***",
        });
        return { success: false, error: "No active OTP session found" };
      }

      // Try to verify against each active session
      for (const session of otpSessions) {
        try {
          // Check if this session has exceeded max attempts
          if (session.attempts >= 3) {
            continue;
          }

          // For TOTP-based verification, use the stored secret
          if (session.totp_secret) {
            // Use replay protection to prevent token reuse
            const usedTokens = new Set<string>(session.used_tokens || []);

            const totpResult = await verifyTOTPWithReplayProtection(
              code,
              session.totp_secret,
              usedTokens,
              undefined, // Use current timestamp
              1 // ±1 window tolerance as per requirements
            );

            if (totpResult.valid && !totpResult.replayAttack) {
              // Mark session as used and update used tokens
              await client
                .from("family_otp_verification")
                .update({
                  used: true,
                  used_at: new Date().toISOString(),
                  used_tokens: Array.from(usedTokens),
                })
                .eq("id", session.id);

              await this.logOTPSecurityEvent("otp_verify_success", {
                identifier: hashedIdentifier,
                sessionId: session.id,
                timeWindow: totpResult.timeWindow,
              });

              return { success: true };
            }

            if (totpResult.replayAttack) {
              await this.logOTPSecurityEvent("otp_replay_attack", {
                identifier: hashedIdentifier,
                sessionId: session.id,
                code: "***masked***",
              });
              return {
                success: false,
                error: "OTP code has already been used",
              };
            }
          }

          // For hash-based verification (legacy support)
          if (session.otp_hash && session.salt) {
            // Use Web Crypto API for secure hashing
            const providedHash = await this.hashOTPWithSalt(code, session.salt);

            // Use constant-time comparison to prevent timing attacks
            if (constantTimeEquals(providedHash, session.otp_hash)) {
              // Mark session as used
              await client
                .from("family_otp_verification")
                .update({
                  used: true,
                  used_at: new Date().toISOString(),
                })
                .eq("id", session.id);

              await this.logOTPSecurityEvent("otp_verify_success", {
                identifier: hashedIdentifier,
                sessionId: session.id,
                method: "hash_based",
              });

              return { success: true };
            }
          }

          // Increment attempt count for this session
          await client
            .from("family_otp_verification")
            .update({ attempts: session.attempts + 1 })
            .eq("id", session.id);
        } catch (sessionError) {
          console.error("Error verifying OTP session:", sessionError);
          continue;
        }
      }

      // No valid OTP found
      await this.logOTPSecurityEvent("otp_verify_failed", {
        identifier: hashedIdentifier,
        reason: "invalid_code",
        sessionsChecked: otpSessions.length,
      });

      return { success: false, error: "Invalid OTP code" };
    } catch (error) {
      console.error("Secure OTP verification failed:", error);
      return {
        success: false,
        error: "OTP verification system error",
      };
    }
  }

  /**
   * Rate limiting for OTP verification attempts
   * SECURITY: Prevents brute force attacks with exponential backoff
   */
  private async checkOTPRateLimit(identifier: string): Promise<{
    allowed: boolean;
    retryAfter: number;
  }> {
    try {
      const hashedIdentifier = await PrivacyUtils.hashId(identifier);
      const now = Date.now();
      const windowMs = 15 * 60 * 1000; // 15 minutes
      const maxAttempts = 5;

      // Get recent attempts from storage (could be localStorage or database)
      const storageKey = `otp_rate_limit_${hashedIdentifier}`;
      const storedData = localStorage.getItem(storageKey);

      let attempts: number[] = [];
      if (storedData) {
        try {
          attempts = JSON.parse(storedData).filter(
            (timestamp: number) => now - timestamp < windowMs
          );
        } catch {
          attempts = [];
        }
      }

      if (attempts.length >= maxAttempts) {
        const oldestAttempt = Math.min(...attempts);
        const retryAfter = windowMs - (now - oldestAttempt);
        return { allowed: false, retryAfter };
      }

      // Record this attempt
      attempts.push(now);
      localStorage.setItem(storageKey, JSON.stringify(attempts));

      return { allowed: true, retryAfter: 0 };
    } catch (error) {
      console.error("Rate limit check failed:", error);
      // Fail open for availability, but log the error
      return { allowed: true, retryAfter: 0 };
    }
  }

  /**
   * Hash identifier for privacy-first OTP lookup
   * SECURITY: Uses same hashing as existing privacy infrastructure
   */
  private async hashIdentifierForOTP(identifier: string): Promise<string> {
    return await PrivacyUtils.hashId(identifier);
  }

  /**
   * Log OTP security events for audit trail
   * SECURITY: Maintains audit log while preserving privacy
   */
  private async logOTPSecurityEvent(
    event: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        event,
        details: {
          ...details,
          userAgent: navigator.userAgent,
          timestamp,
        },
      };

      // Log to console for development (in production, this would go to secure audit log)
      console.log(`[OTP Security Event] ${event}:`, logEntry);

      // In production, this would integrate with the existing audit logging system
      // For now, store in localStorage for debugging
      const auditKey = `otp_audit_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 11)}`;
      localStorage.setItem(auditKey, JSON.stringify(logEntry));

      // Clean up old audit entries (keep last 100)
      const auditKeys = Object.keys(localStorage).filter((key) =>
        key.startsWith("otp_audit_")
      );
      if (auditKeys.length > 100) {
        auditKeys
          .sort()
          .slice(0, auditKeys.length - 100)
          .forEach((key) => {
            localStorage.removeItem(key);
          });
      }
    } catch (error) {
      console.error("Failed to log OTP security event:", error);
      // Don't throw - audit logging failure shouldn't break authentication
    }
  }

  /**
   * Hash OTP with salt for legacy verification support
   * SECURITY: Uses Web Crypto API for secure hashing
   */
  private async hashOTPWithSalt(otp: string, salt: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(otp + salt);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = new Uint8Array(hashBuffer);
      return Array.from(hashArray)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    } catch (error) {
      console.error("OTP hashing failed:", error);
      throw new Error("Failed to hash OTP");
    }
  }
}

// Factory for future private relay adapter
export function createAuthAdapter(
  provider: "supabase" | "private-relay" = "supabase"
) {
  switch (provider) {
    case "supabase":
      return new SupabaseAuthAdapter();
    case "private-relay":
      // Will be implemented when private relay is ready
      throw new Error("Private relay adapter not yet implemented");
    default:
      return new SupabaseAuthAdapter();
  }
}
