/**
 * TrustSettings Component
 * Phase 2 Day 5: Settings Integration & Final Testing
 *
 * Settings page integration for all trust components
 * Manages provider preferences, trust model selection, and metric configuration
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import { AlertCircle, Loader } from "lucide-react";
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { ProviderManagementService } from "../../lib/trust/provider-management";
import type { TrustedProvider, TrustMetrics } from "../../lib/trust/types";
import { useAuth } from "../auth/AuthProvider";
import { ProviderTrustLevelConfig } from "../trust/ProviderTrustLevelConfig";
import { TrustModelSelector, type TrustModel } from "../trust/TrustModelSelector";
import { TrustProviderSelector } from "../trust/TrustProviderSelector";
import { TrustScoreComparison } from "../trust/TrustScoreComparison";

interface TrustSettingsState {
  trustModel: TrustModel;
  providers: TrustedProvider[];
  selectedProvider: TrustedProvider | null;
  metrics: TrustMetrics | null;
}

export const TrustSettings: React.FC = () => {
  const auth = useAuth();
  const [state, setState] = useState<TrustSettingsState>({
    trustModel: "multi-metric",
    providers: [],
    selectedProvider: null,
    metrics: null,
  });
  const [activeTab, setActiveTab] = useState<
    "providers" | "metrics" | "model" | "marketplace" | "subscriptions" | "notifications"
  >("providers");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const service = new ProviderManagementService(supabase);
  const userId = auth?.user?.id;

  // Load initial data
  useEffect(() => {
    if (!userId) return;
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load trust model preference
      const { data: prefs } = await supabase
        .from("trust_provider_preferences")
        .select("trust_model")
        .eq("user_id", userId)
        .single();

      if (prefs?.trust_model) {
        setState((prev) => ({
          ...prev,
          trustModel: prefs.trust_model as TrustModel,
        }));
      }

      // Load providers
      const providers = await service.getTrustedProviders(userId);
      setState((prev) => ({
        ...prev,
        providers,
        selectedProvider: providers[0] || null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load settings";
      setError(message);
      console.error("Error loading settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveModel = async () => {
    if (!userId) return;

    try {
      setSaving(true);
      setError(null);

      await supabase
        .from("trust_provider_preferences")
        .upsert({
          user_id: userId,
          trust_model: state.trustModel,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save model";
      setError(message);
      console.error("Error saving model:", err);
    } finally {
      setSaving(false);
    }
  };

  if (!userId) {
    return (
      <div className="p-4 text-center text-gray-500">
        Please sign in to access trust settings
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {(["providers", "metrics", "model", "marketplace", "subscriptions", "notifications"] as const).map(
          (tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
            >
              {tab === "providers" && "Providers"}
              {tab === "metrics" && "Metrics"}
              {tab === "model" && "Trust Model"}
              {tab === "marketplace" && "Marketplace"}
              {tab === "subscriptions" && "Subscriptions"}
              {tab === "notifications" && "Notifications"}
            </button>
          )
        )}
      </div>

      {/* Providers Tab */}
      {activeTab === "providers" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Trusted Providers
            </h3>
            <TrustProviderSelector
              userId={userId}
              onProvidersChanged={(providers) =>
                setState((prev) => ({
                  ...prev,
                  providers,
                  selectedProvider: providers[0] || null,
                }))
              }
            />
          </div>

          {state.selectedProvider && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Provider Configuration
              </h3>
              <ProviderTrustLevelConfig
                userId={userId}
                providerPubkey={state.selectedProvider.providerPubkey}
                providerName={state.selectedProvider.providerName}
              />
            </div>
          )}
        </div>
      )}

      {/* Metrics Tab */}
      {activeTab === "metrics" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Trust Metrics
            </h3>
            {state.providers.length === 0 ? (
              <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg">
                No providers configured. Add providers in the Providers tab to view metrics.
              </div>
            ) : (
              <div className="space-y-4">
                {state.providers.map((provider) => (
                  <div key={provider.id} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">
                      {provider.providerName || "Unknown Provider"}
                    </h4>
                    {/* Placeholder for metrics - would be populated with actual data */}
                    <div className="text-sm text-gray-600">
                      Metrics will be displayed here when available
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {state.providers.length > 1 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Provider Comparison
              </h3>
              <TrustScoreComparison
                providers={state.providers.map((p) => ({
                  providerName: p.providerName || "Unknown",
                  providerPubkey: p.providerPubkey,
                  metrics: {
                    rank: 0 as any,
                    followers: 0,
                    hops: 1 as any,
                    influence: 0 as any,
                    reliability: 0 as any,
                    recency: 0 as any,
                    compositeScore: 0 as any,
                  },
                }))}
              />
            </div>
          )}
        </div>
      )}

      {/* Trust Model Tab */}
      {activeTab === "model" && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Trust Model Configuration
          </h3>
          <TrustModelSelector
            selectedModel={state.trustModel}
            onModelChange={(model) =>
              setState((prev) => ({ ...prev, trustModel: model }))
            }
            onSave={handleSaveModel}
          />
        </div>
      )}

      {/* Marketplace Tab */}
      {activeTab === "marketplace" && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Trust Provider Marketplace
          </h3>
          <TrustProviderMarketplace userId={userId} />
        </div>
      )}

      {/* Subscriptions Tab */}
      {activeTab === "subscriptions" && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Active Subscriptions
          </h3>
          <TrustSubscriptionManager userId={userId} />
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === "notifications" && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Notification Settings
          </h3>
          <TrustNotificationSettings userId={userId} />
        </div>
      )}
    </div>
  );
};

export default TrustSettings;

