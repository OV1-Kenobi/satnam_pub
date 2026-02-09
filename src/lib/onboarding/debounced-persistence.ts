/**
 * Debounced Persistence Utility
 * @description Debounces database writes to reduce round-trips during rapid state changes
 *
 * Features:
 * - 300ms debounce delay for batching rapid updates
 * - Flush on unmount/navigation to ensure final state is persisted
 * - Type-safe wrappers for onboarding persistence functions
 * - Automatic cleanup of pending timers
 *
 * Performance Target: Reduce database writes by 60%+ during rapid state changes
 *
 * @compliance Privacy-first, zero-knowledge, Master Context compliant
 */

// ============================================================================
// Type Definitions
// ============================================================================

type DebouncedFunction<T extends (...args: any[]) => Promise<any>> = {
  (...args: Parameters<T>): Promise<ReturnType<T>>;
  flush: () => Promise<void>;
  cancel: () => void;
  pending: () => boolean;
};

interface PendingCall<T extends (...args: any[]) => Promise<any>> {
  args: Parameters<T>;
  resolve: (value: Awaited<ReturnType<T>>) => void;
  reject: (error: any) => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DEBOUNCE_DELAY = 300; // 300ms delay

// ============================================================================
// Debounce Implementation
// ============================================================================

/**
 * Create a debounced version of an async function
 * Batches rapid calls and executes only the last one after delay
 *
 * @param fn - Async function to debounce
 * @param delay - Debounce delay in milliseconds (default: 300ms)
 * @returns Debounced function with flush, cancel, and pending methods
 *
 * @example
 * ```typescript
 * const debouncedSave = createDebouncedFunction(saveToDatabase, 300);
 *
 * // Rapid calls - only last one executes after 300ms
 * await debouncedSave(data1);
 * await debouncedSave(data2);
 * await debouncedSave(data3); // Only this executes
 *
 * // Force immediate execution
 * await debouncedSave.flush();
 *
 * // Cancel pending execution
 * debouncedSave.cancel();
 * ```
 */
export function createDebouncedFunction<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delay: number = DEFAULT_DEBOUNCE_DELAY
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingCall: PendingCall<T> | null = null;

  const execute = async (): Promise<void> => {
    if (!pendingCall) return;

    const { args, resolve, reject } = pendingCall;
    pendingCall = null;
    timeoutId = null;

    try {
      const result = await fn(...args);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  };

  const debounced = (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return new Promise((resolve, reject) => {
      // Cancel previous pending call
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      // Store new pending call
      pendingCall = { args, resolve, reject };

      // Schedule execution
      timeoutId = setTimeout(execute, delay);
    });
  };

  // Flush: Execute immediately if pending
  debounced.flush = async (): Promise<void> => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      await execute();
    }
  };

  // Cancel: Clear pending execution
  debounced.cancel = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (pendingCall) {
      pendingCall.reject(new Error('Debounced call cancelled'));
      pendingCall = null;
    }
  };

  // Pending: Check if execution is pending
  debounced.pending = (): boolean => {
    return timeoutId !== null;
  };

  return debounced as DebouncedFunction<T>;
}

// ============================================================================
// Debounced Persistence Manager
// ============================================================================

/**
 * Manages debounced persistence for onboarding session and participants
 * Provides centralized debounced wrappers for common persistence operations
 */
export class DebouncedPersistenceManager {
  private debouncedFunctions: Map<string, DebouncedFunction<any>> = new Map();

  /**
   * Register a debounced function
   */
  register<T extends (...args: any[]) => Promise<any>>(
    key: string,
    fn: T,
    delay?: number
  ): DebouncedFunction<T> {
    const debounced = createDebouncedFunction(fn, delay);
    this.debouncedFunctions.set(key, debounced);
    return debounced;
  }

  /**
   * Get registered debounced function
   */
  get<T extends (...args: any[]) => Promise<any>>(key: string): DebouncedFunction<T> | undefined {
    return this.debouncedFunctions.get(key);
  }

  /**
   * Flush all pending operations
   */
  async flushAll(): Promise<void> {
    const flushPromises = Array.from(this.debouncedFunctions.values()).map(fn => fn.flush());
    await Promise.all(flushPromises);
  }

  /**
   * Cancel all pending operations
   */
  cancelAll(): void {
    this.debouncedFunctions.forEach(fn => fn.cancel());
  }

  /**
   * Clear all registered functions
   */
  clear(): void {
    this.cancelAll();
    this.debouncedFunctions.clear();
  }
}

