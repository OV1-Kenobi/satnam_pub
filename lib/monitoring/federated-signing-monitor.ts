/**
 * Federated Signing Monitoring and Alerting
 *
 * MASTER CONTEXT COMPLIANCE:
 * ✅ Privacy-first logging (no PII exposure)
 * ✅ Structured error data for debugging
 * ✅ Metrics tracking for success/failure rates
 * ✅ Database query helpers for monitoring dashboards
 * ✅ Cleanup functions for expired requests
 *
 * Version: 1.0.0
 * Date: 2025-10-27
 */

import { supabase as createSupabaseClient } from "../../src/lib/supabase.js";

/**
 * Signing request status type (SSS)
 */
export type SigningRequestStatus =
  | "pending"
  | "completed"
  | "failed"
  | "expired";

/**
 * FROST session status type
 */
export type FrostSessionStatus =
  | "pending"
  | "collecting_commitments"
  | "aggregating"
  | "completed"
  | "failed"
  | "expired";

/**
 * Signing request metrics (SSS)
 */
export interface SigningRequestMetrics {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  expired: number;
  successRate: number;
  failureRate: number;
  averageCompletionTime?: number; // in milliseconds
}

/**
 * FROST session metrics
 */
export interface FrostSessionMetrics {
  total: number;
  pending: number;
  collectingCommitments: number;
  aggregating: number;
  completed: number;
  failed: number;
  expired: number;
  successRate: number;
  failureRate: number;
  averageCompletionTime?: number; // in milliseconds
  averageNonceCollectionTime?: number; // Round 1 time
  averageSigningTime?: number; // Round 2 time
}

/**
 * Failed signing request details (SSS)
 */
export interface FailedSigningRequest {
  request_id: string;
  family_id: string;
  created_by: string;
  threshold: number;
  status: SigningRequestStatus;
  error_message?: string;
  created_at: number;
  failed_at?: number;
  expires_at: number;
}

/**
 * Failed FROST session details
 */
export interface FailedFrostSession {
  session_id: string;
  family_id: string;
  created_by: string;
  threshold: number;
  participants: string[];
  status: FrostSessionStatus;
  error_message?: string;
  created_at: number;
  failed_at?: number;
  expires_at: number;
  nonce_collection_started_at?: number;
  signing_started_at?: number;
}

/**
 * Monitoring query options
 */
export interface MonitoringQueryOptions {
  familyId?: string;
  createdBy?: string;
  status?: SigningRequestStatus;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

/**
 * Federated Signing Monitor
 *
 * Provides monitoring, alerting, and cleanup functions for federated signing requests
 */
export class FederatedSigningMonitor {
  private supabase: any;

  constructor() {
    this.supabase = createSupabaseClient;
  }

  /**
   * Initialize Supabase client (no-op since client is already initialized)
   */
  private async initSupabase() {
    // Client is already initialized in constructor
  }

