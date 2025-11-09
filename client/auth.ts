/**
 * Client-side Authentication Wrapper - SECURITY HARDENED
 *
 * This file provides secure authentication with memory-only token storage
 * to prevent XSS attacks. Access tokens stored in memory, refresh tokens
 * in HttpOnly cookies.
 */

import { authenticateWithNostr, logout } from "../api/endpoints/auth";
import { NostrEvent } from "../types/user";

/**
 * SECURITY: Memory-only token storage to prevent XSS attacks
 * Access tokens stored in memory, refresh tokens in HttpOnly cookies
 */
let memoryTokenStorage: {
  accessToken: string | null;
  expiresAt: number | null;
} = {
  accessToken: null,
  expiresAt: null,
};

/**
 * Helper: parse JWT payload with proper base64url decoding (browser-safe)
 * Handles base64url encoding (RFC 4648) with proper padding
 * @param jwt - JWT token string
 * @returns Parsed JWT payload
 * @throws Error if JWT format is invalid or payload cannot be parsed
 */
function parseJwt<T = unknown>(jwt: string): T {
  const parts = jwt.split(".");
  if (parts.length < 2) throw new Error("Invalid JWT: missing payload part");
  const base64Url = parts[1];
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad) base64 += "=".repeat(4 - pad);
  const json = atob(base64);
  return JSON.parse(json) as T;
}

/**
 * Authenticates a user with a signed Nostr event and stores the token securely.
 * @param signedEvent The signed Nostr event for authentication
 * @returns Promise resolving to the authentication token or false if authentication failed
 */
export const authenticateUser = async (
  signedEvent: NostrEvent
): Promise<string | false> => {
  try {
    const token = await authenticateWithNostr(signedEvent);
    if (!token) throw new Error("Empty token returned from server");

    // SECURITY: Store access token in memory only (XSS-safe)
    if (typeof window !== "undefined") {
      // Parse token to get expiry with robust base64url decoding
      try {
        const raw = token.startsWith("Bearer ") ? token.slice(7) : token;
        const payload = parseJwt<{ exp?: number }>(raw);
        memoryTokenStorage.accessToken = token;
        if (typeof payload?.exp === "number") {
          memoryTokenStorage.expiresAt = payload.exp * 1000; // ms
        } else {
          console.warn(
            "Token payload missing exp; not marking as authenticated."
          );
          memoryTokenStorage.expiresAt = null;
        }
      } catch (parseError) {
        console.error("Failed to parse token payload:", parseError);
        memoryTokenStorage.accessToken = token;
        memoryTokenStorage.expiresAt = null; // safer than guessing
      }
    }
    return token;
  } catch (error) {
    console.error("Authentication failed:", error);
    return false;
  }
};

/**
 * Logs out the current user and removes stored tokens.
 * @returns Promise resolving when logout is complete
 */
export const logoutUser = async (): Promise<void> => {
  try {
    await logout();
  } finally {
    // SECURITY: Clear memory storage and HttpOnly cookies
    memoryTokenStorage = {
      accessToken: null,
      expiresAt: null,
    };

    // Clear HttpOnly refresh cookie via API call
    if (typeof window !== "undefined") {
      try {
        await fetch("/api/auth/clear-refresh-cookie", {
          method: "POST",
          credentials: "include",
        });
      } catch (cookieError) {
        console.warn("Failed to clear HttpOnly refresh cookie:", cookieError);
      }
    }
  }
};

/**
 * Checks if the user is currently authenticated.
 * @returns Boolean indicating if the user is authenticated
 */
export const isAuthenticated = (): boolean => {
  if (typeof window === "undefined") return false;

  // Check if token exists and is not expired
  if (!memoryTokenStorage.accessToken || !memoryTokenStorage.expiresAt) {
    return false;
  }

  // Check if token is expired (with 5-minute buffer for refresh)
  const now = Date.now();
  const bufferTime = 5 * 60 * 1000; // 5 minutes
  return memoryTokenStorage.expiresAt > now - bufferTime;
};

/**
 * Gets the current authentication token.
 * @returns The authentication token or null if not authenticated
 */
export const getAuthToken = (): string | null => {
  if (typeof window === "undefined") return null;

  // Return token only if it's valid and not expired
  if (isAuthenticated()) {
    return memoryTokenStorage.accessToken;
  }

  return null;
};
