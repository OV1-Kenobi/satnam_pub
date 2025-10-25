/**
 * PKARR Error Handler Utilities
 * Phase 2B-1 Day 4: Enhanced Error Handling & Retry Logic
 *
 * Provides centralized error handling, retry logic, and circuit breaker
 * for PKARR verification operations.
 *
 * COMPLIANCE:
 * ✅ Privacy-first: No PII in error messages or logs
 * ✅ Non-blocking: Errors never block core functionality
 * ✅ Typed errors: All errors have specific error codes
 * ✅ Metrics collection: Track error rates and patterns
 */

// ============================================================================
// ERROR TYPES AND CODES
// ============================================================================

export enum PkarrErrorCode {
  // Transient errors (retryable)
  NETWORK_TIMEOUT = "NETWORK_TIMEOUT",
  DHT_UNAVAILABLE = "DHT_UNAVAILABLE",
  RELAY_TIMEOUT = "RELAY_TIMEOUT",
  RATE_LIMITED = "RATE_LIMITED",
  TEMPORARY_FAILURE = "TEMPORARY_FAILURE",

  // Permanent errors (non-retryable)
  INVALID_PUBLIC_KEY = "INVALID_PUBLIC_KEY",
  INVALID_NIP05 = "INVALID_NIP05",
  RECORD_NOT_FOUND = "RECORD_NOT_FOUND",
  SIGNATURE_INVALID = "SIGNATURE_INVALID",
  MALFORMED_RESPONSE = "MALFORMED_RESPONSE",

  // System errors
  CIRCUIT_BREAKER_OPEN = "CIRCUIT_BREAKER_OPEN",
  MAX_RETRIES_EXCEEDED = "MAX_RETRIES_EXCEEDED",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export interface PkarrError {
  code: PkarrErrorCode;
  message: string;
  isTransient: boolean;
  retryable: boolean;
  timestamp: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

/**
 * Classify an error as transient or permanent
 */
export function classifyError(error: Error | unknown): PkarrError {
  const timestamp = Date.now();

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network/timeout errors (transient)
    if (message.includes("timeout") || message.includes("timed out")) {
      return {
        code: PkarrErrorCode.NETWORK_TIMEOUT,
        message: "Network timeout during PKARR verification",
        isTransient: true,
        retryable: true,
        timestamp,
      };
    }

    if (message.includes("econnrefused") || message.includes("enotfound")) {
      return {
        code: PkarrErrorCode.DHT_UNAVAILABLE,
        message: "DHT relay unavailable",
        isTransient: true,
        retryable: true,
        timestamp,
      };
    }

    if (message.includes("rate limit")) {
      return {
        code: PkarrErrorCode.RATE_LIMITED,
        message: "Rate limited by DHT relay",
        isTransient: true,
        retryable: true,
        timestamp,
      };
    }

    // Validation errors (permanent)
    if (
      message.includes("invalid public key") ||
      message.includes("invalid pubkey")
    ) {
      return {
        code: PkarrErrorCode.INVALID_PUBLIC_KEY,
        message: "Invalid public key format",
        isTransient: false,
        retryable: false,
        timestamp,
      };
    }

    if (
      message.includes("invalid nip05") ||
      message.includes("invalid nip-05")
    ) {
      return {
        code: PkarrErrorCode.INVALID_NIP05,
        message: "Invalid NIP-05 identifier format",
        isTransient: false,
        retryable: false,
        timestamp,
      };
    }

    if (message.includes("not found") || message.includes("no record")) {
      return {
        code: PkarrErrorCode.RECORD_NOT_FOUND,
        message: "PKARR record not found",
        isTransient: false,
        retryable: false,
        timestamp,
      };
    }

    if (
      message.includes("signature") ||
      message.includes("verification failed")
    ) {
      return {
        code: PkarrErrorCode.SIGNATURE_INVALID,
        message: "Invalid PKARR signature",
        isTransient: false,
        retryable: false,
        timestamp,
      };
    }
  }

  // Default to temporary failure (transient)
  return {
    code: PkarrErrorCode.TEMPORARY_FAILURE,
    message: error instanceof Error ? error.message : String(error),
    isTransient: true,
    retryable: true,
    timestamp,
  };
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: PkarrError): boolean {
  return error.retryable && error.isTransient;
}

// ============================================================================
// EXPONENTIAL BACKOFF
// ============================================================================

export interface BackoffConfig {
  baseDelayMs: number; // Base delay (default: 1000ms)
  maxDelayMs: number; // Max delay (default: 8000ms)
  maxRetries: number; // Max retry attempts (default: 3)
  jitterFactor: number; // Jitter factor 0-1 (default: 0.3)
}

const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  maxRetries: 3,
  jitterFactor: 0.3,
};

