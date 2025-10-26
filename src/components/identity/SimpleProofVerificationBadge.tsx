/**
 * SimpleProof Verification Badge Component
 * Phase 2B-2 Day 11: SimpleProof UI Components - Part 2
 *
 * Compact badge for inline display of SimpleProof blockchain verification status.
 * 
 * Features:
 * - Multiple badge variants (verified, pending, error)
 * - Tooltip with verification details on hover
 * - Click to expand full details modal
 * - Minimal footprint for inline use
 * - Feature flag gated: VITE_SIMPLEPROOF_ENABLED
 *
 * @compliance Privacy-first, zero-knowledge, no PII display
 */

import { Shield, Clock, XCircle, Info } from 'lucide-react';
import React, { useState } from 'react';
import { clientConfig } from '../../config/env.client';
import { SimpleProofVerificationStatus } from './SimpleProofVerificationStatus';

export type BadgeVariant = 'verified' | 'pending' | 'error';

interface SimpleProofVerificationBadgeProps {
  variant: BadgeVariant;
  otsProof?: string | null;
  bitcoinBlock?: number | null;
  bitcoinTx?: string | null;
  verifiedAt?: number | null;
  showTooltip?: boolean;
  clickable?: boolean;
  className?: string;
}

export const SimpleProofVerificationBadge: React.FC<SimpleProofVerificationBadgeProps> = ({
  variant,
  otsProof = null,
  bitcoinBlock = null,
  bitcoinTx = null,
  verifiedAt = null,
  showTooltip = true,
  clickable = true,
  className = '',
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showTooltipState, setShowTooltipState] = useState(false);

  // Check feature flag
  const simpleproofEnabled = clientConfig.flags.simpleproofEnabled || false;

  // Don't render if feature flag is disabled
  if (!simpleproofEnabled) {
    return null;
  }

  // Get badge styling based on variant
  const getBadgeStyles = (): string => {
    const baseStyles = 'inline-flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium border transition-all';
    
    switch (variant) {
      case 'verified':
        return `${baseStyles} bg-orange-500/20 text-orange-300 border-orange-500/30 hover:bg-orange-500/30`;
      case 'pending':
        return `${baseStyles} bg-yellow-500/20 text-yellow-300 border-yellow-500/30 hover:bg-yellow-500/30`;
      case 'error':
        return `${baseStyles} bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/30`;
      default:
        return `${baseStyles} bg-gray-500/20 text-gray-300 border-gray-500/30`;
    }
  };

  // Get icon based on variant
  const getIcon = () => {
    switch (variant) {
      case 'verified':
        return <Shield className="h-3 w-3" />;
      case 'pending':
        return <Clock className="h-3 w-3" />;
      case 'error':
        return <XCircle className="h-3 w-3" />;
      default:
        return <Info className="h-3 w-3" />;
    }
  };

  // Get badge text
  const getBadgeText = (): string => {
    switch (variant) {
      case 'verified':
        return 'Blockchain Verified';
      case 'pending':
        return 'Pending Verification';
      case 'error':
        return 'Verification Failed';
      default:
        return 'Unknown';
    }
  };

  // Get tooltip content
  const getTooltipContent = (): string => {
    switch (variant) {
      case 'verified':
        return bitcoinBlock 
          ? `Verified on Bitcoin block #${bitcoinBlock.toLocaleString()}`
          : 'Verified on Bitcoin blockchain';
      case 'pending':
        return 'Blockchain verification is pending. This may take a few minutes.';
      case 'error':
        return 'Blockchain verification failed. Please try again.';
      default:
        return 'SimpleProof blockchain verification status';
    }
  };

  // Handle badge click
  const handleClick = () => {
    if (clickable && variant === 'verified') {
      setShowDetails(true);
    }
  };

  return (
    <>
      {/* Badge */}
      <div className="relative inline-block">
        <button
          onClick={handleClick}
          onMouseEnter={() => showTooltip && setShowTooltipState(true)}
          onMouseLeave={() => setShowTooltipState(false)}
          disabled={!clickable || variant !== 'verified'}
          className={`${getBadgeStyles()} ${clickable && variant === 'verified' ? 'cursor-pointer' : 'cursor-default'} ${className}`}
          aria-label={getBadgeText()}
        >
          {getIcon()}
          <span>{getBadgeText()}</span>
        </button>

        {/* Tooltip */}
        {showTooltip && showTooltipState && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-black/90 text-white text-xs rounded-lg whitespace-nowrap z-50 pointer-events-none">
            {getTooltipContent()}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
              <div className="border-4 border-transparent border-t-black/90"></div>
            </div>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {showDetails && variant === 'verified' && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setShowDetails(false)}
        >
          <div 
            className="bg-purple-900 rounded-2xl p-6 max-w-2xl w-full border border-orange-500/30 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowDetails(false)}
              className="absolute top-4 right-4 text-white hover:text-purple-200 transition-colors"
              aria-label="Close details"
            >
              <XCircle className="h-6 w-6" />
            </button>

            {/* Modal Header */}
            <div className="mb-6">
              <div className="flex items-center space-x-3 mb-2">
                <Shield className="h-6 w-6 text-orange-400" />
                <h3 className="text-2xl font-bold text-white">Blockchain Verification Details</h3>
              </div>
              <p className="text-sm text-purple-200">
                This identity event has been permanently recorded on the Bitcoin blockchain.
              </p>
            </div>

            {/* Verification Status */}
            <SimpleProofVerificationStatus
              verified={true}
              otsProof={otsProof}
              bitcoinBlock={bitcoinBlock}
              bitcoinTx={bitcoinTx}
              verifiedAt={verifiedAt}
              compact={false}
              showProof={true}
            />

            {/* Cost Information */}
            <div className="mt-6 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <div className="flex items-start space-x-2">
                <Info className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-orange-300">
                  <p className="font-semibold mb-1">About Blockchain Attestations</p>
                  <p>
                    SimpleProof creates permanent, tamper-proof records on the Bitcoin blockchain. 
                    Each attestation incurs on-chain transaction fees and should only be used for 
                    important identity events such as account creation, key rotation, or family federation establishment.
                  </p>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowDetails(false)}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

