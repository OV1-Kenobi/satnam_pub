/**
 * SimpleProof Timestamp Button Component
 * Phase 2B-2 Day 10: SimpleProof UI Components - Part 1
 *
 * Features:
 * - Create blockchain timestamp for identity verification
 * - Loading state with progress indicator
 * - Success/error feedback
 * - Disabled state when already timestamped
 * - Feature flag gated: VITE_SIMPLEPROOF_ENABLED
 * - Integration with simpleProofService
 *
 * @compliance Privacy-first, zero-knowledge, no PII display
 */

import { Shield, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import React, { useState, useCallback } from 'react';
import { showToast } from '../../services/toastService';
import { simpleProofService } from '../../services/simpleProofService';
import { clientConfig } from '../../config/env.client';

interface SimpleProofTimestampButtonProps {
  data: string; // Data to timestamp (e.g., JSON.stringify(identity))
  verificationId: string; // UUID linking to verification record
  onSuccess?: (result: {
    ots_proof: string;
    bitcoin_block: number | null;
    bitcoin_tx: string | null;
    verified_at: number;
  }) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  alreadyTimestamped?: boolean;
  className?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const SimpleProofTimestampButton: React.FC<SimpleProofTimestampButtonProps> = ({
  data,
  verificationId,
  onSuccess,
  onError,
  disabled = false,
  alreadyTimestamped = false,
  className = '',
  variant = 'primary',
  size = 'md',
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [timestampCreated, setTimestampCreated] = useState(alreadyTimestamped);

  // Check feature flag
  const simpleproofEnabled = clientConfig.flags.simpleproofEnabled || false;

  // Handle timestamp creation
  const handleCreateTimestamp = useCallback(async () => {
    if (!simpleproofEnabled) {
      showToast.error('SimpleProof is not enabled', { duration: 3000 });
      return;
    }

    if (!data || !verificationId) {
      showToast.error('Missing required data for timestamping', { duration: 3000 });
      return;
    }

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
    <button
      type="button"
      onClick={handleCreateTimestamp}
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
  );
};

