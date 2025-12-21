/**
 * Scheduled Orphan Detection Function
 * Runs daily at 2 AM UTC to detect orphaned NIP-05 records
 *
 * Phase 5: Automation & Monitoring
 *
 * An orphaned NIP-05 record is one that:
 * 1. Has a user_duid that doesn't exist in user_identities
 * 2. Is older than 24 hours (to allow for registration delays)
 *
 * Features:
 * - Automated daily orphan detection
 * - Configurable cleanup thresholds
 * - Dry-run mode for safety
 * - Platform admin notifications
 * - Metrics collection for monitoring
 * - Privacy-safe logging (no PII)
 *
 * Schedule: 0 2 * * * (daily at 2 AM UTC)
 * Timeout: 60 seconds
 *
 * @compliance ESM-only, uses process.env, privacy-first, zero-knowledge
 */

import type { Handler, HandlerContext, HandlerEvent } from "@netlify/functions";
import { supabase } from "./supabase.js";
import { getClientIP } from "./utils/enhanced-rate-limiter.ts";
import { generateRequestId, logError } from "./utils/error-handler.ts";
import {
  errorResponse,
  getSecurityHeaders,
  preflightResponse,
} from "./utils/security-headers.ts";

// Configuration constants
const MAX_ORPHANS_PER_SCAN = 100;
const ORPHAN_AGE_THRESHOLD_HOURS = 24;
const AUTO_CLEANUP_ENABLED = false; // Disabled by default for safety
const CLEANUP_THRESHOLD = 10; // Only auto-cleanup if <= 10 orphans

