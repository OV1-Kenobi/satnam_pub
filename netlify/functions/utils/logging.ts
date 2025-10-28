/**
 * Server-Side Logging Utility for Netlify Functions
 * Phase 2B-2 Day 15: Error Monitoring & Logging Enhancement
 *
 * Provides structured logging for Netlify Functions with:
 * - Log levels (debug, info, warn, error)
 * - Structured JSON format for easy parsing
 * - Contextual metadata (component, action, verificationId, eventType, duration, success)
 * - Environment-based filtering
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  component?: string;
  action?: string;
  userId?: string;
  verificationId?: string;
  eventType?: string;
  metadata?: Record<string, any>;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

// ============================================================================
// LOG LEVEL CONFIGURATION
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Get minimum log level from environment variable
 * Default: "info" for production, "debug" for development
 */
function getMinLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
  if (envLevel && LOG_LEVELS[envLevel] !== undefined) {
    return envLevel;
  }
  // Default to "info" in production, "debug" in development
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const MIN_LOG_LEVEL = getMinLogLevel();

/**
 * Check if a log level should be logged based on minimum level
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
}

// ============================================================================
// CORE LOGGING FUNCTIONS
// ============================================================================

/**
 * Format log entry as structured JSON string
 */
function formatLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext
): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };

  // Format as JSON for structured logging
  return JSON.stringify(entry);
}

/**
 * Log a message at the specified level
 */
function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) {
    return;
  }

  const formattedLog = formatLogEntry(level, message, context);

  // Use console methods based on log level
  switch (level) {
    case "debug":
      console.debug(formattedLog);
      break;
    case "info":
      console.info(formattedLog);
      break;
    case "warn":
      console.warn(formattedLog);
      break;
    case "error":
      console.error(formattedLog);
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a logger instance with default context
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
 * Log an operation with automatic duration tracking
 * Logs start, success/failure, and duration
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
      metadata: {
        ...context?.metadata,
        duration,
        success: true,
      },
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logError(`${operationName} failed: ${errorMessage}`, {
      ...context,
      metadata: {
        ...context?.metadata,
        duration,
        success: false,
        error: errorMessage,
      },
    });

    throw error;
  }
}

/**
 * Log a cache event (hit or miss)
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
 * Log a rate limit event
 */
export function logRateLimitEvent(
  allowed: boolean,
  identifier: string,
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
      identifier,
      limit,
      current,
      allowed,
    },
  });
}

/**
 * Log a database operation
 */
export function logDatabaseOperation(
  operation: string,
  table: string,
  success: boolean,
  duration?: number,
  context?: LogContext
): void {
  const level = success ? "info" : "error";
  const message = success
    ? `Database ${operation} on ${table} succeeded`
    : `Database ${operation} on ${table} failed`;

  log(level, message, {
    ...context,
    metadata: {
      ...context?.metadata,
      operation,
      table,
      success,
      duration,
    },
  });
}

/**
 * Log an API call
 */
export function logApiCall(
  method: string,
  url: string,
  status: number,
  duration: number,
  context?: LogContext
): void {
  const level = status >= 200 && status < 300 ? "info" : "error";
  const message = `API ${method} ${url} returned ${status}`;

  log(level, message, {
    ...context,
    metadata: {
      ...context?.metadata,
      method,
      url,
      status,
      duration,
    },
  });
}

