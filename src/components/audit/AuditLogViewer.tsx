/**
 * Audit Log Viewer
 *
 * Searchable/filterable audit log display for signing events.
 * Provides transparency and accountability for permission usage.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Transparent audit trail
 * - Role-based visibility
 * - Searchable/filterable history
 */

import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import React, { useState } from "react";
import { useAuditLog } from "../../hooks/usePermissions";
import type { AuditLogStatus, SigningAuditLogEntry } from "../../types/permissions";

interface AuditLogViewerProps {
  federationId: string;
  memberDuid?: string;
  compact?: boolean;
}

const STATUS_STYLES: Record<
  AuditLogStatus,
  { bg: string; text: string; icon: React.FC<{ className?: string }> }
> = {
  pending: { bg: "bg-yellow-100", text: "text-yellow-700", icon: Clock },
  approved: { bg: "bg-green-100", text: "text-green-700", icon: Check },
  rejected: { bg: "bg-red-100", text: "text-red-700", icon: X },
  signed: { bg: "bg-purple-100", text: "text-purple-700", icon: Check },
  failed: { bg: "bg-red-100", text: "text-red-700", icon: AlertTriangle },
  executed: { bg: "bg-blue-100", text: "text-blue-700", icon: Check },
  expired: { bg: "bg-gray-100", text: "text-gray-700", icon: Clock },
};

interface AuditLogEntryRowProps {
  entry: SigningAuditLogEntry;
  compact?: boolean;
}

