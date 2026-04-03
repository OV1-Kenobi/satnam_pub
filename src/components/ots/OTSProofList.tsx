// OTS Proof List Component
// Purpose: List all OpenTimestamps proofs for agents under guardian's control
// Aligned with: docs/planning/OTS-AGENT-PROOF-GENERATION-IMPLEMENTATION-PLAN.md Phase 2

import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { OTSProofStatusBadge } from './OTSProofStatusBadge';
import type { OTSProofRecord } from '../../../types/database';

interface OTSProofListProps {
  agentPubkey?: string; // Optional: filter by specific agent
}

/**
 * List all OTS proofs for agents
 * Fetches from ots_proof_records table, displays as table
 * Allows filtering by agent pubkey
 */
export const OTSProofList: React.FC<OTSProofListProps> = ({ agentPubkey }) => {
  const [proofs, setProofs] = useState<OTSProofRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProofs() {
      try {
        setLoading(true);
        setError(null);

        let query = supabase
          .from('ots_proof_records')
          .select('*')
          .order('created_at', { ascending: false });

        if (agentPubkey) {
          query = query.eq('agent_pubkey', agentPubkey);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          throw new Error(`Failed to fetch OTS proofs: ${fetchError.message}`);
        }

        setProofs(data || []);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Failed to fetch OTS proofs:', errorMsg);
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    }

    fetchProofs();
  }, [agentPubkey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading OTS proofs...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4" role="alert">
        <p className="text-red-800 font-medium">Error loading proofs</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (proofs.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <p className="text-gray-600 text-lg">No OTS proofs found.</p>
        <p className="text-gray-500 text-sm mt-2">
          Proofs will appear here after agent events are timestamped.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          OpenTimestamps Proofs
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({proofs.length} {proofs.length === 1 ? 'proof' : 'proofs'})
          </span>
        </h3>
      </div>

      <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Event
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Created
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {proofs.map((proof) => (
              <tr key={proof.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    Kind {proof.attested_event_kind}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {proof.attested_event_id?.slice(0, 16)}...
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <OTSProofStatusBadge
                    status={proof.proof_status}
                    bitcoinBlockHeight={proof.bitcoin_block_height || undefined}
                    confirmedAt={proof.confirmed_at ? new Date(proof.confirmed_at) : undefined}
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div>{new Date(proof.created_at).toLocaleDateString()}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(proof.created_at).toLocaleTimeString()}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <a
                    href={proof.ots_proof_file_url}
                    download={`${proof.proof_hash}.ots`}
                    className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center"
                    aria-label={`Download OTS proof file for event ${proof.attested_event_id}`}
                  >
                    <svg
                      className="w-4 h-4 mr-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download .ots
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OTSProofList;

