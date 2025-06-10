/**
 * Client-side Authentication Wrapper
 *
 * This file provides a thin wrapper around authentication services for client-side use.
 */

import { authConfig } from "../config";
import { NostrEvent } from "../types/user";
import { authenticateWithNostr, logout } from "../api/endpoints/auth";

/**
 * Authenticates a user with a signed Nostr event and stores the token.
 * @param signedEvent The signed Nostr event for authentication
 * @returns Promise resolving to the authentication token or false if authentication failed
 */
export const authenticateUser = async (
  signedEvent: NostrEvent,
): Promise<string | false> => {
  try {
    const token = await authenticateWithNostr(signedEvent);
    if (!token) throw new Error("Empty token returned from server");
    if (typeof window !== "undefined") {
      localStorage.setItem(authConfig.tokenStorageKey, token);
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
    if (typeof window !== "undefined") {
      localStorage.removeItem(authConfig.tokenStorageKey);
    }
  }
};

/**
 * Checks if the user is currently authenticated.
 * @returns Boolean indicating if the user is authenticated
 */
export const isAuthenticated = (): boolean => {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(authConfig.tokenStorageKey);
};

/**
 * Gets the current authentication token.
 * @returns The authentication token or null if not authenticated
 */
export const getAuthToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(authConfig.tokenStorageKey);
};
