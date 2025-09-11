/**
 * @fileoverview Secure Token Storage Hook
 * @description Provides secure authentication token management with rotation,
 * XSS protection, and automatic cleanup
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scope?: string;
}

export interface SecureTokenConfig {
  tokenEndpoint: string;
  refreshEndpoint: string;
  revokeEndpoint: string;
  refreshThresholdMinutes?: number; // Auto-refresh when token expires in X minutes
  maxRetries?: number;
  autoCleanup?: boolean;
}

export interface UseSecureTokenStorageReturn {
  // Token operations
  getToken: () => Promise<string | null>;
  setTokens: (tokenData: TokenData) => Promise<void>;
  clearTokens: () => Promise<void>;
  refreshToken: () => Promise<boolean>;

  // State
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;

  // Utilities
  isTokenExpired: () => boolean;
  getTokenExpirationTime: () => number | null;
  forceTokenRefresh: () => Promise<boolean>;
}

/**
 * Secure token storage hook that avoids localStorage and implements
 * secure token management practices
 */
export function useSecureTokenStorage(
  config: SecureTokenConfig,
): UseSecureTokenStorageReturn {
  // Use refs to store sensitive data in memory only
  const tokenDataRef = useRef<TokenData | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefreshingRef = useRef(false);
  const refreshingPromiseRef = useRef<Promise<boolean> | null>(null);
  const refreshResolveRef = useRef<((value: boolean) => void) | null>(null);

  // State for UI updates
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    refreshThresholdMinutes = 5,
    maxRetries = 3,
    autoCleanup = true,
  } = config;

  /**
   * Securely store token data in memory and set up auto-refresh
   */
  const setTokens = useCallback(async (tokenData: TokenData): Promise<void> => {
    try {
      setError(null);

      // Validate token data
      if (!tokenData.accessToken || !tokenData.refreshToken) {
        throw new Error("Invalid token data: missing required tokens");
      }

      if (tokenData.expiresAt <= Date.now()) {
        throw new Error("Token is already expired");
      }

      // Store in memory
      tokenDataRef.current = { ...tokenData };
      setIsAuthenticated(true);

      // Set up automatic refresh
      scheduleTokenRefresh();

      // Optional: Store refresh token in httpOnly cookie via API call
      // This requires server-side support
      try {
        await fetch("/api/auth/set-refresh-cookie", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            refreshToken: tokenData.refreshToken,
            expiresAt: tokenData.expiresAt,
          }),
          credentials: "include", // Include httpOnly cookies
        });
      } catch (cookieError) {
        console.warn("Failed to set httpOnly refresh cookie:", cookieError);
        // Continue without httpOnly cookie support
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to set tokens";
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  /**
   * Get current access token, refreshing if necessary
   */
  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      setError(null);

      if (!tokenDataRef.current) {
        // Try to restore from httpOnly cookie
        const restored = await restoreFromHttpOnlyCookie();
        if (!restored) {
          return null;
        }
      }

      const tokenData = tokenDataRef.current;
      if (!tokenData) {
        return null;
      }

      // Check if token needs refresh
      const timeUntilExpiry = tokenData.expiresAt - Date.now();
      const refreshThreshold = refreshThresholdMinutes * 60 * 1000;

      if (timeUntilExpiry <= refreshThreshold) {
        const refreshed = await refreshToken();
        if (!refreshed) {
          return null;
        }
      }

      return tokenDataRef.current?.accessToken || null;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to get token";
      setError(errorMessage);
      return null;
    }
  }, [refreshThresholdMinutes]);

  /**
   * Refresh the access token using the refresh token
   */
  const refreshToken = useCallback(async (): Promise<boolean> => {
    if (isRefreshingRef.current) {
      return refreshingPromiseRef.current!;
    }

    refreshingPromiseRef.current = new Promise<boolean>(resolve => {
      refreshResolveRef.current = resolve;
    });

    try {
      isRefreshingRef.current = true;
      setLoading(true);
      setError(null);

      const currentTokenData = tokenDataRef.current;
      if (!currentTokenData?.refreshToken) {
        throw new Error("No refresh token available");
      }

      let attempt = 0;
      let response: Response;

      do {
        response = await fetch(config.refreshEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            refreshToken: currentTokenData.refreshToken,
          }),
          credentials: "include",
        });

        if (response.ok) break;

        // If this isn't the last attempt, wait with exponential backoff
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 2 ** attempt * 500));
        }
      } while (++attempt < maxRetries);

      if (!response.ok) {
        throw new Error(`Token refresh failed after ${maxRetries} attempts: ${response.status}`);
      }

      const newTokenData: TokenData = await response.json();
      await setTokens(newTokenData);

      if (refreshResolveRef.current) {
        refreshResolveRef.current(true);
      }
      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Token refresh failed";
      setError(errorMessage);

      // Clear invalid tokens
      await clearTokens();

      if (refreshResolveRef.current) {
        refreshResolveRef.current(false);
      }
      return false;
    } finally {
      isRefreshingRef.current = false;
      setLoading(false);
      refreshingPromiseRef.current = null;
      refreshResolveRef.current = null;
    }
  }, [config.refreshEndpoint, setTokens]);

  /**
   * Force token refresh regardless of expiration time
   */
  const forceTokenRefresh = useCallback(async (): Promise<boolean> => {
    return await refreshToken();
  }, [refreshToken]);

  /**
   * Clear all stored tokens
   */
  const clearTokens = useCallback(async (): Promise<void> => {
    try {
      // Revoke tokens on server if possible
      if (tokenDataRef.current?.refreshToken) {
        try {
          await fetch(config.revokeEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              refreshToken: tokenDataRef.current.refreshToken,
            }),
            credentials: "include",
          });
        } catch (revokeError) {
          console.warn("Failed to revoke tokens:", revokeError);
        }
      }

      // Clear httpOnly cookie
      try {
        await fetch("/api/auth/clear-refresh-cookie", {
          method: "POST",
          credentials: "include",
        });
      } catch (cookieError) {
        console.warn("Failed to clear httpOnly cookie:", cookieError);
      }

      // Clear memory storage
      tokenDataRef.current = null;
      setIsAuthenticated(false);
      setError(null);

      // Clear scheduled refresh
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to clear tokens";
      setError(errorMessage);
    }
  }, [config.revokeEndpoint]);

  /**
   * Check if current token is expired
   */
  const isTokenExpired = useCallback((): boolean => {
    const tokenData = tokenDataRef.current;
    if (!tokenData) return true;

    return Date.now() >= tokenData.expiresAt;
  }, []);

  /**
   * Get token expiration time
   */
  const getTokenExpirationTime = useCallback((): number | null => {
    return tokenDataRef.current?.expiresAt || null;
  }, []);

  /**
   * Schedule automatic token refresh
   */
  const scheduleTokenRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    const tokenData = tokenDataRef.current;
    if (!tokenData) return;

    const timeUntilRefresh =
      tokenData.expiresAt - Date.now() - refreshThresholdMinutes * 60 * 1000;

    if (timeUntilRefresh > 0) {
      refreshTimeoutRef.current = setTimeout(() => {
        refreshToken();
      }, timeUntilRefresh);
    }
  }, [refreshThresholdMinutes, refreshToken]);

  /**
   * Attempt to restore tokens from httpOnly cookie
   */
  const restoreFromHttpOnlyCookie = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/auth/restore-from-cookie", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        return false;
      }

      const tokenData: TokenData = await response.json();
      await setTokens(tokenData);
      return true;
    } catch (err) {
      console.warn("Failed to restore from httpOnly cookie:", err);
      return false;
    }
  }, [setTokens]);

  // Initialize token restoration on mount
  useEffect(() => {
    restoreFromHttpOnlyCookie();
  }, [restoreFromHttpOnlyCookie]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      if (autoCleanup) {
        // Optional: Clear tokens on unmount for extra security
        tokenDataRef.current = null;
      }
    };
  }, [autoCleanup]);

  // Page visibility change handler - refresh when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && tokenDataRef.current) {
        // Check if token needs refresh when page becomes visible
        const timeUntilExpiry = tokenDataRef.current.expiresAt - Date.now();
        const refreshThreshold = refreshThresholdMinutes * 60 * 1000;

        if (timeUntilExpiry <= refreshThreshold) {
          refreshToken();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshThresholdMinutes, refreshToken]);

  return {
    // Token operations
    getToken,
    setTokens,
    clearTokens,
    refreshToken,

    // State
    isAuthenticated,
    loading,
    error,

    // Utilities
    isTokenExpired,
    getTokenExpirationTime,
    forceTokenRefresh,
  };
}

/**
 * Higher-order component for secure token management
 */
export interface SecureTokenProviderProps {
  children: React.ReactNode;
  config: SecureTokenConfig;
}

export const SecureTokenContext = createContext<UseSecureTokenStorageReturn | null>(null);

export function SecureTokenProvider({
  children,
  config,
}: SecureTokenProviderProps) {
  const tokenManager = useSecureTokenStorage(config);

  return (
    <SecureTokenContext.Provider value={tokenManager}>
      {children}
    </SecureTokenContext.Provider>
  );
}

export function useSecureToken(): UseSecureTokenStorageReturn {
  const context = useContext(SecureTokenContext);
  if (!context) {
    throw new Error("useSecureToken must be used within a SecureTokenProvider");
  }
  return context;
}
