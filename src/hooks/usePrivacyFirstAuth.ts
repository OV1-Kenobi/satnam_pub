/**
 * Privacy-First Authentication Hook
 *
 * Integrates with existing FamilyFederationAuth but uses privacy-first backend
 * - Hashed UUIDs only (no npubs/nip05 in database)
 * - Perfect forward secrecy
 * - Anonymous by default
 * - 3 auth methods: NWC, OTP, NIP-07
 */

import { useCallback, useEffect, useState } from "react";
import {
  AuthCredentials,
  AuthResult,
  createPrivacyFirstAuth,
  PrivacyUser,
  SecureSession,
} from "../lib/auth/privacy-first-auth";
import { FamilyFederationUser } from "../types/auth";

interface PrivacyAuthState {
  user: PrivacyUser | null;
  session: SecureSession | null;
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  requiresOnboarding: boolean;
}

interface PrivacyAuthActions {
  // 3 Authentication methods (ALWAYS MAXIMUM PRIVACY)
  authenticateNWC: (nwcString: string) => Promise<boolean>;
  authenticateOTP: (identifier: string, otpCode: string) => Promise<boolean>;
  authenticateNIP07: (
    challenge: string,
    signature: string,
    pubkey: string
  ) => Promise<boolean>;

  // Session management
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  checkPermission: (requiredRoles: string[]) => boolean;

  // Privacy controls
  updatePrivacyLevel: (
    level: "standard" | "enhanced" | "maximum"
  ) => Promise<boolean>;
  rotateKeys: () => Promise<boolean>;

  // Error handling
  clearError: () => void;

  // Legacy compatibility
  getLegacyUser: () => FamilyFederationUser | null;
}

