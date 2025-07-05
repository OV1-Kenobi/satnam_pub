/**
 * Auth Manager - Prevents multiple simultaneous auth checks
 *
 * This utility ensures that only one auth session check happens at a time,
 * preventing multiple 401 errors from appearing in the console when multiple
 * components initialize simultaneously.
 */

import { supabase } from "../lib/supabase";

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

  // Additional browser-compatible methods for fetch-based auth
  async checkSession(): Promise<AuthResult | null> {
    try {
      const response = await fetch("/api/auth/session");

      // Check if response is actually JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.warn("Non-JSON response received from auth API");
        return null;
      }

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Session check failed:", error);
      return null;
    }
  }

  async signIn(credentials: any): Promise<any> {
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
}

export const authManager = AuthManager.getInstance();
