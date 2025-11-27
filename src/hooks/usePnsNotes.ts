/**
 * usePnsNotes Hook - PNS Note Management
 *
 * React hook for managing Private Notes to Self in UI components.
 * Provides a clean interface to PnsService with React state management.
 *
 * Features:
 * - Full CRUD operations for PNS notes
 * - Automatic ephemeral note cleanup scheduling
 * - Loading and error state management
 * - Auto-refresh support with configurable interval
 * - Optimistic updates for better UX
 *
 * @module src/hooks/usePnsNotes
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { PnsSecurityMode, PnsNoteMetadata } from "../lib/noise/types";
import {
  PnsService,
  type ParsedPnsNote,
  type PnsNoteFilters,
} from "../lib/nostr/pns";
import {
  EphemeralPolicyManager,
  type CleanupHandle,
} from "../lib/nostr/pns/ephemeral-policy";

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration options for usePnsNotes hook.
 */
export interface UsePnsNotesConfig {
  /** Auto-refresh notes on mount (default: true) */
  autoRefresh?: boolean;
  /** Auto-refresh interval in ms (0 = disabled, default: 0) */
  refreshInterval?: number;
  /** Default filters for listNotes() */
  filters?: PnsNoteFilters;
  /** Default relays to use */
  relays?: string[];
  /** Default security mode for new notes */
  securityMode?: PnsSecurityMode;
  /** Auto-schedule ephemeral note cleanup (default: true) */
  enableEphemeralCleanup?: boolean;
  /** Debounce refresh calls (ms, default: 500) */
  refreshDebounceMs?: number;
}

/**
 * Return type for usePnsNotes hook.
 */
export interface UsePnsNotesReturn {
  /** Array of loaded notes */
  notes: ParsedPnsNote[];
  /** Loading state for async operations */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Whether PnsService is initialized */
  initialized: boolean;
  /** Save/create a note */
  saveNote: (
    content: string,
    metadata?: Partial<PnsNoteMetadata>,
    securityMode?: PnsSecurityMode
  ) => Promise<{ noteId: string; eventId: string } | null>;
  /** Update an existing note */
  updateNote: (
    noteId: string,
    content: string,
    metadata?: Partial<PnsNoteMetadata>
  ) => Promise<{ eventId: string } | null>;
  /** Delete a note */
  deleteNote: (noteId: string, eventId?: string) => Promise<boolean>;
  /** Reload notes from relays */
  refreshNotes: () => Promise<void>;
  /** Get a specific note by ID */
  getNote: (noteId: string) => Promise<ParsedPnsNote | null>;
  /** Clear error state */
  clearError: () => void;
  /** Notes expiring within threshold */
  getExpiringNotes: (thresholdMs: number) => ParsedPnsNote[];
  /** Total notes count */
  totalCount: number;
  /** Count of ephemeral notes */
  ephemeralCount: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Debounce function implementation.
 */
function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * React hook for managing PNS notes.
 *
 * @param config - Optional configuration
 * @returns Hook state and operations
 *
 * @example
 * ```tsx
 * function NotesComponent() {
 *   const {
 *     notes,
 *     loading,
 *     error,
 *     saveNote,
 *     deleteNote,
 *     refreshNotes
 *   } = usePnsNotes({ autoRefresh: true });
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   return (
 *     <div>
 *       {notes.map(note => (
 *         <NoteCard key={note.noteId} note={note} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePnsNotes(config: UsePnsNotesConfig = {}): UsePnsNotesReturn {
  const {
    autoRefresh = true,
    refreshInterval = 0,
    filters,
    relays,
    securityMode = "noise-fs",
    enableEphemeralCleanup = true,
    refreshDebounceMs = 500,
  } = config;

  // State
  const [notes, setNotes] = useState<ParsedPnsNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Refs for cleanup and debouncing
  const cleanupHandlesRef = useRef<Map<string, CleanupHandle>>(new Map());
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const isMountedRef = useRef(true);
  const lastRefreshRef = useRef<number>(0);
  const hasAutoRefreshedRef = useRef(false);

  // ===========================================================================
  // Service Access
  // ===========================================================================

  /**
   * Get PnsService instance, checking initialization.
   */
  const getService = useCallback((): PnsService | null => {
    const service = PnsService.getInstance();
    if (!service.isInitialized()) {
      return null;
    }
    return service;
  }, []);

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  /**
   * Clear error state.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Handle async operation errors.
   */
  const handleError = useCallback((err: unknown, operation: string) => {
    const error = err instanceof Error ? err : new Error(`${operation} failed`);
    console.error(`[usePnsNotes] ${operation} error:`, error.message);
    if (isMountedRef.current) {
      setError(error);
    }
  }, []);

  // ===========================================================================
  // Ephemeral Cleanup
  // ===========================================================================

  /**
   * Schedule cleanup for ephemeral notes.
   */
  const scheduleEphemeralCleanups = useCallback(
    (notesToSchedule: ParsedPnsNote[]) => {
      if (!enableEphemeralCleanup) return;

      const manager = EphemeralPolicyManager.getInstance();

      for (const note of notesToSchedule) {
        const policy = note.metadata.ephemeralPolicy;
        if (!policy?.isEphemeral || note.isDeleted) continue;

        // Cancel existing cleanup if any
        const existingHandle = cleanupHandlesRef.current.get(note.noteId);
        if (existingHandle) {
          existingHandle.cancel();
        }

        // Schedule new cleanup
        const handle = manager.scheduleCleanup(
          note.noteId,
          policy,
          async (noteId) => {
            // Remove from local state
            if (isMountedRef.current) {
              setNotes((prev) =>
                prev.map((n) =>
                  n.noteId === noteId ? { ...n, isDeleted: true } : n
                )
              );
            }
            // Delete via service
            try {
              const service = getService();
              if (service) {
                await service.deleteNote(noteId, note.eventId);
              }
            } catch {
              // Ignore cleanup errors - best effort
            }
          }
        );

        cleanupHandlesRef.current.set(note.noteId, handle);
      }
    },
    [enableEphemeralCleanup, getService]
  );

  /**
   * Cancel all scheduled cleanups.
   */
  const cancelAllCleanups = useCallback(() => {
    for (const handle of cleanupHandlesRef.current.values()) {
      handle.cancel();
    }
    cleanupHandlesRef.current.clear();
  }, []);

  // ===========================================================================
  // Core Operations
  // ===========================================================================

  /**
   * Refresh notes from relays.
   */
  const refreshNotes = useCallback(async (): Promise<void> => {
    const service = getService();

    if (!service) {
      if (isMountedRef.current) {
        setInitialized(false);
      }
      return;
    }

    // Debounce rapid refresh calls
    const now = Date.now();
    if (now - lastRefreshRef.current < refreshDebounceMs) {
      return;
    }
    lastRefreshRef.current = now;

    if (isMountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const loadedNotes = await service.listNotes(filters, relays);

      if (isMountedRef.current) {
        setNotes(loadedNotes);
        setInitialized(true);

        // Schedule cleanup for ephemeral notes
        scheduleEphemeralCleanups(loadedNotes);
      }
    } catch (err) {
      handleError(err, "refreshNotes");
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [
    getService,
    filters,
    relays,
    refreshDebounceMs,
    scheduleEphemeralCleanups,
    handleError,
  ]);

  /**
   * Save a new note.
   */
  const saveNote = useCallback(
    async (
      content: string,
      metadata?: Partial<PnsNoteMetadata>,
      mode?: PnsSecurityMode
    ): Promise<{ noteId: string; eventId: string } | null> => {
      const service = getService();

      if (!service) {
        setError(new Error("PNS service not initialized"));
        return null;
      }

      if (isMountedRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        const result = await service.saveNote(
          content,
          metadata ?? {},
          mode ?? securityMode,
          relays
        );

        // Optimistic update: add note to local state
        if (isMountedRef.current) {
          const newNote: ParsedPnsNote = {
            noteId: result.noteId,
            content,
            metadata: {
              createdAt: Date.now(),
              ...metadata,
            },
            securityMode: mode ?? securityMode,
            eventId: result.eventId,
            createdAt: Math.floor(Date.now() / 1000),
          };

          setNotes((prev) => [newNote, ...prev]);

          // Schedule cleanup if ephemeral
          if (metadata?.ephemeralPolicy?.isEphemeral) {
            scheduleEphemeralCleanups([newNote]);
          }
        }

        return result;
      } catch (err) {
        handleError(err, "saveNote");
        return null;
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [getService, securityMode, relays, scheduleEphemeralCleanups, handleError]
  );

  /**
   * Update an existing note.
   */
  const updateNote = useCallback(
    async (
      noteId: string,
      content: string,
      metadata?: Partial<PnsNoteMetadata>
    ): Promise<{ eventId: string } | null> => {
      const service = getService();

      if (!service) {
        setError(new Error("PNS service not initialized"));
        return null;
      }

      if (isMountedRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        const result = await service.updateNote(
          noteId,
          content,
          metadata,
          relays
        );

        // Optimistic update: update note in local state
        if (isMountedRef.current) {
          setNotes((prev) =>
            prev.map((note) =>
              note.noteId === noteId
                ? {
                    ...note,
                    content,
                    metadata: {
                      ...note.metadata,
                      ...metadata,
                      updatedAt: Date.now(),
                    },
                    eventId: result.eventId,
                    updatedAt: Math.floor(Date.now() / 1000),
                  }
                : note
            )
          );
        }

        return result;
      } catch (err) {
        handleError(err, "updateNote");
        return null;
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [getService, relays, handleError]
  );

  /**
   * Delete a note.
   */
  const deleteNote = useCallback(
    async (noteId: string, eventId?: string): Promise<boolean> => {
      const service = getService();

      if (!service) {
        setError(new Error("PNS service not initialized"));
        return false;
      }

      if (isMountedRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        await service.deleteNote(noteId, eventId, relays);

        // Cancel any scheduled cleanup
        const handle = cleanupHandlesRef.current.get(noteId);
        if (handle) {
          handle.cancel();
          cleanupHandlesRef.current.delete(noteId);
        }

        // Optimistic update: mark as deleted in local state
        if (isMountedRef.current) {
          setNotes((prev) =>
            prev.map((note) =>
              note.noteId === noteId ? { ...note, isDeleted: true } : note
            )
          );
        }

        return true;
      } catch (err) {
        handleError(err, "deleteNote");
        return false;
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [getService, relays, handleError]
  );

  /**
   * Get a specific note by ID.
   */
  const getNote = useCallback(
    async (noteId: string): Promise<ParsedPnsNote | null> => {
      const service = getService();

      if (!service) {
        setError(new Error("PNS service not initialized"));
        return null;
      }

      try {
        return await service.getNote(noteId, relays);
      } catch (err) {
        handleError(err, "getNote");
        return null;
      }
    },
    [getService, relays, handleError]
  );

  // ===========================================================================
  // Derived State
  // ===========================================================================

  /**
   * Get notes expiring within a threshold.
   */
  const getExpiringNotes = useCallback(
    (thresholdMs: number): ParsedPnsNote[] => {
      const manager = EphemeralPolicyManager.getInstance();
      return notes.filter((note) => {
        const policy = note.metadata.ephemeralPolicy;
        if (!policy?.isEphemeral || note.isDeleted) return false;
        return manager.isExpiringSoon(policy, thresholdMs);
      });
    },
    [notes]
  );

  /**
   * Total notes count (excluding deleted).
   */
  const totalCount = useMemo(
    () => notes.filter((n) => !n.isDeleted).length,
    [notes]
  );

  /**
   * Count of ephemeral notes (excluding deleted).
   */
  const ephemeralCount = useMemo(
    () =>
      notes.filter(
        (n) => !n.isDeleted && n.metadata.ephemeralPolicy?.isEphemeral
      ).length,
    [notes]
  );

  // ===========================================================================
  // Effects
  // ===========================================================================

  /**
   * Check service initialization on mount.
   */
  useEffect(() => {
    const service = PnsService.getInstance();
    setInitialized(service.isInitialized());
  }, []);

  /**
   * Keep a ref to the latest refreshNotes to avoid stale closures in intervals.
   */
  const refreshNotesRef = useRef(refreshNotes);
  useEffect(() => {
    refreshNotesRef.current = refreshNotes;
  }, [refreshNotes]);

  /**
   * Auto-refresh on mount (runs only once).
   */
  useEffect(() => {
    if (autoRefresh && initialized && !hasAutoRefreshedRef.current) {
      hasAutoRefreshedRef.current = true;
      void refreshNotesRef.current();
    }
  }, [autoRefresh, initialized]);

  /**
   * Set up refresh interval.
   * Uses refreshNotesRef to always call the latest version of refreshNotes.
   */
  useEffect(() => {
    if (refreshInterval > 0 && initialized) {
      refreshIntervalRef.current = setInterval(() => {
        void refreshNotesRef.current();
      }, refreshInterval);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      };
    }
    return undefined;
  }, [refreshInterval, initialized]);

  /**
   * Cleanup on unmount.
   */
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      // Cancel refresh interval
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }

      // Cancel all scheduled cleanups
      cancelAllCleanups();
    };
  }, [cancelAllCleanups]);

  // ===========================================================================
  // Return
  // ===========================================================================

  return {
    notes,
    loading,
    error,
    initialized,
    saveNote,
    updateNote,
    deleteNote,
    refreshNotes,
    getNote,
    clearError,
    getExpiringNotes,
    totalCount,
    ephemeralCount,
  };
}

// =============================================================================
// Additional Utility Hooks
// =============================================================================

/**
 * Hook for a single PNS note.
 *
 * @param noteId - Note ID to watch
 * @param config - Optional configuration
 * @returns Single note state and operations
 */
export function usePnsNote(
  noteId: string,
  config?: Omit<UsePnsNotesConfig, "filters">
): {
  note: ParsedPnsNote | null;
  loading: boolean;
  error: Error | null;
  updateNote: (
    content: string,
    metadata?: Partial<PnsNoteMetadata>
  ) => Promise<boolean>;
  deleteNote: () => Promise<boolean>;
  refresh: () => Promise<void>;
} {
  const [note, setNote] = useState<ParsedPnsNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  const refresh = useCallback(async (): Promise<void> => {
    const service = PnsService.getInstance();
    if (!service.isInitialized()) return;

    if (isMountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const loadedNote = await service.getNote(noteId, config?.relays);
      if (isMountedRef.current) {
        setNote(loadedNote);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error("Failed to load note"));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [noteId, config?.relays]);

  const updateNote = useCallback(
    async (
      content: string,
      metadata?: Partial<PnsNoteMetadata>
    ): Promise<boolean> => {
      const service = PnsService.getInstance();
      if (!service.isInitialized()) {
        setError(new Error("PNS service not initialized"));
        return false;
      }

      if (isMountedRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        await service.updateNote(noteId, content, metadata, config?.relays);
        await refresh();
        return true;
      } catch (err) {
        if (isMountedRef.current) {
          setError(
            err instanceof Error ? err : new Error("Failed to update note")
          );
        }
        return false;
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [noteId, config?.relays, refresh]
  );

  const deleteNote = useCallback(async (): Promise<boolean> => {
    const service = PnsService.getInstance();
    if (!service.isInitialized()) {
      setError(new Error("PNS service not initialized"));
      return false;
    }

    if (isMountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      await service.deleteNote(noteId, note?.eventId, config?.relays);
      if (isMountedRef.current) {
        setNote((prev) => (prev ? { ...prev, isDeleted: true } : null));
      }
      return true;
    } catch (err) {
      if (isMountedRef.current) {
        setError(
          err instanceof Error ? err : new Error("Failed to delete note")
        );
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [noteId, note?.eventId, config?.relays]);

  // Load on mount
  useEffect(() => {
    void refresh();
  }, [noteId]); // Only reload when noteId changes

  // Cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    note,
    loading,
    error,
    updateNote,
    deleteNote,
    refresh,
  };
}

/**
 * Hook for counting ephemeral notes by status.
 *
 * @param notes - Notes array from usePnsNotes
 * @returns Counts by expiration status
 */
export function useEphemeralNoteStats(notes: ParsedPnsNote[]): {
  total: number;
  expiringSoon: number;
  expired: number;
} {
  return useMemo(() => {
    const manager = EphemeralPolicyManager.getInstance();
    const ONE_HOUR = 60 * 60 * 1000;

    let total = 0;
    let expiringSoon = 0;
    let expired = 0;

    for (const note of notes) {
      const policy = note.metadata.ephemeralPolicy;
      if (!policy?.isEphemeral || note.isDeleted) continue;

      total++;
      if (manager.isExpired(policy)) {
        expired++;
      } else if (manager.isExpiringSoon(policy, ONE_HOUR)) {
        expiringSoon++;
      }
    }

    return { total, expiringSoon, expired };
  }, [notes]);
}
