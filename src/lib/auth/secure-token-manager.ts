/**
 * Secure Token Manager
 *
 * Implements the security improvements from unified-authentication-system.md:
 * - Short-lived access tokens (5-15 minutes) kept in memory
 * - Refresh tokens stored in HttpOnly, Secure, SameSite=Strict cookies
 * - Token rotation on each refresh
 * - AES-256-GCM with envelope encryption
 * - HMAC-SHA256 identifier protection
 */

// Access token stored in memory only (vulnerable to page reload but secure from XSS)
let currentAccessToken: string | null = null;
let accessTokenExpiry: number | null = null;

// Token configuration
const TOKEN_CONFIG = {
  ACCESS_TOKEN_LIFETIME: 15 * 60 * 1000, // 15 minutes
  REFRESH_TOKEN_LIFETIME: 7 * 24 * 60 * 60 * 1000, // 7 days
  COOKIE_NAME: "satnam_refresh_token",
  ROTATION_THRESHOLD: 5 * 60 * 1000, // Rotate if token expires in 5 minutes
} as const;

export interface SecureTokens {
  accessToken: string;
  accessTokenExpiry: number;
  refreshToken?: string; // Only returned on first auth
}

export interface TokenPayload {
  userId: string;
  hashedId: string; // HMAC-SHA256(pepper, userId)
  nip05?: string;
  iat: number;
  exp: number;
  type: "access" | "refresh";
  sessionId: string;
}

/**
 * Identifier Protection Service
 * Implements UUIDv4 + HMAC-SHA256(pepper, uuid) with per-entity salt
 */
export class IdentifierProtectionService {
  private static pepper: string | null = null;

  /**
   * Initialize the service with a secure pepper from environment
   */
  static async initialize(): Promise<void> {
    try {
      // In production, this would come from a secure KMS or environment variable
      // For now, we'll generate a consistent pepper from user session
      const response = await fetch("/api/auth/get-pepper", {
        method: "GET",
        credentials: "include",
      });

      if (response.ok) {
        const { pepper } = await response.json();
        this.pepper = pepper;
      } else {
        throw new Error("Failed to retrieve secure pepper");
      }
    } catch (error) {
      console.error("Failed to initialize identifier protection:", error);
      throw error;
    }
  }

  /**
   * Generate protected identifier: HMAC-SHA256(pepper, uuid + salt)
   */
  static async generateProtectedId(
    uuid: string,
    salt?: string
  ): Promise<string> {
    if (!this.pepper) {
      throw new Error("Identifier protection service not initialized");
    }

    const message = uuid + (salt || "");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(this.pepper),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(message)
    );

    // Return as hex string
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Verify protected identifier
   */
  static async verifyProtectedId(
    uuid: string,
    hashedId: string,
    salt?: string
  ): Promise<boolean> {
    try {
      const expectedHash = await this.generateProtectedId(uuid, salt);

      // Constant-time comparison to prevent timing attacks
      if (expectedHash.length !== hashedId.length) {
        return false;
      }

      let result = 0;
      for (let i = 0; i < expectedHash.length; i++) {
        result |= expectedHash.charCodeAt(i) ^ hashedId.charCodeAt(i);
      }

      return result === 0;
    } catch (error) {
      console.error("Failed to verify protected identifier:", error);
      return false;
    }
  }
}

/**
 * Envelope Encryption Service
 * Implements AES-256-GCM with envelope encryption and key rotation
 */
export class EnvelopeEncryptionService {
  private static readonly ALGORITHM = "AES-GCM";
  private static readonly KEY_LENGTH = 256;
  private static readonly IV_LENGTH = 12; // 96 bits for GCM
  private static readonly TAG_LENGTH = 16; // 128 bits for GCM

  /**
   * Generate a new encryption key
   */
  static async generateKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      {
        name: this.ALGORITHM,
        length: this.KEY_LENGTH,
      },
      true,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Encrypt data with envelope encryption
   * Returns: { encryptedData, encryptedKey, iv }
   */
  static async encryptWithEnvelope(
    data: string,
    masterKey: CryptoKey
  ): Promise<{
    encryptedData: string;
    encryptedKey: string;
    iv: string;
  }> {
    // Generate data encryption key (DEK)
    const dataKey = await this.generateKey();

    // Export DEK for encryption with master key
    const dataKeyBuffer = await crypto.subtle.exportKey("raw", dataKey);

    // Encrypt the data with DEK
    const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
    const encryptedDataBuffer = await crypto.subtle.encrypt(
      { name: this.ALGORITHM, iv },
      dataKey,
      new TextEncoder().encode(data)
    );

    // Encrypt DEK with master key (envelope)
    const masterIv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
    const encryptedKeyBuffer = await crypto.subtle.encrypt(
      { name: this.ALGORITHM, iv: masterIv },
      masterKey,
      dataKeyBuffer
    );

    return {
      encryptedData: this.bufferToHex(encryptedDataBuffer),
      encryptedKey: this.bufferToHex(
        new Uint8Array([...masterIv, ...new Uint8Array(encryptedKeyBuffer)])
      ),
      iv: this.bufferToHex(iv),
    };
  }

