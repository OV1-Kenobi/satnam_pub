/**
 * PKARR Analytics Dashboard Component
 * Phase 2B-1 Day 2: Advanced Analytics & Monitoring
 * 
 * Features:
 * - Verification success rates with time period selection (24h, 7d, 30d)
 * - DHT relay health monitoring with status indicators
 * - Verification method distribution charts
 * - Recent verification activity logs
 * - Real-time data refresh
 * - Feature flag gated: VITE_PKARR_ADMIN_ENABLED
 */

import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  RefreshCw,
  Server,
  TrendingUp,
  XCircle
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

interface VerificationStats {
  total_verifications: number;
  successful_verifications: number;
  failed_verifications: number;
  success_rate_percent: number;
  unique_users: number;
  unique_relays: number;
}

interface RelayHealth {
  relay_url: string;
  total_attempts_24h: number;
  successful_attempts_24h: number;
  failed_attempts_24h: number;
  success_rate_percent: number;
  avg_response_time_ms: number;
  median_response_time_ms: number;
  p95_response_time_ms: number;
  health_status: "healthy" | "degraded" | "unhealthy" | "critical";
  most_common_error?: string;
}

interface VerificationDistribution {
  total_contacts: number;
  pkarr_verified_count: number;
  simpleproof_verified_count: number;
  kind0_verified_count: number;
  physical_mfa_verified_count: number;
  multi_method_verified_count: number;
  verification_levels: {
    unverified: number;
    basic: number;
    verified: number;
    trusted: number;
  };
  percentages: {
    pkarr_verified_percent: number;
    simpleproof_verified_percent: number;
    kind0_verified_percent: number;
    physical_mfa_verified_percent: number;
  };
}

interface RecentActivity {
  id: string;
  public_key: string;
  verified: boolean;
  created_at: string;
  updated_at: string;
  publish_status: string;
  cache_status: string;
  relay_urls: string[];
}

interface ErrorMetrics {
  period: string;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  error_rate_percent: number;
  transient_errors: number;
  permanent_errors: number;
  avg_failed_response_time_ms: number;
  error_code_distribution: Record<string, number>;
  circuit_breaker: {
    state: "CLOSED" | "OPEN" | "HALF_OPEN";
    estimated: boolean;
    note: string;
  };
}

interface AnalyticsData {
  period: string;
  verification_stats: VerificationStats;
  relay_health?: RelayHealth[];
  verification_distribution?: VerificationDistribution;
  recent_activity?: RecentActivity[];
  error_metrics?: ErrorMetrics; // Phase 2B-1 Day 5
}

