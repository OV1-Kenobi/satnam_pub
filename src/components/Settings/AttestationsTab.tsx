/**
 * Attestations Tab Component
 * Settings UI for PKARR attestation management
 * 
 * Phase 2A Day 7: PKARR management interface
 * 
 * Features:
 * - Display current PKARR record status
 * - Show last published timestamp and next republish time
 * - Manual "Republish Now" trigger button
 * - Publish history (last 10 attempts with success/failure status)
 * 
 * @compliance Privacy-first, zero-knowledge, feature flag gated
 */

import { AlertTriangle, CheckCircle, Clock, Loader, RefreshCw, Shield, XCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { clientConfig } from '../../config/env.client';
import { showToast } from '../../services/toastService';

const PKARR_ENABLED = clientConfig.flags.pkarrEnabled ?? false;

interface PkarrRecord {
  public_key: string;
  records: string;
  timestamp: number;
  sequence: number;
  relay_urls: string[];
  last_published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PublishHistoryEntry {
  id: string;
  public_key: string;
  sequence: number;
  relay_urls: string[];
  success: boolean;
  error_message: string | null;
  published_at: string;
}

export const AttestationsTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [pkarrRecord, setPkarrRecord] = useState<PkarrRecord | null>(null);
  const [publishHistory, setPublishHistory] = useState<PublishHistoryEntry[]>([]);
  const [republishing, setRepublishing] = useState(false);

  // Fetch PKARR record status
  const fetchPkarrStatus = async () => {
    setLoading(true);
    try {
      // TODO: Implement API endpoint to fetch user's PKARR record
      // For now, this is a placeholder
      console.log('Fetching PKARR status...');

      // Simulated data for development
      // In production, this would call: GET /.netlify/functions/pkarr-status

      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch PKARR status:', error);
      showToast.error('Failed to load attestation status', {
        title: 'Attestations',
        duration: 4000,
      });
      setLoading(false);
    }
  };

  // Manual republish trigger
  const handleRepublish = async () => {
    setRepublishing(true);
    try {
      const response = await fetch('/.netlify/functions/scheduled-pkarr-republish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('sessionToken') || ''}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        showToast.success(`Republished ${result.results?.successful || 0} records`, {
          title: 'PKARR Republish',
          duration: 5000,
        });

        // Refresh status
        await fetchPkarrStatus();
      } else {
        showToast.error(result.error || 'Republish failed', {
          title: 'PKARR Republish',
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Manual republish failed:', error);
      showToast.error('Failed to trigger republish', {
        title: 'PKARR Republish',
        duration: 4000,
      });
    } finally {
      setRepublishing(false);
    }
  };

  // Calculate next republish time (24 hours from last publish)
  const getNextRepublishTime = () => {
    if (!pkarrRecord?.last_published_at) {
      return 'Never published';
    }

    const lastPublished = new Date(pkarrRecord.last_published_at);
    const nextRepublish = new Date(lastPublished.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();

    if (nextRepublish < now) {
      return 'Overdue';
    }

    const hoursRemaining = Math.floor((nextRepublish.getTime() - now.getTime()) / (60 * 60 * 1000));
    return `In ${hoursRemaining} hours`;
  };

  useEffect(() => {
    if (PKARR_ENABLED) {
      fetchPkarrStatus();
    }
  }, []);

  if (!PKARR_ENABLED) {
    return (
      <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
        <div className="flex items-center space-x-3 text-gray-400">
          <AlertTriangle size={24} />
          <div>
            <h3 className="font-semibold text-white">PKARR Attestations Disabled</h3>
            <p className="text-sm">Enable PKARR attestations in your environment configuration to use this feature.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-center space-x-3 text-purple-400">
          <Loader size={24} className="animate-spin" />
          <span>Loading attestation status...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-purple-500/30 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Shield size={32} className="text-purple-400" />
            <div>
              <h2 className="text-2xl font-bold text-white">PKARR Attestations</h2>
              <p className="text-purple-200 text-sm">Decentralized identity verification via BitTorrent DHT</p>
            </div>
          </div>
          <button
            onClick={handleRepublish}
            disabled={republishing}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all flex items-center space-x-2"
          >
            {republishing ? (
              <>
                <Loader size={16} className="animate-spin" />
                <span>Republishing...</span>
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                <span>Republish Now</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Current Status */}
      <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Current Status</h3>

        {pkarrRecord ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Public Key:</span>
              <span className="text-white font-mono text-sm">{pkarrRecord.public_key.slice(0, 16)}...{pkarrRecord.public_key.slice(-8)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Sequence Number:</span>
              <span className="text-white font-semibold">{pkarrRecord.sequence}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Last Published:</span>
              <span className="text-white">
                {pkarrRecord.last_published_at
                  ? new Date(pkarrRecord.last_published_at).toLocaleString()
                  : 'Never'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Next Republish:</span>
              <span className={`font-medium ${getNextRepublishTime() === 'Overdue' ? 'text-yellow-400' : 'text-green-400'}`}>
                {getNextRepublishTime()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">DHT Relays:</span>
              <span className="text-white">{pkarrRecord.relay_urls.length} active</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <Shield size={48} className="mx-auto mb-3 opacity-50" />
            <p>No PKARR record found</p>
            <p className="text-sm mt-2">Your attestation will be created automatically during registration</p>
          </div>
        )}
      </div>

      {/* Publish History */}
      <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Publish History</h3>

        {publishHistory.length > 0 ? (
          <div className="space-y-2">
            {publishHistory.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${entry.success
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                  }`}
              >
                <div className="flex items-center space-x-3">
                  {entry.success ? (
                    <CheckCircle size={20} className="text-green-400" />
                  ) : (
                    <XCircle size={20} className="text-red-400" />
                  )}
                  <div>
                    <div className="text-white text-sm font-medium">
                      Sequence {entry.sequence}
                    </div>
                    <div className="text-gray-400 text-xs">
                      {new Date(entry.published_at).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {entry.success ? (
                    <span className="text-green-400 text-xs">
                      {entry.relay_urls.length} relays
                    </span>
                  ) : (
                    <span className="text-red-400 text-xs">
                      {entry.error_message || 'Failed'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <Clock size={48} className="mx-auto mb-3 opacity-50" />
            <p>No publish history available</p>
          </div>
        )}
      </div>

      {/* Information Panel */}
      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-200 mb-3">About PKARR Attestations</h3>
        <div className="space-y-2 text-blue-100 text-sm">
          <p>• PKARR (Public Key Addressable Resource Records) uses the BitTorrent DHT for decentralized identity verification</p>
          <p>• Records are automatically republished every 24 hours to maintain availability</p>
          <p>• Your NIP-05 identifier is cryptographically linked to your Nostr public key</p>
          <p>• No central authority can revoke or modify your attestation</p>
        </div>
      </div>
    </div>
  );
};

export default AttestationsTab;

