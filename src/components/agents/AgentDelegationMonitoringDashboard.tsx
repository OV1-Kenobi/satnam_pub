/**
 * Agent Delegation Monitoring Dashboard
 * Main dashboard for monitoring agent delegations, health status, and task challenges
 * @module AgentDelegationMonitoringDashboard
 */

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle,
  Clock,
  RefreshCw,
  Shield,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { getEnvVar } from "../../config/env.client";
import type {
  AgentOperationalState,
  OversightLoad,
  TrustCalibration,
} from "../../types/agents";
import { ErrorBoundary } from "../ErrorBoundary";
import { useAuth } from "../auth/AuthProvider";
import AgentPerformanceReport from "./AgentPerformanceReport";
import { DelegationHealthPanel } from "./DelegationHealthPanel";
import { TaskChallengeHistoryTable } from "./TaskChallengeHistoryTable";

// Feature flag check
const FEATURE_ENABLED =
  (getEnvVar("VITE_AGENT_DELEGATION_MONITORING_ENABLED") ?? "false") === "true";

type TabId = "overview" | "health" | "challenges" | "calibration";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "health", label: "Agent Health", icon: Activity },
  { id: "challenges", label: "Task Challenges", icon: AlertTriangle },
  { id: "calibration", label: "Trust Calibration", icon: TrendingUp },
];

interface DashboardData {
  oversight_load: OversightLoad | null;
  agent_states: AgentOperationalState[];
  trust_calibrations: TrustCalibration[];
  recent_challenges: any[];
  recent_transfers: any[];
}

