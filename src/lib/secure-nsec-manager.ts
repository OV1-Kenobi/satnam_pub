/**
 * Secure Nsec Manager for Post-Registration Peer Invitations
 *
 * Handles temporary nsec retention AFTER successful Identity Forge completion:
 * - Works after standard registration and database storage is complete
 * - Maintains short-term memory persistence for immediate peer invitations
 * - Never stores nsec in localStorage or sessionStorage
 * - Implements session timeout for temporary nsec retention
 * - Provides secure memory cleanup after operations
 * - Supports batch operations while nsec is available in memory
 * - Preserves existing Identity Forge architecture and completion flow
 */

interface TemporaryNsecSession {
  nsecHex: string;
  createdAt: number;
  expiresAt: number;
  sessionId: string;
  operationCount: number;
  maxOperations: number;
}

interface SecureMemoryTarget {
  data: string | Uint8Array;
  type: "string" | "uint8array";
}

class SecureNsecManager {
  private static instance: SecureNsecManager | null = null;
  private temporarySession: TemporaryNsecSession | null = null;
  private cleanupTimer: number | null = null;
  private readonly MAX_SESSION_DURATION = 10 * 60 * 1000; // 10 minutes
  private readonly MAX_OPERATIONS = 50; // Maximum operations per session

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): SecureNsecManager {
    if (!SecureNsecManager.instance) {
      SecureNsecManager.instance = new SecureNsecManager();
    }
    return SecureNsecManager.instance;
  }

  /**
   * Create a post-registration nsec session for immediate peer invitations
   * This method is called AFTER Identity Forge completion and database storage
   * @param nsecHex - The nsec in hex format (retained from registration)
   * @param maxDurationMs - Maximum session duration (default: 10 minutes)
   * @returns Session ID for tracking
   */
  async createPostRegistrationSession(
    nsecInput: string,
    maxDurationMs?: number
  ): Promise<string> {
    return await this.createTemporarySession(nsecInput, maxDurationMs);
  }

  /**
   * Create a temporary nsec session (internal method)
   * @param nsecHex - The temporary nsec in hex format
   * @param maxDurationMs - Maximum session duration (default: 10 minutes)
   * @returns Session ID for tracking
   */
  private async createTemporarySession(
    nsecInput: string,
    maxDurationMs?: number
  ): Promise<string> {
    // Convert nsec to hex format if needed
    let nsecHex: string;

    if (/^nsec1/i.test(nsecInput)) {
      // Convert bech32 nsec to hex format
      try {
        const { nip19 } = await import("nostr-tools");
        const decoded = nip19.decode(nsecInput);
        if (decoded.type !== "nsec") {
          throw new Error("Invalid nsec bech32 type");
        }
        const data = decoded.data as unknown;
        nsecHex =
          typeof data === "string"
            ? data
            : Array.from(data as Uint8Array)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
      } catch (error) {
        throw new Error("Invalid nsec bech32 format");
      }
    } else if (/^[0-9a-fA-F]{64}$/.test(nsecInput)) {
      // Already in hex format
      nsecHex = nsecInput.toLowerCase();
    } else {
      throw new Error(
        "Invalid nsec format - must be bech32 (nsec1...) or 64-character hex"
      );
    }

    // Clear any existing session
    this.clearTemporarySession();

    const sessionId = `nsec-session-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 11)}`;
    const duration = maxDurationMs || this.MAX_SESSION_DURATION;
    const now = Date.now();

    this.temporarySession = {
      nsecHex,
      createdAt: now,
      expiresAt: now + duration,
      sessionId,
      operationCount: 0,
      maxOperations: this.MAX_OPERATIONS,
    };

    // Set automatic cleanup timer
    this.cleanupTimer = window.setTimeout(() => {
      this.clearTemporarySession();
    }, duration);

    return sessionId;
  }

  /**
   * Get the temporary nsec for signing operations
   * @param sessionId - Session ID to validate
   * @returns Nsec hex string or null if session invalid/expired
   */
  getTemporaryNsec(sessionId: string): string | null {
    if (
      !this.temporarySession ||
      this.temporarySession.sessionId !== sessionId
    ) {
      return null;
    }

    const now = Date.now();

    // Check expiration
    if (now > this.temporarySession.expiresAt) {
      this.clearTemporarySession();
      return null;
    }

    // Check operation limit
    if (
      this.temporarySession.operationCount >=
      this.temporarySession.maxOperations
    ) {
      console.warn("⚠️ Temporary nsec session operation limit reached");
      this.clearTemporarySession();
      return null;
    }

    // Increment operation count
    this.temporarySession.operationCount++;

    return this.temporarySession.nsecHex;
  }

  /**
   * Check if a temporary session is active and valid
   * @param sessionId - Session ID to check
   * @returns Session status information
   */
  getSessionStatus(sessionId?: string): {
    active: boolean;
    remainingTime?: number;
    remainingOperations?: number;
    sessionId?: string;
  } {
    if (!this.temporarySession) {
      return { active: false };
    }

    if (sessionId && this.temporarySession.sessionId !== sessionId) {
      return { active: false };
    }

    const now = Date.now();
    const expired = now > this.temporarySession.expiresAt;
    const operationsExceeded =
      this.temporarySession.operationCount >=
      this.temporarySession.maxOperations;

    if (expired || operationsExceeded) {
      this.clearTemporarySession();
      return { active: false };
    }

    return {
      active: true,
      remainingTime: this.temporarySession.expiresAt - now,
      remainingOperations:
        this.temporarySession.maxOperations -
        this.temporarySession.operationCount,
      sessionId: this.temporarySession.sessionId,
    };
  }

  /**
   * Extend the current session duration
   * @param additionalMs - Additional milliseconds to extend
   * @returns Success status
   */
  extendSession(additionalMs: number): boolean {
    if (!this.temporarySession) {
      return false;
    }

    const now = Date.now();
    if (now > this.temporarySession.expiresAt) {
      this.clearTemporarySession();
      return false;
    }

    // Extend expiration time
    this.temporarySession.expiresAt += additionalMs;

    // Update cleanup timer
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
    }

    this.cleanupTimer = window.setTimeout(() => {
      this.clearTemporarySession();
    }, this.temporarySession.expiresAt - now);

    return true;
  }

  /**
   * Clear the temporary session and secure memory cleanup
   */
  clearTemporarySession(): void {
    if (this.temporarySession) {
      // Secure memory cleanup
      this.secureWipe([
        {
          data: this.temporarySession.nsecHex,
          type: "string",
        },
      ]);

      this.temporarySession = null;
    }

    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Perform secure memory wipe of sensitive data
   * @param targets - Array of memory targets to wipe
   */
  secureWipe(targets: SecureMemoryTarget[]): void {
    for (const target of targets) {
      try {
        if (target.type === "string" && typeof target.data === "string") {
          // For strings, we can't actually overwrite the memory in JavaScript
          // but we can at least clear the reference and hope GC handles it
          target.data = "";
        } else if (
          target.type === "uint8array" &&
          target.data instanceof Uint8Array
        ) {
          // For Uint8Arrays, we can actually zero out the memory
          target.data.fill(0);
        }
      } catch (error) {
        console.warn("Failed to securely wipe memory target:", error);
      }
    }
  }

  /**
   * Use temporary nsec for a specific operation with automatic cleanup
   * @param sessionId - Session ID
   * @param operation - Operation to perform with the nsec
   * @returns Operation result
   */
  async useTemporaryNsec<T>(
    sessionId: string,
    operation: (nsecHex: string) => Promise<T>
  ): Promise<T> {
    const nsecHex = this.getTemporaryNsec(sessionId);
    if (!nsecHex) {
      throw new Error("Temporary nsec session not available or expired");
    }

    try {
      const result = await operation(nsecHex);
      return result;
    } finally {
      // Note: We don't clear the session here as it might be used for multiple operations
      // The session will be cleared by timeout or manual cleanup
    }
  }

  /**
   * Create multiple invitations in batch while nsec is available
   * @param sessionId - Session ID
   * @param invitationConfigs - Array of invitation configurations
   * @param createInvitation - Function to create a single invitation
   * @returns Array of invitation results
   */
  async createBatchInvitations<T, R>(
    sessionId: string,
    invitationConfigs: T[],
    createInvitation: (config: T, nsecHex: string) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];

    for (const config of invitationConfigs) {
      const nsecHex = this.getTemporaryNsec(sessionId);
      if (!nsecHex) {
        throw new Error(
          `Temporary nsec session expired during batch operation (completed ${results.length}/${invitationConfigs.length})`
        );
      }

      try {
        const result = await createInvitation(config, nsecHex);
        results.push(result);
      } catch (error) {
        console.error("Batch invitation creation failed:", error);
        // Continue with remaining invitations
        results.push({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        } as R);
      }
    }

    return results;
  }

  /**
   * Get remaining session time in human-readable format
   * @param sessionId - Session ID
   * @returns Formatted time string
   */
  getFormattedRemainingTime(sessionId?: string): string {
    const status = this.getSessionStatus(sessionId);
    if (!status.active || !status.remainingTime) {
      return "Session expired";
    }

    const minutes = Math.floor(status.remainingTime / 60000);
    const seconds = Math.floor((status.remainingTime % 60000) / 1000);

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Cleanup on page unload or component unmount
   */
  cleanup(): void {
    this.clearTemporarySession();
  }
}

// Export singleton instance
export const secureNsecManager = SecureNsecManager.getInstance();

// Cleanup on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    secureNsecManager.cleanup();
  });
}

export default secureNsecManager;
