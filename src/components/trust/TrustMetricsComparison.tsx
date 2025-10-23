/**
 * TrustMetricsComparison Component
 * Phase 3 Day 3: Trust Metrics Comparison UI
 *
 * Component for comparing trust metrics across multiple contacts
 * Displays all 6 metrics side-by-side with difference indicators
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import React, { useState } from "react";
import { Download, X } from "lucide-react";
import type { TrustMetrics } from "../../lib/trust/types";

export interface ComparisonContact {
  id: string;
  name: string;
  metrics: TrustMetrics;
  color?: string;
}

interface TrustMetricsComparisonProps {
  contacts: ComparisonContact[];
  onClose?: () => void;
  onExport?: (data: ComparisonData) => void;
}

export interface ComparisonData {
  contacts: ComparisonContact[];
  exportedAt: Date;
  format: "json" | "csv";
}

export const TrustMetricsComparison: React.FC<TrustMetricsComparisonProps> = ({
  contacts,
  onClose,
  onExport,
}) => {
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");

  const getMetricColor = (value: number): string => {
    if (value >= 80) return "text-green-600";
    if (value >= 60) return "text-blue-600";
    if (value >= 40) return "text-yellow-600";
    if (value >= 20) return "text-orange-600";
    return "text-red-600";
  };

  const getDifference = (value1: number, value2: number): number => {
    return value1 - value2;
  };

  const getDifferenceIndicator = (diff: number): string => {
    if (diff > 5) return "↑ Higher";
    if (diff < -5) return "↓ Lower";
    return "≈ Similar";
  };

  const getDifferenceColor = (diff: number): string => {
    if (diff > 5) return "text-green-600";
    if (diff < -5) return "text-red-600";
    return "text-gray-600";
  };

  const handleExport = () => {
    if (!onExport) return;

    const data: ComparisonData = {
      contacts,
      exportedAt: new Date(),
      format: exportFormat,
    };

    onExport(data);
  };

  const MetricRow: React.FC<{
    label: string;
    metricKey: keyof TrustMetrics;
    unit?: string;
  }> = ({ label, metricKey, unit = "" }) => (
    <div className="border-b border-gray-200 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${contacts.length}, 1fr)` }}>
        {contacts.map((contact, idx) => {
          const value = contact.metrics[metricKey];
          const isNumeric = typeof value === "number";
          const displayValue = isNumeric ? Math.round(value as number) : value;

          return (
            <div key={contact.id} className="bg-gray-50 p-2 rounded">
              <div className={`text-lg font-semibold ${getMetricColor(displayValue as number)}`}>
                {displayValue}{unit}
              </div>
              {idx > 0 && (
                <div className={`text-xs mt-1 ${getDifferenceColor(getDifference(displayValue as number, contacts[0].metrics[metricKey] as number))}`}>
                  {getDifferenceIndicator(getDifference(displayValue as number, contacts[0].metrics[metricKey] as number))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Trust Metrics Comparison</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        )}
      </div>

      {/* Contact Headers */}
      <div className="grid gap-2 p-4 border-b border-gray-200" style={{ gridTemplateColumns: `repeat(${contacts.length}, 1fr)` }}>
        {contacts.map((contact) => (
          <div key={contact.id} className="text-center">
            <div className="font-semibold text-gray-900">{contact.name}</div>
            <div className="text-xs text-gray-500">ID: {contact.id.slice(0, 8)}</div>
          </div>
        ))}
      </div>

      {/* Metrics Comparison */}
      <div className="p-4 space-y-2">
        <MetricRow label="Rank" metricKey="rank" unit="" />
        <MetricRow label="Followers" metricKey="followers" unit="" />
        <MetricRow label="Hops" metricKey="hops" unit="" />
        <MetricRow label="Influence" metricKey="influence" unit="" />
        <MetricRow label="Reliability" metricKey="reliability" unit="" />
        <MetricRow label="Recency" metricKey="recency" unit="" />

        {/* Composite Score */}
        <div className="border-t-2 border-gray-300 pt-3 mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-900">Composite Score</span>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${contacts.length}, 1fr)` }}>
            {contacts.map((contact, idx) => {
              const value = Math.round(contact.metrics.compositeScore as number);
              return (
                <div key={contact.id} className="bg-gradient-to-br from-blue-50 to-purple-50 p-3 rounded-lg border border-blue-200">
                  <div className={`text-2xl font-bold ${getMetricColor(value)}`}>
                    {value}
                  </div>
                  {idx > 0 && (
                    <div className={`text-xs mt-1 ${getDifferenceColor(getDifference(value, Math.round(contacts[0].metrics.compositeScore as number)))}`}>
                      {getDifferenceIndicator(getDifference(value, Math.round(contacts[0].metrics.compositeScore as number)))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Export Section */}
      {onExport && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex items-center gap-2">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as "json" | "csv")}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrustMetricsComparison;

