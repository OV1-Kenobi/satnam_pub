/**
 * Unified Authentication System
 *
 * Consolidates usePrivacyFirstAuth and user-identities-auth into a single,
 * comprehensive authentication system with route protection and session management.
 *
 * Features:
 * - Privacy-first architecture with hashed UUIDs
 * - Multiple authentication methods (NIP-05/Password, NIP-07, OTP)
 * - Protected route guards for sensitive areas
 * - Active session validation and token management
 * - Account status verification
 * - Seamless integration with Identity Forge and Nostrich Signin
 */

import { useCallback, useEffect, useState } from "react";
import type { SessionData } from "../api";
import SecureTokenManager from "./secure-token-manager";
import { AuthResult, UserIdentity } from "./user-identities-auth";

// Protected areas that require authentication
export const PROTECTED_AREAS = {
  COMMUNICATIONS: "/communications",
  FAMILY_FINANCE: "/family/finance",
  INDIVIDUAL_FINANCE: "/finance",
  PRIVACY_SETTINGS: "/privacy",
  USER_SOVEREIGNTY: "/sovereignty",
  LN_NODE_MANAGEMENT: "/lightning",
  N424_FEATURES: "/n424",
  NFC_AUTH: "/nfc-auth",
  PROFILE_SETTINGS: "/profile",
  FAMILY_FOUNDRY: "/family/foundry",
  PEER_INVITATIONS: "/invitations",
} as const;

export type ProtectedArea =
  (typeof PROTECTED_AREAS)[keyof typeof PROTECTED_AREAS];

// Authentication state interface
export interface UnifiedAuthState {
  user: UserIdentity | null;
  sessionToken: string | null;
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  accountActive: boolean;
  sessionValid: boolean;
  lastValidated: number | null;
}

// Authentication actions interface
export interface UnifiedAuthActions {
  // Primary authentication methods
  authenticateNIP05Password: (
    nip05: string,
    password: string
  ) => Promise<boolean>;
  authenticateNIP07: (
    challenge: string,
    signature: string,
    pubkey: string
  ) => Promise<boolean>;

  // OTP authentication methods
  initiateOTP: (
    identifier: string
  ) => Promise<{ success: boolean; error?: string }>;
  authenticateOTP: (identifier: string, otpCode: string) => Promise<boolean>;

  // Session management
  validateSession: () => Promise<boolean>;
  refreshSession: () => Promise<boolean>;
  logout: () => Promise<void>;

  // Route protection
  canAccessProtectedArea: (area: ProtectedArea) => boolean;
  requireAuthentication: (area: ProtectedArea) => Promise<boolean>;

  // Account management
  checkAccountStatus: () => Promise<boolean>;

  // Error handling
  clearError: () => void;
}

// Session validation interval (5 minutes)
const SESSION_VALIDATION_INTERVAL = 5 * 60 * 1000;

// User data storage in sessionStorage (safe for page reload, cleared on tab close)
const SESSION_STORAGE_KEYS = {
  USER: "satnam_user_data",
  LAST_VALIDATED: "satnam_last_validated",
} as const;

/**
 * Unified Authentication Hook
 * Replaces usePrivacyFirstAuth with comprehensive functionality
 */
