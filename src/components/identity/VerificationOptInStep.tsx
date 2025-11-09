/**
 * Verification Opt-In Step Component
 * Optional step in Identity Forge registration for SimpleProof/Iroh verification
 * Displayed after profile creation, before completion screen
 * 
 * @compliance Privacy-first, zero-knowledge, feature flag gated
 */

import { AlertCircle, ArrowRight, CheckCircle, Info, Loader, Shield } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { clientConfig } from '../../config/env.client';
import { createAttestation } from '../../lib/attestation-manager';

interface VerificationOptInStepProps {
  verificationId: string;
  username: string;
  onSkip: () => void;
  onComplete: (success: boolean) => void;
}

export const VerificationOptInStep: React.FC<VerificationOptInStepProps> = ({
  verificationId,
  username,
  onSkip,
  onComplete,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // FIX-2: Track if component is still mounted to prevent state updates on unmounted component
  const isMountedRef = useRef(true);
  // FIX-2: Track timeout ID for proper cleanup to prevent memory leaks
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const SIMPLEPROOF_ENABLED = clientConfig.flags.simpleproofEnabled ?? false;
  const IROH_ENABLED = clientConfig.flags.irohEnabled ?? false;

  // FIX-2: Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      // FIX-2: Clear timeout on unmount to prevent memory leaks
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Don't show if no verification methods are enabled
  if (!SIMPLEPROOF_ENABLED && !IROH_ENABLED) {
    return null;
  }

  const handleCreateAttestation = async () => {
    try {
      setIsCreating(true);
      setError(null);

      const attestation = await createAttestation({
        verificationId,
        eventType: 'account_creation',
        metadata: `Account created via Identity Forge on ${new Date().toISOString()}`,
        includeSimpleproof: SIMPLEPROOF_ENABLED,
        includeIroh: false, // User doesn't provide node ID during registration
      });

      // FIX-2: Only update state if component is still mounted
      if (isMountedRef.current) {
        setSuccess(true);

        // Clear any existing timeout before setting a new one
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // FIX-2: Store timeout ID in ref for proper cleanup
        timeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            onComplete(true);
          }
        }, 2000);
      }
    } catch (err) {
      // FIX-2: Only update state if component is still mounted
      if (isMountedRef.current) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create attestation';
        setError(errorMsg);
        console.error('Attestation creation failed:', err);
      }
    } finally {
      // FIX-2: Only update state if component is still mounted
      if (isMountedRef.current) {
        setIsCreating(false);
      }
    }
  };

  if (success) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-20 h-20 bg-green-500/20 border-2 border-green-500/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-10 w-10 text-green-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">
            Identity Verified! ✓
          </h3>
          <p className="text-green-200">
            Your account has been timestamped on the blockchain
          </p>
        </div>

        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-green-200 font-semibold mb-1">Verification Complete</h4>
              <p className="text-green-200/80 text-sm">
                Your account creation has been recorded on the blockchain. This increases your trust score and proves your account age.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-purple-200 text-sm">
          Redirecting to completion screen...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <Shield className="h-16 w-16 text-blue-500 mx-auto mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">
          Verify Your Identity (Optional)
        </h3>
        <p className="text-purple-200">
          Create a blockchain-anchored proof of your account creation
        </p>
      </div>

      {/* Benefits */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start space-x-3 mb-3">
          <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-blue-200 font-semibold mb-2">What This Does</h4>
            <ul className="text-blue-200/80 text-sm space-y-1">
              <li>✓ Creates a blockchain-anchored proof of your account creation</li>
              <li>✓ Increases your trust score (+10 points)</li>
              <li>✓ Proves your account age for recovery purposes</li>
              <li>✓ Enables advanced verification features</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Cost Info */}
      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
        <p className="text-green-200 text-sm">
          <strong>💚 Free:</strong> No fees or costs associated with verification
        </p>
      </div>

      {/* Verification Methods */}
      <div className="space-y-2">
        <h4 className="text-white font-semibold">Verification Methods</h4>
        <div className="space-y-2">
          {SIMPLEPROOF_ENABLED && (
            <div className="flex items-center space-x-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <CheckCircle className="h-5 w-5 text-orange-400 flex-shrink-0" />
              <div>
                <p className="text-orange-200 font-medium text-sm">SimpleProof</p>
                <p className="text-orange-200/70 text-xs">Blockchain-anchored via Bitcoin</p>
              </div>
            </div>
          )}
          {IROH_ENABLED && (
            <div className="flex items-center space-x-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <CheckCircle className="h-5 w-5 text-purple-400 flex-shrink-0" />
              <div>
                <p className="text-purple-200 font-medium text-sm">Iroh</p>
                <p className="text-purple-200/70 text-xs">Decentralized DHT discovery</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start space-x-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-red-200 font-semibold mb-1">Error</h4>
            <p className="text-red-200/80 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onSkip}
          disabled={isCreating}
          className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 disabled:bg-white/5 text-white rounded-lg transition-colors font-medium"
        >
          Skip for Now
        </button>
        <button
          onClick={handleCreateAttestation}
          disabled={isCreating}
          className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors font-medium flex items-center justify-center space-x-2"
        >
          {isCreating ? (
            <>
              <Loader className="h-4 w-4 animate-spin" />
              <span>Creating Attestation...</span>
            </>
          ) : (
            <>
              <Shield className="h-4 w-4" />
              <span>Verify My Identity</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {/* Skip Message */}
      <p className="text-center text-purple-200/70 text-sm">
        You can enable verification later in your Sovereignty Controls Dashboard
      </p>
    </div>
  );
};

export default VerificationOptInStep;

