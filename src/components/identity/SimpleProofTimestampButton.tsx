/**
 * SimpleProof Timestamp Button Component
 * Phase 2B-2 Day 10-11: SimpleProof UI Components
 *
 * CRITICAL: SimpleProof timestamps incur Bitcoin on-chain transaction fees.
 * Use ONLY for significant identity events:
 * - Account creation (initial identity forge)
 * - Key rotation (Nostr key changes)
 * - Physical peer validation ceremonies (NFC Name Tag registration)
 * - Family Federation establishment
 * - Guardian role changes
 *
 * Features:
 * - Create blockchain timestamp for identity verification
 * - Fee estimation and cost disclosure
 * - User confirmation modal with cost warnings
 * - Loading state with progress indicator
 * - Success/error feedback
 * - Disabled state when already timestamped
 * - Feature flag gated: VITE_SIMPLEPROOF_ENABLED, VITE_SIMPLEPROOF_FEE_WARNINGS_ENABLED
 * - Integration with simpleProofService
 *
 * @compliance Privacy-first, zero-knowledge, no PII display
 */

import { AlertCircle, Bitcoin, CheckCircle, Loader2, Shield, X } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { clientConfig } from '../../config/env.client';
import { withSentryErrorBoundary } from '../../lib/sentry';
import { simpleProofService } from '../../services/simpleProofService';
import { showToast } from '../../services/toastService';