  /**
   * Get failed signing requests
   *
   * @param options - Query options for filtering
   * @returns Array of failed signing requests
   */
  async getFailedRequests(
    options: MonitoringQueryOptions = {}
  ): Promise<FailedSigningRequest[]> {
    try {
      await this.initSupabase();

      let query = this.supabase
        .from("sss_signing_requests")
        .select(
          "request_id, family_id, created_by, threshold, status, error_message, created_at, failed_at, expires_at"
        )
        .eq("status", "failed")
        .order("failed_at", { ascending: false });

      // Apply filters
      if (options.familyId) {
        query = query.eq("family_id", options.familyId);
      }

      if (options.createdBy) {
        query = query.eq("created_by", options.createdBy);
      }

      if (options.startTime) {
        query = query.gte("failed_at", options.startTime);
      }

      if (options.endTime) {
        query = query.lte("failed_at", options.endTime);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[Monitor] Error fetching failed requests:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("[Monitor] Exception fetching failed requests:", error);
      return [];
    }
  }

  /**
   * Get signing request metrics
   *
   * @param options - Query options for filtering
   * @returns Metrics for signing requests
   */
  async getMetrics(
    options: MonitoringQueryOptions = {}
  ): Promise<SigningRequestMetrics> {
    try {
      await this.initSupabase();

      let query = this.supabase
        .from("sss_signing_requests")
        .select("status, created_at, completed_at");

      // Apply filters
      if (options.familyId) {
        query = query.eq("family_id", options.familyId);
      }

      if (options.createdBy) {
        query = query.eq("created_by", options.createdBy);
      }

      if (options.startTime) {
        query = query.gte("created_at", options.startTime);
      }

      if (options.endTime) {
        query = query.lte("created_at", options.endTime);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[Monitor] Error fetching metrics:", error);
        return this.getEmptyMetrics();
      }

      const requests = data || [];
      const total = requests.length;
      const pending = requests.filter(
        (r: any) => r.status === "pending"
      ).length;
      const completed = requests.filter(
        (r: any) => r.status === "completed"
      ).length;
      const failed = requests.filter((r: any) => r.status === "failed").length;
      const expired = requests.filter(
        (r: any) => r.status === "expired"
      ).length;

      const successRate = total > 0 ? (completed / total) * 100 : 0;
      const failureRate = total > 0 ? (failed / total) * 100 : 0;

      // Calculate average completion time for completed requests
      const completedRequests = requests.filter(
        (r: any) => r.status === "completed" && r.completed_at && r.created_at
      );

      let averageCompletionTime: number | undefined;
      if (completedRequests.length > 0) {
        const totalTime = completedRequests.reduce(
          (sum: number, r: any) => sum + (r.completed_at - r.created_at),
          0
        );
        averageCompletionTime = totalTime / completedRequests.length;
      }

      return {
        total,
        pending,
        completed,
        failed,
        expired,
        successRate: Math.round(successRate * 100) / 100,
        failureRate: Math.round(failureRate * 100) / 100,
        averageCompletionTime,
      };
    } catch (error) {
      console.error("[Monitor] Exception fetching metrics:", error);
      return this.getEmptyMetrics();
    }
  }

  /**
   * Log structured error data for failed signing request
   *
   * @param requestId - Request identifier
   * @param error - Error object or message
   * @param context - Additional context data
   */
  logFailedRequest(
    requestId: string,
    error: Error | string,
    context: Record<string, any> = {}
  ): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Structured logging (privacy-first - no PII)
    console.error("[SSS Monitor] Failed Signing Request", {
      requestId,
      error: errorMessage,
      stack: errorStack,
      context: {
        ...context,
        timestamp: Date.now(),
      },
    });

    // In production, this could send to external monitoring service
    // (e.g., Sentry, DataDog, CloudWatch, etc.)
  }

  /**
   * Cleanup expired signing requests
   *
   * @param retentionDays - Number of days to retain expired requests (default: 90)
   * @returns Number of requests cleaned up
   */
  async cleanupExpiredRequests(retentionDays: number = 90): Promise<number> {
    try {
      await this.initSupabase();

      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      const { data, error } = await this.supabase
        .from("sss_signing_requests")
        .delete()
        .in("status", ["completed", "failed", "expired"])
        .lt("created_at", cutoffTime)
        .select("request_id");

      if (error) {
        console.error("[Monitor] Error cleaning up expired requests:", error);
        return 0;
      }

      const cleanedCount = data?.length || 0;
      console.log(
        `[Monitor] Cleaned up ${cleanedCount} expired signing requests`
      );

      return cleanedCount;
    } catch (error) {
      console.error("[Monitor] Exception cleaning up expired requests:", error);
      return 0;
    }
  }

