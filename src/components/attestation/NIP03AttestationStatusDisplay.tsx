/**
 * NIP-03 Attestation Status Display Component
 * Phase 2 Week 3 Day 10: UI Components for NIP-03 Attestation Display
 *
 * Displays attestation status after registration completion with event IDs,
 * Bitcoin block information, and PKARR address.
 *
 * @compliance Privacy-first, zero-knowledge, no PII exposure
 */

import React, { useCallback } from 'react';
import {
  CheckCircle,
  AlertCircle,
  Copy,
  ExternalLink,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { clientConfig } from '../../config/env.client';
import { showToast } from '../../services/toastService';
import { NIP03Attestation } from '../../types/attestation';

interface NIP03AttestationStatusDisplayProps {
  attestation: NIP03Attestation;
  onDetailsClick?: () => void;
  compact?: boolean;
  className?: string;
}

const NIP03AttestationStatusDisplayComponent: React.FC<
  NIP03AttestationStatusDisplayProps
> = ({ attestation, onDetailsClick, compact = false, className = '' }) => {
  // Check feature flags
  const nip03Enabled = clientConfig.flags.nip03Enabled || false;
  const nip03IdentityCreationEnabled = clientConfig.flags.nip03IdentityCreationEnabled || false;

  if (!nip03Enabled || !nip03IdentityCreationEnabled) {
    return null;
  }

  // Copy to clipboard
  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast.success(`${label} copied to clipboard`, { duration: 2000 });
  }, []);

  // Truncate ID for display
  const truncateId = (id: string, length: number = 16): string => {
    if (id.length <= length) return id;
    return `${id.slice(0, length / 2)}...${id.slice(-length / 2)}`;
  };

  // Get status badge
  const getStatusBadge = () => {
    switch (attestation.attestation_status) {
      case 'success':
        return (
          <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            Verified
          </div>
        );
      case 'failure':
        return (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
            <AlertCircle className="w-4 h-4" />
            Failed
          </div>
        );
      case 'skipped':
        return (
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
            <Shield className="w-4 h-4" />
            Skipped
          </div>
        );
      default:
        return null;
    }
  };

  if (compact) {
    return (
      <div className={`flex items-center justify-between p-3 bg-gray-50 rounded-lg ${className}`}>
        <div className="flex items-center gap-2">
          {attestation.attestation_status === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
          <span className="text-sm font-medium text-gray-900">
            Attestation {attestation.attestation_status === 'success' ? 'Verified' : 'Failed'}
          </span>
        </div>
        {onDetailsClick && (
          <button
            onClick={onDetailsClick}
            className="text-blue-600 hover:text-blue-700 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Attestation Status</h3>
        {getStatusBadge()}
      </div>

      {/* NIP-03 Event ID */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">NIP-03 Event ID</label>
        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
          <code className="flex-1 text-xs font-mono text-gray-600 break-all">
            {truncateId(attestation.nip03_event_id, 32)}
          </code>
          <button
            onClick={() => handleCopy(attestation.nip03_event_id, 'Event ID')}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
            title="Copy full event ID"
          >
            <Copy className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* SimpleProof Timestamp ID */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">SimpleProof Timestamp</label>
        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
          <code className="flex-1 text-xs font-mono text-gray-600 break-all">
            {truncateId(attestation.simpleproof_timestamp_id, 32)}
          </code>
          <button
            onClick={() => handleCopy(attestation.simpleproof_timestamp_id, 'Timestamp ID')}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
            title="Copy timestamp ID"
          >
            <Copy className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Bitcoin Block Information */}
      {attestation.bitcoin_block && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Bitcoin Block</label>
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-mono text-gray-600">Block #{attestation.bitcoin_block}</span>
            <a
              href={`https://mempool.space/block/${attestation.bitcoin_block}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto p-1 hover:bg-gray-200 rounded transition-colors"
              title="View on Mempool"
            >
              <ExternalLink className="w-4 h-4 text-blue-600" />
            </a>
          </div>
        </div>
      )}

      {/* Bitcoin Transaction */}
      {attestation.bitcoin_tx && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Bitcoin Transaction</label>
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
            <code className="flex-1 text-xs font-mono text-gray-600 break-all">
              {truncateId(attestation.bitcoin_tx, 32)}
            </code>
            <button
              onClick={() => handleCopy(attestation.bitcoin_tx!, 'Transaction Hash')}
              className="p-1 hover:bg-gray-200 rounded transition-colors"
              title="Copy transaction hash"
            >
              <Copy className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>
      )}

      {/* PKARR Address */}
      {attestation.pkarr_address && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">PKARR Address</label>
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
            <code className="flex-1 text-xs font-mono text-gray-600 break-all">
              {truncateId(attestation.pkarr_address, 32)}
            </code>
            <button
              onClick={() => handleCopy(attestation.pkarr_address!, 'PKARR Address')}
              className="p-1 hover:bg-gray-200 rounded transition-colors"
              title="Copy PKARR address"
            >
              <Copy className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {attestation.attestation_status === 'failure' && attestation.error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-900">Attestation Error</p>
            <p className="text-xs text-red-700 mt-1">{attestation.error}</p>
          </div>
        </div>
      )}

      {/* Details Button */}
      {onDetailsClick && (
        <button
          onClick={onDetailsClick}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
        >
          View Full Details
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default NIP03AttestationStatusDisplayComponent;

