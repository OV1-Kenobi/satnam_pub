/**
 * Monitoring Tab Component
 * Real-time system metrics and alerting dashboard
 * Phase 5: Automation & Monitoring
 * @module MonitoringTab
 */

import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  Database,
  Loader2,
  RefreshCw,
  Server,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

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

interface MonitoringTabProps {
  sessionToken: string | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-100 text-blue-800 border-blue-200",
  warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
  error: "bg-red-100 text-red-800 border-red-200",
  critical: "bg-red-200 text-red-900 border-red-300",
};

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  info: <Bell className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  error: <XCircle className="h-4 w-4" />,
  critical: <AlertTriangle className="h-4 w-4" />,
};

export const MonitoringTab: React.FC<MonitoringTabProps> = ({ sessionToken }) => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMetrics = useCallback(async (isRefresh = false) => {
    if (!sessionToken) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/monitoring", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch metrics");
      }
      const data = await response.json();
      setMetrics(data.metrics);
      setAlerts(data.alerts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch metrics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchMetrics(true), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMetrics]);

  const acknowledgeAlert = async (alertId: string) => {
    if (!sessionToken) return;
    try {
      const response = await fetch("/api/admin/monitoring/acknowledge", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ alertId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to acknowledge alert");
      }

      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
      );
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
      setError(err instanceof Error ? err.message : "Failed to acknowledge alert");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const StatusBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
      healthy: "bg-green-100 text-green-800",
      running: "bg-green-100 text-green-800",
      degraded: "bg-yellow-100 text-yellow-800",
      paused: "bg-yellow-100 text-yellow-800",
      down: "bg-red-100 text-red-800",
      error: "bg-red-100 text-red-800",
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${colors[status] || "bg-gray-100"}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with refresh controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">System Monitoring</h3>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500" />
            <span className="text-sm text-gray-600">Auto-refresh (30s)</span>
          </label>
          <button onClick={() => fetchMetrics(true)} disabled={refreshing}
            className="px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 flex items-center space-x-1">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {metrics && (
        <>
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Orphan Detection */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Database className="h-5 w-5 text-purple-600" />
                <h4 className="font-medium text-gray-900">Orphan Detection</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Last Run:</span>
                  <span className="text-gray-900">
                    {metrics.orphanDetection.lastRun
                      ? new Date(metrics.orphanDetection.lastRun).toLocaleString()
                      : "Never"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Orphans Found:</span>
                  <span className="font-medium text-gray-900">{metrics.orphanDetection.orphansFound}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Cleaned Up:</span>
                  <span className="font-medium text-green-600">{metrics.orphanDetection.orphansCleanedUp}</span>
                </div>
              </div>
            </div>

            {/* Account Removals */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Users className="h-5 w-5 text-red-600" />
                <h4 className="font-medium text-gray-900">Account Removals</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total:</span>
                  <span className="font-medium text-gray-900">{metrics.accountRemovals.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Last 24h:</span>
                  <span className="font-medium text-gray-900">{metrics.accountRemovals.last24Hours}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Pending Rollbacks:</span>
                  <span className="font-medium text-yellow-600">{metrics.accountRemovals.pendingRollbacks}</span>
                </div>
              </div>
            </div>

            {/* System Health */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Server className="h-5 w-5 text-green-600" />
                <h4 className="font-medium text-gray-900">System Health</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Database:</span>
                  <StatusBadge status={metrics.systemHealth.databaseStatus} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Scheduled Jobs:</span>
                  <StatusBadge status={metrics.systemHealth.scheduledJobsStatus} />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Last Check:</span>
                  <span className="text-gray-900 text-xs">
                    {metrics.systemHealth.lastHealthCheck
                      ? new Date(
                        metrics.systemHealth.lastHealthCheck
                      ).toLocaleTimeString()
                      : "N/A"}
                  </span>
                </div>
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Bell className="h-5 w-5 text-blue-600" />
                <h4 className="font-medium text-gray-900">Notifications</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Unread:</span>
                  <span className={`font-medium ${metrics.notifications.unread > 0 ? "text-red-600" : "text-gray-900"}`}>
                    {metrics.notifications.unread}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total:</span>
                  <span className="font-medium text-gray-900">{metrics.notifications.total}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Active Alerts */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h4 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>Active Alerts</span>
              {alerts.filter((a) => !a.acknowledged).length > 0 && (
                <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded-full">
                  {alerts.filter((a) => !a.acknowledged).length}
                </span>
              )}
            </h4>
            {alerts.length === 0 ? (
              <div className="text-center py-8 bg-green-50 rounded-lg">
                <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <p className="text-green-800">No active alerts</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {alerts.map((alert) => (
                  <div key={alert.id}
                    className={`rounded-lg border p-3 ${SEVERITY_COLORS[alert.severity]} ${alert.acknowledged ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-2">
                        {SEVERITY_ICONS[alert.severity]}
                        <div>
                          <p className="font-medium">{alert.title}</p>
                          <p className="text-sm opacity-80">{alert.message}</p>
                          <p className="text-xs opacity-60 mt-1">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {new Date(alert.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      {!alert.acknowledged && (
                        <button onClick={() => acknowledgeAlert(alert.id)}
                          className="text-xs px-2 py-1 bg-white/50 rounded hover:bg-white/80">
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MonitoringTab;

