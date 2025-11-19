/**
 * Attestation Manager
 * Handles creation, retrieval, and management of timestamped proofs
 * Integrates with Bitcoin-anchored timestamping (OpenTimestamps via Netlify) and Iroh verification systems
 *
 * @compliance Privacy-first, zero-knowledge, RLS policies
 */

import { supabase } from "./supabase";

export type AttestationEventType =
  | "account_creation"
  | "key_rotation"
  | "nfc_registration"
  | "family_federation"
  | "guardian_role_change";

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
  status: "pending" | "completed" | "failed" | "partial";
  errorDetails?: Record<string, any>;
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

function normalizeMetadataToString(metadata: unknown): string | undefined {
  if (metadata === null || typeof metadata === "undefined") {
    return undefined;
  }
  if (typeof metadata === "string") {
    return metadata;
  }
  return JSON.stringify(metadata);
}

/**
 * Create a new attestation with optional Bitcoin-anchored timestamping (OpenTimestamps via Netlify)
 * and optional Iroh verification.
 */
export async function createAttestation(
  request: AttestationRequest
): Promise<Attestation> {
  try {
    const now = Math.floor(Date.now() / 1000);

    // FIX-4: Track errors separately for better error handling
    let simpleproofResult = null;
    let simpleproofError: string | null = null;

    // Call timestamp Netlify function if requested (OpenTimestamps primary; remote SimpleProof optional server-side)
    if (request.includeSimpleproof) {
      try {
        const response = await fetch(
          "/.netlify/functions/simpleproof-timestamp",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              verification_id: request.verificationId,
              event_type: request.eventType,
              metadata: request.metadata,
              // Use verificationId as the data payload for timestamping
              data: request.verificationId,
            }),
            // FIX-4: Add 30-second timeout to prevent indefinite waiting
            signal: AbortSignal.timeout(30000),
          }
        );

        if (response.ok) {
          simpleproofResult = await response.json();
        } else {
          // Try to extract structured error from JSON response if available
          let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          try {
            const errorBody = (await response.json().catch(() => null)) as {
              error?: unknown;
            } | null;
            if (errorBody && typeof errorBody.error !== "undefined") {
              errorMessage = String(errorBody.error);
            }
          } catch {
            // Ignore JSON parsing errors and fall back to generic message
          }
          simpleproofError = errorMessage;
        }
      } catch (error) {
        simpleproofError =
          error instanceof Error ? error.message : String(error);
        console.warn("SimpleProof timestamp failed:", simpleproofError);
      }
    }

    // FIX-4: Track errors separately for better error handling
    let irohResult = null;
    let irohError: string | null = null;

    // Call Iroh discovery function if requested
    if (request.includeIroh && request.nodeId) {
      try {
        const response = await fetch("/.netlify/functions/iroh-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "discover_node",
            payload: {
              verification_id: request.verificationId,
              node_id: request.nodeId,
            },
          }),
          // FIX-4: Add 30-second timeout to prevent indefinite waiting
          signal: AbortSignal.timeout(30000),
        });

        if (response.ok) {
          irohResult = await response.json();
        } else {
          irohError = `HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (error) {
        irohError = error instanceof Error ? error.message : String(error);
        console.warn("Iroh discovery failed:", irohError);
      }
    }

    // Determine status based on results
    // If at least one method succeeded, status is "completed"
    // If both methods were requested but both failed, status is "failed" and throw error
    // If only one method was requested and it failed, status is "pending" (non-blocking)
    // If one succeeds and one fails, status is "partial"
    let status: "pending" | "completed" | "failed" | "partial" = "pending";

    if (simpleproofResult && irohResult) {
      status = "completed";
    } else if (simpleproofResult || irohResult) {
      // One method succeeded, one failed or wasn't requested
      status = simpleproofError || irohError ? "partial" : "completed";
    } else if (simpleproofError && irohError) {
      // Both methods were requested but both failed
      status = "failed";
      throw new Error(
        `All attestation methods failed: SimpleProof: ${simpleproofError}, Iroh: ${irohError}`
      );
    }

    // Extract database IDs from results
    const simpleproofTimestampId = simpleproofResult?.id || null;
    const irohDiscoveryId = irohResult?.id || null;

    // Create attestation record in database
    const { data: attestationData, error: dbError } = await supabase
      .from("attestations")
      .insert({
        verification_id: request.verificationId,
        event_type: request.eventType,
        metadata: request.metadata ?? null,
        simpleproof_timestamp_id: simpleproofTimestampId,
        iroh_discovery_id: irohDiscoveryId,
        status,
        error_details:
          simpleproofError || irohError
            ? {
                simpleproof_error: simpleproofError,
                iroh_error: irohError,
              }
            : null,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Failed to persist attestation to database:", dbError);
      throw dbError;
    }

    // Build attestation object from database record
    const attestation: Attestation = {
      id: attestationData.id,
      verificationId: attestationData.verification_id,
      eventType: attestationData.event_type as AttestationEventType,
      metadata: normalizeMetadataToString(attestationData.metadata),
      simpleproofTimestamp: simpleproofResult,
      irohNodeDiscovery: irohResult,
      status: attestationData.status as
        | "pending"
        | "completed"
        | "failed"
        | "partial",
      errorDetails: attestationData.error_details || undefined,
      createdAt: Math.floor(
        new Date(attestationData.created_at).getTime() / 1000
      ),
      updatedAt: Math.floor(
        new Date(attestationData.updated_at).getTime() / 1000
      ),
    };

    return attestation;
  } catch (error) {
    console.error("Failed to create attestation:", error);
    throw error;
  }
}

/**
 * Retrieve all attestations for a verification attempt
 */
export async function getAttestations(
  verificationId: string
): Promise<Attestation[]> {
  try {
    // Query unified attestations table with joins to verification methods
    const { data: attestationsData, error: dbError } = await supabase
      .from("attestations")
      .select(
        `
        id,
        verification_id,
        event_type,
        metadata,
        status,
        error_details,
        created_at,
        updated_at,
        simpleproof_timestamp_id,
        iroh_discovery_id,
        simpleproof_timestamps (
          id,
          ots_proof,
          bitcoin_block,
          bitcoin_tx,
          created_at,
          verified_at,
          is_valid
        ),
        iroh_node_discovery (
          id,
          node_id,
          relay_url,
          direct_addresses,
          discovered_at,
          last_seen,
          is_reachable
        )
      `
      )
      .eq("verification_id", verificationId);

    if (dbError) throw dbError;

    // Transform database records to Attestation objects
    const attestations: Attestation[] = (attestationsData || []).map(
      (record: any) => {
        const simpleproofData = record.simpleproof_timestamps?.[0];
        const irohData = record.iroh_node_discovery?.[0];

        return {
          id: record.id,
          verificationId: record.verification_id,
          eventType: record.event_type as AttestationEventType,
          metadata: normalizeMetadataToString(record.metadata),
          simpleproofTimestamp: simpleproofData
            ? {
                id: simpleproofData.id,
                otsProof: simpleproofData.ots_proof,
                bitcoinBlock: simpleproofData.bitcoin_block,
                bitcoinTx: simpleproofData.bitcoin_tx,
                createdAt: simpleproofData.created_at,
                verifiedAt: simpleproofData.verified_at,
                isValid: simpleproofData.is_valid,
              }
            : undefined,
          irohNodeDiscovery: irohData
            ? {
                id: irohData.id,
                nodeId: irohData.node_id,
                relayUrl: irohData.relay_url,
                directAddresses: irohData.direct_addresses,
                discoveredAt: irohData.discovered_at,
                lastSeen: irohData.last_seen,
                isReachable: irohData.is_reachable,
              }
            : undefined,
          status: record.status as
            | "pending"
            | "completed"
            | "failed"
            | "partial",
          errorDetails: record.error_details || undefined,
          createdAt: Math.floor(new Date(record.created_at).getTime() / 1000),
          updatedAt: Math.floor(new Date(record.updated_at).getTime() / 1000),
        };
      }
    );

    // Sort by creation date (newest first)
    return attestations.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error("Failed to retrieve attestations:", error);
    throw error;
  }
}

/**
 * Get a single attestation by ID
 */
export async function getAttestation(
  attestationId: string
): Promise<Attestation | null> {
  try {
    // Query unified attestations table with joins to verification methods
    const { data: record, error: dbError } = await supabase
      .from("attestations")
      .select(
        `
        id,
        verification_id,
        event_type,
        metadata,
        status,
        error_details,
        created_at,
        updated_at,
        simpleproof_timestamps (
          id,
          ots_proof,
          bitcoin_block,
          bitcoin_tx,
          created_at,
          verified_at,
          is_valid
        ),
        iroh_node_discovery (
          id,
          node_id,
          relay_url,
          direct_addresses,
          discovered_at,
          last_seen,
          is_reachable
        )
      `
      )
      .eq("id", attestationId)
      .single();

    if (dbError) {
      if (dbError.code === "PGRST116") {
        // Not found
        return null;
      }
      throw dbError;
    }

    if (!record) {
      return null;
    }

    // Transform database record to Attestation object
    const simpleproofData = record.simpleproof_timestamps?.[0];
    const irohData = record.iroh_node_discovery?.[0];

    return {
      id: record.id,
      verificationId: record.verification_id,
      eventType: record.event_type as AttestationEventType,
      metadata: normalizeMetadataToString(record.metadata),
      simpleproofTimestamp: simpleproofData
        ? {
            id: simpleproofData.id,
            otsProof: simpleproofData.ots_proof,
            bitcoinBlock: simpleproofData.bitcoin_block,
            bitcoinTx: simpleproofData.bitcoin_tx,
            createdAt: simpleproofData.created_at,
            verifiedAt: simpleproofData.verified_at,
            isValid: simpleproofData.is_valid,
          }
        : undefined,
      irohNodeDiscovery: irohData
        ? {
            id: irohData.id,
            nodeId: irohData.node_id,
            relayUrl: irohData.relay_url,
            directAddresses: irohData.direct_addresses,
            discoveredAt: irohData.discovered_at,
            lastSeen: irohData.last_seen,
            isReachable: irohData.is_reachable,
          }
        : undefined,
      status: record.status as "pending" | "completed" | "failed" | "partial",
      errorDetails: record.error_details || undefined,
      createdAt: Math.floor(new Date(record.created_at).getTime() / 1000),
      updatedAt: Math.floor(new Date(record.updated_at).getTime() / 1000),
    };
  } catch (error) {
    console.error("Failed to retrieve attestation:", error);
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
    methods.push("SimpleProof");
  }
  if (attestation.irohNodeDiscovery) {
    methods.push("Iroh");
  }

  const eventLabels: Record<AttestationEventType, string> = {
    account_creation: "Account Created",
    key_rotation: "Keys Rotated",
    nfc_registration: "NFC Card Registered",
    family_federation: "Family Federation Created",
    guardian_role_change: "Guardian Role Changed",
  };

  return {
    title: eventLabels[attestation.eventType] || "Attestation",
    description: attestation.metadata || "No description provided",
    timestamp: date.toLocaleString(),
    methods,
  };
}
