/**
 * SimpleProof Analytics Dashboard Component
 * Phase 2B-2 Day 12: SimpleProof Analytics Dashboard
 * Phase 2B-2 Day 15: Enhanced with error rate tracking, response time charts, cache hit rate, rate limit usage, and export functionality
 *
 * CRITICAL: Displays cost analysis and usage metrics for SimpleProof blockchain attestations.
 * Reinforces cost awareness by prominently showing total Bitcoin fees spent.
 *
 * Features:
 * - Cost analysis dashboard (total fees, average fee, cost by event type, trends)
 * - Attestation metrics (total, success rate, event type breakdown, trends)
 * - Error rate tracking with color-coded visualization
 * - Average response time charts (timestamp creation, verification)
 * - Cache hit rate visualization
 * - Rate limit usage tracking with progress bars
 * - Time range filtering (7 days, 30 days, 90 days, all time)
 * - Export functionality (CSV and JSON download)
 * - Visual charts for trends and distributions
 * - Feature flag gated: VITE_SIMPLEPROOF_ENABLED
 *
 * @compliance Privacy-first, zero-knowledge, no PII display
 */

import { AlertCircle, BarChart3, Bitcoin, Calendar, Clock, Database, DollarSign, Download, FileJson, Gauge, Shield, TrendingUp } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { clientConfig } from '../../config/env.client';
import { withSentryErrorBoundary } from '../../lib/sentry';
import { simpleProofService, Timestamp } from '../../services/simpleProofService';

// Event types for SimpleProof attestations
export type SimpleProofEventType =
  | 'account_creation'
  | 'key_rotation'
  | 'nfc_registration'
  | 'family_federation'
  | 'guardian_role_change'
  | 'unknown';

export type TimeRange = '7d' | '30d' | '90d' | 'all';

interface CostAnalytics {
  totalFeeSats: number;
  totalFeeUSD: number;
  averageFeeSats: number;
  averageFeeUSD: number;
  costByEventType: Record<SimpleProofEventType, number>;
  monthlyCostTrend: Array<{ month: string; sats: number }>;
}

interface AttestationMetrics {
  totalAttestations: number;
  verifiedCount: number;
  pendingCount: number;
  failedCount: number;
  successRate: number;
  eventTypeBreakdown: Record<SimpleProofEventType, number>;
  dailyTrend: Array<{ date: string; count: number }>;
}

// Phase 2B-2 Day 15: New interfaces for enhanced metrics
interface ErrorRateMetrics {
  errorRate: number; // Percentage
  totalErrors: number;
  totalOperations: number;
  errorTrend: Array<{ date: string; rate: number }>;
}

interface ResponseTimeMetrics {
  timestamp: {
    average: number;
    min: number;
    max: number;
    p95: number;
  };
  verification: {
    average: number;
    min: number;
    max: number;
    p95: number;
  };
  trend: Array<{ date: string; avgTimestamp: number; avgVerification: number }>;
}

interface CacheMetrics {
  hitRate: number; // Percentage
  totalHits: number;
  totalMisses: number;
  totalRequests: number;
  trend: Array<{ date: string; hitRate: number }>;
}

interface RateLimitMetrics {
  timestamp: {
    current: number;
    limit: number;
    percentage: number;
    resetTime: number | null;
  };
  verification: {
    current: number;
    limit: number;
    percentage: number;
    resetTime: number | null;
  };
}

type ExportFormat = 'csv' | 'json';

/**
 * Sanitize CSV cell to prevent formula injection and escape quotes
 * Prevents CSV injection attacks by prefixing dangerous characters with single quote
 * @param value - The cell value to sanitize
 * @returns Properly escaped CSV cell value
 */
const sanitizeCSVCell = (value: string | number | undefined): string => {
  if (value === undefined || value === null) return '';
  const str = String(value);

  // Prevent CSV injection: prefix dangerous characters with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    return `"'${str.replace(/"/g, '""')}"`;
  }

  // Escape internal quotes by doubling them, and wrap in quotes if needed
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