const AgentDelegationMonitoringDashboardInner: React.FC = () => {
  const { sessionToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    if (!sessionToken || !user) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agents/delegation-monitoring", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch delegation monitoring data");
      }

      const data = await response.json();
      setDashboardData(data.data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      console.error("Dashboard data fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, user]);

  // Initial load
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchDashboardData();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchDashboardData]);

  // Feature flag check
  if (!FEATURE_ENABLED) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Feature Not Enabled
          </h2>
          <p className="text-gray-600">
            Agent delegation monitoring is not currently enabled. Contact your
            administrator to enable this feature.
          </p>
        </div>
      </div>
    );
  }

  // Role-based access control (steward/guardian only)
  const userRole = user?.role || "private";
  if (!["steward", "guardian"].includes(userRole)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">
            Agent delegation monitoring is only available to stewards and
            guardians.
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading && !dashboardData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
          <span className="text-gray-700">Loading delegation monitoring...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-red-900 mb-1">Error Loading Dashboard</h3>
              <p className="text-sm text-red-700 mb-3">{error}</p>
              <button
                onClick={fetchDashboardData}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const oversightLoad = dashboardData?.oversight_load;
  const spanStatus = oversightLoad?.span_status || "WITHIN_LIMIT";
  const spanColor =
    spanStatus === "AT_LIMIT"
      ? "red"
      : spanStatus === "APPROACHING_LIMIT"
        ? "yellow"
        : "green";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Brain className="h-8 w-8 text-purple-600" />
                Agent Delegation Monitoring
              </h1>
              <p className="text-gray-600 mt-1">
                Real-time oversight of agent delegations and health status
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${autoRefresh
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
              >
                <div className="flex items-center gap-2">
                  <Zap className={`h-4 w-4 ${autoRefresh ? "animate-pulse" : ""}`} />
                  {autoRefresh ? "Auto-Refresh On" : "Auto-Refresh Off"}
                </div>
              </button>
              <button
                onClick={fetchDashboardData}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2">
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </div>
              </button>
            </div>
          </div>

          {/* Span of Control Warning */}
          {oversightLoad && spanStatus !== "WITHIN_LIMIT" && (
            <div
              className={`mt-4 p-4 rounded-lg border ${spanStatus === "AT_LIMIT"
                ? "bg-red-50 border-red-200"
                : "bg-yellow-50 border-yellow-200"
                }`}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className={`h-5 w-5 flex-shrink-0 ${spanStatus === "AT_LIMIT" ? "text-red-600" : "text-yellow-600"
                    }`}
                />
                <div>
                  <h4
                    className={`font-semibold ${spanStatus === "AT_LIMIT" ? "text-red-900" : "text-yellow-900"
                      }`}
                  >
                    {spanStatus === "AT_LIMIT"
                      ? "Delegation Limit Reached"
                      : "Approaching Delegation Limit"}
                  </h4>
                  <p
                    className={`text-sm ${spanStatus === "AT_LIMIT" ? "text-red-700" : "text-yellow-700"
                      }`}
                  >
                    You are currently managing {oversightLoad.active_delegations} agents
                    (limit: {oversightLoad.configured_span_limit}).
                    {spanStatus === "AT_LIMIT"
                      ? " Complete or cancel existing tasks before delegating new ones."
                      : " Consider completing some tasks before taking on more delegations."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 border-b border-gray-200">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorBoundary>
          {activeTab === "overview" && dashboardData && (
            <OverviewTab data={dashboardData} />
          )}
          {activeTab === "health" && dashboardData && (
            <DelegationHealthPanel agentStates={dashboardData.agent_states} />
          )}
          {activeTab === "challenges" && dashboardData && (
            <TaskChallengeHistoryTable challenges={dashboardData.recent_challenges} />
          )}
          {activeTab === "calibration" && dashboardData && (
            <CalibrationTab calibrations={dashboardData.trust_calibrations} />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
};

// Overview Tab Component
interface OverviewTabProps {
  data: DashboardData;
}

const OverviewTab: React.FC<OverviewTabProps> = ({ data }) => {
  const oversightLoad = data.oversight_load;
  const agentStates = data.agent_states || [];
  const availableAgents = agentStates.filter((s) => s.accepts_new_tasks && s.is_online);
  const offlineAgents = agentStates.filter((s) => !s.is_online);
  const overloadedAgents = agentStates.filter(
    (s) => s.is_online && !s.accepts_new_tasks
  );

  const stats = [
    {
      label: "Active Delegations",
      value: oversightLoad?.active_delegations || 0,
      icon: Users,
      color: "blue",
    },
    {
      label: "Available Agents",
      value: availableAgents.length,
      icon: CheckCircle,
      color: "green",
    },
    {
      label: "Overloaded Agents",
      value: overloadedAgents.length,
      icon: AlertTriangle,
      color: "yellow",
    },
    {
      label: "Offline Agents",
      value: offlineAgents.length,
      icon: Clock,
      color: "gray",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white rounded-lg border border-gray-200 p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {stat.value}
                  </p>
                </div>
                <Icon
                  className={`h-8 w-8 text-${stat.color}-500`}
                  aria-hidden="true"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Agent Performance Report */}
      <section aria-label="Agent Performance Report">
        <AgentPerformanceReport />
      </section>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          Recent Activity
        </h3>
        <div className="space-y-3">
          {data.recent_transfers && data.recent_transfers.length > 0 ? (
            data.recent_transfers.slice(0, 5).map((transfer: any, idx: number) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    Task transferred: {transfer.transfer_reason}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    From Agent {transfer.from_agent_id.slice(0, 8)}... to Agent{" "}
                    {transfer.to_agent_id.slice(0, 8)}...
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(transfer.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">
              No recent task transfers
            </p>
          )}
        </div>
      </div>

      {/* Pending Challenges */}
      {data.recent_challenges && data.recent_challenges.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-yellow-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            Pending Task Challenges ({data.recent_challenges.length})
          </h3>
          <p className="text-sm text-yellow-700 mb-3">
            You have task challenges awaiting your response. Review them in the
            "Task Challenges" tab.
          </p>
        </div>
      )}
    </div>
  );
};

// Calibration Tab Component
interface CalibrationTabProps {
  calibrations: TrustCalibration[];
}

const CalibrationTab: React.FC<CalibrationTabProps> = ({ calibrations }) => {
  if (!calibrations || calibrations.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No Calibration Data Available
        </h3>
        <p className="text-gray-600">
          Trust calibration data will appear here once agents complete tasks.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-purple-600" />
          Agent Trust Calibration
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          Comparing agent confidence levels with actual task success rates to identify
          overconfidence or underconfidence patterns.
        </p>

        <div className="space-y-4">
          {calibrations.map((cal) => {
            const calibrationStatus = cal.calibration_status;
            const statusColor =
              calibrationStatus === "OVERCONFIDENT"
                ? "red"
                : calibrationStatus === "UNDERCONFIDENT"
                  ? "blue"
                  : "green";

            return (
              <div
                key={cal.agent_id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {cal.agent_name || `Agent ${cal.agent_id.slice(0, 8)}...`}
                    </h4>
                    <p className="text-sm text-gray-600">
                      {cal.total_tasks} tasks completed
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium bg-${statusColor}-100 text-${statusColor}-700`}
                  >
                    {calibrationStatus === "OVERCONFIDENT"
                      ? "Overconfident"
                      : calibrationStatus === "UNDERCONFIDENT"
                        ? "Underconfident"
                        : "Well Calibrated"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <p className="text-xs text-gray-600">Avg Confidence</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {cal.avg_confidence.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Actual Success</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {cal.avg_actual_success.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Calibration Gap</p>
                    <p
                      className={`text-lg font-semibold ${Math.abs(cal.avg_overconfidence_gap) > 15
                        ? "text-red-600"
                        : "text-green-600"
                        }`}
                    >
                      {cal.avg_overconfidence_gap > 0 ? "+" : ""}
                      {cal.avg_overconfidence_gap.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Calibration Bar */}
                <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="absolute h-full bg-blue-500 opacity-50"
                    style={{ width: `${Math.min(cal.avg_confidence, 100)}%` }}
                    title={`Confidence: ${cal.avg_confidence.toFixed(1)}%`}
                  />
                  <div
                    className="absolute h-full bg-green-500"
                    style={{ width: `${Math.min(cal.avg_actual_success, 100)}%` }}
                    title={`Success: ${cal.avg_actual_success.toFixed(1)}%`}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>🔵 Confidence</span>
                  <span>🟢 Actual Success</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const AgentDelegationMonitoringDashboard: React.FC = () => {
  return (
    <ErrorBoundary>
      <AgentDelegationMonitoringDashboardInner />
    </ErrorBoundary>
  );
};

