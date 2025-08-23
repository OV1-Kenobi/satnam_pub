import { getEnvVar } from "../utils/env.js";

/**
 * Secure Session Management with JWT Tokens
 *
 * MASTER CONTEXT COMPLIANCE:
 * ✅ PBKDF2 with SHA-512 authentication hashing (no fallback algorithms)
 * ✅ Vault-based salt configuration in production (mandatory)
 * ✅ Privacy-first architecture with no external logging
 * ✅ Role hierarchy: "private"|"offspring"|"adult"|"steward"|"guardian"
 * ✅ Browser-compatible serverless environment (Netlify Functions)
 * ✅ JWT tokens instead of cookies for authentication
 */

// Removed vault import - using environment variables directly
import { FamilyFederationUser, FederationRole } from "../../../src/types/auth";
import { NetlifyResponse } from "../../../types/netlify-functions";

export interface SessionData {
  userId: string;
  npub: string;
  nip05?: string;
  federationRole: FederationRole; // Updated to use correct Master Context roles
  authMethod: "otp" | "nwc" | "nip05-password" | "nip07" | "nsec";
  isWhitelisted: boolean;
  votingPower: number;
  guardianApproved: boolean;
  stewardApproved: boolean;
  sessionToken: string;
  isAuthenticated: boolean;
  iat?: number;
  exp?: number;
  // JWT payload properties
  type?: "access" | "refresh";
  hashedId?: string; // HMAC-SHA256 protected identifier
  sessionId?: string; // Session identifier for token tracking
}

export class SecureSessionManager {
  private static readonly SESSION_EXPIRY = 60 * 60; // 1 hour
  private static readonly REFRESH_EXPIRY = 7 * 24 * 60 * 60; // 7 days

  /**
   * CRITICAL SECURITY: JWT secret derived from DUID_SERVER_SECRET
   */
  private static async getJWTSecret(): Promise<string> {
    try {
      const mod = await import("../utils/jwt-secret.js");
      return await mod.getJwtSecret();
    } catch (error) {
      if (getEnvVar("NODE_ENV") === "production") {
        throw new Error(
          "JWT secret derivation failed: DUID_SERVER_SECRET missing"
        );
      }
      // Development-only fallback to prevent local crashes
      return "dev-only-jwt-secret-change-in-production";
    }
  }

  /**
   * CRITICAL SECURITY: Refresh secret from Vault (mandatory in production)
   */
  private static async getRefreshSecret(): Promise<string> {
    const envSecret = getEnvVar("JWT_REFRESH_SECRET");
    if (envSecret) return envSecret;

    if (getEnvVar("NODE_ENV") === "production") {
      throw new Error(
        "JWT_REFRESH_SECRET must be configured in environment variables for production"
      );
    }

    return "dev-only-refresh-secret-change-in-production";
  }

  /**
   * CRITICAL SECURITY: PBKDF2 salt from Vault (Master Context mandatory)
   * WARNING: Default salt generation is NOT secure for production
   */
  private static async getAuthSalt(): Promise<Uint8Array> {
    const envSalt = getEnvVar("AUTH_SALT");
    if (envSalt) {
      return new Uint8Array(
        envSalt.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
      );
    }

    if (getEnvVar("NODE_ENV") === "production") {
      throw new Error(
        "AUTH_SALT must be configured in environment variables for production"
      );
    }

    // WARNING: Development-only salt generation (insecure for production)
    const defaultSalt = new Uint8Array(32);
    crypto.getRandomValues(defaultSalt);
    return defaultSalt;
  }
  /**
   * Identifier pepper for HMAC-based protected IDs
   */
  private static async getIdentifierPepper(): Promise<string> {
    // Prioritize Netlify environment variables (no longer using Vault for this)
    const duidSecret = getEnvVar("DUID_SERVER_SECRET");
    if (duidSecret) return duidSecret;

    const globalSalt = getEnvVar("GLOBAL_SALT");
    if (globalSalt) return globalSalt;

    const jwt = getEnvVar("JWT_SECRET");
    if (jwt) return jwt;

    // Enforce configuration in production
    if (getEnvVar("NODE_ENV") === "production") {
      throw new Error(
        "Identifier pepper must be configured via env 'DUID_SERVER_SECRET' (primary) or 'GLOBAL_SALT' in production"
      );
    }

    // Development-only fallback
    return "dev-only-identifier-pepper-change-in-production";
  }

