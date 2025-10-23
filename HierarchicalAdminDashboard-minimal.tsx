import React from "react";
import { AlertTriangle, BarChart3, Users, Key, Clock, Shield, RefreshCw } from "lucide-react";

interface DashboardData {
  role: string;
  stats: {
    totalSubordinates: number;
    activeBypassCodes: number;
  };
  subordinates: unknown[];
  recentActions: unknown[];
}

interface AuditLogEntry {
  timestamp: string;
  action: string;
  details: string;
}

export const HierarchicalAdminDashboard: React.FC = () => {
  const [loading, setLoading] = React.useState(true);
  const [dashboardData, setDashboardData] = React.useState<DashboardData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<"overview" | "subordinates" | "codes" | "audit">("overview");
  const [generatingBypassCode, setGeneratingBypassCode] = React.useState(false);
  const [generatingRecoveryCodes, setGeneratingRecoveryCodes] = React.useState(false);
  const [showCodeModal, setShowCodeModal] = React.useState(false);
  const [generatedCode, setGeneratedCode] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await fetch("/api/admin/dashboard");
        if (!response.ok) {
          throw new Error("Failed to fetch dashboard data");
        }
        const data = await response.json();
        setDashboardData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const handleGenerateBypassCode = async (targetUserDuid: string) => {
    setGeneratingBypassCode(true);
    try {
      const response = await fetch("/api/admin/generate-bypass-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserDuid }),
      });
      if (!response.ok) throw new Error("Failed to generate bypass code");
      const data = await response.json();
      setGeneratedCode(data.bypassCode);
      setShowCodeModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate bypass code");
    } finally {
      setGeneratingBypassCode(false);
    }
  };

  const handleGenerateRecoveryCodes = async () => {
    setGeneratingRecoveryCodes(true);
    try {
      const response = await fetch("/api/admin/generate-recovery-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to generate recovery codes");
      const data = await response.json();
      setGeneratedCode(data.recoveryCodes.join("\n"));
      setShowCodeModal(true);
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
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" aria-label="Loading" />
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
              className={`flex items-center space-x-2 px-4 py-2 border-b-2 font-medium transition-colors ${
                activeTab === tab.id
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
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <p className="text-gray-600">Tab content coming soon...</p>
        </div>
      </div>
    </div>
  );
};

