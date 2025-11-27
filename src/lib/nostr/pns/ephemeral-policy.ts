/**
 * Ephemeral Note Policy Layer
 *
 * Manages time-limited PNS notes with automatic expiration and cleanup.
 * Handles scheduling, cancellation, and batch cleanup of expired notes.
 *
 * Features:
 * - TTL-based note expiration with automatic cleanup
 * - Browser visibility-aware timer management
 * - Periodic background cleanup for missed expirations
 * - Relay deletion (kind 5) or local-only deletion options
 *
 * @module src/lib/nostr/pns/ephemeral-policy
 */

import type { EphemeralPolicy } from "../../noise/types";
import { EPHEMERAL_TTL_PRESETS } from "../../noise/types";
import type { ParsedPnsNote } from "./pns-service";

// =============================================================================
// Constants
// =============================================================================

/** Minimum TTL in milliseconds (5 minutes) */
const MIN_TTL_MS = 5 * 60 * 1000;

/** Maximum TTL in milliseconds (1 year) */
const MAX_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** Background cleanup interval (5 minutes) */
const BACKGROUND_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Retry delay for failed deletions (30 seconds) */
const RETRY_DELAY_MS = 30 * 1000;

/** Maximum retry attempts for failed deletions */
const MAX_RETRY_ATTEMPTS = 3;

// =============================================================================
// Types
// =============================================================================

/**
 * Handle for managing a scheduled cleanup timer.
 */
export interface CleanupHandle {
  /** Note ID being tracked */
  noteId: string;
  /** Internal timer ID */
  timerId: ReturnType<typeof setTimeout>;
  /** Expiration timestamp (ms since epoch) */
  expiresAt: number;
  /** Original policy (for background cleanup to respect deleteFromRelays) */
  policy: EphemeralPolicy;
  /** Original expiry callback (preserved during pause/resume) */
  onExpire: (noteId: string) => Promise<void>;
  /** Cancel this cleanup */
  cancel: () => void;
}

/**
 * Options for creating an ephemeral policy.
 */
export interface EphemeralPolicyOptions {
  /** Time-to-live in milliseconds */
  ttlMs: number;
  /** Whether to delete from relays on expiry (default: true) */
  deleteFromRelays?: boolean;
  /** Base timestamp for expiration calculation (default: Date.now()) */
  createdAt?: number;
}

/**
 * Callback for note deletion.
 */
export type DeleteCallback = (
  noteId: string,
  eventId?: string
) => Promise<void>;

/**
 * Cleanup statistics from batch cleanup.
 */
export interface CleanupStats {
  /** Number of notes successfully cleaned */
  cleaned: number;
  /** Number of notes that failed cleanup */
  failed: number;
  /** IDs of notes that failed */
  failedIds: string[];
}

// =============================================================================
// Ephemeral Policy Manager Class
// =============================================================================

/**
 * Manages ephemeral note policies and cleanup scheduling.
 *
 * Singleton pattern - use EphemeralPolicyManager.getInstance().
 *
 * @example
 * ```typescript
 * const manager = EphemeralPolicyManager.getInstance();
 *
 * // Create a policy for 24-hour expiration
 * const policy = manager.createPolicy({ ttlMs: 24 * 60 * 60 * 1000 });
 *
 * // Schedule cleanup
 * const handle = manager.scheduleCleanup(noteId, policy, async (id) => {
 *   await pnsService.deleteNote(id);
 * });
 *
 * // Later, cancel if needed
 * handle.cancel();
 * ```
 */
export class EphemeralPolicyManager {
  private static instance: EphemeralPolicyManager | null = null;

  /** Active cleanup handles by note ID */
  private cleanupHandles: Map<string, CleanupHandle> = new Map();

  /** Background cleanup interval ID */
  private backgroundIntervalId: ReturnType<typeof setInterval> | null = null;

  /** Whether timers are paused (tab hidden) */
  private isPaused = false;

  /** Paused timers waiting to be resumed */
  private pausedTimers: Map<
    string,
    {
      remainingMs: number;
      policy: EphemeralPolicy;
      onExpire: (noteId: string) => Promise<void>;
    }
  > = new Map();

  /** Visibility change handler reference */
  private visibilityHandler: (() => void) | null = null;

  /** Delete callback for background cleanup */
  private deleteCallback: DeleteCallback | null = null;

  private constructor() {}

  // ===========================================================================
  // Singleton
  // ===========================================================================

  static getInstance(): EphemeralPolicyManager {
    if (!EphemeralPolicyManager.instance) {
      EphemeralPolicyManager.instance = new EphemeralPolicyManager();
    }
    return EphemeralPolicyManager.instance;
  }

