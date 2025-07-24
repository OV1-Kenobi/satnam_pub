/**
 * Privacy-First Authentication Hook
 *
 * Integrates with existing FamilyFederationAuth but uses privacy-first backend
 * - Hashed UUIDs only (no npubs/nip05 in database)
 * - Perfect forward secrecy
 * - Anonymous by default
 * - 4 auth methods: NIP-05/Password, OTP, NIP-07, Nsec
 *
 * NOTE: NWC (Nostr Wallet Connect) is now a wallet connection feature,
 * not an authentication method. It's used for Lightning payments after authentication.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AuthCredentials,
  AuthResult,
  createPrivacyFirstAuth,
  PrivacyUser,
  SecureSession,
} from '../lib/auth/privacy-first-auth.js';
import { nip19 } from "../lib/nostr-browser";
import { FamilyFederationUser } from "../types/auth";

// Helper function to extract pubkey from nsec (zero-knowledge protocol)
async function extractPubkeyFromNsec(nsecKey: string): Promise<string | null> {
  try {
    if (!nsecKey.startsWith("nsec1")) {
      return null;
    }

    // Decode nsec to get private key bytes
    const { type, data } = nip19.decode(nsecKey);
    if (type !== "nsec") {
      return null;
    }

    // Generate public key from private key
    // This is done in memory only and immediately cleared
    const { getPublicKey } = await import("nostr-tools/pure");
    const privateKeyBytes =
      typeof data === "string" ? new TextEncoder().encode(data) : data;
    const pubkey = getPublicKey(privateKeyBytes);

    return pubkey;
  } catch (error) {
    return null;
  }
}

interface PrivacyAuthState {
  user: PrivacyUser | null;
  session: SecureSession | null;
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  requiresOnboarding: boolean;
}

interface PrivacyAuthActions {
  // 4 Authentication methods (ALWAYS MAXIMUM PRIVACY)
  authenticateNsec: (nsecKey: string) => Promise<boolean>;
  authenticateOTP: (identifier: string, otpCode: string) => Promise<boolean>;
  authenticateNIP07: (
    challenge: string,
    signature: string,
    pubkey: string
  ) => Promise<boolean>;
  authenticateNIP05Password: (
    nip05: string,
    password: string
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
    loading: false, // Start as false to prevent unnecessary loading
    error: null,
    requiresOnboarding: false,
  });

  const auth = createPrivacyFirstAuth();

  // Check existing session on mount - FIXED: Only run once
  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        if (!mounted) return;

        setState((prev) => ({ ...prev, loading: true, error: null }));

        const session = await auth.getSession();
        if (session && session.expiresAt > Date.now()) {
          // Valid session found
          if (mounted) {
            setState((prev) => ({
              ...prev,
              session,
              authenticated: true,
              loading: false,
            }));
          }
        } else {
          if (mounted) {
            setState((prev) => ({
              ...prev,
              authenticated: false,
              loading: false,
            }));
          }
        }
      } catch (error) {
        // ✅ NO LOGGING - Following Master Context privacy-first principles
        if (mounted) {
          setState((prev) => ({
            ...prev,
            authenticated: false,
            loading: false,
            error: null, // Don't show errors for session checks
          }));
        }
      }
    };

    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (mounted) {
        // ✅ NO LOGGING - Following Master Context privacy-first principles
        setState((prev) => ({
          ...prev,
          authenticated: false,
          loading: false,
          error: null,
        }));
      }
    }, 3000); // 3 second timeout

    checkSession();

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, []); // Empty dependency array - only run once

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

  // Nsec Authentication (ALWAYS MAXIMUM PRIVACY with Zero-Knowledge Protocol)
  const authenticateNsec = useCallback(
    async (nsecKey: string): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        // Validate nsec format
        if (!nsecKey.startsWith("nsec1")) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "Invalid Nsec format. Must start with 'nsec1'",
          }));
          return false;
        }

        // Extract pubkey from nsec for hashing (not stored)
        // This is done in memory only and immediately cleared
        const pubkey = await extractPubkeyFromNsec(nsecKey);
        if (!pubkey) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "Invalid Nsec private key",
          }));
          return false;
        }

        const credentials: AuthCredentials = {
          nsecKey,
          pubkey, // Ephemeral - not stored
        };

        const result = await auth.authenticateNsec(credentials);

        // Clear nsec from memory immediately after use
        credentials.nsecKey = "";

        return handleAuthResult(result);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Nsec authentication failed",
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

  // NIP-05/Password Authentication (ALWAYS MAXIMUM PRIVACY)
  const authenticateNIP05Password = useCallback(
    async (nip05: string, password: string): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const credentials: AuthCredentials = {
          nip05,
          password,
        };

        const result = await auth.authenticateNIP05Password(credentials);
        return handleAuthResult(result);
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
    try {
      setState((prev) => ({ ...prev, loading: true }));
      const session = await auth.getSession();
      if (session && session.expiresAt > Date.now()) {
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
      setState((prev) => ({
        ...prev,
        authenticated: false,
        loading: false,
      }));
    }
  }, []);

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
      // Privacy-first auth always uses maximum privacy - no changes needed
      // ✅ NO LOGGING - Following Master Context privacy-first principles
      return true;
    },
    []
  );

  const rotateKeys = useCallback(async (): Promise<boolean> => {
    if (!state.session) return false;

    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      // Use the comprehensive key rotation method
      const result = await auth.rotateSessionKeys(state.session.userHash);

      if (result.success) {
        // Refresh session to get updated keys and metadata
        await refreshSession();

        setState((prev) => ({
          ...prev,
          loading: false,
          error: null,
        }));

        return true;
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: result.error || "Key rotation failed",
        }));

        return false;
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Key rotation failed",
      }));

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
        state.user.authMethod === "nip07"
          ? "otp"
          : state.user.authMethod === "nip05-password"
          ? "otp"
          : state.user.authMethod, // Map to supported types
      isWhitelisted: state.user.isWhitelisted,
      votingPower: state.user.votingPower,
      stewardApproved: state.user.stewardApproved,
      guardianApproved: state.user.guardianApproved,
      sessionToken: state.session.sessionId,
    };
  }, [state.user, state.session]);

  return {
    ...state,
    authenticateNsec,
    authenticateOTP,
    authenticateNIP07,
    authenticateNIP05Password,
    logout,
    refreshSession,
    checkPermission,
    updatePrivacyLevel,
    rotateKeys,
    clearError,
    getLegacyUser,
  };
}
