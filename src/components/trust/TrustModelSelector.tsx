/**
 * TrustModelSelector Component
 * Phase 2 Day 5: Settings Integration & Final Testing
 *
 * Component for selecting trust model and customizing metric weights
 * Supports action-based, multi-metric, and hybrid trust models
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import React, { useState } from "react";
import { Save, AlertCircle, CheckCircle } from "lucide-react";

export type TrustModel = "action-based" | "multi-metric" | "hybrid";

interface MetricWeights {
  rank: number;
  followers: number;
  hops: number;
  influence: number;
  reliability: number;
  recency: number;
}

interface TrustModelSelectorProps {
  selectedModel: TrustModel;
  customWeights?: MetricWeights;
  onModelChange: (model: TrustModel) => void;
  onWeightsChange?: (weights: MetricWeights) => void;
  onSave?: () => Promise<void>;
  readOnly?: boolean;
}

const DEFAULT_WEIGHTS: MetricWeights = {
  rank: 0.25,
  followers: 0.15,
  hops: 0.15,
  influence: 0.2,
  reliability: 0.15,
  recency: 0.1,
};

const MODEL_DESCRIPTIONS: Record<TrustModel, string> = {
  "action-based": "Trust based on user actions and historical behavior",
  "multi-metric": "Trust based on multiple metrics (rank, followers, hops, influence, reliability, recency)",
  hybrid: "Combination of action-based and multi-metric trust scoring",
};

export const TrustModelSelector: React.FC<TrustModelSelectorProps> = ({
  selectedModel,
  customWeights = DEFAULT_WEIGHTS,
  onModelChange,
  onWeightsChange,
  onSave,
  readOnly = false,
}) => {
  const [weights, setWeights] = useState<MetricWeights>(customWeights);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleWeightChange = (metric: keyof MetricWeights, value: number) => {
    const newWeights = { ...weights, [metric]: value };
    setWeights(newWeights);
    onWeightsChange?.(newWeights);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      // Validate weights sum to 1.0
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1.0) > 0.01) {
        setError("Metric weights must sum to 1.0");
        return;
      }

      await onSave?.();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save settings";
      setError(message);
      console.error("Error saving settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const resetWeights = () => {
    setWeights(DEFAULT_WEIGHTS);
    onWeightsChange?.(DEFAULT_WEIGHTS);
  };

  const weightsSum = Object.values(weights).reduce((a, b) => a + b, 0);
  const isValidWeights = Math.abs(weightsSum - 1.0) < 0.01;

  return (
    <div className="space-y-6 p-4 bg-white rounded-lg border border-gray-200">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Trust Model</h3>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm text-green-700">Settings saved successfully</span>
          </div>
        )}

        {/* Model Selection */}
        <div className="space-y-3 mb-6">
          {(["action-based", "multi-metric", "hybrid"] as TrustModel[]).map((model) => (
            <label
              key={model}
              className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                selectedModel === model
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="trust-model"
                value={model}
                checked={selectedModel === model}
                onChange={(e) => !readOnly && onModelChange(e.target.value as TrustModel)}
                disabled={readOnly}
                className="w-4 h-4 text-blue-600"
              />
              <div className="ml-3 flex-1">
                <div className="font-medium text-gray-900 capitalize">
                  {model.replace("-", " ")}
                </div>
                <div className="text-sm text-gray-600">
                  {MODEL_DESCRIPTIONS[model]}
                </div>
              </div>
            </label>
          ))}
        </div>

        {/* Metric Weights Configuration */}
        {selectedModel === "multi-metric" && (
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">Metric Weights</h4>
              {!readOnly && (
                <button
                  onClick={resetWeights}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Reset to Default
                </button>
              )}
            </div>

            <div className="space-y-3">
              {(Object.entries(weights) as [keyof MetricWeights, number][]).map(
                ([metric, value]) => (
                  <div key={metric}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-gray-700 capitalize">
                        {metric}
                      </label>
                      <span className="text-sm font-semibold text-gray-900">
                        {(value * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={value}
                      onChange={(e) =>
                        !readOnly &&
                        handleWeightChange(metric, parseFloat(e.target.value))
                      }
                      disabled={readOnly}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                    />
                  </div>
                )
              )}
            </div>

            {/* Weight Validation */}
            <div className="p-3 bg-white rounded border border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Total Weight</span>
                <span
                  className={`text-sm font-semibold ${
                    isValidWeights ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {(weightsSum * 100).toFixed(1)}%
                </span>
              </div>
              {!isValidWeights && (
                <div className="text-xs text-red-600 mt-1">
                  Weights must sum to 100%
                </div>
              )}
            </div>
          </div>
        )}

        {/* Model Preview */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="text-sm font-medium text-gray-700 mb-2">Current Configuration</div>
          <div className="space-y-1 text-sm text-gray-600">
            <div>
              <span className="font-medium">Model:</span> {selectedModel.replace("-", " ")}
            </div>
            {selectedModel === "multi-metric" && (
              <div>
                <span className="font-medium">Weights Valid:</span>{" "}
                {isValidWeights ? "✓ Yes" : "✗ No"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
      {!readOnly && onSave && (
        <button
          onClick={handleSave}
          disabled={saving || (selectedModel === "multi-metric" && !isValidWeights)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Model Configuration"}
        </button>
      )}
    </div>
  );
};

export default TrustModelSelector;

