/**
 * Deletion Pending Modal
 * Shows cooling-off period countdown and allows cancellation
 * @module DeletionPendingModal
 */

import { AlertTriangle, Clock, RefreshCw, X } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import {
  cancelDeletionRequest,
  COOLING_OFF_DAYS,
  DeletionRequest,
  formatCoolingOffTime,
  getCoolingOffTimeRemaining,
} from "../../lib/user-deletion-service";
import { showToast } from "../../services/toastService";
import { useAuth } from "../auth/AuthProvider";

interface DeletionPendingModalProps {
  request: DeletionRequest;
  onClose: () => void;
  onCancelled: () => void;
}

export const DeletionPendingModal: React.FC<DeletionPendingModalProps> = ({
  request,
  onClose,
  onCancelled,
}) => {
  const { sessionToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(
    formatCoolingOffTime(request.cooling_off_ends_at)
  );
  const [coolingOffExpired, setCoolingOffExpired] = useState(false);

  // Update countdown timer
  useEffect(() => {
    const updateTimer = () => {
      const remaining = getCoolingOffTimeRemaining(request.cooling_off_ends_at);
      setTimeRemaining(formatCoolingOffTime(request.cooling_off_ends_at));
      setCoolingOffExpired(remaining.expired);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [request.cooling_off_ends_at]);

  const handleCancel = useCallback(async () => {
    if (!sessionToken) {
      showToast.error("Session expired. Please sign in again.");
      return;
    }

    setLoading(true);
    try {
      const result = await cancelDeletionRequest(request.id, sessionToken);

      if (!result.success) {
        showToast.error(result.error || "Failed to cancel deletion request");
        return;
      }

      showToast.success("Account deletion cancelled successfully");
      onCancelled();
      onClose();
    } catch (err) {
      showToast.error(
        err instanceof Error ? err.message : "Failed to cancel deletion"
      );
    } finally {
      setLoading(false);
    }
  }, [sessionToken, request.id, onCancelled, onClose]);

  // Parse reason for display
  const getReasonDisplay = (reason: string): string => {
    const reasonMap: Record<string, string> = {
      personal_choice: "Personal choice",
      privacy_concerns: "Privacy concerns",
      not_using_anymore: "Not using the service anymore",
      switching_platforms: "Switching to another platform",
      technical_issues: "Technical issues",
      other: "Other",
    };
    return reasonMap[reason] || reason;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg border border-red-500/50">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Deletion Pending</h2>
                <p className="text-sm text-gray-400">
                  Requested {new Date(request.requested_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Countdown Timer */}
          <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-yellow-400" />
              <span className="text-lg font-semibold text-white">
                Cooling-Off Period
              </span>
            </div>
            <p className="text-2xl font-bold text-yellow-400 mb-1">
              {timeRemaining}
            </p>
            <p className="text-sm text-gray-400">
              {coolingOffExpired
                ? "Your request is now awaiting admin review"
                : `You can cancel anytime during the ${COOLING_OFF_DAYS}-day cooling-off period`}
            </p>
          </div>

          {/* Request Details */}
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Status</span>
              <span className={`font-medium ${request.status === "pending" ? "text-yellow-400" :
                  request.status === "ready" ? "text-orange-400" :
                    request.status === "approved" ? "text-red-400" :
                      "text-gray-400"
                }`}>
                {request.status === "pending" ? "In Cooling-Off Period" :
                  request.status === "ready" ? "Awaiting Admin Review" :
                    request.status === "approved" ? "Approved - Pending Execution" :
                      request.status.charAt(0).toUpperCase() + request.status.slice(1)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Reason</span>
              <span className="text-gray-300">{getReasonDisplay(request.reason)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Cooling-off ends</span>
              <span className="text-gray-300">
                {new Date(request.cooling_off_ends_at).toLocaleString()}
              </span>
            </div>
          </div>

          {/* What will be deleted */}
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-6">
            <h4 className="text-sm font-medium text-red-300 mb-2">
              What will be deleted:
            </h4>
            <ul className="text-sm text-red-200/70 space-y-1 list-disc list-inside">
              <li>Your NIP-05 identifier and profile data</li>
              <li>All contacts and messaging history</li>
              <li>Family federation memberships</li>
              <li>Wallet information and transaction history</li>
              <li>All attestations and verifications</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Close
            </button>
            {!coolingOffExpired && request.status === "pending" && (
              <button
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  "Cancel Deletion"
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeletionPendingModal;

