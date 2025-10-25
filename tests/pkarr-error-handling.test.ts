/**
 * PKARR Error Handling Tests
 * Phase 2B-1 Day 4: Enhanced Error Handling & Retry Logic
 *
 * Tests for:
 * - Error classification (transient vs permanent)
 * - Exponential backoff with jitter
 * - Circuit breaker state transitions
 * - Retry logic with max retries
 * - Error metrics collection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  classifyError,
  isRetryableError,
  calculateBackoffDelay,
  retryWithBackoff,
  CircuitBreaker,
  CircuitState,
  ErrorMetricsCollector,
  PkarrErrorCode,
  type PkarrError,
} from "../netlify/functions/utils/pkarr-error-handler.js";

describe("PKARR Error Handling", () => {
  describe("Error Classification", () => {
    it("should classify timeout errors as transient", () => {
      const error = new Error("Request timeout");
      const classified = classifyError(error);

      expect(classified.code).toBe(PkarrErrorCode.NETWORK_TIMEOUT);
      expect(classified.isTransient).toBe(true);
      expect(classified.retryable).toBe(true);
    });

    it("should classify DHT unavailable errors as transient", () => {
      const error = new Error("ECONNREFUSED: Connection refused");
      const classified = classifyError(error);

      expect(classified.code).toBe(PkarrErrorCode.DHT_UNAVAILABLE);
      expect(classified.isTransient).toBe(true);
      expect(classified.retryable).toBe(true);
    });

    it("should classify rate limit errors as transient", () => {
      const error = new Error("Rate limit exceeded");
      const classified = classifyError(error);

      expect(classified.code).toBe(PkarrErrorCode.RATE_LIMITED);
      expect(classified.isTransient).toBe(true);
      expect(classified.retryable).toBe(true);
    });

    it("should classify invalid public key errors as permanent", () => {
      const error = new Error("Invalid public key format");
      const classified = classifyError(error);

      expect(classified.code).toBe(PkarrErrorCode.INVALID_PUBLIC_KEY);
      expect(classified.isTransient).toBe(false);
      expect(classified.retryable).toBe(false);
    });

    it("should classify invalid NIP-05 errors as permanent", () => {
      const error = new Error("Invalid NIP-05 identifier");
      const classified = classifyError(error);

      expect(classified.code).toBe(PkarrErrorCode.INVALID_NIP05);
      expect(classified.isTransient).toBe(false);
      expect(classified.retryable).toBe(false);
    });

    it("should classify record not found errors as permanent", () => {
      const error = new Error("PKARR record not found");
      const classified = classifyError(error);

      expect(classified.code).toBe(PkarrErrorCode.RECORD_NOT_FOUND);
      expect(classified.isTransient).toBe(false);
      expect(classified.retryable).toBe(false);
    });

    it("should classify signature errors as permanent", () => {
      const error = new Error("Signature verification failed");
      const classified = classifyError(error);

      expect(classified.code).toBe(PkarrErrorCode.SIGNATURE_INVALID);
      expect(classified.isTransient).toBe(false);
      expect(classified.retryable).toBe(false);
    });

    it("should classify unknown errors as temporary failure (transient)", () => {
      const error = new Error("Something went wrong");
      const classified = classifyError(error);

      expect(classified.code).toBe(PkarrErrorCode.TEMPORARY_FAILURE);
      expect(classified.isTransient).toBe(true);
      expect(classified.retryable).toBe(true);
    });

    it("should handle non-Error objects", () => {
      const error = "String error";
      const classified = classifyError(error);

      expect(classified.code).toBe(PkarrErrorCode.TEMPORARY_FAILURE);
      expect(classified.message).toBe("String error");
    });
  });

  describe("Retryable Error Check", () => {
    it("should identify retryable errors", () => {
      const error: PkarrError = {
        code: PkarrErrorCode.NETWORK_TIMEOUT,
        message: "Timeout",
        isTransient: true,
        retryable: true,
        timestamp: Date.now(),
      };

      expect(isRetryableError(error)).toBe(true);
    });

    it("should identify non-retryable errors", () => {
      const error: PkarrError = {
        code: PkarrErrorCode.INVALID_PUBLIC_KEY,
        message: "Invalid key",
        isTransient: false,
        retryable: false,
        timestamp: Date.now(),
      };

      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe("Exponential Backoff", () => {
    it("should calculate exponential backoff delay", () => {
      const delay0 = calculateBackoffDelay(0, { jitterFactor: 0 });
      const delay1 = calculateBackoffDelay(1, { jitterFactor: 0 });
      const delay2 = calculateBackoffDelay(2, { jitterFactor: 0 });

      expect(delay0).toBe(1000); // 1s * 2^0 = 1s
      expect(delay1).toBe(2000); // 1s * 2^1 = 2s
      expect(delay2).toBe(4000); // 1s * 2^2 = 4s
    });

    it("should cap delay at max delay", () => {
      const delay = calculateBackoffDelay(10, {
        baseDelayMs: 1000,
        maxDelayMs: 8000,
        jitterFactor: 0,
      });

      expect(delay).toBe(8000); // Capped at 8s
    });

    it("should add jitter to delay", () => {
      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(
          calculateBackoffDelay(1, {
            baseDelayMs: 1000,
            jitterFactor: 0.3,
          })
        );
      }

      // All delays should be within ±30% of 2000ms
      delays.forEach((delay) => {
        expect(delay).toBeGreaterThanOrEqual(1400); // 2000 - 30%
        expect(delay).toBeLessThanOrEqual(2600); // 2000 + 30%
      });

      // At least some delays should be different (jitter working)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe("Retry with Backoff", () => {
    it("should succeed on first attempt", async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        return "success";
      };

      const result = await retryWithBackoff(fn, { maxRetries: 3 });

      expect(result).toBe("success");
      expect(attempts).toBe(1);
    });

    it("should retry transient errors", async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Request timeout");
        }
        return "success";
      };

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
        maxDelayMs: 50,
      });

      expect(result).toBe("success");
      expect(attempts).toBe(3);
    });

    it("should not retry permanent errors", async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        throw new Error("Invalid public key format");
      };

      await expect(
        retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 10 })
      ).rejects.toMatchObject({
        code: PkarrErrorCode.INVALID_PUBLIC_KEY,
        isTransient: false,
        retryable: false,
      });

      expect(attempts).toBe(1); // No retries
    });

    it("should throw MAX_RETRIES_EXCEEDED after max retries", async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        throw new Error("Request timeout");
      };

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 3,
          baseDelayMs: 10,
          maxDelayMs: 50,
        })
      ).rejects.toMatchObject({
        code: PkarrErrorCode.MAX_RETRIES_EXCEEDED,
      });

      expect(attempts).toBe(4); // Initial + 3 retries
    });
  });

  describe("Circuit Breaker", () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeoutMs: 1000,
      });
    });

    it("should start in CLOSED state", () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.isRequestAllowed()).toBe(true);
    });

    it("should transition to OPEN after failure threshold", () => {
      // Record 3 failures
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(circuitBreaker.isRequestAllowed()).toBe(false);
    });

    it("should transition to HALF_OPEN after timeout", async () => {
      // Open circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
      expect(circuitBreaker.isRequestAllowed()).toBe(true);
    });

    it("should close circuit after success threshold in HALF_OPEN", async () => {
      // Open circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      // Wait for timeout to HALF_OPEN
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Record 2 successes
      circuitBreaker.recordSuccess();
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("should reopen circuit on failure in HALF_OPEN", async () => {
      // Open circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      // Wait for timeout to HALF_OPEN
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Record failure
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it("should execute function when circuit is CLOSED", async () => {
      const fn = async () => "success";
      const result = await circuitBreaker.execute(fn);

      expect(result).toBe("success");
    });

    it("should reject requests when circuit is OPEN", async () => {
      // Open circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      const fn = async () => "success";

      await expect(circuitBreaker.execute(fn)).rejects.toMatchObject({
        code: PkarrErrorCode.CIRCUIT_BREAKER_OPEN,
      });
    });

    it("should reset circuit to initial state", () => {
      // Open circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Reset
      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.isRequestAllowed()).toBe(true);
    });
  });

  describe("Error Metrics Collector", () => {
    let collector: ErrorMetricsCollector;

    beforeEach(() => {
      collector = new ErrorMetricsCollector();
    });

    it("should record transient errors", () => {
      const error: PkarrError = {
        code: PkarrErrorCode.NETWORK_TIMEOUT,
        message: "Timeout",
        isTransient: true,
        retryable: true,
        timestamp: Date.now(),
      };

      collector.recordError(error, false);

      const metrics = collector.getMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.transientErrors).toBe(1);
      expect(metrics.permanentErrors).toBe(0);
    });

    it("should record permanent errors", () => {
      const error: PkarrError = {
        code: PkarrErrorCode.INVALID_PUBLIC_KEY,
        message: "Invalid key",
        isTransient: false,
        retryable: false,
        timestamp: Date.now(),
      };

      collector.recordError(error, false);

      const metrics = collector.getMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.transientErrors).toBe(0);
      expect(metrics.permanentErrors).toBe(1);
    });

    it("should track retried errors", () => {
      const error: PkarrError = {
        code: PkarrErrorCode.NETWORK_TIMEOUT,
        message: "Timeout",
        isTransient: true,
        retryable: true,
        timestamp: Date.now(),
      };

      collector.recordError(error, true);

      const metrics = collector.getMetrics();
      expect(metrics.retriedErrors).toBe(1);
    });

    it("should track circuit breaker trips", () => {
      const error: PkarrError = {
        code: PkarrErrorCode.CIRCUIT_BREAKER_OPEN,
        message: "Circuit open",
        isTransient: true,
        retryable: false,
        timestamp: Date.now(),
      };

      collector.recordError(error, false);

      const metrics = collector.getMetrics();
      expect(metrics.circuitBreakerTrips).toBe(1);
    });

    it("should track errors by code", () => {
      const error1: PkarrError = {
        code: PkarrErrorCode.NETWORK_TIMEOUT,
        message: "Timeout",
        isTransient: true,
        retryable: true,
        timestamp: Date.now(),
      };

      const error2: PkarrError = {
        code: PkarrErrorCode.NETWORK_TIMEOUT,
        message: "Timeout",
        isTransient: true,
        retryable: true,
        timestamp: Date.now(),
      };

      collector.recordError(error1, false);
      collector.recordError(error2, false);

      const metrics = collector.getMetrics();
      expect(metrics.errorsByCode.get(PkarrErrorCode.NETWORK_TIMEOUT)).toBe(2);
    });

    it("should reset metrics", () => {
      const error: PkarrError = {
        code: PkarrErrorCode.NETWORK_TIMEOUT,
        message: "Timeout",
        isTransient: true,
        retryable: true,
        timestamp: Date.now(),
      };

      collector.recordError(error, false);
      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.transientErrors).toBe(0);
      expect(metrics.permanentErrors).toBe(0);
    });
  });
});

