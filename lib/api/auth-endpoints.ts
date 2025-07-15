// lib/api/auth-endpoints.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { HybridAuth } from "../../netlify/functions/hybrid-auth";
import type { Event as NostrEvent } from "../../src/lib/nostr-browser";
import type { NetlifyContext } from "../../types/netlify-functions";
import { SecureSessionManager } from "../security/session-manager";
import { createSupabaseClient } from "../supabase";

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

// Helper function to get user identity from database
// IMPORTANT: userId must be a hashed UUID, not a readable userID
async function getUserIdentity(userId: string, client?: SupabaseClient) {
  if (!client) {
    client = await createSupabaseClient();
  }
  const result = await client
    .from("user_identities")
    .select("*")
    .eq("user_id", userId)
    .limit(1);

  return result.data?.[0] || null;
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
      const client = await createSupabaseClient();

      return {
        success: true,
        data: {
          session,
          user: await getUserIdentity(session.user_id, client),
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
      const client = await createSupabaseClient();

      return {
        success: true,
        data: {
          session,
          user: await getUserIdentity(session.user_id, client),
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
    context?: NetlifyContext
  ): Promise<APIResponse> {
    try {
      const session = await HybridAuth.verifyNostrDMOTP(pubkey, otp_code);
      const client = await createSupabaseClient();
      const user = await getUserIdentity(session.user_id, client);

      // Create user data for session
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

      // Create secure session
      const sessionManager = new SecureSessionManager();
      const sessionData = await sessionManager.createSession({
        userId: session.user_id,
        npub: userData.npub,
        familyId: user?.familyId,
        role: userData.federationRole,
        permissions: [], // TODO: Define permissions based on role
      });

      return {
        success: true,
        data: {
          session,
          user,
          sessionToken: sessionData.sessionToken,
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
      const sessionManager = new SecureSessionManager();
      const sessionData = await sessionManager.getSession();

      if (!sessionData) {
        return {
          success: false,
          error: "No active session",
        };
      }

      return {
        success: true,
        data: {
          isAuthenticated: true,
          user: {
            userId: sessionData.userId,
            npub: sessionData.npub,
            familyId: sessionData.familyId,
            role: sessionData.role,
            permissions: sessionData.permissions,
          },
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
      // Clear session
      const sessionManager = new SecureSessionManager();
      await sessionManager.destroySession();

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
  static async refreshSession(): Promise<APIResponse> {
    try {
      const sessionManager = new SecureSessionManager();
      const sessionData = await sessionManager.getSession();

      if (!sessionData) {
        return {
          success: false,
          error: "Unable to refresh session",
        };
      }

      // Session is automatically refreshed by getSession()
      const sessionInfo = {
        isAuthenticated: true,
        user: {
          userId: sessionData.userId,
          npub: sessionData.npub,
          familyId: sessionData.familyId,
          role: sessionData.role,
          permissions: sessionData.permissions,
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
