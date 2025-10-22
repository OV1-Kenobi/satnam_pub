/**
 * Attestation History Table Component
 * Displays table of timestamped proofs and verification events
 * Shows SimpleProof and Iroh verification results
 * 
 * @compliance Privacy-first, zero-knowledge, RLS policies
 */

import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, Eye, EyeOff, Loader } from 'lucide-react';
import { Attestation, getAttestations, formatAttestation } from '../../lib/attestation-manager';

interface AttestationHistoryTableProps {
  verificationId: string;
  onViewDetails?: (attestation: Attestation) => void;
}

export const AttestationHistoryTable: React.FC<AttestationHistoryTableProps> = ({
  verificationId,
  onViewDetails,
}) => {
  const [attestations, setAttestations] = useState<Attestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadAttestations();
  }, [verificationId]);

  const loadAttestations = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAttestations(verificationId);
      setAttestations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attestations');
      console.error('Error loading attestations:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getMethodBadge = (method: string) => {
    switch (method) {
      case 'SimpleProof':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'Iroh':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="h-6 w-6 text-purple-400 animate-spin" />
        <span className="ml-2 text-gray-400">Loading attestations...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
        <p className="text-red-400">Error: {error}</p>
        <button
          onClick={loadAttestations}
          className="mt-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (attestations.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-4">No attestations yet</p>
        <p className="text-sm text-gray-500">
          Create your first timestamp to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Attestation History</h3>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center space-x-2 px-3 py-1 bg-white/10 hover:bg-white/20 text-gray-300 rounded text-sm transition-colors"
        >
          {showDetails ? (
            <>
              <EyeOff className="h-4 w-4" />
              <span>Hide Details</span>
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              <span>Show Details</span>
            </>
          )}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-3 px-4 text-gray-400 font-semibold">Event</th>
              <th className="text-left py-3 px-4 text-gray-400 font-semibold">Date</th>
              <th className="text-left py-3 px-4 text-gray-400 font-semibold">Method</th>
              <th className="text-left py-3 px-4 text-gray-400 font-semibold">Status</th>
              <th className="text-right py-3 px-4 text-gray-400 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {attestations.map((attestation) => {
              const formatted = formatAttestation(attestation);
              const isExpanded = expandedId === attestation.id;

              return (
                <React.Fragment key={attestation.id}>
                  <tr
                    className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : attestation.id)}
                  >
                    <td className="py-3 px-4 text-white font-medium">
                      {formatted.title}
                    </td>
                    <td className="py-3 px-4 text-gray-400">
                      {formatted.timestamp}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {formatted.methods.map((method) => (
                          <span
                            key={method}
                            className={`px-2 py-1 rounded text-xs font-medium border ${getMethodBadge(
                              method
                            )}`}
                          >
                            {method}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium border ${getStatusBadge(
                          attestation.status
                        )}`}
                      >
                        {attestation.status.charAt(0).toUpperCase() +
                          attestation.status.slice(1)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewDetails?.(attestation);
                          }}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                          title="View details"
                        >
                          <ExternalLink className="h-4 w-4 text-gray-400" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Implement download proof
                          }}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                          title="Download proof"
                        >
                          <Download className="h-4 w-4 text-gray-400" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Details */}
                  {isExpanded && showDetails && (
                    <tr className="bg-white/5 border-b border-white/10">
                      <td colSpan={5} className="py-4 px-4">
                        <div className="space-y-3">
                          {attestation.simpleproofTimestamp && (
                            <div className="bg-orange-500/10 border border-orange-500/30 rounded p-3">
                              <h4 className="font-semibold text-orange-400 mb-2">
                                SimpleProof Details
                              </h4>
                              <div className="space-y-1 text-sm text-gray-300">
                                <div className="flex justify-between">
                                  <span>OTS Proof:</span>
                                  <span className="font-mono text-xs">
                                    {attestation.simpleproofTimestamp.otsProof.substring(
                                      0,
                                      32
                                    )}
                                    ...
                                  </span>
                                </div>
                                {attestation.simpleproofTimestamp.bitcoinBlock && (
                                  <div className="flex justify-between">
                                    <span>Bitcoin Block:</span>
                                    <span className="font-mono">
                                      {attestation.simpleproofTimestamp.bitcoinBlock}
                                    </span>
                                  </div>
                                )}
                                {attestation.simpleproofTimestamp.bitcoinTx && (
                                  <div className="flex justify-between">
                                    <span>Bitcoin TX:</span>
                                    <span className="font-mono text-xs">
                                      {attestation.simpleproofTimestamp.bitcoinTx.substring(
                                        0,
                                        16
                                      )}
                                      ...
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {attestation.irohNodeDiscovery && (
                            <div className="bg-purple-500/10 border border-purple-500/30 rounded p-3">
                              <h4 className="font-semibold text-purple-400 mb-2">
                                Iroh Details
                              </h4>
                              <div className="space-y-1 text-sm text-gray-300">
                                <div className="flex justify-between">
                                  <span>Node ID:</span>
                                  <span className="font-mono text-xs">
                                    {attestation.irohNodeDiscovery.nodeId.substring(
                                      0,
                                      16
                                    )}
                                    ...
                                  </span>
                                </div>
                                {attestation.irohNodeDiscovery.relayUrl && (
                                  <div className="flex justify-between">
                                    <span>Relay URL:</span>
                                    <span className="font-mono text-xs">
                                      {attestation.irohNodeDiscovery.relayUrl}
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-between">
                                  <span>Reachable:</span>
                                  <span
                                    className={
                                      attestation.irohNodeDiscovery.isReachable
                                        ? 'text-green-400'
                                        : 'text-red-400'
                                    }
                                  >
                                    {attestation.irohNodeDiscovery.isReachable
                                      ? '✓ Yes'
                                      : '✗ No'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="text-xs text-gray-500 text-center">
        Showing {attestations.length} attestation{attestations.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
};

export default AttestationHistoryTable;

