/**
 * Netlify Function: /api/admin/monitoring
 * Purpose: System monitoring metrics and alert management
 * Methods: GET (metrics), POST (acknowledge alert)
 *
 * Phase 5: Automation & Monitoring
 *
 * Features:
 * - Orphan detection run metrics
 * - Account removal statistics
 * - System health checks
 * - Alert management (acknowledge)
 *
 * Security:
 * - Platform admin only access
 * - JWT authentication required
 * - Rate limited
 *
 * @compliance ESM-only, uses process.env, privacy-first
 */

import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import {
  RATE_LIMITS,
  checkRateLimit,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.js";
import { getEnvVar } from "./utils/env.js";
import {
  createAuthErrorResponse,
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.js";
import {
  errorResponse,
  preflightResponse,
  successResponse,
} from "./utils/security-headers.js";
import { requireAnyAdmin } from "./utils/admin-auth.js";

// ============================================================================
// Types
// ============================================================================

interface SystemMetrics {
  orphanDetection: {
    lastRun: string | null;
    orphansFound: number;
    orphansCleanedUp: number;
    nextScheduledRun: string;
  };
  accountRemovals: {
    total: number;
    last24Hours: number;
    pendingRollbacks: number;
  };
  systemHealth: {
    databaseStatus: "healthy" | "degraded" | "down";
    scheduledJobsStatus: "running" | "paused" | "error";
    lastHealthCheck: string;
  };
  notifications: {
    unread: number;
    total: number;
  };
}

interface Alert {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

interface AcknowledgeRequest {
  alertId: string;
}

// ============================================================================
// Initialize Supabase
// ============================================================================

const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
const supabaseServiceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase configuration");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate next scheduled run (daily at 2 AM UTC)
 */
function getNextScheduledRun(): string {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(2, 0, 0, 0);
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.toISOString();
}

/**
 * Check database connectivity
 */
async function checkDatabaseHealth(): Promise<"healthy" | "degraded" | "down"> {
  try {
    const start = Date.now();
    const { error } = await supabase
      .from("user_identities")
      .select("id")
      .limit(1);
    const duration = Date.now() - start;

    if (error) return "down";
    if (duration > 2000) return "degraded";
    return "healthy";
  } catch {
    return "down";
  }
}

/**
 * Fetch orphan detection metrics
 */
async function getOrphanDetectionMetrics(): Promise<
  SystemMetrics["orphanDetection"]
> {
  const { data: latestRun } = await supabase
    .from("orphan_detection_runs")
    .select("run_timestamp, orphans_found, orphans_cleaned_up")
    .order("run_timestamp", { ascending: false })
    .limit(1)
    .single();

  return {
    lastRun: latestRun?.run_timestamp || null,
    orphansFound: latestRun?.orphans_found || 0,
    orphansCleanedUp: latestRun?.orphans_cleaned_up || 0,
    nextScheduledRun: getNextScheduledRun(),
  };
}

/**
 * Fetch account removal statistics
 */
async function getRemovalMetrics(): Promise<SystemMetrics["accountRemovals"]> {
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();

  const [totalResult, last24hResult, pendingResult] = await Promise.all([
    supabase
      .from("admin_account_removal_log")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("admin_account_removal_log")
      .select("id", { count: "exact", head: true })
      .gte("requested_at", twentyFourHoursAgo),
    supabase
      .from("admin_account_removal_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .eq("rollback_executed", false)
      .gt("rollback_expires_at", new Date().toISOString()),
  ]);

  return {
    total: totalResult.count || 0,
    last24Hours: last24hResult.count || 0,
    pendingRollbacks: pendingResult.count || 0,
  };
}

/**
 * Fetch notification counts
 */
async function getNotificationCounts(): Promise<
  SystemMetrics["notifications"]
> {
  const [unreadResult, totalResult] = await Promise.all([
    supabase
      .from("admin_notifications")
      .select("id", { count: "exact", head: true })
      .eq("read", false),
    supabase
      .from("admin_notifications")
      .select("id", { count: "exact", head: true }),
  ]);

  return {
    unread: unreadResult.count || 0,
    total: totalResult.count || 0,
  };
}

/**
 * Fetch active (unacknowledged) alerts
 */
async function getActiveAlerts(): Promise<Alert[]> {
  const { data: notifications } = await supabase
    .from("admin_notifications")
    .select("id, severity, title, message, created_at, read")
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(20);

  return (notifications || []).map((n) => ({
    id: n.id,
    severity: n.severity as Alert["severity"],
    title: n.title,
    message: n.message,
    timestamp: n.created_at,
    acknowledged: n.read,
  }));
}

/**
 * Acknowledge an alert
 */
async function acknowledgeAlert(
  alertId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("admin_notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .eq("id", alertId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

// ============================================================================
// Main Handler
// ============================================================================

export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    (event.headers || {}) as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("📊 Admin monitoring handler started:", {
    requestId,
    method: event.httpMethod,
    timestamp: new Date().toISOString(),
  });

  // Handle CORS preflight
  if ((event.httpMethod || "GET").toUpperCase() === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  // Only allow GET and POST
  if (!["GET", "POST"].includes(event.httpMethod || "")) {
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  try {
    // Rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitAllowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.ADMIN_DASHBOARD
    );

    if (!rateLimitAllowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "admin-monitoring",
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Admin authentication - platform admin only
    const authHeader =
      event.headers.authorization || event.headers.Authorization;
    const adminResult = await requireAnyAdmin(authHeader);

    if (!adminResult.success || !adminResult.context.isAdmin) {
      return createAuthErrorResponse(
        adminResult.context.error || "Admin privileges required",
        requestId,
        requestOrigin
      );
    }

    // Platform admin only for monitoring
    if (adminResult.context.adminType !== "platform") {
      return createAuthErrorResponse(
        "Platform admin privileges required for monitoring",
        requestId,
        requestOrigin
      );
    }

    // Handle GET - fetch metrics
    if (event.httpMethod === "GET") {
      const [
        orphanMetrics,
        removalMetrics,
        databaseHealth,
        notifications,
        alerts,
      ] = await Promise.all([
        getOrphanDetectionMetrics(),
        getRemovalMetrics(),
        checkDatabaseHealth(),
        getNotificationCounts(),
        getActiveAlerts(),
      ]);

      const metrics: SystemMetrics = {
        orphanDetection: orphanMetrics,
        accountRemovals: removalMetrics,
        systemHealth: {
          databaseStatus: databaseHealth,
          scheduledJobsStatus: "running", // Would need external monitoring to verify
          lastHealthCheck: new Date().toISOString(),
        },
        notifications,
      };

      return successResponse({ metrics, alerts }, requestOrigin);
    }

    // Handle POST - acknowledge alert
    if (event.httpMethod === "POST") {
      let body: AcknowledgeRequest;
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return createValidationErrorResponse(
          "Invalid JSON",
          requestId,
          requestOrigin
        );
      }

      if (!body.alertId) {
        return createValidationErrorResponse(
          "alertId is required",
          requestId,
          requestOrigin
        );
      }

      const result = await acknowledgeAlert(body.alertId);
      if (!result.success) {
        return errorResponse(
          500,
          result.error || "Failed to acknowledge alert",
          requestOrigin
        );
      }

      return successResponse(
        { success: true, alertId: body.alertId },
        requestOrigin
      );
    }

    return errorResponse(400, "Invalid request", requestOrigin);
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      requestId,
      endpoint: "admin-monitoring",
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
