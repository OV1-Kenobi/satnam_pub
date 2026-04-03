/**
 * Scheduled Session Cleanup Function
 * Runs daily to maintain agent session hygiene
 *
 * Phase 2.5 - Step 3: Session Cleanup & Maintenance
 *
 * Operations performed:
 * 1. Hibernate inactive sessions (configurable inactivity threshold)
 * 2. Cleanup terminated sessions beyond retention period
 * 3. Purge expired metadata entries
 * 4. Archive old events with STATE_SNAPSHOT preservation
 *
 * Features:
 * - Automated daily session maintenance
 * - Configurable retention policies
 * - Comprehensive metrics collection
 * - Privacy-safe logging (no PII)
 * - Service-role access for elevated permissions
 *
 * Schedule: 0 3 * * * (daily at 3 AM UTC)
 * Timeout: 120 seconds
 *
 * @compliance ESM-only, uses process.env, privacy-first
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { log, warn, error } from "../../functions/utils/privacy-logger.js";

// Configuration constants
const INACTIVITY_MINUTES = 30; // Hibernate sessions inactive for 30+ minutes
const TERMINATED_RETENTION_DAYS = 30; // Keep terminated sessions for 30 days
const EVENT_RETENTION_DAYS = 90; // Keep regular events for 90 days
const SNAPSHOT_RETENTION_DAYS = 365; // Keep STATE_SNAPSHOT events for 1 year

// Error codes for session cleanup
enum SessionCleanupErrorCode {
  DATABASE_ERROR = "DATABASE_ERROR",
  RPC_FAILED = "RPC_FAILED",
  MAINTENANCE_FAILED = "MAINTENANCE_FAILED",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

interface CleanupMetrics {
  startTime: number;
  endTime?: number;
  durationMs?: number;
  hibernatedSessions: number;
  deletedSessions: number;
  deletedEvents: number;
  deletedMetadata: number;
  purgedMetadata: number;
  archivedEvents: number;
  errors: Array<{ code: string; message: string }>;
}

/**
 * Initialize metrics object
 */
function initMetrics(): CleanupMetrics {
  return {
    startTime: Date.now(),
    hibernatedSessions: 0,
    deletedSessions: 0,
    deletedEvents: 0,
    deletedMetadata: 0,
    purgedMetadata: 0,
    archivedEvents: 0,
    errors: [],
  };
}

/**
 * Record error in metrics
 */
function recordError(
  metrics: CleanupMetrics,
  code: SessionCleanupErrorCode,
  message?: string,
): void {
  metrics.errors.push({
    code,
    message: message || code,
  });
}

/**
 * Get Supabase admin client with service role key
 */
function getSupabaseAdmin() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase configuration (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required)",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Run session maintenance via Supabase RPC
 */
async function runSessionMaintenance(
  metrics: CleanupMetrics,
): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    const supabase = getSupabaseAdmin();

    // Call the composite maintenance function
    const { data, error: rpcError } = await supabase.rpc(
      "run_session_maintenance",
    );

    if (rpcError) {
      recordError(
        metrics,
        SessionCleanupErrorCode.RPC_FAILED,
        rpcError.message,
      );
      return { success: false, error: rpcError.message };
    }

    // Extract metrics from result
    if (data) {
      const hibernateResult = data.hibernate_inactive_sessions || {};
      const cleanupResult = data.cleanup_terminated_sessions || {};
      const purgeResult = data.purge_expired_metadata || {};
      const archiveResult = data.archive_old_events || {};

      metrics.hibernatedSessions = hibernateResult.hibernated_count || 0;
      metrics.deletedSessions = cleanupResult.deleted_sessions || 0;
      metrics.deletedEvents = cleanupResult.deleted_events || 0;
      metrics.deletedMetadata = cleanupResult.deleted_metadata || 0;
      metrics.purgedMetadata = purgeResult.purged_count || 0;
      metrics.archivedEvents =
        (archiveResult.deleted_regular_events || 0) +
        (archiveResult.deleted_snapshot_events || 0);
    }

    return { success: true, result: data };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    recordError(
      metrics,
      SessionCleanupErrorCode.MAINTENANCE_FAILED,
      errorMessage,
    );
    return { success: false, error: errorMessage };
  }
}

/**
 * Main handler for scheduled session cleanup
 */
export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext,
) => {
  const requestId = `cleanup-${Date.now()}`;

  // Initialize metrics
  const metrics = initMetrics();

  log("session-cleanup-started", {
    requestId,
    timestamp: new Date().toISOString(),
    config: {
      inactivityMinutes: INACTIVITY_MINUTES,
      terminatedRetentionDays: TERMINATED_RETENTION_DAYS,
      eventRetentionDays: EVENT_RETENTION_DAYS,
      snapshotRetentionDays: SNAPSHOT_RETENTION_DAYS,
    },
  });

  try {
    // Run session maintenance
    const {
      success,
      result,
      error: maintenanceError,
    } = await runSessionMaintenance(metrics);

    if (!success) {
      error("session-cleanup-failed", {
        requestId,
        error: maintenanceError,
        timestamp: new Date().toISOString(),
      });

      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: maintenanceError || "Session maintenance failed",
          requestId,
        }),
      };
    }

    // Calculate duration
    metrics.endTime = Date.now();
    metrics.durationMs = metrics.endTime - metrics.startTime;

    // Log success with metrics
    log("session-cleanup-completed", {
      requestId,
      timestamp: new Date().toISOString(),
      durationMs: metrics.durationMs,
      metrics: {
        hibernatedSessions: metrics.hibernatedSessions,
        deletedSessions: metrics.deletedSessions,
        deletedEvents: metrics.deletedEvents,
        deletedMetadata: metrics.deletedMetadata,
        purgedMetadata: metrics.purgedMetadata,
        archivedEvents: metrics.archivedEvents,
      },
      errors: metrics.errors.length > 0 ? metrics.errors : undefined,
    });

    // Return success response
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        requestId,
        timestamp: new Date().toISOString(),
        durationMs: metrics.durationMs,
        summary: {
          hibernatedSessions: metrics.hibernatedSessions,
          deletedSessions: metrics.deletedSessions,
          deletedEvents: metrics.deletedEvents,
          deletedMetadata: metrics.deletedMetadata,
          purgedMetadata: metrics.purgedMetadata,
          archivedEvents: metrics.archivedEvents,
        },
        details: result,
        errors: metrics.errors.length > 0 ? metrics.errors : undefined,
      }),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    recordError(metrics, SessionCleanupErrorCode.UNKNOWN_ERROR, errorMessage);

    error("session-cleanup-exception", {
      requestId,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        requestId,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
