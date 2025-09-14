/**
 * Centralized timeout utilities for API calls used by Communications UI.
 * - Provides AbortController-based cancellation
 * - Standardized critical vs non-critical timeout categories
 */

export const TIMEOUTS = {
  critical: 10000, // 10s for auth/core messaging
  nonCritical: 5000, // 3–5s for groups, contacts, prefs, topics, details
} as const;

export type TimeoutCategory = keyof typeof TIMEOUTS;

export class TimeoutError extends Error {
  constructor(message: string = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Runs an async operation with AbortController-based timeout.
 * Prefers operations that accept an AbortSignal.
 *
 * Example:
 *   await withTimeout((signal) => fetchWithAuth(url, { signal }), TIMEOUTS.nonCritical, "Groups request timed out");
 */
export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  errorMessage: string = "Request timed out"
): Promise<T> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new TimeoutError(errorMessage);
    }
    throw e;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Fallback when operation cannot accept AbortSignal. It cannot cancel the underlying operation,
 * but it will reject after timeoutMs to unblock the UI.
 */
export async function withTimeoutPromise<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = "Request timed out"
): Promise<T> {
  let timeoutId: any;
  const timeoutP = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new TimeoutError(errorMessage)), timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutP]);
    return result as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

