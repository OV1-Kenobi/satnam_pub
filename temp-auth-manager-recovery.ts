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

      // Check if response is actually JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.warn("Non-JSON response received from auth API");
        return { authenticated: false };
      }

      // 401 is expected when not authenticated - don't treat as error
      if (response.status === 401) {
        return { authenticated: false };
      }

      if (!response.ok) {
        // Only log unexpected HTTP errors (not 401)
        console.warn(
          `Auth check returned ${response.status}: ${response.statusText}`
        );
        return { authenticated: false };
      }

      const result = await response.json();

      // Handle both old and new response formats
      if (result.success) {
        return result.data?.authenticated
          ? result.data
          : { authenticated: false };
      } else {
        return { authenticated: false };
      }
    } catch (error) {
      // Check if it's a JSON parsing error (which indicates API routing issues)
      if (error instanceof SyntaxError && error.message.includes("JSON")) {
        console.error(
          "API routing issue - received non-JSON response:",
          error.message
        );
        return { authenticated: false };
      }

      // Only log actual network errors
      console.error("Auth check network error:", error);
      return { authenticated: false };
    }
  }

  async signIn(credentials: any) {
    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid response format from server");
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Sign in failed");
      }

      return await response.json();
    } catch (error) {
      console.error("Sign in failed:", error);
      throw error;
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
