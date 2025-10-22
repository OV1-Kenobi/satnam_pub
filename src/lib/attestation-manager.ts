/**
 * Attestation Manager
 * Handles creation, retrieval, and management of timestamped proofs
 * Integrates with SimpleProof and Iroh verification systems
 * 
 * @compliance Privacy-first, zero-knowledge, RLS policies
 */

import { supabase } from './supabase';

export type AttestationEventType = 
  | 'account_creation'
  | 'profile_update'
  | 'key_rotation'
  | 'custom_note'
  | 'document_hash'
  | 'profile_snapshot';

export interface Attestation {
  id: string;
  verificationId: string;
  eventType: AttestationEventType;
  metadata?: string;
  simpleproofTimestamp?: {
    id: string;
    otsProof: string;
    bitcoinBlock?: number;
    bitcoinTx?: string;
    createdAt: number;
    verifiedAt?: number;
    isValid: boolean;
  };
  irohNodeDiscovery?: {
    id: string;
    nodeId: string;
    relayUrl?: string;
    directAddresses?: string[];
    discoveredAt: number;
    lastSeen?: number;
    isReachable: boolean;
  };
  status: 'pending' | 'verified' | 'failed';
  createdAt: number;
  updatedAt: number;
}

export interface AttestationRequest {
  verificationId: string;
  eventType: AttestationEventType;
  metadata?: string;
  includeSimpleproof?: boolean;
  includeIroh?: boolean;
  nodeId?: string;
}

/**
 * Create a new attestation with optional SimpleProof and Iroh verification
 */
export async function createAttestation(request: AttestationRequest): Promise<Attestation> {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Call SimpleProof timestamp function if requested
    let simpleproofResult = null;
    if (request.includeSimpleproof) {
      try {
        const response = await fetch('/.netlify/functions/simpleproof-timestamp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verification_id: request.verificationId,
            event_type: request.eventType,
            metadata: request.metadata,
          }),
        });

        if (response.ok) {
          simpleproofResult = await response.json();
        }
      } catch (error) {
        console.warn('SimpleProof timestamp failed:', error);
      }
    }

    // Call Iroh discovery function if requested
    let irohResult = null;
    if (request.includeIroh && request.nodeId) {
      try {
        const response = await fetch('/.netlify/functions/iroh-discover-node', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verification_id: request.verificationId,
            node_id: request.nodeId,
          }),
        });

        if (response.ok) {
          irohResult = await response.json();
        }
      } catch (error) {
        console.warn('Iroh discovery failed:', error);
      }
    }

    // Determine status based on results
    const status = simpleproofResult || irohResult ? 'verified' : 'pending';

    const attestation: Attestation = {
      id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      verificationId: request.verificationId,
      eventType: request.eventType,
      metadata: request.metadata,
      simpleproofTimestamp: simpleproofResult,
      irohNodeDiscovery: irohResult,
      status,
      createdAt: now,
      updatedAt: now,
    };

    return attestation;
  } catch (error) {
    console.error('Failed to create attestation:', error);
    throw error;
  }
}

/**
 * Retrieve all attestations for a user
 */
