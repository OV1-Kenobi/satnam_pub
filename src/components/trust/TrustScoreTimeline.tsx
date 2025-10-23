/**
 * TrustScoreTimeline Component
 * Phase 3 Day 3: Trust Metrics Comparison UI
 *
 * Component for displaying historical trust score changes over time
 * Shows line chart with time range selector and event markers
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import React, { useState, useMemo } from "react";
import { Calendar, TrendingUp } from "lucide-react";
import type { TrustMetrics } from "../../lib/trust/types";

export interface TimelineDataPoint {
  timestamp: Date;
  score: number;
  metrics?: Partial<TrustMetrics>;
  event?: string;
}

interface TrustScoreTimelineProps {
  contactId: string;
  contactName: string;
  data: TimelineDataPoint[];
  onTimeRangeChange?: (range: TimeRange) => void;
}

export type TimeRange = "7d" | "30d" | "90d" | "all";

export const TrustScoreTimeline: React.FC<TrustScoreTimelineProps> = ({
  contactId,
  contactName,
  data,
  onTimeRangeChange,
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [showMetricBreakdown, setShowMetricBreakdown] = useState(false);

  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const now = new Date();
    let cutoffDate = new Date();

    switch (timeRange) {
      case "7d":
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case "30d":
        cutoffDate.setDate(now.getDate() - 30);
        break;
      case "90d":
        cutoffDate.setDate(now.getDate() - 90);
        break;
      case "all":
        cutoffDate = new Date(0);
        break;
    }

    return data.filter((point) => point.timestamp >= cutoffDate);
  }, [data, timeRange]);

  const stats = useMemo(() => {
    if (filteredData.length === 0) {
      return { min: 0, max: 0, avg: 0, current: 0, trend: 0 };
    }

    const scores = filteredData.map((p) => p.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const current = scores[scores.length - 1];
    const trend = current - (scores.length > 1 ? scores[0] : current);

    return { min, max, avg, current, trend };
  }, [filteredData]);

  const getScoreColor = (score: number): string => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-blue-600";
    if (score >= 40) return "text-yellow-600";
    if (score >= 20) return "text-orange-600";
    return "text-red-600";
  };

  const getTrendIndicator = (trend: number): string => {
    if (trend > 5) return "↑ Improving";
    if (trend < -5) return "↓ Declining";
    return "→ Stable";
  };

  const getTrendColor = (trend: number): string => {
    if (trend > 5) return "text-green-600";
    if (trend < -5) return "text-red-600";
    return "text-gray-600";
  };

  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range);
    onTimeRangeChange?.(range);
  };

  // Simple ASCII chart representation
  const renderChart = () => {
    if (filteredData.length === 0) {
      return <div className="text-center text-gray-500 py-8">No data available</div>;
    }

    const chartHeight = 100;
    const chartWidth = Math.max(300, filteredData.length * 20);
    const minScore = Math.min(...filteredData.map((p) => p.score));
    const maxScore = Math.max(...filteredData.map((p) => p.score));
    const range = maxScore - minScore || 1;

    return (
      <div className="overflow-x-auto">
        <svg width={chartWidth} height={chartHeight + 40} className="mx-auto">
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((y) => (
            <line
              key={`grid-${y}`}
              x1="40"
              y1={chartHeight - (y / 100) * chartHeight + 20}
              x2={chartWidth - 20}
              y2={chartHeight - (y / 100) * chartHeight + 20}
              stroke="#e5e7eb"
              strokeDasharray="4"
            />
          ))}

          {/* Y-axis labels */}
          {[0, 25, 50, 75, 100].map((y) => (
            <text
              key={`label-${y}`}
              x="35"
              y={chartHeight - (y / 100) * chartHeight + 25}
              textAnchor="end"
              fontSize="12"
              fill="#6b7280"
            >
              {y}
            </text>
          ))}

          {/* Data line */}
          {filteredData.length > 1 && (
            <polyline
              points={filteredData
                .map((point, idx) => {
                  const x = 40 + (idx / (filteredData.length - 1)) * (chartWidth - 60);
                  const y = chartHeight - ((point.score - minScore) / range) * chartHeight + 20;
                  return `${x},${y}`;
                })
                .join(" ")}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
            />
          )}

          {/* Data points */}
          {filteredData.map((point, idx) => {
            const x = 40 + (idx / Math.max(1, filteredData.length - 1)) * (chartWidth - 60);
            const y = chartHeight - ((point.score - minScore) / range) * chartHeight + 20;
            return (
              <circle
                key={`point-${idx}`}
                cx={x}
                cy={y}
                r="3"
                fill="#3b82f6"
                className="hover:r-5 transition-all"
              />
            );
          })}

          {/* X-axis */}
          <line x1="40" y1={chartHeight + 20} x2={chartWidth - 20} y2={chartHeight + 20} stroke="#d1d5db" strokeWidth="1" />
        </svg>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{contactName} - Trust Score Timeline</h3>
            <p className="text-sm text-gray-500">ID: {contactId.slice(0, 8)}</p>
          </div>
          <TrendingUp className="w-5 h-5 text-blue-600" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="bg-gray-50 p-2 rounded">
            <div className="text-xs text-gray-600">Current</div>
            <div className={`text-lg font-bold ${getScoreColor(stats.current)}`}>{stats.current}</div>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <div className="text-xs text-gray-600">Average</div>
            <div className="text-lg font-bold text-blue-600">{stats.avg}</div>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <div className="text-xs text-gray-600">High</div>
            <div className="text-lg font-bold text-green-600">{stats.max}</div>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <div className="text-xs text-gray-600">Low</div>
            <div className="text-lg font-bold text-red-600">{stats.min}</div>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <div className="text-xs text-gray-600">Trend</div>
            <div className={`text-lg font-bold ${getTrendColor(stats.trend)}`}>{getTrendIndicator(stats.trend)}</div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4 border-b border-gray-200">{renderChart()}</div>

      {/* Time Range Selector */}
      <div className="flex items-center gap-2 p-4 border-b border-gray-200 flex-wrap">
        <Calendar className="w-4 h-4 text-gray-600" />
        {(["7d", "30d", "90d", "all"] as TimeRange[]).map((range) => (
          <button
            key={range}
            onClick={() => handleTimeRangeChange(range)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              timeRange === range
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {range === "7d" ? "7 Days" : range === "30d" ? "30 Days" : range === "90d" ? "90 Days" : "All Time"}
          </button>
        ))}
      </div>

      {/* Metric Breakdown Toggle */}
      <div className="p-4">
        <button
          onClick={() => setShowMetricBreakdown(!showMetricBreakdown)}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          {showMetricBreakdown ? "Hide" : "Show"} Metric Breakdown
        </button>
        {showMetricBreakdown && (
          <div className="mt-3 space-y-2 text-sm text-gray-600">
            <p>Metric breakdown data would be displayed here based on available historical metrics.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrustScoreTimeline;

