/**
 * Admin Account Control Dashboard
 * Main dashboard container with tab navigation for admin account management
 * @module AdminAccountControlDashboard
 */

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Clock,
  RefreshCw,
  Shield,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorBoundary } from "../ErrorBoundary";
import { useAuth } from "../auth/AuthProvider";
import { AccountsTab } from "./AccountsTab";
import { AdminAuthGuard, useAdminContext } from "./AdminAuthGuard";
import { AuditLogTab } from "./AuditLogTab";
import { MonitoringTab } from "./MonitoringTab";
import { OrphansTab } from "./OrphansTab";
import { OverviewTab } from "./OverviewTab";
import { PendingDeletionsTab } from "./PendingDeletionsTab";

// Types imported from dedicated types file to avoid circular dependencies
import type { RemovalLogEntry, RemovalStats } from "../../types/admin";

// Re-export types for backward compatibility with existing imports
export type { RemovalLogEntry, RemovalStats } from "../../types/admin";

type TabId = "overview" | "accounts" | "deletions" | "orphans" | "audit" | "monitoring";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
  platformOnly?: boolean;
}

const TABS: TabDef[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "accounts", label: "Accounts", icon: Users },
  { id: "deletions", label: "Pending Deletions", icon: UserMinus },
  { id: "orphans", label: "Orphans", icon: Trash2, platformOnly: true },
  { id: "audit", label: "Audit Log", icon: Clock },
  { id: "monitoring", label: "Monitoring", icon: Activity, platformOnly: true },
];

// Main Dashboard Component
const AdminAccountControlDashboardInner: React.FC = () => {
  const adminContext = useAdminContext();
  const { sessionToken } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<RemovalStats | null>(null);
  const [removals, setRemovals] = useState<RemovalLogEntry[]>([]);

  const fetchDashboardData = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/account-control", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "list_removals", limit: 50 }),
      });
      if (!response.ok) throw new Error("Failed to fetch dashboard data");
      const data = await response.json();
      setRemovals(data.data?.removals || []);
      // Calculate stats from removals (single pass for efficiency)
      const entries = data.data?.removals || [];
      const now = new Date();
      const calculatedStats = entries.reduce(
        (acc: RemovalStats, e: RemovalLogEntry) => {
          acc.total++;
          if (e.status === "completed") acc.completed++;
          if (e.status === "failed") acc.failed++;
          if (["pending", "executing"].includes(e.status)) acc.pending++;
          if (e.rollback_executed) acc.rolledBack++;
          if (
            e.status === "completed" &&
            !e.rollback_executed &&
            e.rollback_expires_at &&
            new Date(e.rollback_expires_at) > now
          ) {
            acc.rollbackAvailable++;
          }
          acc.totalRecordsDeleted += e.records_deleted || 0;
          return acc;
        },
        {
          total: 0,
          completed: 0,
          failed: 0,
          pending: 0,
          rolledBack: 0,
          rollbackAvailable: 0,
          totalRecordsDeleted: 0,
        }
      );
      setStats(calculatedStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  const visibleTabs = TABS.filter(tab => !tab.platformOnly || adminContext?.adminType === "platform");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 rounded-lg"
                aria-label="Go back"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </button>
              <div className="flex items-center space-x-2">
                <Shield className="h-6 w-6 text-purple-600" />
                <h1 className="text-xl font-bold text-gray-900">Account Control</h1>
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded ${adminContext?.adminType === "platform" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
                }`}>
                {adminContext?.adminType === "platform" ? "Platform Admin" : "Federation Admin"}
              </span>
            </div>
            <button onClick={fetchDashboardData} disabled={loading} className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          {visibleTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md font-medium transition-colors ${activeTab === tab.id ? "bg-white text-purple-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
                }`}>
              <tab.icon className="h-4 w-4" /><span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <ErrorBoundary>
          {activeTab === "overview" && <OverviewTab stats={stats} loading={loading} />}
          {activeTab === "accounts" && (
            <AccountsTab
              sessionToken={sessionToken}
              adminContext={adminContext}
              onRefresh={fetchDashboardData}
            />
          )}
          {activeTab === "deletions" && (
            <PendingDeletionsTab onRefresh={fetchDashboardData} />
          )}
          {activeTab === "orphans" && <OrphansTab sessionToken={sessionToken} />}
          {activeTab === "audit" && (
            <AuditLogTab
              removals={removals}
              loading={loading}
              sessionToken={sessionToken}
              onRefresh={fetchDashboardData}
            />
          )}
          {activeTab === "monitoring" && <MonitoringTab sessionToken={sessionToken} />}
        </ErrorBoundary>
      </div>
    </div>
  );
};

// Wrapped with AdminAuthGuard
export const AdminAccountControlDashboard: React.FC = () => (
  <ErrorBoundary>
    <AdminAuthGuard>
      <AdminAccountControlDashboardInner />
    </AdminAuthGuard>
  </ErrorBoundary>
);

export default AdminAccountControlDashboard;
