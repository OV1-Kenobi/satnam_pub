// lib/api/auth-endpoints.ts
import type { Request, Response } from "express";
import type { Event as NostrEvent } from "nostr-tools";
import { HybridAuth } from "../hybrid-auth";
import { SecureSessionManager } from "../security/session-manager";
import { CitadelDatabase } from "../supabase";

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
    signedEvent: NostrEvent
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
    res: Response
  ): Promise<APIResponse> {
    try {
      const session = await HybridAuth.verifyNostrDMOTP(pubkey, otp_code);
      const user = await CitadelDatabase.getUserIdentity(session.user_id);

      // Create user data for HttpOnly cookie session
      const userData = {
        npub: session.npub,
        nip05: user?.nip05,
        federationRole: (user?.federationRole || "child") as
          | "parent"
          | "child"
          | "guardian",
        authMethod: "otp" as const,
        isWhitelisted: user?.isWhitelisted || false,
        votingPower: user?.votingPower || 0,
        guardianApproved: user?.guardianApproved || false,
      };

      // Create secure session with HttpOnly cookies
      SecureSessionManager.createSession(res, userData);

      return {
        success: true,
        data: {
          session,
          user,
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
  static async getSession(req: Request): Promise<APIResponse> {
    try {
      const sessionInfo = SecureSessionManager.getSessionInfo(req);

      if (!sessionInfo.isAuthenticated) {
        return {
          success: false,
          error: "No active session",
        };
      }

      return {
        success: true,
        data: sessionInfo,
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
  static async logout(res: Response): Promise<APIResponse> {
    try {
      // Clear HttpOnly cookies
      SecureSessionManager.clearSession(res);

      return {
        success: true,
        data: {
          message: "Successfully logged out",
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
   * POST /api/auth/refresh
   * Refresh authentication session
   */
  static async refreshSession(
    req: Request,
    res: Response
  ): Promise<APIResponse> {
    try {
      const refreshedSession = SecureSessionManager.refreshSession(req, res);

      if (!refreshedSession) {
        return {
          success: false,
          error: "Unable to refresh session",
        };
      }

      const sessionInfo = {
        isAuthenticated: true,
        user: {
          npub: refreshedSession.npub,
          nip05: refreshedSession.nip05,
          federationRole: refreshedSession.federationRole,
          authMethod: refreshedSession.authMethod,
          isWhitelisted: refreshedSession.isWhitelisted,
          votingPower: refreshedSession.votingPower,
          guardianApproved: refreshedSession.guardianApproved,
        },
      };

      return {
        success: true,
        data: sessionInfo,
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }
}
