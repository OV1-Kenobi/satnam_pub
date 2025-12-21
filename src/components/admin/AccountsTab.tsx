/**
 * Accounts Tab Component
 * Account search and management interface
 * @module AccountsTab
 */

import React, { useState } from "react";
import type { AdminContext } from "./AdminAuthGuard";
import { AccountSearchPanel, type AccountSearchResult } from "./AccountSearchPanel";
import { AccountRemovalModal } from "./AccountRemovalModal";

interface AccountsTabProps {
  sessionToken: string | null;
  adminContext: AdminContext | null;
  onRefresh?: () => void;
}

export const AccountsTab: React.FC<AccountsTabProps> = ({
  sessionToken,
  adminContext,
  onRefresh,
}) => {
  const [selectedAccount, setSelectedAccount] = useState<AccountSearchResult | null>(null);
  const [showRemovalModal, setShowRemovalModal] = useState(false);

  const handleSelectAccount = (account: AccountSearchResult) => {
    setSelectedAccount(account);
  };

  const handleRemoveClick = () => {
    if (selectedAccount) setShowRemovalModal(true);
  };

  const handleRemovalSuccess = () => {
    setShowRemovalModal(false);
    setSelectedAccount(null);
    onRefresh?.();
  };

  return (
    <div className="space-y-6">
      {/* Search Panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Search Accounts</h3>
        <AccountSearchPanel
          sessionToken={sessionToken}
          adminContext={adminContext}
          onSelectAccount={handleSelectAccount}
        />
      </div>

      {/* Selected Account Details */}
      {selectedAccount && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Account Details</h3>
            <button onClick={() => setSelectedAccount(null)}
              className="text-gray-400 hover:text-gray-600 text-sm">
              Clear Selection
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">NIP-05 Identifier</p>
              <p className="font-medium text-gray-900">{selectedAccount.identifier}@{selectedAccount.domain}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Account Type</p>
              <p className="font-medium text-gray-900 capitalize">{selectedAccount.account_type}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Public Key (npub)</p>
              <p className="font-mono text-sm text-gray-900 truncate">{selectedAccount.npub}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <span className={`px-2 py-1 text-xs font-medium rounded ${
                selectedAccount.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              }`}>{selectedAccount.is_active ? "Active" : "Inactive"}</span>
            </div>
            <div>
              <p className="text-sm text-gray-500">Created</p>
              <p className="font-medium text-gray-900">{new Date(selectedAccount.created_at).toLocaleString()}</p>
            </div>
            {selectedAccount.federation_id && (
              <div>
                <p className="text-sm text-gray-500">Federation ID</p>
                <p className="font-mono text-sm text-gray-900 truncate">{selectedAccount.federation_id}</p>
              </div>
            )}
          </div>
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button onClick={handleRemoveClick}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
              Remove Account
            </button>
          </div>
        </div>
      )}

      {/* Removal Modal */}
      {showRemovalModal && selectedAccount && (
        <AccountRemovalModal
          account={selectedAccount}
          sessionToken={sessionToken}
          onClose={() => setShowRemovalModal(false)}
          onSuccess={handleRemovalSuccess}
        />
      )}
    </div>
  );
};

export default AccountsTab;
