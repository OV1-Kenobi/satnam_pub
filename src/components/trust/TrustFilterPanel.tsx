/**
 * TrustFilterPanel Component
 * Phase 3 Day 2: Trust-Based Contact Filtering & Sorting
 *
 * Component for advanced trust-based filtering of contacts
 * Allows users to filter by trust score, providers, verification methods, and trust levels
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import { RotateCcw, Save, X } from "lucide-react";
import React, { useState } from "react";
import type { TrustLevel } from "../../lib/trust/types";

export interface TrustFilters {
  minTrustScore?: number;
  maxTrustScore?: number;
  selectedProviders?: string[];
  verificationMethods?: ("simpleproof" | "iroh" | "nip85")[];
  trustLevel?: TrustLevel;
  showUnverified?: boolean;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: TrustFilters;
}

interface TrustFilterPanelProps {
  onFilterChange: (filters: TrustFilters) => void;
  onSavePreset?: (name: string, filters: TrustFilters) => void;
  onLoadPreset?: (preset: FilterPreset) => void;
  presets?: FilterPreset[];
  availableProviders?: Array<{ id: string; name: string }>;
  currentFilters?: TrustFilters;
}

export const TrustFilterPanel: React.FC<TrustFilterPanelProps> = ({
  onFilterChange,
  onSavePreset,
  onLoadPreset,
  presets = [],
  availableProviders = [],
  currentFilters = {},
}) => {
  const [filters, setFilters] = useState<TrustFilters>(currentFilters);
  const [showPresetName, setShowPresetName] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const handleTrustScoreChange = (type: "min" | "max", value: number) => {
    const newFilters = { ...filters };
    if (type === "min") {
      newFilters.minTrustScore = value;
    } else {
      newFilters.maxTrustScore = value;
    }
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleProviderToggle = (providerId: string) => {
    const newProviders = filters.selectedProviders || [];
    const index = newProviders.indexOf(providerId);
    if (index > -1) {
      newProviders.splice(index, 1);
    } else {
      newProviders.push(providerId);
    }
    const newFilters = { ...filters, selectedProviders: newProviders };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleVerificationMethodToggle = (method: "simpleproof" | "iroh" | "nip85") => {
    const newMethods = [...(filters.verificationMethods || [])];
    const index = newMethods.indexOf(method);
    if (index > -1) {
      newMethods.splice(index, 1);
    } else {
      newMethods.push(method);
    }
    const newFilters = { ...filters, verificationMethods: newMethods };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleTrustLevelChange = (level: TrustLevel | undefined) => {
    const newFilters = { ...filters, trustLevel: level };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleShowUnverifiedToggle = () => {
    const newFilters = { ...filters, showUnverified: !filters.showUnverified };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleSavePreset = () => {
    if (presetName.trim()) {
      onSavePreset?.(presetName, filters);
      setPresetName("");
      setShowPresetName(false);
    }
  };

  const handleClearFilters = () => {
    const emptyFilters: TrustFilters = {};
    setFilters(emptyFilters);
    onFilterChange(emptyFilters);
  };

  const hasActiveFilters = Object.values(filters).some(
    (v) => v !== undefined && (Array.isArray(v) ? v.length > 0 : true)
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">Trust Filters</span>
          {hasActiveFilters && (
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
              Active
            </span>
          )}
        </div>
        <span className={`text-gray-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-gray-200 p-4 space-y-4">
          {/* Trust Score Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Trust Score Range
            </label>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filters.minTrustScore || 0}
                  onChange={(e) => handleTrustScoreChange("min", Number(e.target.value))}
                  className="w-full"
                />
                <div className="text-xs text-gray-600 mt-1">
                  Min: {filters.minTrustScore || 0}
                </div>
              </div>
              <div className="flex-1">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filters.maxTrustScore || 100}
                  onChange={(e) => handleTrustScoreChange("max", Number(e.target.value))}
                  className="w-full"
                />
                <div className="text-xs text-gray-600 mt-1">
                  Max: {filters.maxTrustScore || 100}
                </div>
              </div>
            </div>
          </div>

          {/* Trust Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Trust Level
            </label>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  onClick={() =>
                    handleTrustLevelChange(
                      filters.trustLevel === (level as TrustLevel) ? undefined : (level as TrustLevel)
                    )
                  }
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${filters.trustLevel === level
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                >
                  {"⭐".repeat(level)}
                </button>
              ))}
            </div>
          </div>

          {/* Verification Methods */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Verification Methods
            </label>
            <div className="space-y-2">
              {["simpleproof", "iroh", "nip85"].map((method) => (
                <label key={method} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.verificationMethods?.includes(method as any) || false}
                    onChange={() => handleVerificationMethodToggle(method as any)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700 capitalize">{method}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Providers */}
          {availableProviders.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Providers
              </label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {availableProviders.map((provider) => (
                  <label key={provider.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.selectedProviders?.includes(provider.id) || false}
                      onChange={() => handleProviderToggle(provider.id)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">{provider.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Show Unverified */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.showUnverified || false}
              onChange={handleShowUnverifiedToggle}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Show unverified contacts</span>
          </label>

          {/* Presets */}
          {presets.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Saved Presets
              </label>
              <div className="space-y-1">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => onLoadPreset?.(preset)}
                    className="w-full text-left px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm text-gray-700 transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-gray-200">
            <button
              onClick={handleClearFilters}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Clear
            </button>
            {onSavePreset && (
              <button
                onClick={() => setShowPresetName(!showPresetName)}
                className="flex-1 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Preset
              </button>
            )}
          </div>

          {/* Save Preset Input */}
          {showPresetName && (
            <div className="flex gap-2 pt-2 border-t border-gray-200">
              <input
                type="text"
                placeholder="Preset name..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSavePreset}
                className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setShowPresetName(false)}
                className="px-3 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TrustFilterPanel;

