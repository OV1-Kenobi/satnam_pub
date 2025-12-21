/**
 * Delete Account Section
 * Component for user settings to initiate account deletion
 * with NIP-07 signing and cooling-off period
 * @module DeleteAccountSection
 */

import {
  AlertTriangle,
  Clock,
  Key,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import {
  AccountSummary,
  COOLING_OFF_DAYS,
  DeletionRequest,
  getAccountSummary,
  getPendingDeletionRequest,
  isNIP07Available,
  signDeletionRequest,
  submitDeletionRequest,
} from "../../lib/user-deletion-service";
import { showToast } from "../../services/toastService";
import { useAuth } from "../auth/AuthProvider";
import { DeletionPendingModal } from "./DeletionPendingModal";

interface DeleteAccountSectionProps {
  className?: string;
}

export const DeleteAccountSection: React.FC<DeleteAccountSectionProps> = ({
  className = "",
}) => {
  const { sessionToken, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [reason, setReason] = useState("personal_choice");
  const [pendingRequest, setPendingRequest] = useState<DeletionRequest | null>(null);
  const [accountSummary, setAccountSummary] = useState<AccountSummary | null>(null);
  const [nip07Available, setNip07Available] = useState(false);

  // Check NIP-07 availability and fetch pending request
  useEffect(() => {
    setNip07Available(isNIP07Available());

    if (sessionToken) {
      fetchPendingRequest();
      fetchAccountSummary();
    }
  }, [sessionToken]);

  const fetchPendingRequest = useCallback(async () => {
    if (!sessionToken) return;
    const result = await getPendingDeletionRequest(sessionToken);
    if (result.success && result.data) {
      setPendingRequest(result.data);
    }
  }, [sessionToken]);

  const fetchAccountSummary = useCallback(async () => {
    if (!sessionToken) return;
    const result = await getAccountSummary(sessionToken);
    if (result.success && result.data) {
      setAccountSummary(result.data);
    }
  }, [sessionToken]);

  const handleRequestDeletion = async () => {
    if (!sessionToken || !user?.id) {
      showToast.error("Please sign in to delete your account");
      return;
    }

    if (confirmInput !== "DELETE") {
      showToast.error('Please type "DELETE" to confirm');
      return;
    }

    setLoading(true);
    try {
      // Sign deletion request with NIP-07
      // Note: nip05 is encrypted and not available client-side in zero-knowledge mode
      const signResult = await signDeletionRequest(
        user.id,
        null, // nip05 is encrypted, server will lookup if needed
        reason
      );

      if (!signResult.success || !signResult.data) {
        showToast.error(signResult.error || "Failed to sign deletion request");
        return;
      }

      // Submit signed request
      const submitResult = await submitDeletionRequest(
        signResult.data,
        sessionToken,
        reason
      );

      if (!submitResult.success) {
        showToast.error(submitResult.error || "Failed to submit deletion request");
        return;
      }

      showToast.success(
        `Account deletion requested. You have ${COOLING_OFF_DAYS} days to cancel.`
      );
      setPendingRequest(submitResult.data || null);
      setShowConfirmModal(false);
      setConfirmInput("");
    } catch (err) {
      showToast.error(
        err instanceof Error ? err.message : "Failed to request deletion"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancellation = () => {
    setPendingRequest(null);
    fetchPendingRequest();
  };

  // Render pending deletion state
  if (pendingRequest && pendingRequest.status === "pending") {
    return (
      <div className={`bg-red-900/30 border border-red-500/50 rounded-xl p-6 ${className}`}>
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-red-300">
              Account Deletion Pending
            </h3>
            <p className="text-red-200/80 text-sm mt-1">
              Your account is scheduled for deletion. You can cancel anytime during
              the cooling-off period.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowPendingModal(true)}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          View Deletion Status
        </button>
        {showPendingModal && (
          <DeletionPendingModal
            request={pendingRequest}
            onClose={() => setShowPendingModal(false)}
            onCancelled={handleCancellation}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <div className={`bg-red-900/20 border border-red-500/30 rounded-xl p-6 ${className}`}>
        <div className="flex items-start gap-3 mb-4">
          <Trash2 className="w-6 h-6 text-red-400 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-red-300">Delete Account</h3>
            <p className="text-gray-300 text-sm mt-1">
              Permanently delete your account and all associated data. This action
              requires NIP-07 signature verification.
            </p>
          </div>
        </div>

        {/* Account Summary Preview */}
        {accountSummary && (
          <div className="bg-gray-900/50 rounded-lg p-4 mb-4 space-y-2">
            <h4 className="text-sm font-medium text-gray-400 mb-3">Account Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {accountSummary.nip05_identifier && (
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-purple-400" />
                  <span className="text-gray-300">{accountSummary.nip05_identifier}</span>
                </div>
              )}
              {accountSummary.federation_membership && (
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span className="text-gray-300">{accountSummary.federation_membership}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-yellow-400" />
                <span className="text-gray-300">
                  {accountSummary.wallet_balance_sats.toLocaleString()} sats
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-green-400" />
                <span className="text-gray-300">
                  {accountSummary.contacts_count} contacts
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Warning */}
        <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200/80">
              <p className="font-medium mb-1">This action has a {COOLING_OFF_DAYS}-day cooling-off period</p>
              <ul className="list-disc list-inside space-y-1 text-yellow-200/60">
                <li>You can cancel anytime during the cooling-off period</li>
                <li>After {COOLING_OFF_DAYS} days, an admin will review and process your request</li>
                <li>All data including NIP-05 identifier will be permanently deleted</li>
                <li>Lightning wallet balance should be withdrawn first</li>
              </ul>
            </div>
          </div>
        </div>

        {/* NIP-07 Requirement */}
        {!nip07Available && (
          <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-3 mb-4">
            <p className="text-sm text-blue-200">
              <Key className="w-4 h-4 inline mr-1" />
              A NIP-07 browser extension (Alby, nos2x, etc.) is required to verify your
              identity before deletion.
            </p>
          </div>
        )}

        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={!nip07Available}
          className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          {nip07Available ? "Request Account Deletion" : "NIP-07 Extension Required"}
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-md border border-red-500/50">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-600/20 rounded-full flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Confirm Deletion</h2>
                </div>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-4">
                  <p className="text-red-200 text-sm">
                    You are about to request permanent deletion of your account. This will
                    remove all your data including your NIP-05 identifier, contacts, messages,
                    and wallet information.
                  </p>
                </div>

                {/* Reason Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Reason for leaving (optional)
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="personal_choice">Personal choice</option>
                    <option value="privacy_concerns">Privacy concerns</option>
                    <option value="not_using_anymore">Not using the service anymore</option>
                    <option value="switching_platforms">Switching to another platform</option>
                    <option value="technical_issues">Technical issues</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Confirmation Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Type <span className="text-red-400 font-bold">DELETE</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value.toUpperCase())}
                    placeholder="DELETE"
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                {/* Cooling-off Period Info */}
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Clock className="w-4 h-4" />
                  <span>{COOLING_OFF_DAYS}-day cooling-off period applies</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-6 pt-0">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestDeletion}
                disabled={confirmInput !== "DELETE" || loading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {loading ? "Signing..." : "Request Deletion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DeleteAccountSection;