export async function getAttestations(verificationId: string): Promise<Attestation[]> {
  try {
    // Query SimpleProof timestamps
    const { data: simpleproofData, error: spError } = await supabase
      .from('simpleproof_timestamps')
      .select('*')
      .eq('verification_id', verificationId);

    if (spError) throw spError;

    // Query Iroh discoveries
    const { data: irohData, error: irohError } = await supabase
      .from('iroh_node_discovery')
      .select('*')
      .eq('verification_id', verificationId);

    if (irohError) throw irohError;

    // Combine and format results
    const attestations: Attestation[] = [];

    // Add SimpleProof attestations
    if (simpleproofData) {
      simpleproofData.forEach((sp: any) => {
        attestations.push({
          id: sp.id,
          verificationId: sp.verification_id,
          eventType: 'account_creation',
          simpleproofTimestamp: {
            id: sp.id,
            otsProof: sp.ots_proof,
            bitcoinBlock: sp.bitcoin_block,
            bitcoinTx: sp.bitcoin_tx,
            createdAt: sp.created_at,
            verifiedAt: sp.verified_at,
            isValid: sp.is_valid,
          },
          status: sp.is_valid ? 'verified' : 'pending',
          createdAt: sp.created_at,
          updatedAt: sp.verified_at || sp.created_at,
        });
      });
    }

    // Add Iroh attestations
    if (irohData) {
      irohData.forEach((iroh: any) => {
        attestations.push({
          id: iroh.id,
          verificationId: iroh.verification_id,
          eventType: 'account_creation',
          irohNodeDiscovery: {
            id: iroh.id,
            nodeId: iroh.node_id,
            relayUrl: iroh.relay_url,
            directAddresses: iroh.direct_addresses,
            discoveredAt: iroh.discovered_at,
            lastSeen: iroh.last_seen,
            isReachable: iroh.is_reachable,
          },
          status: iroh.is_reachable ? 'verified' : 'pending',
          createdAt: iroh.discovered_at,
          updatedAt: iroh.last_seen || iroh.discovered_at,
        });
      });
    }

    // Sort by creation date (newest first)
    return attestations.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error('Failed to retrieve attestations:', error);
    throw error;
  }
}

/**
 * Get a single attestation by ID
 */
export async function getAttestation(attestationId: string): Promise<Attestation | null> {
  try {
    // Try SimpleProof first
    const { data: spData } = await supabase
      .from('simpleproof_timestamps')
      .select('*')
      .eq('id', attestationId)
      .single();

    if (spData) {
      return {
        id: spData.id,
        verificationId: spData.verification_id,
        eventType: 'account_creation',
        simpleproofTimestamp: {
          id: spData.id,
          otsProof: spData.ots_proof,
          bitcoinBlock: spData.bitcoin_block,
          bitcoinTx: spData.bitcoin_tx,
          createdAt: spData.created_at,
          verifiedAt: spData.verified_at,
          isValid: spData.is_valid,
        },
        status: spData.is_valid ? 'verified' : 'pending',
        createdAt: spData.created_at,
        updatedAt: spData.verified_at || spData.created_at,
      };
    }

    // Try Iroh
    const { data: irohData } = await supabase
      .from('iroh_node_discovery')
      .select('*')
      .eq('id', attestationId)
      .single();

    if (irohData) {
      return {
        id: irohData.id,
        verificationId: irohData.verification_id,
        eventType: 'account_creation',
        irohNodeDiscovery: {
          id: irohData.id,
          nodeId: irohData.node_id,
          relayUrl: irohData.relay_url,
          directAddresses: irohData.direct_addresses,
          discoveredAt: irohData.discovered_at,
          lastSeen: irohData.last_seen,
          isReachable: irohData.is_reachable,
        },
        status: irohData.is_reachable ? 'verified' : 'pending',
        createdAt: irohData.discovered_at,
        updatedAt: irohData.last_seen || irohData.discovered_at,
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to retrieve attestation:', error);
    return null;
  }
}

/**
 * Format attestation for display
 */
export function formatAttestation(attestation: Attestation): {
  title: string;
  description: string;
  timestamp: string;
  methods: string[];
} {
  const date = new Date(attestation.createdAt * 1000);
  const methods: string[] = [];

  if (attestation.simpleproofTimestamp) {
    methods.push('SimpleProof');
  }
  if (attestation.irohNodeDiscovery) {
    methods.push('Iroh');
  }

  const eventLabels: Record<AttestationEventType, string> = {
    account_creation: 'Account Created',
    profile_update: 'Profile Updated',
    key_rotation: 'Keys Rotated',
    custom_note: 'Custom Note',
    document_hash: 'Document Hashed',
    profile_snapshot: 'Profile Snapshot',
  };

  return {
    title: eventLabels[attestation.eventType] || 'Attestation',
    description: attestation.metadata || 'No description provided',
    timestamp: date.toLocaleString(),
    methods,
  };
}

