/**
 * Attestation Manager
 * Handles creation, retrieval, and management of timestamped proofs
 * Integrates with Bitcoin-anchored timestamping (OpenTimestamps via Netlify) and Iroh verification systems
 *
 * @compliance Privacy-first, zero-knowledge, RLS policies
 */

import { getApiBaseUrlFromClientEnv } from "../config/env.client";
import { fetchWithAuth } from "../lib/auth/fetch-with-auth";

export type AttestationEventType =
  | "account_creation"
  | "key_rotation"
  | "nfc_registration"
  | "family_federation"
  | "guardian_role_change"
  | "physical_peer_onboarding"
  | "coordinator_attestation"
  | "batch_onboarding_session";

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
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
  request: AttestationRequest,
): Promise<Attestation> {
  // FIX: Provide more helpful error message for missing/invalid verificationId
  if (!request.verificationId) {
    throw new Error(
      "Missing verificationId - verification record was not created during registration. You can create verification records later from your profile settings.",
    );
  }
  if (!isValidUuid(request.verificationId)) {
    throw new Error(
      `Invalid verificationId format: "${request.verificationId}" is not a valid UUID. Expected format from verification results.`,
    );
  }

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
        },
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
      simpleproofError = error instanceof Error ? error.message : String(error);
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
      `All attestation methods failed: SimpleProof: ${simpleproofError}, Iroh: ${irohError}`,
    );
  }

  // Extract database IDs from results
  const simpleproofTimestampId = simpleproofResult?.id || null;
  const irohDiscoveryId = irohResult?.id || null;

  // Create attestation record via server-mediated endpoint to bypass client RLS
  try {
    const apiBaseUrl = getApiBaseUrlFromClientEnv();
    const response = await fetchWithAuth(
      `${apiBaseUrl}/auth/register-identity`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create_attestation",
          verification_id: request.verificationId,
          event_type: request.eventType,
          metadata: request.metadata ?? null,
          simpleproof_timestamp_id: simpleproofTimestampId,
          iroh_discovery_id: irohDiscoveryId,
          status,
          error_details:
            simpleproofError || irohError
              ? { simpleproof_error: simpleproofError, iroh_error: irohError }
              : null,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Failed to create attestation via backend:", {
        status: response.status,
        body: text,
      });
      throw new Error("Failed to create attestation record on server");
    }

    const json = (await response.json()) as {
      success?: boolean;
      attestation?: any;
      error?: string;
    };

    if (!json.success || !json.attestation) {
      console.error("Backend attestation response missing data:", json);
      throw new Error(
        json.error || "Attestation server returned an unexpected response",
      );
    }

    const attestationData = json.attestation;

    // Build attestation object from backend response
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
        new Date(attestationData.created_at).getTime() / 1000,
      ),
      updatedAt: Math.floor(
        new Date(attestationData.updated_at).getTime() / 1000,
      ),
    };

    return attestation;
  } catch (error) {
    console.error("Failed to create attestation via backend:", error);
    throw error;
  }
}

/**
 * Retrieve all attestations for a verification attempt
 */
export async function getAttestations(
  verificationId: string,
): Promise<Attestation[]> {
  if (!isValidUuid(verificationId)) {
    throw new Error(
      "Invalid verificationId format (must be valid UUID from verification results)",
    );
  }

  try {
    const apiBaseUrl = getApiBaseUrlFromClientEnv();
    const response = await fetchWithAuth(
      `${apiBaseUrl}/auth/register-identity`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "get_attestations",
          verification_id: verificationId,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Failed to retrieve attestations via backend:", {
        status: response.status,
        body: text,
      });
      throw new Error("Failed to load attestations from server");
    }

    const json = (await response.json()) as {
      success?: boolean;
      attestations?: any[];
      error?: string;
    };

    if (!json.success || !Array.isArray(json.attestations)) {
      console.error("Backend attestation list response missing data:", json);
      throw new Error(
        json.error || "Attestation server returned an unexpected response",
      );
    }

    const attestations: Attestation[] = json.attestations.map((record: any) => {
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
    });

    // Sort by creation date (newest first)
    return attestations.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error("Failed to retrieve attestations via backend:", error);
    throw error;
  }
}

