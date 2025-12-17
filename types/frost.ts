/**
 * Centralized FROST Type Definitions
 *
 * This file contains shared TypeScript types for FROST API endpoints and sessions.
 * All FROST-related types should be defined here to prevent drift and ensure consistency.
 *
 * References:
 * - Authentication pattern: api/family/foundry.js:1457-1508
 * - Session management: netlify/functions/security/session-manager.ts
 * - FROST session state: lib/frost/frost-session-manager.ts
 */

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Request body for POST /api/federation/nostr/protect
 * Used by FamilyFederationCreationModal.tsx Step 1
 */
export interface PostFederationNostrProtectRequest {
  charterId: string;
  selectedRoles: string[];
  thresholds: Record<string, number>;
  founder: {
    displayName: string;
    founderPassword: string;
    retainGuardianStatus: boolean;
  };
}

/**
 * Response body for POST /api/federation/nostr/protect
 */
export interface PostFederationNostrProtectResponse {
  success: boolean;
  message?: string;
  data?: {
    publicKey: string;
    thresholds: Record<string, number>;
    sharesCreated: number;
  };
  error?: string;
  meta?: {
    timestamp: string;
  };
}

/**
 * Standard API error response
 * Consistent with api/family/foundry.js error format
 */
export interface FrostApiErrorResponse {
  success: false;
  error: string;
  meta?: {
    timestamp: string;
  };
}

// =============================================================================
// FROST Session Types (re-exported from frost-session-manager for convenience)
// =============================================================================

/**
 * FROST session status values
 * Matches database CHECK constraint in frost_signing_sessions table
 */
export type FrostSessionStatus =
  | "pending"
  | "nonce_collection"
  | "signing"
  | "aggregating"
  | "completed"
  | "failed"
  | "expired";

/**
 * FROST signing session record
 * Mirrors the frost_signing_sessions database table schema
 */
export interface FrostSession {
  id: string;
  session_id: string;
  family_id: string;
  message_hash: string;
  event_template?: string;
  event_type?: string;
  participants: string[];
  threshold: number;
  nonce_commitments: Record<string, string>;
  partial_signatures: Record<string, string>;
  final_signature?: { R: string; s: string };
  created_by: string;
  status: FrostSessionStatus;
  final_event_id?: string;
  created_at: number;
  updated_at?: number;
  nonce_collection_started_at?: number;
  signing_started_at?: number;
  completed_at?: number;
  failed_at?: number;
  expires_at: number;
  error_message?: string;
  requires_nfc_mfa?: boolean;
  nfc_mfa_policy?: "disabled" | "optional" | "required" | "required_for_high_value";
}

/**
 * Parameters for creating a new FROST session
 */
export interface CreateFrostSessionParams {
  familyId: string;
  messageHash: string;
  participants: string[];
  threshold: number;
  createdBy: string;
  eventTemplate?: string;
  eventType?: string;
  expirationSeconds?: number;
}

/**
 * Generic result wrapper for FROST session operations
 */
export interface FrostSessionResult<T = FrostSession> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Result of nonce commitment submission (Round 1)
 */
export interface FrostNonceSubmissionResult {
  success: boolean;
  nonceCount?: number;
  thresholdMet?: boolean;
  error?: string;
}

/**
 * Result of partial signature submission (Round 2)
 */
export interface FrostSignatureSubmissionResult {
  success: boolean;
  signatureCount?: number;
  thresholdMet?: boolean;
  error?: string;
}

/**
 * Result of signature aggregation
 */
export interface FrostAggregationResult {
  success: boolean;
  finalSignature?: { R: string; s: string };
  error?: string;
}