  /**
   * Decrypt data with envelope encryption
   */
  static async decryptWithEnvelope(
    encryptedData: string,
    encryptedKey: string,
    iv: string,
    masterKey: CryptoKey
  ): Promise<string> {
    // Extract master IV and encrypted DEK
    const encryptedKeyBuffer = this.hexToBuffer(encryptedKey);
    const masterIv = encryptedKeyBuffer.slice(0, this.IV_LENGTH);
    const encryptedDEK = encryptedKeyBuffer.slice(this.IV_LENGTH);

    // Decrypt DEK with master key
    const dataKeyBuffer = await crypto.subtle.decrypt(
      { name: this.ALGORITHM, iv: masterIv },
      masterKey,
      encryptedDEK
    );

    // Import decrypted DEK
    const dataKey = await crypto.subtle.importKey(
      "raw",
      dataKeyBuffer,
      { name: this.ALGORITHM },
      false,
      ["decrypt"]
    );

    // Decrypt data with DEK
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: this.ALGORITHM, iv: this.hexToBuffer(iv) },
      dataKey,
      this.hexToBuffer(encryptedData)
    );

    return new TextDecoder().decode(decryptedBuffer);
  }

  private static bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private static hexToBuffer(hex: string): Uint8Array {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return new Uint8Array(bytes);
  }
}

/**
 * Secure Token Manager
 * Handles access/refresh token lifecycle with enhanced security
 */
export class SecureTokenManager {
  private static initialized = false;

  /**
   * Initialize the secure token manager
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await IdentifierProtectionService.initialize();
      this.initialized = true;
      console.log("🔐 Secure Token Manager initialized");
    } catch (error) {
      console.error("Failed to initialize Secure Token Manager:", error);
      throw error;
    }
  }

  /**
   * Get current access token (from memory)
   */
  static getAccessToken(): string | null {
    if (!currentAccessToken || !accessTokenExpiry) {
      return null;
    }

    // Check if token is expired
    if (Date.now() >= accessTokenExpiry) {
      this.clearAccessToken();
      return null;
    }

    return currentAccessToken;
  }

  /**
   * Set access token in memory with expiry
   */
  static setAccessToken(token: string, expiryMs: number): void {
    currentAccessToken = token;
    accessTokenExpiry = expiryMs;
  }

  /**
   * Clear access token from memory
   */
  static clearAccessToken(): void {
    currentAccessToken = null;
    accessTokenExpiry = null;
  }

  /**
   * Check if access token needs refresh
   */
  static needsRefresh(): boolean {
    if (!accessTokenExpiry) return true;

    return accessTokenExpiry - Date.now() < TOKEN_CONFIG.ROTATION_THRESHOLD;
  }

  /**
   * Refresh tokens using HttpOnly refresh cookie
   */
  static async refreshTokens(): Promise<SecureTokens | null> {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include", // Include HttpOnly cookies
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Refresh token expired or invalid
          await this.logout();
          return null;
        }
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const tokens: SecureTokens = await response.json();

      // Store new access token in memory
      this.setAccessToken(tokens.accessToken, tokens.accessTokenExpiry);

      console.log("🔄 Tokens refreshed successfully");
      return tokens;
    } catch (error) {
      console.error("Token refresh failed:", error);
      await this.logout();
      return null;
    }
  }

  /**
   * Silent token refresh - automatically refresh if needed
   */
  static async silentRefresh(): Promise<string | null> {
    const currentToken = this.getAccessToken();

    if (currentToken && !this.needsRefresh()) {
      return currentToken;
    }

    const refreshedTokens = await this.refreshTokens();
    return refreshedTokens?.accessToken || null;
  }

  /**
   * Logout - clear all tokens and cookies
   */
  static async logout(): Promise<void> {
    try {
      // Clear access token from memory
      this.clearAccessToken();

      // Clear refresh token cookie on server
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      console.log("🚪 Logout completed");
    } catch (error) {
      console.error("Logout error:", error);
      // Clear local tokens even if server call fails
      this.clearAccessToken();
    }
  }

  /**
   * Validate token format and extract payload (without verification)
   */
  static parseTokenPayload(token: string): TokenPayload | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;

      const payload = JSON.parse(atob(parts[1]));

      // Basic validation
      if (
        !payload.userId ||
        !payload.hashedId ||
        !payload.exp ||
        !payload.type
      ) {
        return null;
      }

      return payload as TokenPayload;
    } catch (error) {
      console.error("Invalid token format:", error);
      return null;
    }
  }

  /**
   * Check if refresh is available (refresh cookie exists)
   */
  static async checkRefreshAvailable(): Promise<boolean> {
    try {
      const response = await fetch("/api/auth/check-refresh", {
        method: "GET",
        credentials: "include",
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// Auto-initialize when module loads
if (typeof window !== "undefined") {
  SecureTokenManager.initialize().catch(console.error);
}

export default SecureTokenManager;