  /** Generate a cryptographically secure random session ID (hex) */
  private static generateRandomSessionIdHex(): string {
    const bytes = new Uint8Array(32); // Use 32 bytes for 256-bit entropy
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /** Compute HMAC-SHA256(pepper, message) and return hex */
  private static async hmacSha256Hex(
    key: string,
    message: string
  ): Promise<string> {
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const sig = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      enc.encode(message)
    );
    const bytes = new Uint8Array(sig);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * MASTER CONTEXT COMPLIANCE: PBKDF2 with SHA-512 authentication hashing
   * CRITICAL SECURITY: 100,000 iterations, no fallback algorithms allowed
   */
  private static async createAuthHash(data: string): Promise<string> {
    const salt = await this.getAuthSalt();
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      dataBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    const saltBuffer = new ArrayBuffer(salt.length);
    const saltView = new Uint8Array(saltBuffer);
    saltView.set(salt);

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBuffer,
        iterations: 100000, // High iteration count for security
        hash: "SHA-512", // Master Context requires SHA-512
      },
      keyMaterial,
      512 // 64 bytes = 512 bits
    );

    const hashArray = new Uint8Array(derivedBits);
    return Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * JWT token creation using Web Crypto API (browser-compatible)
   */
  private static async createJWTToken(
    payload: any,
    secret: string,
    expiresIn: number
  ): Promise<string> {
    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const tokenPayload = { ...payload, iat: now, exp: now + expiresIn };

    const encodedHeader = btoa(JSON.stringify(header))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const encodedPayload = btoa(JSON.stringify(tokenPayload))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const encoder = new TextEncoder();
    const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
    const keyData = encoder.encode(secret);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
    const encodedSignature = btoa(
      Array.from(new Uint8Array(signature))
        .map((c) => String.fromCharCode(c))
        .join("")
    )
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
  }

  /**
   * JWT token verification using Web Crypto API
   */
  private static async verifyJWTToken(
    token: string,
    secret: string
  ): Promise<any | null> {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;

      const [encodedHeader, encodedPayload, encodedSignature] = parts;

      const encoder = new TextEncoder();
      const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
      const keyData = encoder.encode(secret);

      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );

      const signature = Uint8Array.from(
        atob(
          encodedSignature
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(
              encodedSignature.length +
                ((4 - (encodedSignature.length % 4)) % 4),
              "="
            )
        ),
        (c) => c.charCodeAt(0)
      );

      const isValid = await crypto.subtle.verify(
        "HMAC",
        cryptoKey,
        signature,
        data
      );
      if (!isValid) return null;

