/**
 * TrustSubscriptionManager Component
 * Phase 3 Day 4: Trust Provider Settings Integration
 *
 * Component for managing active trust provider subscriptions
 * Displays subscription status, usage metrics, and management actions
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import React, { useEffect, useState } from "react";
import { Pause, Play, Trash2, AlertCircle, Loader } from "lucide-react";
import { supabase } from "../../lib/supabase";

export interface ProviderSubscription {
  id: string;
  userId: string;
  providerId: string;
  providerName: string;
  status: "active" | "paused" | "expired";
  subscribedAt: Date;
  expiresAt?: Date;
  usageCount: number;
  lastUsedAt?: Date;
  metricsCount: number;
}

interface TrustSubscriptionManagerProps {
  userId: string;
  onSubscriptionChanged?: (subscriptions: ProviderSubscription[]) => void;
  readOnly?: boolean;
}

export const TrustSubscriptionManager: React.FC<TrustSubscriptionManagerProps> = ({
  userId,
  onSubscriptionChanged,
  readOnly = false,
}) => {
  const [subscriptions, setSubscriptions] = useState<ProviderSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Load subscriptions on mount
  useEffect(() => {
    loadSubscriptions();
  }, [userId]);

  const loadSubscriptions = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from("trust_provider_subscriptions")
        .select("*")
        .eq("user_id", userId)
        .order("subscribed_at", { ascending: false });

      if (err) throw err;

      const formatted = (data || []).map((sub: any) => ({
        id: sub.id,
        userId: sub.user_id,
        providerId: sub.provider_id,
        providerName: sub.provider_name || "Unknown Provider",
        status: sub.status || "active",
        subscribedAt: new Date(sub.subscribed_at),
        expiresAt: sub.expires_at ? new Date(sub.expires_at) : undefined,
        usageCount: sub.usage_count || 0,
        lastUsedAt: sub.last_used_at ? new Date(sub.last_used_at) : undefined,
        metricsCount: sub.metrics_count || 0,
      }));

      setSubscriptions(formatted);
      onSubscriptionChanged?.(formatted);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load subscriptions";
      setError(message);
      console.error("Error loading subscriptions:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePauseResume = async (subscriptionId: string, currentStatus: string) => {
    try {
      setActionInProgress(subscriptionId);
      const newStatus = currentStatus === "active" ? "paused" : "active";

      const { error: err } = await supabase
        .from("trust_provider_subscriptions")
        .update({ status: newStatus })
        .eq("id", subscriptionId)
        .eq("user_id", userId);

      if (err) throw err;

      setSubscriptions((prev) =>
        prev.map((sub) =>
          sub.id === subscriptionId ? { ...sub, status: newStatus as any } : sub
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update subscription";
      setError(message);
      console.error("Error updating subscription:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCancel = async (subscriptionId: string) => {
    if (!confirm("Are you sure you want to cancel this subscription?")) return;

    try {
      setActionInProgress(subscriptionId);

      const { error: err } = await supabase
        .from("trust_provider_subscriptions")
        .delete()
        .eq("id", subscriptionId)
        .eq("user_id", userId);

      if (err) throw err;

      setSubscriptions((prev) => prev.filter((sub) => sub.id !== subscriptionId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to cancel subscription";
      setError(message);
      console.error("Error canceling subscription:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {subscriptions.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No active subscriptions</p>
          <p className="text-sm text-gray-400 mt-1">
            Subscribe to trust providers in the Marketplace tab
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((sub) => (
            <div
              key={sub.id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{sub.providerName}</h4>
                  <p className="text-xs text-gray-500 mt-1">
                    ID: {sub.providerId.slice(0, 8)}...
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      sub.status === "active"
                        ? "bg-green-100 text-green-700"
                        : sub.status === "paused"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                  </span>
                </div>
              </div>

              {/* Usage Metrics */}
              <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                <div className="bg-blue-50 rounded p-2">
                  <p className="text-xs text-gray-600">Usage Count</p>
                  <p className="font-semibold text-blue-900">{sub.usageCount}</p>
                </div>
                <div className="bg-purple-50 rounded p-2">
                  <p className="text-xs text-gray-600">Metrics</p>
                  <p className="font-semibold text-purple-900">{sub.metricsCount}</p>
                </div>
                <div className="bg-gray-100 rounded p-2">
                  <p className="text-xs text-gray-600">Subscribed</p>
                  <p className="font-semibold text-gray-900">
                    {sub.subscribedAt.toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Last Used */}
              {sub.lastUsedAt && (
                <p className="text-xs text-gray-500 mb-3">
                  Last used: {sub.lastUsedAt.toLocaleString()}
                </p>
              )}

              {/* Actions */}
              {!readOnly && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePauseResume(sub.id, sub.status)}
                    disabled={actionInProgress === sub.id || sub.status === "expired"}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-yellow-100 text-yellow-700 hover:bg-yellow-200 rounded transition-colors disabled:bg-gray-200 disabled:text-gray-500"
                  >
                    {sub.status === "active" ? (
                      <>
                        <Pause className="w-4 h-4" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Resume
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleCancel(sub.id)}
                    disabled={actionInProgress === sub.id}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded transition-colors disabled:bg-gray-200 disabled:text-gray-500"
                  >
                    <Trash2 className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrustSubscriptionManager;

