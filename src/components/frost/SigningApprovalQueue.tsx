/**
 * Signing Approval Queue
 *
 * Queue showing pending signing requests with approve/reject actions.
 * Used by Guardians/Stewards to approve actions requiring oversight.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Role-based approval workflow
 * - Audit trail integration
 * - Time-sensitive request handling
 */

import {
  AlertTriangle,
  Check,
  Clock,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  Shield,
  X,
  Zap,
} from "lucide-react";
import React, { useState } from "react";
import { useApprovalQueue } from "../../hooks/usePermissions";
import type {
  FederationRole,
  SigningAuditLogEntry,
} from "../../types/permissions";

interface SigningApprovalQueueProps {
  federationId: string;
  userRole: FederationRole;
  userDuid: string;
  onApprovalChange?: () => void;
}

// Event type icons and labels
const EVENT_TYPE_INFO: Record<string, { icon: React.FC<{ className?: string }>; label: string; color: string }> = {
  payment: { icon: Zap, label: "Payment", color: "text-yellow-600 bg-yellow-100" },
  invoice: { icon: FileText, label: "Invoice", color: "text-blue-600 bg-blue-100" },
  social_post: { icon: MessageSquare, label: "Social Post", color: "text-purple-600 bg-purple-100" },
  media_post: { icon: FileText, label: "Media Post", color: "text-pink-600 bg-pink-100" },
  profile_update: { icon: Shield, label: "Profile Update", color: "text-green-600 bg-green-100" },
  member_invite: { icon: Shield, label: "Member Invite", color: "text-indigo-600 bg-indigo-100" },
  default: { icon: FileText, label: "Event", color: "text-gray-600 bg-gray-100" },
};

interface ApprovalCardProps {
  entry: SigningAuditLogEntry;
  onApprove: (auditId: string) => Promise<void>;
  onReject: (auditId: string, reason?: string) => Promise<void>;
  processing: boolean;
}

const ApprovalCard: React.FC<ApprovalCardProps> = ({
  entry,
  onApprove,
  onReject,
  processing,
}) => {
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<"approve" | "reject" | null>(null);

  const eventInfo = EVENT_TYPE_INFO[entry.eventType] || EVENT_TYPE_INFO.default;
  const Icon = eventInfo.icon;

  const handleApprove = async () => {
    setActionLoading("approve");
    try {
      await onApprove(entry.id);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    setActionLoading("reject");
    try {
      await onReject(entry.id, rejectReason || undefined);
      setShowRejectReason(false);
      setRejectReason("");
    } finally {
      setActionLoading(null);
    }
  };

  // Calculate time since request
  const requestedAt = new Date(entry.requestedAt);
  const timeSince = Math.floor(
    (Date.now() - requestedAt.getTime()) / (1000 * 60)
  );
  const timeDisplay =
    timeSince < 60
      ? `${timeSince}m ago`
      : timeSince < 1440
        ? `${Math.floor(timeSince / 60)}h ago`
        : `${Math.floor(timeSince / 1440)}d ago`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${eventInfo.color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="font-medium text-gray-900">{eventInfo.label}</div>
            <div className="text-sm text-gray-500">
              Requested by: {entry.memberDuid.slice(0, 8)}...
            </div>
          </div>
        </div>

        <div className="flex items-center text-sm text-gray-500">
          <Clock className="h-4 w-4 mr-1" />
          {timeDisplay}
        </div>
      </div>

      {/* Event Details */}
      {entry.eventId && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-xs text-gray-500 mb-1">Event ID</div>
          <div className="font-mono text-sm text-gray-700 truncate">
            {entry.eventId}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!showRejectReason ? (
        <div className="flex space-x-2">
          <button
            onClick={handleApprove}
            disabled={processing || actionLoading !== null}
            className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
          >
            {actionLoading === "approve" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            <span>Approve</span>
          </button>
          <button
            onClick={() => setShowRejectReason(true)}
            disabled={processing || actionLoading !== null}
            className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            <X className="h-4 w-4" />
            <span>Reject</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (optional)..."
            rows={2}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-500"
          />
          <div className="flex space-x-2">
            <button
              onClick={() => setShowRejectReason(false)}
              className="flex-1 px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={actionLoading !== null}
              className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              {actionLoading === "reject" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              <span>Confirm Reject</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const SigningApprovalQueue: React.FC<SigningApprovalQueueProps> = ({
  federationId,
  userRole,
  userDuid,
  onApprovalChange,
}) => {
  const {
    pendingApprovals,
    loading,
    error,
    refresh,
    approveRequest,
    rejectRequest,
    count,
  } = useApprovalQueue(federationId, userRole);
  const [processing, setProcessing] = useState(false);

  const canApprove = userRole === "guardian" || userRole === "steward";

  const handleApprove = async (auditId: string) => {
    if (!canApprove) return;
    setProcessing(true);
    try {
      const result = await approveRequest(auditId, userDuid);
      if (result.success) {
        onApprovalChange?.();
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (auditId: string, reason?: string) => {
    if (!canApprove) return;
    setProcessing(true);
    try {
      const result = await rejectRequest(auditId, userDuid, reason);
      if (result.success) {
        onApprovalChange?.();
      }
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        <span className="ml-2 text-gray-600">Loading approval queue...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Shield className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Approval Queue
          </h2>
          {count > 0 && (
            <span className="px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full">
              {count}
            </span>
          )}
        </div>

        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center space-x-1 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          <span className="text-sm">Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center text-red-700">
            <AlertTriangle className="h-5 w-5 mr-2" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {!canApprove && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center text-yellow-700 text-sm">
            <Clock className="h-4 w-4 mr-2" />
            <span>Only Guardians and Stewards can approve signing requests.</span>
          </div>
        </div>
      )}

      {/* Queue Items */}
      {pendingApprovals.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Shield className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-600">No pending approvals</p>
          <p className="text-sm text-gray-400">
            Requests requiring approval will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingApprovals.map((entry) => (
            <ApprovalCard
              key={entry.id}
              entry={entry}
              onApprove={handleApprove}
              onReject={handleReject}
              processing={processing}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SigningApprovalQueue;

