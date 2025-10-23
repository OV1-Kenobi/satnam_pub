/**
 * TrustProviderSelector Component
 * Phase 2 Day 4: UI Components & Integration
 *
 * Component for selecting and managing trusted providers
 * Allows users to add/remove providers and view their trust levels
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import React, { useEffect, useState } from "react";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { ProviderManagementService } from "../../lib/trust/provider-management";
import { supabase } from "../../lib/supabase";
import type { TrustedProvider, TrustLevel } from "../../lib/trust/types";

interface TrustProviderSelectorProps {
  userId: string;
  onProviderSelected?: (provider: TrustedProvider) => void;
  onProvidersChanged?: (providers: TrustedProvider[]) => void;
  readOnly?: boolean;
}

export const TrustProviderSelector: React.FC<TrustProviderSelectorProps> = ({
  userId,
  onProviderSelected,
  onProvidersChanged,
  readOnly = false,
}) => {
  const [providers, setProviders] = useState<TrustedProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProviderPubkey, setNewProviderPubkey] = useState("");
  const [newProviderName, setNewProviderName] = useState("");
  const [newProviderRelay, setNewProviderRelay] = useState("");
  const [newTrustLevel, setNewTrustLevel] = useState<TrustLevel>(3);
  const [addingProvider, setAddingProvider] = useState(false);

  const service = new ProviderManagementService(supabase);

  // Load trusted providers on mount
  useEffect(() => {
    loadProviders();
  }, [userId]);

  const loadProviders = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await service.getTrustedProviders(userId);
      setProviders(result);
      onProvidersChanged?.(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load providers";
      setError(message);
      console.error("Error loading providers:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProvider = async () => {
    if (!newProviderPubkey.trim()) {
      setError("Provider pubkey is required");
      return;
    }

    try {
      setAddingProvider(true);
      setError(null);
      const provider = await service.addTrustedProvider(
        userId,
        newProviderPubkey,
        newProviderName || undefined,
        newProviderRelay || undefined,
        newTrustLevel
      );
      setProviders([...providers, provider]);
      onProvidersChanged?.([...providers, provider]);
      setNewProviderPubkey("");
      setNewProviderName("");
      setNewProviderRelay("");
      setNewTrustLevel(3);
      setShowAddForm(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add provider";
      setError(message);
      console.error("Error adding provider:", err);
    } finally {
      setAddingProvider(false);
    }
  };

  const handleRemoveProvider = async (provider: TrustedProvider) => {
    try {
      setError(null);
      await service.removeTrustedProvider(userId, provider.providerPubkey);
      const updated = providers.filter((p) => p.id !== provider.id);
      setProviders(updated);
      onProvidersChanged?.(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove provider";
      setError(message);
      console.error("Error removing provider:", err);
    }
  };

  const getTrustLevelColor = (level: TrustLevel): string => {
    switch (level) {
      case 1:
        return "bg-red-100 text-red-800";
      case 2:
        return "bg-orange-100 text-orange-800";
      case 3:
        return "bg-yellow-100 text-yellow-800";
      case 4:
        return "bg-blue-100 text-blue-800";
      case 5:
        return "bg-green-100 text-green-800";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-gray-500">Loading providers...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      <div className="space-y-3">
        {providers.length === 0 ? (
          <div className="text-center p-4 text-gray-500">
            No trusted providers yet
          </div>
        ) : (
          providers.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div className="flex-1">
                <div className="font-medium text-sm">
                  {provider.providerName || "Unknown Provider"}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {provider.providerPubkey}
                </div>
                {provider.providerRelay && (
                  <div className="text-xs text-gray-400">{provider.providerRelay}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${getTrustLevelColor(provider.trustLevel)}`}>
                  Level {provider.trustLevel}
                </span>
                {!readOnly && (
                  <button
                    onClick={() => handleRemoveProvider(provider)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                    title="Remove provider"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {!readOnly && (
        <div className="pt-2">
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200"
            >
              <Plus className="w-4 h-4" />
              Add Provider
            </button>
          ) : (
            <div className="space-y-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
              <input
                type="text"
                placeholder="Provider pubkey (required)"
                value={newProviderPubkey}
                onChange={(e) => setNewProviderPubkey(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Provider name (optional)"
                value={newProviderName}
                onChange={(e) => setNewProviderName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Provider relay (optional)"
                value={newProviderRelay}
                onChange={(e) => setNewProviderRelay(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={newTrustLevel}
                onChange={(e) => setNewTrustLevel(parseInt(e.target.value) as TrustLevel)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={1}>Level 1 - Very Low</option>
                <option value={2}>Level 2 - Low</option>
                <option value={3}>Level 3 - Medium</option>
                <option value={4}>Level 4 - High</option>
                <option value={5}>Level 5 - Very High</option>
              </select>
              <div className="flex gap-2">
                <button
                  onClick={handleAddProvider}
                  disabled={addingProvider}
                  className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg"
                >
                  {addingProvider ? "Adding..." : "Add"}
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TrustProviderSelector;

