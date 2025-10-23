/**
 * Hierarchical Admin Dashboard Component
 * Supports Guardian → Steward → Adult → Offspring role hierarchy
 * Features: Subordinate management, bypass/recovery code management, audit logging
 */

import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  Copy,
  Key,
  RefreshCw,
  Shield,
  Users
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

interface AdminRole {
  id: string;
  user_duid: string;
  role: "guardian" | "steward" | "adult" | "offspring";
  parent_admin_duid?: string;
  federation_id?: string;
  is_active: boolean;
  created_at: string;
}

interface Subordinate {
  id: string;
  user_duid: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface AuditLogEntry {
  id: string;
  admin_user_duid: string;
  action: string;
  target_user_duid?: string;
  resource_type?: string;
  details?: any;
  timestamp: string;
}

interface DashboardData {
  role: string;
  subordinates: Subordinate[];
  recentActions: AuditLogEntry[];
  stats: {
    totalSubordinates: number;
    activeBypassCodes: number;
    expiredRecoveryCodes: number;
  };
}

const HierarchicalAdminDashboard: React.FC = () => {
  const { user, sessionToken } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "subordinates" | "codes" | "audit"
  >("overview");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [generatingBypassCode, setGeneratingBypassCode] = useState(false);
  const [generatingRecoveryCodes, setGeneratingRecoveryCodes] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, [user, sessionToken]);

  const loadDashboard = async () => {
    if (!sessionToken) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      try {
        const response = await fetch("/.netlify/functions/admin-dashboard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ action: "get_dashboard" }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
          setDashboardData(data.dashboard);
        } else {
          setError(data.error || "Failed to load dashboard");
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        throw fetchErr;
      }
    } catch (err) {
      console.error("Dashboard load error:", err instanceof Error ? err.message : "Unknown error");
      setError(
        err instanceof Error ? err.message : "Failed to load dashboard"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateBypassCode = async (targetUserDuid: string) => {
    if (!sessionToken) return;

    setGeneratingBypassCode(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      try {
        const response = await fetch("/.netlify/functions/admin-dashboard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            action: "generate_bypass_code",
            targetUserDuid,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json();
        if (data.success) {
          setGeneratedCode(data.bypassCode);
          setShowCodeModal(true);
        } else {
          setError(data.error || "Failed to generate bypass code");
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        throw fetchErr;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate code");
    } finally {
      setGeneratingBypassCode(false);
    }
  };

  const handleGenerateRecoveryCodes = async () => {
    if (!sessionToken) return;

    setGeneratingRecoveryCodes(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      try {
        const response = await fetch("/.netlify/functions/admin-dashboard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ action: "generate_recovery_codes" }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json();
        if (data.success) {
          setGeneratedCode(data.recoveryCodes.join("\n"));
          setShowCodeModal(true);
        } else {
          setError(data.error || "Failed to generate recovery codes");
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        throw fetchErr;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate codes");
    } finally {
      setGeneratingRecoveryCodes(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw
            className="h-8 w-8 animate-spin mx-auto mb-2"
            aria-label="Loading"
          />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-red-600 mx-auto mb-2" />
          <p className="text-red-600">{error || "Not an admin"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center space-x-3">
            <Shield className="h-8 w-8" />
            <div>
              <h1 className="text-3xl font-bold">Admin Dashboard</h1>
              <p className="text-purple-100">
                Role: {dashboardData.role.charAt(0).toUpperCase() + dashboardData.role.slice(1)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex space-x-4 border-b border-gray-200 mb-6">
          {(
            [
              { id: "overview", label: "Overview", icon: BarChart3 },
              { id: "subordinates", label: "Subordinates", icon: Users },
              { id: "codes", label: "Codes", icon: Key },
              { id: "audit", label: "Audit Log", icon: Clock },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 border-b-2 font-medium transition-colors ${activeTab === tab.id
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <OverviewTab data={dashboardData} />
        )}
        {activeTab === "subordinates" && (
          <SubordinatesTab
            subordinates={dashboardData.subordinates}
            onGenerateBypassCode={handleGenerateBypassCode}
            isGenerating={generatingBypassCode}
          />
        )}
        {activeTab === "codes" && (
          <CodesTab
            onGenerateRecoveryCodes={handleGenerateRecoveryCodes}
            isGenerating={generatingRecoveryCodes}
          />
        )}
        {activeTab === "audit" && (
          <AuditTab auditLog={dashboardData.recentActions} />
        )}
      </div>

      {/* Code Display Modal */}
      {showCodeModal && generatedCode && (
        <CodeDisplayModal
          code={generatedCode}
          onClose={() => {
            setShowCodeModal(false);
            setGeneratedCode(null);
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// TAB COMPONENTS
// ============================================================================

function OverviewTab({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-600 text-sm">Total Subordinates</p>
            <p className="text-3xl font-bold text-gray-900">
              {data.stats.totalSubordinates}
            </p>
          </div>
          <Users className="h-8 w-8 text-purple-600" />
        </div>
      </div>

      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-600 text-sm">Active Bypass Codes</p>
            <p className="text-3xl font-bold text-gray-900">
              {data.stats.activeBypassCodes}
            </p>
          </div>
          <Key className="h-8 w-8 text-blue-600" />
        </div>
      </div>

      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-600 text-sm">Recent Actions</p>
            <p className="text-3xl font-bold text-gray-900">
              {data.recentActions.length}
            </p>
          </div>
          <Clock className="h-8 w-8 text-green-600" />
        </div>
      </div>
    </div>
  );
}

function SubordinatesTab({
  subordinates,
  onGenerateBypassCode,
  isGenerating,
}: {
  subordinates: Subordinate[];
  onGenerateBypassCode: (userDuid: string) => void;
  isGenerating: boolean;
}) {
  return (
    <div className="space-y-4">
      {subordinates.length === 0 ? (
        <div className="bg-white rounded-lg p-6 border border-gray-200 text-center">
          <p className="text-gray-600">No subordinates</p>
        </div>
      ) : (
        subordinates.map((sub) => (
          <div
            key={sub.id}
            className="bg-white rounded-lg p-6 border border-gray-200 flex justify-between items-center"
          >
            <div>
              <p className="font-semibold text-gray-900">{sub.user_duid}</p>
              <p className="text-sm text-gray-600">
                Role: {sub.role} • Created: {new Date(sub.created_at).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => onGenerateBypassCode(sub.user_duid)}
              disabled={isGenerating}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? "Generating..." : "Generate Bypass Code"}
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function CodesTab({
  onGenerateRecoveryCodes,
  isGenerating,
}: {
  onGenerateRecoveryCodes: () => void;
  isGenerating: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">Recovery Codes</h3>
        <p className="text-gray-600 mb-4">
          Generate emergency recovery codes for your account. Store them in a safe place.
        </p>
        <button
          onClick={onGenerateRecoveryCodes}
          disabled={isGenerating}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? "Generating..." : "Generate Recovery Codes"}
        </button>
      </div>
    </div>
  );
}

function AuditTab({ auditLog }: { auditLog: AuditLogEntry[] }) {
  return (
    <div className="space-y-4">
      {auditLog.length === 0 ? (
        <div className="bg-white rounded-lg p-6 border border-gray-200 text-center">
          <p className="text-gray-600">No audit log entries</p>
        </div>
      ) : (
        auditLog.map((entry) => (
          <div
            key={entry.id}
            className="bg-white rounded-lg p-6 border border-gray-200"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-gray-900">{entry.action}</p>
                <p className="text-sm text-gray-600">
                  {new Date(entry.timestamp).toLocaleString()}
                </p>
                {entry.target_user_duid && (
                  <p className="text-sm text-gray-600">
                    Target: {entry.target_user_duid}
                  </p>
                )}
              </div>
              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm">
                {entry.resource_type || "N/A"}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ============================================================================
// CODE DISPLAY MODAL
// ============================================================================

function CodeDisplayModal({
  code,
  onClose,
}: {
  code: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
        <div className="flex items-center space-x-3 mb-4">
          <CheckCircle className="h-6 w-6 text-green-600" />
          <h2 id="modal-title" className="text-xl font-bold">
            Code Generated
          </h2>
        </div>

        <div className="bg-gray-50 rounded p-4 mb-4 font-mono text-sm break-all">
          {code}
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
          <p className="text-sm text-yellow-800">
            ⚠️ Save this code in a secure location. It will not be shown again.
          </p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleCopy}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors flex items-center justify-center space-x-2"
          >
            <Copy className="h-4 w-4" />
            <span>{copied ? "Copied!" : "Copy"}</span>
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 rounded hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default HierarchicalAdminDashboard;


