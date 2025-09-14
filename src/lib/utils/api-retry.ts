/**
 * Central Retry Helper with Exponential Backoff
 * - Retries transient failures only (network/timeout/5xx)
 * - Integrates with withTimeout and TIMEOUTS
 * - Ensures total wall-clock time stays within the provided overall timeout
 */

import { withTimeout, TIMEOUTS, TimeoutError } from "./api-timeout";

export interface RetryOptions {
  maxAttempts?: number; // total attempts including the first (default 2 = 1 retry)
  initialDelayMs?: number; // default 1000
  totalTimeoutMs?: number; // default TIMEOUTS.nonCritical
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isNetworkLikeError(err: any): boolean {
  const msg = String(err?.message || "");
  return (
    err instanceof TimeoutError ||
    err?.name === "AbortError" ||
    /network/i.test(msg) ||
    /failed to fetch/i.test(msg)
  );
}

/**
 * Compute per-attempt timeout so that sum(attemptTimeouts + backoffDelays) <= totalTimeoutMs.
 */
function computePerAttemptTimeout(totalTimeoutMs: number, maxAttempts: number, initialDelayMs: number): number {
  // Backoff delays: initialDelayMs * (2^0 + 2^1 + ... + 2^(maxAttempts-2)) for (maxAttempts-1) gaps
  const retryCount = Math.max(0, maxAttempts - 1);
  let delaysSum = 0;
  for (let i = 0; i < retryCount; i++) {
    delaysSum += initialDelayMs * Math.pow(2, i);
  }
  const budget = Math.max(0, totalTimeoutMs - delaysSum);
  // Divide remaining budget evenly across attempts; set a minimum of 1000ms per attempt
  return Math.max(1000, Math.floor(budget / Math.max(1, maxAttempts)));
}

/**
 * withRetry: Retries an operation that accepts an AbortSignal, using withTimeout internally per attempt.
 * Returns the operation's result type T.
 *
 * Transient retry conditions:
 * - Thrown TimeoutError/AbortError/network-like error
 * - If result is a Response, HTTP 5xx statuses
 */
export async function withRetry<T = Response>(
  operation: (signal: AbortSignal) => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 2);
  const initialDelayMs = Math.max(0, opts.initialDelayMs ?? 1000);
  const totalTimeoutMs = Math.max(1000, opts.totalTimeoutMs ?? TIMEOUTS.nonCritical);
  const perAttemptMs = computePerAttemptTimeout(totalTimeoutMs, maxAttempts, initialDelayMs);

  let attempt = 0;
  let delay = initialDelayMs;
  let lastError: any = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const result = await withTimeout((signal) => operation(signal), perAttemptMs, "Request timed out");

      // If result is a Response, retry on 5xx only
      if (typeof Response !== "undefined" && result instanceof Response) {
        if (result.status >= 500) {
          if (attempt < maxAttempts) {
            await sleep(delay);
            delay *= 2;
            continue;
          }
        }
      }

      // Success path (non-Response or non-5xx)
      return result;
    } catch (err: any) {
      lastError = err;
      if (isNetworkLikeError(err)) {
        if (attempt < maxAttempts) {
          await sleep(delay);
          delay *= 2;
          continue;
        }
      }
      // Non-transient or out of attempts: rethrow
      throw err;
    }
  }

  // If loop exits without returning, throw last error for caller to handle
  throw lastError ?? new Error("Operation failed without explicit error");
}

export { TIMEOUTS };