const PkarrAnalyticsDashboard: React.FC = () => {
  const { sessionToken } = useAuth();
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"24h" | "7d" | "30d">("24h");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Check feature flag
  const pkarrAdminEnabled = import.meta.env.VITE_PKARR_ADMIN_ENABLED === "true";
  const pkarrEnabled = import.meta.env.VITE_PKARR_ENABLED === "true";

  useEffect(() => {
    if (pkarrEnabled && pkarrAdminEnabled) {
      loadAnalytics();
    }
  }, [period, sessionToken, pkarrEnabled, pkarrAdminEnabled]);

  const loadAnalytics = useCallback(async () => {
    if (!sessionToken) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/.netlify/functions/pkarr-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          action: "get_analytics",
          payload: {
            period,
            include_relay_health: true,
            include_distribution: true,
            include_recent: true,
            include_error_metrics: true,
            error_period: "24h",
          },
        }),
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Response not JSON, use status code
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      if (result.success) {
        setAnalyticsData(result.data);
        setLastRefresh(new Date());
      } else {
        throw new Error(result.error || "Failed to load analytics");
      }
    } catch (err) {
      console.error("Error loading PKARR analytics:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, period]);

  // Auto-refresh every 30 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadAnalytics();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, period, loadAnalytics]);

  if (!pkarrEnabled) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-800">
          PKARR system is not enabled. Set VITE_PKARR_ENABLED=true to enable.
        </p>
      </div>
    );
  }

  if (!pkarrAdminEnabled) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-800">
          PKARR admin dashboard is not enabled. Set VITE_PKARR_ADMIN_ENABLED=true to enable.
        </p>
      </div>
    );
  }

  if (loading && !analyticsData) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-600" />
        <span className="ml-3 text-gray-600">Loading analytics...</span>
      </div>
    );
  }

  if (error && !analyticsData) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center">
          <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
          <p className="text-red-800">{error}</p>
        </div>
        <button
          onClick={loadAnalytics}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">PKARR Analytics</h2>
          <p className="text-sm text-gray-600 mt-1">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          {/* Period Selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as "24h" | "7d" | "30d")}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>

          {/* Auto-refresh Toggle */}
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
            />
            <span className="text-sm text-gray-700">Auto-refresh</span>
          </label>

          {/* Manual Refresh Button */}
          <button
            onClick={loadAnalytics}
            disabled={loading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {analyticsData && (
        <>
          {/* Verification Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Verifications"
              value={analyticsData.verification_stats.total_verifications}
              icon={<Activity className="w-6 h-6 text-blue-600" />}
              trend={null}
            />
            <StatCard
              title="Success Rate"
              value={`${analyticsData.verification_stats.success_rate_percent}%`}
              icon={<CheckCircle className="w-6 h-6 text-green-600" />}
              trend={
                analyticsData.verification_stats.success_rate_percent >= 95
                  ? "excellent"
                  : analyticsData.verification_stats.success_rate_percent >= 80
                    ? "good"
                    : "poor"
              }
            />
            <StatCard
              title="Unique Users"
              value={analyticsData.verification_stats.unique_users}
              icon={<TrendingUp className="w-6 h-6 text-purple-600" />}
              trend={null}
            />
            <StatCard
              title="Active Relays"
              value={analyticsData.verification_stats.unique_relays}
              icon={<Server className="w-6 h-6 text-indigo-600" />}
              trend={null}
            />
          </div>

          {/* Relay Health Section */}
          {analyticsData.relay_health && analyticsData.relay_health.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Server className="w-5 h-5 mr-2 text-indigo-600" />
                DHT Relay Health
              </h3>
              <div className="space-y-3">
                {analyticsData.relay_health.map((relay) => (
                  <RelayHealthCard key={relay.relay_url} relay={relay} />
                ))}
              </div>
            </div>
          )}

          {/* Verification Distribution */}
          {analyticsData.verification_distribution && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-purple-600" />
                Verification Method Distribution
              </h3>
              <VerificationDistributionChart
                distribution={analyticsData.verification_distribution}
              />
            </div>
          )}

          {/* Error Metrics & Circuit Breaker (Phase 2B-1 Day 5) */}
          {analyticsData.error_metrics && (
            <ErrorMetricsCard errorMetrics={analyticsData.error_metrics} />
          )}

          {/* Recent Activity */}
          {analyticsData.recent_activity && analyticsData.recent_activity.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Clock className="w-5 h-5 mr-2 text-blue-600" />
                Recent Activity
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Public Key
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Cache
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Publish
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {analyticsData.recent_activity.slice(0, 10).map((activity) => (
                      <tr key={activity.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-mono text-gray-900">
                          {activity.public_key.substring(0, 16)}...
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {activity.verified ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              <XCircle className="w-3 h-3 mr-1" />
                              Unverified
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`px-2 py-1 rounded text-xs ${activity.cache_status === "valid"
                              ? "bg-green-100 text-green-800"
                              : "bg-yellow-100 text-yellow-800"
                              }`}
                          >
                            {activity.cache_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`px-2 py-1 rounded text-xs ${activity.publish_status === "fresh"
                              ? "bg-green-100 text-green-800"
                              : activity.publish_status === "stale"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                              }`}
                          >
                            {activity.publish_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(activity.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Helper Components
interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend: "excellent" | "good" | "poor" | null;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, trend }) => (
  <div className="bg-white rounded-lg shadow p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
      <div>{icon}</div>
    </div>
    {trend && (
      <div className="mt-2">
        <span
          className={`text-xs px-2 py-1 rounded ${trend === "excellent"
            ? "bg-green-100 text-green-800"
            : trend === "good"
              ? "bg-blue-100 text-blue-800"
              : "bg-red-100 text-red-800"
            }`}
        >
          {trend}
        </span>
      </div>
    )}
  </div>
);

interface RelayHealthCardProps {
  relay: RelayHealth;
}

const RelayHealthCard: React.FC<RelayHealthCardProps> = ({ relay }) => {
  const getHealthClasses = (status: string) => {
    switch (status) {
      case "healthy":
        return { dot: "bg-green-500", badge: "bg-green-100 text-green-800" };
      case "degraded":
        return { dot: "bg-yellow-500", badge: "bg-yellow-100 text-yellow-800" };
      case "unhealthy":
        return { dot: "bg-orange-500", badge: "bg-orange-100 text-orange-800" };
      default:
        return { dot: "bg-red-500", badge: "bg-red-100 text-red-800" };
    }
  };

  const healthClasses = getHealthClasses(relay.health_status);

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <div className={`w-3 h-3 rounded-full ${healthClasses.dot} mr-2`}></div>
          <span className="font-mono text-sm text-gray-900">
            {relay.relay_url}
          </span>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${healthClasses.badge}`}>
          {relay.health_status}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-gray-600">Success Rate</p>
          <p className="font-semibold">{relay.success_rate_percent}%</p>
        </div>
        <div>
          <p className="text-gray-600">Avg Response</p>
          <p className="font-semibold">{relay.avg_response_time_ms}ms</p>
        </div>
        <div>
          <p className="text-gray-600">Attempts</p>
          <p className="font-semibold">{relay.total_attempts_24h}</p>
        </div>
        <div>
          <p className="text-gray-600">P95</p>
          <p className="font-semibold">{relay.p95_response_time_ms}ms</p>
        </div>
      </div>
    </div>
  );
};

interface VerificationDistributionChartProps {
  distribution: VerificationDistribution;
}

const VerificationDistributionChart: React.FC<
  VerificationDistributionChartProps
> = ({ distribution }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="text-center">
        <p className="text-2xl font-bold text-purple-600">
          {distribution.pkarr_verified_count}
        </p>
        <p className="text-sm text-gray-600">PKARR Verified</p>
        <p className="text-xs text-gray-500">
          {distribution.percentages.pkarr_verified_percent}%
        </p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-blue-600">
          {distribution.simpleproof_verified_count}
        </p>
        <p className="text-sm text-gray-600">SimpleProof</p>
        <p className="text-xs text-gray-500">
          {distribution.percentages.simpleproof_verified_percent}%
        </p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-green-600">
          {distribution.kind0_verified_count}
        </p>
        <p className="text-sm text-gray-600">kind:0</p>
        <p className="text-xs text-gray-500">
          {distribution.percentages.kind0_verified_percent}%
        </p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-indigo-600">
          {distribution.physical_mfa_verified_count}
        </p>
        <p className="text-sm text-gray-600">Physical MFA</p>
        <p className="text-xs text-gray-500">
          {distribution.percentages.physical_mfa_verified_percent}%
        </p>
      </div>
    </div>

    <div className="border-t pt-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">
        Verification Levels
      </h4>
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-gray-100 p-3 rounded text-center">
          <p className="text-lg font-bold">{distribution.verification_levels.unverified}</p>
          <p className="text-xs text-gray-600">Unverified</p>
        </div>
        <div className="bg-blue-100 p-3 rounded text-center">
          <p className="text-lg font-bold">{distribution.verification_levels.basic}</p>
          <p className="text-xs text-blue-800">Basic</p>
        </div>
        <div className="bg-green-100 p-3 rounded text-center">
          <p className="text-lg font-bold">{distribution.verification_levels.verified}</p>
          <p className="text-xs text-green-800">Verified</p>
        </div>
        <div className="bg-yellow-100 p-3 rounded text-center">
          <p className="text-lg font-bold">{distribution.verification_levels.trusted}</p>
          <p className="text-xs text-yellow-800">Trusted</p>
        </div>
      </div>
    </div>
  </div>
);

interface ErrorMetricsCardProps {
  errorMetrics: ErrorMetrics;
}

const ErrorMetricsCard: React.FC<ErrorMetricsCardProps> = ({ errorMetrics }) => {
  const getCircuitBreakerClasses = (state: string) => {
    switch (state) {
      case "CLOSED":
        return { dot: "bg-green-500", badge: "bg-green-100 text-green-800" };
      case "HALF_OPEN":
        return { dot: "bg-yellow-500", badge: "bg-yellow-100 text-yellow-800" };
      default:
        return { dot: "bg-red-500", badge: "bg-red-100 text-red-800" };
    }
  };

  const getErrorRateClasses = (rate: number) => {
    if (rate < 5) return { bg: "bg-green-50", text: "text-green-600" };
    if (rate < 15) return { bg: "bg-yellow-50", text: "text-yellow-600" };
    return { bg: "bg-red-50", text: "text-red-600" };
  };

  const circuitBreakerClasses = getCircuitBreakerClasses(errorMetrics.circuit_breaker.state);
  const errorRateClasses = getErrorRateClasses(errorMetrics.error_rate_percent);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <AlertTriangle className="w-5 h-5 mr-2 text-orange-600" />
        Error Metrics & Circuit Breaker Status
      </h3>

      {/* Circuit Breaker Status */}
      <div className="mb-6 p-4 border-2 border-gray-200 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-700">Circuit Breaker</h4>
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full ${circuitBreakerClasses.dot} mr-2 animate-pulse`}></div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${circuitBreakerClasses.badge}`}>
              {errorMetrics.circuit_breaker.state}
            </span>
          </div>
        </div>
        {errorMetrics.circuit_breaker.estimated && (
          <p className="text-xs text-gray-500 italic">
            {errorMetrics.circuit_breaker.note}
          </p>
        )}
      </div>

      {/* Error Rate Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-2xl font-bold text-gray-900">
            {errorMetrics.total_requests}
          </p>
          <p className="text-sm text-gray-600">Total Requests</p>
        </div>
        <div className="text-center p-4 bg-green-50 rounded-lg">
          <p className="text-2xl font-bold text-green-600">
            {errorMetrics.successful_requests}
          </p>
          <p className="text-sm text-gray-600">Successful</p>
        </div>
        <div className="text-center p-4 bg-red-50 rounded-lg">
          <p className="text-2xl font-bold text-red-600">
            {errorMetrics.failed_requests}
          </p>
          <p className="text-sm text-gray-600">Failed</p>
        </div>
        <div className={`text-center p-4 ${errorRateClasses.bg} rounded-lg`}>
          <p className={`text-2xl font-bold ${errorRateClasses.text}`}>
            {errorMetrics.error_rate_percent.toFixed(2)}%
          </p>
          <p className="text-sm text-gray-600">Error Rate</p>
        </div>
      </div>

      {/* Error Type Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Transient Errors</p>
              <p className="text-2xl font-bold text-yellow-700">
                {errorMetrics.transient_errors}
              </p>
            </div>
            <RefreshCw className="w-8 h-8 text-yellow-600" />
          </div>
          <p className="text-xs text-gray-500 mt-2">Retryable errors (timeout, unavailable)</p>
        </div>
        <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Permanent Errors</p>
              <p className="text-2xl font-bold text-red-700">
                {errorMetrics.permanent_errors}
              </p>
            </div>
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <p className="text-xs text-gray-500 mt-2">Non-retryable errors (invalid data)</p>
        </div>
      </div>

      {/* Error Code Distribution */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Error Code Distribution</h4>
        <div className="space-y-2">
          {Object.entries(errorMetrics.error_code_distribution)
            .sort(([, a], [, b]) => b - a)
            .map(([code, count]) => {
              const percentage =
                errorMetrics.failed_requests > 0
                  ? ((count / errorMetrics.failed_requests) * 100).toFixed(1)
                  : "0.0";
              return (
                <div key={code} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-sm font-mono text-gray-700">{code}</span>
                  <div className="flex items-center">
                    <span className="text-sm font-semibold text-gray-900 mr-2">{count}</span>
                    <span className="text-xs text-gray-500">({percentage}%)</span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Average Failed Response Time */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Avg Failed Response Time</p>
            <p className="text-2xl font-bold text-blue-700">
              {errorMetrics.avg_failed_response_time_ms.toFixed(0)}ms
            </p>
          </div>
          <Clock className="w-8 h-8 text-blue-600" />
        </div>
      </div>
    </div>
  );
};

export default PkarrAnalyticsDashboard;

