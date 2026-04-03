/**
 * Session Logger - Privacy-Aware Structured Logging for Agent Sessions
 *
 * Phase 2.5 - Step 9: Comprehensive Logging with Privacy-Logger Patterns
 *
 * Features:
 * - Extends privacy-logger.js patterns for session-specific logging
 * - Structured JSON format for log aggregation
 * - Performance timing for RPC calls and queries
 * - Automatic redaction of sensitive fields (session_id, agent_id, event_data, etc.)
 * - Browser-compatible (no Node.js-specific APIs)
 * - Log levels: DEBUG, INFO, WARN, ERROR
 *
 * @module utils/session-logger
 */

import {
  log as privacyLog,
  warn as privacyWarn,
  error as privacyError,
} from "./privacy-logger.js";

// ============================================================================
// Types
// ============================================================================

export type SessionLogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface SessionLogContext {
  component?: string;
  session_id?: string;
  agent_id?: string;
  session_type?: string;
  channel?: string;
  event_type?: string;
  duration?: number;
  success?: boolean;
  from_status?: string;
  to_status?: string;
  error_type?: string;
  tokens_used?: number;
  sats_cost?: number;
  [key: string]: any;
}

export interface SessionLogEntry {
  timestamp: string;
  level: SessionLogLevel;
  component: string;
  message: string;
  context?: SessionLogContext;
}

// ============================================================================
// Performance Thresholds
// ============================================================================

const SLOW_RPC_THRESHOLD_MS = 500;
const SLOW_QUERY_THRESHOLD_MS = 1000;

// ============================================================================
// Core Logging Functions
// ============================================================================

/**
 * Format a structured log entry.
 */
function formatLogEntry(
  level: SessionLogLevel,
  message: string,
  context?: SessionLogContext,
): SessionLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    component: context?.component || "agent-session",
    message,
    context,
  };
}

/**
 * Log at DEBUG level.
 */
export function logDebug(message: string, context?: SessionLogContext): void {
  const entry = formatLogEntry("DEBUG", message, context);
  privacyLog("[DEBUG]", entry);
}

/**
 * Log at INFO level.
 */
export function logInfo(message: string, context?: SessionLogContext): void {
  const entry = formatLogEntry("INFO", message, context);
  privacyLog("[INFO]", entry);
}

/**
 * Log at WARN level.
 */
export function logWarn(message: string, context?: SessionLogContext): void {
  const entry = formatLogEntry("WARN", message, context);
  privacyWarn("[WARN]", entry);
}

/**
 * Log at ERROR level.
 */
export function logError(
  message: string,
  context?: SessionLogContext,
  error?: Error,
): void {
  const entry = formatLogEntry("ERROR", message, {
    ...context,
    error_type: error?.name,
    error_message: error?.message,
    error_stack: error?.stack,
  });
  privacyError("[ERROR]", entry);
}

// ============================================================================
// Session-Specific Logging Functions (Task 9.2)
// ============================================================================

/**
 * Log session creation with redacted context.
 */
export function logSessionCreate(session: {
  session_id: string;
  agent_id: string;
  session_type: string;
  primary_channel: string;
  [key: string]: any;
}): void {
  logInfo("Session created", {
    component: "agent-session",
    session_id: session.session_id, // Will be redacted by privacy-logger
    agent_id: session.agent_id, // Will be redacted by privacy-logger
    session_type: session.session_type,
    channel: session.primary_channel,
    success: true,
  });
}

/**
 * Log session event with redacted event_data.
 */
export function logSessionEvent(event: {
  session_id: string;
  event_type: string;
  event_data?: any;
  tokens_used?: number;
  sats_cost?: number;
  [key: string]: any;
}): void {
  logDebug("Session event logged", {
    component: "agent-session",
    session_id: event.session_id, // Will be redacted
    event_type: event.event_type,
    tokens_used: event.tokens_used,
    sats_cost: event.sats_cost,
    success: true,
  });
}

/**
 * Log session state transition.
 */
export function logSessionTransition(
  sessionId: string,
  fromStatus: string,
  toStatus: string,
  reason?: string,
): void {
  logInfo("Session state transition", {
    component: "agent-session",
    session_id: sessionId, // Will be redacted
    from_status: fromStatus,
    to_status: toStatus,
    message: reason,
    success: true,
  });
}

/**
 * Log session error with full stack but redacted user data.
 */
export function logSessionError(
  sessionId: string,
  error: Error | string,
  context?: Record<string, any>,
): void {
  const errorObj = error instanceof Error ? error : new Error(error);

  logError(
    "Session error occurred",
    {
      component: "agent-session",
      session_id: sessionId, // Will be redacted
      error_type: errorObj.name,
      ...context,
    },
    errorObj,
  );
}

/**
 * Log session cleanup operation results.
 */
export function logSessionCleanup(summary: {
  hibernated_count?: number;
  terminated_count?: number;
  archived_count?: number;
  purged_count?: number;
  duration?: number;
  [key: string]: any;
}): void {
  logInfo("Session cleanup completed", {
    component: "agent-session-cleanup",
    hibernated_count: summary.hibernated_count,
    terminated_count: summary.terminated_count,
    archived_count: summary.archived_count,
    purged_count: summary.purged_count,
    duration: summary.duration,
    success: true,
  });
}

// ============================================================================
// Performance Timing Functions (Task 9.4)
// ============================================================================

