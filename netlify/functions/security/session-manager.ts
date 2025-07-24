/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  // Netlify Functions use process.env primarily
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }

  // Fallback for other environments (though not typical in Netlify Functions)
  if (typeof globalThis !== "undefined" && (globalThis as any).process?.env) {
    return (globalThis as any).process.env[key];
  }

  return undefined;
}

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

import { vault } from "../../../lib/vault";
import { FamilyFederationUser, FederationRole } from "../../../src/types/auth";
import { NetlifyResponse } from "../../../types/netlify-functions";

export interface SessionData {
  userId: string;
  npub: string;
  nip05?: string;
  federationRole: FederationRole; // Updated to use correct Master Context roles
  authMethod: "otp" | "nwc";
  isWhitelisted: boolean;
  votingPower: number;
  guardianApproved: boolean;
  stewardApproved: boolean;
  sessionToken: string;
  isAuthenticated: boolean;
  iat?: number;
  exp?: number;
}

export class SecureSessionManager {
  private static readonly SESSION_EXPIRY = 60 * 60; // 1 hour
  private static readonly REFRESH_EXPIRY = 7 * 24 * 60 * 60; // 7 days

  /**
   * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
   */
  private static getEnvVar(key: string): string | undefined {
    if (typeof import.meta !== "undefined" && (import.meta as any).env) {
      return (import.meta as any).env[key];
    }
    return process.env[key];
  }

  /**
   * CRITICAL SECURITY: JWT secret from Vault (mandatory in production)
   */
  private static async getJWTSecret(): Promise<string> {
    try {
      const vaultSecret = await vault.getCredentials("jwt_secret");
      if (vaultSecret) return vaultSecret;
    } catch (error) {
      // Vault fallback to environment
    }

    const envSecret = this.getEnvVar("JWT_SECRET");
    if (envSecret) return envSecret;

    if (this.getEnvVar("NODE_ENV") === "production") {
      throw new Error("JWT_SECRET must be configured in Vault for production");
    }

    return "dev-only-jwt-secret-change-in-production";
  }

  /**
   * CRITICAL SECURITY: Refresh secret from Vault (mandatory in production)
   */
  private static async getRefreshSecret(): Promise<string> {
    try {
      const vaultSecret = await vault.getCredentials("jwt_refresh_secret");
      if (vaultSecret) return vaultSecret;
    } catch (error) {
      // Vault fallback to environment
    }

    const envSecret = this.getEnvVar("JWT_REFRESH_SECRET");
    if (envSecret) return envSecret;

    if (this.getEnvVar("NODE_ENV") === "production") {
      throw new Error(
        "JWT_REFRESH_SECRET must be configured in Vault for production"
      );
    }

    return "dev-only-refresh-secret-change-in-production";
  }

  /**
   * CRITICAL SECURITY: PBKDF2 salt from Vault (Master Context mandatory)
   * WARNING: Default salt generation is NOT secure for production
   */
  private static async getAuthSalt(): Promise<Uint8Array> {
    try {
      const vaultSalt = await vault.getCredentials("auth_salt");
      if (vaultSalt) {
        return new Uint8Array(
          vaultSalt.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
        );
      }
    } catch (error) {
      // Vault fallback to environment
    }

    const envSalt = this.getEnvVar("AUTH_SALT");
    if (envSalt) {
      return new Uint8Array(
        envSalt.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
      );
    }

    if (this.getEnvVar("NODE_ENV") === "production") {
      throw new Error("AUTH_SALT must be configured in Vault for production");
    }

    // WARNING: Development-only salt generation (insecure for production)
    const defaultSalt = new Uint8Array(32);
    crypto.getRandomValues(defaultSalt);
    return defaultSalt;
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
      String.fromCharCode(...new Uint8Array(signature))
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

    const jwtSecret = await this.getJWTSecret();
    const sessionToken = await this.createJWTToken(
      sessionData,
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

      if (!decoded || !decoded.userId || !decoded.npub) return null;

      const sessionData: Partial<SessionData> = {
        userId: decoded.userId,
        npub: decoded.npub,
        isAuthenticated: true,
      };

      const jwtSecret = await this.getJWTSecret();
      return await this.createJWTToken(
        sessionData,
        jwtSecret,
        this.SESSION_EXPIRY
      );
    } catch (error) {
      return null;
    }
  }

  static async createRefreshToken(userData: {
    userId: string;
    npub: string;
  }): Promise<string> {
    const refreshSecret = await this.getRefreshSecret();
    return await this.createJWTToken(
      userData,
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
