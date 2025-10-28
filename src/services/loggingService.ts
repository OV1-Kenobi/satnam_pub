/**
 * Centralized Logging Service
 * Phase 2B-2 Day 15 Task 2: Structured Logging System
 *
 * Provides structured logging with:
 * - Log levels (debug, info, warn, error)
 * - Environment-based filtering (verbose in dev, minimal in prod)
 * - Contextual metadata (userId, verificationId, eventType, duration, etc.)
 * - Integration with Sentry for error-level logs
 * - Privacy-first: No PII in console logs; hashed/encrypted identifiers only in error tracking
 *
 * PRIVACY POLICY:
 * - Console logs: No PII (userId excluded from formatLogEntry)
 * - Sentry error tracking: Hashed/encrypted userId only (for correlation, not identification)
 * - All userId values MUST be hashed before being passed to this service
 */

import { captureSimpleProofError } from "../lib/sentry";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

// ============================================================================
// PRIVACY VALIDATION
// ============================================================================

/**
 * Validate that userId appears to be hashed (not raw PII)
 * Development-only warning to catch privacy violations
 *
 * Hashed values should be:
 * - 64+ characters (SHA-256 hex = 64 chars, SHA-512 hex = 128 chars)
 * - Hexadecimal only (0-9, a-f)
 * - NOT start with "npub1" (raw Nostr public key)
 * - NOT contain "@" (email/NIP-05)
 * - NOT be a UUID format (raw user ID)
 */
function validateHashedUserId(
  userId: string | undefined,
  context?: LogContext
): void {
  if (!userId) return;

  const isDevelopment =
    typeof process !== "undefined" && process.env.NODE_ENV === "development";
  if (!isDevelopment) return; // Only validate in development

  const warnings: string[] = [];

  // Check for raw npub
  if (userId.startsWith("npub1")) {
    warnings.push('userId appears to be raw npub (starts with "npub1")');
  }

  // Check for email/NIP-05
  if (userId.includes("@")) {
    warnings.push('userId appears to be email/NIP-05 (contains "@")');
  }

  // Check for UUID format
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(userId)) {
    warnings.push("userId appears to be raw UUID");
  }

  // Check minimum length (hashes should be 64+ chars)
  if (userId.length < 64) {
    warnings.push(
      `userId too short (${userId.length} chars, expected 64+ for hash)`
    );
  }

  // Check if hexadecimal
  const hexPattern = /^[0-9a-f]+$/i;
  if (!hexPattern.test(userId)) {
    warnings.push(
      "userId contains non-hexadecimal characters (expected hash format)"
    );
  }

  if (warnings.length > 0) {
    console.warn(
      "⚠️  PRIVACY VIOLATION: Unhashed userId detected in logging call",
      {
        userId: userId.substring(0, 20) + "...", // Truncate for safety
        warnings,
        component: context?.component,
        action: context?.action,
        stack: new Error().stack?.split("\n").slice(2, 5).join("\n"), // Show call site
      }
    );
    console.warn(
      "   Fix: Use hashUserData() from lib/security/privacy-hashing.js or auth.user?.hashed_npub"
    );
  }
}