/**
 * Measure and log RPC call duration.
 * Warns if duration exceeds SLOW_RPC_THRESHOLD_MS (500ms).
 */
export async function logRpcCall<T>(
  rpcName: string,
  operation: () => Promise<T>,
  context?: SessionLogContext,
): Promise<T> {
  const startTime = Date.now();

  logDebug(`RPC call started: ${rpcName}`, {
    component: "agent-session-rpc",
    operation: rpcName,
    ...context,
  });

  try {
    const result = await operation();
    const duration = Date.now() - startTime;

    if (duration > SLOW_RPC_THRESHOLD_MS) {
      logWarn(`Slow RPC call: ${rpcName}`, {
        component: "agent-session-rpc",
        operation: rpcName,
        duration,
        success: true,
        ...context,
      });
    } else {
      logDebug(`RPC call completed: ${rpcName}`, {
        component: "agent-session-rpc",
        operation: rpcName,
        duration,
        success: true,
        ...context,
      });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));

    logError(
      `RPC call failed: ${rpcName}`,
      {
        component: "agent-session-rpc",
        operation: rpcName,
        duration,
        success: false,
        ...context,
      },
      errorObj,
    );

    throw error;
  }
}

/**
 * Measure and log Supabase query duration.
 * Warns if duration exceeds SLOW_QUERY_THRESHOLD_MS (1000ms).
 */
export async function logQuery<T>(
  queryName: string,
  operation: () => Promise<T>,
  context?: SessionLogContext,
): Promise<T> {
  const startTime = Date.now();

  logDebug(`Query started: ${queryName}`, {
    component: "agent-session-query",
    operation: queryName,
    ...context,
  });

  try {
    const result = await operation();
    const duration = Date.now() - startTime;

    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      logWarn(`Slow query: ${queryName}`, {
        component: "agent-session-query",
        operation: queryName,
        duration,
        success: true,
        ...context,
      });
    } else {
      logDebug(`Query completed: ${queryName}`, {
        component: "agent-session-query",
        operation: queryName,
        duration,
        success: true,
        ...context,
      });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));

    logError(
      `Query failed: ${queryName}`,
      {
        component: "agent-session-query",
        operation: queryName,
        duration,
        success: false,
        ...context,
      },
      errorObj,
    );

    throw error;
  }
}

/**
 * Measure and log API call duration.
 */
export async function logApiCall<T>(
  endpoint: string,
  method: string,
  operation: () => Promise<T>,
  context?: SessionLogContext,
): Promise<T> {
  const startTime = Date.now();

  logDebug(`API call started: ${method} ${endpoint}`, {
    component: "agent-session-api",
    operation: `${method} ${endpoint}`,
    ...context,
  });

  try {
    const result = await operation();
    const duration = Date.now() - startTime;

    logInfo(`API call completed: ${method} ${endpoint}`, {
      component: "agent-session-api",
      operation: `${method} ${endpoint}`,
      duration,
      success: true,
      ...context,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));

    logError(
      `API call failed: ${method} ${endpoint}`,
      {
        component: "agent-session-api",
        operation: `${method} ${endpoint}`,
        duration,
        success: false,
        ...context,
      },
      errorObj,
    );

    throw error;
  }
}

// ============================================================================
// Batch Event Logging
// ============================================================================

/**
 * Log batch event flush operation.
 */
export function logEventBatchFlush(
  batchSize: number,
  duration: number,
  success: boolean,
): void {
  if (success) {
    logDebug("Event batch flushed", {
      component: "agent-session-events",
      operation: "batch_flush",
      batch_size: batchSize,
      duration,
      success: true,
    });
  } else {
    logWarn("Event batch flush failed", {
      component: "agent-session-events",
      operation: "batch_flush",
      batch_size: batchSize,
      duration,
      success: false,
    });
  }
}

// ============================================================================
// Realtime Subscription Logging
// ============================================================================

/**
 * Log realtime subscription status.
 */
export function logRealtimeSubscription(
  channel: string,
  status: "SUBSCRIBED" | "CHANNEL_ERROR" | "RECONNECTING",
  error?: Error,
): void {
  if (status === "SUBSCRIBED") {
    logInfo("Realtime subscription established", {
      component: "agent-session-realtime",
      channel,
      success: true,
    });
  } else if (status === "CHANNEL_ERROR") {
    logError(
      "Realtime subscription error",
      {
        component: "agent-session-realtime",
        channel,
        success: false,
      },
      error,
    );
  } else if (status === "RECONNECTING") {
    logWarn("Realtime subscription reconnecting", {
      component: "agent-session-realtime",
      channel,
      success: false,
    });
  }
}

// ============================================================================
// Cache Logging
// ============================================================================

/**
 * Log cache hit/miss.
 */
export function logCacheAccess(
  cacheKey: string,
  hit: boolean,
  ttl?: number,
): void {
  logDebug(hit ? "Cache hit" : "Cache miss", {
    component: "agent-session-cache",
    operation: hit ? "cache_hit" : "cache_miss",
    cache_key: cacheKey,
    ttl,
  });
}

/**
 * Log cache invalidation.
 */
export function logCacheInvalidation(
  reason: string,
  keysCleared?: number,
): void {
  logDebug("Cache invalidated", {
    component: "agent-session-cache",
    operation: "cache_invalidate",
    message: reason,
    keys_cleared: keysCleared,
  });
}
