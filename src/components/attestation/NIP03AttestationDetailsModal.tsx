/**
 * NIP-03 Attestation Details Modal Component
 * Phase 2 Week 3 Day 10: UI Components for NIP-03 Attestation Display
 *
 * Detailed modal showing complete attestation information including full attestation chain
 * visualization, OTS proof download, Nostr event viewer, and verification instructions.
 *
 * @compliance Privacy-first, zero-knowledge, no PII exposure
 */

import {
  AlertCircle,
  CheckCircle,
  Copy,
  Download,
  ExternalLink,
  Shield,
  X,
} from 'lucide-react';
import React, { useCallback } from 'react';
import { clientConfig } from '../../config/env.client';
import { showToast } from '../../services/toastService';
import { NIP03Attestation } from '../../types/attestation';

interface NIP03AttestationDetailsModalProps {
  attestation: NIP03Attestation;
  isOpen: boolean;
  onClose: () => void;
  onRetry?: () => Promise<void>;
}

const NIP03AttestationDetailsModalComponent: React.FC<
  NIP03AttestationDetailsModalProps
> = ({ attestation, isOpen, onClose, onRetry }) => {
  // Check feature flags
  const nip03Enabled = clientConfig.flags.nip03Enabled || false;
  const nip03IdentityCreationEnabled = clientConfig.flags.nip03IdentityCreationEnabled || false;

  if (!nip03Enabled || !nip03IdentityCreationEnabled || !isOpen) {
    return null;
  }

  // Copy to clipboard
  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        showToast.success(`${label} copied to clipboard`, { duration: 2000 });
      })
      .catch(() => {
        showToast.error(`Failed to copy ${label}`, { duration: 2000 });
      });
  }, []);

  // Download OTS proof
  const handleDownloadProof = useCallback(() => {
    const element = document.createElement('a');
    element.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(attestation.ots_proof)}`);
    element.setAttribute('download', `ots-proof-${attestation.id}.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showToast.success('OTS proof downloaded', { duration: 2000 });
  }, [attestation]);

  // Format timestamp
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-6 border-b bg-white">
          <h2 className="text-xl font-semibold text-gray-900">Attestation Details</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status */}
          <div className="flex items-center gap-3">
            {attestation.attestation_status === 'success' ? (
              <CheckCircle className="w-6 h-6 text-green-600" />
            ) : (
              <AlertCircle className="w-6 h-6 text-red-600" />
            )}
            <div>
              <p className="font-medium text-gray-900">
                {attestation.attestation_status === 'success' ? 'Verified' : 'Failed'}
              </p>
              <p className="text-sm text-gray-600">
                {formatDate(attestation.created_at)}
              </p>
            </div>
          </div>

          {/* Attestation Chain */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Attestation Chain</h3>
            <div className="space-y-2">
              {/* Kind:0 Event */}
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">Kind:0 Profile Event</p>
                  <code className="text-xs font-mono text-gray-600 break-all">
                    {attestation.kind0_event_id}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(attestation.kind0_event_id, 'Event ID')}
                  className="p-1 hover:bg-blue-100 rounded transition-colors flex-shrink-0"
                >
                  <Copy className="w-4 h-4 text-blue-600" />
                </button>
              </div>

              {/* SimpleProof Timestamp */}
              <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                <Shield className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">SimpleProof Timestamp</p>
                  <code className="text-xs font-mono text-gray-600 break-all">
                    {attestation.simpleproof_timestamp_id}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(attestation.simpleproof_timestamp_id, 'Timestamp ID')}
                  className="p-1 hover:bg-purple-100 rounded transition-colors flex-shrink-0"
                >
                  <Copy className="w-4 h-4 text-purple-600" />
                </button>
              </div>

              {/* NIP-03 Event */}
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                <Shield className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">NIP-03 Attestation Event</p>
                  <code className="text-xs font-mono text-gray-600 break-all">
                    {attestation.nip03_event_id}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(attestation.nip03_event_id, 'NIP-03 Event ID')}
                  className="p-1 hover:bg-green-100 rounded transition-colors flex-shrink-0"
                >
                  <Copy className="w-4 h-4 text-green-600" />
                </button>
              </div>
            </div>
          </div>

          {/* Bitcoin Information */}
          {attestation.bitcoin_block && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">Bitcoin Anchoring</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-600 font-medium">Block Number</p>
                  <p className="text-lg font-mono text-gray-900">#{attestation.bitcoin_block}</p>
                </div>
                {attestation.bitcoin_tx && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600 font-medium">Transaction</p>
                    <code className="text-xs font-mono text-gray-600 break-all">
                      {attestation.bitcoin_tx.slice(0, 16)}...
                    </code>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* OTS Proof */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">OTS Proof</h3>
            <div className="p-3 bg-gray-50 rounded-lg">
              <code className="text-xs font-mono text-gray-600 break-all block max-h-24 overflow-y-auto">
                {attestation.ots_proof}
              </code>
            </div>
            <button
              onClick={handleDownloadProof}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download OTS Proof
            </button>
          </div>

          {/* Verification Links */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Verification</h3>
            <div className="space-y-2">
              <a
                href={`https://opentimestamps.org/`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-blue-600 font-medium">Verify with OpenTimestamps</span>
              </a>
              {attestation.bitcoin_block && (
                <a
                  href={`https://mempool.space/block/${attestation.bitcoin_block}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-blue-600 font-medium">View Bitcoin Block</span>
                </a>
              )}
            </div>
          </div>

          {/* Error Message */}
          {attestation.attestation_status === 'failure' && attestation.error && (
            <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Error</p>
                <p className="text-xs text-red-700 mt-1">{attestation.error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex gap-3 p-6 border-t bg-white">
          {onRetry && attestation.attestation_status === 'failure' && (
            <button
              onClick={onRetry}
              className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
            >
              Retry Attestation
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default NIP03AttestationDetailsModalComponent;

