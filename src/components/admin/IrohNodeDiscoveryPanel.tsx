/**
 * Iroh Node Discovery Panel Component
 * Phase 2B-2 Week 2 Task 3 Day 2: Admin Analytics Dashboard
 * 
 * Features:
 * - Node discovery statistics (total, reachable, unreachable, success rate)
 * - DHT health monitoring with relay status and response times
 * - Recent verification activity log (last 20 attempts)
 * - Node reachability chart (CSS-based visualization)
 * - Admin actions (reset status, force reachability check)
 * - Time period selection (24h, 7d, 30d)
 * - Auto-refresh toggle (30-second interval)
 * - Feature flag gated: VITE_IROH_ENABLED
 * - Role-based access: guardian/steward only (handled by parent component)
 */

import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  RefreshCw,
  Server,
  XCircle
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

interface NodeDiscoveryStats {
  total_nodes: number;
  reachable_nodes: number;
  unreachable_nodes: number;
  success_rate_percent: number;
  avg_response_time_ms: number;
  unique_relay_urls: number;
}

interface DHTHealthMetrics {
  relay_url: string;
  status: 'healthy' | 'degraded' | 'offline';
  total_attempts: number;
  successful_attempts: number;
  failed_attempts: number;
  success_rate_percent: number;
  avg_response_time_ms: number;
  last_check: number;
}

interface RecentVerification {
  id: string;
  node_id: string;
  is_reachable: boolean;
  relay_url: string | null;
  direct_addresses: string[] | null;
  response_time_ms: number;
  timestamp: number;
  cached: boolean;
  error?: string | null;
}

interface AnalyticsData {
  period: string;
  node_stats: NodeDiscoveryStats;
  dht_health?: DHTHealthMetrics[];
  recent_activity?: RecentVerification[];
}

interface IrohNodeDiscoveryPanelProps {
  className?: string;
}

