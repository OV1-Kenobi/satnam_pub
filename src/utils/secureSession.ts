/**
 * Secure Session Utilities for Client-Side
 *
 * This module provides client-side utilities for working with secure HttpOnly cookie sessions.
 * It does not directly access session tokens (as they're HttpOnly), but provides methods
 * to check session status and handle authentication flows securely.
 */

import { authManager } from "./authManager";

export interface SessionInfo {
  isAuthenticated: boolean;
  user?: {
    npub: string;
    nip05?: string;
    federationRole: "parent" | "child" | "guardian";
    authMethod: "otp" | "nwc";
    isWhitelisted: boolean;
    votingPower: number;
    guardianApproved: boolean;
  };
}

/**
 * Check current session status from server
 * This makes a request to the server to validate the HttpOnly cookie session
 * Uses AuthManager to prevent multiple simultaneous requests
 */
export async function getSessionInfo(): Promise<SessionInfo> {
  try {
    const result = await authManager.getAuthStatus();
    return {
      isAuthenticated: result.authenticated,
      user: result.user,
    };
  } catch (error) {
    // Only log actual network errors, not auth failures
    console.error("Failed to get session info:", error);
    return { isAuthenticated: false };
  }
}

/**
 * Perform secure logout
 * This calls the server logout endpoint which clears HttpOnly cookies
 */
export async function secureLogout(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include", // Important: include cookies in request
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Clear auth manager cache after logout
    if (response.ok) {
      authManager.clearCache();
    }

    return response.ok;
  } catch (error) {
    console.error("Logout error:", error);
    return false;
  }
}

/**
 * Make authenticated API calls using HttpOnly cookies
 * The session token is automatically included via HttpOnly cookies
 */
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(endpoint, {
    ...options,
    credentials: "include", // Important: include cookies in request
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

/**
 * Refresh session if needed
 * This attempts to refresh the session using the refresh token
 */
export async function refreshSession(): Promise<SessionInfo> {
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    // 401 is expected when refresh token is invalid/expired - don't treat as error
    if (response.status === 401) {
      return { isAuthenticated: false };
    }

    if (!response.ok) {
      return { isAuthenticated: false };
    }

    const result = await response.json();
    return result.success ? result.data : { isAuthenticated: false };
  } catch (error) {
    // Only log actual network errors, not auth failures
    console.error("Session refresh error:", error);
    return { isAuthenticated: false };
  }
}
