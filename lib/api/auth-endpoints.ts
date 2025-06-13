// lib/api/auth-endpoints.ts
import { HybridAuth } from "../hybrid-auth";
import { CitadelDatabase } from "../supabase";
import type { Event as NostrEvent } from "nostr-tools";

// Helper function to safely extract error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unknown error occurred";
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export class AuthAPI {
  // ===========================================
  // NOSTR DIRECT AUTHENTICATION
  // ===========================================

  /**
   * POST /api/auth/nostr
   * Authenticate with a signed Nostr event
   */
  static async authenticateNostr(
    signedEvent: NostrEvent,
  ): Promise<APIResponse> {
    try {
      const session = await HybridAuth.authenticateWithNostr(signedEvent);

      return {
        success: true,
        data: {
          session,
          user: await CitadelDatabase.getUserIdentity(session.user_id),
        },
        message: "Authentication successful",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================
  // NOSTR WALLET CONNECT AUTHENTICATION
  // ===========================================

  /**
   * POST /api/auth/nwc
   * Authenticate with Nostr Wallet Connect
   */
  static async authenticateNWC(nwcUri: string): Promise<APIResponse> {
    try {
      if (!nwcUri.startsWith("nostr+walletconnect://")) {
        throw new Error("Invalid NWC URI format");
      }

      const session = await HybridAuth.authenticateWithNWC(nwcUri);

      return {
        success: true,
        data: {
          session,
          user: await CitadelDatabase.getUserIdentity(session.user_id),
          wallet_connected: true,
        },
        message: "NWC authentication successful",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================
  // NOSTR DM OTP AUTHENTICATION
  // ===========================================

  /**
   * POST /api/auth/otp/initiate
   * Start OTP authentication process
   */
  static async initiateOTP(npubOrPubkey: string): Promise<APIResponse> {
    try {
      const result = await HybridAuth.initiateNostrDMOTP(npubOrPubkey);

      return {
        success: true,
        data: {
          message: result.message,
          // Don't return OTP in production
          otp_preview: result.otp_code.slice(0, 2) + "****",
        },
        message: "OTP sent successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * POST /api/auth/otp/verify
   * Verify OTP code and complete authentication
   */
  static async verifyOTP(
    pubkey: string,
    otp_code: string,
  ): Promise<APIResponse> {
    try {
      const session = await HybridAuth.verifyNostrDMOTP(pubkey, otp_code);

      return {
        success: true,
        data: {
          session,
          user: await CitadelDatabase.getUserIdentity(session.user_id),
        },
        message: "OTP verification successful",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================
  // SESSION MANAGEMENT
  // ===========================================

  /**
   * GET /api/auth/session
   * Get current session information
   */
  static async getSession(): Promise<APIResponse> {
    try {
      const session = await HybridAuth.validateSession();

      if (!session) {
        return {
          success: false,
          error: "No active session",
        };
      }

      return {
        success: true,
        data: {
          session,
          user: await CitadelDatabase.getUserIdentity(session.user_id),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * POST /api/auth/logout
   * Logout and invalidate session
   */
  static async logout(): Promise<APIResponse> {
    try {
      await HybridAuth.logout();

      return {
        success: true,
        message: "Logged out successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * POST /api/auth/refresh
   * Refresh authentication session
   */
  static async refreshSession(): Promise<APIResponse> {
    try {
      const session = await HybridAuth.validateSession();

      if (!session) {
        return {
          success: false,
          error: "No session to refresh",
        };
      }

      return {
        success: true,
        data: {
          session,
          user: await CitadelDatabase.getUserIdentity(session.user_id),
        },
        message: "Session refreshed",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }
}
