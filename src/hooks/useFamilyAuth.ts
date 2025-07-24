// Family Federation Authentication Hook
// File: src/hooks/useFamilyAuth.ts
// Provides easy integration with the authentication system

import { useCallback, useState } from "react";
import { FamilyFederationUser } from "../types/auth";
import { ApiClient } from "../utils/api-client.js";

// Re-export the main auth hook for convenience
export type { useFamilyFederationAuth as useFamilyAuth } from "./useFamilyFederationAuth";

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
  // Mock login function for now - would be replaced with actual auth context
  const login = (userData: FamilyFederationUser) => {
    console.log("Login called with:", userData);
  };
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
      const result = await apiClient.authenticateUser({
        type: "otp-initiate",
        npub: npub.trim(),
        nip05: nip05?.trim() || undefined,
      });

      // Type guard to ensure we have AuthResponse
      if (result.success && result.data && "otpKey" in result.data) {
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
        const result = await apiClient.authenticateUser({
          type: "otp-verify",
          otpKey,
          otp: otp.trim(),
        });

        // Type guard to ensure we have VerificationResponse
        if (
          result.success &&
          result.data &&
          "authenticated" in result.data &&
          result.data.authenticated
        ) {
          // Cast to VerificationResponse for proper type access
          const verificationData = result.data as {
            authenticated: boolean;
            sessionToken: string;
            userAuth: {
              npub: string;
              nip05?: string;
              federationRole: string | null;
              authMethod: string;
              isWhitelisted: boolean;
              votingPower: number;
              stewardApproved: boolean;
              guardianApproved: boolean;
            };
            message: string;
            verificationMethod: string;
            otpSender: string;
          };

          const userData: FamilyFederationUser = {
            npub: verificationData.userAuth.npub,
            nip05: verificationData.userAuth.nip05,
            federationRole: verificationData.userAuth.federationRole as
              | "adult"
              | "offspring"
              | "steward"
              | "guardian",
            authMethod: "otp",
            isWhitelisted: verificationData.userAuth.isWhitelisted,
            votingPower: verificationData.userAuth.votingPower,
            stewardApproved: verificationData.userAuth.stewardApproved,
            guardianApproved: verificationData.userAuth.guardianApproved,
            sessionToken: verificationData.sessionToken,
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

export default useFamilyAuthOTP;