const IrohNodeDiscoveryPanel: React.FC<IrohNodeDiscoveryPanelProps> = ({ className = '' }) => {
  const { sessionToken } = useAuth();
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"24h" | "7d" | "30d">("24h");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [resettingStatus, setResettingStatus] = useState(false);

  // Check feature flag
  const irohEnabled = import.meta.env.VITE_IROH_ENABLED === "true";

  useEffect(() => {
    if (irohEnabled) {
      loadAnalytics();
    }
  }, [period, sessionToken, irohEnabled]);

  // Auto-refresh every 30 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadAnalytics();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, period]);

  const loadAnalytics = async () => {
    if (!sessionToken) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/.netlify/functions/iroh-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          action: "admin_stats",
          period,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to load analytics");
      }

      setAnalyticsData(data.data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  const handleResetStatus = async () => {
    if (!confirm("Are you sure you want to reset all verification status? This will clear cached results.")) {
      return;
    }

    try {
      setResettingStatus(true);
      const response = await fetch(`/.netlify/functions/iroh-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          action: "reset_status",
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to reset status");
      }

      // Reload analytics after reset
      await loadAnalytics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset status");
    } finally {
      setResettingStatus(false);
    }
  };

  if (!irohEnabled) {
    return null;
  }

  if (loading && !analyticsData) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading Iroh analytics...</p>
        </div>
      </div>
    );
  }

  if (error && !analyticsData) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-6 ${className}`}>
        <div className="flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-red-900">Error Loading Analytics</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <button
              onClick={loadAnalytics}
              className="mt-3 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return null;
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Iroh DHT Node Discovery</h2>
          <p className="text-sm text-gray-600 mt-1">
            Monitor peer-to-peer node discovery and DHT health metrics
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Time Period Selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as "24h" | "7d" | "30d")}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
              className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
            />
            <span className="text-sm text-gray-700">Auto-refresh</span>
          </label>

          {/* Manual Refresh Button */}
          <button
            onClick={loadAnalytics}
            disabled={loading}
            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Last Refresh Timestamp */}
      <div className="text-xs text-gray-500">
        Last updated: {lastRefresh.toLocaleTimeString()}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Nodes"
          value={analyticsData.node_stats.total_nodes}
          icon={<Server className="w-6 h-6 text-blue-600" />}
          trend={null}
        />
        <StatCard
          title="Reachable Nodes"
          value={analyticsData.node_stats.reachable_nodes}
          icon={<CheckCircle className="w-6 h-6 text-green-600" />}
          trend={
            analyticsData.node_stats.success_rate_percent >= 95
              ? "excellent"
              : analyticsData.node_stats.success_rate_percent >= 80
                ? "good"
                : "poor"
          }
          subtitle={`${analyticsData.node_stats.success_rate_percent}% success rate`}
        />
        <StatCard
          title="Avg Response Time"
          value={`${analyticsData.node_stats.avg_response_time_ms}ms`}
          icon={<Clock className="w-6 h-6 text-purple-600" />}
          trend={
            analyticsData.node_stats.avg_response_time_ms < 1000
              ? "excellent"
              : analyticsData.node_stats.avg_response_time_ms < 3000
                ? "good"
                : "poor"
          }
        />
        <StatCard
          title="Active DHT Relays"
          value={analyticsData.node_stats.unique_relay_urls}
          icon={<Activity className="w-6 h-6 text-orange-600" />}
          trend={null}
        />
      </div>

      {/* DHT Health Monitoring */}
      {analyticsData.dht_health && analyticsData.dht_health.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
            <Server className="w-5 h-5 text-purple-600" />
            <span>DHT Relay Health</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Relay URL
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Success Rate
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg Response
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Check
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analyticsData.dht_health.map((relay, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                      {relay.relay_url}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${relay.status === 'healthy'
                          ? 'bg-green-100 text-green-800'
                          : relay.status === 'degraded'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                          }`}
                      >
                        {relay.status === 'healthy' && <CheckCircle className="w-3 h-3 mr-1" />}
                        {relay.status === 'degraded' && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {relay.status === 'offline' && <XCircle className="w-3 h-3 mr-1" />}
                        {relay.status.charAt(0).toUpperCase() + relay.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {relay.success_rate_percent}%
                      <span className="text-xs text-gray-500 ml-1">
                        ({relay.successful_attempts}/{relay.total_attempts})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {relay.avg_response_time_ms}ms
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatTimestamp(relay.last_check)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Node Reachability Chart */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <BarChart3 className="w-5 h-5 text-purple-600" />
          <span>Node Reachability</span>
        </h3>
        <div className="space-y-4">
          {/* Reachable Nodes Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Reachable</span>
              <span className="text-sm text-gray-600">
                {analyticsData.node_stats.reachable_nodes} nodes
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-green-500 h-4 rounded-full transition-all duration-500"
                style={{
                  width: `${analyticsData.node_stats.total_nodes > 0
                    ? (analyticsData.node_stats.reachable_nodes / analyticsData.node_stats.total_nodes) * 100
                    : 0
                    }%`,
                }}
              />
            </div>
          </div>

          {/* Unreachable Nodes Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Unreachable</span>
              <span className="text-sm text-gray-600">
                {analyticsData.node_stats.unreachable_nodes} nodes
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-red-500 h-4 rounded-full transition-all duration-500"
                style={{
                  width: `${analyticsData.node_stats.total_nodes > 0
                    ? (analyticsData.node_stats.unreachable_nodes / analyticsData.node_stats.total_nodes) * 100
                    : 0
                    }%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Verification Activity */}
      {analyticsData.recent_activity && analyticsData.recent_activity.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
            <Activity className="w-5 h-5 text-purple-600" />
            <span>Recent Verification Activity</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Node ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Relay URL
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Response Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analyticsData.recent_activity.slice(0, 20).map((activity) => (
                  <tr key={activity.id}>
                    <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                      {truncateNodeId(activity.node_id)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {activity.is_reachable ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Reachable
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          <XCircle className="w-3 h-3 mr-1" />
                          Unreachable
                        </span>
                      )}
                      {activity.cached && (
                        <span className="ml-2 text-xs text-gray-500">(cached)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {activity.relay_url || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {activity.response_time_ms}ms
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatTimestamp(activity.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Admin Actions */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Admin Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleResetStatus}
            disabled={resettingStatus}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {resettingStatus ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Resetting...</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4" />
                <span>Reset All Verification Status</span>
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Reset will clear all cached verification results and force fresh DHT lookups on next verification.
        </p>
      </div>
    </div>
  );
};

// Helper Components
interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend: "excellent" | "good" | "poor" | null;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, trend, subtitle }) => (
  <div className="bg-white rounded-lg shadow p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
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

// Helper Functions
function formatTimestamp(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function truncateNodeId(nodeId: string): string {
  if (nodeId.length <= 24) return nodeId;
  return `${nodeId.slice(0, 12)}...${nodeId.slice(-12)}`;
}

export default IrohNodeDiscoveryPanel;