  /**
   * Mark pending requests as expired if past expiration time
   *
   * @returns Number of requests marked as expired
   */
  async expireOldRequests(): Promise<number> {
    try {
      await this.initSupabase();

      const now = Date.now();

      const { data, error } = await this.supabase
        .from("sss_signing_requests")
        .update({
          status: "expired",
          updated_at: now,
        })
        .eq("status", "pending")
        .lt("expires_at", now)
        .select("request_id");

      if (error) {
        console.error("[Monitor] Error expiring old requests:", error);
        return 0;
      }

      const expiredCount = data?.length || 0;
      if (expiredCount > 0) {
        console.log(`[Monitor] Marked ${expiredCount} requests as expired`);
      }

      return expiredCount;
    } catch (error) {
      console.error("[Monitor] Exception expiring old requests:", error);
      return 0;
    }
  }

  /**
   * Get empty metrics object
   */
  private getEmptyMetrics(): SigningRequestMetrics {
    return {
      total: 0,
      pending: 0,
      completed: 0,
      failed: 0,
      expired: 0,
      successRate: 0,
      failureRate: 0,
    };
  }

  /**
   * Check if a signing request should trigger an alert
   *
   * @param failureRate - Current failure rate percentage
   * @param threshold - Alert threshold percentage (default: 25%)
   * @returns True if alert should be triggered
   */
  shouldAlert(failureRate: number, threshold: number = 25): boolean {
    return failureRate >= threshold;
  }

  /**
   * Get recent activity summary
   *
   * @param hours - Number of hours to look back (default: 24)
   * @returns Activity summary
   */
  async getRecentActivity(hours: number = 24): Promise<{
    metrics: SigningRequestMetrics;
    failedRequests: FailedSigningRequest[];
    shouldAlert: boolean;
  }> {
    const startTime = Date.now() - hours * 60 * 60 * 1000;

    const [metrics, failedRequests] = await Promise.all([
      this.getMetrics({ startTime }),
      this.getFailedRequests({ startTime, limit: 10 }),
    ]);

    const shouldAlert = this.shouldAlert(metrics.failureRate);

    return {
      metrics,
      failedRequests,
      shouldAlert,
    };
  }

  // ============================================================================
  // FROST Session Monitoring Methods
  // ============================================================================

