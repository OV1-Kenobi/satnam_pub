/**
 * Contact Verification Badge Component
 * Displays verification status badges for contacts based on verification flags
 * 
 * Verification Levels:
 * - unverified: All flags false (gray)
 * - basic: Any single flag true (blue)
 * - verified: physical_mfa_verified=true OR (simpleproof_verified=true AND kind0_verified=true) (green)
 * - trusted: physical_mfa_verified=true AND (simpleproof_verified=true OR kind0_verified=true) (gold)
 * 
 * Verification Methods:
 * - PKARR: BitTorrent DHT-based identity verification
 * - SimpleProof: Timestamped attestation
 * - kind:0: Nostr profile metadata verification
 * - Physical MFA: NFC Name Tag verification
 * - Iroh DHT: Iroh node discovery verification
 * 
 * @compliance Privacy-first, zero-knowledge, no PII display
 */

import { CheckCircle, Info, Loader, Shield, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';
import { showToast } from '../../services/toastService';

// Static method configuration to avoid recreation on every render
const METHOD_CONFIG: Record<string, { icon: string; label: string; description: string }> = {
  pkarr: {
    icon: '🔗',
    label: 'PKARR',
    description: 'BitTorrent DHT identity verification',
  },
  simpleproof: {
    icon: '⏱️',
    label: 'SimpleProof',
    description: 'Timestamped attestation',
  },
  kind0: {
    icon: '📝',
    label: 'Nostr Profile',
    description: 'Nostr kind:0 metadata verification',
  },
  physical_mfa: {
    icon: '🏷️',
    label: 'NFC Tag',
    description: 'Physical NFC Name Tag verification',
  },
  iroh_dht: {
    icon: '🌐',
    label: 'Iroh DHT',
    description: 'Iroh node discovery verification',
  },
};

interface ContactVerificationBadgeProps {
  contactHash: string;
  nip05?: string;
  pubkey?: string;
  verificationLevel: 'unverified' | 'basic' | 'verified' | 'trusted';
  pkarrVerified?: boolean;
  simpleproofVerified?: boolean;
  kind0Verified?: boolean;
  physicalMfaVerified?: boolean;
  irohDhtVerified?: boolean;
  compact?: boolean;
  showManualVerify?: boolean;
  onVerificationUpdate?: (newLevel: string) => void;
}

export const ContactVerificationBadge: React.FC<ContactVerificationBadgeProps> = ({
  contactHash,
  nip05,
  pubkey,
  verificationLevel,
  pkarrVerified = false,
  simpleproofVerified = false,
  kind0Verified = false,
  physicalMfaVerified = false,
  irohDhtVerified = false,
  compact = false,
  showManualVerify = true,
  onVerificationUpdate,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Get badge configuration based on verification level
  const getBadgeConfig = () => {
    switch (verificationLevel) {
      case 'trusted':
        return {
          icon: <ShieldCheck size={16} className="text-yellow-400" />,
          label: 'Trusted',
          color: 'bg-yellow-900/30 border-yellow-500/50 text-yellow-300',
          description: 'Physical MFA + additional verification',
        };
      case 'verified':
        return {
          icon: <CheckCircle size={16} className="text-green-400" />,
          label: 'Verified',
          color: 'bg-green-900/30 border-green-500/50 text-green-300',
          description: 'Multiple verification methods confirmed',
        };
      case 'basic':
        return {
          icon: <Shield size={16} className="text-blue-400" />,
          label: 'Basic',
          color: 'bg-blue-900/30 border-blue-500/50 text-blue-300',
          description: 'Single verification method confirmed',
        };
      case 'unverified':
      default:
        return {
          icon: <Shield size={16} className="text-gray-400" />,
          label: 'Unverified',
          color: 'bg-gray-900/30 border-gray-500/50 text-gray-400',
          description: 'No verification methods confirmed',
        };
    }
  };

  const badge = getBadgeConfig();

  // Get verification method badge
  const getMethodBadge = (method: string, verified: boolean) => {
    const config = METHOD_CONFIG[method];
    if (!config) return null;

    return (
      <div
        key={method}
        className={`flex items-center space-x-2 px-2 py-1 rounded-md text-xs ${verified
          ? 'bg-green-500/20 text-green-300 border border-green-500/30'
          : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
          }`}
        title={config.description}
      >
        <span>{config.icon}</span>
        <span>{config.label}</span>
        {verified && <span className="text-green-400">✓</span>}
      </div>
    );
  };

  // Manual PKARR verification handler
  const handleManualVerify = async () => {
    if (!nip05 || !pubkey) {
      showToast.error('Missing NIP-05 or public key for verification', {
        title: 'Verification Error',
        duration: 4000,
      });
      return;
    }

    setVerifying(true);

    try {
      const response = await fetch('/.netlify/functions/pkarr-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('sessionToken') || ''}`,
        },
        body: JSON.stringify({
          action: 'verify_contact',
          payload: {
            contact_hash: contactHash,
            nip05,
            pubkey,
          },
        }),
      });

      const result = await response.json();

      if (result.success && result.verified) {
        showToast.success(`Contact verified via PKARR! Level: ${result.verification_level}`, {
          title: 'Verification Success',
          duration: 5000,
        });

        // Notify parent component of verification update
        if (onVerificationUpdate) {
          onVerificationUpdate(result.verification_level);
        }
      } else {
        showToast.warning(result.error || 'PKARR verification failed', {
          title: 'Verification Failed',
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Manual PKARR verification error:', error);
      showToast.error('Failed to verify contact', {
        title: 'Verification Error',
        duration: 4000,
      });
    } finally {
      setVerifying(false);
    }
  };

  // Compact badge view (for contact lists)
  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDetails(!showDetails);
          }}
          className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium border transition-all ${badge.color} hover:opacity-80`}
          title={badge.description}
        >
          {badge.icon}
          <span>{badge.label}</span>
          <Info size={12} className="opacity-60" />
        </button>

        {/* Tooltip with verification details */}
        {showDetails && (
          <div className="absolute z-50 top-full left-0 mt-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-white">Verification Methods</h4>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDetails(false);
                }}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 mb-3">
              {getMethodBadge('pkarr', pkarrVerified)}
              {getMethodBadge('simpleproof', simpleproofVerified)}
              {getMethodBadge('kind0', kind0Verified)}
              {getMethodBadge('physical_mfa', physicalMfaVerified)}
              {getMethodBadge('iroh_dht', irohDhtVerified)}
            </div>

            {showManualVerify && !pkarrVerified && nip05 && pubkey && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleManualVerify();
                }}
                disabled={verifying}
                className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-md transition-all flex items-center justify-center space-x-2"
              >
                {verifying ? (
                  <>
                    <Loader size={14} className="animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Shield size={14} />
                    <span>Verify via PKARR</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Detailed badge view (for contact details page)
  return (
    <div className="space-y-3">
      {/* Main verification level badge */}
      <div className={`flex items-center justify-between p-3 rounded-lg border ${badge.color}`}>
        <div className="flex items-center space-x-2">
          {badge.icon}
          <div>
            <div className="font-semibold text-sm">{badge.label}</div>
            <div className="text-xs opacity-80">{badge.description}</div>
          </div>
        </div>
      </div>

      {/* Verification methods grid */}
      <div className="grid grid-cols-2 gap-2">
        {getMethodBadge('pkarr', pkarrVerified)}
        {getMethodBadge('simpleproof', simpleproofVerified)}
        {getMethodBadge('kind0', kind0Verified)}
        {getMethodBadge('physical_mfa', physicalMfaVerified)}
        {getMethodBadge('iroh_dht', irohDhtVerified)}
      </div>

      {/* Manual verification button */}
      {showManualVerify && !pkarrVerified && nip05 && pubkey && (
        <button
          onClick={handleManualVerify}
          disabled={verifying}
          className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center space-x-2"
        >
          {verifying ? (
            <>
              <Loader size={16} className="animate-spin" />
              <span>Verifying via PKARR...</span>
            </>
          ) : (
            <>
              <Shield size={16} />
              <span>Verify via PKARR Now</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default ContactVerificationBadge;

