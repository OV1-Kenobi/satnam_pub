/**
 * Pending Deletions Tab
 * Admin queue for reviewing and processing user deletion requests
 * @module PendingDeletionsTab
 */

import {
  AlertTriangle,
  Check,
  Clock,
  RefreshCw,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import {
  DeletionRequest,
  formatCoolingOffTime,
  getCoolingOffTimeRemaining,
} from "../../lib/user-deletion-service";
import { showToast } from "../../services/toastService";
import { useAuth } from "../auth/AuthProvider";

interface PendingDeletionsTabProps {
  className?: string;
  onRefresh?: () => void;
}

interface DeletionRequestWithUser extends DeletionRequest {
  user_nip05?: string;
  user_npub?: string;
  user_created_at?: string;
}

export const PendingDeletionsTab: React.FC<PendingDeletionsTabProps> = ({
  className = "",
  onRefresh,
}) => {
  const { sessionToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<DeletionRequestWithUser[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "ready">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch pending deletion requests
  const fetchRequests = useCallback(async () => {
    if (!sessionToken) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/admin/deletion-requests?filter=${filter}`,
        {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        showToast.error(result.error || "Failed to fetch deletion requests");
        return;
      }

      // Ensure data is always an array to prevent .filter() errors
      const data = Array.isArray(result.data) ? result.data : [];
      setRequests(data);
    } catch (err) {
      showToast.error(
        err instanceof Error ? err.message : "Failed to fetch requests"
      );
    } finally {
      setLoading(false);
    }
  }, [sessionToken, filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Approve deletion request
  const handleApprove = async (requestId: string) => {
    if (!sessionToken) return;

    setProcessingId(requestId);
    try {
      const response = await fetch("/api/admin/deletion-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          action: "approve",
          request_id: requestId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        showToast.error(result.error || "Failed to approve deletion");
        return;
      }

      showToast.success("Deletion request approved");
      fetchRequests();
      onRefresh?.();
    } catch (err) {
      showToast.error(
        err instanceof Error ? err.message : "Failed to approve"
      );
    } finally {
      setProcessingId(null);
    }
  };

  // Deny deletion request
  const handleDeny = async (requestId: string, reason: string) => {
    if (!sessionToken) return;

    setProcessingId(requestId);
    try {
      const response = await fetch("/api/admin/deletion-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          action: "deny",
          request_id: requestId,
          denial_reason: reason,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        showToast.error(result.error || "Failed to deny deletion");
        return;
      }

      showToast.success("Deletion request denied");
      fetchRequests();
      onRefresh?.();
    } catch (err) {
      showToast.error(
        err instanceof Error ? err.message : "Failed to deny"
      );
    } finally {
      setProcessingId(null);
    }
  };

  // Filter requests by search query (with defensive array check)
  const filteredRequests = Array.isArray(requests)
    ? requests.filter((req) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        req.user_nip05?.toLowerCase().includes(query) ||
        req.user_npub?.toLowerCase().includes(query) ||
        req.user_duid.toLowerCase().includes(query)
      );
    })
    : [];

  // Get status badge color
  const getStatusBadge = (status: string, coolingOffEndsAt: string) => {
    const { expired } = getCoolingOffTimeRemaining(coolingOffEndsAt);

    if (status === "pending" && !expired) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded-full">
          Cooling Off
        </span>
      );
    }
    if (status === "pending" && expired) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-orange-500/20 text-orange-400 rounded-full">
          Ready for Review
        </span>
      );
    }
    if (status === "approved") {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-red-500/20 text-red-400 rounded-full">
          Approved
        </span>
      );
    }
    return (
      <span className="px-2 py-1 text-xs font-medium bg-gray-500/20 text-gray-400 rounded-full">
        {status}
      </span>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-600/20 rounded-full flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Pending Deletions</h2>
            <p className="text-sm text-gray-400">
              Review and process user account deletion requests
            </p>
          </div>
        </div>
        <button
          onClick={fetchRequests}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by NIP-05, npub, or ID..."
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
        <div className="flex gap-2">
          {(["all", "pending", "ready"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === f
                ? "bg-purple-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-xl">
          <Trash2 className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">No deletion requests found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((request) => {
            const { expired } = getCoolingOffTimeRemaining(request.cooling_off_ends_at);
            const canProcess = expired || request.status === "ready";

            return (
              <div
                key={request.id}
                className="bg-gray-800 rounded-xl p-4 border border-gray-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">
                          {request.user_nip05 || (request.user_npub && request.user_npub.slice(0, 16) + "...") || request.user_duid.slice(0, 12) + "..."}
                        </span>
                        {getStatusBadge(request.status, request.cooling_off_ends_at)}
                      </div>
                      <div className="text-sm text-gray-400 space-y-1">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          <span>
                            Requested: {new Date(request.requested_at).toLocaleDateString()}
                          </span>
                        </div>
                        {!expired && (
                          <div className="flex items-center gap-2 text-yellow-400">
                            <AlertTriangle className="w-3 h-3" />
                            <span>{formatCoolingOffTime(request.cooling_off_ends_at)}</span>
                          </div>
                        )}
                        <div>Reason: {request.reason}</div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {canProcess && (
                      <>
                        <button
                          onClick={() => handleApprove(request.id)}
                          disabled={processingId === request.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            const reason = prompt("Enter denial reason:");
                            if (reason && reason.trim()) {
                              handleDeny(request.id, reason.trim());
                            }
                          }}
                          disabled={processingId === request.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white text-sm rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                          Deny
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PendingDeletionsTab;