// Error codes for orphan detection
enum OrphanDetectionErrorCode {
  DATABASE_ERROR = "DATABASE_ERROR",
  SCAN_FAILED = "SCAN_FAILED",
  CLEANUP_FAILED = "CLEANUP_FAILED",
  NOTIFICATION_FAILED = "NOTIFICATION_FAILED",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Metrics collector for orphan detection
 */
interface OrphanDetectionMetrics {
  totalOrphansFound: number;
  orphansCleanedUp: number;
  notificationsSent: number;
  errors: Array<{ code: OrphanDetectionErrorCode; count: number }>;
  startTime: number;
  endTime?: number;
  domains: Record<string, number>;
}

/**
 * Orphan record structure
 */
interface OrphanRecord {
  id: string;
  user_duid: string;
  domain: string;
  entity_type: string;
  created_at: string;
  reason: string;
}

/**
 * Initialize metrics collector
 */
function initMetrics(): OrphanDetectionMetrics {
  return {
    totalOrphansFound: 0,
    orphansCleanedUp: 0,
    notificationsSent: 0,
    errors: [],
    startTime: Date.now(),
    domains: {},
  };
}

/**
 * Record error in metrics
 */
function recordError(
  metrics: OrphanDetectionMetrics,
  errorCode: OrphanDetectionErrorCode
): void {
  const existing = metrics.errors.find((e) => e.code === errorCode);
  if (existing) {
    existing.count++;
  } else {
    metrics.errors.push({ code: errorCode, count: 1 });
  }
}

/**
 * Find orphaned NIP-05 records
 */
async function findOrphanedRecords(
  metrics: OrphanDetectionMetrics,
  domain?: string
): Promise<{ success: boolean; orphans: OrphanRecord[]; error?: string }> {
  const cutoffTime = new Date(
    Date.now() - ORPHAN_AGE_THRESHOLD_HOURS * 60 * 60 * 1000
  ).toISOString();

  try {
    // Query nip05_records
    let query = supabase
      .from("nip05_records")
      .select("id, user_duid, domain, entity_type, created_at")
      .lt("created_at", cutoffTime)
      .limit(MAX_ORPHANS_PER_SCAN * 2);

    if (domain) {
      query = query.eq("domain", domain);
    }

    const { data: nip05Records, error: nip05Error } = await query;

    if (nip05Error) {
      recordError(metrics, OrphanDetectionErrorCode.DATABASE_ERROR);
      return { success: false, orphans: [], error: nip05Error.message };
    }

    if (!nip05Records || nip05Records.length === 0) {
      return { success: true, orphans: [] };
    }

    // Get unique user_duids
    const userDuids = [...new Set(nip05Records.map((r) => r.user_duid))];

    // Check which exist in user_identities
    const { data: existingUsers, error: usersError } = await supabase
      .from("user_identities")
      .select("id")
      .in("id", userDuids);

    if (usersError) {
      recordError(metrics, OrphanDetectionErrorCode.DATABASE_ERROR);
      return { success: false, orphans: [], error: usersError.message };
    }

    const existingUserIds = new Set(existingUsers?.map((u) => u.id) || []);

    // Find orphans (NIP-05 records without matching user_identities)
    const orphans: OrphanRecord[] = nip05Records
      .filter((r) => !existingUserIds.has(r.user_duid))
      .slice(0, MAX_ORPHANS_PER_SCAN)
      .map((r) => ({
        ...r,
        reason: "User identity not found",
      }));

    // Track domains
    orphans.forEach((o) => {
      metrics.domains[o.domain] = (metrics.domains[o.domain] || 0) + 1;
    });

    return { success: true, orphans };
  } catch (error) {
    recordError(metrics, OrphanDetectionErrorCode.SCAN_FAILED);
    return {
      success: false,
      orphans: [],
      error: error instanceof Error ? error.message : "Scan failed",
    };
  }
}

/**
 * Log orphan detection results to database
 */
async function logOrphanDetectionRun(
  metrics: OrphanDetectionMetrics,
  orphans: OrphanRecord[],
  autoCleanedUp: boolean
): Promise<void> {
  try {
    await supabase.from("orphan_detection_runs").insert({
      run_timestamp: new Date().toISOString(),
      orphans_found: metrics.totalOrphansFound,
      orphans_cleaned_up: metrics.orphansCleanedUp,
      auto_cleanup_enabled: AUTO_CLEANUP_ENABLED,
      domains_affected: Object.keys(metrics.domains),
      duration_ms: (metrics.endTime || Date.now()) - metrics.startTime,
      errors: metrics.errors.length > 0 ? metrics.errors : null,
    });
  } catch (error) {
    // Non-fatal: continue even if logging fails
    console.warn("[OrphanDetection] Failed to log run:", error);
  }
}

/**
 * Send notification to platform admins about orphans found
 */
async function notifyAdmins(
  metrics: OrphanDetectionMetrics,
  orphans: OrphanRecord[]
): Promise<boolean> {
  if (orphans.length === 0) return true;

  try {
    // Get platform admin npubs from config
    const { data: adminConfig } = await supabase
      .from("platform_config")
      .select("value")
      .eq("key", "admin_notification_npubs")
      .single();

    if (!adminConfig?.value) {
      // No admin npubs configured, skip notification
      return true;
    }

    // Log notification intent (actual Nostr DM would be sent via separate service)
    await supabase.from("admin_notifications").insert({
      notification_type: "orphan_detection",
      severity: orphans.length > CLEANUP_THRESHOLD ? "warning" : "info",
      title: `Orphan Detection: ${orphans.length} orphaned records found`,
      message: JSON.stringify({
        orphansFound: orphans.length,
        domains: metrics.domains,
        autoCleanupEnabled: AUTO_CLEANUP_ENABLED,
        timestamp: new Date().toISOString(),
      }),
      created_at: new Date().toISOString(),
      read: false,
    });

    metrics.notificationsSent++;
    return true;
  } catch (error) {
    recordError(metrics, OrphanDetectionErrorCode.NOTIFICATION_FAILED);
    return false;
  }
}

/**
 * Main handler for scheduled orphan detection
 */
export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  const requestId = generateRequestId();
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  // Initialize metrics
  const metrics = initMetrics();

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  try {
    // Find orphaned records
    const { success, orphans, error } = await findOrphanedRecords(metrics);

    if (!success) {
      logError(new Error(error || "Scan failed"), {
        requestId,
        endpoint: "scheduled-orphan-detection",
        context: "Orphan scan failed",
      });
      return errorResponse(500, error || "Orphan scan failed", requestOrigin);
    }

    metrics.totalOrphansFound = orphans.length;

    // Auto-cleanup if enabled and below threshold
    let autoCleanedUp = false;
    if (
      AUTO_CLEANUP_ENABLED &&
      orphans.length > 0 &&
      orphans.length <= CLEANUP_THRESHOLD
    ) {
      try {
        const orphanIds = orphans.map((o) => o.id);
        const { error: deleteError } = await supabase
          .from("nip05_records")
          .delete()
          .in("id", orphanIds);

        if (!deleteError) {
          metrics.orphansCleanedUp = orphans.length;
          autoCleanedUp = true;
        } else {
          recordError(metrics, OrphanDetectionErrorCode.CLEANUP_FAILED);
        }
      } catch (cleanupError) {
        recordError(metrics, OrphanDetectionErrorCode.CLEANUP_FAILED);
      }
    }

    // Send admin notifications
    await notifyAdmins(metrics, orphans);

    // Log the run
    metrics.endTime = Date.now();
    await logOrphanDetectionRun(metrics, orphans, autoCleanedUp);

    const durationMs = metrics.endTime - metrics.startTime;

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "Orphan detection complete",
        results: {
          orphansFound: metrics.totalOrphansFound,
          orphansCleanedUp: metrics.orphansCleanedUp,
          autoCleanupEnabled: AUTO_CLEANUP_ENABLED,
          notificationsSent: metrics.notificationsSent,
          domains: metrics.domains,
          durationMs,
          errors: metrics.errors.slice(0, 10),
        },
      }),
    };
  } catch (error) {
    metrics.endTime = Date.now();
    recordError(metrics, OrphanDetectionErrorCode.UNKNOWN_ERROR);

    logError(error, {
      requestId,
      endpoint: "scheduled-orphan-detection",
      method: event.httpMethod,
    });

    return errorResponse(500, "Orphan detection failed", requestOrigin);
  }
};
