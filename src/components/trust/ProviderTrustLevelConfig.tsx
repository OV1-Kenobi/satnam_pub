/**
 * ProviderTrustLevelConfig Component
 * Phase 2 Day 4: UI Components & Integration
 *
 * Component for configuring provider trust levels and weights
 * Allows users to customize trust level (1-5) and metric weight (0.0-1.0)
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import React, { useEffect, useState } from "react";
import { Save, AlertCircle, CheckCircle } from "lucide-react";
import { ProviderManagementService } from "../../lib/trust/provider-management";
import { supabase } from "../../lib/supabase";
import type { ProviderTrustLevel, TrustLevel } from "../../lib/trust/types";

interface ProviderTrustLevelConfigProps {
  userId: string;
  providerPubkey: string;
  providerName?: string;
  onSaved?: (config: ProviderTrustLevel) => void;
  onError?: (error: string) => void;
}

export const ProviderTrustLevelConfig: React.FC<ProviderTrustLevelConfigProps> = ({
  userId,
  providerPubkey,
  providerName,
  onSaved,
  onError,
}) => {
  const [trustLevel, setTrustLevel] = useState<TrustLevel>(3);
  const [weight, setWeight] = useState(0.5);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [config, setConfig] = useState<ProviderTrustLevel | null>(null);

  const service = new ProviderManagementService(supabase);

  // Load existing configuration on mount
  useEffect(() => {
    loadConfig();
  }, [userId, providerPubkey]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await service.getProviderTrustLevel(userId, providerPubkey);
      if (result) {
        setConfig(result);
        setTrustLevel(result.trustLevel);
        setWeight(result.weight);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load configuration";
      setError(message);
      onError?.(message);
      console.error("Error loading config:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const result = await service.setProviderTrustLevel(
        userId,
        providerPubkey,
        trustLevel,
        weight
      );

      setConfig(result);
      setSuccess(true);
      onSaved?.(result);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save configuration";
      setError(message);
      onError?.(message);
      console.error("Error saving config:", err);
    } finally {
      setSaving(false);
    }
  };

  const getTrustLevelDescription = (level: TrustLevel): string => {
    switch (level) {
      case 1:
        return "Very Low - Minimal trust, verify all information";
      case 2:
        return "Low - Limited trust, use with caution";
      case 3:
        return "Medium - Moderate trust, standard verification";
      case 4:
        return "High - Strong trust, reduced verification";
      case 5:
        return "Very High - Maximum trust, minimal verification";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-gray-500">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg border border-gray-200">
      {providerName && (
        <div className="text-lg font-semibold text-gray-900">{providerName}</div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-sm text-green-700">Configuration saved successfully</span>
        </div>
      )}

      {/* Trust Level Configuration */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Trust Level
          </label>
          <select
            value={trustLevel}
            onChange={(e) => setTrustLevel(parseInt(e.target.value) as TrustLevel)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={1}>1 - Very Low</option>
            <option value={2}>2 - Low</option>
            <option value={3}>3 - Medium</option>
            <option value={4}>4 - High</option>
            <option value={5}>5 - Very High</option>
          </select>
          <p className="mt-2 text-sm text-gray-600">
            {getTrustLevelDescription(trustLevel)}
          </p>
        </div>

        {/* Weight Configuration */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Metric Weight: {weight.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={weight}
            onChange={(e) => setWeight(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="mt-2 flex justify-between text-xs text-gray-500">
            <span>0.0 (No weight)</span>
            <span>0.5 (Medium)</span>
            <span>1.0 (Full weight)</span>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Controls how much this provider's metrics influence your overall trust calculations.
            Higher weight = more influence.
          </p>
        </div>

        {/* Weight Preview */}
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-sm font-medium text-gray-700 mb-2">Weight Impact</div>
          <div className="space-y-1 text-xs text-gray-600">
            <div>
              <span className="font-medium">Composite Score Impact:</span>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${weight * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Current Configuration Display */}
        {config && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-sm font-medium text-gray-700 mb-2">Current Configuration</div>
            <div className="space-y-1 text-sm text-gray-600">
              <div>
                <span className="font-medium">Trust Level:</span> {config.trustLevel}
              </div>
              <div>
                <span className="font-medium">Weight:</span> {config.weight.toFixed(2)}
              </div>
              <div>
                <span className="font-medium">Last Updated:</span>{" "}
                {new Date(config.updatedAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-colors"
      >
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : "Save Configuration"}
      </button>
    </div>
  );
};

export default ProviderTrustLevelConfig;

