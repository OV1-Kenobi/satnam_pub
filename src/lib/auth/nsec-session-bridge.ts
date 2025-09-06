/**
 * NSEC Session Bridge
 *
 * Bridges the gap between JWT authentication and SecureNsecManager sessions.
 * This allows session-based signing to work after users authenticate via
 * NIP-05/password or other methods that don't automatically create nsec sessions.
 */

import { SecureNsecManager } from "../secure-nsec-manager";

export interface NSECSessionOptions {
  duration?: number; // Session duration in milliseconds
  maxOperations?: number; // Maximum operations per session
  browserLifetime?: boolean; // Disable cleanup timer, rely on browser lifecycle
}

export class NSECSessionBridge {
  private static instance: NSECSessionBridge | null = null;
  private nsecManager: SecureNsecManager;

  private constructor() {
    this.nsecManager = SecureNsecManager.getInstance();
  }

  static getInstance(): NSECSessionBridge {
    if (!NSECSessionBridge.instance) {
      NSECSessionBridge.instance = new NSECSessionBridge();
    }
    return NSECSessionBridge.instance;
  }

  /**
   * Initialize NSEC session after successful authentication
   * This should be called after JWT authentication succeeds
   * @param nsecHex - User's nsec in hex format (if available)
   * @param options - Session options
   * @returns Session ID if successful, null if failed
   */
  async initializeAfterAuth(
    nsecHex?: string,
    options?: NSECSessionOptions
  ): Promise<string | null> {
    try {
      if (!nsecHex) {
        console.log(
          "🔐 NSECSessionBridge: No nsec provided, session-based signing will not be available"
        );
        return null;
      }

      console.log(
        "🔐 NSECSessionBridge: Initializing NSEC session after authentication"
      );

      const sessionId = await (
        this.nsecManager as any
      ).createPostRegistrationSession(
        nsecHex,
        options?.duration || 15 * 60 * 1000, // 15 minutes default
        options?.maxOperations,
        options?.browserLifetime
      );

      console.log(
        "🔐 NSECSessionBridge: NSEC session created successfully:",
        sessionId
      );
      return sessionId;
    } catch (error) {
      console.error(
        "🔐 NSECSessionBridge: Failed to initialize NSEC session:",
        error
      );
      return null;
    }
  }

  /**
   * Check if there's an active NSEC session
   * @returns boolean indicating if session-based signing is available
   */
  hasActiveSession(): boolean {
    const sessionId = this.nsecManager.getActiveSessionId();
    const hasSession = !!sessionId;
    console.log(
      "🔐 NSECSessionBridge: Active session check:",
      hasSession ? "YES" : "NO"
    );
    return hasSession;
  }

  /**
   * Get the active session ID
   * @returns Session ID if active, null otherwise
   */
  getActiveSessionId(): string | null {
    return this.nsecManager.getActiveSessionId();
  }

  /**
   * Clear the current NSEC session
   */
  clearSession(): void {
    console.log("🔐 NSECSessionBridge: Clearing NSEC session");
    this.nsecManager.clearTemporarySession();
  }

  /**
   * Extend the current session duration
   * @param additionalMs - Additional milliseconds to extend
   * @returns boolean indicating success
   */
  extendSession(additionalMs: number = 15 * 60 * 1000): boolean {
    try {
      const sessionId = this.nsecManager.getActiveSessionId();
      if (!sessionId) {
        console.log("🔐 NSECSessionBridge: No active session to extend");
        return false;
      }

      // Note: SecureNsecManager doesn't have an extend method,
      // so we'd need to add that functionality or recreate the session
      console.log(
        "🔐 NSECSessionBridge: Session extension requested but not implemented"
      );
      return false;
    } catch (error) {
      console.error("🔐 NSECSessionBridge: Failed to extend session:", error);
      return false;
    }
  }

  /**
   * Get session status information
   * @returns Session status object
   */
  getSessionStatus(): {
    hasSession: boolean;
    sessionId: string | null;
    canSign: boolean;
  } {
    const sessionId = this.nsecManager.getActiveSessionId();
    const hasSession = !!sessionId;

    return {
      hasSession,
      sessionId,
      canSign: hasSession,
    };
  }
}

// Global instance for easy access
export const nsecSessionBridge = NSECSessionBridge.getInstance();

/**
 * Helper function to initialize NSEC session after authentication
 * This can be called from authentication success handlers
 */
export async function initializeNSECSessionAfterAuth(
  nsecHex?: string,
  options?: NSECSessionOptions
): Promise<string | null> {
  return await nsecSessionBridge.initializeAfterAuth(nsecHex, options);
}

/**
 * Helper function to check if session-based signing is available
 */
export function isSessionBasedSigningAvailable(): boolean {
  return nsecSessionBridge.hasActiveSession();
}

export default NSECSessionBridge;
