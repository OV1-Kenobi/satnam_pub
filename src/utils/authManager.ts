/**
 * Auth Manager - Prevents multiple simultaneous auth checks
 *
 * This utility ensures that only one auth session check happens at a time,
 * preventing multiple 401 errors from appearing in the console when multiple
 * components initialize simultaneously.
 */

interface AuthResult {
  authenticated: boolean;
  user?: any;
}

class AuthManager {
  private static instance: AuthManager;
  private currentCheck: Promise<AuthResult> | null = null;
  private lastResult: AuthResult | null = null;
  private lastCheckTime: number = 0;
  private readonly CACHE_DURATION = 5000; // 5 seconds

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  /**
   * Get auth status with deduplication and caching
   */
  async getAuthStatus(): Promise<AuthResult> {
    const now = Date.now();

    // Return cached result if it's fresh
    if (this.lastResult && now - this.lastCheckTime < this.CACHE_DURATION) {
      return this.lastResult;
    }

    // If there's already a check in progress, wait for it
    if (this.currentCheck) {
      return this.currentCheck;
    }

    // Start a new check
    this.currentCheck = this.performAuthCheck();

    try {
      const result = await this.currentCheck;
      this.lastResult = result;
      this.lastCheckTime = now;
      return result;
    } finally {
      this.currentCheck = null;
    }
  }

  private async performAuthCheck(): Promise<AuthResult> {
    try {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      // 401 is expected when not authenticated
      if (response.status === 401) {
        return { authenticated: false };
      }

      if (!response.ok) {
        return { authenticated: false };
      }

      const result = await response.json();
      return result.success ? result.data : { authenticated: false };
    } catch (error) {
      // Only log actual network errors
      console.error("Auth check failed:", error);
      return { authenticated: false };
    }
  }

  /**
   * Clear cached auth state (call after login/logout)
   */
  clearCache(): void {
    this.lastResult = null;
    this.lastCheckTime = 0;
  }
}

export const authManager = AuthManager.getInstance();