  /**
   * Get FROST session metrics
   *
   * @param options - Query options for filtering
   * @returns Metrics for FROST signing sessions
   */
  async getFrostSessionMetrics(
    options: MonitoringQueryOptions = {}
  ): Promise<FrostSessionMetrics> {
    try {
      await this.initSupabase();

      let query = this.supabase
        .from("frost_signing_sessions")
        .select(
          "status, created_at, completed_at, nonce_collection_started_at, signing_started_at"
        );

      // Apply filters
      if (options.familyId) {
        query = query.eq("family_id", options.familyId);
      }

      if (options.createdBy) {
        query = query.eq("created_by", options.createdBy);
      }

      if (options.startTime) {
        query = query.gte("created_at", options.startTime);
      }

      if (options.endTime) {
        query = query.lte("created_at", options.endTime);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[FROST Monitor] Error fetching metrics:", error);
        return this.getEmptyFrostMetrics();
      }

      const sessions = data || [];
      const total = sessions.length;
      const pending = sessions.filter(
        (s: { status: string }) => s.status === "pending"
      ).length;
      const collectingCommitments = sessions.filter(
        (s: { status: string }) => s.status === "collecting_commitments"
      ).length;
      const aggregating = sessions.filter(
        (s: { status: string }) => s.status === "aggregating"
      ).length;
      const completed = sessions.filter(
        (s: { status: string }) => s.status === "completed"
      ).length;
      const failed = sessions.filter(
        (s: { status: string }) => s.status === "failed"
      ).length;
      const expired = sessions.filter(
        (s: { status: string }) => s.status === "expired"
      ).length;

      const successRate = total > 0 ? (completed / total) * 100 : 0;
      const failureRate = total > 0 ? (failed / total) * 100 : 0;

      // Calculate timing metrics
      const completedSessions = sessions.filter(
        (s: {
          status: string;
          completed_at?: number;
          created_at?: number;
          nonce_collection_started_at?: number;
          signing_started_at?: number;
        }) => s.status === "completed" && s.completed_at && s.created_at
      );

      let averageCompletionTime: number | undefined;
      let averageNonceCollectionTime: number | undefined;
      let averageSigningTime: number | undefined;

      if (completedSessions.length > 0) {
        const totalTime = completedSessions.reduce(
          (sum: number, s: { completed_at: number; created_at: number }) =>
            sum + (s.completed_at - s.created_at),
          0
        );
        averageCompletionTime = totalTime / completedSessions.length;

        // Nonce collection time (pending -> collecting_commitments -> aggregating)
        const withNonceTime = completedSessions.filter(
          (s: {
            nonce_collection_started_at?: number;
            signing_started_at?: number;
          }) => s.nonce_collection_started_at && s.signing_started_at
        );
        if (withNonceTime.length > 0) {
          const totalNonceTime = withNonceTime.reduce(
            (
              sum: number,
              s: {
                signing_started_at: number;
                nonce_collection_started_at: number;
              }
            ) => sum + (s.signing_started_at - s.nonce_collection_started_at),
            0
          );
          averageNonceCollectionTime = totalNonceTime / withNonceTime.length;
        }

        // Signing time (aggregating -> completed)
        const withSigningTime = completedSessions.filter(
          (s: { signing_started_at?: number; completed_at?: number }) =>
            s.signing_started_at && s.completed_at
        );
        if (withSigningTime.length > 0) {
          const totalSigningTime = withSigningTime.reduce(
            (
              sum: number,
              s: { completed_at: number; signing_started_at: number }
            ) => sum + (s.completed_at - s.signing_started_at),
            0
          );
          averageSigningTime = totalSigningTime / withSigningTime.length;
        }
      }

      return {
        total,
        pending,
        collectingCommitments,
        aggregating,
        completed,
        failed,
        expired,
        successRate: Math.round(successRate * 100) / 100,
        failureRate: Math.round(failureRate * 100) / 100,
        averageCompletionTime,
        averageNonceCollectionTime,
        averageSigningTime,
      };
    } catch (error) {
      console.error("[FROST Monitor] Exception fetching metrics:", error);
      return this.getEmptyFrostMetrics();
    }
  }