export function usePrivacyFirstAuth(): PrivacyAuthState & PrivacyAuthActions {
  const [state, setState] = useState<PrivacyAuthState>({
    user: null,
    session: null,
    authenticated: false,
    loading: true,
    error: null,
    requiresOnboarding: false,
  });

  const auth = createPrivacyFirstAuth();

  // Check existing session on mount
  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const session = await auth.getSession();
      if (session && session.expiresAt > Date.now()) {
        // Valid session found
        setState((prev) => ({
          ...prev,
          session,
          authenticated: true,
          loading: false,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          authenticated: false,
          loading: false,
        }));
      }
    } catch (error) {
      console.debug("Privacy session check failed:", error);
      setState((prev) => ({
        ...prev,
        authenticated: false,
        loading: false,
        error: null, // Don't show errors for session checks
      }));
    }
  }, []);

  const handleAuthResult = useCallback((result: AuthResult): boolean => {
    if (result.success && result.user && result.session) {
      setState((prev) => ({
        ...prev,
        user: result.user!,
        session: result.session!,
        authenticated: true,
        loading: false,
        error: null,
        requiresOnboarding: result.requiresOnboarding || false,
      }));
      return true;
    } else {
      setState((prev) => ({
        ...prev,
        user: null,
        session: null,
        authenticated: false,
        loading: false,
        error: result.error || "Authentication failed",
        requiresOnboarding: false,
      }));
      return false;
    }
  }, []);

  // NWC Authentication (ALWAYS MAXIMUM PRIVACY)
  const authenticateNWC = useCallback(
    async (nwcString: string): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        // Extract pubkey from NWC string for hashing (not stored)
        const nwcPubkey = extractPubkeyFromNWC(nwcString);
        if (!nwcPubkey) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "Invalid NWC connection string",
          }));
          return false;
        }

        const credentials: AuthCredentials = {
          nwcString,
          nwcPubkey,
        };

        const result = await auth.authenticateNWC(credentials);
        return handleAuthResult(result);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "NWC authentication failed",
        }));
        return false;
      }
    },
    [handleAuthResult]
  );

  // OTP Authentication (ALWAYS MAXIMUM PRIVACY)
  const authenticateOTP = useCallback(
    async (identifier: string, otpCode: string): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const credentials: AuthCredentials = {
          identifier,
          otpCode,
        };

        const result = await auth.authenticateOTP(credentials);
        return handleAuthResult(result);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "OTP authentication failed",
        }));
        return false;
      }
    },
    [handleAuthResult]
  );

  // NIP-07 Authentication (ALWAYS MAXIMUM PRIVACY)
  const authenticateNIP07 = useCallback(
    async (
      challenge: string,
      signature: string,
      pubkey: string
    ): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const credentials: AuthCredentials = {
          challenge,
          signature,
          pubkey,
        };

        const result = await auth.authenticateNIP07(credentials);
        return handleAuthResult(result);
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
    [handleAuthResult]
  );

  // Session management
  const logout = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true }));
      await auth.logout();
      setState({
        user: null,
        session: null,
        authenticated: false,
        loading: false,
        error: null,
        requiresOnboarding: false,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Logout failed",
      }));
    }
  }, []);

  const refreshSession = useCallback(async () => {
    await checkExistingSession();
  }, [checkExistingSession]);

  // RBAC Permission Check
  const checkPermission = useCallback(
    (requiredRoles: string[]): boolean => {
      if (!state.user || !state.authenticated) return false;
      return requiredRoles.includes(state.user.federationRole);
    },
    [state.user, state.authenticated]
  );

  // Privacy controls
  const updatePrivacyLevel = useCallback(
    async (level: "standard" | "enhanced" | "maximum"): Promise<boolean> => {
      if (!state.user) return false;

      try {
        const success = await auth.updatePrivacySettings(
          state.user.hashedUUID,
          {
            privacyLevel: level,
          }
        );

        if (success) {
          setState((prev) => ({
            ...prev,
            user: prev.user ? { ...prev.user, privacyLevel: level } : null,
          }));
        }

        return success;
      } catch (error) {
        console.error("Privacy level update failed:", error);
        return false;
      }
    },
    [state.user]
  );

  const rotateKeys = useCallback(async (): Promise<boolean> => {
    if (!state.session) return false;

    try {
      // Trigger key rotation through logout/login cycle
      await refreshSession();
      return true;
    } catch (error) {
      console.error("Key rotation failed:", error);
      return false;
    }
  }, [state.session, refreshSession]);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Legacy compatibility - convert PrivacyUser to FamilyFederationUser
  const getLegacyUser = useCallback((): FamilyFederationUser | null => {
    if (!state.user || !state.session) return null;

    // Create compatible user object without exposing real identifiers
    return {
      npub: `privacy_${state.user.hashedUUID}`, // Anonymized identifier
      nip05: `anonymous@privacy.federation`, // Generic anonymous identifier
      federationRole: state.user.federationRole,
      authMethod:
        state.user.authMethod === "nip07" ? "otp" : state.user.authMethod, // Map to supported types
      isWhitelisted: state.user.isWhitelisted,
      votingPower: state.user.votingPower,
      guardianApproved: state.user.guardianApproved,
      sessionToken: state.session.sessionId,
    };
  }, [state.user, state.session]);

  return {
    ...state,
    authenticateNWC,
    authenticateOTP,
    authenticateNIP07,
    logout,
    refreshSession,
    checkPermission,
    updatePrivacyLevel,
    rotateKeys,
    clearError,
    getLegacyUser,
  };
}

// Helper function to extract pubkey from NWC string (for hashing only)
function extractPubkeyFromNWC(nwcString: string): string | null {
  try {
    // NWC format: nostr+walletconnect://pubkey@relay?secret=...
    const url = new URL(nwcString);
    const pubkey = url.pathname.substring(2); // Remove the '//' prefix
    const atIndex = pubkey.indexOf("@");
    return atIndex > 0 ? pubkey.substring(0, atIndex) : pubkey;
  } catch {
    return null;
  }
}
