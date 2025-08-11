/**
 * Unified Authentication System
 *
 * Consolidates usePrivacyFirstAuth and user-identities-auth into a single,
 * comprehensive authentication system with route protection and session management.
 *
 * Features:
 * - Privacy-first architecture with hashed UUIDs
 * - Multiple authentication methods (NIP-05/Password, NIP-07)
 * - Protected route guards for sensitive areas
 * - Active session validation and token management
 * - Account status verification
 * - Seamless integration with Identity Forge and Nostrich Signin
 */

import { useCallback, useEffect, useState } from "react";
import {
  AuthCredentials,
  AuthResult,
  userIdentitiesAuth,
  UserIdentity,
} from "./user-identities-auth";

// Protected areas that require authentication
export const PROTECTED_AREAS = {
  COMMUNICATIONS: "/communications",
  FAMILY_FINANCE: "/family/finance",
  INDIVIDUAL_FINANCE: "/finance",
  PRIVACY_SETTINGS: "/privacy",
  USER_SOVEREIGNTY: "/sovereignty",
  LN_NODE_MANAGEMENT: "/lightning",
  N424_FEATURES: "/n424",
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
    pubkey: string,
    password: string
  ) => Promise<boolean>;

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

// Session storage keys
const SESSION_STORAGE_KEYS = {
  TOKEN: "satnam_session_token",
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

  // Initialize authentication state from storage
  useEffect(() => {
    initializeAuthState();
  }, []);

  // Set up session validation interval
  useEffect(() => {
    if (state.authenticated && state.sessionToken) {
      const interval = setInterval(() => {
        validateSession();
      }, SESSION_VALIDATION_INTERVAL);

      return () => clearInterval(interval);
    }
  }, [state.authenticated, state.sessionToken]);

  /**
   * Initialize authentication state from stored session
   */
  const initializeAuthState = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true }));

      const storedToken = localStorage.getItem(SESSION_STORAGE_KEYS.TOKEN);
      const storedUser = localStorage.getItem(SESSION_STORAGE_KEYS.USER);
      const lastValidated = localStorage.getItem(
        SESSION_STORAGE_KEYS.LAST_VALIDATED
      );

      if (storedToken && storedUser) {
        try {
          const user = JSON.parse(storedUser) as UserIdentity;

          // Validate the stored session
          const validationResult = await userIdentitiesAuth.validateSession(
            storedToken
          );

          if (validationResult.success && validationResult.user) {
            setState((prev) => ({
              ...prev,
              user: validationResult.user!,
              sessionToken: storedToken,
              authenticated: true,
              accountActive: validationResult.user!.is_active,
              sessionValid: true,
              lastValidated: lastValidated
                ? parseInt(lastValidated)
                : Date.now(),
              loading: false,
              error: null,
            }));
          } else {
            // Invalid session - clear storage
            clearStoredSession();
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
        } catch (parseError) {
          console.error("Failed to parse stored user data:", parseError);
          clearStoredSession();
          setState((prev) => ({ ...prev, loading: false }));
        }
      } else {
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
  }, []);

  /**
   * Handle successful authentication result
   */
  const handleAuthSuccess = useCallback((result: AuthResult) => {
    if (result.success && result.user && result.sessionToken) {
      const now = Date.now();

      // Store session data
      localStorage.setItem(SESSION_STORAGE_KEYS.TOKEN, result.sessionToken);
      localStorage.setItem(
        SESSION_STORAGE_KEYS.USER,
        JSON.stringify(result.user)
      );
      localStorage.setItem(SESSION_STORAGE_KEYS.LAST_VALIDATED, now.toString());

      setState((prev) => ({
        ...prev,
        user: result.user!,
        sessionToken: result.sessionToken!,
        authenticated: true,
        accountActive: result.user!.is_active,
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
   * Clear stored session data
   */
  const clearStoredSession = useCallback(() => {
    localStorage.removeItem(SESSION_STORAGE_KEYS.TOKEN);
    localStorage.removeItem(SESSION_STORAGE_KEYS.USER);
    localStorage.removeItem(SESSION_STORAGE_KEYS.LAST_VALIDATED);
  }, []);

  /**
   * Authenticate with NIP-05 and password
   */
  const authenticateNIP05Password = useCallback(
    async (nip05: string, password: string): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const credentials: AuthCredentials = { nip05, password };
        const result = await userIdentitiesAuth.authenticateNIP05Password(
          credentials
        );

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
   * Authenticate with NIP-07 browser extension + password
   */
  const authenticateNIP07 = useCallback(
    async (
      challenge: string,
      signature: string,
      pubkey: string,
      password: string
    ): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const credentials: AuthCredentials = {
          challenge,
          signature,
          pubkey,
          password,
        };
        const result = await userIdentitiesAuth.authenticateNIP07(credentials);

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
   * Validate current session
   */
  const validateSession = useCallback(async (): Promise<boolean> => {
    if (!state.sessionToken) {
      return false;
    }

    try {
      const result = await userIdentitiesAuth.validateSession(
        state.sessionToken
      );

      if (result.success && result.user) {
        const now = Date.now();
        localStorage.setItem(
          SESSION_STORAGE_KEYS.LAST_VALIDATED,
          now.toString()
        );

        setState((prev) => ({
          ...prev,
          user: result.user!,
          accountActive: result.user!.is_active,
          sessionValid: true,
          lastValidated: now,
          error: null,
        }));
        return true;
      } else {
        // Session invalid - logout
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
  }, [state.sessionToken]);

  /**
   * Refresh session token
   */
  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (!state.user) {
      return false;
    }

    try {
      // Generate new session token
      const newToken = await userIdentitiesAuth.generateSessionToken(
        state.user
      );

      if (newToken) {
        localStorage.setItem(SESSION_STORAGE_KEYS.TOKEN, newToken);
        setState((prev) => ({
          ...prev,
          sessionToken: newToken,
          sessionValid: true,
          lastValidated: Date.now(),
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error("Session refresh failed:", error);
      return false;
    }
  }, [state.user]);

  /**
   * Logout user and clear session
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      clearStoredSession();
      setState({
        user: null,
        sessionToken: null,
        authenticated: false,
        loading: false,
        error: null,
        accountActive: false,
        sessionValid: false,
        lastValidated: null,
      });
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }, [clearStoredSession]);

  /**
   * Check if user can access a protected area
   */
  const canAccessProtectedArea = useCallback(
    (area: ProtectedArea): boolean => {
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

      // If we have a session token, try to validate it
      if (state.sessionToken) {
        const isValid = await validateSession();
        if (isValid && canAccessProtectedArea(area)) {
          return true;
        }
      }

      // Authentication required
      setState((prev) => ({
        ...prev,
        error: `Authentication required to access ${area}`,
      }));
      return false;
    },
    [canAccessProtectedArea, state.sessionToken, validateSession]
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

  return {
    // State
    ...state,

    // Actions
    authenticateNIP05Password,
    authenticateNIP07,
    validateSession,
    refreshSession,
    logout,
    canAccessProtectedArea,
    requireAuthentication,
    checkAccountStatus,
    clearError,
  };
}