export function useUnifiedAuth(): UnifiedAuthState & UnifiedAuthActions {
  const [state, setState] = useState<UnifiedAuthState>({
    user: null,
    sessionToken: null,
    authenticated: false,
    loading: true, // Start with loading to check existing session
    error: null,
    accountActive: false,
    sessionValid: false,
    lastValidated: null,
  });

  /**
   * Clear stored session data
   */
  const clearStoredSession = useCallback(async () => {
    await SecureTokenManager.logout();
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.USER);
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.LAST_VALIDATED);
  }, []);

  /**
   * Load and validate stored session on mount
   */
  const initializeAuth = useCallback(async () => {
    try {
      const accessToken = SecureTokenManager.getAccessToken();

      if (accessToken) {
        const tokenPayload = SecureTokenManager.parseTokenPayload(accessToken);

        if (tokenPayload) {
          // Check if token is expired
          const now = Date.now() / 1000;
          if (tokenPayload.exp > now) {
            // Token is valid, check for stored user data
            const storedUser = sessionStorage.getItem(
              SESSION_STORAGE_KEYS.USER
            );

            if (storedUser) {
              try {
                const user = JSON.parse(storedUser) as UserIdentity;
                const lastValidated = sessionStorage.getItem(
                  SESSION_STORAGE_KEYS.LAST_VALIDATED
                );

                // Check if session needs revalidation (older than 5 minutes)
                const lastValidatedTime = lastValidated
                  ? parseInt(lastValidated, 10)
                  : 0;
                const timeSinceValidation = Date.now() - lastValidatedTime;

                if (timeSinceValidation > SESSION_VALIDATION_INTERVAL) {
                  // Revalidate session
                  const isValid = await validateSession();
                  if (!isValid) {
                    await clearStoredSession();
                    setState((prev) => ({ ...prev, loading: false }));
                    return;
                  }
                }

                setState((prev) => ({
                  ...prev,
                  user,
                  sessionToken: accessToken,
                  authenticated: true,
                  accountActive: user.is_active,
                  sessionValid: true,
                  lastValidated: lastValidatedTime,
                  loading: false,
                  error: null,
                }));
              } catch (parseError) {
                console.error("Failed to parse stored user data:", parseError);
                await clearStoredSession();
                setState((prev) => ({ ...prev, loading: false }));
              }
            } else {
              // No stored user data - token exists but user info missing
              // This can happen if sessionStorage was cleared but refresh cookie remains
              await SecureTokenManager.logout();
              setState((prev) => ({ ...prev, loading: false }));
            }
          } else {
            // Token exists but is expired - attempt refresh via silentRefresh
            const refreshedToken = await SecureTokenManager.silentRefresh();
            if (!refreshedToken) {
              await clearStoredSession();
              setState((prev) => ({
                ...prev,
                user: null,
                sessionToken: null,
                authenticated: false,
                accountActive: false,
                sessionValid: false,
                lastValidated: null,
                loading: false,
                error: null,
              }));
            }
          }
        } else {
          // Invalid token format
          await SecureTokenManager.logout();
          setState((prev) => ({ ...prev, loading: false }));
        }
      } else {
        // No tokens available
        setState((prev) => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error("Failed to initialize auth state:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "Failed to initialize authentication",
      }));
    }
  }, [clearStoredSession]);

  /**
   * Handle successful authentication result
   */
  const handleAuthSuccess = useCallback(async (result: AuthResult) => {
    if (result.success && result.user && result.sessionToken) {
      const now = Date.now();

      // Parse token to get expiry information
      const tokenPayload = SecureTokenManager.parseTokenPayload(
        result.sessionToken
      );
      if (!tokenPayload) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "Invalid token format received",
        }));
        return false;
      }

      // Store access token securely (in memory)
      SecureTokenManager.setAccessToken(
        result.sessionToken,
        tokenPayload.exp * 1000
      );

      // Store user data in sessionStorage (survives page reload, cleared on tab close)
      sessionStorage.setItem(
        SESSION_STORAGE_KEYS.USER,
        JSON.stringify(result.user)
      );
      sessionStorage.setItem(
        SESSION_STORAGE_KEYS.LAST_VALIDATED,
        now.toString()
      );

      setState((prev) => ({
        ...prev,
        user: result.user ?? null,
        sessionToken: result.sessionToken ?? null,
        authenticated: true,
        accountActive: result.user ? !!result.user.is_active : false,
        sessionValid: true,
        lastValidated: now,
        loading: false,
        error: null,
      }));

      return true;
    } else {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: result.error || "Authentication failed",
      }));
      return false;
    }
  }, []);

  /**
   * Logout user and clear all session data
   */
  const logout = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      // Call logout endpoint to clear HttpOnly refresh cookie
      await SecureTokenManager.logout();
    } catch (error) {
      // Continue with local cleanup even if server logout fails
      console.error("Server logout failed:", error);
    }

    // Clear access token from memory
    SecureTokenManager.clearAccessToken();

    // Clear user data from sessionStorage
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.USER);
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.LAST_VALIDATED);

    // Note: HttpOnly refresh cookie is cleared by the logout endpoint
  }, []);

  /**
   * Authenticate with NIP-05 and password
   */
  const authenticateNIP05Password = useCallback(
    async (nip05: string, password: string): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        // Call server endpoint for NIP-05/password authentication
        const response = await fetch("/api/auth/signin", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nip05,
            password,
            authMethod: "nip05-password",
          }),
        });

        if (!response.ok) {
          setState((prev) => ({ ...prev, loading: false }));
          return false;
        }

        const result: AuthResult = await response.json();
        return handleAuthSuccess(result);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "NIP-05/Password authentication failed",
        }));
        return false;
      }
    },
    [handleAuthSuccess]
  );

  /**
   * Authenticate with NIP-07 browser extension (no password)
   */
  const authenticateNIP07 = useCallback(
    async (
      challenge: string,
      signature: string,
      pubkey: string
    ): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        // Call server NIP-07 signin endpoint
        const response = await fetch("/api/auth/nip07-signin", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challenge, signature, pubkey }),
        });

        if (!response.ok) {
          setState((prev) => ({ ...prev, loading: false }));
          return false;
        }

        const result: AuthResult = await response.json();
        return handleAuthSuccess(result);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "NIP-07 authentication failed",
        }));
        return false;
      }
    },
    [handleAuthSuccess]
  );

  /**
   * Initiate OTP authentication
   */
  const initiateOTP = useCallback(
    async (
      identifier: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const { authAPI } = await import("../api");

        // Determine the correct field based on input format
        let otpRequestData;
        if (identifier.startsWith("npub")) {
          otpRequestData = { npub: identifier };
        } else if (identifier.includes("@")) {
          otpRequestData = { nip05: identifier };
        } else {
          // Assume it's a pubkey if not npub or nip05 format
          otpRequestData = { pubkey: identifier };
        }

        const response = await authAPI.initiateOTP(otpRequestData);

        if (response.success) {
          // Store session ID for verification
          const data = response.data as { sessionId: string };
          localStorage.setItem("otp_session_id", data.sessionId);
          setState((prev) => ({ ...prev, loading: false }));
          return { success: true };
        } else {
          const errorMessage = response.error || "Failed to send OTP";
          setState((prev) => ({
            ...prev,
            loading: false,
            error: errorMessage,
          }));
          return { success: false, error: errorMessage };
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to initiate OTP";
        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  /**
   * Authenticate with OTP
   */
  const authenticateOTP = useCallback(
    async (_identifier: string, otpCode: string): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const storedSessionId = localStorage.getItem("otp_session_id");
        if (!storedSessionId) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "No OTP session found. Please initiate OTP first.",
          }));
          return false;
        }

        const { authAPI } = await import("../api");
        const verifyData = {
          sessionId: storedSessionId,
          otp: otpCode,
        };

        const response = await authAPI.verifyOTP(verifyData);

        if (response.success) {
          // Clean up session ID after successful verification
          localStorage.removeItem("otp_session_id");

          // Create a result compatible with handleAuthSuccess
          // Build minimal AuthResult compatible object
          const data = response.data as SessionData;
          const authResult: AuthResult = {
            success: true,
            user: {
              id: data.user.id,
              user_salt: "",
              password_hash: "",
              password_salt: "",
              failed_attempts: 0,
              role: (data.user.role as any) || "private",
              is_active: !!data.user.is_active,
              hashedId: data.user.id,
              authMethod: "otp",
            },
            sessionToken: data.sessionToken,
          };

          return handleAuthSuccess(authResult);
        } else {
          const errorMessage = response.error || "OTP verification failed";
          setState((prev) => ({
            ...prev,
            loading: false,
            error: errorMessage,
          }));
          return false;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "OTP authentication failed";
        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));
        return false;
      }
    },
    [handleAuthSuccess]
  );

  /**
   * Validate current session
   */
  const validateSession = useCallback(async (): Promise<boolean> => {
    try {
      const accessToken = SecureTokenManager.getAccessToken();
      if (!accessToken) {
        return false;
      }

      const tokenPayload = SecureTokenManager.parseTokenPayload(accessToken);
      if (!tokenPayload) {
        await logout();
        return false;
      }

      // Get stored user data and validate it matches the token
      const storedUser = sessionStorage.getItem(SESSION_STORAGE_KEYS.USER);
      if (!storedUser) {
        await logout();
        return false;
      }

      try {
        const user = JSON.parse(storedUser) as UserIdentity;

        // Validate user matches token
        if (user.hashedId !== tokenPayload.hashedId) {
          await logout();
          return false;
        }

        const now = Date.now();
        sessionStorage.setItem(
          SESSION_STORAGE_KEYS.LAST_VALIDATED,
          now.toString()
        );

        setState((prev) => ({
          ...prev,
          user,
          sessionToken: accessToken,
          accountActive: user.is_active,
          sessionValid: true,
          lastValidated: now,
          error: null,
        }));

        return true;
      } catch (parseError) {
        console.error("Failed to parse stored user data:", parseError);
        await logout();
        return false;
      }
    } catch (error) {
      console.error("Session validation failed:", error);
      setState((prev) => ({
        ...prev,
        sessionValid: false,
        error: "Session validation failed",
      }));
      return false;
    }
  }, [logout]);

  /**
   * Refresh authentication session
   */
  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const refreshedToken = await SecureTokenManager.silentRefresh();

      if (refreshedToken) {
        // Validate the refreshed session
        const isValid = await validateSession();
        setState((prev) => ({ ...prev, loading: false }));
        return isValid;
      } else {
        // Refresh failed - logout user
        await logout();
        return false;
      }
    } catch (error) {
      console.error("Session refresh failed:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "Session refresh failed",
      }));
      return false;
    }
  }, [validateSession, logout]);

  /**
   * Check if user can access a protected area
   */
  const canAccessProtectedArea = useCallback(
    (_area: ProtectedArea): boolean => {
      return (
        state.authenticated &&
        state.accountActive &&
        state.sessionValid &&
        state.user !== null
      );
    },
    [state.authenticated, state.accountActive, state.sessionValid, state.user]
  );

  /**
   * Require authentication for a protected area
   */
  const requireAuthentication = useCallback(
    async (area: ProtectedArea): Promise<boolean> => {
      if (canAccessProtectedArea(area)) {
        return true;
      }

      // If not authenticated, check if we can refresh session
      if (state.user && !state.sessionValid) {
        return await refreshSession();
      }

      return false;
    },
    [canAccessProtectedArea, state.user, state.sessionValid, refreshSession]
  );

  /**
   * Check account status
   */
  const checkAccountStatus = useCallback(async (): Promise<boolean> => {
    if (!state.user) {
      return false;
    }

    try {
      // Validate session which also checks account status
      return await validateSession();
    } catch (error) {
      console.error("Account status check failed:", error);
      return false;
    }
  }, [state.user, validateSession]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Initialize authentication state on mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return {
    // State
    ...state,

    // Actions
    authenticateNIP05Password,
    authenticateNIP07,
    initiateOTP,
    authenticateOTP,
    validateSession,
    refreshSession,
    logout,
    canAccessProtectedArea,
    requireAuthentication,
    checkAccountStatus,
    clearError,
  };
}
