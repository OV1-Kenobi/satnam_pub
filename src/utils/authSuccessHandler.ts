// Authentication Success Handler Utility
// File: src/utils/authSuccessHandler.ts

import {
  FamilyFederationUser,
  NWCAuthResponse,
  VerificationResponse,
} from "../types/auth";

export interface AuthSuccessHandlerOptions {
  // State setters
  setAuthStep?: (step: string) => void;
  setMessage?: (message: string | ((prev: string) => string)) => void;
  login: (userData: FamilyFederationUser) => void;

  // Success handling options
  onSuccess?: (userData: FamilyFederationUser) => void;
  onClose?: () => void;
  mode?: "modal" | "page";
  redirectUrl?: string;

  // Custom success message prefix
  messagePrefix?: string;
}

export interface AuthSuccessResult {
  userData: FamilyFederationUser;
  message: string;
}

/**
 * Handles successful authentication for both OTP and NWC flows
 * Extracts common success handling logic to reduce code duplication
 */
export function handleAuthenticationSuccess(
  response: VerificationResponse | NWCAuthResponse,
  authMethod: "otp" | "nwc",
  options: AuthSuccessHandlerOptions
): AuthSuccessResult {
  const {
    setAuthStep,
    setMessage,
    login,
    onSuccess,
    onClose,
    mode,
    redirectUrl = "/",
    messagePrefix,
  } = options;

  // Extract user data from response
  const responseData = response.data!;
  const userData: FamilyFederationUser = {
    npub: responseData.userAuth.npub,
    nip05: responseData.userAuth.nip05,
    federationRole: responseData.userAuth.federationRole as
      | "adult"
      | "offspring"
      | "guardian",
    authMethod,
    isWhitelisted: responseData.userAuth.isWhitelisted,
    votingPower: responseData.userAuth.votingPower,
    guardianApproved: responseData.userAuth.guardianApproved,
    stewardApproved: responseData.userAuth.stewardApproved || false,
    sessionToken: responseData.sessionToken,
  };

  // Create success message
  const defaultPrefix =
    authMethod === "nwc"
      ? "🎉 NWC Authentication successful! Welcome to Family Financials."
      : "🎉 Successfully authenticated! Welcome to Family Financials.";

  let message = messagePrefix || defaultPrefix;

  // Add verification method for OTP
  if (authMethod === "otp" && "verificationMethod" in responseData) {
    message += `\nVerification method: ${responseData.verificationMethod}`;
  }

  message += `\nRole: ${userData.federationRole || "Member"}`;
  message += `\nVoting power: ${userData.votingPower}`;

  // Update state
  if (setAuthStep) {
    setAuthStep("authenticated");
  }

  if (setMessage) {
    setMessage(message);
  }

  // Update auth context
  login(userData);

  // Handle success callback or redirect
  if (onSuccess) {
    onSuccess(userData);
  } else {
    setTimeout(() => {
      if (mode === "modal" && onClose) {
        onClose();
      } else {
        window.location.href = redirectUrl;
      }
    }, 2000);
  }

  return { userData, message };
}

/**
 * Type guard to check if response is a successful authentication response
 */
export function isSuccessfulAuthResponse(
  response: VerificationResponse | NWCAuthResponse
): response is
  | (VerificationResponse & {
      success: true;
      data: NonNullable<VerificationResponse["data"]>;
    })
  | (NWCAuthResponse & {
      success: true;
      data: NonNullable<NWCAuthResponse["data"]>;
    }) {
  return (
    response.success &&
    !!response.data &&
    ("authenticated" in response.data ? response.data.authenticated : true)
  );
}
