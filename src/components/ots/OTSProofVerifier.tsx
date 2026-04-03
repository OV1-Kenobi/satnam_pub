// OTS Proof Verifier Component
// Purpose: Verify individual OpenTimestamps proof (download .ots file, verify against original data)
// Aligned with: docs/planning/OTS-AGENT-PROOF-GENERATION-IMPLEMENTATION-PLAN.md Phase 2

import React, { useState } from 'react';
import { localValidateOtsProof } from '../../lib/simpleproof/opentimestampsLocalValidator';
import type { LocalOtsValidationResult } from '../../lib/simpleproof/opentimestampsLocalValidator';

interface OTSProofVerifierProps {
  proofFileUrl: string; // URL to .ots proof file
  originalData: string; // Original event content to verify against
  proofHash: string; // SHA-256 hash of original data
}

/**
 * Verify individual OTS proof
 * Downloads .ots file, verifies against original data, displays result
 */
export const OTSProofVerifier: React.FC<OTSProofVerifierProps> = ({
  proofFileUrl,
  originalData,
  proofHash,
}) => {
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<LocalOtsValidationResult | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    setVerifying(true);
    setError(null);
    setVerificationResult(null);

    try {
      // 1. Download .ots proof file
      const response = await fetch(proofFileUrl);
      if (!response.ok) {
        throw new Error(`Failed to download proof file: ${response.status} ${response.statusText}`);
      }

      const otsProofBytes = await response.arrayBuffer();

      // 2. Convert to hex string for validator
      const otsProofHex = Array.from(new Uint8Array(otsProofBytes))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      // 3. Verify using local validator
      const result = await localValidateOtsProof({
        data: originalData,
        otsProofHex,
      });

      setVerificationResult(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('OTS proof verification failed:', errorMsg);
      setError(errorMsg);
    } finally {
      setVerifying(false);
    }
  }

  const getResultConfig = (status: string) => {
    switch (status) {
      case 'valid':
        return {
          color: 'bg-green-50 border-green-200 text-green-800',
          icon: '✓',
          title: 'Proof Valid',
          description: 'The OpenTimestamps proof is valid and matches the original data.',
        };
      case 'invalid':
        return {
          color: 'bg-red-50 border-red-200 text-red-800',
          icon: '✗',
          title: 'Proof Invalid',
          description: 'The OpenTimestamps proof does not match the original data.',
        };
      case 'inconclusive':
        return {
          color: 'bg-yellow-50 border-yellow-200 text-yellow-800',
          icon: '⚠',
          title: 'Verification Inconclusive',
          description: 'Unable to verify the proof. This may be a temporary issue.',
        };
      default:
        return {
          color: 'bg-gray-50 border-gray-200 text-gray-800',
          icon: '?',
          title: 'Unknown Status',
          description: 'Unexpected verification result.',
        };
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">Proof Verification</h4>
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          aria-label="Verify OpenTimestamps proof"
        >
          {verifying ? (
            <span className="inline-flex items-center">
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Verifying...
            </span>
          ) : (
            'Verify Proof'
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4" role="alert">
          <p className="text-red-800 font-medium">Verification Error</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {verificationResult && (
        <div
          className={`rounded-lg p-4 border ${getResultConfig(verificationResult.status).color}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start">
            <span className="text-2xl mr-3" aria-hidden="true">
              {getResultConfig(verificationResult.status).icon}
            </span>
            <div className="flex-1">
              <p className="font-semibold text-lg">
                {getResultConfig(verificationResult.status).title}
              </p>
              <p className="text-sm mt-1">
                {getResultConfig(verificationResult.status).description}
              </p>
              {verificationResult.reason && (
                <p className="text-sm mt-2 font-mono bg-white bg-opacity-50 p-2 rounded">
                  {verificationResult.reason}
                </p>
              )}
              <div className="mt-3 text-xs opacity-75">
                <p>Provider: {verificationResult.provider}</p>
                <p className="mt-1">
                  Note: This is a local validation check. Full Bitcoin blockchain verification
                  requires server-side confirmation.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!verificationResult && !error && !verifying && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-gray-600 text-sm">
            Click "Verify Proof" to validate this OpenTimestamps proof against the original data.
          </p>
        </div>
      )}
    </div>
  );
};

export default OTSProofVerifier;

