/**
 * Auth Manager - Prevents multiple simultaneous auth checks
 *
 * This utility ensures that only one auth session check happens at a time,
 * preventing multiple 401 errors from appearing in the console when multiple
 * components initialize simultaneously.
 */

import { supabase } from "../../lib/supabase";

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
      // Use Supabase directly for authentication in React app
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.debug("Supabase session error:", error.message);
        return { authenticated: false };
      }

      if (session && session.user) {
        return {
          authenticated: true,
          user: {
            ...session.user.user_metadata,
          },
        };
      }

      return { authenticated: false };
    } catch (error) {
      console.error("Auth check unexpected error:", error);
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
