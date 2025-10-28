/**
 * SimpleProof Verification Status Component
 * Phase 2B-2 Day 10: SimpleProof UI Components - Part 1
 *
 * Features:
 * - Display SimpleProof blockchain verification status
 * - Show Bitcoin block number and transaction hash
 * - Display OTS proof with copy button
 * - Show verification timestamp
 * - Cached status indicator
 * - Compact and detailed views
 * - Feature flag gated: VITE_SIMPLEPROOF_ENABLED
 *
 * @compliance Privacy-first, zero-knowledge, no PII display
 */

import { AlertCircle, Clock, Copy, ExternalLink, Shield } from 'lucide-react';
import React, { useCallback } from 'react';
import { clientConfig } from '../../config/env.client';
import { withSentryErrorBoundary } from '../../lib/sentry';
import { showToast } from '../../services/toastService';

interface SimpleProofVerificationStatusProps {
  verified: boolean;
  otsProof?: string | null;
  bitcoinBlock?: number | null;
  bitcoinTx?: string | null;
  verifiedAt?: number | null;
  cached?: boolean;
  compact?: boolean;
  showProof?: boolean;
  className?: string;
}

const SimpleProofVerificationStatusComponent: React.FC<SimpleProofVerificationStatusProps> = ({
  verified,
  otsProof = null,
  bitcoinBlock = null,
  bitcoinTx = null,
  verifiedAt = null,
  cached = false,
  compact = false,
  showProof = true,
  className = '',
}) => {
  // Check feature flag
  const simpleproofEnabled = clientConfig.flags.simpleproofEnabled || false;

  // Copy OTS proof to clipboard
  const handleCopyProof = useCallback(() => {
    if (otsProof) {
      navigator.clipboard.writeText(otsProof);
      showToast.success('OTS proof copied to clipboard', {
        duration: 2000,
      });
    }
  }, [otsProof]);

  // Copy Bitcoin transaction hash to clipboard
  const handleCopyTxHash = useCallback(() => {
    if (bitcoinTx) {
      navigator.clipboard.writeText(bitcoinTx);
      showToast.success('Transaction hash copied to clipboard', {
        duration: 2000,
      });
    }
  }, [bitcoinTx]);

  // Truncate proof for display
  const truncateProof = useCallback((proof: string, length: number = 16): string => {
    if (proof.length <= length) return proof;
    return `${proof.slice(0, length / 2)}...${proof.slice(-length / 2)}`;
  }, []);

  // Format timestamp
  const formatTimestamp = useCallback((timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }, []);

  // Open Bitcoin transaction in block explorer
  const handleViewTx = useCallback(() => {
    if (bitcoinTx) {
      window.open(`https://mempool.space/tx/${bitcoinTx}`, '_blank', 'noopener,noreferrer');
    }
  }, [bitcoinTx]);

  // Don't render if feature flag is disabled
  if (!simpleproofEnabled) {
    return null;
  }

  // Compact view (for badges and inline displays)
  if (compact) {
    return (
      <div
        className={`inline-flex items-center space-x-2 px-2 py-1 rounded-md text-xs ${verified
          ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
          : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
          } ${className}`}
        title={`SimpleProof: ${verified ? 'Verified on Bitcoin' : 'Not verified'}${cached ? ' (cached)' : ''}`}
        role="status"
        aria-label={`SimpleProof verification status: ${verified ? 'verified' : 'not verified'}`}
      >
        {verified ? (
          <Shield className="h-3 w-3" aria-hidden="true" />
        ) : (
          <Clock className="h-3 w-3" aria-hidden="true" />
        )}
        <span>SimpleProof</span>
        {verified && <span className="text-orange-400">✓</span>}
      </div>
    );
  }

  // Detailed view (for verification displays and contact details)
  return (
    <div
      className={`bg-white/10 backdrop-blur-sm rounded-lg p-4 border ${verified
        ? 'border-orange-500/30 bg-orange-500/5'
        : 'border-gray-500/30 bg-gray-500/5'
        } ${className}`}
      role="region"
      aria-label="SimpleProof verification details"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Shield className={`h-5 w-5 ${verified ? 'text-orange-400' : 'text-gray-400'}`} aria-hidden="true" />
          <div>
            <h4 className="text-white font-semibold text-sm">SimpleProof Blockchain Verification</h4>
            <p className={`text-xs ${verified ? 'text-orange-300' : 'text-gray-300'}`}>
              {verified ? 'Verified on Bitcoin blockchain' : 'Pending blockchain verification'}
            </p>
          </div>
        </div>
        <div
          className={`px-2 py-1 rounded text-xs font-medium ${verified
            ? 'bg-orange-500/20 text-orange-300'
            : 'bg-gray-500/20 text-gray-300'
            }`}
          role="status"
          aria-live="polite"
        >
          {verified ? 'Verified' : 'Pending'}
        </div>
      </div>

      {/* Bitcoin Block */}
      {bitcoinBlock && (
        <div className="mb-3">
          <label className="block text-purple-200 text-xs font-medium mb-1">
            Bitcoin Block
          </label>
          <div className="px-3 py-2 bg-black/20 border border-white/20 rounded text-white text-sm font-mono">
            #{bitcoinBlock.toLocaleString()}
          </div>
        </div>
      )}

      {/* Bitcoin Transaction */}
      {bitcoinTx && (
        <div className="mb-3">
          <label className="block text-purple-200 text-xs font-medium mb-1">
            Bitcoin Transaction
          </label>
          <div className="flex items-center space-x-2">
            <code className="flex-1 px-3 py-2 bg-black/20 border border-white/20 rounded text-white text-xs font-mono break-all">
              {truncateProof(bitcoinTx, 24)}
            </code>
            <button
              type="button"
              onClick={handleCopyTxHash}
              className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
              title="Copy transaction hash"
              aria-label="Copy Bitcoin transaction hash to clipboard"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleViewTx}
              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              title="View on block explorer"
              aria-label="View transaction on block explorer"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* OTS Proof */}
      {showProof && otsProof && (
        <div className="mb-3">
          <label className="block text-purple-200 text-xs font-medium mb-1">
            OpenTimestamps Proof
          </label>
          <div className="flex items-center space-x-2">
            <code className="flex-1 px-3 py-2 bg-black/20 border border-white/20 rounded text-white text-xs font-mono break-all max-h-20 overflow-y-auto">
              {truncateProof(otsProof, 32)}
            </code>
            <button
              type="button"
              onClick={handleCopyProof}
              className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
              title="Copy OTS proof"
              aria-label="Copy OpenTimestamps proof to clipboard"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Verification Timestamp */}
      {verifiedAt && (
        <div className="flex items-center justify-between text-xs text-purple-200">
          <div className="flex items-center space-x-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            <span>Verified {formatTimestamp(verifiedAt)}</span>
          </div>
          {cached && (
            <span className="text-purple-300 italic" title="Result from cache">
              (cached)
            </span>
          )}
        </div>
      )}

      {/* Pending State */}
      {!verified && (
        <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-300">
          <p className="flex items-center space-x-2">
            <Clock className="h-4 w-4" aria-hidden="true" />
            <span>
              Blockchain verification is pending. This may take 10-60 minutes as the timestamp is anchored to the Bitcoin blockchain.
            </span>
          </p>
        </div>
      )}
    </div>
  );
};

// Wrap with Sentry error boundary for graceful error handling (skip in test environment)
export const SimpleProofVerificationStatus =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
    ? SimpleProofVerificationStatusComponent
    : withSentryErrorBoundary(
      SimpleProofVerificationStatusComponent,
      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">
            Verification status temporarily unavailable
          </p>
        </div>
      </div>
    );