interface SimpleProofAnalyticsDashboardProps {
  /**
   * PRIVACY REQUIREMENT: userId MUST be hashed before passing to this component
   * - Use auth.user?.hashed_npub if available
   * - Or use hashUserData() from lib/security/privacy-hashing.js
   * - NEVER pass raw user IDs, UUIDs, npubs, or other PII
   */
  userId: string;
  className?: string;
  defaultTimeRange?: TimeRange;
}

const SimpleProofAnalyticsDashboardComponent: React.FC<SimpleProofAnalyticsDashboardProps> = ({
  userId,
  className = '',
  defaultTimeRange = '30d',
}) => {
  const [timestamps, setTimestamps] = useState<Timestamp[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>(defaultTimeRange);

  // Phase 2B-2 Day 15: New state for enhanced metrics
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');

  // Check feature flag
  const simpleproofEnabled = clientConfig.flags.simpleproofEnabled || false;

  // Fetch timestamp history
  const fetchHistory = useCallback(async () => {
    if (!simpleproofEnabled || !userId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await simpleProofService.getTimestampHistory({
        user_id: userId,
        limit: 1000, // Fetch all for analytics
      });

      if (result.success) {
        setTimestamps(result.timestamps);
      } else {
        setError(result.error || 'Failed to fetch analytics data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [userId, simpleproofEnabled]);

  // Fetch on mount and when timeRange changes
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Filter timestamps by time range
  const filteredTimestamps = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const ranges: Record<TimeRange, number> = {
      '7d': 7 * 24 * 60 * 60,
      '30d': 30 * 24 * 60 * 60,
      '90d': 90 * 24 * 60 * 60,
      'all': Infinity,
    };

    const cutoff = now - ranges[timeRange];
    return timestamps.filter(t => t.created_at >= cutoff);
  }, [timestamps, timeRange]);

  // Calculate cost analytics
  const costAnalytics = useMemo((): CostAnalytics => {
    const defaultFeeSats = 500; // Default estimate if not stored
    // TODO: Fetch real-time BTC/USD rate or display sats only
    // WARNING: Hardcoded approximation - may be inaccurate due to Bitcoin price volatility
    const satsToUSD = 0.0005; // Hardcoded approximation - may be inaccurate

    const totalFeeSats = filteredTimestamps.length * defaultFeeSats;
    const totalFeeUSD = totalFeeSats * satsToUSD;
    const averageFeeSats = filteredTimestamps.length > 0 ? totalFeeSats / filteredTimestamps.length : 0;
    const averageFeeUSD = averageFeeSats * satsToUSD;

    // Cost by event type (placeholder - would be enhanced with actual event type data)
    const costByEventType: Record<SimpleProofEventType, number> = {
      account_creation: 0,
      key_rotation: 0,
      nfc_registration: 0,
      family_federation: 0,
      guardian_role_change: 0,
      unknown: totalFeeSats,
    };

    // Monthly cost trend (simplified - group by month)
    const monthlyCostTrend: Array<{ month: string; sats: number }> = [];
    const monthlyGroups = new Map<string, number>();

    filteredTimestamps.forEach(t => {
      const date = new Date(t.created_at * 1000);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyGroups.set(monthKey, (monthlyGroups.get(monthKey) || 0) + defaultFeeSats);
    });

    monthlyGroups.forEach((sats, month) => {
      monthlyCostTrend.push({ month, sats });
    });

    monthlyCostTrend.sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalFeeSats,
      totalFeeUSD,
      averageFeeSats,
      averageFeeUSD,
      costByEventType,
      monthlyCostTrend,
    };
  }, [filteredTimestamps]);

  // Calculate attestation metrics
  const attestationMetrics = useMemo((): AttestationMetrics => {
    const totalAttestations = filteredTimestamps.length;
    const verifiedCount = filteredTimestamps.filter(t => t.is_valid === true).length;
    const pendingCount = filteredTimestamps.filter(t => t.is_valid === null).length;
    const failedCount = filteredTimestamps.filter(t => t.is_valid === false).length;
    const successRate = totalAttestations > 0 ? (verifiedCount / totalAttestations) * 100 : 0;

    // Event type breakdown (placeholder)
    const eventTypeBreakdown: Record<SimpleProofEventType, number> = {
      account_creation: 0,
      key_rotation: 0,
      nfc_registration: 0,
      family_federation: 0,
      guardian_role_change: 0,
      unknown: totalAttestations,
    };

    // Daily trend (simplified - group by day)
    const dailyTrend: Array<{ date: string; count: number }> = [];
    const dailyGroups = new Map<string, number>();

    filteredTimestamps.forEach(t => {
      const date = new Date(t.created_at * 1000);
      const dateKey = date.toISOString().split('T')[0];
      dailyGroups.set(dateKey, (dailyGroups.get(dateKey) || 0) + 1);
    });

    dailyGroups.forEach((count, date) => {
      dailyTrend.push({ date, count });
    });

    dailyTrend.sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalAttestations,
      verifiedCount,
      pendingCount,
      failedCount,
      successRate,
      eventTypeBreakdown,
      dailyTrend,
    };
  }, [filteredTimestamps]);

  // Phase 2B-2 Day 15: Calculate error rate metrics
  const errorRateMetrics = useMemo((): ErrorRateMetrics => {
    const totalOperations = filteredTimestamps.length;
    const totalErrors = filteredTimestamps.filter(t => t.is_valid === false).length;
    const errorRate = totalOperations > 0 ? (totalErrors / totalOperations) * 100 : 0;

    // Error trend by day
    const errorTrend: Array<{ date: string; rate: number }> = [];
    const dailyGroups = new Map<string, { total: number; errors: number }>();

    filteredTimestamps.forEach(t => {
      const date = new Date(t.created_at * 1000);
      const dateKey = date.toISOString().split('T')[0];
      const existing = dailyGroups.get(dateKey) || { total: 0, errors: 0 };
      existing.total += 1;
      if (t.is_valid === false) existing.errors += 1;
      dailyGroups.set(dateKey, existing);
    });

    dailyGroups.forEach((stats, date) => {
      const rate = stats.total > 0 ? (stats.errors / stats.total) * 100 : 0;
      errorTrend.push({ date, rate });
    });

    errorTrend.sort((a, b) => a.date.localeCompare(b.date));

    return { errorRate, totalErrors, totalOperations, errorTrend };
  }, [filteredTimestamps]);

  // Phase 3: Calculate response time metrics from real performance data
  // Uses actual performance_ms values stored in database
  const responseTimeMetrics = useMemo((): ResponseTimeMetrics => {
    // Extract actual performance metrics from timestamps
    const performanceTimes = filteredTimestamps
      .map(t => (t as any).performance_ms)
      .filter((ms): ms is number => ms !== null && ms !== undefined && ms > 0);

    const calculateStats = (times: number[]) => {
      if (times.length === 0) return { average: 0, min: 0, max: 0, p95: 0 };
      const sorted = [...times].sort((a, b) => a - b);
      const average = times.reduce((sum, t) => sum + t, 0) / times.length;
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const p95Index = Math.floor(sorted.length * 0.95);
      const p95 = sorted[p95Index] || max;
      return { average, min, max, p95 };
    };

    const stats = calculateStats(performanceTimes);

    // Build trend data by grouping performance metrics by date
    const trend: Array<{ date: string; avgTimestamp: number; avgVerification: number }> = [];
    const dailyGroups = new Map<string, number[]>();

    filteredTimestamps.forEach(t => {
      const performanceMs = (t as any).performance_ms;
      if (performanceMs && performanceMs > 0) {
        const date = new Date(t.created_at * 1000);
        const dateKey = date.toISOString().split('T')[0];
        const existing = dailyGroups.get(dateKey) || [];
        existing.push(performanceMs);
        dailyGroups.set(dateKey, existing);
      }
    });

    dailyGroups.forEach((times, date) => {
      const avgTimestamp = times.reduce((sum, t) => sum + t, 0) / times.length;
      // For now, verification time is same as timestamp time (single operation)
      // In future, could be split into separate metrics if needed
      trend.push({ date, avgTimestamp, avgVerification: avgTimestamp });
    });

    trend.sort((a, b) => a.date.localeCompare(b.date));

    return {
      timestamp: stats,
      verification: stats, // Same as timestamp for now (single operation)
      trend,
    };
  }, [filteredTimestamps]);

  // Phase 2B-2 Day 15: Calculate cache metrics
  // CRITICAL: Real cache metrics not yet available
  // TODO: Integrate with actual SimpleProofCache metrics tracking
  // TODO: Add cache_hits and cache_misses columns to simpleproof_timestamps table
  const cacheMetrics = useMemo((): CacheMetrics => {
    // Return zero metrics with no data available
    // This prevents misleading users with fake cache data
    const totalRequests = filteredTimestamps.length;

    return {
      hitRate: 0,
      totalHits: 0,
      totalMisses: 0,
      totalRequests,
      trend: [], // No trend data available without real metrics
    };
  }, [filteredTimestamps]);

  // Phase 2B-2 Day 15: Calculate rate limit metrics
  // CRITICAL: Real rate limit data not yet available
  // TODO: Integrate with actual rate limiter from netlify/functions/utils/rate-limiter.js
  // TODO: Add rate_limit_tracking table to store actual rate limit usage
  const rateLimitMetrics = useMemo((): RateLimitMetrics => {
    // Return zero metrics with no data available
    // This prevents misleading users with fake rate limit data
    const now = Date.now();

    return {
      timestamp: {
        current: 0,
        limit: 10, // From rate limiter config
        percentage: 0,
        resetTime: now + (3600000 - (now % 3600000)), // Next hour
      },
      verification: {
        current: 0,
        limit: 100, // From rate limiter config
        percentage: 0,
        resetTime: now + (3600000 - (now % 3600000)), // Next hour
      },
    };
  }, []);

  // Phase 2B-2 Day 15: Enhanced export function with JSON support
  const handleExport = useCallback(() => {
    if (exportFormat === 'csv') {
      // CSV Export with security hardening and data integrity warnings
      const headers = [
        'Timestamp ID',
        'Created At',
        'Bitcoin Block',
        'Bitcoin TX',
        'Verified',
        'Estimated Fee (sats)',
        'Error Rate (%)',
        'Cache Hit Rate (%)',
      ];

      const rows = filteredTimestamps.map(t => [
        sanitizeCSVCell(t.id),
        sanitizeCSVCell(new Date(t.created_at * 1000).toISOString()),
        sanitizeCSVCell(t.bitcoin_block?.toString() || 'N/A'),
        sanitizeCSVCell(t.bitcoin_tx || 'N/A'),
        sanitizeCSVCell(t.is_valid === true ? 'Yes' : t.is_valid === false ? 'Failed' : 'Pending'),
        sanitizeCSVCell('500'), // Estimated fee
        sanitizeCSVCell(errorRateMetrics.errorRate.toFixed(2)),
        sanitizeCSVCell(cacheMetrics.hitRate.toFixed(2)),
      ]);

      // Build CSV with headers and data rows
      const csvLines: string[] = [
        // Actual headers
        headers.map(h => sanitizeCSVCell(h)).join(','),
        // Data rows
        ...rows.map(row => row.join(',')),
      ];

      const csvContent = csvLines.join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `simpleproof-analytics-${timeRange}-${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      // JSON Export
      const exportData = {
        exportedAt: new Date().toISOString(),
        timeRange,
        summary: {
          totalAttestations: attestationMetrics.totalAttestations,
          successRate: attestationMetrics.successRate,
          errorRate: errorRateMetrics.errorRate,
          cacheHitRate: cacheMetrics.hitRate,
        },
        costAnalytics,
        attestationMetrics,
        errorRateMetrics,
        responseTimeMetrics,
        cacheMetrics,
        rateLimitMetrics,
        timestamps: filteredTimestamps.map(t => ({
          id: t.id,
          createdAt: new Date(t.created_at * 1000).toISOString(),
          bitcoinBlock: t.bitcoin_block,
          bitcoinTx: t.bitcoin_tx,
          isValid: t.is_valid,
        })),
      };

      const jsonContent = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `simpleproof-analytics-${timeRange}-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
  }, [exportFormat, filteredTimestamps, timeRange, costAnalytics, attestationMetrics, errorRateMetrics, responseTimeMetrics, cacheMetrics, rateLimitMetrics]);

  // Don't render if feature flag is disabled
  if (!simpleproofEnabled) {
    return null;
  }

  return (
    <div className={`bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-orange-500/30 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <BarChart3 className="h-6 w-6 text-orange-400" />
          <h2 className="text-2xl font-bold text-white">SimpleProof Analytics</h2>
        </div>
        <div className="flex items-center space-x-3">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="px-3 py-2 bg-black/20 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>

          {/* Export Format Selector */}
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
            className="px-3 py-2 bg-black/20 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="csv">CSV Format</option>
            <option value="json">JSON Format</option>
          </select>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={filteredTimestamps.length === 0}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            {exportFormat === 'csv' ? <Download className="h-4 w-4" /> : <FileJson className="h-4 w-4" />}
            <span>Export {exportFormat.toUpperCase()}</span>
          </button>
        </div>
      </div>

      {/* Cost Warning Banner */}
      <div className="mb-6 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
        <div className="flex items-start space-x-2">
          <AlertCircle className="h-5 w-5 text-orange-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-orange-300">
            <p className="font-semibold mb-1">Cost Transparency</p>
            <p>
              SimpleProof creates permanent Bitcoin blockchain records. Each attestation incurs on-chain transaction fees.
              Use sparingly for important identity events only.
            </p>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <BarChart3 className="h-12 w-12 text-orange-400 animate-pulse mx-auto mb-4" />
          <p className="text-purple-200">Loading analytics...</p>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center space-x-2 text-red-300">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Analytics Content */}
      {!isLoading && !error && (
        <div className="space-y-6">
          {/* Cost Analytics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Cost (Sats) */}
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <Bitcoin className="h-5 w-5 text-orange-400" />
                <span className="text-xs text-orange-300">Total Cost</span>
              </div>
              <div className="text-2xl font-bold text-white mb-1">
                {costAnalytics.totalFeeSats.toLocaleString()} sats
              </div>
              <div className="text-xs text-orange-300/70">
                ≈ ${costAnalytics.totalFeeUSD.toFixed(2)} USD
              </div>
            </div>

            {/* Average Cost */}
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="h-5 w-5 text-purple-400" />
                <span className="text-xs text-purple-300">Avg Cost</span>
              </div>
              <div className="text-2xl font-bold text-white mb-1">
                {Math.round(costAnalytics.averageFeeSats).toLocaleString()} sats
              </div>
              <div className="text-xs text-purple-300/70">
                ≈ ${costAnalytics.averageFeeUSD.toFixed(2)} USD
              </div>
            </div>

            {/* Total Attestations */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <Shield className="h-5 w-5 text-blue-400" />
                <span className="text-xs text-blue-300">Total Attestations</span>
              </div>
              <div className="text-2xl font-bold text-white mb-1">
                {attestationMetrics.totalAttestations}
              </div>
              <div className="text-xs text-blue-300/70">
                {attestationMetrics.verifiedCount} verified
              </div>
            </div>

            {/* Success Rate */}
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="h-5 w-5 text-green-400" />
                <span className="text-xs text-green-300">Success Rate</span>
              </div>
              <div className="text-2xl font-bold text-white mb-1">
                {attestationMetrics.successRate.toFixed(1)}%
              </div>
              <div className="text-xs text-green-300/70">
                {attestationMetrics.pendingCount} pending
              </div>
            </div>
          </div>

          {/* Phase 2B-2 Day 15: New Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Error Rate */}
            <div className={`border rounded-lg p-4 ${errorRateMetrics.errorRate < 1 ? 'bg-green-500/10 border-green-500/30' :
              errorRateMetrics.errorRate < 5 ? 'bg-yellow-500/10 border-yellow-500/30' :
                'bg-red-500/10 border-red-500/30'
              }`}>
              <div className="flex items-center justify-between mb-2">
                <AlertCircle className={`h-5 w-5 ${errorRateMetrics.errorRate < 1 ? 'text-green-400' :
                  errorRateMetrics.errorRate < 5 ? 'text-yellow-400' :
                    'text-red-400'
                  }`} />
                <span className={`text-xs ${errorRateMetrics.errorRate < 1 ? 'text-green-300' :
                  errorRateMetrics.errorRate < 5 ? 'text-yellow-300' :
                    'text-red-300'
                  }`}>Error Rate</span>
              </div>
              <div className="text-2xl font-bold text-white mb-1">
                {errorRateMetrics.errorRate.toFixed(2)}%
              </div>
              <div className={`text-xs ${errorRateMetrics.errorRate < 1 ? 'text-green-300/70' :
                errorRateMetrics.errorRate < 5 ? 'text-yellow-300/70' :
                  'text-red-300/70'
                }`}>
                {errorRateMetrics.totalErrors} / {errorRateMetrics.totalOperations} failed
              </div>
            </div>

            {/* Average Response Time */}
            <div className={`border rounded-lg p-4 ${responseTimeMetrics.timestamp.average === 0
              ? 'bg-gray-500/10 border-gray-500/30'
              : responseTimeMetrics.timestamp.average < 3000
                ? 'bg-green-500/10 border-green-500/30'
                : responseTimeMetrics.timestamp.average < 10000
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}>
              <div className="flex items-center justify-between mb-2">
                <Clock className={`h-5 w-5 ${responseTimeMetrics.timestamp.average === 0
                  ? 'text-gray-400'
                  : responseTimeMetrics.timestamp.average < 3000
                    ? 'text-green-400'
                    : responseTimeMetrics.timestamp.average < 10000
                      ? 'text-yellow-400'
                      : 'text-red-400'
                  }`} />
                <span className={`text-xs ${responseTimeMetrics.timestamp.average === 0
                  ? 'text-gray-300'
                  : responseTimeMetrics.timestamp.average < 3000
                    ? 'text-green-300'
                    : responseTimeMetrics.timestamp.average < 10000
                      ? 'text-yellow-300'
                      : 'text-red-300'
                  }`}>Avg Response Time</span>
              </div>
              <div className="text-2xl font-bold text-white mb-1">
                {responseTimeMetrics.timestamp.average === 0
                  ? 'N/A'
                  : `${(responseTimeMetrics.timestamp.average / 1000).toFixed(2)}s`}
              </div>
              <div className={`text-xs ${responseTimeMetrics.timestamp.average === 0
                ? 'text-gray-300/70'
                : responseTimeMetrics.timestamp.average < 3000
                  ? 'text-green-300/70'
                  : responseTimeMetrics.timestamp.average < 10000
                    ? 'text-yellow-300/70'
                    : 'text-red-300/70'
                }`}>
                {responseTimeMetrics.timestamp.average === 0
                  ? 'No performance data available'
                  : `P95: ${(responseTimeMetrics.timestamp.p95 / 1000).toFixed(2)}s${responseTimeMetrics.timestamp.average >= 10000 ? ' ⚠️' : ''
                  }`}
              </div>
            </div>

            {/* Cache Hit Rate */}
            <div className="bg-gray-500/10 border border-gray-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <Database className="h-5 w-5 text-gray-400" />
                <span className="text-xs text-gray-300">Cache Hit Rate</span>
              </div>
              <div className="text-2xl font-bold text-white mb-1">
                N/A
              </div>
              <div className="text-xs text-gray-300/70">
                No cache metrics available
              </div>
            </div>

            {/* Rate Limit Usage */}
            <div className="bg-gray-500/10 border border-gray-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <Gauge className="h-5 w-5 text-gray-400" />
                <span className="text-xs text-gray-300">Rate Limit</span>
              </div>
              <div className="text-2xl font-bold text-white mb-1">
                N/A
              </div>
              <div className="text-xs text-gray-300/70">
                No rate limit data available
              </div>
              {/* Progress bar */}
              <div className="mt-2 w-full bg-black/30 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all bg-gray-500"
                  style={{ width: '0%' }}
                />
              </div>
            </div>
          </div>

          {/* Monthly Cost Trend Chart */}
          {costAnalytics.monthlyCostTrend.length > 0 && (
            <div className="bg-black/20 border border-white/10 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-orange-400" />
                <span>Monthly Cost Trend</span>
              </h3>
              <div className="space-y-3">
                {costAnalytics.monthlyCostTrend.map((item, idx) => {
                  const maxSats = Math.max(...costAnalytics.monthlyCostTrend.map(i => i.sats));
                  const widthPercent = maxSats > 0 ? (item.sats / maxSats) * 100 : 0;
                  return (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-purple-300">{item.month}</span>
                        <span className="text-sm font-medium text-orange-400">
                          {item.sats.toLocaleString()} sats
                        </span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-orange-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${widthPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Attestation Status Breakdown */}
          <div className="bg-black/20 border border-white/10 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-purple-400" />
              <span>Attestation Status</span>
            </h3>
            <div className="space-y-3">
              {/* Verified */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-green-300">Verified</span>
                  <span className="text-sm font-medium text-white">
                    {attestationMetrics.verifiedCount} ({attestationMetrics.totalAttestations > 0
                      ? ((attestationMetrics.verifiedCount / attestationMetrics.totalAttestations) * 100).toFixed(1)
                      : 0}%)
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${attestationMetrics.totalAttestations > 0
                        ? (attestationMetrics.verifiedCount / attestationMetrics.totalAttestations) * 100
                        : 0}%`
                    }}
                  />
                </div>
              </div>

              {/* Pending */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-yellow-300">Pending</span>
                  <span className="text-sm font-medium text-white">
                    {attestationMetrics.pendingCount} ({attestationMetrics.totalAttestations > 0
                      ? ((attestationMetrics.pendingCount / attestationMetrics.totalAttestations) * 100).toFixed(1)
                      : 0}%)
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-yellow-500 h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${attestationMetrics.totalAttestations > 0
                        ? (attestationMetrics.pendingCount / attestationMetrics.totalAttestations) * 100
                        : 0}%`
                    }}
                  />
                </div>
              </div>

              {/* Failed */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-red-300">Failed</span>
                  <span className="text-sm font-medium text-white">
                    {attestationMetrics.failedCount} ({attestationMetrics.totalAttestations > 0
                      ? ((attestationMetrics.failedCount / attestationMetrics.totalAttestations) * 100).toFixed(1)
                      : 0}%)
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${attestationMetrics.totalAttestations > 0
                        ? (attestationMetrics.failedCount / attestationMetrics.totalAttestations) * 100
                        : 0}%`
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Empty State */}
          {filteredTimestamps.length === 0 && (
            <div className="text-center py-12">
              <Shield className="h-16 w-16 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400 mb-2">No attestations found for this time range</p>
              <p className="text-sm text-gray-500">
                Try selecting a different time range or create your first blockchain attestation
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Wrap with Sentry error boundary for graceful error handling (skip in test environment)
export const SimpleProofAnalyticsDashboard =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
    ? SimpleProofAnalyticsDashboardComponent
    : withSentryErrorBoundary(
      SimpleProofAnalyticsDashboardComponent,
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-red-900 mb-1 text-lg">
              Analytics Dashboard Temporarily Unavailable
            </h3>
            <p className="text-sm text-red-700 mb-3">
              Unable to load analytics data. Your attestations are safe and this is only a display issue.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );

