/**
 * PKARR Analytics Endpoint
 * GET /.netlify/functions/pkarr-analytics
 *
 * Provides comprehensive analytics for PKARR verification system:
 * - Verification success rates (24h, 7d, 30d)
 * - DHT relay health monitoring
 * - Verification method distribution
 * - Recent activity logs
 * - Error metrics and circuit breaker status (Phase 2B-1 Day 5)
 *
 * Query Parameters:
 * - period: '24h' | '7d' | '30d' (default: '24h')
 * - include_relay_health: 'true' | 'false' (default: 'true')
 * - include_distribution: 'true' | 'false' (default: 'true')
 * - include_recent: 'true' | 'false' (default: 'true')
 * - include_error_metrics: 'true' | 'false' (default: 'false') - Phase 2B-1 Day 5
 * - error_period: '1h' | '24h' | '7d' (default: '24h') - Phase 2B-1 Day 5
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     period: string,
 *     verification_stats: {
 *       total_verifications: number,
 *       successful_verifications: number,
 *       failed_verifications: number,
 *       success_rate_percent: number,
 *       unique_users: number,
 *       unique_relays: number
 *     },
 *     relay_health?: Array<{
 *       relay_url: string,
 *       total_attempts_24h: number,
 *       successful_attempts_24h: number,
 *       failed_attempts_24h: number,
 *       success_rate_percent: number,
 *       avg_response_time_ms: number,
 *       health_status: 'healthy' | 'degraded' | 'unhealthy' | 'critical'
 *     }>,
 *     verification_distribution?: {
 *       total_contacts: number,
 *       pkarr_verified_count: number,
 *       simpleproof_verified_count: number,
 *       kind0_verified_count: number,
 *       physical_mfa_verified_count: number,
 *       verification_levels: {
 *         unverified: number,
 *         basic: number,
 *         verified: number,
 *         trusted: number
 *       }
 *     },
 *     recent_activity?: Array<{
 *       id: string,
 *       public_key: string,
 *       verified: boolean,
 *       created_at: string,
 *       publish_status: string,
 *       cache_status: string
 *     }>
 *   },
 *   response_time_ms: number
 * }
 *
 * Features:
 * - Rate limiting: 60 requests/hour per IP
 * - Authentication required (admin or user with PKARR records)
 * - Optimized queries (<500ms response time)
 * - Feature flag gated: VITE_PKARR_ENABLED
 */

import type { Handler } from "@netlify/functions";
import { getRequestClient } from "./supabase.js";
import { getEnvVar } from "./utils/env.js";
import { allowRequest } from "./utils/rate-limiter.js";

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
    "Content-Security-Policy": "default-src 'none'",
  } as const;
}

