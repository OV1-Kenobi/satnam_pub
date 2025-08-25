// Browser-compatible session manager for secure session handling
// NO Node.js dependencies - uses browser storage and Web Crypto API

import {
  decryptSensitiveData,
  encryptSensitiveData,
  generateSecureToken,
} from "../privacy/encryption";

// Session data interface
export interface SessionData {
  userId: string;
  npub: string;
  familyId?: string;
  role: string;
  permissions: string[];
  expiresAt: number;
  lastActivity: number;
  sessionToken: string;
}

// Session manager class
export class SecureSessionManager {
  private sessionKey: string;
  private sessionTimeout: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.sessionKey = "satnam_session";
  }

  /**
   * Create a new secure session
   */
  async createSession(userData: {
    userId: string;
    npub: string;
    familyId?: string;
    role: string;
    permissions: string[];
  }): Promise<SessionData> {
    const sessionToken = generateSecureToken(64);
    const now = Date.now();

    const sessionData: SessionData = {
      ...userData,
      expiresAt: now + this.sessionTimeout,
      lastActivity: now,
      sessionToken,
    };

    // Encrypt session data before storing
    const encryptedSession = await encryptSensitiveData(
      JSON.stringify(sessionData),
      await this.getSessionEncryptionKey()
    );

    // SECURITY: Store encrypted session only in sessionStorage (cleared on tab close)
    sessionStorage.setItem(this.sessionKey, JSON.stringify(encryptedSession));

    return sessionData;
  }

  /**
   * Get current session data - SECURITY: Only check sessionStorage
   */
  async getSession(): Promise<SessionData | null> {
    try {
      // SECURITY: Only use sessionStorage to prevent XSS persistence
      const encryptedSession = sessionStorage.getItem(this.sessionKey);

      if (!encryptedSession) {
        return null;
      }

      const { encrypted, iv } = JSON.parse(encryptedSession);
      const sessionData = await decryptSensitiveData(
        encrypted,
        iv,
        await this.getSessionEncryptionKey()
      );

      const session: SessionData = JSON.parse(sessionData);

      // Check if session is expired
      if (Date.now() > session.expiresAt) {
        await this.destroySession();
        return null;
      }

      // Update last activity
      session.lastActivity = Date.now();
      await this.updateSession(session);

      return session;
    } catch (error) {
      console.error("Failed to get session:", error);
      await this.destroySession();
      return null;
    }
  }

  /**
   * Update session data - SECURITY: Only use sessionStorage (cleared on tab close)
   */
  async updateSession(sessionData: SessionData): Promise<void> {
    const encryptedSession = await encryptSensitiveData(
      JSON.stringify(sessionData),
      await this.getSessionEncryptionKey()
    );

    // SECURITY: Only use sessionStorage to prevent XSS persistence
    sessionStorage.setItem(this.sessionKey, JSON.stringify(encryptedSession));
  }

  /**
   * Destroy current session - SECURITY: Clear all storage
   */
  async destroySession(): Promise<void> {
    sessionStorage.removeItem(this.sessionKey);
    // Also clear any legacy localStorage entries
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(this.sessionKey);
    }
  }

  /**
   * Validate session token
   */
  async validateSession(token: string): Promise<boolean> {
    const session = await this.getSession();
    return session?.sessionToken === token;
  }

  /**
   * Extend session timeout
   */
  async extendSession(): Promise<void> {
    const session = await this.getSession();
    if (session) {
      session.expiresAt = Date.now() + this.sessionTimeout;
      session.lastActivity = Date.now();
      await this.updateSession(session);
    }
  }

  /**
   * Get session encryption key from Vault
   */
  private async getSessionEncryptionKey(): Promise<string> {
    const key = process.env.SESSION_ENCRYPTION_KEY;
    if (!key) {
      throw new Error(
        "SESSION_ENCRYPTION_KEY environment variable not available"
      );
    }
    return key;
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(permission: string): Promise<boolean> {
    const session = await this.getSession();
    return session?.permissions.includes(permission) || false;
  }

  /**
   * Get user role
   */
  async getUserRole(): Promise<string | null> {
    const session = await this.getSession();
    return session?.role || null;
  }

  /**
   * Get user ID
   */
  async getUserId(): Promise<string | null> {
    const session = await this.getSession();
    return session?.userId || null;
  }

  /**
   * Get family ID
   */
  async getFamilyId(): Promise<string | null> {
    const session = await this.getSession();
    return session?.familyId || null;
  }

  /**
   * Check if session is active
   */
  async isSessionActive(): Promise<boolean> {
    const session = await this.getSession();
    return session !== null;
  }
}

// Export singleton instance
export const sessionManager = new SecureSessionManager();
export default sessionManager;
