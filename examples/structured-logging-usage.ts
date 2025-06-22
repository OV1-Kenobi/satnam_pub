/**
 * Structured Logging Usage Examples
 *
 * This file demonstrates how to use the structured logging system
 * to replace direct console usage throughout the application.
 */

import { createLogger } from "../utils/logger";

// Create module-specific loggers
const authLogger = createLogger("auth");
const paymentLogger = createLogger("payments");
const federationLogger = createLogger("federation");

/**
 * Example 1: Basic logging with context
 */
function exampleBasicLogging() {
  // Instead of: console.log('User authenticated')
  authLogger.info("User authenticated", {
    npub: "npub1234567890abcdef", // Will be automatically truncated
    method: "nwc",
    timestamp: Date.now(),
  });

  // Instead of: console.error('Authentication failed', error)
  const error = new Error("Invalid credentials");
  authLogger.error(
    "Authentication failed",
    {
      method: "nwc",
      attemptCount: 3,
    },
    error
  );
}

/**
 * Example 2: Privacy-aware logging
 */
function examplePrivacyLogging() {
  // Sensitive data is automatically sanitized
  authLogger.info("NWC connection established", {
    npub: "npub1234567890abcdefghijklmnopqrstuvwxyz", // Truncated to npub1234...
    pubkey: "abcdef1234567890abcdef1234567890abcdef12", // Truncated to abcdef12...
    relay: "wss://relay.example.com/path?secret=123", // Becomes relay.example.com
    secret: "super-secret-key", // Becomes [REDACTED]
    ip: "192.168.1.100", // Becomes 192.168.xxx.xxx
  });
}

/**
 * Example 3: Different log levels
 */
function exampleLogLevels() {
  const logger = createLogger("example");

  // Debug information (only shown in development)
  logger.debug("Processing payment request", {
    amount: 1000,
    destination: "user@example.com",
  });

  // General information
  logger.info("Payment processed successfully", {
    paymentId: "pay_123",
    amount: 1000,
  });

  // Warning about potential issues
  logger.warn("Low balance detected", {
    currentBalance: 500,
    requiredAmount: 1000,
  });

  // Error conditions
  logger.error(
    "Payment failed",
    {
      paymentId: "pay_123",
      reason: "insufficient_funds",
    },
    new Error("Insufficient balance")
  );

  // Critical errors that require immediate attention
  logger.fatal(
    "Database connection lost",
    {
      connectionString: "postgres://...",
      retryAttempts: 3,
    },
    new Error("Connection timeout")
  );
}

/**
 * Example 4: Child loggers with request context
 */
function exampleChildLoggers(requestId: string, userId: string) {
  const baseLogger = createLogger("api");

  // Create a child logger with request-specific context
  const requestLogger = baseLogger.child({
    requestId,
    userId: userId.substring(0, 8) + "...", // Manually truncate if needed
  });

  // All logs from this child logger will include the request context
  requestLogger.info("Processing federation request");
  requestLogger.warn("Rate limit approaching");
  requestLogger.error("Request validation failed", {
    validationErrors: ["missing_nip05", "invalid_signature"],
  });
}

/**
 * Example 5: Replacing existing console usage patterns
 */
function exampleReplacements() {
  const logger = createLogger("migration-example");

  // OLD: console.log('Starting process...')
  // NEW:
  logger.info("Starting process");

  // OLD: console.error('Process failed:', error)
  // NEW:
  const error = new Error("Process failed");
  logger.error(
    "Process failed",
    {
      processId: "proc_123",
      step: "validation",
    },
    error
  );

  // OLD: console.warn('Deprecated API usage')
  // NEW:
  logger.warn("Deprecated API usage", {
    apiVersion: "v1",
    endpoint: "/api/old-endpoint",
    deprecationDate: "2024-12-31",
  });

  // OLD: console.debug('Debug info:', debugData)
  // NEW:
  logger.debug("Debug information", {
    debugData: { key: "value" },
    debugLevel: "verbose",
  });
}

/**
 * Example 6: Production monitoring integration
 */
function exampleProductionIntegration() {
  const logger = createLogger("monitoring", {
    level: "info", // Set appropriate level for production
    enableStructured: true, // Enable structured JSON output for log aggregation
  });

  // These logs can be easily parsed by monitoring systems like DataDog, CloudWatch, etc.
  logger.info("User session started", {
    sessionId: "sess_123",
    userAgent: "Mozilla/5.0...",
    ipAddress: "192.168.1.100", // Will be masked automatically
    timestamp: new Date().toISOString(),
  });

  logger.error(
    "Payment processing error",
    {
      paymentId: "pay_456",
      amount: 5000,
      currency: "sats",
      errorCode: "INSUFFICIENT_LIQUIDITY",
      retryable: true,
    },
    new Error("Lightning payment failed")
  );
}

// Export examples for documentation
export {
  exampleBasicLogging,
  exampleChildLoggers,
  exampleLogLevels,
  examplePrivacyLogging,
  exampleProductionIntegration,
  exampleReplacements,
};
