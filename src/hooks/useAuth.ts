/**
 * @fileoverview Authentication Hook
 * @description React hook for managing authentication state and API calls
 */

import { useCallback, useEffect, useState } from "react";
import { authAPI, getAuthStatus } from "../lib/api";

export interface User {
  id: string;
  npub: string; // DEPRECATED: Only for legacy support, never exposed per Master Context
  username?: string;
  hashedUUID?: string; // Privacy-first encrypted UUID per Master Context protocols
}

export interface AuthState {
  user: User | null;
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  userRole: string | null;
  familyId: string | null;
}

export interface AuthActions {
  login: (method: "nostr" | "nwc" | "otp", data: any) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
}

export function useAuth(): AuthState & AuthActions {
  const [state, setState] = useState<AuthState>({
    user: null,
    authenticated: false,
    loading: true,
    error: null,
    userRole: null,
    familyId: null,
  });

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      // Use single attempt for initial auth check to avoid multiple 401s in console
      const { authenticated, user } = await getAuthStatus(1);

      setState((prev) => ({
        ...prev,
        authenticated,
        user: user || null,
        loading: false,
        // Clear any previous errors since we got a valid response
        error: null,
        // Mock values for now - in production these would come from the auth response
        userRole: user ? "adult" : null,
        familyId: user ? "family-123" : null,
      }));
    } catch (error) {
      // Only set error for actual network/server errors, not auth state
      setState((prev) => ({
        ...prev,
        authenticated: false,
        user: null,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to check auth status",
      }));
    }
  }, []);

  const login = useCallback(
    async (method: "nostr" | "nwc" | "otp", data: any): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        let response;

        switch (method) {
          case "nostr":
            response = await authAPI.authenticateNostr(data);
            break;
          case "nwc":
            response = await authAPI.authenticateNWC(data);
            break;
          case "otp":
            response = await authAPI.verifyOTP(data);
            break;
          default:
            throw new Error("Invalid authentication method");
        }

        if (response.success && response.data) {
          setState((prev) => ({
            ...prev,
            authenticated: response.data!.authenticated,
            user: response.data!.user,
            loading: false,
            // Mock values for now - in production these would come from the auth response
            userRole: response.data!.user ? "adult" : null,
            familyId: response.data!.user ? "family-123" : null,
          }));
          return true;
        } else {
          setState((prev) => ({
            ...prev,
            authenticated: false,
            user: null,
            loading: false,
            error: response.error || "Authentication failed",
          }));
          return false;
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          authenticated: false,
          user: null,
          loading: false,
          error:
            error instanceof Error ? error.message : "Authentication failed",
        }));
        return false;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      await authAPI.logout();

      setState((prev) => ({
        ...prev,
        authenticated: false,
        user: null,
        loading: false,
        userRole: null,
        familyId: null,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Logout failed",
      }));
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const response = await authAPI.refreshSession();

      if (response.success && response.data) {
        setState((prev) => ({
          ...prev,
          authenticated: response.data!.authenticated,
          user: response.data!.user,
          loading: false,
          userRole: response.data!.user ? "adult" : null,
          familyId: response.data!.user ? "family-123" : null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          authenticated: false,
          user: null,
          loading: false,
          userRole: null,
          familyId: null,
          error: response.error || "Session refresh failed",
        }));
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        authenticated: false,
        user: null,
        loading: false,
        userRole: null,
        familyId: null,
        error:
          error instanceof Error ? error.message : "Session refresh failed",
      }));
    }
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    login,
    logout,
    refreshSession,
    clearError,
  };
}

export default useAuth;
