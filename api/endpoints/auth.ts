/**
 * Nostr-Native Authentication API Endpoints
 *
 * This file contains all Nostr-based authentication API endpoints.
 */
import { config } from "../../config";
import { NostrEvent, User } from "../../types/user";

/**
 * Authenticates a user with a signed Nostr event.
 * @param signedEvent The signed Nostr event for authentication
 * @returns Promise resolving to an authentication token
 */
export const authenticateWithNostr = async (
  signedEvent: NostrEvent
): Promise<string> => {
  try {
    // Make API call to authenticate with the signed event
    const response = await fetch(`${config.api.baseUrl}/api/auth/nostr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ signed_event: signedEvent }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Authentication failed");
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error("Nostr authentication error:", error);
    throw error;
  }
};

/**
 * Generates a one-time password for authentication.
 * @param npub The user's Nostr public key
 * @returns Promise resolving to a session token for OTP verification
 */
export const generateOTP = async (npub: string): Promise<string> => {
  try {
    // Make API call to request OTP generation
    const response = await fetch(
      `${config.api.baseUrl}/api/auth/otp/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ npub }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "OTP generation failed");
    }

    const data = await response.json();
    return data.session_token;
  } catch (error) {
    console.error("OTP generation error:", error);
    throw error;
  }
};

/**
 * Authenticates a user with a one-time password.
 * @param npub The user's Nostr public key
 * @param otpCode The OTP code
 * @param sessionToken The session token from generateOTP
 * @returns Promise resolving to an authentication token
 */
export const authenticateWithOTP = async (
  npub: string,
  otpCode: string,
  sessionToken: string
): Promise<string> => {
  try {
    // Make API call to authenticate with OTP
    const response = await fetch(`${config.api.baseUrl}/api/auth/otp/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        npub,
        otp_code: otpCode,
        session_token: sessionToken,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "OTP authentication failed");
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error("OTP authentication error:", error);
    throw error;
  }
};

/**
 * Creates a new Nostr identity.
 * @param username The desired username
 * @param recoveryPassword A recovery password
 * @returns Promise resolving to user data, encrypted backup, and recovery code
 */
export const createIdentity = async (
  username: string,
  recoveryPassword: string
): Promise<{
  user: User;
  encrypted_backup: string;
  recovery_code: string;
}> => {
  try {
    // Make API call to create a new identity
    const response = await fetch(
      `${config.api.baseUrl}/api/auth/identity/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          recovery_password: recoveryPassword,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Identity creation failed");
    }

    return await response.json();
  } catch (error) {
    console.error("Identity creation error:", error);
    throw error;
  }
};

/**
 * Logs out the currently authenticated user.
 * @returns Promise resolving when logout is complete
 */
export const logout = async (): Promise<void> => {
  try {
    // Make API call to logout
    const response = await fetch(`${config.api.baseUrl}/api/auth/logout`, {
      method: "POST",
      credentials: "include", // Include HttpOnly cookies
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Logout failed");
    }
  } catch (error) {
    console.error("Logout error:", error);
    // We don't throw here to ensure the client-side logout still happens
  }
};

/**
 * Gets current session information from HttpOnly cookies
 * @returns Promise resolving to session info
 */
export const getSessionInfo = async (): Promise<{
  isAuthenticated: boolean;
  user?: {
    npub: string;
    nip05?: string;
    federationRole: "parent" | "child" | "guardian";
    authMethod: "otp" | "nwc";
    isWhitelisted: boolean;
    votingPower: number;
    guardianApproved: boolean;
  };
}> => {
  try {
    const response = await fetch(`${config.api.baseUrl}/api/auth/session`, {
      method: "GET",
      credentials: "include", // Include HttpOnly cookies
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return { isAuthenticated: false };
    }

    const data = await response.json();
    return data.success ? data.data : { isAuthenticated: false };
  } catch (error) {
    console.error("Session info error:", error);
    return { isAuthenticated: false };
  }
};

/**
 * Refreshes the current session using refresh token
 * @returns Promise resolving to updated session info
 */
export const refreshSession = async (): Promise<{
  isAuthenticated: boolean;
  user?: {
    npub: string;
    nip05?: string;
    federationRole: "parent" | "child" | "guardian";
    authMethod: "otp" | "nwc";
    isWhitelisted: boolean;
    votingPower: number;
    guardianApproved: boolean;
  };
}> => {
  try {
    const response = await fetch(`${config.api.baseUrl}/api/auth/refresh`, {
      method: "POST",
      credentials: "include", // Include HttpOnly cookies
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return { isAuthenticated: false };
    }

    const data = await response.json();
    return data.success ? data.data : { isAuthenticated: false };
  } catch (error) {
    console.error("Session refresh error:", error);
    return { isAuthenticated: false };
  }
};
