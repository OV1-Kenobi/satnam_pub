// Family Federation Authentication Hook
// File: src/hooks/useFamilyAuth.ts
// Provides easy integration with the authentication system

import { useCallback, useState } from "react";
import {
  AuthResponse,
  FamilyFederationUser,
  VerificationResponse,
} from "../types/auth";
import { ApiClient } from "../utils/api-client";

// Re-export the main auth hook for convenience
export { useFamilyFederationAuth as useFamilyAuth } from "./useFamilyFederationAuth";

interface UseFamilyAuthReturn {
  // State
  isLoading: boolean;
  error: string | null;

  // OTP Flow
  sendOTP: (
    npub: string,
    nip05?: string
  ) => Promise<{
    success: boolean;
    otpKey?: string;
    expiresIn?: number;
    error?: string;
  }>;
  verifyOTP: (
    otpKey: string,
    otp: string
  ) => Promise<{
    success: boolean;
    user?: FamilyFederationUser;
    error?: string;
  }>;

  // Utilities
  clearError: () => void;
}

export const useFamilyAuthOTP = (): UseFamilyAuthReturn => {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const sendOTP = useCallback(async (npub: string, nip05?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const apiClient = new ApiClient();
      const result: AuthResponse = await apiClient.authenticateUser({
        type: "otp-initiate",
        npub: npub.trim(),
        nip05: nip05?.trim() || undefined,
      });

      if (result.success && result.data) {
        return {
          success: true,
          otpKey: result.data.otpKey,
          expiresIn: result.data.expiresIn,
        };
      } else {
        const errorMsg = result.error || "Failed to send OTP";
        setError(errorMsg);
        return {
          success: false,
          error: errorMsg,
        };
      }
    } catch {
      const errorMsg =
        "Network error. Please check your connection and try again.";
      setError(errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyOTP = useCallback(
    async (otpKey: string, otp: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const apiClient = new ApiClient();
        const result: VerificationResponse = await apiClient.authenticateUser({
          type: "otp-verify",
          otpKey,
          otp: otp.trim(),
        });

        if (result.success && result.data?.authenticated) {
          const userData: FamilyFederationUser = {
            npub: result.data.userAuth.npub,
            nip05: result.data.userAuth.nip05,
            federationRole: result.data.userAuth.federationRole as
              | "parent"
              | "child"
              | "guardian",
            authMethod: "otp",
            isWhitelisted: result.data.userAuth.isWhitelisted,
            votingPower: result.data.userAuth.votingPower,
            guardianApproved: result.data.userAuth.guardianApproved,
            sessionToken: result.data.sessionToken,
          };

          // Update auth context
          login(userData);

          return {
            success: true,
            user: userData,
          };
        } else {
          const errorMsg = result.error || "Verification failed";
          setError(errorMsg);
          return {
            success: false,
            error: errorMsg,
          };
        }
      } catch {
        const errorMsg = "Network error during verification. Please try again.";
        setError(errorMsg);
        return {
          success: false,
          error: errorMsg,
        };
      } finally {
        setIsLoading(false);
      }
    },
    [login]
  );

  return {
    isLoading,
    error,
    sendOTP,
    verifyOTP,
    clearError,
  };
};

export default useFamilyAuth;
