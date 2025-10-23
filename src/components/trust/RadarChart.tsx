/**
 * RadarChart Component
 * Phase 3 Day 3: Trust Metrics Comparison UI
 *
 * Component for displaying trust metrics in radar/spider chart format
 * Supports multi-contact overlay with interactive tooltips
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import React, { useMemo } from "react";
import { Download } from "lucide-react";
import type { TrustMetrics } from "../../lib/trust/types";

export interface RadarChartContact {
  id: string;
  name: string;
  metrics: TrustMetrics;
  color: string;
}

interface RadarChartProps {
  contacts: RadarChartContact[];
  onExport?: (format: "png" | "svg") => void;
}

export const RadarChart: React.FC<RadarChartProps> = ({ contacts, onExport }) => {
  const metrics = ["Rank", "Followers", "Hops", "Influence", "Reliability", "Recency"];
  const metricKeys: (keyof TrustMetrics)[] = ["rank", "followers", "hops", "influence", "reliability", "recency"];

  const normalizedData = useMemo(() => {
    return contacts.map((contact) => ({
      ...contact,
      values: metricKeys.map((key) => {
        const value = contact.metrics[key];
        if (key === "followers") {
          // Normalize followers to 0-100 scale (max 1000)
          return Math.min(100, (value as number / 1000) * 100);
        }
        if (key === "hops") {
          // Normalize hops to 0-100 scale (inverse: 1 hop = 100, 6 hops = 0)
          return ((7 - (value as number)) / 6) * 100;
        }
        return value as number;
      }),
    }));
  }, [contacts]);

  const size = 300;
  const center = size / 2;
  const radius = (size / 2) * 0.8;
  const levels = 5;

  const getAngle = (index: number) => (Math.PI * 2 * index) / metrics.length - Math.PI / 2;

  const getCoordinates = (value: number, angle: number) => {
    const x = center + (radius * value) / 100 * Math.cos(angle);
    const y = center + (radius * value) / 100 * Math.sin(angle);
    return { x, y };
  };

  const getPathData = (values: number[]) => {
    return values
      .map((value, index) => {
        const angle = getAngle(index);
        const { x, y } = getCoordinates(value, angle);
        return `${x},${y}`;
      })
      .join(" ");
  };

  const colors = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Trust Metrics Radar Chart</h3>
        {onExport && (
          <div className="flex gap-2">
            <button
              onClick={() => onExport("png")}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              PNG
            </button>
            <button
              onClick={() => onExport("svg")}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              SVG
            </button>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="p-8 flex justify-center">
        <svg width={size} height={size} className="drop-shadow-lg">
          {/* Background circles (levels) */}
          {Array.from({ length: levels }).map((_, i) => {
            const levelRadius = (radius * (i + 1)) / levels;
            return (
              <circle
                key={`level-${i}`}
                cx={center}
                cy={center}
                r={levelRadius}
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="1"
              />
            );
          })}

          {/* Axis lines and labels */}
          {metrics.map((metric, index) => {
            const angle = getAngle(index);
            const { x, y } = getCoordinates(100, angle);
            const labelCoords = getCoordinates(115, angle);

            return (
              <g key={`axis-${index}`}>
                {/* Axis line */}
                <line x1={center} y1={center} x2={x} y2={y} stroke="#d1d5db" strokeWidth="1" />

                {/* Metric label */}
                <text
                  x={labelCoords.x}
                  y={labelCoords.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="12"
                  fontWeight="500"
                  fill="#374151"
                >
                  {metric}
                </text>
              </g>
            );
          })}

          {/* Data polygons */}
          {normalizedData.map((contact, contactIndex) => (
            <g key={`contact-${contact.id}`}>
              {/* Polygon */}
              <polygon
                points={getPathData(contact.values)}
                fill={contact.color}
                fillOpacity="0.1"
                stroke={contact.color}
                strokeWidth="2"
              />

              {/* Data points */}
              {contact.values.map((value, valueIndex) => {
                const angle = getAngle(valueIndex);
                const { x, y } = getCoordinates(value, angle);
                return (
                  <circle
                    key={`point-${contactIndex}-${valueIndex}`}
                    cx={x}
                    cy={y}
                    r="4"
                    fill={contact.color}
                    className="hover:r-6 transition-all cursor-pointer"
                  >
                    <title>{`${contact.name} - ${metrics[valueIndex]}: ${Math.round(value)}`}</title>
                  </circle>
                );
              })}
            </g>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="p-4 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {normalizedData.map((contact, index) => (
            <div key={contact.id} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: contact.color }}
              />
              <span className="text-sm font-medium text-gray-900">{contact.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics Table */}
      <div className="p-4 border-t border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-2 font-semibold text-gray-900">Metric</th>
              {normalizedData.map((contact) => (
                <th key={contact.id} className="text-center py-2 px-2 font-semibold text-gray-900">
                  {contact.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, index) => (
              <tr key={metric} className="border-b border-gray-100">
                <td className="py-2 px-2 font-medium text-gray-700">{metric}</td>
                {normalizedData.map((contact) => (
                  <td key={contact.id} className="text-center py-2 px-2 text-gray-900">
                    <span className="font-semibold">{Math.round(contact.values[index])}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RadarChart;

