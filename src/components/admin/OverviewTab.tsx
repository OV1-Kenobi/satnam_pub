/**
 * Overview Tab Component
 * Statistics dashboard for admin account control
 * @module OverviewTab
 */

import { BarChart3, CheckCircle, Clock, RotateCcw, Trash2, XCircle } from "lucide-react";
import React from "react";
// Import from dedicated types file to avoid circular dependency with AdminAccountControlDashboard
import type { RemovalStats } from "../../types/admin";

interface OverviewTabProps {
  stats: RemovalStats | null;
  loading: boolean;
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color: "purple" | "green" | "red" | "yellow" | "blue" | "gray";
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon, color }) => {
  const colorClasses = {
    purple: "bg-purple-100 text-purple-600",
    green: "bg-green-100 text-green-600",
    red: "bg-red-100 text-red-600",
    yellow: "bg-yellow-100 text-yellow-600",
    blue: "bg-blue-100 text-blue-600",
    gray: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="bg-white rounded-lg p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  );
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ stats, loading }) => {
  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="bg-gray-200 rounded-lg h-32" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No statistics available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard label="Total Removals" value={stats.total} icon={Trash2} color="purple" />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle} color="green" />
        <StatCard label="Failed" value={stats.failed} icon={XCircle} color="red" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} color="yellow" />
        <StatCard label="Rolled Back" value={stats.rolledBack} icon={RotateCcw} color="blue" />
        <StatCard label="Rollback Available" value={stats.rollbackAvailable} icon={RotateCcw} color="blue" />
        <StatCard label="Records Deleted" value={stats.totalRecordsDeleted} icon={BarChart3} color="gray" />
      </div>

      {/* Summary Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-500">Success Rate</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Rollback Rate</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.completed > 0 ? Math.round((stats.rolledBack / stats.completed) * 100) : 0}%
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Avg Records per Removal</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.completed > 0 ? Math.round(stats.totalRecordsDeleted / stats.completed) : 0}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