  /**
   * Get failed FROST sessions
   *
   * @param options - Query options for filtering
   * @returns Array of failed FROST sessions
   */
  async getFrostFailedSessions(
    options: MonitoringQueryOptions = {}
  ): Promise<FailedFrostSession[]> {
    try {
      await this.initSupabase();

      let query = this.supabase
        .from("frost_signing_sessions")
        .select(
          "session_id, family_id, created_by, threshold, participants, status, error_message, created_at, failed_at, expires_at, nonce_collection_started_at, signing_started_at"
        )
        .eq("status", "failed")
        .order("failed_at", { ascending: false });

      // Apply filters
      if (options.familyId) {
        query = query.eq("family_id", options.familyId);
      }

      if (options.createdBy) {
        query = query.eq("created_by", options.createdBy);
      }

      if (options.startTime) {
        query = query.gte("failed_at", options.startTime);
      }

      if (options.endTime) {
        query = query.lte("failed_at", options.endTime);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[FROST Monitor] Error fetching failed sessions:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error(
        "[FROST Monitor] Exception fetching failed sessions:",
        error
      );
      return [];
    }
  }

  /**
   * Get empty FROST metrics object
   */
  private getEmptyFrostMetrics(): FrostSessionMetrics {
    return {
      total: 0,
      pending: 0,
      collectingCommitments: 0,
      aggregating: 0,
      completed: 0,
      failed: 0,
      expired: 0,
      successRate: 0,
      failureRate: 0,
    };
  }

  /**
   * Log structured error data for failed FROST session
   *
   * @param sessionId - Session identifier
   * @param error - Error object or message
   * @param context - Additional context data
   */
  logFailedFrostSession(
    sessionId: string,
    error: Error | string,
    context: Record<string, unknown> = {}
  ): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Structured logging (privacy-first - no PII)
    console.error("[FROST Monitor] Failed Signing Session", {
      sessionId,
      error: errorMessage,
      stack: errorStack,
      context: {
        ...context,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Get recent FROST activity summary
   *
   * @param hours - Number of hours to look back (default: 24)
   * @returns FROST activity summary
   */
  async getRecentFrostActivity(hours: number = 24): Promise<{
    metrics: FrostSessionMetrics;
    failedSessions: FailedFrostSession[];
    shouldAlert: boolean;
  }> {
    const startTime = Date.now() - hours * 60 * 60 * 1000;

    const [metrics, failedSessions] = await Promise.all([
      this.getFrostSessionMetrics({ startTime }),
      this.getFrostFailedSessions({ startTime, limit: 10 }),
    ]);

    const shouldAlert = this.shouldAlert(metrics.failureRate);

    return {
      metrics,
      failedSessions,
      shouldAlert,
    };
  }

  /**
   * Get combined activity summary for both SSS and FROST
   *
   * @param hours - Number of hours to look back (default: 24)
   * @returns Combined activity summary
   */
  async getCombinedActivity(hours: number = 24): Promise<{
    sss: {
      metrics: SigningRequestMetrics;
      failedRequests: FailedSigningRequest[];
      shouldAlert: boolean;
    };
    frost: {
      metrics: FrostSessionMetrics;
      failedSessions: FailedFrostSession[];
      shouldAlert: boolean;
    };
    overallShouldAlert: boolean;
  }> {
    const [sss, frost] = await Promise.all([
      this.getRecentActivity(hours),
      this.getRecentFrostActivity(hours),
    ]);

    return {
      sss,
      frost,
      overallShouldAlert: sss.shouldAlert || frost.shouldAlert,
    };
  }

  // ============================================================================
  // FROST Cleanup Methods
  // ============================================================================

  /**
   * Mark pending FROST sessions as expired if past expiration time
   *
   * @returns Number of sessions marked as expired
   */
  async expireFrostSessions(): Promise<number> {
    try {
      await this.initSupabase();

      // Use milliseconds to match frost_signing_sessions schema
      // (same as sss_signing_requests - both use BIGINT with millisecond timestamps)
      const now = Date.now();

      const { data, error } = await this.supabase
        .from("frost_signing_sessions")
        .update({
          status: "expired",
          updated_at: now,
        })
        .in("status", ["pending", "nonce_collection", "aggregating"])
        .lt("expires_at", now)
        .select("session_id");

      if (error) {
        console.error("[FROST Monitor] Error expiring sessions:", error);
        return 0;
      }

      const expiredCount = data?.length || 0;
      if (expiredCount > 0) {
        console.log(
          `[FROST Monitor] Marked ${expiredCount} FROST sessions as expired`
        );
      }

      return expiredCount;
    } catch (error) {
      console.error("[FROST Monitor] Exception expiring sessions:", error);
      return 0;
    }
  }

  /**
   * Cleanup old FROST sessions (completed, failed, expired)
   *
   * @param retentionDays - Number of days to retain sessions (default: 90)
   * @returns Number of sessions cleaned up
   */
  async cleanupFrostSessions(retentionDays: number = 90): Promise<number> {
    try {
      await this.initSupabase();

      const cutoffTime =
        Math.floor(Date.now() / 1000) - retentionDays * 24 * 60 * 60;

      const { data, error } = await this.supabase
        .from("frost_signing_sessions")
        .delete()
        .in("status", ["completed", "failed", "expired"])
        .lt("created_at", cutoffTime)
        .select("session_id");

      if (error) {
        console.error("[FROST Monitor] Error cleaning up sessions:", error);
        return 0;
      }

      const cleanedCount = data?.length || 0;
      console.log(
        `[FROST Monitor] Cleaned up ${cleanedCount} old FROST sessions`
      );

      return cleanedCount;
    } catch (error) {
      console.error("[FROST Monitor] Exception cleaning up sessions:", error);
      return 0;
    }
  }

  /**
   * Cleanup orphaned nonce commitments (from expired/failed sessions)
   *
   * @param retentionDays - Number of days to retain orphaned commitments (default: 7)
   * @returns Number of commitments cleaned up
   */
  async cleanupOrphanedNonceCommitments(
    retentionDays: number = 7
  ): Promise<number> {
    try {
      await this.initSupabase();

      const cutoffTime =
        Math.floor(Date.now() / 1000) - retentionDays * 24 * 60 * 60;

      // Delete nonce commitments for sessions that are expired, failed, or completed
      const { data, error } = await this.supabase.rpc(
        "cleanup_orphaned_frost_nonces",
        {
          p_cutoff_time: cutoffTime,
        }
      );

      if (error) {
        // If RPC doesn't exist, fall back to manual cleanup
        if (error.code === "42883") {
          // Function does not exist
          return await this.cleanupOrphanedNonceCommitmentsManual(cutoffTime);
        }
        console.error(
          "[FROST Monitor] Error cleaning up orphaned nonces:",
          error
        );
        return 0;
      }

      const cleanedCount = data || 0;
      if (cleanedCount > 0) {
        console.log(
          `[FROST Monitor] Cleaned up ${cleanedCount} orphaned nonce commitments`
        );
      }

      return cleanedCount;
    } catch (error) {
      console.error(
        "[FROST Monitor] Exception cleaning up orphaned nonces:",
        error
      );
      return 0;
    }
  }

  /**
   * Manual cleanup of orphaned nonce commitments (fallback if RPC not available)
   */
  private async cleanupOrphanedNonceCommitmentsManual(
    cutoffTime: number
  ): Promise<number> {
    try {
      // First, get session IDs that are expired, failed, or completed
      const { data: sessions, error: sessionError } = await this.supabase
        .from("frost_signing_sessions")
        .select("session_id")
        .in("status", ["completed", "failed", "expired"])
        .lt("created_at", cutoffTime);

      if (sessionError || !sessions || sessions.length === 0) {
        return 0;
      }

      const sessionIds = sessions.map(
        (s: { session_id: string }) => s.session_id
      );

      // Delete nonce commitments for these sessions
      const { data, error } = await this.supabase
        .from("frost_nonce_commitments")
        .delete()
        .in("session_id", sessionIds)
        .select("id");

      if (error) {
        console.error("[FROST Monitor] Error in manual nonce cleanup:", error);
        return 0;
      }

      const cleanedCount = data?.length || 0;
      if (cleanedCount > 0) {
        console.log(
          `[FROST Monitor] Cleaned up ${cleanedCount} orphaned nonce commitments (manual)`
        );
      }

      return cleanedCount;
    } catch (error) {
      console.error(
        "[FROST Monitor] Exception in manual nonce cleanup:",
        error
      );
      return 0;
    }
  }

  /**
   * Run all cleanup tasks for both SSS and FROST
   *
   * @param options - Cleanup options
   * @returns Cleanup results
   */
  async runFullCleanup(
    options: {
      retentionDays?: number;
      nonceRetentionDays?: number;
    } = {}
  ): Promise<{
    sss: { expired: number; cleaned: number };
    frost: { expired: number; cleaned: number; orphanedNonces: number };
  }> {
    const retentionDays = options.retentionDays ?? 90;
    const nonceRetentionDays = options.nonceRetentionDays ?? 7;

    const [sssExpired, sssCleaned, frostExpired, frostCleaned, orphanedNonces] =
      await Promise.all([
        this.expireOldRequests(),
        this.cleanupExpiredRequests(retentionDays),
        this.expireFrostSessions(),
        this.cleanupFrostSessions(retentionDays),
        this.cleanupOrphanedNonceCommitments(nonceRetentionDays),
      ]);

    return {
      sss: { expired: sssExpired, cleaned: sssCleaned },
      frost: {
        expired: frostExpired,
        cleaned: frostCleaned,
        orphanedNonces,
      },
    };
  }
}

// Export singleton instance
export const federatedSigningMonitor = new FederatedSigningMonitor();
