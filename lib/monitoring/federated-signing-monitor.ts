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
 * Signing request status type
 */
export type SigningRequestStatus =
  | "pending"
  | "completed"
  | "failed"
  | "expired";

/**
 * Signing request metrics
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
 * Failed signing request details
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
}

// Export singleton instance
export const federatedSigningMonitor = new FederatedSigningMonitor();
