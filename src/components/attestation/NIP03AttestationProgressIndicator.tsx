/**
 * NIP-03 Attestation Progress Indicator Component
 * Phase 2 Week 3 Day 10: UI Components for NIP-03 Attestation Display
 *
 * Displays real-time attestation progress during registration with visual indicators
 * for each step: Kind:0 Publishing → SimpleProof Timestamp → NIP-03 Event → PKARR Record
 *
 * @compliance Privacy-first, zero-knowledge, no PII exposure
 */

import React, { useMemo } from 'react';
import { CheckCircle, Clock, AlertCircle, Loader } from 'lucide-react';
import { clientConfig } from '../../config/env.client';
import { AttestationProgress, AttestationStatus } from '../../types/attestation';

interface NIP03AttestationProgressIndicatorProps {
  progress: AttestationProgress | null;
  compact?: boolean;
  showEstimatedTime?: boolean;
  className?: string;
}

const NIP03AttestationProgressIndicatorComponent: React.FC<
  NIP03AttestationProgressIndicatorProps
> = ({
  progress,
  compact = false,
  showEstimatedTime = true,
  className = '',
}) => {
  // Check feature flags
  const nip03Enabled = clientConfig.flags.nip03Enabled || false;
  const nip03IdentityCreationEnabled = clientConfig.flags.nip03IdentityCreationEnabled || false;

  if (!nip03Enabled || !nip03IdentityCreationEnabled || !progress) {
    return null;
  }

  // Calculate overall progress percentage
  const progressPercentage = useMemo(() => {
    const steps = [progress.kind0, progress.simpleproof, progress.nip03, progress.pkarr];
    const completed = steps.filter((s) => s.status === 'success' || s.status === 'skipped').length;
    return Math.round((completed / steps.length) * 100);
  }, [progress]);

  // Get status color
  const getStatusColor = (status: AttestationStatus): string => {
    switch (status) {
      case 'success':
        return 'text-green-600';
      case 'failure':
        return 'text-red-600';
      case 'in-progress':
        return 'text-blue-600';
      case 'skipped':
        return 'text-gray-500';
      default:
        return 'text-gray-400';
    }
  };

  // Get status icon
  const getStatusIcon = (status: AttestationStatus) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'failure':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'in-progress':
        return <Loader className="w-5 h-5 text-blue-600 animate-spin" />;
      case 'skipped':
        return <Clock className="w-5 h-5 text-gray-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  // Get status label
  const getStatusLabel = (status: AttestationStatus): string => {
    switch (status) {
      case 'success':
        return 'Completed';
      case 'failure':
        return 'Failed';
      case 'in-progress':
        return 'In Progress';
      case 'skipped':
        return 'Skipped';
      default:
        return 'Pending';
    }
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex-1 bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-700">{progressPercentage}%</span>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-900">Attestation Progress</h3>
          <span className="text-sm font-medium text-gray-700">{progressPercentage}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {/* Kind:0 Publishing */}
        <div className="flex items-center gap-3">
          {getStatusIcon(progress.kind0.status)}
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Kind:0 Profile Publishing</p>
            <p className="text-xs text-gray-500">{getStatusLabel(progress.kind0.status)}</p>
          </div>
        </div>

        {/* SimpleProof Timestamp */}
        <div className="flex items-center gap-3">
          {getStatusIcon(progress.simpleproof.status)}
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">SimpleProof Timestamp</p>
            <p className="text-xs text-gray-500">{getStatusLabel(progress.simpleproof.status)}</p>
          </div>
        </div>

        {/* NIP-03 Event */}
        <div className="flex items-center gap-3">
          {getStatusIcon(progress.nip03.status)}
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">NIP-03 Attestation Event</p>
            <p className="text-xs text-gray-500">{getStatusLabel(progress.nip03.status)}</p>
          </div>
        </div>

        {/* PKARR Record */}
        <div className="flex items-center gap-3">
          {getStatusIcon(progress.pkarr.status)}
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">PKARR Record Publishing</p>
            <p className="text-xs text-gray-500">{getStatusLabel(progress.pkarr.status)}</p>
          </div>
        </div>
      </div>

      {/* Estimated Time */}
      {showEstimatedTime && progress.estimatedTimeRemaining && (
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-blue-50 p-2 rounded">
          <Clock className="w-4 h-4" />
          <span>Estimated time remaining: {Math.ceil(progress.estimatedTimeRemaining / 1000)}s</span>
        </div>
      )}

      {/* Error Message */}
      {progress.overallStatus === 'failure' && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-3 rounded">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Attestation Failed</p>
            <p className="text-xs mt-1">
              {progress.nip03.metadata?.error ||
                progress.simpleproof.metadata?.error ||
                'An error occurred during attestation'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default NIP03AttestationProgressIndicatorComponent;