interface SimpleProofTimestampButtonProps {
  data: string; // Data to timestamp (e.g., JSON.stringify(identity))
  verificationId: string; // UUID linking to verification record
  eventType?: 'account_creation' | 'key_rotation' | 'nfc_registration' | 'family_federation' | 'guardian_role_change'; // Event type for cost justification
  onSuccess?: (result: {
    ots_proof: string;
    bitcoin_block: number | null;
    bitcoin_tx: string | null;
    verified_at: number;
  }) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  alreadyTimestamped?: boolean;
  requireConfirmation?: boolean; // Default: true - show fee warning modal
  estimatedFeeSats?: number; // Estimated Bitcoin transaction fee in sats
  className?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

const SimpleProofTimestampButtonComponent: React.FC<SimpleProofTimestampButtonProps> = ({
  data,
  verificationId,
  eventType,
  onSuccess,
  onError,
  disabled = false,
  alreadyTimestamped = false,
  requireConfirmation = true,
  estimatedFeeSats = 500, // Default estimate: ~500 sats for typical Bitcoin tx
  className = '',
  variant = 'primary',
  size = 'md',
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [timestampCreated, setTimestampCreated] = useState(alreadyTimestamped);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [userConfirmed, setUserConfirmed] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  // Check feature flags
  const simpleproofEnabled = clientConfig.flags.simpleproofEnabled || false;
  const feeWarningsEnabled = true; // Default: true (fee warnings always enabled for cost awareness)

  // Handle button click - show confirmation modal if needed
  const handleButtonClick = useCallback(() => {
    if (requireConfirmation && feeWarningsEnabled && !dontAskAgain) {
      setShowConfirmationModal(true);
    } else {
      handleCreateTimestamp();
    }
  }, [requireConfirmation, feeWarningsEnabled, dontAskAgain]);

  // Handle timestamp creation (after confirmation)
  const handleCreateTimestamp = useCallback(async () => {
    if (!simpleproofEnabled) {
      showToast.error('SimpleProof is not enabled', { duration: 3000 });
      return;
    }

    if (!data || !verificationId) {
      showToast.error('Missing required data for timestamping', { duration: 3000 });
      return;
    }

    // Close confirmation modal if open
    setShowConfirmationModal(false);

    setIsLoading(true);

    try {
      const result = await simpleProofService.createTimestamp({
        data,
        verification_id: verificationId,
      });

      if (result.success) {
        setTimestampCreated(true);
        showToast.success('Blockchain timestamp created successfully!', {
          duration: 5000,
        });

        if (onSuccess) {
          onSuccess({
            ots_proof: result.ots_proof,
            bitcoin_block: result.bitcoin_block,
            bitcoin_tx: result.bitcoin_tx,
            verified_at: result.verified_at,
          });
        }
      } else {
        throw new Error(result.error || 'Failed to create timestamp');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showToast.error(`Failed to create timestamp: ${errorMessage}`, {
        duration: 5000,
      });

      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }, [data, verificationId, simpleproofEnabled, onSuccess, onError]);

  // Get event type display name
  const getEventTypeDisplay = (): string => {
    const displayNames = {
      account_creation: 'Account Creation',
      key_rotation: 'Key Rotation',
      nfc_registration: 'NFC Name Tag Registration',
      family_federation: 'Family Federation Establishment',
      guardian_role_change: 'Guardian Role Change',
    };
    return eventType ? displayNames[eventType] : 'Identity Event';
  };

  // Don't render if feature flag is disabled
  if (!simpleproofEnabled) {
    return null;
  }

  // Button size classes
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  // Button variant classes
  const variantClasses = {
    primary: 'bg-orange-600 hover:bg-orange-700 text-white border-orange-600',
    secondary: 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600',
    outline: 'bg-transparent hover:bg-orange-600/10 text-orange-400 border-orange-500',
  };

  // Disabled state classes
  const disabledClasses = 'opacity-50 cursor-not-allowed';

  const isDisabled = disabled || isLoading || timestampCreated;

  return (
    <>
      {/* Timestamp Button */}
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center space-x-2
          rounded-lg border font-medium transition-all duration-200
          ${sizeClasses[size]}
          ${isDisabled ? disabledClasses : variantClasses[variant]}
          ${className}
        `}
        aria-label={timestampCreated ? 'Timestamp already created' : 'Create blockchain timestamp'}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Creating Timestamp...</span>
          </>
        ) : timestampCreated ? (
          <>
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
            <span>Timestamp Created</span>
          </>
        ) : (
          <>
            <Shield className="h-4 w-4" aria-hidden="true" />
            <span>Create Blockchain Timestamp</span>
          </>
        )}
      </button>

      {/* Fee Warning & Confirmation Modal */}
      {showConfirmationModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setShowConfirmationModal(false)}
        >
          <div
            className="bg-purple-900 rounded-2xl p-6 max-w-md w-full border border-orange-500/30 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowConfirmationModal(false)}
              className="absolute top-4 right-4 text-white hover:text-purple-200 transition-colors"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Modal Header */}
            <div className="mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-600 to-orange-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bitcoin className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white text-center mb-2">
                Blockchain Attestation Cost
              </h3>
              <p className="text-sm text-purple-200 text-center">
                This will create a permanent Bitcoin blockchain record
              </p>
            </div>

            {/* Event Type */}
            <div className="mb-4 p-3 bg-purple-800/50 rounded-lg">
              <div className="text-xs text-purple-300 mb-1">Event Type:</div>
              <div className="text-sm font-semibold text-white">{getEventTypeDisplay()}</div>
            </div>

            {/* Fee Estimate */}
            <div className="mb-4 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-orange-300">Estimated Bitcoin Fee:</span>
                <span className="text-lg font-bold text-orange-400">{estimatedFeeSats.toLocaleString()} sats</span>
              </div>
              <div className="text-xs text-orange-300/70">
                ≈ ${(estimatedFeeSats * 0.0005).toFixed(2)} USD (at current rates)
              </div>
            </div>

            {/* Warning */}
            <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-yellow-300">
                  <p className="font-semibold mb-1">Important:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>This creates a permanent, tamper-proof record on the Bitcoin blockchain</li>
                    <li>Transaction fees are non-refundable</li>
                    <li>Use only for significant identity events</li>
                    <li>Verification may take 10-60 minutes</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* User Confirmation Checkbox */}
            <div className="mb-6">
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={userConfirmed}
                  onChange={(e) => setUserConfirmed(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm text-white">
                  I understand this will incur Bitcoin transaction fees and create a permanent blockchain record
                </span>
              </label>
            </div>

            {/* Don't Ask Again Checkbox */}
            <div className="mb-6">
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dontAskAgain}
                  onChange={(e) => setDontAskAgain(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-xs text-purple-300">
                  Don't show this warning again for this session
                </span>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={() => setShowConfirmationModal(false)}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTimestamp}
                disabled={!userConfirmed}
                className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-semibold"
              >
                Confirm & Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Wrap with Sentry error boundary for graceful error handling (skip in test environment)
export const SimpleProofTimestampButton =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
    ? SimpleProofTimestampButtonComponent
    : withSentryErrorBoundary(
      SimpleProofTimestampButtonComponent,
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900 mb-1">
              SimpleProof Attestation Temporarily Unavailable
            </h3>
            <p className="text-sm text-red-700 mb-3">
              The blockchain attestation feature encountered an error. Your identity is still secure.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );

