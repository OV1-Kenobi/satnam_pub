/**
 * Verification Badge Component
 * Displays trust score and verification status with interactive details
 * Supports both compact and detailed views
 * 
 * @compliance Privacy-first, zero-knowledge, no PII display
 */

import React, { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import {
  getTrustLevelBadge,
  formatTrustScore,
  getVerificationMethodColor,
  getVerificationMethodIcon,
  getVerificationMethodDescription,
  TrustScoreBreakdown,
} from '../../lib/trust-score-calculator';

interface VerificationBadgeProps {
  score: number;
  breakdown?: TrustScoreBreakdown;
  compact?: boolean;
  showTooltip?: boolean;
  onClick?: () => void;
  className?: string;
}

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  score,
  breakdown,
  compact = false,
  showTooltip = true,
  onClick,
  className = '',
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const badge = getTrustLevelBadge(score);

  if (compact) {
    return (
      <div
        className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium cursor-pointer transition-all ${
          badge.level === 'verified'
            ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
            : badge.level === 'partial'
            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30'
            : 'bg-gray-500/20 text-gray-400 border border-gray-500/30 hover:bg-gray-500/30'
        } ${className}`}
        onClick={onClick}
        title={showTooltip ? `Trust Score: ${formatTrustScore(score)}` : undefined}
      >
        <span>{badge.icon}</span>
        <span>{badge.label}</span>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Main Badge */}
      <div
        className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-all ${
          badge.level === 'verified'
            ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20'
            : badge.level === 'partial'
            ? 'bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20'
            : 'bg-gray-500/10 border-gray-500/30 hover:bg-gray-500/20'
        }`}
        onClick={() => setShowDetails(!showDetails)}
      >
        <div className="flex items-center space-x-3">
          <div
            className={`text-3xl ${
              badge.level === 'verified'
                ? 'text-green-400'
                : badge.level === 'partial'
                ? 'text-yellow-400'
                : 'text-gray-400'
            }`}
          >
            {badge.icon}
          </div>
          <div>
            <h3
              className={`font-bold text-lg ${
                badge.level === 'verified'
                  ? 'text-green-400'
                  : badge.level === 'partial'
                  ? 'text-yellow-400'
                  : 'text-gray-400'
              }`}
            >
              {badge.label}
            </h3>
            <p className="text-sm text-gray-400">
              Trust Score: {formatTrustScore(score)}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-gray-400 transition-transform ${
            showDetails ? 'rotate-180' : ''
          }`}
        />
      </div>

      {/* Details Section */}
      {showDetails && breakdown && (
        <div className="space-y-4 p-4 bg-white/5 rounded-lg border border-white/10">
          {/* Score Breakdown */}
          <div className="space-y-2">
            <h4 className="font-semibold text-white flex items-center space-x-2">
              <Info className="h-4 w-4" />
              <span>Score Breakdown</span>
            </h4>
            <div className="space-y-1 text-sm">
              {breakdown.simpleproofPoints > 0 && (
                <div className="flex justify-between text-gray-300">
                  <span>SimpleProof (Blockchain)</span>
                  <span className="text-orange-400">+{breakdown.simpleproofPoints}</span>
                </div>
              )}
              {breakdown.irohPoints > 0 && (
                <div className="flex justify-between text-gray-300">
                  <span>Iroh (DHT Discovery)</span>
                  <span className="text-purple-400">+{breakdown.irohPoints}</span>
                </div>
              )}
              {breakdown.accountAgePoints > 0 && (
                <div className="flex justify-between text-gray-300">
                  <span>Account Age</span>
                  <span className="text-blue-400">+{breakdown.accountAgePoints}</span>
                </div>
              )}
              {breakdown.nip05Points > 0 && (
                <div className="flex justify-between text-gray-300">
                  <span>NIP-05 (DNS)</span>
                  <span className="text-green-400">+{breakdown.nip05Points}</span>
                </div>
              )}
              {breakdown.pkarrPoints > 0 && (
                <div className="flex justify-between text-gray-300">
                  <span>PKARR (Decentralized)</span>
                  <span className="text-pink-400">+{breakdown.pkarrPoints}</span>
                </div>
              )}
              {breakdown.kind0Points > 0 && (
                <div className="flex justify-between text-gray-300">
                  <span>Kind:0 (Nostr)</span>
                  <span className="text-indigo-400">+{breakdown.kind0Points}</span>
                </div>
              )}
              {breakdown.multiMethodBonus > 0 && (
                <div className="flex justify-between text-gray-300 border-t border-white/10 pt-1 mt-1">
                  <span className="font-semibold">Multi-Method Bonus</span>
                  <span className="text-yellow-400 font-semibold">
                    +{breakdown.multiMethodBonus}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Verification Methods */}
          <div className="space-y-2">
            <h4 className="font-semibold text-white">Verification Methods</h4>
            <div className="flex flex-wrap gap-2">
              {breakdown.verificationMethods.map((method) => (
                <div
                  key={method}
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${getVerificationMethodColor(
                    method
                  )}`}
                  title={getVerificationMethodDescription(method)}
                >
                  <span className="mr-1">{getVerificationMethodIcon(method)}</span>
                  {method}
                </div>
              ))}
            </div>
          </div>

          {/* Total Score */}
          <div className="border-t border-white/10 pt-3">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-white">Total Score</span>
              <span className="text-2xl font-bold text-purple-400">
                {formatTrustScore(breakdown.totalScore)}
              </span>
            </div>
          </div>

          {/* Last Updated */}
          <div className="text-xs text-gray-500">
            Last updated: {new Date(breakdown.lastUpdated * 1000).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
};

export default VerificationBadge;

