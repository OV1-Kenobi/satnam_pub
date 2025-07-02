/**
 * Secure Session Utilities for Client-Side
 *
 * This module provides client-side utilities for working with Supabase authentication.
 * It handles authentication flows securely using Supabase's built-in session management.
 */

import { supabase } from "../../lib/supabase";
import { authManager } from "./authManager";

export interface SessionInfo {
  isAuthenticated: boolean;
  user?: {
    npub: string;
    nip05?: string;
    federationRole: "adult" | "child" | "guardian";
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
    // Don't log JSON parsing errors as they're handled by authManager
    if (error instanceof SyntaxError && error.message.includes("JSON")) {
      console.debug(
        "Session info: Using fallback authentication mode due to API routing issue"
      );
    } else {
      console.debug(
        "Session info check failed:",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
    return { isAuthenticated: false };
  }
}

/**
 * Perform secure logout
 * This uses Supabase to sign out the user and clear the session
 */
export async function secureLogout(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.signOut();

    // Clear auth manager cache after logout
    authManager.clearCache();

    return !error;
  } catch (error) {
    console.error("Logout error:", error);
    return false;
  }
}

/**
 * Make authenticated API calls using Supabase session
 * The session token is automatically included in the Authorization header
 */
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...options.headers,
    },
  });
}

/**
 * Refresh session if needed
 * This uses Supabase to refresh the current session
 */
export async function refreshSession(): Promise<SessionInfo> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.refreshSession();

    if (error || !session) {
      return { isAuthenticated: false };
    }

    // Clear auth manager cache to force fresh check
    authManager.clearCache();

    // Get updated session info through auth manager
    return await getSessionInfo();
  } catch (error) {
    console.error("Session refresh error:", error);
    return { isAuthenticated: false };
  }
}
