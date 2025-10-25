/**
 * Iroh Verification Status Component
 * Phase 2B-2 Week 2 Task 3: UI Components
 * 
 * Features:
 * - Display Iroh verification status with visual indicators
 * - Show node ID (truncated with copy button)
 * - Display relay URL and direct addresses
 * - Show last seen timestamp
 * - Cached status indicator
 * - Compact and detailed views
 * - Feature flag gated: VITE_IROH_ENABLED
 * 
 * @compliance Privacy-first, zero-knowledge, no PII display
 */

import { CheckCircle, Clock, Copy, Server, XCircle } from 'lucide-react';
import React, { useCallback } from 'react';
import { showToast } from '../../services/toastService';

interface IrohVerificationStatusProps {
  nodeId: string;
  isReachable: boolean;
  relayUrl?: string | null;
  directAddresses?: string[] | null;
  lastSeen?: number | null;
  cached?: boolean;
  compact?: boolean;
  showNodeId?: boolean;
  className?: string;
}

export const IrohVerificationStatus: React.FC<IrohVerificationStatusProps> = ({
  nodeId,
  isReachable,
  relayUrl = null,
  directAddresses = null,
  lastSeen = null,
  cached = false,
  compact = false,
  showNodeId = true,
  className = '',
}) => {
  // Check feature flag
  const irohEnabled = import.meta.env.VITE_IROH_ENABLED === 'true';

  // Copy node ID to clipboard
  const handleCopyNodeId = useCallback(() => {
    navigator.clipboard.writeText(nodeId);
    showToast.success('Node ID copied to clipboard', {
      duration: 2000,
    });
  }, [nodeId]);

  // Truncate node ID for display
  const truncateNodeId = useCallback((id: string, length: number = 12): string => {
    if (id.length <= length) return id;
    return `${id.slice(0, length / 2)}...${id.slice(-length / 2)}`;
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

  // Don't render if feature flag is disabled
  if (!irohEnabled) {
    return null;
  }

  // Compact view (for badges and inline displays)
  if (compact) {
    return (
      <div
        className={`inline-flex items-center space-x-2 px-2 py-1 rounded-md text-xs ${isReachable
            ? 'bg-green-500/20 text-green-300 border border-green-500/30'
            : 'bg-red-500/20 text-red-300 border border-red-500/30'
          } ${className}`}
        title={`Iroh DHT: ${isReachable ? 'Reachable' : 'Unreachable'}${cached ? ' (cached)' : ''}`}
        role="status"
        aria-label={`Iroh verification status: ${isReachable ? 'reachable' : 'unreachable'}`}
      >
        {isReachable ? (
          <CheckCircle className="h-3 w-3" aria-hidden="true" />
        ) : (
          <XCircle className="h-3 w-3" aria-hidden="true" />
        )}
        <span>Iroh DHT</span>
        {isReachable && <span className="text-green-400">✓</span>}
      </div>
    );
  }

  // Detailed view (for verification displays and contact details)
  return (
    <div
      className={`bg-white/10 backdrop-blur-sm rounded-lg p-4 border ${isReachable
          ? 'border-green-500/30 bg-green-500/5'
          : 'border-red-500/30 bg-red-500/5'
        } ${className}`}
      role="region"
      aria-label="Iroh verification details"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Server className={`h-5 w-5 ${isReachable ? 'text-green-400' : 'text-red-400'}`} aria-hidden="true" />
          <div>
            <h4 className="text-white font-semibold text-sm">Iroh DHT Verification</h4>
            <p className={`text-xs ${isReachable ? 'text-green-300' : 'text-red-300'}`}>
              {isReachable ? 'Node is reachable' : 'Node is unreachable'}
            </p>
          </div>
        </div>
        <div
          className={`px-2 py-1 rounded text-xs font-medium ${isReachable
              ? 'bg-green-500/20 text-green-300'
              : 'bg-red-500/20 text-red-300'
            }`}
          role="status"
          aria-live="polite"
        >
          {isReachable ? 'Reachable' : 'Unreachable'}
        </div>
      </div>

      {/* Node ID */}
      {showNodeId && (
        <div className="mb-3">
          <label className="block text-purple-200 text-xs font-medium mb-1">
            Node ID
          </label>
          <div className="flex items-center space-x-2">
            <code className="flex-1 px-3 py-2 bg-black/20 border border-white/20 rounded text-white text-xs font-mono break-all">
              {truncateNodeId(nodeId, 24)}
            </code>
            <button
              type="button"
              onClick={handleCopyNodeId}
              className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
              aria-label="Copy node ID"
              title="Copy full node ID"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Relay URL */}
      {relayUrl && (
        <div className="mb-3">
          <label className="block text-purple-200 text-xs font-medium mb-1">
            Relay URL
          </label>
          <div className="px-3 py-2 bg-black/20 border border-white/20 rounded">
            <p className="text-white text-xs font-mono break-all">{relayUrl}</p>
          </div>
        </div>
      )}

      {/* Direct Addresses */}
      {directAddresses && directAddresses.length > 0 && (
        <div className="mb-3">
          <label className="block text-purple-200 text-xs font-medium mb-1">
            Direct Addresses ({directAddresses.length})
          </label>
          <div className="space-y-1">
            {directAddresses.slice(0, 3).map((address, index) => (
              <div
                key={index}
                className="px-3 py-2 bg-black/20 border border-white/20 rounded"
              >
                <p className="text-white text-xs font-mono break-all">{address}</p>
              </div>
            ))}
            {directAddresses.length > 3 && (
              <p className="text-purple-300 text-xs px-3 py-1">
                +{directAddresses.length - 3} more addresses
              </p>
            )}
          </div>
        </div>
      )}

      {/* Last Seen */}
      {lastSeen && (
        <div className="flex items-center space-x-2 text-purple-200 text-xs">
          <Clock className="h-3 w-3" aria-hidden="true" />
          <span>Last seen: {formatTimestamp(lastSeen)}</span>
          {cached && (
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs">
              Cached
            </span>
          )}
        </div>
      )}

      {/* Info Message */}
      {!isReachable && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <p className="text-purple-200 text-xs">
            This node may be offline or behind a firewall. Iroh verification is optional and does not affect other verification methods.
          </p>
        </div>
      )}
    </div>
  );
};

export default IrohVerificationStatus;

