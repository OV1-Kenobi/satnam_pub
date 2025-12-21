/**
 * Rollback Confirmation Modal Component
 * Confirmation dialog for account rollback operations
 * @module RollbackConfirmationModal
 */

import { AlertCircle, CheckCircle, Clock, Loader2, RotateCcw, X } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import type { RemovalLogEntry } from "./AdminAccountControlDashboard";

interface RollbackConfirmationModalProps {
  removal: RemovalLogEntry;
  sessionToken: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface RollbackEligibility {
  eligible: boolean;
  reason?: string;
  backup_valid: boolean;
  expires_at: string | null;
  time_remaining?: string;
}

export const RollbackConfirmationModal: React.FC<RollbackConfirmationModalProps> = ({
  removal,
  sessionToken,
  onClose,
  onSuccess,
}) => {
  const [eligibility, setEligibility] = useState<RollbackEligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const checkEligibility = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/account-control", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "check_rollback_eligibility",
          removal_id: removal.id,
        }),
      });
      if (!response.ok) throw new Error("Failed to check eligibility");
      const data = await response.json();
      setEligibility(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check eligibility");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, removal.id]);

  useEffect(() => { checkEligibility(); }, [checkEligibility]);

  const handleRollback = async () => {
    if (!sessionToken || !eligibility?.eligible) return;
    setExecuting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/account-control", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "rollback_removal",
          removal_id: removal.id,
          reason: reason.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Rollback failed");
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <RotateCcw className="h-5 w-5 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Rollback Removal</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 text-purple-600 animate-spin mx-auto mb-2" />
              <p className="text-gray-500">Checking rollback eligibility...</p>
            </div>
          ) : eligibility ? (
            <>
              {/* Eligibility Status */}
              <div className={`rounded-lg p-4 ${eligibility.eligible ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                <div className="flex items-center space-x-3">
                  {eligibility.eligible ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <div>
                    <p className={`font-medium ${eligibility.eligible ? "text-green-800" : "text-red-800"}`}>
                      {eligibility.eligible ? "Rollback Available" : "Rollback Not Available"}
                    </p>
                    {eligibility.reason && <p className="text-sm text-gray-600">{eligibility.reason}</p>}
                  </div>
                </div>
              </div>

              {/* Backup Status */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Backup Status</span>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                    eligibility.backup_valid ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}>{eligibility.backup_valid ? "Valid" : "Invalid"}</span>
                </div>
                {eligibility.time_remaining && (
                  <p className="text-sm text-gray-500 mt-2">Expires in: {eligibility.time_remaining}</p>
                )}
              </div>

              {/* Removal Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Original Removal</p>
                <p className="font-medium text-gray-900">{removal.removal_reason}</p>
                <p className="text-sm text-gray-500">{new Date(removal.requested_at).toLocaleString()}</p>
              </div>

              {/* Reason Input */}
              {eligibility.eligible && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Rollback Reason</label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                    placeholder="Optional reason for rollback..."
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500" />
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">{error}</div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} disabled={executing}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          {eligibility?.eligible && (
            <button onClick={handleRollback} disabled={executing}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2">
              {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              <span>Execute Rollback</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RollbackConfirmationModal;