function json(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Calculate time range in seconds based on period
 */
function getTimeRange(period: string): { start: number; end: number } {
  const now = Math.floor(Date.now() / 1000);
  let start: number;

  switch (period) {
    case "24h":
      start = now - 24 * 60 * 60;
      break;
    case "7d":
      start = now - 7 * 24 * 60 * 60;
      break;
    case "30d":
      start = now - 30 * 24 * 60 * 60;
      break;
    default:
      start = now - 24 * 60 * 60; // Default to 24h
  }

  return { start, end: now };
}

export const handler: Handler = async (event) => {
  const startTime = Date.now();

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: "",
    };
  }

  // Only allow GET
  if (event.httpMethod !== "GET") {
    return json(405, { success: false, error: "Method not allowed" });
  }

  // Check feature flag
  const pkarrEnabled = getEnvVar("VITE_PKARR_ENABLED");
  if (pkarrEnabled !== "true") {
    return json(403, {
      success: false,
      error: "PKARR analytics not enabled",
    });
  }

  // Rate limiting: 60 requests/hour per IP
  const clientIP =
    event.headers["x-forwarded-for"] || event.headers["x-real-ip"] || "unknown";
  if (!allowRequest(String(clientIP), 60, 3600_000)) {
    return json(429, { success: false, error: "Rate limit exceeded" });
  }

  try {
    // Authenticate user via SecureSessionManager
    const { SecureSessionManager } = await import(
      "./security/session-manager.js"
    );
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization || "";
    const session = await SecureSessionManager.validateSessionFromHeader(
      String(authHeader)
    );

    if (!session || !session.hashedId) {
      return json(401, { success: false, error: "Unauthorized" });
    }

    // Parse query parameters
    const params = event.queryStringParameters || {};
    const period = params.period || "24h";
    const includeRelayHealth = params.include_relay_health !== "false";
    const includeDistribution = params.include_distribution !== "false";
    const includeRecent = params.include_recent !== "false";
    const includeErrorMetrics = params.include_error_metrics === "true"; // Phase 2B-1 Day 5
    const errorPeriod = params.error_period || "24h"; // Phase 2B-1 Day 5

    // Validate period
    if (!["24h", "7d", "30d"].includes(period)) {
      return json(400, {
        success: false,
        error: "Invalid period. Must be one of: 24h, 7d, 30d",
      });
    }

    // Validate error period (Phase 2B-1 Day 5)
    if (includeErrorMetrics && !["1h", "24h", "7d"].includes(errorPeriod)) {
      return json(400, {
        success: false,
        error: "Invalid error_period. Must be one of: 1h, 24h, 7d",
      });
    }

    // Get Supabase client
    const client = await getRequestClient(event);

    // Get time range
    const { start, end } = getTimeRange(period);

    // Query 1: Verification stats using helper function
    const { data: statsData, error: statsError } = await client.rpc(
      "get_pkarr_stats",
      {
        start_time: start,
        end_time: end,
      }
    );

    if (statsError) {
      console.error("Error fetching verification stats:", statsError);
      return json(500, {
        success: false,
        error: "Failed to fetch verification statistics",
      });
    }

    const verificationStats =
      statsData && statsData.length > 0
        ? statsData[0]
        : {
            total_verifications: 0,
            successful_verifications: 0,
            failed_verifications: 0,
            success_rate_percent: 0,
            unique_users: 0,
            unique_relays: 0,
          };

    // Build response data
    const responseData: any = {
      period,
      verification_stats: verificationStats,
    };

    // Query 2: Relay health (optional)
    if (includeRelayHealth) {
      const { data: relayHealth, error: relayError } = await client
        .from("pkarr_relay_health")
        .select("*")
        .limit(20);

      if (relayError) {
        console.error("Error fetching relay health:", relayError);
      } else {
        responseData.relay_health = relayHealth || [];
      }
    }

    // Query 3: Verification method distribution (optional)
    if (includeDistribution) {
      const { data: distribution, error: distError } = await client
        .from("pkarr_verification_method_distribution")
        .select("*")
        .limit(1);

      if (distError) {
        console.error("Error fetching verification distribution:", distError);
      } else if (distribution && distribution.length > 0) {
        const dist = distribution[0];
        responseData.verification_distribution = {
          total_contacts: dist.total_contacts,
          pkarr_verified_count: dist.pkarr_verified_count,
          simpleproof_verified_count: dist.simpleproof_verified_count,
          kind0_verified_count: dist.kind0_verified_count,
          physical_mfa_verified_count: dist.physical_mfa_verified_count,
          multi_method_verified_count: dist.multi_method_verified_count,
          verification_levels: {
            unverified: dist.unverified_count,
            basic: dist.basic_count,
            verified: dist.verified_count,
            trusted: dist.trusted_count,
          },
          percentages: {
            pkarr_verified_percent: dist.pkarr_verified_percent,
            simpleproof_verified_percent: dist.simpleproof_verified_percent,
            kind0_verified_percent: dist.kind0_verified_percent,
            physical_mfa_verified_percent: dist.physical_mfa_verified_percent,
          },
        };
      }
    }

    // Query 4: Recent activity (optional)
    if (includeRecent) {
      const { data: recentActivity, error: recentError } = await client
        .from("pkarr_recent_activity")
        .select("*")
        .limit(50);

      if (recentError) {
        console.error("Error fetching recent activity:", recentError);
      } else {
        responseData.recent_activity = recentActivity || [];
      }
    }

    // Query 5: Error metrics and circuit breaker status (Phase 2B-1 Day 5)
    if (includeErrorMetrics) {
      try {
        // Import circuit breaker and error metrics from verify-contact-pkarr
        // Note: We'll need to export these from verify-contact-pkarr or create a shared instance
        const { CircuitBreaker, ErrorMetricsCollector } = await import(
          "./utils/pkarr-error-handler.js"
        );

        // Get error period time range
        const errorTimeRange = getTimeRange(errorPeriod);

        // Query error logs from pkarr_publish_history (errors are logged there)
        const { data: errorLogs, error: errorLogsError } = await client
          .from("pkarr_publish_history")
          .select("success, error_message, response_time_ms, publish_timestamp")
          .gte("publish_timestamp", errorTimeRange.start)
          .lte("publish_timestamp", errorTimeRange.end)
          .order("publish_timestamp", { ascending: false })
          .limit(1000);

        if (errorLogsError) {
          console.error("Error fetching error logs:", errorLogsError);
        } else {
          // Calculate error metrics from logs
          const totalRequests = errorLogs?.length || 0;
          const failedRequests =
            errorLogs?.filter((log) => !log.success).length || 0;
          const successfulRequests = totalRequests - failedRequests;

          // Categorize errors by type (transient vs permanent)
          const transientErrors =
            errorLogs?.filter(
              (log) =>
                !log.success &&
                log.error_message &&
                (log.error_message.toLowerCase().includes("timeout") ||
                  log.error_message.toLowerCase().includes("unavailable") ||
                  log.error_message.toLowerCase().includes("rate limit"))
            ).length || 0;

          const permanentErrors = failedRequests - transientErrors;

          // Calculate error rate
          const errorRate =
            totalRequests > 0
              ? ((failedRequests / totalRequests) * 100).toFixed(2)
              : "0.00";

          // Calculate average response time for failed requests
          const failedRequestsWithTime = errorLogs?.filter(
            (log) => !log.success && log.response_time_ms
          );
          const avgFailedResponseTime =
            failedRequestsWithTime && failedRequestsWithTime.length > 0
              ? (
                  failedRequestsWithTime.reduce(
                    (sum, log) => sum + (log.response_time_ms || 0),
                    0
                  ) / failedRequestsWithTime.length
                ).toFixed(2)
              : "0.00";

          // Error code distribution (extract from error messages)
          const errorCodeDistribution: Record<string, number> = {};
          errorLogs
            ?.filter((log) => !log.success && log.error_message)
            .forEach((log) => {
              const message = log.error_message!.toLowerCase();
              let errorCode = "UNKNOWN_ERROR";

              if (message.includes("timeout")) errorCode = "NETWORK_TIMEOUT";
              else if (message.includes("unavailable"))
                errorCode = "DHT_UNAVAILABLE";
              else if (message.includes("rate limit"))
                errorCode = "RATE_LIMITED";
              else if (message.includes("invalid public key"))
                errorCode = "INVALID_PUBLIC_KEY";
              else if (message.includes("invalid nip05"))
                errorCode = "INVALID_NIP05";
              else if (message.includes("not found"))
                errorCode = "RECORD_NOT_FOUND";
              else if (message.includes("signature"))
                errorCode = "SIGNATURE_INVALID";

              errorCodeDistribution[errorCode] =
                (errorCodeDistribution[errorCode] || 0) + 1;
            });

          // Note: Circuit breaker state is per-instance, so we can't get the actual state
          // from the verify-contact-pkarr function. We'll return a simulated state based on error rate.
          let circuitBreakerState = "CLOSED";
          const recentErrorRate = parseFloat(errorRate);
          if (recentErrorRate > 50) {
            circuitBreakerState = "OPEN";
          } else if (recentErrorRate > 30) {
            circuitBreakerState = "HALF_OPEN";
          }

          responseData.error_metrics = {
            period: errorPeriod,
            total_requests: totalRequests,
            successful_requests: successfulRequests,
            failed_requests: failedRequests,
            error_rate_percent: parseFloat(errorRate),
            transient_errors: transientErrors,
            permanent_errors: permanentErrors,
            avg_failed_response_time_ms: parseFloat(avgFailedResponseTime),
            error_code_distribution: errorCodeDistribution,
            circuit_breaker: {
              state: circuitBreakerState,
              estimated: true, // Indicate this is estimated, not actual
              note: "Circuit breaker state is estimated based on error rate. Actual state is per-instance.",
            },
          };
        }
      } catch (errorMetricsError) {
        console.error("Error fetching error metrics:", errorMetricsError);
        // Don't fail the entire request if error metrics fail
        responseData.error_metrics = {
          error: "Failed to fetch error metrics",
        };
      }
    }

    return json(200, {
      success: true,
      data: responseData,
      response_time_ms: Date.now() - startTime,
    });
  } catch (error) {
    console.error("pkarr-analytics error:", error);
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
