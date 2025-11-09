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

    // SECURITY: Store encrypted session only in sessionStorage (cleared on tab close); guard for SSR/blocked storage
    this.safeSessionSetItem(JSON.stringify(encryptedSession));

    return sessionData;
  }

  /**
   * Get current session data - SECURITY: Only check sessionStorage
   * Note: Does not protect against XSS; pair with CSP and Trusted Types
   */
  async getSession(): Promise<SessionData | null> {
    try {
      // SECURITY: Use sessionStorage (no cross-tab persistence); guard for SSR/blocked storage
      const encryptedSession = this.safeSessionGetItem();

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
   * Guard for SSR/blocked storage to avoid runtime errors
   */
  async updateSession(sessionData: SessionData): Promise<void> {
    const encryptedSession = await encryptSensitiveData(
      JSON.stringify(sessionData),
      await this.getSessionEncryptionKey()
    );

    // SECURITY: Only use sessionStorage (no localStorage fallback); guard for SSR/blocked storage
    this.safeSessionSetItem(JSON.stringify(encryptedSession));
  }

  /**
   * Destroy current session - SECURITY: Clear all storage
   * Tolerates storage exceptions to avoid throwing while cleaning up
   */
  async destroySession(): Promise<void> {
    this.safeSessionRemoveItem();
    this.safeLocalRemoveItem();
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
   * Safe storage helpers (SSR/Privacy Mode friendly)
   * Guard against sessionStorage access in SSR, Safari Private Mode, and blocked storage contexts
   */
  private getSessionStorage(): Storage | null {
    if (typeof window === "undefined") return null;
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }

  private safeSessionGetItem(): string | null {
    const s = this.getSessionStorage();
    if (!s) return null;
    try {
      return s.getItem(this.sessionKey);
    } catch {
      return null;
    }
  }

  private safeSessionSetItem(value: string): void {
    const s = this.getSessionStorage();
    if (!s) return;
    try {
      s.setItem(this.sessionKey, value);
    } catch (e) {
      console.warn(
        "SessionStorage setItem failed; session will be ephemeral for this tab.",
        e
      );
    }
  }

  private safeSessionRemoveItem(): void {
    const s = this.getSessionStorage();
    if (!s) return;
    try {
      s.removeItem(this.sessionKey);
    } catch {
      /* noop */
    }
  }

  private safeLocalRemoveItem(): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage?.removeItem(this.sessionKey);
    } catch {
      /* noop */
    }
  }

  /**
   * Get session encryption key from environment
   * Supports Vite (import.meta.env), Next.js (NEXT_PUBLIC_*), and runtime injection
   * SECURITY: Avoid bundling secrets; prefer server-managed sessions
   */
  private async getSessionEncryptionKey(): Promise<string> {
    // Try Vite environment variable
    let viteKey: string | undefined;
    try {
      viteKey = (import.meta as any)?.env?.VITE_SESSION_ENCRYPTION_KEY;
    } catch {
      viteKey = undefined;
    }

    // Try Next.js public environment variable
    const nextPublicKey =
      typeof process !== "undefined"
        ? (process as any).env?.NEXT_PUBLIC_SESSION_ENCRYPTION_KEY
        : undefined;

    // Try runtime-injected key
    const runtimeInjected =
      (globalThis as any).__SESSION_ENCRYPTION_KEY__ || undefined;

    const key = viteKey || nextPublicKey || runtimeInjected;
    if (!key) {
      throw new Error(
        "Session encryption key unavailable in the browser. Provide via import.meta.env.VITE_SESSION_ENCRYPTION_KEY, NEXT_PUBLIC_SESSION_ENCRYPTION_KEY, or inject at runtime (window.__SESSION_ENCRYPTION_KEY__). Avoid bundling secrets; prefer server-managed sessions."
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
