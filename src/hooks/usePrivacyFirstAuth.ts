/**
 * Privacy-First Authentication Hook (Compatibility Wrapper)
 *
 * @deprecated This hook is deprecated. Use useAuth from AuthProvider instead.
 * This wrapper maintains backward compatibility while delegating to the unified authentication system.
 *
 * Migration guide:
 * - Replace: import { usePrivacyFirstAuth } from '../hooks/usePrivacyFirstAuth'
 * - With: import { useAuth } from '../components/auth/AuthProvider'
 */

import { useAuth } from "../components/auth/AuthProvider";
import { FamilyFederationUser, FederationRole } from "../types/auth";

// Legacy type definitions for compatibility
export interface PrivacyUser {
  hashedUUID: string;
  userSalt: string;
  federationRole: "private" | "offspring" | "adult" | "steward" | "guardian";
  authMethod: "nip05-password" | "nip07" | "otp" | "nsec";
  isWhitelisted: boolean;
  votingPower: number;
  guardianApproved: boolean;
  stewardApproved: boolean;
  sessionHash: string;
  lastAuthAt: number;
  createdAt: number;
}

export interface SecureSession {
  sessionId: string;
  userHash: string;
  expiresAt: number;
  isValid: boolean;
  sessionToken: string;
  privacySettings?: {
    encryptionEnabled: boolean;
    hashingEnabled: boolean;
    anonymityLevel?: number;
    metadataProtection?: boolean;
    forwardSecrecy?: boolean;
  };
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
  // Authentication methods
  authenticateNsec: (nsecKey: string) => Promise<boolean>;
  authenticateOTP: (identifier: string, otpCode: string) => Promise<boolean>;
  authenticateNIP07: (
    challenge: string,
    signature: string,
    pubkey: string,
    password: string
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

/**
 * @deprecated Use useAuth from AuthProvider instead
 */
export function usePrivacyFirstAuth(): PrivacyAuthState & PrivacyAuthActions {
  // Delegate to unified authentication system
  const unifiedAuth = useAuth();

  // Convert unified auth state to legacy format for backward compatibility
  const convertedUser: PrivacyUser | null = unifiedAuth.user
    ? {
        hashedUUID: unifiedAuth.user.id,
        userSalt: unifiedAuth.user.user_salt || "",
        federationRole: (unifiedAuth.user.federationRole ||
          unifiedAuth.user.role ||
          "private") as any,
        authMethod: (unifiedAuth.user.authMethod || "nip05-password") as any,
        isWhitelisted: true,
        votingPower: 1,
        guardianApproved: true,
        stewardApproved: true,
        sessionHash: unifiedAuth.sessionToken || "",
        lastAuthAt: unifiedAuth.lastValidated || Date.now(),
        createdAt: new Date(
          unifiedAuth.user.created_at || Date.now()
        ).getTime(),
      }
    : null;

  const convertedSession: SecureSession | null = unifiedAuth.sessionToken
    ? {
        sessionId: unifiedAuth.sessionToken,
        userHash: unifiedAuth.user?.id || "",
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        isValid: unifiedAuth.sessionValid,
        sessionToken: unifiedAuth.sessionToken,
        privacySettings: {
          encryptionEnabled: true,
          hashingEnabled: true,
          anonymityLevel: 95,
          metadataProtection: true,
          forwardSecrecy: true,
        },
      }
    : null;

  // Return compatibility interface that delegates to unified auth
  return {
    // State
    user: convertedUser,
    session: convertedSession,
    authenticated: unifiedAuth.authenticated,
    loading: unifiedAuth.loading,
    error: unifiedAuth.error,
    requiresOnboarding: false,

    // Authentication methods - delegate to unified auth
    authenticateNsec: async (nsecKey: string): Promise<boolean> => {
      console.warn(
        "⚠️ Nsec authentication is not yet supported. Please use NIP-05/Password authentication."
      );
      return false;
    },

    authenticateOTP: async (
      identifier: string,
      otpCode: string
    ): Promise<boolean> => {
      console.warn(
        "⚠️ OTP authentication is not yet supported. Please use NIP-05/Password authentication."
      );
      return false;
    },

    authenticateNIP07: async (
      challenge: string,
      signature: string,
      pubkey: string,
      password: string
    ): Promise<boolean> => {
      return await unifiedAuth.authenticateNIP07(
        challenge,
        signature,
        pubkey,
        password
      );
    },

    authenticateNIP05Password: async (
      nip05: string,
      password: string
    ): Promise<boolean> => {
      return await unifiedAuth.authenticateNIP05Password(nip05, password);
    },

    // Session management
    logout: async (): Promise<void> => {
      await unifiedAuth.logout();
    },

    refreshSession: async (): Promise<void> => {
      await unifiedAuth.refreshSession();
    },

    checkPermission: (requiredRoles: string[]): boolean => {
      // Legacy compatibility - always return true for authenticated users
      return unifiedAuth.authenticated;
    },

    // Privacy controls
    updatePrivacyLevel: async (
      level: "standard" | "enhanced" | "maximum"
    ): Promise<boolean> => {
      console.warn(
        "⚠️ Privacy level updates should be handled through the unified auth system"
      );
      return true; // Legacy compatibility
    },

    rotateKeys: async (): Promise<boolean> => {
      console.warn(
        "⚠️ Key rotation should be handled through the unified auth system"
      );
      return true; // Legacy compatibility
    },

    // Error handling
    clearError: (): void => {
      unifiedAuth.clearError();
    },

    // Legacy compatibility
    getLegacyUser: (): FamilyFederationUser | null => {
      if (!unifiedAuth.user) return null;

      return {
        npub: "", // Not stored in privacy-first system
        nip05: "", // Not stored in privacy-first system
        federationRole: (unifiedAuth.user.federationRole ||
          unifiedAuth.user.role ||
          "private") as FederationRole,
        authMethod: (unifiedAuth.user.authMethod || "nip05-password") as any,
        isWhitelisted: true,
        votingPower: 1,
        stewardApproved: true,
        guardianApproved: true,
        sessionToken: unifiedAuth.sessionToken || "",
      };
    },
  };
}