const AuditLogEntryRow: React.FC<AuditLogEntryRowProps> = ({
  entry,
  compact = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const statusStyle = STATUS_STYLES[entry.status] || STATUS_STYLES.pending;
  const StatusIcon = statusStyle.icon;

  const formatDate = (dateInput: string | Date) => {
    const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    return compact
      ? date.toLocaleDateString()
      : date.toLocaleString();
  };

  return (
    <div
      className={`border-b border-gray-100 last:border-0 ${compact ? "py-2" : "py-3"
        }`}
    >
      <div
        className="flex items-center justify-between cursor-pointer hover:bg-gray-50 px-4 rounded"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center space-x-3">
          <div className={`p-1.5 rounded ${statusStyle.bg}`}>
            <StatusIcon className={`h-4 w-4 ${statusStyle.text}`} />
          </div>
          <div>
            <div className="font-medium text-gray-900 text-sm">
              {entry.eventType.replace(/_/g, " ")}
            </div>
            <div className="text-xs text-gray-500">
              {entry.memberDuid.slice(0, 8)}...
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <span
            className={`px-2 py-0.5 rounded text-xs capitalize ${statusStyle.bg} ${statusStyle.text}`}
          >
            {entry.status}
          </span>
          <span className="text-xs text-gray-500">
            {formatDate(entry.requestedAt)}
          </span>
        </div>
      </div>

      {expanded && !compact && (
        <div className="mt-2 mx-4 p-3 bg-gray-50 rounded-lg text-sm space-y-2">
          {entry.eventId && (
            <div>
              <span className="text-gray-500">Event ID:</span>{" "}
              <span className="font-mono text-xs">{entry.eventId}</span>
            </div>
          )}
          {entry.approvedBy && (
            <div>
              <span className="text-gray-500">Approved by:</span>{" "}
              {entry.approvedBy.slice(0, 8)}...
              {entry.approvedAt && (
                <span className="text-gray-400 ml-2">
                  at {formatDate(entry.approvedAt)}
                </span>
              )}
            </div>
          )}
          {entry.rejectedBy && (
            <div>
              <span className="text-gray-500">Rejected by:</span>{" "}
              {entry.rejectedBy.slice(0, 8)}...
              {entry.rejectionReason && (
                <span className="text-gray-400 ml-2">
                  - {entry.rejectionReason}
                </span>
              )}
            </div>
          )}
          {entry.executedAt && (
            <div>
              <span className="text-gray-500">Executed:</span>{" "}
              {formatDate(entry.executedAt)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const PAGE_SIZE = 50;
const COMPACT_PAGE_SIZE = 10;

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({
  federationId,
  memberDuid,
  compact = false,
}) => {
  const [statusFilter, setStatusFilter] = useState<AuditLogStatus | "">("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [offset, setOffset] = useState(0);
  const [allEntries, setAllEntries] = useState<SigningAuditLogEntry[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const pageSize = compact ? COMPACT_PAGE_SIZE : PAGE_SIZE;

  const { auditLog, loading, error, refresh } = useAuditLog(federationId, {
    memberDuid,
    status: statusFilter || undefined,
    eventType: eventTypeFilter || undefined,
    limit: pageSize,
    offset,
  });

  // Update entries when auditLog changes
  React.useEffect(() => {
    if (offset === 0) {
      setAllEntries(auditLog);
    } else if (auditLog.length > 0) {
      setAllEntries((prev) => [...prev, ...auditLog]);
    }
    setHasMore(auditLog.length === pageSize);
    setLoadingMore(false);
  }, [auditLog, offset, pageSize]);

  // Reset pagination when filters change
  React.useEffect(() => {
    setOffset(0);
    setAllEntries([]);
  }, [statusFilter, eventTypeFilter, memberDuid]);

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    setOffset((prev) => prev + pageSize);
  };

  // Filter by search query (applies to accumulated entries)
  const filteredLog = allEntries.filter((entry) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      entry.eventType.toLowerCase().includes(query) ||
      entry.memberDuid.toLowerCase().includes(query) ||
      entry.eventId?.toLowerCase().includes(query)
    );
  });

  // Show loading only on initial load (offset === 0)
  if (loading && offset === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
        <span className="ml-2 text-gray-600 text-sm">Loading audit log...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <FileText className="h-5 w-5 text-purple-600" />
          <h2 className={`font-semibold text-gray-900 ${compact ? "text-base" : "text-lg"}`}>
            Audit Log
          </h2>
          <span className="text-sm text-gray-500">
            ({filteredLog.length} entries{hasMore ? "+" : ""})
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            aria-label={showFilters ? "Hide filters" : "Show filters"}
            className={`p-2 rounded-lg transition-colors ${showFilters ? "bg-purple-100 text-purple-600" : "text-gray-600 hover:bg-gray-100"
              }`}
          >
            <Filter className="h-4 w-4" />
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh audit log"
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-4 border-b border-gray-200 bg-gray-50 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by event type, member, or ID..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex space-x-4">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AuditLogStatus | "")}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="signed">Signed</option>
              <option value="failed">Failed</option>
              <option value="executed">Executed</option>
              <option value="expired">Expired</option>
            </select>

            {/* Event Type Filter */}
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
            >
              <option value="">All Event Types</option>
              <option value="payment">Payment</option>
              <option value="invoice">Invoice</option>
              <option value="social_post">Social Post</option>
              <option value="media_post">Media Post</option>
              <option value="profile_update">Profile Update</option>
              <option value="member_invite">Member Invite</option>
            </select>
          </div>
        </div>
      )}

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertTriangle className="h-4 w-4 inline mr-2" />
          {error}
        </div>
      )}

      {/* Log Entries */}
      <div className={`divide-y divide-gray-100 ${compact ? "max-h-64" : "max-h-96"} overflow-y-auto`}>
        {filteredLog.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No audit log entries</p>
            <p className="text-sm">Signing events will appear here</p>
          </div>
        ) : (
          filteredLog.map((entry) => (
            <AuditLogEntryRow key={entry.id} entry={entry} compact={compact} />
          ))
        )}
      </div>

      {/* Footer with Pagination */}
      {!compact && filteredLog.length > 0 && (
        <div className="p-3 border-t border-gray-200 bg-gray-50 text-center">
          {hasMore ? (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="text-sm text-purple-600 hover:text-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
                  Loading...
                </>
              ) : (
                "Load more entries"
              )}
            </button>
          ) : (
            <span className="text-sm text-gray-500">All entries loaded</span>
          )}
        </div>
      )}
    </div>
  );
};

export default AuditLogViewer;

