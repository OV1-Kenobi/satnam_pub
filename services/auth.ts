/**
 * Authentication Service
 * 
 * This service handles authentication-related functionality.
 */

import { login, logout } from '../api/endpoints/auth';
import { authConfig } from '../config';

/**
 * Authenticates a user with the provided credentials and stores the token.
 * @param email User's email
 * @param password User's password
 * @returns Promise resolving to a boolean indicating success
 */
export const authenticateUser = async (email: string, password: string): Promise<boolean> => {
  try {
    const token = await login(email, password);
    localStorage.setItem(authConfig.tokenStorageKey, token);
    return true;
  } catch (error) {
    console.error('Authentication failed:', error);
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
    localStorage.removeItem(authConfig.tokenStorageKey);
    localStorage.removeItem(authConfig.refreshTokenStorageKey);
  }
};

/**
 * Checks if the user is currently authenticated.
 * @returns Boolean indicating if the user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem(authConfig.tokenStorageKey);
};

/**
 * Gets the current authentication token.
 * @returns The authentication token or null if not authenticated
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem(authConfig.tokenStorageKey);
};