export interface LogContext {
  component?: string;
  action?: string;
  /**
   * PRIVACY REQUIREMENT: userId MUST be hashed before passing to logging functions
   * - Use hashUserData() from lib/security/privacy-hashing.js
   * - Or use auth.user?.hashed_npub if available
   * - NEVER pass raw user IDs, npubs, or other PII
   * - Runtime validation will warn in development if unhashed values are detected
   */
  userId?: string;
  verificationId?: string;
  eventType?: string;
  duration?: number;
  success?: boolean;
  metadata?: Record<string, any>;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Get minimum log level from environment (default: info in prod, debug in dev)
function getMinLogLevel(): LogLevel {
  const env = import.meta.env.MODE || "development";
  const isDev = env === "development";

  // Allow override via environment variable
  const envLogLevel = import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined;
  if (envLogLevel && LOG_LEVELS[envLogLevel] !== undefined) {
    return envLogLevel;
  }

  // Default: debug in dev, info in prod
  return isDev ? "debug" : "info";
}

const MIN_LOG_LEVEL = getMinLogLevel();

// ============================================================================
// LOGGING FUNCTIONS
// ============================================================================

/**
 * Check if a log level should be logged based on minimum level
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
}

/**
 * Format log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    entry.message,
  ];

  if (entry.context) {
    const contextParts: string[] = [];

    if (entry.context.component) {
      contextParts.push(`component=${entry.context.component}`);
    }
    if (entry.context.action) {
      contextParts.push(`action=${entry.context.action}`);
    }
    if (entry.context.verificationId) {
      contextParts.push(`verificationId=${entry.context.verificationId}`);
    }
    if (entry.context.eventType) {
      contextParts.push(`eventType=${entry.context.eventType}`);
    }
    if (entry.context.duration !== undefined) {
      contextParts.push(`duration=${entry.context.duration}ms`);
    }
    if (entry.context.success !== undefined) {
      contextParts.push(`success=${entry.context.success}`);
    }

    if (contextParts.length > 0) {
      parts.push(`{${contextParts.join(", ")}}`);
    }

    // FIXED: Handle JSON.stringify errors for circular references
    if (entry.context.metadata) {
      try {
        parts.push(JSON.stringify(entry.context.metadata));
      } catch (err) {
        parts.push("[metadata serialization failed]");
      }
    }
  }

  return parts.join(" ");
}

/**
 * Log a message with the specified level
 */
function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) {
    return;
  }

  // PRIVACY: Validate userId is hashed (development-only warning)
  validateHashedUserId(context?.userId, context);

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };

  const formattedMessage = formatLogEntry(entry);

  // Console output
  switch (level) {
    case "debug":
      console.debug(formattedMessage);
      break;
    case "info":
      console.info(formattedMessage);
      break;
    case "warn":
      console.warn(formattedMessage);
      break;
    case "error":
      console.error(formattedMessage);

      // FIXED: Always send errors to Sentry (even without context) for better diagnostics
      // Use optional chaining to handle missing context gracefully
      captureSimpleProofError(new Error(message), {
        component: context?.component,
        action: context?.action,
        verificationId: context?.verificationId,
        eventType: context?.eventType,
        userId: context?.userId, // PRIVACY: Must be hashed (validated above)
        metadata: context?.metadata,
      });
      break;
  }
}

/**
 * Log a debug message
 */
export function logDebug(message: string, context?: LogContext): void {
  log("debug", message, context);
}

/**
 * Log an info message
 */
export function logInfo(message: string, context?: LogContext): void {
  log("info", message, context);
}

/**
 * Log a warning message
 */
export function logWarn(message: string, context?: LogContext): void {
  log("warn", message, context);
}

/**
 * Log an error message
 */
export function logError(message: string, context?: LogContext): void {
  log("error", message, context);
}

/**
 * Create a logger instance with pre-filled context
 */
export function createLogger(defaultContext: LogContext) {
  return {
    debug: (message: string, additionalContext?: LogContext) =>
      logDebug(message, { ...defaultContext, ...additionalContext }),
    info: (message: string, additionalContext?: LogContext) =>
      logInfo(message, { ...defaultContext, ...additionalContext }),
    warn: (message: string, additionalContext?: LogContext) =>
      logWarn(message, { ...defaultContext, ...additionalContext }),
    error: (message: string, additionalContext?: LogContext) =>
      logError(message, { ...defaultContext, ...additionalContext }),
  };
}

/**
 * Measure and log operation duration
 */
export async function logOperation<T>(
  operationName: string,
  operation: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const startTime = Date.now();

  logDebug(`${operationName} started`, context);

  try {
    const result = await operation();
    const duration = Date.now() - startTime;

    logInfo(`${operationName} completed`, {
      ...context,
      duration,
      success: true,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logError(`${operationName} failed: ${errorMessage}`, {
      ...context,
      duration,
      success: false,
      metadata: {
        ...context?.metadata,
        error: errorMessage,
      },
    });

    throw error;
  }
}

/**
 * Log cache hit/miss
 */
export function logCacheEvent(
  hit: boolean,
  cacheKey: string,
  context?: LogContext
): void {
  logDebug(`Cache ${hit ? "HIT" : "MISS"}`, {
    ...context,
    metadata: {
      ...context?.metadata,
      cacheKey,
      hit,
    },
  });
}

/**
 * Log rate limit check
 */
export function logRateLimitEvent(
  allowed: boolean,
  limit: number,
  current: number,
  context?: LogContext
): void {
  const level = allowed ? "debug" : "warn";
  const message = allowed
    ? `Rate limit check passed (${current}/${limit})`
    : `Rate limit exceeded (${current}/${limit})`;

  log(level, message, {
    ...context,
    metadata: {
      ...context?.metadata,
      allowed,
      limit,
      current,
    },
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const logger = {
  debug: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
  createLogger,
  logOperation,
  logCacheEvent,
  logRateLimitEvent,
};

export default logger;
