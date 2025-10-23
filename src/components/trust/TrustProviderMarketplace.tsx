/**
 * TrustProviderMarketplace Component
 * Phase 3 Day 1: Trust Provider Discovery & Marketplace UI
 *
 * Component for browsing and discovering trust providers
 * Allows users to search, filter, and subscribe to providers
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import { AlertCircle, Grid3x3, List, Loader, Search } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import type { Provider } from "../../lib/trust/types";
import { TrustProviderCard } from "./TrustProviderCard";

interface TrustProviderMarketplaceProps {
  onSubscribe?: (providerId: string) => void;
  onUnsubscribe?: (providerId: string) => void;
  showSubscribed?: boolean;
  maxResults?: number;
  subscribedProviderIds?: string[];
}

export const TrustProviderMarketplace: React.FC<TrustProviderMarketplaceProps> = ({
  onSubscribe,
  onUnsubscribe,
  showSubscribed = false,
  maxResults = 50,
  subscribedProviderIds = [],
}) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [filteredProviders, setFilteredProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [minRating, setMinRating] = useState(0);

  // Load providers on mount
  useEffect(() => {
    loadProviders();
  }, []);

  // Filter providers when search/filters change
  useEffect(() => {
    applyFilters();
  }, [providers, searchQuery, selectedCategory, minRating, showSubscribed]);

  const loadProviders = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get JWT token from SecureTokenManager
      const { SecureTokenManager } = await import("../../lib/auth/secure-token-manager");
      const token = SecureTokenManager.getAccessToken();

      if (!token) {
        setError("Authentication required. Please log in.");
        setProviders([]);
        return;
      }

      // Call trust-provider-marketplace API endpoint
      const response = await fetch("/api/trust-provider-marketplace/list", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to load providers (${response.status})`
        );
      }

      const data = await response.json();

      // Transform API response to Provider interface
      const providers: Provider[] = (data.providers || []).map((p: any) => ({
        id: p.id,
        pubkey: p.pubkey,
        name: p.name,
        description: p.description,
        category: p.category || "general",
        rating: p.rating || 0,
        userCount: p.subscription_count || 0,
        createdAt: new Date(p.created_at).getTime(),
        updatedAt: new Date(p.updated_at).getTime(),
        isVerified: p.is_verified || false,
        metadata: p.metrics,
      }));

      setProviders(providers);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load providers";
      setError(message);
      console.error("Error loading providers:", err);
      setProviders([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = useCallback(() => {
    let filtered = providers;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query)
      );
    }

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }

    // Filter by minimum rating
    if (minRating > 0) {
      filtered = filtered.filter((p) => p.rating >= minRating);
    }

    // Filter by subscription status
    if (showSubscribed) {
      filtered = filtered.filter((p) => subscribedProviderIds.includes(p.id));
    }

    // Limit results
    filtered = filtered.slice(0, maxResults);

    setFilteredProviders(filtered);
  }, [providers, searchQuery, selectedCategory, minRating, showSubscribed, subscribedProviderIds, maxResults]);

  const handleSubscribe = async (providerId: string) => {
    try {
      const { SecureTokenManager } = await import("../../lib/auth/secure-token-manager");
      const token = SecureTokenManager.getAccessToken();

      if (!token) {
        setError("Authentication required. Please log in.");
        return;
      }

      const response = await fetch("/api/trust-provider-marketplace/subscribe", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ providerId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to subscribe to provider");
      }

      // Call parent callback if provided
      onSubscribe?.(providerId);

      // Reload providers to update subscription status
      await loadProviders();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to subscribe";
      setError(message);
      console.error("Error subscribing to provider:", err);
    }
  };

  const handleUnsubscribe = async (providerId: string) => {
    try {
      const { SecureTokenManager } = await import("../../lib/auth/secure-token-manager");
      const token = SecureTokenManager.getAccessToken();

      if (!token) {
        setError("Authentication required. Please log in.");
        return;
      }

      const response = await fetch("/api/trust-provider-marketplace/unsubscribe", {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ providerId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to unsubscribe from provider");
      }

      // Call parent callback if provided
      onUnsubscribe?.(providerId);

      // Reload providers to update subscription status
      await loadProviders();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to unsubscribe";
      setError(message);
      console.error("Error unsubscribing from provider:", err);
    }
  };

  const categories = Array.from(
    new Set(providers.map((p) => p.category))
  ).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Trust Providers</h2>
          <p className="text-sm text-gray-600 mt-1">
            Discover and subscribe to trust providers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-lg transition-colors ${viewMode === "grid"
              ? "bg-blue-100 text-blue-700"
              : "text-gray-600 hover:bg-gray-100"
              }`}
            title="Grid view"
          >
            <Grid3x3 className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded-lg transition-colors ${viewMode === "list"
              ? "bg-blue-100 text-blue-700"
              : "text-gray-600 hover:bg-gray-100"
              }`}
            title="List view"
          >
            <List className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search providers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() =>
                setSelectedCategory(
                  selectedCategory === category ? null : category
                )
              }
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${selectedCategory === category
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700">Minimum Rating:</label>
          <select
            value={minRating}
            onChange={(e) => setMinRating(Number(e.target.value))}
            className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={0}>All ratings</option>
            <option value={3}>3+ stars</option>
            <option value={4}>4+ stars</option>
            <option value={4.5}>4.5+ stars</option>
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-900">Error</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      )}

      {/* Providers Grid/List */}
      {!loading && filteredProviders.length > 0 && (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              : "space-y-3"
          }
        >
          {filteredProviders.map((provider) => (
            <TrustProviderCard
              key={provider.id}
              provider={provider}
              isSubscribed={subscribedProviderIds.includes(provider.id)}
              onSubscribe={handleSubscribe}
              onUnsubscribe={handleUnsubscribe}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredProviders.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-600">No providers found matching your criteria</p>
        </div>
      )}
    </div>
  );
};

export default TrustProviderMarketplace;

