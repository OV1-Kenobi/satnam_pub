/**
 * Audit Log Tab Component
 * Removal history with filtering, rollback integration, and export
 * Phase 5: Enhanced with date range filtering and JSON export
 * @module AuditLogTab
 */

import { Calendar, Clock, Download, FileJson, Filter, RotateCcw, Search } from "lucide-react";
import React, { useMemo, useState } from "react";
import type { RemovalLogEntry } from "./AdminAccountControlDashboard";
import { RollbackConfirmationModal } from "./RollbackConfirmationModal";

type ExportFormat = "csv" | "json";

interface AuditLogTabProps {
  removals: RemovalLogEntry[];
  loading: boolean;
  sessionToken: string | null;
  onRefresh?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  pending: "bg-yellow-100 text-yellow-800",
  executing: "bg-blue-100 text-blue-800",
  rolled_back: "bg-purple-100 text-purple-800",
};

export const AuditLogTab: React.FC<AuditLogTabProps> = ({
  removals,
  loading,
  sessionToken,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRemoval, setSelectedRemoval] = useState<RemovalLogEntry | null>(null);
  const [showRollbackModal, setShowRollbackModal] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");

  const filteredRemovals = useMemo(() => {
    return removals.filter((removal) => {
      const matchesSearch = searchQuery === "" ||
        removal.removal_reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
        removal.target_user_duid.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || removal.status === statusFilter;

      // Date range filtering (using date-only comparison to avoid timezone issues)
      const removalDateStr = removal.requested_at.split("T")[0];
      const matchesDateFrom = !dateFrom || removalDateStr >= dateFrom;
      const matchesDateTo = !dateTo || removalDateStr <= dateTo;

      return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
    });
  }, [removals, searchQuery, statusFilter, dateFrom, dateTo]);

  const canRollback = (removal: RemovalLogEntry): boolean => {
    return removal.status === "completed" &&
      !removal.rollback_executed &&
      removal.rollback_expires_at !== null &&
      new Date(removal.rollback_expires_at) > new Date();
  };

  const handleRollbackClick = (removal: RemovalLogEntry) => {
    setSelectedRemoval(removal);
    setShowRollbackModal(true);
  };

  const handleRollbackSuccess = () => {
    setShowRollbackModal(false);
    setSelectedRemoval(null);
    onRefresh?.();
  };

  const exportData = () => {
    const dateStr = new Date().toISOString().split("T")[0];

    if (exportFormat === "json") {
      const jsonData = {
        exportDate: new Date().toISOString(),
        filters: { searchQuery, statusFilter, dateFrom, dateTo },
        totalEntries: filteredRemovals.length,
        entries: filteredRemovals.map(r => ({
          id: r.id,
          reason: r.removal_reason,
          status: r.status,
          targetUserDuid: r.target_user_duid,
          requestedAt: r.requested_at,
          completedAt: r.completed_at,
          recordsDeleted: r.records_deleted,
          rollbackExecuted: r.rollback_executed,
          rollbackExpiresAt: r.rollback_expires_at,
        })),
      };
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // Escape CSV values to prevent injection and handle special characters
      const escapeCSV = (value: string): string => {
        const escaped = value.replace(/"/g, '""');
        // Prefix with single quote to prevent formula injection in spreadsheets
        if (/^[=+\-@\t\r]/.test(escaped)) {
          return `"'${escaped}"`;
        }
        return `"${escaped}"`;
      };

      const headers = ["ID", "Reason", "Status", "Target User", "Requested At", "Completed At", "Records Deleted", "Rollback Executed"];
      const rows = filteredRemovals.map(r => [
        escapeCSV(r.id),
        escapeCSV(r.removal_reason),
        escapeCSV(r.status),
        escapeCSV(r.target_user_duid),
        escapeCSV(r.requested_at),
        escapeCSV(r.completed_at || ""),
        escapeCSV(r.records_deleted.toString()),
        escapeCSV(r.rollback_executed ? "Yes" : "No")
      ]);
      const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-200 rounded-lg h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search audit log"
              placeholder="Search audit log..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="executing">Executing</option>
              <option value="rolled_back">Rolled Back</option>
            </select>
          </div>
        </div>

        {/* Date Range and Export */}
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Filter from date"
              className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Filter to date"
              className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
            />
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              aria-label="Export format"
              className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
            <button onClick={exportData} disabled={filteredRemovals.length === 0}
              className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center space-x-2">
              {exportFormat === "json" ? <FileJson className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <p className="text-sm text-gray-500">{filteredRemovals.length} entries</p>

      {/* Log Entries */}
      {filteredRemovals.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No audit log entries found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRemovals.map((removal) => (
            <div key={removal.id} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${STATUS_COLORS[removal.status] || "bg-gray-100 text-gray-800"}`}>
                      {removal.status}
                    </span>
                    {removal.rollback_executed && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-800">Rolled Back</span>
                    )}
                  </div>
                  <p className="font-medium text-gray-900">{removal.removal_reason}</p>
                  <p className="text-sm text-gray-500 font-mono truncate">User: {removal.target_user_duid}</p>
                  <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                    <span>Requested: {new Date(removal.requested_at).toLocaleString()}</span>
                    {removal.completed_at && <span>Completed: {new Date(removal.completed_at).toLocaleString()}</span>}
                    <span>{removal.records_deleted} records</span>
                  </div>
                </div>
                {canRollback(removal) && (
                  <button onClick={() => handleRollbackClick(removal)}
                    className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex items-center space-x-1">
                    <RotateCcw className="h-3 w-3" />
                    <span>Rollback</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rollback Modal */}
      {showRollbackModal && selectedRemoval && (
        <RollbackConfirmationModal
          removal={selectedRemoval}
          sessionToken={sessionToken}
          onClose={() => setShowRollbackModal(false)}
          onSuccess={handleRollbackSuccess}
        />
      )}
    </div>
  );
};

export default AuditLogTab;
