/**
 * Recovery Session Bridge
 *
 * Integrates the Emergency Recovery/Key Rotation system with session-based message signing.
 * Provides secure bridge between recovery system and SecureNsecManager for Individual users.
 *
 * This enables users who authenticate via NIP-05/password to create temporary signing sessions
 * by leveraging their emergency recovery credentials, eliminating dependency on NIP-07 extensions.
 */

import { userSigningPreferences } from "../user-signing-preferences";
import { nsecSessionBridge } from "./nsec-session-bridge";
import type { UserIdentity } from "./user-identities-auth";
import { userIdentitiesAuth } from "./user-identities-auth";

export interface RecoverySessionOptions {
  duration?: number; // Session duration in milliseconds (default: 15 minutes)
  maxOperations?: number; // Maximum operations per session (default: 50)
  requireConfirmation?: boolean; // Require user confirmation for session creation
}

export interface RecoverySessionResult {
  success: boolean;
  sessionId?: string;
  expiresAt?: Date;
  securityLevel?: "high" | "medium";
  error?: string;
  userMessage?: string;
}

export class RecoverySessionBridge {
  private static instance: RecoverySessionBridge | null = null;
  private readonly DEFAULT_SESSION_DURATION = 15 * 60 * 1000; // 15 minutes
  private readonly DEFAULT_MAX_OPERATIONS = 50;

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): RecoverySessionBridge {
    if (!RecoverySessionBridge.instance) {
      RecoverySessionBridge.instance = new RecoverySessionBridge();
    }
    return RecoverySessionBridge.instance;
  }

  /**
   * Create a temporary signing session using recovery credentials
   * This is the main integration point for Individual users
   *
   * @param credentials - NIP-05/password or npub/password credentials
   * @param options - Session configuration options
   * @returns Promise<RecoverySessionResult>
   */
  async createSessionFromRecovery(
    credentials: {
      nip05: string;
      password: string;
    },
    options: RecoverySessionOptions = {}
  ): Promise<RecoverySessionResult> {
    try {
      console.log(
        "🔐 RecoverySessionBridge: Creating session from recovery credentials"
      );

      // Step 1: Authenticate user using recovery system
      const authResult = await this.authenticateForRecovery(credentials);
      // Normalize response shape from userIdentitiesAuth (may return data.user)
      const userFromAuth: any =
        (authResult as any)?.user || (authResult as any)?.data?.user || null;
      if (!authResult.success || !userFromAuth) {
        return {
          success: false,
          error: "Authentication failed",
          userMessage:
            "Invalid credentials. Please check your NIP-05/password and try again.",
        };
      }

      // Retrieve full user record to access encrypted nsec fields
      console.log(
        "🔐 RecoverySessionBridge.createSessionFromRecovery: Retrieving user data"
      );
      console.log(
        "🔐 RecoverySessionBridge.createSessionFromRecovery: userFromAuth keys:",
        Object.keys(userFromAuth || {})
      );
      console.log(
        "🔐 RecoverySessionBridge.createSessionFromRecovery: userFromAuth has encrypted_nsec:",
        !!userFromAuth?.encrypted_nsec
      );
      console.log(
        "🔐 RecoverySessionBridge.createSessionFromRecovery: userFromAuth has user_salt:",
        !!userFromAuth?.user_salt
      );

      let fullUser = null as any;
      try {
        // If server returned required fields, use them directly (no extra fetch)
        if (userFromAuth?.encrypted_nsec && userFromAuth?.user_salt) {
          console.log(
            "🔐 RecoverySessionBridge.createSessionFromRecovery: Using userFromAuth directly"
          );
          fullUser = userFromAuth;
        } else if (userFromAuth?.id) {
          console.log(
            "🔐 RecoverySessionBridge.createSessionFromRecovery: Fetching full user by ID:",
            userFromAuth.id
          );
          fullUser = await userIdentitiesAuth.getUserById(userFromAuth.id);
          console.log(
            "🔐 RecoverySessionBridge.createSessionFromRecovery: Retrieved fullUser keys:",
            Object.keys(fullUser || {})
          );
          console.log(
            "🔐 RecoverySessionBridge.createSessionFromRecovery: fullUser has encrypted_nsec:",
            !!fullUser?.encrypted_nsec
          );
          console.log(
            "🔐 RecoverySessionBridge.createSessionFromRecovery: fullUser has user_salt:",
            !!fullUser?.user_salt
          );
        }
      } catch (e) {
        console.error(
          "🔐 RecoverySessionBridge.createSessionFromRecovery: Error retrieving user data:",
          e
        );
        // ignore and handle below
      }

      if (!fullUser) {
        return {
          success: false,
          error: "User record not found",
          userMessage:
            "Unable to locate your account details. Please try again.",
        };
      }

      // Step 2: Decrypt user's nsec using their salt
      const nsecHex = await this.decryptUserNsec(fullUser);
      if (!nsecHex) {
        return {
          success: false,
          error: "Failed to decrypt nsec",
          userMessage:
            "Unable to access your private key. Please contact support if this persists.",
        };
      }

      // Step 3: Create temporary session using NSECSessionBridge with user policy
      let sessionId: string | null = null;
      try {
        const prefs = await userSigningPreferences.getUserPreferences();
        const enableTimeout = prefs?.sessionLifetimeMode === "timed";
        const duration = enableTimeout
          ? (prefs?.sessionDurationMinutes ?? 15) * 60 * 1000
          : 365 * 24 * 60 * 60 * 1000; // effectively tab-lifetime
        const maxOps =
          prefs?.maxOperationsPerSession ?? this.DEFAULT_MAX_OPERATIONS;
        const browserLifetime = !enableTimeout; // default to tab-lifetime
        sessionId = await nsecSessionBridge.initializeAfterAuth(nsecHex, {
          duration,
          maxOperations: maxOps,
          browserLifetime,
        } as any);
        if (!sessionId) throw new Error("No session created");
        // continue
      } catch (e) {
        // Fallback: ensure we assign to outer sessionId, not shadow it
        sessionId = await nsecSessionBridge.initializeAfterAuth(nsecHex, {
          duration: options.duration ?? 365 * 24 * 60 * 60 * 1000,
          maxOperations: options.maxOperations || this.DEFAULT_MAX_OPERATIONS,
          browserLifetime: true,
        });
        if (!sessionId) {
          return {
            success: false,
            error: "Failed to create session",
            userMessage: "Unable to create signing session. Please try again.",
          };
        }
      }

      const ensuredSessionId = sessionId;
      if (!ensuredSessionId) {
        return {
          success: false,
          error: "Failed to create session",
          userMessage: "Unable to create signing session. Please try again.",
        };
      }

      const expiresAt = new Date(
        Date.now() + (options.duration || this.DEFAULT_SESSION_DURATION)
      );

      console.log("🔐 RecoverySessionBridge: Session created successfully:", {
        sessionId: ensuredSessionId.substring(0, 8) + "...",
        expiresAt: expiresAt.toISOString(),
        duration: options.duration || this.DEFAULT_SESSION_DURATION,
      });

      return {
        success: true,
        sessionId: ensuredSessionId,
        expiresAt,
        securityLevel: "high",
        userMessage: `Secure signing session created. Valid for ${Math.round(
          (options.duration || this.DEFAULT_SESSION_DURATION) / 60000
        )} minutes.`,
      };
    } catch (error) {
      console.error(
        "🔐 RecoverySessionBridge: Session creation failed:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        userMessage:
          "Failed to create signing session. Please try again or contact support.",
      };
    }
  }

  /**
   * Check if recovery-based session creation is available for current user
   * @returns Promise<boolean>
   */
  async isRecoverySessionAvailable(): Promise<boolean> {
    try {
      // Check if user has encrypted nsec data available
      // This would typically check the current authenticated user's data
      return true; // For now, assume it's available for authenticated users
    } catch (error) {
      console.error(
        "🔐 RecoverySessionBridge: Availability check failed:",
        error
      );
      return false;
    }
  }

  /**
   * Create a recovery session directly from an authenticated user object
   * Skips re-authentication and proceeds to decryption and session init
   */
  async createRecoverySessionFromUser(
    user: UserIdentity,
    options: RecoverySessionOptions = {}
  ): Promise<RecoverySessionResult> {
    try {
      console.log(
        "🔐 RecoverySessionBridge: STARTING session creation from user object"
      );

      // COMPREHENSIVE DEBUG: Log complete user object structure
      const userAny = user as any;
      console.log("🔐 RecoverySessionBridge: COMPREHENSIVE user analysis:", {
        // Basic user info
        userId: user?.id?.substring(0, 8) || "MISSING",
        nip05: userAny?.nip05 || "MISSING",
        username: userAny?.username || "MISSING",
        role: user?.role || "MISSING",

        // Critical encrypted credentials
        hasUserSalt: !!user?.user_salt,
        hasEncryptedNsec: !!userAny?.encrypted_nsec,
        hasEncryptedNsecIv: !!userAny?.encrypted_nsec_iv,
        hasNpub: !!userAny?.npub,

        // Field lengths for debugging
        userSaltLength: user?.user_salt?.length || 0,
        encryptedNsecLength: userAny?.encrypted_nsec?.length || 0,
        encryptedNsecIvLength: userAny?.encrypted_nsec_iv?.length || 0,
        npubLength: userAny?.npub?.length || 0,

        // Complete object structure
        availableUserFields: Object.keys(user || {}),
        userObjectType: typeof user,
        isUserNull: user === null,
        isUserUndefined: user === undefined,
      });

      // CRITICAL: Log sanitized field previews
      console.log("🔐 RecoverySessionBridge: Field previews:", {
        userSaltPreview: user?.user_salt
          ? `${user.user_salt.substring(0, 8)}...`
          : "MISSING",
        encryptedNsecPreview: userAny?.encrypted_nsec
          ? `${userAny.encrypted_nsec.substring(0, 8)}...`
          : "MISSING",
        npubPreview: userAny?.npub
          ? `${userAny.npub.substring(0, 8)}...`
          : "MISSING",
      });

      // Step 1: Ensure required fields are present (encrypted nsec + user salt)
      console.log(
        "🔐 RecoverySessionBridge: STEP 1 - Validating required fields"
      );
      const hasUserSalt = !!user?.user_salt;
      const hasEncryptedNsec = !!(user as any)?.encrypted_nsec;

      console.log("🔐 RecoverySessionBridge: Field validation results:", {
        hasUserSalt,
        hasEncryptedNsec,
        userSaltType: typeof user?.user_salt,
        encryptedNsecType: typeof (user as any)?.encrypted_nsec,
        userSaltTruthy: user?.user_salt ? "truthy" : "falsy",
        encryptedNsecTruthy: (user as any)?.encrypted_nsec ? "truthy" : "falsy",
      });

      if (!hasUserSalt || !hasEncryptedNsec) {
        console.error(
          "🔐 RecoverySessionBridge: CRITICAL - Missing required fields for session creation"
        );
        console.error(
          "🔐 RecoverySessionBridge: user_salt present:",
          hasUserSalt
        );
        console.error(
          "🔐 RecoverySessionBridge: encrypted_nsec present:",
          hasEncryptedNsec
        );
        console.error(
          "🔐 RecoverySessionBridge: This will prevent SecureNsecManager session creation"
        );

        return {
          success: false,
          error: "Missing encrypted nsec or user salt",
          userMessage:
            "Unable to access your private key. Please contact support if this persists.",
        };
      }

      console.log(
        "🔐 RecoverySessionBridge: ✅ Required fields validation passed"
      );

      // Step 2: Decrypt user's nsec using their salt
      console.log(
        "🔐 RecoverySessionBridge: STEP 2 - Starting nsec decryption"
      );
      console.log(
        "🔐 RecoverySessionBridge: Calling decryptUserNsec with user object..."
      );

      let nsecHex: string | null = null;
      try {
        nsecHex = await this.decryptUserNsec(user as any);
        console.log(
          "🔐 RecoverySessionBridge: decryptUserNsec completed, result:",
          {
            success: !!nsecHex,
            nsecLength: nsecHex?.length || 0,
            nsecType: typeof nsecHex,
            nsecPreview: nsecHex
              ? `${nsecHex.substring(0, 8)}...`
              : "NULL/EMPTY",
          }
        );
      } catch (decryptError) {
        console.error(
          "🔐 RecoverySessionBridge: CRITICAL - Nsec decryption threw exception:",
          {
            error:
              decryptError instanceof Error
                ? decryptError.message
                : String(decryptError),
            stack:
              decryptError instanceof Error
                ? decryptError.stack
                : "No stack trace",
          }
        );
        return {
          success: false,
          error: "Failed to decrypt nsec - exception thrown",
          userMessage:
            "Unable to access your private key. Please contact support if this persists.",
        };
      }

      if (!nsecHex) {
        console.error(
          "🔐 RecoverySessionBridge: CRITICAL - Nsec decryption returned null/empty"
        );
        console.error(
          "🔐 RecoverySessionBridge: This will prevent SecureNsecManager session creation"
        );
        return {
          success: false,
          error: "Failed to decrypt nsec",
          userMessage:
            "Unable to access your private key. Please contact support if this persists.",
        };
      }

      console.log(
        "🔐 RecoverySessionBridge: ✅ Nsec decryption successful, length:",
        nsecHex.length
      );

      // Step 3: Create temporary session
      console.log(
        "🔐 RecoverySessionBridge: STEP 3 - Creating SecureNsecManager session"
      );
      let sessionId: string | null = null;
      try {
        console.log(
          "🔐 RecoverySessionBridge: Loading user signing preferences..."
        );
        const prefs = await userSigningPreferences.getUserPreferences();
        const enableTimeout = prefs?.sessionLifetimeMode === "timed";
        const duration = enableTimeout
          ? (prefs?.sessionDurationMinutes ?? 15) * 60 * 1000
          : 365 * 24 * 60 * 60 * 1000; // effectively tab-lifetime
        const maxOps =
          prefs?.maxOperationsPerSession ?? this.DEFAULT_MAX_OPERATIONS;
        const browserLifetime = !enableTimeout;

        console.log("🔐 RecoverySessionBridge: Session configuration loaded:", {
          duration,
          maxOps,
          browserLifetime,
          prefsLoaded: !!prefs,
          sessionDurationMinutes: prefs?.sessionDurationMinutes,
          maxOperationsPerSession: prefs?.maxOperationsPerSession,
          sessionLifetimeMode: prefs?.sessionLifetimeMode,
        });

        console.log(
          "🔐 RecoverySessionBridge: Calling nsecSessionBridge.initializeAfterAuth..."
        );
        console.log(
          "🔐 RecoverySessionBridge: nsecHex length:",
          nsecHex.length
        );
        console.log(
          "🔐 RecoverySessionBridge: nsecSessionBridge available:",
          !!nsecSessionBridge
        );

        sessionId = await nsecSessionBridge.initializeAfterAuth(nsecHex, {
          duration,
          maxOperations: maxOps,
          browserLifetime,
        } as any);

        console.log(
          "🔐 RecoverySessionBridge: nsecSessionBridge.initializeAfterAuth completed:",
          {
            sessionId,
            sessionIdType: typeof sessionId,
            sessionIdLength: sessionId?.length || 0,
            success: !!sessionId,
          }
        );

        if (!sessionId) {
          console.error(
            "🔐 RecoverySessionBridge: CRITICAL - nsecSessionBridge.initializeAfterAuth returned null/empty"
          );
          throw new Error(
            "No session created - initializeAfterAuth returned null"
          );
        }

        console.log(
          "🔐 RecoverySessionBridge: ✅ Session creation successful, sessionId:",
          sessionId
        );
      } catch (e) {
        console.warn(
          "🔐 RecoverySessionBridge: User preferences failed, using defaults:",
          e
        );
        console.log("🔐 RecoverySessionBridge: Fallback session config:", {
          duration: options.duration || this.DEFAULT_SESSION_DURATION,
          maxOperations: options.maxOperations || this.DEFAULT_MAX_OPERATIONS,
        });

        sessionId = await nsecSessionBridge.initializeAfterAuth(nsecHex, {
          duration: options.duration ?? 365 * 24 * 60 * 60 * 1000,
          maxOperations: options.maxOperations || this.DEFAULT_MAX_OPERATIONS,
          browserLifetime: true,
        });

        console.log(
          "🔐 RecoverySessionBridge: Fallback nsecSessionBridge.initializeAfterAuth result:",
          sessionId
        );
      }

      const ensuredSessionId = sessionId;
      if (!ensuredSessionId) {
        console.error(
          "🔐 RecoverySessionBridge: Session creation failed - no session ID returned"
        );
        return {
          success: false,
          error: "Failed to create session",
          userMessage: "Unable to create signing session. Please try again.",
        };
      }

      console.log(
        "🔐 RecoverySessionBridge: Session created successfully:",
        ensuredSessionId
      );

      const expiresAt = new Date(
        Date.now() + (options.duration || this.DEFAULT_SESSION_DURATION)
      );

      return {
        success: true,
        sessionId: ensuredSessionId,
        expiresAt,
        securityLevel: "high",
        userMessage: `Secure signing session created. Valid for ${Math.round(
          (options.duration || this.DEFAULT_SESSION_DURATION) / 60000
        )} minutes.`,
      };
    } catch (error) {
      console.error(
        "🔐 RecoverySessionBridge: Session creation from user failed:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        userMessage:
          "Failed to create signing session. Please try again or contact support.",
      };
    }
  }

  /**
   * Get current recovery session status
   * @returns Session status information
   */
  getRecoverySessionStatus(): {
    hasSession: boolean;
    sessionId: string | null;
    canSign: boolean;
    createdViaRecovery: boolean;
  } {
    const sessionStatus = nsecSessionBridge.getSessionStatus();

    return {
      ...sessionStatus,
      createdViaRecovery: true, // Mark sessions created via recovery
    };
  }

  /**
   * Authenticate user for recovery session creation
   * @private
   */
  private async authenticateForRecovery(credentials: {
    nip05: string;
    password: string;
  }) {
    try {
      // Use NIP-05/password authentication only
      return await userIdentitiesAuth.authenticateNIP05Password({
        nip05: credentials.nip05,
        password: credentials.password,
      });
    } catch (error) {
      console.error("🔐 RecoverySessionBridge: Authentication failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Authentication failed",
      };
    }
  }

  /**
   * Decrypt user's nsec using their salt
   * @private
   */
  private async decryptUserNsec(user: any): Promise<string | null> {
    try {
      console.log(
        "🔐 RecoverySessionBridge.decryptUserNsec: Starting nsec decryption"
      );
      console.log(
        "🔐 RecoverySessionBridge.decryptUserNsec: User object keys:",
        Object.keys(user || {})
      );
      console.log(
        "🔐 RecoverySessionBridge.decryptUserNsec: Has encrypted_nsec:",
        !!user?.encrypted_nsec
      );
      console.log(
        "🔐 RecoverySessionBridge.decryptUserNsec: Has user_salt:",
        !!user?.user_salt
      );

      if (user.encrypted_nsec && user.user_salt) {
        console.log(
          "🔐 RecoverySessionBridge.decryptUserNsec: encrypted_nsec type:",
          typeof user.encrypted_nsec
        );
        console.log(
          "🔐 RecoverySessionBridge.decryptUserNsec: encrypted_nsec length:",
          user.encrypted_nsec?.length
        );
        console.log(
          "🔐 RecoverySessionBridge.decryptUserNsec: encrypted_nsec first 50 chars:",
          user.encrypted_nsec?.substring(0, 50)
        );
        console.log(
          "🔐 RecoverySessionBridge.decryptUserNsec: user_salt type:",
          typeof user.user_salt
        );
        console.log(
          "🔐 RecoverySessionBridge.decryptUserNsec: user_salt length:",
          user.user_salt?.length
        );

        const { decryptNsecSimple } = await import("../privacy/encryption");
        console.log(
          "🔐 RecoverySessionBridge.decryptUserNsec: Calling decryptNsecSimple..."
        );

        const decrypted = await decryptNsecSimple(
          user.encrypted_nsec,
          user.user_salt
        );

        console.log(
          "🔐 RecoverySessionBridge.decryptUserNsec: Decryption successful"
        );
        console.log(
          "🔐 RecoverySessionBridge.decryptUserNsec: Decrypted result length:",
          decrypted?.length
        );
        console.log(
          "🔐 RecoverySessionBridge.decryptUserNsec: Decrypted starts with 'nsec':",
          decrypted?.startsWith("nsec")
        );

        return decrypted; // bech32 nsec likely
      }

      console.error(
        "🔐 RecoverySessionBridge: Missing encrypted nsec or user salt"
      );
      console.error(
        "🔐 RecoverySessionBridge: encrypted_nsec:",
        user?.encrypted_nsec
      );
      console.error("🔐 RecoverySessionBridge: user_salt:", user?.user_salt);
      return null;
    } catch (error) {
      console.error("🔐 RecoverySessionBridge: Nsec decryption failed:", error);
      return null;
    }
  }

  /**
   * Clear any active recovery session
   */
  clearRecoverySession(): void {
    console.log("🔐 RecoverySessionBridge: Clearing recovery session");
    nsecSessionBridge.clearSession();
  }

  /**
   * Extend current recovery session duration
   * @param additionalMs - Additional milliseconds to extend
   * @returns boolean indicating success
   */
  extendRecoverySession(additionalMs: number = 15 * 60 * 1000): boolean {
    console.log("🔐 RecoverySessionBridge: Extending recovery session");
    return nsecSessionBridge.extendSession(additionalMs);
  }
}

// Global instance for easy access
export const recoverySessionBridge = RecoverySessionBridge.getInstance();

/**
 * Helper function to create recovery session with credentials
 */
export async function createRecoverySession(
  credentials: { nip05: string; password: string },
  options?: RecoverySessionOptions
): Promise<RecoverySessionResult> {
  return await recoverySessionBridge.createSessionFromRecovery(
    credentials,
    options
  );
}

/**
 * Helper function to check if recovery session is available
 */
export async function isRecoverySessionAvailable(): Promise<boolean> {
  return await recoverySessionBridge.isRecoverySessionAvailable();
}

export default RecoverySessionBridge;