/**
 * Calculate exponential backoff delay with jitter
 */
export function calculateBackoffDelay(
  attemptNumber: number,
  config: Partial<BackoffConfig> = {}
): number {
  const cfg = { ...DEFAULT_BACKOFF_CONFIG, ...config };

  // Exponential backoff: baseDelay * 2^attemptNumber
  const exponentialDelay = cfg.baseDelayMs * Math.pow(2, attemptNumber);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, cfg.maxDelayMs);

  // Add jitter: ±jitterFactor of the delay
  const jitterRange = cappedDelay * cfg.jitterFactor;
  const jitter = (Math.random() * 2 - 1) * jitterRange;

  return Math.max(0, Math.floor(cappedDelay + jitter));
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<BackoffConfig> = {}
): Promise<T> {
  const cfg = { ...DEFAULT_BACKOFF_CONFIG, ...config };
  let lastError: PkarrError | null = null;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const pkarrError = classifyError(error);
      lastError = pkarrError;

      // Don't retry if error is not retryable
      if (!isRetryableError(pkarrError)) {
        throw pkarrError;
      }

      // Don't retry if max retries exceeded
      if (attempt >= cfg.maxRetries) {
        throw {
          ...pkarrError,
          code: PkarrErrorCode.MAX_RETRIES_EXCEEDED,
          message: `Max retries (${cfg.maxRetries}) exceeded: ${pkarrError.message}`,
          metadata: {
            ...pkarrError.metadata,
            attempts: attempt + 1,
            originalError: pkarrError,
          },
        };
      }

      // Calculate backoff delay and wait
      const delayMs = calculateBackoffDelay(attempt, cfg);
      await sleep(delayMs);
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError || new Error("Retry failed with unknown error");
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

export enum CircuitState {
  CLOSED = "CLOSED", // Normal operation
  OPEN = "OPEN", // Failing, reject requests
  HALF_OPEN = "HALF_OPEN", // Testing if recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Failures before opening (default: 5)
  successThreshold: number; // Successes to close from half-open (default: 2)
  timeoutMs: number; // Time before half-open (default: 30000ms)
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 30000,
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.config.timeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      }
    }

    return this.state;
  }

  /**
   * Check if request is allowed
   */
  isRequestAllowed(): boolean {
    const state = this.getState();
    return state !== CircuitState.OPEN;
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      // Close circuit if success threshold met
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
      }
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    // Open circuit if failure threshold exceeded
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
    }

    // If in half-open, go back to open on any failure
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.successCount = 0;
    }
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.isRequestAllowed()) {
      throw {
        code: PkarrErrorCode.CIRCUIT_BREAKER_OPEN,
        message: "Circuit breaker is open, request rejected",
        isTransient: true,
        retryable: false,
        timestamp: Date.now(),
        metadata: {
          state: this.state,
          failureCount: this.failureCount,
          timeSinceFailure: Date.now() - this.lastFailureTime,
        },
      } as PkarrError;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

// ============================================================================
// ERROR METRICS
// ============================================================================

export interface ErrorMetrics {
  totalErrors: number;
  transientErrors: number;
  permanentErrors: number;
  retriedErrors: number;
  circuitBreakerTrips: number;
  errorsByCode: Map<PkarrErrorCode, number>;
}

export class ErrorMetricsCollector {
  private metrics: ErrorMetrics = {
    totalErrors: 0,
    transientErrors: 0,
    permanentErrors: 0,
    retriedErrors: 0,
    circuitBreakerTrips: 0,
    errorsByCode: new Map(),
  };

  /**
   * Record an error
   */
  recordError(error: PkarrError, wasRetried: boolean = false): void {
    this.metrics.totalErrors++;

    if (error.isTransient) {
      this.metrics.transientErrors++;
    } else {
      this.metrics.permanentErrors++;
    }

    if (wasRetried) {
      this.metrics.retriedErrors++;
    }

    if (error.code === PkarrErrorCode.CIRCUIT_BREAKER_OPEN) {
      this.metrics.circuitBreakerTrips++;
    }

    // Track by error code
    const count = this.metrics.errorsByCode.get(error.code) || 0;
    this.metrics.errorsByCode.set(error.code, count + 1);
  }

  /**
   * Get current metrics
   */
  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = {
      totalErrors: 0,
      transientErrors: 0,
      permanentErrors: 0,
      retriedErrors: 0,
      circuitBreakerTrips: 0,
      errorsByCode: new Map(),
    };
  }
}
