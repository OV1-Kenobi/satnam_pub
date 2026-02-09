/**
 * Ephemeral Secret Cleanup Utility
 *
 * SECURITY: Zero-knowledge secret lifecycle management for onboarding
 * - Secure memory cleanup after backup step
 * - Audit trail of secret lifecycle events
 * - Best-effort browser memory cleanup
 * - Integration with existing PrivacyUtils.secureClearMemory()
 *
 * @module secret-cleanup
 */

import {
  secureClearMemory,
  type SecureMemoryTarget,
} from "../privacy/encryption";

/**
 * Secret types tracked in onboarding lifecycle
 */
export type SecretType = "nsec" | "keet_seed" | "password" | "otp";

/**
 * Secret lifecycle actions for audit trail
 */
export type SecretLifecycleAction =
  | "generated"
  | "encrypted"
  | "decrypted"
  | "displayed"
  | "copied"
  | "cleared"
  | "destroyed";

/**
 * Audit log entry for secret lifecycle tracking
 */
export interface SecretLifecycleAuditEntry {
  /** Type of secret (nsec, keet_seed, password, otp) */
  secretType: SecretType;
  /** Action performed on the secret */
  action: SecretLifecycleAction;
  /** Timestamp of the action (ISO 8601) */
  timestamp: string;
  /** Optional context (e.g., "5-minute timer expired", "user clicked Complete Backup") */
  context?: string;
  /** Participant ID for correlation */
  participantId?: string;
}

/**
 * SecretCleanupManager
 *
 * Manages secure cleanup of ephemeral secrets during onboarding.
 * Integrates with PrivacyUtils.secureClearMemory() for cryptographic memory wiping.
 *
 * SECURITY PRINCIPLES:
 * - All plaintext secrets are ephemeral (5-minute max lifetime)
 * - Memory is cryptographically overwritten before garbage collection
 * - Audit trail tracks secret lifecycle for security monitoring
 * - Best-effort browser GC triggering to minimize memory exposure
 */
export class SecretCleanupManager {
  private auditLog: SecretLifecycleAuditEntry[] = [];
  private participantId: string | null = null;

  constructor(participantId?: string) {
    this.participantId = participantId || null;
  }

  /**
   * Clear a single secret from memory
   *
   * @param secret - Secret to clear (string, Uint8Array, or ArrayBuffer)
   * @param secretType - Type of secret for audit trail
   * @param context - Optional context for audit log
   */
  clearSecret(
    secret: string | Uint8Array | ArrayBuffer | null,
    secretType: SecretType,
    context?: string,
  ): void {
    if (!secret) return;

    // Determine target type
    let targetType: "string" | "uint8array" | "arraybuffer";
    if (typeof secret === "string") {
      targetType = "string";
    } else if (secret instanceof Uint8Array) {
      targetType = "uint8array";
    } else {
      targetType = "arraybuffer";
    }

    // Use PrivacyUtils.secureClearMemory for cryptographic wiping
    const targets: SecureMemoryTarget[] = [{ data: secret, type: targetType }];
    secureClearMemory(targets);

    // Log cleanup action
    this.logSecretAction(secretType, "cleared", context);
  }

  /**
   * Clear multiple secrets at once
   *
   * @param secrets - Array of secrets with their types
   * @param context - Optional context for audit log
   */
  clearMultipleSecrets(
    secrets: Array<{
      secret: string | Uint8Array | ArrayBuffer | null;
      type: SecretType;
    }>,
    context?: string,
  ): void {
    const targets: SecureMemoryTarget[] = [];

    secrets.forEach(({ secret, type }) => {
      if (!secret) return;

      // Determine target type
      let targetType: "string" | "uint8array" | "arraybuffer";
      if (typeof secret === "string") {
        targetType = "string";
      } else if (secret instanceof Uint8Array) {
        targetType = "uint8array";
      } else {
        targetType = "arraybuffer";
      }

      targets.push({ data: secret, type: targetType });

      // Log cleanup action for each secret
      this.logSecretAction(type, "cleared", context);
    });

    // Batch cleanup using PrivacyUtils
    if (targets.length > 0) {
      secureClearMemory(targets);
    }
  }

  /**
   * Clear React state variables containing secrets
   *
   * @param setState - React setState function
   * @param sensitiveKeys - Array of state keys to clear
   */
  clearReactState(
    setState: React.Dispatch<React.SetStateAction<any>>,
    sensitiveKeys: string[],
  ): void {
    // Set all sensitive state variables to null
    setState((prevState: any) => {
      const newState = { ...prevState };
      sensitiveKeys.forEach((key) => {
        newState[key] = null;
      });
      return newState;
    });
  }