  static resetInstance(): void {
    if (EphemeralPolicyManager.instance) {
      EphemeralPolicyManager.instance.shutdown();
      EphemeralPolicyManager.instance = null;
    }
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the ephemeral policy manager.
   *
   * Sets up visibility change listeners and background cleanup.
   *
   * @param deleteCallback - Callback for deleting expired notes
   */
  initialize(deleteCallback: DeleteCallback): void {
    this.deleteCallback = deleteCallback;

    // Set up visibility change handler
    if (typeof document !== "undefined") {
      this.visibilityHandler = () => this.handleVisibilityChange();
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }

    // Start background cleanup interval
    this.startBackgroundCleanup();
  }

  /**
   * Shutdown the manager and clean up all resources.
   */
  shutdown(): void {
    // Cancel all scheduled cleanups
    for (const handle of this.cleanupHandles.values()) {
      clearTimeout(handle.timerId);
    }
    this.cleanupHandles.clear();
    this.pausedTimers.clear();

    // Stop background cleanup
    if (this.backgroundIntervalId !== null) {
      clearInterval(this.backgroundIntervalId);
      this.backgroundIntervalId = null;
    }

    // Remove visibility listener
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }

    this.deleteCallback = null;
    this.isPaused = false;
  }

  // ===========================================================================
  // Policy Creation
  // ===========================================================================

  /**
   * Create an ephemeral policy with the specified TTL.
   *
   * @param options - Policy options
   * @returns EphemeralPolicy object
   * @throws Error if TTL is out of valid range
   */
  createPolicy(options: EphemeralPolicyOptions): EphemeralPolicy {
    const { ttlMs, deleteFromRelays = true, createdAt = Date.now() } = options;

    // Validate TTL
    if (ttlMs < MIN_TTL_MS) {
      throw new Error(`TTL must be at least ${MIN_TTL_MS}ms (5 minutes)`);
    }
    if (ttlMs > MAX_TTL_MS) {
      throw new Error(`TTL cannot exceed ${MAX_TTL_MS}ms (1 year)`);
    }

    // Convert to seconds for the EphemeralPolicy type
    const ttlSeconds = Math.floor(ttlMs / 1000);

    return {
      isEphemeral: true,
      ttlSeconds,
      expiresAt: createdAt + ttlMs,
      deleteFromRelays,
    };
  }

  /**
   * Create an ephemeral policy using a preset TTL.
   *
   * @param preset - Preset name from EPHEMERAL_TTL_PRESETS
   * @param deleteFromRelays - Whether to delete from relays on expiry
   * @returns EphemeralPolicy object
   */
  createPolicyFromPreset(
    preset: keyof typeof EPHEMERAL_TTL_PRESETS,
    deleteFromRelays = true
  ): EphemeralPolicy {
    const ttlSeconds = EPHEMERAL_TTL_PRESETS[preset];
    return this.createPolicy({
      ttlMs: ttlSeconds * 1000,
      deleteFromRelays,
    });
  }

  // ===========================================================================
  // Expiration Checks
  // ===========================================================================

  /**
   * Check if a note has expired based on its policy.
   *
   * @param policy - The ephemeral policy to check
   * @returns true if expired, false otherwise
   */
  isExpired(policy: EphemeralPolicy): boolean {
    if (!policy.isEphemeral || !policy.expiresAt) {
      return false;
    }
    return Date.now() >= policy.expiresAt;
  }