      const payload = JSON.parse(
        atob(
          encodedPayload
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(
              encodedPayload.length + ((4 - (encodedPayload.length % 4)) % 4),
              "="
            )
        )
      );

      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) return null;

      return payload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Create JWT session for authenticated user
   */
  static async createSession(
    _res: NetlifyResponse, // Reserved for future response header setting
    userData: FamilyFederationUser
  ): Promise<string> {
    const sessionData: SessionData = {
      userId: userData.npub,
      npub: userData.npub,
      nip05: userData.nip05,
      federationRole: userData.federationRole,
      authMethod: userData.authMethod,
      isWhitelisted: userData.isWhitelisted,
      votingPower: userData.votingPower,
      guardianApproved: userData.guardianApproved,
      stewardApproved: userData.stewardApproved,
      sessionToken: "",
      isAuthenticated: true,
    };

    // Standardized TokenPayload augmentation
    const jwtSecret = await this.getJWTSecret();
    const sessionId = this.generateRandomSessionIdHex();
    const pepper = await this.getIdentifierPepper();
    const hashedId = await this.hmacSha256Hex(
      pepper,
      `${sessionData.userId}|${sessionId}`
    );

    const payload = {
      // Required TokenPayload fields
      userId: sessionData.userId,
      hashedId,
      nip05: sessionData.nip05,
      type: "access" as const,
      sessionId,
      // Backward-compat: include original session fields used by server endpoints
      ...sessionData,
    };

    const sessionToken = await this.createJWTToken(
      payload,
      jwtSecret,
      this.SESSION_EXPIRY
    );

    sessionData.sessionToken = sessionToken;
    return sessionToken;
  }

  /**
   * Validate JWT token and extract session data
   */
  static async validateSession(token: string): Promise<SessionData | null> {
    if (!token) return null;

    try {
      const jwtSecret = await this.getJWTSecret();
      const decoded = await this.verifyJWTToken(token, jwtSecret);
      return decoded ? (decoded as SessionData) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Refresh session using refresh token
   */
  static async refreshSession(refreshToken: string): Promise<string | null> {
    if (!refreshToken) return null;

    try {
      const refreshSecret = await this.getRefreshSecret();
      const decoded = await this.verifyJWTToken(refreshToken, refreshSecret);

      if (!decoded || !decoded.userId) return null;
      if (decoded.type !== "refresh") return null;

      const jwtSecret = await this.getJWTSecret();

      // Preserve same sessionId if present, otherwise generate a new one
      const sessionId = decoded.sessionId || this.generateRandomSessionIdHex();
      const pepper = await this.getIdentifierPepper();
      const hashedId = await this.hmacSha256Hex(
        pepper,
        `${decoded.userId}|${sessionId}`
      );

      const payload = {
        userId: decoded.userId,
        hashedId,
        nip05: decoded.nip05,
        type: "access" as const,
        sessionId,
        // Keep minimal fields for backward compatibility
        npub: decoded.npub,
        isAuthenticated: true,
      };

      return await this.createJWTToken(payload, jwtSecret, this.SESSION_EXPIRY);
    } catch (error) {
      return null;
    }
  }

  static async createRefreshToken(userData: {
    userId: string;
    npub: string;
    nip05?: string;
  }): Promise<string> {
    const refreshSecret = await this.getRefreshSecret();

    const sessionId = this.generateRandomSessionIdHex();
    const pepper = await this.getIdentifierPepper();
    const hashedId = await this.hmacSha256Hex(
      pepper,
      `${userData.userId}|${sessionId}`
    );

    const payload = {
      userId: userData.userId,
      hashedId,
      nip05: userData.nip05,
      type: "refresh" as const,
      sessionId,
      // Minimal backward-compatible fields
      npub: userData.npub,
    };

    return await this.createJWTToken(
      payload,
      refreshSecret,
      this.REFRESH_EXPIRY
    );
  }

  /**
   * PRIVACY COMPLIANCE: Return safe user data (no sensitive tokens)
   */
  static getSessionInfo(sessionData: SessionData | null): {
    isAuthenticated: boolean;
    user?: Partial<SessionData>;
  } {
    if (!sessionData) return { isAuthenticated: false };

    return {
      isAuthenticated: true,
      user: {
        npub: sessionData.npub,
        nip05: sessionData.nip05,
        federationRole: sessionData.federationRole,
        authMethod: sessionData.authMethod,
        isWhitelisted: sessionData.isWhitelisted,
        votingPower: sessionData.votingPower,
        guardianApproved: sessionData.guardianApproved,
        stewardApproved: sessionData.stewardApproved,
      },
    };
  }

  static async validateSessionFromHeader(
    authHeader: string | undefined
  ): Promise<SessionData | null> {
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.substring(7);
    return await this.validateSession(token);
  }

  /**
   * PRIVACY COMPLIANCE: Generate secure session ID using PBKDF2 hash
   */
  static async generateSessionId(npub: string): Promise<string> {
    const sessionSeed = `${npub}-${Date.now()}-${crypto
      .getRandomValues(new Uint8Array(16))
      .join("")}`;
    return await this.createAuthHash(sessionSeed);
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Role hierarchy permission checking
   */
  static hasRolePermission(
    sessionData: SessionData,
    requiredRole: FederationRole
  ): boolean {
    const roleHierarchy: Record<FederationRole, number> = {
      offspring: 1,
      adult: 2,
      steward: 3,
      guardian: 4,
      private: 0, // Special case for private users
    };

    const userLevel = roleHierarchy[sessionData.federationRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    return userLevel >= requiredLevel;
  }

  /**
   * SECURITY: Clear sensitive data from memory (best effort in JavaScript)
   */
  static clearSensitiveData(data: any): void {
    if (typeof data === "object" && data !== null) {
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          if (typeof data[key] === "string") {
            data[key] = "";
          } else if (typeof data[key] === "object") {
            this.clearSensitiveData(data[key]);
          }
        }
      }
    }
  }
}
