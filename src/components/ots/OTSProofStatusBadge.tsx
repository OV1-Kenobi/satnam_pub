// OTS Proof Status Badge Component
// Purpose: Visual indicator for OpenTimestamps proof status (pending/confirmed/failed)
// Aligned with: docs/planning/OTS-AGENT-PROOF-GENERATION-IMPLEMENTATION-PLAN.md Phase 2

import React from 'react';

interface OTSProofStatusBadgeProps {
  status: 'pending' | 'confirmed' | 'failed';
  bitcoinBlockHeight?: number;
  confirmedAt?: Date;
}

/**
 * Visual indicator for OTS proof status
 * Displays color-coded badge with icon and label
 * Shows Bitcoin block height when confirmed
 */
export const OTSProofStatusBadge: React.FC<OTSProofStatusBadgeProps> = ({
  status,
  bitcoinBlockHeight,
  confirmedAt,
}) => {
  const statusConfig = {
    pending: {
      color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      icon: '⏳',
      label: 'Pending Confirmation',
      ariaLabel: 'Proof is pending Bitcoin block confirmation',
    },
    confirmed: {
      color: 'bg-green-100 text-green-800 border-green-300',
      icon: '✓',
      label: 'Confirmed',
      ariaLabel: 'Proof confirmed in Bitcoin blockchain',
    },
    failed: {
      color: 'bg-red-100 text-red-800 border-red-300',
      icon: '✗',
      label: 'Failed',
      ariaLabel: 'Proof generation or confirmation failed',
    },
  };

  const config = statusConfig[status];

  return (
    <div
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${config.color}`}
      role="status"
      aria-label={config.ariaLabel}
    >
      <span className="mr-2" aria-hidden="true">
        {config.icon}
      </span>
      <span>{config.label}</span>
      {status === 'confirmed' && bitcoinBlockHeight && (
        <span className="ml-2 text-xs font-normal">
          Block #{bitcoinBlockHeight.toLocaleString()}
        </span>
      )}
      {status === 'confirmed' && confirmedAt && (
        <span className="ml-2 text-xs font-normal" title={confirmedAt.toISOString()}>
          {new Date(confirmedAt).toLocaleDateString()}
        </span>
      )}
    </div>
  );
};

export default OTSProofStatusBadge;

