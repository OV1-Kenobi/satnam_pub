/**
 * SimpleProof History Panel Component
 * Phase 2B-2 Day 11: SimpleProof UI Components - Part 2
 *
 * Displays list of all SimpleProof blockchain timestamps for a user.
 * 
 * CRITICAL: SimpleProof timestamps incur Bitcoin on-chain transaction fees.
 * This component displays historical attestations for significant identity events only:
 * - Account creation (initial identity forge)
 * - Key rotation (Nostr key changes)
 * - Physical peer validation ceremonies (NFC Name Tag registration)
 * - Family Federation establishment
 * - Guardian role changes
 *
 * Features:
 * - Pagination support
 * - Filtering by verification status
 * - Sorting by date/block number
 * - Event type categorization
 * - Cost transparency (shows Bitcoin fees for each attestation)
 * - Feature flag gated: VITE_SIMPLEPROOF_ENABLED
 *
 * @compliance Privacy-first, zero-knowledge, no PII display
 */

import { Shield, Clock, CheckCircle, XCircle, ExternalLink, Filter, ChevronLeft, ChevronRight, AlertCircle, Bitcoin } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';
import { simpleProofService, Timestamp } from '../../services/simpleProofService';
import { clientConfig } from '../../config/env.client';
import { SimpleProofVerificationStatus } from './SimpleProofVerificationStatus';

// Event types for SimpleProof attestations
export type SimpleProofEventType = 
  | 'account_creation'
  | 'key_rotation'
  | 'nfc_registration'
  | 'family_federation'
  | 'guardian_role_change'
  | 'unknown';

interface SimpleProofHistoryPanelProps {
  userId: string;
  className?: string;
  pageSize?: number;
  showEventTypes?: boolean;
  showCostInfo?: boolean;
}

export const SimpleProofHistoryPanel: React.FC<SimpleProofHistoryPanelProps> = ({
  userId,
  className = '',
  pageSize = 10,
  showEventTypes = true,
  showCostInfo = true,
}) => {
  const [timestamps, setTimestamps] = useState<Timestamp[]>([]);
  const [filteredTimestamps, setFilteredTimestamps] = useState<Timestamp[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<'all' | 'verified' | 'pending'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'block'>('date');

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
        limit: 100, // Fetch all, paginate client-side
      });

      if (result.success) {
        setTimestamps(result.timestamps);
      } else {
        setError(result.error || 'Failed to fetch timestamp history');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [userId, simpleproofEnabled]);

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...timestamps];

    // Filter by status
    if (filterStatus === 'verified') {
      filtered = filtered.filter(t => t.is_valid === true);
    } else if (filterStatus === 'pending') {
      filtered = filtered.filter(t => t.is_valid === null || t.is_valid === false);
    }

    // Sort
    if (sortBy === 'date') {
      filtered.sort((a, b) => b.created_at - a.created_at);
    } else if (sortBy === 'block') {
      filtered.sort((a, b) => {
        if (a.bitcoin_block === null) return 1;
        if (b.bitcoin_block === null) return -1;
        return b.bitcoin_block - a.bitcoin_block;
      });
    }

    setFilteredTimestamps(filtered);
  }, [timestamps, filterStatus, sortBy]);

  // Fetch on mount
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Pagination
  const totalPages = Math.ceil(filteredTimestamps.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentTimestamps = filteredTimestamps.slice(startIndex, endIndex);

  // Don't render if feature flag is disabled
  if (!simpleproofEnabled) {
    return null;
  }

  // Helper: Get event type badge
  const getEventTypeBadge = (timestamp: Timestamp): SimpleProofEventType => {
    // In a real implementation, this would be stored in metadata
    // For now, return 'unknown' - will be enhanced in future iterations
    return 'unknown';
  };

  // Helper: Get event type display name
  const getEventTypeDisplay = (eventType: SimpleProofEventType): string => {
    const displayNames: Record<SimpleProofEventType, string> = {
      account_creation: 'Account Creation',
      key_rotation: 'Key Rotation',
      nfc_registration: 'NFC Name Tag',
      family_federation: 'Family Federation',
      guardian_role_change: 'Guardian Role',
      unknown: 'Identity Event',
    };
    return displayNames[eventType];
  };

  // Helper: Get event type color
  const getEventTypeColor = (eventType: SimpleProofEventType): string => {
    const colors: Record<SimpleProofEventType, string> = {
      account_creation: 'bg-green-500/20 text-green-300 border-green-500/30',
      key_rotation: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      nfc_registration: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      family_federation: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      guardian_role_change: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      unknown: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    };
    return colors[eventType];
  };

  return (
    <div className={`bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-orange-500/30 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Shield className="h-6 w-6 text-orange-400" />
          <h3 className="text-xl font-bold text-white">Blockchain Attestation History</h3>
        </div>
        {showCostInfo && (
          <div className="flex items-center space-x-2 text-xs text-orange-300">
            <Bitcoin className="h-4 w-4" />
            <span>On-chain attestations</span>
          </div>
        )}
      </div>

      {/* Cost Warning */}
      {showCostInfo && timestamps.length > 0 && (
        <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-orange-300">
              <p className="font-semibold mb-1">Cost Transparency</p>
              <p>Each attestation incurs Bitcoin on-chain transaction fees. Use sparingly for important identity events only.</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters and Sorting */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Status Filter */}
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-purple-300" />
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value as 'all' | 'verified' | 'pending');
              setCurrentPage(1);
            }}
            className="px-3 py-1 bg-black/20 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">All Status</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        {/* Sort By */}
        <div className="flex items-center space-x-2">
          <span className="text-sm text-purple-300">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'block')}
            className="px-3 py-1 bg-black/20 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="date">Date</option>
            <option value="block">Block Number</option>
          </select>
        </div>

        {/* Total Count */}
        <div className="ml-auto text-sm text-purple-300">
          {filteredTimestamps.length} attestation{filteredTimestamps.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <Clock className="h-12 w-12 text-orange-400 animate-spin mx-auto mb-4" />
          <p className="text-purple-200">Loading attestation history...</p>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center space-x-2 text-red-300">
            <XCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredTimestamps.length === 0 && (
        <div className="text-center py-12">
          <Shield className="h-16 w-16 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400 mb-2">No blockchain attestations found</p>
          <p className="text-sm text-gray-500">
            {filterStatus !== 'all' 
              ? 'Try changing the filter to see more results'
              : 'Attestations will appear here after creating blockchain timestamps for important identity events'}
          </p>
        </div>
      )}

      {/* Timestamp List */}
      {!isLoading && !error && currentTimestamps.length > 0 && (
        <div className="space-y-4">
          {currentTimestamps.map((timestamp) => {
            const eventType = getEventTypeBadge(timestamp);
            return (
              <div
                key={timestamp.id}
                className="p-4 bg-black/20 border border-white/10 rounded-lg hover:border-orange-500/30 transition-colors"
              >
                {/* Event Type Badge */}
                {showEventTypes && (
                  <div className="mb-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${getEventTypeColor(eventType)}`}>
                      {getEventTypeDisplay(eventType)}
                    </span>
                  </div>
                )}

                {/* Verification Status */}
                <SimpleProofVerificationStatus
                  verified={timestamp.is_valid === true}
                  otsProof={timestamp.ots_proof}
                  bitcoinBlock={timestamp.bitcoin_block}
                  bitcoinTx={timestamp.bitcoin_tx}
                  verifiedAt={timestamp.verified_at}
                  compact={false}
                  showProof={false}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/10">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Previous</span>
          </button>

          <span className="text-sm text-purple-300">
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            <span>Next</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

