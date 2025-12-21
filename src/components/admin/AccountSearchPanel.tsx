/**
 * Account Search Panel Component
 * Search and display accounts with filtering capabilities
 * @module AccountSearchPanel
 */

import { AlertCircle, Loader2, Search, User, X } from "lucide-react";
import React, { useCallback, useState } from "react";
import type { AdminContext } from "./AdminAuthGuard";

export interface AccountSearchResult {
  user_duid: string;
  nip05_duid: string;
  identifier: string;
  domain: string;
  npub: string;
  account_type: string;
  federation_id: string | null;
  created_at: string;
  last_verified_at: string | null;
  is_active: boolean;
}

interface AccountSearchPanelProps {
  sessionToken: string | null;
  adminContext: AdminContext | null;
  onSelectAccount?: (account: AccountSearchResult) => void;
}

export const AccountSearchPanel: React.FC<AccountSearchPanelProps> = ({
  sessionToken,
  adminContext,
  onSelectAccount,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AccountSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !sessionToken) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const response = await fetch("/api/admin/account-control", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "search_accounts",
          query: searchQuery.trim(),
          federation_id: adminContext?.adminType === "federation" ? adminContext.federationId : undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Search failed");
      }
      const data = await response.json();
      setSearchResults(data.data?.accounts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, sessionToken, adminContext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setHasSearched(false);
    setError(null);
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="flex space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by NIP-05 identifier, npub, or user ID..."
            className="w-full pl-10 pr-10 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          {searchQuery && (
            <button onClick={clearSearch} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <button onClick={handleSearch} disabled={loading || !searchQuery.trim()}
          className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
          <span>Search</span>
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="text-center py-8">
          <Loader2 className="h-8 w-8 text-purple-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-500">Searching accounts...</p>
        </div>
      ) : hasSearched && searchResults.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <User className="h-12 w-12 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600">No accounts found matching "{searchQuery}"</p>
        </div>
      ) : searchResults.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">{searchResults.length} account(s) found</p>
          {searchResults.map((account) => (
            <div key={account.nip05_duid}
              onClick={() => onSelectAccount?.(account)}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-purple-300 hover:shadow-sm cursor-pointer transition-all">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{account.identifier}@{account.domain}</p>
                  <p className="text-sm text-gray-500 truncate font-mono">{account.npub}</p>
                  <div className="flex items-center space-x-2 mt-2">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                      account.account_type === "private" ? "bg-gray-100 text-gray-800" : "bg-blue-100 text-blue-800"
                    }`}>{account.account_type}</span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                      account.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}>{account.is_active ? "Active" : "Inactive"}</span>
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500">
                  <p>Created: {new Date(account.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default AccountSearchPanel;
