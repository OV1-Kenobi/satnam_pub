/**
 * TrustScoreComparison Component
 * Phase 2 Day 4: UI Components & Integration
 *
 * Component for comparing trust scores across multiple providers
 * Shows side-by-side comparison of metrics and composite scores
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import React, { useMemo } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { TrustMetrics } from "../../lib/trust/types";

interface ProviderComparison {
  providerName: string;
  providerPubkey: string;
  metrics: TrustMetrics;
}

interface TrustScoreComparisonProps {
  providers: ProviderComparison[];
  highlightedProvider?: string;
  showRanking?: boolean;
}

export const TrustScoreComparison: React.FC<TrustScoreComparisonProps> = ({
  providers,
  highlightedProvider,
  showRanking = true,
}) => {
  const rankedProviders = useMemo(() => {
    const sorted = [...providers].sort(
      (a, b) => b.metrics.compositeScore - a.metrics.compositeScore
    );
    return sorted.map((p, index) => ({ ...p, rank: index + 1 }));
  }, [providers]);

  const getScoreTrend = (
    current: number,
    previous?: number
  ): { icon: React.ReactNode; color: string; text: string } => {
    if (!previous) return { icon: null, color: "", text: "" };
    if (current > previous)
      return {
        icon: <TrendingUp className="w-4 h-4" />,
        color: "text-green-600",
        text: `+${(current - previous).toFixed(1)}`,
      };
    if (current < previous)
      return {
        icon: <TrendingDown className="w-4 h-4" />,
        color: "text-red-600",
        text: `${(current - previous).toFixed(1)}`,
      };
    return { icon: null, color: "", text: "" };
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return "bg-green-100 border-green-300";
    if (score >= 60) return "bg-blue-100 border-blue-300";
    if (score >= 40) return "bg-yellow-100 border-yellow-300";
    if (score >= 20) return "bg-orange-100 border-orange-300";
    return "bg-red-100 border-red-300";
  };

  const getScoreTextColor = (score: number): string => {
    if (score >= 80) return "text-green-900";
    if (score >= 60) return "text-blue-900";
    if (score >= 40) return "text-yellow-900";
    if (score >= 20) return "text-orange-900";
    return "text-red-900";
  };

  if (providers.length === 0) {
    return (
      <div className="text-center p-4 text-gray-500">
        No providers to compare
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              {showRanking && <th className="px-3 py-2 text-left font-semibold text-gray-700">Rank</th>}
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Provider</th>
              <th className="px-3 py-2 text-center font-semibold text-gray-700">Composite</th>
              <th className="px-3 py-2 text-center font-semibold text-gray-700">Rank</th>
              <th className="px-3 py-2 text-center font-semibold text-gray-700">Influence</th>
              <th className="px-3 py-2 text-center font-semibold text-gray-700">Reliability</th>
              <th className="px-3 py-2 text-center font-semibold text-gray-700">Recency</th>
            </tr>
          </thead>
          <tbody>
            {rankedProviders.map((provider) => (
              <tr
                key={provider.providerPubkey}
                className={`border-b border-gray-100 ${
                  highlightedProvider === provider.providerPubkey
                    ? "bg-blue-50"
                    : "hover:bg-gray-50"
                }`}
              >
                {showRanking && (
                  <td className="px-3 py-3 text-center font-semibold text-gray-900">
                    #{provider.rank}
                  </td>
                )}
                <td className="px-3 py-3">
                  <div className="font-medium text-gray-900">
                    {provider.providerName}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {provider.providerPubkey}
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <div
                    className={`inline-block px-3 py-1 rounded-lg font-semibold border ${getScoreColor(
                      provider.metrics.compositeScore
                    )} ${getScoreTextColor(provider.metrics.compositeScore)}`}
                  >
                    {Math.round(provider.metrics.compositeScore)}
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <div className="text-gray-900 font-medium">
                    {Math.round(provider.metrics.rank)}
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <div className="text-gray-900 font-medium">
                    {Math.round(provider.metrics.influence)}
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <div className="text-gray-900 font-medium">
                    {Math.round(provider.metrics.reliability)}
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <div className="text-gray-900 font-medium">
                    {Math.round(provider.metrics.recency)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Score Distribution Chart */}
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="text-sm font-semibold text-gray-700 mb-3">Score Distribution</div>
        <div className="space-y-2">
          {rankedProviders.map((provider) => (
            <div key={provider.providerPubkey} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-700 font-medium truncate max-w-xs">
                  {provider.providerName}
                </span>
                <span className="text-gray-900 font-semibold">
                  {Math.round(provider.metrics.compositeScore)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    provider.metrics.compositeScore >= 80
                      ? "bg-green-500"
                      : provider.metrics.compositeScore >= 60
                      ? "bg-blue-500"
                      : provider.metrics.compositeScore >= 40
                      ? "bg-yellow-500"
                      : provider.metrics.compositeScore >= 20
                      ? "bg-orange-500"
                      : "bg-red-500"
                  }`}
                  style={{
                    width: `${Math.min(
                      (provider.metrics.compositeScore / 100) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Metric Comparison */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Avg Rank", key: "rank" as const },
          { label: "Avg Influence", key: "influence" as const },
          { label: "Avg Reliability", key: "reliability" as const },
          { label: "Avg Recency", key: "recency" as const },
        ].map((metric) => {
          const avg =
            rankedProviders.reduce((sum, p) => sum + p.metrics[metric.key], 0) /
            rankedProviders.length;
          return (
            <div
              key={metric.key}
              className="p-3 bg-gray-50 rounded-lg border border-gray-200"
            >
              <div className="text-xs text-gray-600 mb-1">{metric.label}</div>
              <div className="text-lg font-semibold text-gray-900">
                {Math.round(avg)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Top Provider Highlight */}
      {rankedProviders.length > 0 && (
        <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
          <div className="text-sm font-semibold text-gray-700 mb-2">Top Provider</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">
                {rankedProviders[0].providerName}
              </div>
              <div className="text-xs text-gray-600">
                Composite Score: {Math.round(rankedProviders[0].metrics.compositeScore)}
              </div>
            </div>
            <div className="text-3xl font-bold text-green-600">
              {Math.round(rankedProviders[0].metrics.compositeScore)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrustScoreComparison;

