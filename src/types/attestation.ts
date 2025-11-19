/**
 * Attestation Types
 * Phase 2 Week 3: NIP-03 OpenTimestamps Attestation Integration
 *
 * Comprehensive type definitions for NIP-03 attestation data structures,
 * API requests/responses, and status tracking.
 *
 * @compliance Privacy-first, zero-knowledge, no PII exposure
 */

// ============================================================================
// ATTESTATION STATUS TYPES
// ============================================================================

export type AttestationStatus =
  | "pending"
  | "in-progress"
  | "success"
  | "failure"
  | "skipped";

// NOTE: "simpleproof" here represents the Bitcoin-anchored timestamp provider slot.
// In the current architecture this is backed primarily by OpenTimestamps (OTS),
// with optional remote SimpleProof usage for premium flows.
export type AttestationMethod = "kind0" | "simpleproof" | "nip03" | "pkarr";

// ============================================================================
// ATTESTATION STEP TYPES
// ============================================================================

export interface AttestationStep {
  method: AttestationMethod;
  status: AttestationStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AttestationProgress {
  kind0: AttestationStep;
  simpleproof: AttestationStep;
  nip03: AttestationStep;
  pkarr: AttestationStep;
  overallStatus: AttestationStatus;
  estimatedTimeRemaining?: number;
}

// ============================================================================
// NIP-03 ATTESTATION DATA
// ============================================================================

export interface NIP03Attestation {
  id: string;
  user_duid: string;
  kind0_event_id: string;
  nip03_event_id: string;
  simpleproof_timestamp_id: string;
  ots_proof: string;
  bitcoin_block: number | null;
  bitcoin_tx: string | null;
  pkarr_address?: string;
  attestation_status: AttestationStatus;
  created_at: number;
  verified_at?: number;
  error?: string;
  metadata: {
    nip05: string;
    npub: string;
    event_type: string;
    relay_count?: number;
    published_relays?: string[];
  };
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface FetchAttestationRequest {
  userId?: string;
  eventId?: string;
  limit?: number;
}

export interface FetchAttestationResponse {
  success: boolean;
  attestation?: NIP03Attestation;
  attestations?: NIP03Attestation[];
  total?: number;
  error?: string;
}

export interface VerifyAttestationChainRequest {
  attestationId: string;
}

export interface VerifyAttestationChainResponse {
  success: boolean;
  isValid: boolean;
  kind0Valid: boolean;
  simpleproofValid: boolean;
  nip03Valid: boolean;
  pkarrValid: boolean;
  verifiedAt?: number;
  error?: string;
}

export interface DownloadOTSProofRequest {
  attestationId: string;
}

export interface DownloadOTSProofResponse {
  success: boolean;
  proof?: string;
  filename?: string;
  error?: string;
}

export interface GetAttestationStatusRequest {
  attestationId: string;
}

export interface GetAttestationStatusResponse {
  success: boolean;
  status: AttestationStatus;
  progress?: AttestationProgress;
  error?: string;
}

export interface RetryFailedAttestationRequest {
  attestationId: string;
}

export interface RetryFailedAttestationResponse {
  success: boolean;
  newAttestationId?: string;
  status: AttestationStatus;
  error?: string;
}

// ============================================================================
// REGISTRATION RESPONSE WITH ATTESTATION
// ============================================================================

export interface RegistrationAttestationResponse {
  nip03_event_id?: string;
  simpleproof_timestamp_id?: string;
  attestation_status: AttestationStatus;
  error?: string;
  metadata?: {
    bitcoin_block?: number;
    bitcoin_tx?: string;
    pkarr_address?: string;
    relay_count?: number;
  };
}

// ============================================================================
// UI COMPONENT PROPS
// ============================================================================

export interface NIP03AttestationProgressIndicatorProps {
  progress: AttestationProgress;
  compact?: boolean;
  showEstimatedTime?: boolean;
  className?: string;
}

export interface NIP03AttestationStatusDisplayProps {
  attestation: NIP03Attestation;
  onDetailsClick?: () => void;
  compact?: boolean;
  className?: string;
}

export interface NIP03AttestationDetailsModalProps {
  attestation: NIP03Attestation;
  isOpen: boolean;
  onClose: () => void;
  onRetry?: () => Promise<void>;
}

// ============================================================================
// SERVICE RESPONSE TYPES
// ============================================================================

export interface AttestationServiceError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface AttestationCacheEntry {
  attestation: NIP03Attestation;
  cachedAt: number;
  expiresAt: number;
}

// ============================================================================
// ATTESTATION MANAGER STATE
// ============================================================================

export interface AttestationManagerState {
  currentAttestation: NIP03Attestation | null;
  attestationHistory: NIP03Attestation[];
  progress: AttestationProgress | null;
  isLoading: boolean;
  error: AttestationServiceError | null;
  lastUpdated: number;
}

export interface AttestationManagerEvents {
  "attestation:started": { attestationId: string };
  "attestation:progress": { progress: AttestationProgress };
  "attestation:completed": { attestation: NIP03Attestation };
  "attestation:failed": { error: AttestationServiceError };
  "attestation:verified": { attestation: NIP03Attestation };
}