/**
 * Get a single attestation by ID
 */
export async function getAttestation(
  attestationId: string,
): Promise<Attestation | null> {
  if (!isValidUuid(attestationId)) {
    throw new Error(
      "Invalid attestationId format (must be valid UUID from attestations table)",
    );
  }

  try {
    const apiBaseUrl = getApiBaseUrlFromClientEnv();
    const response = await fetchWithAuth(
      `${apiBaseUrl}/auth/register-identity`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "get_attestation",
          attestation_id: attestationId,
        }),
      },
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const text = await response.text();
      console.error("Failed to retrieve attestation via backend:", {
        status: response.status,
        body: text,
      });
      throw new Error("Failed to load attestation from server");
    }

    const json = (await response.json()) as {
      success?: boolean;
      attestation?: any;
      error?: string;
    };

    if (!json.success || !json.attestation) {
      console.error("Backend attestation response missing data:", json);
      throw new Error(
        json.error || "Attestation server returned an unexpected response",
      );
    }

    const record = json.attestation;
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
    console.error("Failed to retrieve attestation via backend:", error);
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
    physical_peer_onboarding: "Physical Peer Onboarded",
    coordinator_attestation: "Coordinator Attestation",
    batch_onboarding_session: "Batch Onboarding Session",
  };

  return {
    title: eventLabels[attestation.eventType] || "Attestation",
    description: attestation.metadata || "No description provided",
    timestamp: date.toLocaleString(),
    methods,
  };
}

// ============================================================================
// ONBOARDING-SPECIFIC TYPES AND FUNCTIONS
// ============================================================================

/**
 * Parameters for creating a coordinator attestation
 * Used during physical peer onboarding to vouch for participant identity
 */
export interface CoordinatorAttestationParams {
  /** Coordinator's Nostr public key (npub format) */
  coordinatorNpub: string;
  /** Participant's Nostr public key (npub format) */
  participantNpub: string;
  /** Participant's NIP-05 identifier */
  participantNip05: string;
  /** Family federation ID linking coordinator and participant */
  federationId: string;
  /** Onboarding session ID */
  sessionId: string;
  /** NIP-03 attestation event ID for the participant */
  nip03EventId: string;
  /** Verification ID for the attestation record */
  verificationId: string;
  /** Optional metadata (onboarding method, timestamp, campaign ID, etc.) */
  metadata?: Record<string, any>;
}

/**
 * Result of a batch attestation operation
 * Includes success/failure status for each attestation
 */
export interface BatchAttestationResult {
  /** Index of the request in the original batch */
  index: number;
  /** Whether the attestation was created successfully */
  success: boolean;
  /** The created attestation (if successful) */
  attestation?: Attestation;
  /** Error details (if failed) */
  error?: string;
  /** Original request that was processed */
  request: AttestationRequest;
}

/**
 * Options for batch attestation processing
 */
export interface BatchAttestationOptions {
  /** Maximum number of concurrent attestation requests (default: 5) */
  concurrency?: number;
  /** Progress callback invoked after each attestation completes */
  onProgress?: (completed: number, total: number) => void;
  /** Whether to stop processing on first error (default: false - continue on errors) */
  stopOnError?: boolean;
}

/**
 * Create a coordinator attestation vouching for a participant's identity
 * Used during physical peer onboarding workflows
 *
 * @param params - Coordinator attestation parameters
 * @returns Promise resolving to the created attestation
 * @throws Error if attestation creation fails
 *
 * @example
 * ```typescript
 * const attestation = await createCoordinatorAttestation({
 *   coordinatorNpub: 'npub1...',
 *   participantNpub: 'npub1...',
 *   participantNip05: 'user@domain.com',
 *   federationId: 'fed_123',
 *   sessionId: 'session_456',
 *   nip03EventId: 'nip03_789',
 *   verificationId: 'uuid-...',
 *   metadata: { onboarding_method: 'kiosk', campaign_id: 'campaign_001' }
 * });
 * ```
 */
