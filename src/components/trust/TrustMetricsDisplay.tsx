/**
 * TrustMetricsDisplay Component
 * Phase 2 Day 4: UI Components & Integration
 *
 * Component for displaying multi-metric trust scores
 * Shows visual breakdown of rank, followers, hops, influence, reliability, recency
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import { BarChart3, Download, Info, TrendingUp } from "lucide-react";
import React from "react";
import type { TrustMetrics } from "../../lib/trust/types";

interface TrustMetricsDisplayProps {
  metrics: TrustMetrics;
  providerName?: string;
  showDetails?: boolean;
  compact?: boolean;
  contactId?: string;
  contactName?: string;
  onCompare?: () => void;
  onViewTimeline?: () => void;
  onExport?: (format: "json" | "csv") => void;
}

export const TrustMetricsDisplay: React.FC<TrustMetricsDisplayProps> = ({
  metrics,
  providerName,
  showDetails = true,
  compact = false,
  contactId,
  contactName,
  onCompare,
  onViewTimeline,
  onExport,
}) => {
  const getMetricColor = (value: number): string => {
    if (value >= 80) return "bg-green-500";
    if (value >= 60) return "bg-blue-500";
    if (value >= 40) return "bg-yellow-500";
    if (value >= 20) return "bg-orange-500";
    return "bg-red-500";
  };

  const getMetricLabel = (value: number): string => {
    if (value >= 80) return "Excellent";
    if (value >= 60) return "Good";
    if (value >= 40) return "Fair";
    if (value >= 20) return "Poor";
    return "Very Poor";
  };

  const MetricBar: React.FC<{
    label: string;
    value: number;
    max?: number;
    unit?: string;
    tooltip?: string;
  }> = ({ label, value, max = 100, unit = "", tooltip }) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="flex items-center gap-1">
          <span className="text-sm font-semibold text-gray-900">
            {Math.round(value)}{unit}
          </span>
          {tooltip && (
            <div className="group relative">
              <Info className="w-4 h-4 text-gray-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {tooltip}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all ${getMetricColor(value)}`}
          style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
        />
      </div>
      {max === 100 && (
        <div className="text-xs text-gray-500">{getMetricLabel(value)}</div>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-2">
        {providerName && (
          <div className="text-sm font-semibold text-gray-900">{providerName}</div>
        )}
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {Math.round(metrics.compositeScore)}
            </div>
            <div className="text-xs text-gray-500">Composite</div>
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex gap-1">
              <div className="flex-1 text-center">
                <div className="text-xs font-semibold text-gray-700">
                  {Math.round(metrics.rank)}
                </div>
                <div className="text-xs text-gray-500">Rank</div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-xs font-semibold text-gray-700">
                  {metrics.followers}
                </div>
                <div className="text-xs text-gray-500">Followers</div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-xs font-semibold text-gray-700">
                  {metrics.hops}
                </div>
                <div className="text-xs text-gray-500">Hops</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 bg-white rounded-lg border border-gray-200">
      {providerName && (
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold text-gray-900">{providerName}</div>
          {/* Phase 3 Day 3: Action Buttons */}
          {(onCompare || onViewTimeline || onExport) && (
            <div className="flex gap-2 flex-wrap">
              {onCompare && (
                <button
                  onClick={onCompare}
                  className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors"
                  title="Compare with other contacts"
                >
                  <BarChart3 className="w-4 h-4" />
                  Compare
                </button>
              )}
              {onViewTimeline && (
                <button
                  onClick={onViewTimeline}
                  className="flex items-center gap-1 px-3 py-1 text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg transition-colors"
                  title="View historical trust score"
                >
                  <TrendingUp className="w-4 h-4" />
                  Timeline
                </button>
              )}
              {onExport && (
                <button
                  onClick={() => onExport("json")}
                  className="flex items-center gap-1 px-3 py-1 text-sm bg-green-100 text-green-700 hover:bg-green-200 rounded-lg transition-colors"
                  title="Export metrics data"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Composite Score */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-700">Composite Score</div>
            <div className="text-3xl font-bold text-gray-900 mt-1">
              {Math.round(metrics.compositeScore)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">
              Weighted average of all metrics
            </div>
          </div>
        </div>
      </div>

      {/* Individual Metrics */}
      {showDetails && (
        <div className="space-y-4">
          <MetricBar
            label="Rank"
            value={metrics.rank}
            tooltip="Overall trust score (0-100)"
          />
          <MetricBar
            label="Followers"
            value={metrics.followers}
            max={1000}
            unit=""
            tooltip="Estimated social reach"
          />
          <MetricBar
            label="Network Hops"
            value={7 - metrics.hops}
            max={6}
            tooltip="Network distance (1=direct, 6=no connection)"
          />
          <MetricBar
            label="Influence"
            value={metrics.influence}
            tooltip="PageRank-style influence score"
          />
          <MetricBar
            label="Reliability"
            value={metrics.reliability}
            tooltip="Success rate and consistency"
          />
          <MetricBar
            label="Recency"
            value={metrics.recency}
            tooltip="Time-decay for recent activity"
          />
        </div>
      )}

      {/* Metric Weights */}
      {showDetails && (
        <div className="pt-4 border-t border-gray-200">
          <div className="text-sm font-medium text-gray-700 mb-3">Metric Weights</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-600">Rank:</span>
              <span className="font-semibold text-gray-900">25%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Followers:</span>
              <span className="font-semibold text-gray-900">15%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Hops:</span>
              <span className="font-semibold text-gray-900">15%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Influence:</span>
              <span className="font-semibold text-gray-900">20%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Reliability:</span>
              <span className="font-semibold text-gray-900">15%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Recency:</span>
              <span className="font-semibold text-gray-900">10%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrustMetricsDisplay;

