/**
 * Manual Attestation Modal Component
 * Allows users to create new timestamps for custom events
 * Supports Bitcoin-anchored timestamping (OpenTimestamps) and Iroh verification methods
 *
 * @compliance Privacy-first, zero-knowledge, no PII storage
 */

import React, { useState } from 'react';
import { X, Loader, CheckCircle, AlertCircle } from 'lucide-react';
import { createAttestation, AttestationEventType } from '../../lib/attestation-manager';
import { showToast } from '../../services/toastService';

type ManualAttestationEventType =
  | AttestationEventType
  | 'profile_update'
  | 'custom_note'
  | 'document_hash'
  | 'profile_snapshot';


interface ManualAttestationModalProps {
  isOpen: boolean;
  onClose: () => void;
  verificationId: string;
  onSuccess?: () => void;
}

export const ManualAttestationModal: React.FC<ManualAttestationModalProps> = ({
  isOpen,
  onClose,
  verificationId,
  onSuccess,
}) => {
  const [eventType, setEventType] = useState<ManualAttestationEventType>('custom_note');
  const [metadata, setMetadata] = useState('');
  const [includeSimpleproof, setIncludeSimpleproof] = useState(true);
  const [includeIroh, setIncludeIroh] = useState(false);
  const [nodeId, setNodeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventTypes: { value: ManualAttestationEventType; label: string; description: string }[] = [
    {
      value: 'account_creation',
      label: 'Account Creation',
      description: 'Timestamp of account creation',
    },
    {
      value: 'profile_update',
      label: 'Profile Update',
      description: 'Timestamp of profile changes',
    },
    {
      value: 'key_rotation',
      label: 'Key Rotation',
      description: 'Timestamp of key rotation event',
    },
    {
      value: 'custom_note',
      label: 'Custom Note',
      description: 'Custom timestamped note',
    },
    {
      value: 'document_hash',
      label: 'Document Hash',
      description: 'Hash of a document',
    },
    {
      value: 'profile_snapshot',
      label: 'Profile Snapshot',
      description: 'Snapshot of profile state',
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!includeSimpleproof && !includeIroh) {
      setError('Select at least one verification method');
      return;
    }

    if (includeIroh && !nodeId) {
      setError('Node ID is required for Iroh verification');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const coreEventType: AttestationEventType =
        eventType === 'profile_update' ||
          eventType === 'custom_note' ||
          eventType === 'document_hash' ||
          eventType === 'profile_snapshot'
          ? 'account_creation'
          : eventType;

      await createAttestation({
        verificationId,
        eventType: coreEventType,
        metadata: metadata || undefined,
        includeSimpleproof,
        includeIroh,
        nodeId: nodeId || undefined,
      });

      setSuccess(true);
      showToast.success('Attestation created successfully');

      setTimeout(() => {
        onSuccess?.();
        onClose();
        setSuccess(false);
        setEventType('custom_note');
        setMetadata('');
        setNodeId('');
      }, 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create attestation';
      setError(errorMsg);
      showToast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl max-w-md w-full border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-bold text-white">Create New Attestation</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {success ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Attestation Created
              </h3>
              <p className="text-gray-400">
                Your timestamp has been recorded on the blockchain
              </p>
            </div>
          ) : (
            <>
              {/* Event Type */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Event Type *
                </label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as AttestationEventType)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {eventTypes.map((type) => (
                    <option key={type.value} value={type.value} className="bg-gray-900">
                      {type.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {eventTypes.find((t) => t.value === eventType)?.description}
                </p>
              </div>

              {/* Metadata */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={metadata}
                  onChange={(e) => setMetadata(e.target.value)}
                  placeholder="Add any additional details..."
                  maxLength={500}
                  rows={3}
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {metadata.length}/500 characters
                </p>
              </div>

              {/* Verification Methods */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-white">
                  Verification Methods *
                </label>

                {/* OpenTimestamps (Bitcoin, free) */}
                <label className="flex items-center space-x-3 p-3 bg-white/5 border border-white/10 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeSimpleproof}
                    onChange={(e) => setIncludeSimpleproof(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">OpenTimestamps (Bitcoin, free)</p>
                    <p className="text-xs text-gray-400">
                      Bitcoin-anchored via public OpenTimestamps calendars
                    </p>
                  </div>
                </label>

                {/* Iroh */}
                <label className="flex items-center space-x-3 p-3 bg-white/5 border border-white/10 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeIroh}
                    onChange={(e) => setIncludeIroh(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">Iroh</p>
                    <p className="text-xs text-gray-400">
                      Decentralized DHT discovery
                    </p>
                  </div>
                </label>

                {/* Node ID (if Iroh selected) */}
                {includeIroh && (
                  <div>
                    <label className="block text-xs font-semibold text-white mb-1">
                      Iroh Node ID (52-char base32)
                    </label>
                    <input
                      type="text"
                      value={nodeId}
                      onChange={(e) => setNodeId(e.target.value)}
                      placeholder="abbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-start space-x-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Cost Info */}
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-xs text-blue-400">
                  ℹ️ <strong>Free:</strong> No fees for creating attestations
                </p>
              </div>

              {/* Buttons */}
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  {loading ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Attestation</span>
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default ManualAttestationModal;