  /**
   * Trigger browser memory cleanup (best-effort)
   *
   * SECURITY NOTE: This is a best-effort operation. Modern browsers do not
   * expose direct garbage collection APIs for security reasons. This function
   * attempts to hint the browser to perform GC, but there are no guarantees.
   *
   * The primary security comes from cryptographic memory overwriting in
   * secureClearMemory(), not from GC timing.
   */
  triggerBrowserMemoryCleanup(): void {
    // Attempt to trigger GC if available (Chrome with --expose-gc flag)
    if (typeof window !== "undefined" && "gc" in window) {
      try {
        (window as any).gc();
      } catch (error) {
        // GC not available, silently continue
      }
    }

    // Create and immediately discard large objects to encourage GC
    // This is a heuristic approach with no guarantees
    try {
      const temp = new ArrayBuffer(1024 * 1024); // 1MB
      new Uint8Array(temp).fill(0);
    } catch (error) {
      // Memory allocation failed, silently continue
    }
  }

  /**
   * Log a secret lifecycle action to the audit trail
   *
   * @param secretType - Type of secret
   * @param action - Action performed
   * @param context - Optional context
   */
  logSecretAction(
    secretType: SecretType,
    action: SecretLifecycleAction,
    context?: string,
  ): void {
    const entry: SecretLifecycleAuditEntry = {
      secretType,
      action,
      timestamp: new Date().toISOString(),
      context,
      participantId: this.participantId || undefined,
    };

    this.auditLog.push(entry);

    // Log to console in development for debugging
    if (process.env.NODE_ENV === "development") {
      console.log("[SecretCleanup]", entry);
    }
  }

  /**
   * Get the audit log for this cleanup manager
   *
   * @returns Array of audit log entries
   */
  getAuditLog(): SecretLifecycleAuditEntry[] {
    return [...this.auditLog];
  }

  /**
   * Clear the audit log
   *
   * SECURITY NOTE: Only call this after the audit log has been persisted
   * to a secure location (e.g., server-side logging system).
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * Complete cleanup workflow for onboarding backup step
   *
   * This is a convenience method that performs all cleanup actions:
   * 1. Clear all secrets from memory
   * 2. Trigger browser GC (best-effort)
   * 3. Log completion to audit trail
   *
   * @param secrets - Array of secrets to clear
   * @param context - Optional context (e.g., "5-minute timer expired")
   */
  completeBackupCleanup(
    secrets: Array<{
      secret: string | Uint8Array | ArrayBuffer | null;
      type: SecretType;
    }>,
    context?: string,
  ): void {
    // Clear all secrets
    this.clearMultipleSecrets(secrets, context);

    // Trigger browser GC
    this.triggerBrowserMemoryCleanup();

    // Log completion
    this.logSecretAction(
      "nsec",
      "destroyed",
      `Backup cleanup complete: ${context || "manual"}`,
    );
  }
}

/**
 * Standalone utility functions for backward compatibility
 */

/**
 * Clear a single secret from memory (standalone function)
 *
 * @param secret - Secret to clear
 */
export function clearSecret(
  secret: string | Uint8Array | ArrayBuffer | null,
): void {
  if (!secret) return;

  let targetType: "string" | "uint8array" | "arraybuffer";
  if (typeof secret === "string") {
    targetType = "string";
  } else if (secret instanceof Uint8Array) {
    targetType = "uint8array";
  } else {
    targetType = "arraybuffer";
  }

  const targets: SecureMemoryTarget[] = [{ data: secret, type: targetType }];
  secureClearMemory(targets);
}

/**
 * Trigger browser memory cleanup (standalone function)
 */
export function triggerMemoryCleanup(): void {
  const manager = new SecretCleanupManager();
  manager.triggerBrowserMemoryCleanup();
}

/**
 * Create an audit log entry for secret lifecycle tracking
 *
 * @param secretType - Type of secret
 * @param action - Action performed
 * @param context - Optional context
 * @param participantId - Optional participant ID
 * @returns Audit log entry
 */
export function createSecretLifecycleAudit(
  secretType: SecretType,
  action: SecretLifecycleAction,
  context?: string,
  participantId?: string,
): SecretLifecycleAuditEntry {
  return {
    secretType,
    action,
    timestamp: new Date().toISOString(),
    context,
    participantId,
  };
}
