/**
 * Account Removal Modal Component
 * Confirmation dialog for account removal with reason selection
 * @module AccountRemovalModal
 */

import { AlertTriangle, Loader2, Shield, X } from "lucide-react";
import React, { useState } from "react";
import type { AccountSearchResult } from "./AccountSearchPanel";

const REMOVAL_REASONS = [
  { value: "user_request", label: "User Request" },
  { value: "policy_violation", label: "Policy Violation" },
  { value: "spam_abuse", label: "Spam/Abuse" },
  { value: "inactive_account", label: "Inactive Account" },
  { value: "duplicate_account", label: "Duplicate Account" },
  { value: "federation_removal", label: "Federation Removal" },
  { value: "other", label: "Other" },
];

interface AccountRemovalModalProps {
  account: AccountSearchResult;
  sessionToken: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const AccountRemovalModal: React.FC<AccountRemovalModalProps> = ({
  account,
  sessionToken,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [createBackup, setCreateBackup] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = reason && confirmText === "REMOVE" && !loading;

  const handleRemove = async () => {
    if (!canSubmit || !sessionToken) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/account-control", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "remove_account",
          target_user_duid: account.user_duid,
          target_nip05_duid: account.nip05_duid,
          reason,
          notes: notes.trim() || undefined,
          create_backup: createBackup,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Removal failed");
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Removal failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Remove Account</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Account Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="font-medium text-gray-900">{account.identifier}@{account.domain}</p>
            <p className="text-sm text-gray-500 font-mono truncate">{account.npub}</p>
          </div>

          {/* Reason Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Removal Reason *</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500">
              <option value="">Select a reason...</option>
              {REMOVAL_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="Optional notes about this removal..."
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500" />
          </div>

          {/* Backup Option */}
          <label className="flex items-center space-x-3 cursor-pointer">
            <input type="checkbox" checked={createBackup} onChange={(e) => setCreateBackup(e.target.checked)}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500" />
            <div>
              <p className="font-medium text-gray-900">Create backup for rollback</p>
              <p className="text-sm text-gray-500">Allows restoration within 30 days</p>
            </div>
          </label>

          {/* Confirmation */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800 mb-2">Type <strong>REMOVE</strong> to confirm this action:</p>
            <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type REMOVE"
              className="w-full px-4 py-2 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500" />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} disabled={loading}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleRemove} disabled={!canSubmit}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            <span>Remove Account</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountRemovalModal;
