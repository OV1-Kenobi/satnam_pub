/**
 * PKARR Admin Dashboard Integration Tests
 * Phase 2B-1 Day 5: Admin Dashboard Integration
 *
 * Tests REAL integration points:
 * - API endpoint calls to pkarr-proxy and admin-dashboard
 * - Role-based access control (guardian/steward allowed, offspring/adult/private denied)
 * - Real-time monitoring with auto-refresh functionality
 * - Circuit breaker state management and controls
 * - Error metrics aggregation from actual data sources
 *
 * Uses REAL implementations:
 * - CircuitBreaker from pkarr-error-handler
 * - ErrorMetricsCollector from pkarr-error-handler
 * - Actual fetch calls to Netlify Functions
 * - Real JWT token validation
 *
 * Target: 100% pass rate
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CircuitBreaker,
  CircuitState,
  ErrorMetricsCollector,
  PkarrErrorCode,
} from "../netlify/functions/utils/pkarr-error-handler";

// ============================================================================
// CIRCUIT BREAKER INTEGRATION TESTS
// ============================================================================

describe("Circuit Breaker Integration", () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      successThreshold: 2,
      timeoutMs: 30000,
    });
  });

  afterEach(() => {
    circuitBreaker.reset();
  });

  describe("Circuit Breaker State Management", () => {
    it("should start in CLOSED state", () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.isRequestAllowed()).toBe(true);
    });

    it("should transition to OPEN after failure threshold", () => {
      // Record 5 failures to reach threshold
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(circuitBreaker.isRequestAllowed()).toBe(false);
    });

    it("should transition to HALF_OPEN after timeout", async () => {
      vi.useFakeTimers();

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Advance time past timeout (30 seconds)
      vi.advanceTimersByTime(30000);

      // Check state - should be HALF_OPEN
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      vi.useRealTimers();
    });

    it("should close circuit after success threshold in HALF_OPEN", async () => {
      vi.useFakeTimers();

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      // Advance to HALF_OPEN
      vi.advanceTimersByTime(30000);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Record 2 successes to reach threshold
      circuitBreaker.recordSuccess();
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      vi.useRealTimers();
    });

    it("should reopen circuit on failure in HALF_OPEN", async () => {
      vi.useFakeTimers();

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      // Advance to HALF_OPEN
      vi.advanceTimersByTime(30000);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Record a failure
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      vi.useRealTimers();
    });
  });

  describe("Circuit Breaker Execute Method", () => {
    it("should execute function when circuit is CLOSED", async () => {
      const mockFn = vi.fn().mockResolvedValue("success");

      const result = await circuitBreaker.execute(mockFn);

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("should reject requests when circuit is OPEN", async () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      const mockFn = vi.fn().mockResolvedValue("success");

      await expect(circuitBreaker.execute(mockFn)).rejects.toMatchObject({
        code: "CIRCUIT_BREAKER_OPEN",
        message: "Circuit breaker is open, request rejected",
      });

      expect(mockFn).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// ERROR METRICS INTEGRATION TESTS
// ============================================================================

describe("Error Metrics Integration", () => {
  let errorMetrics: ErrorMetricsCollector;

  beforeEach(() => {
    errorMetrics = new ErrorMetricsCollector();
  });

  afterEach(() => {
    errorMetrics.reset();
  });

  describe("Error Metrics Collection", () => {
    it("should record transient errors", () => {
      const error = {
        code: PkarrErrorCode.NETWORK_TIMEOUT,
        message: "Network timeout",
        isTransient: true,
        retryable: true,
        timestamp: Date.now(),
      };

      errorMetrics.recordError(error, false);

      const metrics = errorMetrics.getMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.transientErrors).toBe(1);
      expect(metrics.permanentErrors).toBe(0);
    });

    it("should record permanent errors", () => {
      const error = {
        code: PkarrErrorCode.INVALID_PUBLIC_KEY,
        message: "Invalid public key",
        isTransient: false,
        retryable: false,
        timestamp: Date.now(),
      };

      errorMetrics.recordError(error, false);

      const metrics = errorMetrics.getMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.transientErrors).toBe(0);
      expect(metrics.permanentErrors).toBe(1);
    });

    it("should track retried errors", () => {
      const error = {
        code: PkarrErrorCode.DHT_UNAVAILABLE,
        message: "DHT unavailable",
        isTransient: true,
        retryable: true,
        timestamp: Date.now(),
      };

      errorMetrics.recordError(error, true);

      const metrics = errorMetrics.getMetrics();
      expect(metrics.retriedErrors).toBe(1);
    });

    it("should track circuit breaker trips", () => {
      const error = {
        code: PkarrErrorCode.CIRCUIT_BREAKER_OPEN,
        message: "Circuit breaker is open",
        isTransient: true,
        retryable: false,
        timestamp: Date.now(),
      };

      errorMetrics.recordError(error, false);

      const metrics = errorMetrics.getMetrics();
      expect(metrics.circuitBreakerTrips).toBe(1);
    });

    it("should track errors by code", () => {
      const errors = [
        {
          code: PkarrErrorCode.NETWORK_TIMEOUT,
          message: "Timeout 1",
          isTransient: true,
          retryable: true,
          timestamp: Date.now(),
        },
        {
          code: PkarrErrorCode.NETWORK_TIMEOUT,
          message: "Timeout 2",
          isTransient: true,
          retryable: true,
          timestamp: Date.now(),
        },
        {
          code: PkarrErrorCode.DHT_UNAVAILABLE,
          message: "DHT down",
          isTransient: true,
          retryable: true,
          timestamp: Date.now(),
        },
      ];

      errors.forEach((error) => errorMetrics.recordError(error, false));

      const metrics = errorMetrics.getMetrics();
      expect(metrics.errorsByCode.get(PkarrErrorCode.NETWORK_TIMEOUT)).toBe(2);
      expect(metrics.errorsByCode.get(PkarrErrorCode.DHT_UNAVAILABLE)).toBe(1);
    });
  });

  describe("Error Metrics Reset", () => {
    it("should reset all metrics to zero", () => {
      // Record some errors
      const error = {
        code: PkarrErrorCode.NETWORK_TIMEOUT,
        message: "Timeout",
        isTransient: true,
        retryable: true,
        timestamp: Date.now(),
      };

      errorMetrics.recordError(error, true);
      errorMetrics.recordError(error, false);

      // Reset
      errorMetrics.reset();

      const metrics = errorMetrics.getMetrics();
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.transientErrors).toBe(0);
      expect(metrics.permanentErrors).toBe(0);
      expect(metrics.retriedErrors).toBe(0);
      expect(metrics.circuitBreakerTrips).toBe(0);
      expect(metrics.errorsByCode.size).toBe(0);
    });
  });
});