  /**
   * Get remaining time until expiry in milliseconds.
   *
   * @param policy - The ephemeral policy to check
   * @returns Remaining time in ms, or 0 if expired, or Infinity if not ephemeral
   */
  getTimeUntilExpiry(policy: EphemeralPolicy): number {
    if (!policy.isEphemeral || !policy.expiresAt) {
      return Infinity;
    }
    const remaining = policy.expiresAt - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Check if a note's policy will expire soon (within threshold).
   *
   * @param policy - The ephemeral policy to check
   * @param thresholdMs - Time threshold in milliseconds
   * @returns true if expiring within threshold
   */
  isExpiringSoon(policy: EphemeralPolicy, thresholdMs: number): boolean {
    const remaining = this.getTimeUntilExpiry(policy);
    return remaining !== Infinity && remaining <= thresholdMs;
  }

  // ===========================================================================
  // Cleanup Scheduling
  // ===========================================================================

  /**
   * Schedule automatic cleanup when a note expires.
   *
   * @param noteId - Note identifier
   * @param policy - Ephemeral policy
   * @param onExpire - Callback to execute on expiry
   * @returns CleanupHandle for managing the scheduled cleanup
   */
  scheduleCleanup(
    noteId: string,
    policy: EphemeralPolicy,
    onExpire: (noteId: string) => Promise<void>
  ): CleanupHandle {
    // Cancel any existing cleanup for this note
    this.cancelCleanup(noteId);

    const timeUntilExpiry = this.getTimeUntilExpiry(policy);

    if (timeUntilExpiry === 0) {
      // Already expired, execute immediately
      void onExpire(noteId);
      // Return a no-op handle
      return {
        noteId,
        timerId: setTimeout(() => {}, 0),
        expiresAt: policy.expiresAt ?? Date.now(),
        policy,
        onExpire,
        cancel: () => {},
      };
    }

    if (timeUntilExpiry === Infinity) {
      // Not ephemeral, return a no-op handle
      return {
        noteId,
        timerId: setTimeout(() => {}, 0),
        expiresAt: Infinity,
        policy,
        onExpire,
        cancel: () => {},
      };
    }

    // Schedule the cleanup
    const callback = async () => {
      this.cleanupHandles.delete(noteId);
      try {
        await onExpire(noteId);
      } catch {
        // Log error but don't throw - cleanup should be fire-and-forget
        console.error(`Failed to clean up expired note: ${noteId}`);
      }
    };

    const timerId = setTimeout(() => void callback(), timeUntilExpiry);

    const handle: CleanupHandle = {
      noteId,
      timerId,
      expiresAt: policy.expiresAt ?? Date.now() + timeUntilExpiry,
      policy,
      onExpire,
      cancel: () => this.cancelCleanup(noteId),
    };

    this.cleanupHandles.set(noteId, handle);
    return handle;
  }

  /**
   * Cancel a scheduled cleanup by note ID.
   *
   * @param noteId - Note identifier to cancel cleanup for
   */
  cancelCleanup(noteId: string): void {
    const handle = this.cleanupHandles.get(noteId);
    if (handle) {
      clearTimeout(handle.timerId);
      this.cleanupHandles.delete(noteId);
    }
    // Also remove from paused timers if present
    this.pausedTimers.delete(noteId);
  }

  /**
   * Cancel all scheduled cleanups.
   */
  cancelAllCleanups(): void {
    for (const handle of this.cleanupHandles.values()) {
      clearTimeout(handle.timerId);
    }
    this.cleanupHandles.clear();
    this.pausedTimers.clear();
  }

  /**
   * Get all active cleanup handles.
   */
  getActiveCleanups(): ReadonlyMap<string, CleanupHandle> {
    return this.cleanupHandles;
  }

  /**
   * Check if a cleanup is scheduled for a note.
   */
  hasScheduledCleanup(noteId: string): boolean {
    return this.cleanupHandles.has(noteId);
  }

  // ===========================================================================
  // Batch Cleanup
  // ===========================================================================

  /**
   * Clean up all expired notes from a list.
   *
   * @param notes - Array of parsed notes to check
   * @param deleteCallback - Callback to delete each expired note
   * @returns Cleanup statistics
   */
  async cleanupExpiredNotes(
    notes: ParsedPnsNote[],
    deleteCallback: DeleteCallback
  ): Promise<CleanupStats> {
    const stats: CleanupStats = {
      cleaned: 0,
      failed: 0,
      failedIds: [],
    };

    for (const note of notes) {
      if (!note.metadata.ephemeralPolicy) continue;
      if (!this.isExpired(note.metadata.ephemeralPolicy)) continue;
      if (note.isDeleted) continue; // Already deleted

      try {
        await this.deleteWithRetry(
          note.noteId,
          note.eventId,
          deleteCallback,
          note.metadata.ephemeralPolicy.deleteFromRelays
        );
        stats.cleaned++;
      } catch {
        stats.failed++;
        stats.failedIds.push(note.noteId);
      }
    }

    return stats;
  }

  /**
   * Delete a note with retry logic.
   */
  private async deleteWithRetry(
    noteId: string,
    eventId: string | undefined,
    deleteCallback: DeleteCallback,
    deleteFromRelays = true
  ): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        if (deleteFromRelays) {
          await deleteCallback(noteId, eventId);
        } else {
          await deleteCallback(noteId); // Local only
        }
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_RETRY_ATTEMPTS - 1) {
          await this.delay(RETRY_DELAY_MS);
        }
      }
    }

    throw lastError;
  }

  /**
   * Delay helper for retry logic.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ===========================================================================
  // Background Cleanup
  // ===========================================================================

  /**
   * Start the background cleanup interval.
   */
  private startBackgroundCleanup(): void {
    if (this.backgroundIntervalId !== null) return;

    this.backgroundIntervalId = setInterval(() => {
      void this.runBackgroundCleanup();
    }, BACKGROUND_CLEANUP_INTERVAL_MS);
  }

  /**
   * Run background cleanup of expired notes.
   * Uses the stored onExpire callback and respects deleteFromRelays policy.
   */
  private async runBackgroundCleanup(): Promise<void> {
    const now = Date.now();

    // Check all active handles for any that should have expired
    for (const [noteId, handle] of this.cleanupHandles) {
      if (handle.expiresAt <= now) {
        // This should have been cleaned up by the timer, but wasn't
        // (possibly due to browser sleep or system time change)
        this.cleanupHandles.delete(noteId);
        try {
          // Use the stored onExpire callback which respects the original policy
          // This ensures deleteFromRelays setting is honored
          await handle.onExpire(noteId);
        } catch {
          // Ignore errors in background cleanup
        }
      }
    }
  }

  // ===========================================================================
  // Visibility Handling
  // ===========================================================================

  /**
   * Handle browser visibility change events.
   */
  private handleVisibilityChange(): void {
    if (typeof document === "undefined") return;

    if (document.hidden) {
      this.pauseTimers();
    } else {
      this.resumeTimers();
    }
  }

  /**
   * Pause all cleanup timers (when tab is hidden).
   * Preserves the original policy and onExpire callback for proper resumption.
   */
  private pauseTimers(): void {
    if (this.isPaused) return;
    this.isPaused = true;

    const now = Date.now();

    for (const [noteId, handle] of this.cleanupHandles) {
      clearTimeout(handle.timerId);
      const remainingMs = Math.max(0, handle.expiresAt - now);

      // Store remaining time, policy, and original callback for resumption
      this.pausedTimers.set(noteId, {
        remainingMs,
        policy: handle.policy,
        onExpire: handle.onExpire,
      });
    }

    this.cleanupHandles.clear();
  }

  /**
   * Resume all cleanup timers (when tab becomes visible).
   * Restores the original policy and onExpire callback.
   */
  private resumeTimers(): void {
    if (!this.isPaused) return;
    this.isPaused = false;

    for (const [noteId, pausedTimer] of this.pausedTimers) {
      const { remainingMs, policy, onExpire } = pausedTimer;

      // Create the cleanup callback using the original onExpire
      const callback = async () => {
        this.cleanupHandles.delete(noteId);
        try {
          await onExpire(noteId);
        } catch {
          console.error(`Failed to clean up expired note: ${noteId}`);
        }
      };

      // Check if already expired while paused
      if (remainingMs <= 0) {
        void callback();
        continue;
      }

      // Reschedule with remaining time
      const timerId = setTimeout(() => void callback(), remainingMs);

      const handle: CleanupHandle = {
        noteId,
        timerId,
        expiresAt: Date.now() + remainingMs,
        policy,
        onExpire,
        cancel: () => this.cancelCleanup(noteId),
      };

      this.cleanupHandles.set(noteId, handle);
    }

    this.pausedTimers.clear();
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Create an ephemeral policy with the specified TTL.
 *
 * @param ttlMs - Time-to-live in milliseconds
 * @param deleteFromRelays - Whether to delete from relays on expiry
 * @returns EphemeralPolicy object
 */
export function createEphemeralPolicy(
  ttlMs: number,
  deleteFromRelays = true
): EphemeralPolicy {
  return EphemeralPolicyManager.getInstance().createPolicy({
    ttlMs,
    deleteFromRelays,
  });
}

/**
 * Check if a policy has expired.
 *
 * @param policy - The ephemeral policy to check
 * @returns true if expired
 */
export function isExpired(policy: EphemeralPolicy): boolean {
  return EphemeralPolicyManager.getInstance().isExpired(policy);
}

/**
 * Get time until expiry in milliseconds.
 *
 * @param policy - The ephemeral policy to check
 * @returns Remaining time in ms
 */
export function getTimeUntilExpiry(policy: EphemeralPolicy): number {
  return EphemeralPolicyManager.getInstance().getTimeUntilExpiry(policy);
}

/**
 * Schedule cleanup for a note.
 *
 * @param noteId - Note identifier
 * @param policy - Ephemeral policy
 * @param onExpire - Callback on expiry
 * @returns CleanupHandle
 */
export function scheduleCleanup(
  noteId: string,
  policy: EphemeralPolicy,
  onExpire: (noteId: string) => Promise<void>
): CleanupHandle {
  return EphemeralPolicyManager.getInstance().scheduleCleanup(
    noteId,
    policy,
    onExpire
  );
}

/**
 * Cancel a scheduled cleanup.
 *
 * @param handle - CleanupHandle or note ID
 */
export function cancelCleanup(handle: CleanupHandle | string): void {
  const noteId = typeof handle === "string" ? handle : handle.noteId;
  EphemeralPolicyManager.getInstance().cancelCleanup(noteId);
}

/**
 * Clean up all expired notes from a list.
 *
 * @param notes - Array of parsed notes
 * @param deleteCallback - Deletion callback
 * @returns Cleanup statistics
 */
export async function cleanupExpiredNotes(
  notes: ParsedPnsNote[],
  deleteCallback: DeleteCallback
): Promise<CleanupStats> {
  return EphemeralPolicyManager.getInstance().cleanupExpiredNotes(
    notes,
    deleteCallback
  );
}