export async function createCoordinatorAttestation(
  params: CoordinatorAttestationParams,
): Promise<Attestation> {
  // Validate required parameters
  if (
    !params.coordinatorNpub ||
    !params.participantNpub ||
    !params.participantNip05
  ) {
    throw new Error("Missing required coordinator attestation parameters");
  }

  if (!params.federationId || !params.sessionId || !params.nip03EventId) {
    throw new Error("Missing required onboarding context parameters");
  }

  if (!params.verificationId) {
    throw new Error("Missing verificationId for coordinator attestation");
  }

  // Build metadata object with coordinator attestation details
  const metadata = {
    type: "coordinator_attestation",
    coordinator_npub: params.coordinatorNpub,
    participant_npub: params.participantNpub,
    participant_nip05: params.participantNip05,
    federation_id: params.federationId,
    session_id: params.sessionId,
    nip03_event_id: params.nip03EventId,
    timestamp: Math.floor(Date.now() / 1000),
    ...params.metadata,
  };

  // Create attestation using existing createAttestation function
  // Coordinator attestations typically include SimpleProof timestamping
  const request: AttestationRequest = {
    verificationId: params.verificationId,
    eventType: "coordinator_attestation",
    metadata: JSON.stringify(metadata),
    includeSimpleproof: true,
    includeIroh: false, // Iroh not needed for coordinator attestations
  };

  return await createAttestation(request);
}

/**
 * Create multiple attestations in parallel with configurable concurrency
 * Allows partial success - some attestations can succeed even if others fail
 *
 * @param requests - Array of attestation requests to process
 * @param options - Batch processing options (concurrency, progress callback, error handling)
 * @returns Promise resolving to array of results (success/failure for each request)
 *
 * @example
 * ```typescript
 * const results = await createBatchAttestations(
 *   [
 *     { verificationId: 'uuid-1', eventType: 'physical_peer_onboarding', ... },
 *     { verificationId: 'uuid-2', eventType: 'physical_peer_onboarding', ... },
 *     { verificationId: 'uuid-3', eventType: 'physical_peer_onboarding', ... },
 *   ],
 *   {
 *     concurrency: 5,
 *     onProgress: (completed, total) => console.log(`${completed}/${total} complete`),
 *     stopOnError: false
 *   }
 * );
 *
 * // Check results
 * const successful = results.filter(r => r.success);
 * const failed = results.filter(r => !r.success);
 * console.log(`${successful.length} succeeded, ${failed.length} failed`);
 * ```
 */
export async function createBatchAttestations(
  requests: AttestationRequest[],
  options: BatchAttestationOptions = {},
): Promise<BatchAttestationResult[]> {
  const { concurrency = 5, onProgress, stopOnError = false } = options;

  if (!Array.isArray(requests) || requests.length === 0) {
    throw new Error("Batch attestation requests must be a non-empty array");
  }

  if (concurrency < 1) {
    throw new Error("Concurrency must be at least 1");
  }

  const results: BatchAttestationResult[] = [];
  let completed = 0;
  let shouldStop = false;

  // Process requests in batches with concurrency limit
  for (let i = 0; i < requests.length; i += concurrency) {
    if (shouldStop) {
      // If stopOnError is true and we encountered an error, mark remaining as failed
      for (let j = i; j < requests.length; j++) {
        results.push({
          index: j,
          success: false,
          error: "Batch processing stopped due to previous error",
          request: requests[j],
        });
      }
      break;
    }

    // Get the next batch of requests
    const batch = requests.slice(i, i + concurrency);
    const batchStartIndex = i;

    // Process batch in parallel
    const batchPromises = batch.map(async (request, batchIndex) => {
      const index = batchStartIndex + batchIndex;

      try {
        const attestation = await createAttestation(request);

        const result: BatchAttestationResult = {
          index,
          success: true,
          attestation,
          request,
        };

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        const result: BatchAttestationResult = {
          index,
          success: false,
          error: errorMessage,
          request,
        };

        // If stopOnError is true, set flag to stop processing
        if (stopOnError) {
          shouldStop = true;
        }

        return result;
      }
    });

    // Wait for batch to complete
    const batchResults = await Promise.all(batchPromises);

    // Add results to overall results array
    results.push(...batchResults);

    // Update progress
    completed += batchResults.length;
    if (onProgress) {
      onProgress(completed, requests.length);
    }
  }

  return results;
}
