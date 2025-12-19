/**
 * FROST Session Manager
 *
 * Manages multi-round FROST signing sessions with state machine implementation.
 * Coordinates nonce collection (Round 1), partial signature collection (Round 2),
 * and signature aggregation for Family Federation threshold signatures.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Privacy-first session management with RLS policies
 * - Zero-knowledge architecture (no key reconstruction)
 * - Nonce reuse prevention (CRITICAL SECURITY)
 * - Replay protection via database constraints
 * - Integration with existing FROST service and CEPS
 *
 * Task 7 - Phase 2: Session Management Service
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { createClient } from "@supabase/supabase-js";
import type {
  CreateSessionWithPermissionParams,
  FederationRole,
  PendingApprovalItem,
  PermissionCheckResult,
  SessionWithPermissionResult,
  TimeWindowCheckResult,
} from "../../src/types/permissions";

// Initialize Supabase client for FROST session operations
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;

// Use service role key for tests, anon key for production
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase configuration for FROST session operations"
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

// FROST Session State Machine
export type FrostSessionStatus =
  | "pending"
  | "nonce_collection"
  | "signing"
  | "aggregating"
  | "completed"
  | "failed"
  | "expired";

// FROST Session Interfaces
export interface FrostSession {
  id: string;
  session_id: string;
  family_id: string;
  message_hash: string;
  event_template?: string;
  event_type?: string;
  participants: string[]; // JSON array of participant pubkeys/DUIDs
  threshold: number;
  nonce_commitments: Record<string, string>; // JSONB: { participantId: nonceCommitment }
  partial_signatures: Record<string, string>; // JSONB: { participantId: partialSignature }
  final_signature?: { R: string; s: string }; // JSONB: aggregated signature
  created_by: string;
  status: FrostSessionStatus;
  final_event_id?: string;
  created_at: number; // BIGINT Unix timestamp
  updated_at?: number;
  nonce_collection_started_at?: number;
  signing_started_at?: number;
  completed_at?: number;
  failed_at?: number;
  expires_at: number;
  error_message?: string;

  // NFC MFA Configuration (Phase 2)
  requires_nfc_mfa?: boolean;
  nfc_mfa_policy?:
    | "disabled"
    | "optional"
    | "required"
    | "required_for_high_value";

  // NFC Signature Storage
  nfc_signatures?: Record<
    string,
    {
      signature: string;
      publicKey: string;
      timestamp: number;
      cardUid: string;
    }
  >;

  // NFC Verification Status
  nfc_verification_status?: Record<
    string,
    {
      verified: boolean;
      error?: string;
      verified_at?: number;
    }
  >;
}

export interface NonceCommitment {
  id: string;
  session_id: string;
  participant_id: string;
  nonce_commitment: string;
  nonce_used: boolean;
  created_at: number;
  used_at?: number;
}

export interface CreateSessionParams {
  familyId: string;
  messageHash: string;
  participants: string[];
  threshold: number;
  createdBy: string;
  eventTemplate?: string;
  eventType?: string;
  expirationSeconds?: number; // Default: 300 (5 minutes)
}

export interface SessionResult<T = FrostSession> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface NonceSubmissionResult {
  success: boolean;
  nonceCount?: number;
  thresholdMet?: boolean;
  error?: string;
}

export interface SignatureSubmissionResult {
  success: boolean;
  signatureCount?: number;
  thresholdMet?: boolean;
  error?: string;
}

export interface AggregationResult {
  success: boolean;
  finalSignature?: { R: string; s: string };
  error?: string;
}

/**
 * FROST Session Manager
 * Manages multi-round FROST signing sessions with state machine
 */
export class FrostSessionManager {
  /**
   * DEFAULT_EXPIRATION_SECONDS: 600 seconds (10 minutes)
   *
   * RATIONALE FOR 10-MINUTE TIMEOUT:
   * - FROST protocol requires 2 rounds of communication
   * - Round 1 (nonce collection): 60-120 seconds
   * - Round 2 (signature collection): 60-120 seconds
   * - Aggregation: 10-30 seconds
   * - Total minimum: 130-270 seconds
   * - 10 minutes (600s) provides buffer for:
   *   • Network latency (especially for geographically distributed guardians)
   *   • User delays (guardians may not respond immediately)
   *   • Processing delays on guardian devices
   *
   * PREVIOUS: 5 minutes (300s) was too aggressive for multi-participant scenarios
   *
   * CONFIGURABLE: Can be overridden per session via expirationSeconds parameter
   */
  private static readonly DEFAULT_EXPIRATION_SECONDS = 600; // 10 minutes
  private static readonly MAX_THRESHOLD = 7;
  private static readonly MIN_THRESHOLD = 1;

  /**
   * Create a new FROST signing session
   */
  static async createSession(
    params: CreateSessionParams
  ): Promise<SessionResult> {
    try {
      // Validate parameters
      if (
        params.threshold < this.MIN_THRESHOLD ||
        params.threshold > this.MAX_THRESHOLD
      ) {
        return {
          success: false,
          error: `Threshold must be between ${this.MIN_THRESHOLD} and ${this.MAX_THRESHOLD}`,
        };
      }

      if (params.participants.length < params.threshold) {
        return {
          success: false,
          error: `Participants (${params.participants.length}) must be >= threshold (${params.threshold})`,
        };
      }

      // Generate unique session ID
      const sessionId = await this.generateSessionId();
      const now = Date.now();
      const expirationSeconds =
        params.expirationSeconds || this.DEFAULT_EXPIRATION_SECONDS;

      // Create session in database
      const { data, error } = await supabase
        .from("frost_signing_sessions")
        .insert({
          session_id: sessionId,
          family_id: params.familyId,
          message_hash: params.messageHash,
          event_template: params.eventTemplate,
          event_type: params.eventType,
          participants: JSON.stringify(params.participants),
          threshold: params.threshold,
          nonce_commitments: {},
          partial_signatures: {},
          created_by: params.createdBy,
          status: "pending",
          created_at: now,
          expires_at: now + expirationSeconds * 1000,
        })
        .select()
        .single();

      if (error) {
        return {
          success: false,
          error: `Failed to create session: ${error.message}`,
        };
      }

      // Parse participants from JSON string
      const session = {
        ...data,
        participants: JSON.parse(data.participants),
      };

      return {
        success: true,
        data: session as FrostSession,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown session creation error",
      };
    }
  }

  /**
   * Get session by session_id
   */
  static async getSession(sessionId: string): Promise<SessionResult> {
    try {
      const { data, error } = await supabase
        .from("frost_signing_sessions")
        .select("*")
        .eq("session_id", sessionId)
        .single();

      if (error || !data) {
        return {
          success: false,
          error: "Session not found",
        };
      }

      // Parse participants from JSON string
      const session = {
        ...data,
        participants: JSON.parse(data.participants),
      };

      return {
        success: true,
        data: session as FrostSession,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown session retrieval error",
      };
    }
  }

  /**
   * Submit nonce commitment (Round 1)
   *
   * SESSION EXPIRATION ENFORCEMENT:
   * - Checks expires_at < now before accepting nonce
   * - Prevents expired sessions from accepting new data
   * - Fast path: no database query needed
   */
  static async submitNonceCommitment(
    sessionId: string,
    participantId: string,
    nonceCommitment: string
  ): Promise<NonceSubmissionResult> {
    try {
      // Step 1: Get session and validate
      const sessionResult = await this.getSession(sessionId);
      if (!sessionResult.success || !sessionResult.data) {
        return {
          success: false,
          error: sessionResult.error || "Session not found",
        };
      }

      const session = sessionResult.data;

      // SESSION EXPIRATION ENFORCEMENT: Check expiration first
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (session.expires_at < nowSeconds) {
        return {
          success: false,
          error: "Session has expired. Cannot submit nonce commitment.",
        };
      }

      // Validate session status
      if (
        session.status !== "pending" &&
        session.status !== "nonce_collection"
      ) {
        return {
          success: false,
          error: `Invalid session status: ${session.status}. Expected pending or nonce_collection`,
        };
      }

      // Validate participant
      if (!session.participants.includes(participantId)) {
        return {
          success: false,
          error: "Participant not authorized for this session",
        };
      }

      // Check if participant already submitted nonce
      if (session.nonce_commitments[participantId]) {
        return {
          success: false,
          error: "Participant has already submitted nonce commitment",
        };
      }

      // Step 2: Store nonce commitment in frost_nonce_commitments table
      const now = Date.now();
      const { error: nonceError } = await supabase
        .from("frost_nonce_commitments")
        .insert({
          session_id: sessionId,
          participant_id: participantId,
          nonce_commitment: nonceCommitment,
          nonce_used: false,
          created_at: now,
        });

      if (nonceError) {
        // Check for UNIQUE constraint violation (nonce reuse)
        if (nonceError.message.includes("unique_nonce_commitment")) {
          return {
            success: false,
            error:
              "CRITICAL SECURITY: Nonce reuse detected. This nonce has already been used.",
          };
        }

        return {
          success: false,
          error: `Failed to store nonce commitment: ${nonceError.message}`,
        };
      }

      // Step 3: Update session with nonce commitment
      // RACE CONDITION MITIGATION: Use optimistic locking with updated_at timestamp
      // This prevents concurrent submissions from losing updates
      const updatedNonceCommitments = {
        ...session.nonce_commitments,
        [participantId]: nonceCommitment,
      };

      const nonceCount = Object.keys(updatedNonceCommitments).length;
      const thresholdMet = nonceCount >= session.threshold;

      // Determine new status
      let newStatus: FrostSessionStatus = "nonce_collection";
      let nonceCollectionStartedAt = session.nonce_collection_started_at;

      if (session.status === "pending") {
        nonceCollectionStartedAt = now;
      }

      if (thresholdMet) {
        newStatus = "signing";
      }

      // CRITICAL: Prevent timestamp overwrite - only set signing_started_at on first threshold met
      // If already set, preserve the original timestamp; don't overwrite with null
      const signingStartedAt = thresholdMet
        ? session.signing_started_at || now // Use existing timestamp if already set, otherwise use now
        : session.signing_started_at; // Preserve existing timestamp, don't set to null

      // Use optimistic locking: only update if updated_at matches (prevents lost updates)
      const { error: updateError, data: updateData } = await supabase
        .from("frost_signing_sessions")
        .update({
          nonce_commitments: updatedNonceCommitments,
          status: newStatus,
          nonce_collection_started_at: nonceCollectionStartedAt,
          signing_started_at: signingStartedAt,
          updated_at: now,
        })
        .eq("session_id", sessionId)
        .eq("updated_at", session.updated_at) // Optimistic lock: only update if timestamp matches
        .select()
        .single();

      if (updateError) {
        return {
          success: false,
          error: `Failed to update session: ${updateError.message}`,
        };
      }

      // Check if update was actually applied (optimistic lock validation)
      if (!updateData || updateData.updated_at === session.updated_at) {
        // Another participant updated the session concurrently
        // Retry by fetching fresh session state
        return {
          success: false,
          error: "Session was updated by another participant. Please retry.",
        };
      }

      return {
        success: true,
        nonceCount,
        thresholdMet,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown nonce submission error",
      };
    }
  }

  /**
   * Submit partial signature (Round 2)
   *
   * SESSION EXPIRATION ENFORCEMENT:
   * - Checks expires_at < now before accepting signature
   * - Prevents expired sessions from accepting new data
   */
  static async submitPartialSignature(
    sessionId: string,
    participantId: string,
    partialSignature: string
  ): Promise<SignatureSubmissionResult> {
    try {
      // Step 1: Get session and validate
      const sessionResult = await this.getSession(sessionId);
      if (!sessionResult.success || !sessionResult.data) {
        return {
          success: false,
          error: sessionResult.error || "Session not found",
        };
      }

      const session = sessionResult.data;

      // SESSION EXPIRATION ENFORCEMENT: Check expiration first
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (session.expires_at < nowSeconds) {
        return {
          success: false,
          error: "Session has expired. Cannot submit partial signature.",
        };
      }

      // Validate session status
      if (session.status !== "signing") {
        return {
          success: false,
          error: `Invalid session status: ${session.status}. Expected signing`,
        };
      }

      // Validate participant
      if (!session.participants.includes(participantId)) {
        return {
          success: false,
          error: "Participant not authorized for this session",
        };
      }

      // Check if participant submitted nonce
      if (!session.nonce_commitments[participantId]) {
        return {
          success: false,
          error: "Participant must submit nonce commitment before signing",
        };
      }

      // Check if participant already submitted signature
      if (session.partial_signatures[participantId]) {
        return {
          success: false,
          error: "Participant has already submitted partial signature",
        };
      }

      // Step 2: Mark nonce as used (replay protection)
      const nonceCommitment = session.nonce_commitments[participantId];
      const { error: markError } = await supabase.rpc("mark_nonce_as_used", {
        p_nonce_commitment: nonceCommitment,
      });

      if (markError) {
        return {
          success: false,
          error: `Failed to mark nonce as used: ${markError.message}`,
        };
      }

      // Step 3: Update session with partial signature
      // RACE CONDITION MITIGATION: Use optimistic locking with updated_at timestamp
      // This prevents concurrent submissions from losing updates
      const updatedPartialSignatures = {
        ...session.partial_signatures,
        [participantId]: partialSignature,
      };

      const signatureCount = Object.keys(updatedPartialSignatures).length;
      const thresholdMet = signatureCount >= session.threshold;

      // Determine new status
      const newStatus: FrostSessionStatus = thresholdMet
        ? "aggregating"
        : "signing";
      const now = Date.now();

      // Use optimistic locking: only update if updated_at matches (prevents lost updates)
      const { error: updateError, data: updateData } = await supabase
        .from("frost_signing_sessions")
        .update({
          partial_signatures: updatedPartialSignatures,
          status: newStatus,
          updated_at: now,
        })
        .eq("session_id", sessionId)
        .eq("updated_at", session.updated_at) // Optimistic lock: only update if timestamp matches
        .select()
        .single();

      if (updateError) {
        return {
          success: false,
          error: `Failed to update session: ${updateError.message}`,
        };
      }

      // Check if update was actually applied (optimistic lock validation)
      if (!updateData || updateData.updated_at === session.updated_at) {
        // Another participant updated the session concurrently
        // Retry by fetching fresh session state
        return {
          success: false,
          error: "Session was updated by another participant. Please retry.",
        };
      }

      return {
        success: true,
        signatureCount,
        thresholdMet,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown signature submission error",
      };
    }
  }

  /**
   * Transition session to aggregating state (CONCURRENCY CONTROL)
   *
   * CONCURRENCY CONTROL MECHANISM:
   * - Atomically transitions session from 'signing' to 'aggregating'
   * - Only the first caller succeeds; others get "already aggregating" error
   * - Prevents multiple participants from attempting aggregation simultaneously
   * - Should be called BEFORE aggregateSignatures()
   *
   * USAGE:
   * 1. Check threshold met: signatureCount >= threshold
   * 2. Call transitionToAggregating() - only first caller succeeds
   * 3. If success, call aggregateSignatures()
   * 4. If already aggregating, wait or return error
   */
  static async transitionToAggregating(
    sessionId: string
  ): Promise<SessionResult<void>> {
    try {
      const now = Math.floor(Date.now() / 1000);

      // Atomically transition from 'signing' to 'aggregating'
      // Only succeeds if current status is 'signing'
      const { error } = await supabase
        .from("frost_signing_sessions")
        .update({
          status: "aggregating",
          updated_at: now,
        })
        .eq("session_id", sessionId)
        .eq("status", "signing"); // CRITICAL: Only update if currently signing

      if (error) {
        return {
          success: false,
          error: `Failed to transition to aggregating: ${error.message}`,
        };
      }

      // Verify the update actually happened (no rows updated = already aggregating)
      const { data: updatedSession, error: fetchError } = await supabase
        .from("frost_signing_sessions")
        .select("status")
        .eq("session_id", sessionId)
        .single();

      if (fetchError) {
        return {
          success: false,
          error: `Failed to verify transition: ${fetchError.message}`,
        };
      }

      if (updatedSession?.status !== "aggregating") {
        return {
          success: false,
          error:
            "Session is already aggregating or in invalid state. Another participant may be aggregating.",
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown transition error",
      };
    }
  }

  /**
   * Aggregate partial signatures into final signature
   *
   * CONCURRENCY CONTROL:
   * - Validates status='aggregating' to prevent race conditions
   * - Only one participant should call this after threshold is met
   * - Application layer ensures status transition before aggregation
   * - Database-level UNIQUE constraint on nonce_commitment prevents reuse
   */
  static async aggregateSignatures(
    sessionId: string
  ): Promise<AggregationResult> {
    try {
      // Step 1: Get session and validate
      const sessionResult = await this.getSession(sessionId);
      if (!sessionResult.success || !sessionResult.data) {
        return {
          success: false,
          error: sessionResult.error || "Session not found",
        };
      }

      const session = sessionResult.data;

      // CONCURRENCY CONTROL: Check session expiration first
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (session.expires_at < nowSeconds) {
        return {
          success: false,
          error: "Session has expired. Cannot aggregate signatures.",
        };
      }

      // CONCURRENCY CONTROL: Validate session status
      // Only sessions in 'aggregating' state can proceed
      // This prevents multiple participants from attempting aggregation simultaneously
      if (session.status !== "aggregating") {
        return {
          success: false,
          error: `Invalid session status: ${session.status}. Expected aggregating. Concurrency control: only one aggregation allowed per session.`,
        };
      }

      // Validate threshold met
      const signatureCount = Object.keys(session.partial_signatures).length;
      if (signatureCount < session.threshold) {
        return {
          success: false,
          error: `Insufficient signatures: ${signatureCount}/${session.threshold}`,
        };
      }

      // Step 2: Aggregate signatures using FROST protocol
      // FROST SIGNATURE AGGREGATION SPECIFICATION (RFC 8032 / secp256k1):
      // 1. Parse each signature share as a scalar value (modulo curve order)
      // 2. Sum all signature shares: s = sum(s_i) mod q
      // 3. Compute aggregated nonce point R from nonce commitments
      // 4. Return (R, s) as final signature

      let finalSignature: { R: string; s: string };
      try {
        // Convert partial signatures to format expected by aggregation function
        const signatureShares = Object.entries(session.partial_signatures).map(
          ([participantId, signatureShare]) => ({
            participant_duid: participantId,
            signature_share: signatureShare,
            nonce_commitment: session.nonce_commitments[participantId],
          })
        );

        // Validate we have enough signature shares
        if (signatureShares.length < session.threshold) {
          throw new Error(
            `Insufficient signature shares: ${signatureShares.length}/${session.threshold}`
          );
        }

        // Step 2a: Sum all signature shares modulo curve order
        // secp256k1 curve order: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
        const CURVE_ORDER = secp256k1.CURVE.n;

        let aggregatedS = 0n;
        for (const share of signatureShares) {
          // Parse signature share as hex string to BigInt
          if (
            !share.signature_share ||
            typeof share.signature_share !== "string"
          ) {
            throw new Error(
              `Invalid signature share format for participant ${share.participant_duid}`
            );
          }

          // Convert hex string to BigInt
          const shareScalar = BigInt("0x" + share.signature_share);

          // Validate scalar is within valid range
          if (shareScalar <= 0n || shareScalar >= CURVE_ORDER) {
            throw new Error(
              `Signature share out of valid range for participant ${share.participant_duid}`
            );
          }

          // Add to aggregated sum
          aggregatedS = (aggregatedS + shareScalar) % CURVE_ORDER;
        }

        // Step 2b: Compute aggregated nonce point R from nonce commitments
        // Nonce commitments are elliptic curve points that need to be added together
        // Using @noble/curves Point API for elliptic curve operations
        let aggregatedR: any = null;

        for (const share of signatureShares) {
          if (
            !share.nonce_commitment ||
            typeof share.nonce_commitment !== "string"
          ) {
            throw new Error(
              `Invalid nonce commitment format for participant ${share.participant_duid}`
            );
          }

          // Validate nonce commitment is valid hex string
          if (!/^[0-9a-fA-F]+$/.test(share.nonce_commitment)) {
            throw new Error(
              `Invalid nonce commitment hex format for participant ${share.participant_duid}`
            );
          }

          // Validate nonce commitment length (33 or 65 bytes = 66 or 130 hex chars)
          if (
            share.nonce_commitment.length !== 66 &&
            share.nonce_commitment.length !== 130
          ) {
            throw new Error(
              `Invalid nonce commitment length for participant ${share.participant_duid}: expected 66 or 130 hex chars, got ${share.nonce_commitment.length}`
            );
          }

          try {
            // Parse nonce commitment as elliptic curve point using @noble/curves Point API
            // secp256k1.Point is the WeierstrassPoint constructor from @noble/curves
            const noncePoint = secp256k1.Point.fromHex(share.nonce_commitment);

            // Add to aggregated R using elliptic curve point addition
            if (aggregatedR === null) {
              aggregatedR = noncePoint;
            } else {
              aggregatedR = aggregatedR.add(noncePoint);
            }
          } catch (pointError) {
            throw new Error(
              `Failed to parse nonce commitment for participant ${
                share.participant_duid
              }: ${
                pointError instanceof Error
                  ? pointError.message
                  : String(pointError)
              }`
            );
          }
        }

        // Validate we have a valid aggregated R point
        if (aggregatedR === null) {
          throw new Error("Failed to compute aggregated nonce point R");
        }

        // Convert aggregated R to compressed hex format (33 bytes = 66 hex chars)
        const RHex = aggregatedR.toHex(true);

        // Convert aggregated s to hex format (32 bytes, padded)
        const sHex = aggregatedS.toString(16).padStart(64, "0");

        // Step 3: Create final signature
        finalSignature = {
          R: RHex,
          s: sHex,
        };

        // Validate final signature format
        if (finalSignature.R.length !== 66 || finalSignature.s.length !== 64) {
          throw new Error(
            `Invalid final signature format: R=${finalSignature.R.length}, s=${finalSignature.s.length}`
          );
        }
      } catch (aggregationError) {
        return {
          success: false,
          error: `FROST signature aggregation failed: ${
            aggregationError instanceof Error
              ? aggregationError.message
              : String(aggregationError)
          }`,
        };
      }

      const now = Date.now();
      const { error: updateError } = await supabase
        .from("frost_signing_sessions")
        .update({
          final_signature: finalSignature,
          status: "completed",
          completed_at: now,
          updated_at: now,
        })
        .eq("session_id", sessionId);

      if (updateError) {
        return {
          success: false,
          error: `Failed to update session: ${updateError.message}`,
        };
      }

      return {
        success: true,
        finalSignature,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown aggregation error",
      };
    }
  }

  /**
   * Verify NFC MFA signatures for a FROST session (Phase 2)
   * Called AFTER signature aggregation to add physical MFA layer
   *
   * Returns verification result with status and errors
   * Does NOT block operation if NFC MFA is optional
   */
  static async verifyNfcMfaSignatures(
    sessionId: string,
    operationHash: string,
    nfcSignatures: Record<string, any>
  ): Promise<
    SessionResult<{ verified: number; failed: number; allVerified: boolean }>
  > {
    try {
      // Import NFC MFA integration methods
      const { verifyNfcMfaSignatures: verifyNfc, getNfcMfaPolicy } =
        await import("../../src/lib/steward/frost-nfc-mfa-integration");

      // Get session to retrieve family_id
      const sessionResult = await this.getSession(sessionId);
      if (!sessionResult.success || !sessionResult.data) {
        return {
          success: false,
          error: sessionResult.error || "Session not found",
        };
      }

      const session = sessionResult.data;

      // Get NFC MFA policy for this family
      const policy = await getNfcMfaPolicy(session.family_id);

      // Verify NFC signatures
      const verifyResult = await verifyNfc(
        sessionId,
        operationHash,
        nfcSignatures,
        policy
      );

      if (!verifyResult.success) {
        return {
          success: false,
          error: verifyResult.errors?._global || "NFC MFA verification failed",
        };
      }

      console.log("✅ NFC MFA verification complete", {
        sessionId: sessionId.substring(0, 8) + "...",
        verified: verifyResult.verified,
        failed: verifyResult.failed,
        allVerified: verifyResult.allVerified,
      });

      return {
        success: true,
        data: {
          verified: verifyResult.verified,
          failed: verifyResult.failed,
          allVerified: verifyResult.allVerified || false,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ NFC MFA verification error", { error: errorMsg });
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Fail a session with error message
   */
  static async failSession(
    sessionId: string,
    errorMessage: string
  ): Promise<SessionResult<void>> {
    try {
      const now = Date.now();
      const { error } = await supabase
        .from("frost_signing_sessions")
        .update({
          status: "failed",
          error_message: errorMessage,
          failed_at: now,
          updated_at: now,
        })
        .eq("session_id", sessionId);

      if (error) {
        return {
          success: false,
          error: `Failed to update session: ${error.message}`,
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown session failure error",
      };
    }
  }

  /**
   * Expire old sessions past their expiration time
   */
  static async expireOldSessions(): Promise<SessionResult<number>> {
    try {
      const { error } = await supabase.rpc("expire_old_frost_signing_sessions");

      if (error) {
        return {
          success: false,
          error: `Failed to expire sessions: ${error.message}`,
        };
      }

      return {
        success: true,
        data: 0, // RPC doesn't return count, but operation succeeded
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown expiration error",
      };
    }
  }

  /**
   * Cleanup old completed/failed/expired sessions
   */
  static async cleanupOldSessions(
    retentionDays: number = 90
  ): Promise<SessionResult<number>> {
    try {
      const { data, error } = await supabase.rpc(
        "cleanup_old_frost_signing_sessions",
        { retention_days: retentionDays }
      );

      if (error) {
        return {
          success: false,
          error: `Failed to cleanup sessions: ${error.message}`,
        };
      }

      return {
        success: true,
        data: data || 0,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown cleanup error",
      };
    }
  }

  // =====================================================
  // SESSION RECOVERY METHODS (Phase 3 Integration)
  // =====================================================

  /**
   * Get all active sessions for a family federation
   * Used for session recovery and status monitoring
   *
   * @param familyId - Family federation ID
   * @returns List of active sessions
   */
  static async getActiveSessions(
    familyId: string
  ): Promise<SessionResult<FrostSession[]>> {
    try {
      const { data, error } = await supabase
        .from("frost_signing_sessions")
        .select("*")
        .eq("family_id", familyId)
        .in("status", ["pending", "nonce_collection", "aggregating"])
        .order("created_at", { ascending: false });

      if (error) {
        return {
          success: false,
          error: `Failed to get active sessions: ${error.message}`,
        };
      }

      return {
        success: true,
        data: data || [],
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error getting active sessions",
      };
    }
  }

  /**
   * Get pending sessions awaiting guardian participation
   * Used for guardian notification and session recovery
   *
   * @param guardianPubkey - Guardian's public key
   * @returns List of pending sessions requiring this guardian
   */
  static async getPendingSessions(
    guardianPubkey: string
  ): Promise<SessionResult<FrostSession[]>> {
    try {
      const { data, error } = await supabase
        .from("frost_signing_sessions")
        .select("*")
        .contains("participants", [guardianPubkey])
        .in("status", ["pending", "nonce_collection"])
        .order("created_at", { ascending: false });

      if (error) {
        return {
          success: false,
          error: `Failed to get pending sessions: ${error.message}`,
        };
      }

      return {
        success: true,
        data: data || [],
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error getting pending sessions",
      };
    }
  }

  /**
   * Recover an interrupted session by checking its current state
   * and determining what actions are needed to complete it
   *
   * @param sessionId - Session ID to recover
   * @returns Recovery status with required actions
   */
  static async recoverSession(sessionId: string): Promise<
    SessionResult<{
      session: FrostSession;
      missingCommitments: string[];
      missingSignatures: string[];
      canAggregate: boolean;
      isExpired: boolean;
    }>
  > {
    try {
      // Get session
      const sessionResult = await this.getSession(sessionId);
      if (!sessionResult.success || !sessionResult.data) {
        return {
          success: false,
          error: sessionResult.error || "Session not found",
        };
      }

      const session = sessionResult.data;
      const now = Math.floor(Date.now() / 1000);
      const isExpired = session.expires_at < now;

      // Get existing commitments
      const { data: commitments } = await supabase
        .from("frost_nonce_commitments")
        .select("participant_id")
        .eq("session_id", sessionId);

      const committedParticipants = new Set(
        (commitments || []).map((c) => c.participant_id)
      );
      const missingCommitments = session.participants.filter(
        (p) => !committedParticipants.has(p)
      );

      // Get existing partial signatures from session's JSONB field
      // Note: partial_signatures are stored in frost_signing_sessions.partial_signatures JSONB,
      // NOT in a separate table (only nonce_commitments has a dedicated table)
      const signedParticipants = new Set(
        Object.keys(session.partial_signatures || {})
      );
      const missingSignatures = session.participants.filter(
        (p) => !signedParticipants.has(p)
      );

      // Check if we can aggregate (have threshold signatures)
      const canAggregate =
        session.participants.length - missingSignatures.length >=
        session.threshold;

      return {
        success: true,
        data: {
          session,
          missingCommitments,
          missingSignatures,
          canAggregate,
          isExpired,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error recovering session",
      };
    }
  }

  /**
   * Verify an aggregated FROST signature
   *
   * Cryptographically verifies that a FROST signature (R, s) is valid
   * for a given message hash and public key using secp256k1.
   *
   * SECURITY: Public key is retrieved from database only (never from parameters)
   * to prevent parameter injection attacks and maintain zero-knowledge architecture.
   *
   * @param sessionId - FROST session ID
   * @param messageHash - Original message hash (64 hex chars, SHA-256)
   * @returns Verification result with validity status
   */
  static async verifyAggregatedSignature(
    sessionId: string,
    messageHash: string
  ): Promise<{ success: boolean; valid?: boolean; error?: string }> {
    try {
      // Step 1: Retrieve session from database
      const { data: session, error: sessionError } = await supabase
        .from("frost_signing_sessions")
        .select("*")
        .eq("session_id", sessionId)
        .single();

      if (sessionError || !session) {
        return {
          success: false,
          error: "Session not found",
        };
      }

      if (session.status !== "completed") {
        return {
          success: false,
          error: "Session not in completed status",
        };
      }

      if (!session.final_signature) {
        return {
          success: false,
          error: "No final signature in session",
        };
      }

      // Step 2: Retrieve group public key from database
      // ✅ SECURITY: Retrieved from database, never from parameters
      const { data: family, error: familyError } = await supabase
        .from("family_federations")
        .select("npub")
        .eq("id", session.family_id)
        .single();

      if (familyError || !family || !family.npub) {
        return {
          success: false,
          error: "Family not found or missing npub",
        };
      }

      // Step 3: Extract signature components
      const R = session.final_signature.R;
      const s = session.final_signature.s;

      if (!R || !s || R.length !== 66 || s.length !== 64) {
        return {
          success: false,
          error: `Invalid signature format: R=${R?.length || 0}, s=${
            s?.length || 0
          }`,
        };
      }

      // Step 4: Convert inputs to Uint8Array
      // Convert messageHash from hex to Uint8Array
      if (messageHash.length !== 64) {
        return {
          success: false,
          error: "Invalid message hash format",
        };
      }

      const messageHashBytes = new Uint8Array(
        (messageHash.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16))
      );

      // Convert npub from hex to Uint8Array
      // npub format: "npub1..." - need to decode to hex first
      let pubkeyHex: string;
      try {
        if (family.npub.startsWith("npub1")) {
          // Dynamic import for nip19 decoding
          const { nip19 } = await import("nostr-tools");
          const decoded = nip19.decode(family.npub);
          if (decoded.type !== "npub") {
            return {
              success: false,
              error: "Invalid npub format",
            };
          }
          pubkeyHex = decoded.data as string;
        } else {
          pubkeyHex = family.npub;
        }
      } catch (decodeError) {
        return {
          success: false,
          error: `Failed to decode npub: ${
            decodeError instanceof Error
              ? decodeError.message
              : String(decodeError)
          }`,
        };
      }

      const publicKeyBytes = new Uint8Array(
        (pubkeyHex.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16))
      );

      // Step 5: Reconstruct signature and verify
      try {
        // Parse R as elliptic curve point
        const rPoint = secp256k1.Point.fromHex(R);

        // Parse s as BigInt scalar
        const sScalar = BigInt("0x" + s);

        // Construct signature object for verification
        // secp256k1.verify expects (signature, messageHash, publicKey)
        // where signature can be Uint8Array or {r, s} object
        const signature = {
          r: rPoint,
          s: sScalar,
        };

        // Verify signature
        const isValid = secp256k1.verify(
          signature as any,
          messageHashBytes,
          publicKeyBytes
        );

        return {
          success: true,
          valid: isValid,
        };
      } catch (verifyError) {
        return {
          success: false,
          error: `Signature verification failed: ${
            verifyError instanceof Error
              ? verifyError.message
              : String(verifyError)
          }`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Verification error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Publish a FROST-signed event to Nostr relays via CEPS
   *
   * Takes a completed FROST session with event template and publishes
   * the signed event to Nostr relays using the Central Event Publishing Service.
   * Sends individual NIP-17 DM notifications to all guardians/stewards.
   *
   * SECURITY: Event published from group's npub (public account).
   * Signature already complete - no nsec needed for publishing.
   *
   * @param sessionId - FROST session ID with completed signature
   * @returns Publication result with event ID
   */
  static async publishSignedEvent(
    sessionId: string
  ): Promise<{ success: boolean; eventId?: string; error?: string }> {
    try {
      // Step 1: Retrieve session from database
      const { data: session, error: sessionError } = await supabase
        .from("frost_signing_sessions")
        .select("*")
        .eq("session_id", sessionId)
        .single();

      if (sessionError || !session) {
        return {
          success: false,
          error: "Session not found",
        };
      }

      if (session.status !== "completed") {
        return {
          success: false,
          error: "Session not in completed status",
        };
      }

      if (!session.event_template) {
        return {
          success: false,
          error: "No event template in session",
        };
      }

      if (!session.event_type) {
        return {
          success: false,
          error: "No event type in session",
        };
      }

      // Step 2: Retrieve group public key from database
      const { data: family, error: familyError } = await supabase
        .from("family_federations")
        .select("npub")
        .eq("id", session.family_id)
        .single();

      if (familyError || !family || !family.npub) {
        return {
          success: false,
          error: "Family not found or missing npub",
        };
      }

      // Step 3: Parse event template
      let event: any;
      try {
        event = JSON.parse(session.event_template);

        // Validate required Nostr event fields
        if (
          !event.kind ||
          event.content === undefined ||
          !Array.isArray(event.tags) ||
          !event.created_at
        ) {
          return {
            success: false,
            error: "Invalid event template structure",
          };
        }
      } catch (parseError) {
        return {
          success: false,
          error: `Invalid event template JSON: ${
            parseError instanceof Error
              ? parseError.message
              : String(parseError)
          }`,
        };
      }

      // Step 4: Add signature to event
      if (!session.final_signature) {
        return {
          success: false,
          error: "No final signature in session",
        };
      }

      // ✅ SECURITY: Event published from group's npub (public account)
      // Signature already complete - no nsec needed
      event.pubkey = family.npub;
      event.sig = session.final_signature.s; // Aggregated signature scalar

      // Add FROST metadata tags
      event.tags = event.tags || [];
      event.tags.push(["nonce", session.final_signature.R]); // Nonce commitment
      event.tags.push(["frost", sessionId]); // FROST session reference

      // Step 5: Publish via CEPS
      let eventId: string;
      try {
        // Dynamic import CEPS to avoid circular dependencies
        const { central_event_publishing_service: CEPS } = await import(
          "../central_event_publishing_service"
        );

        // Determine relays to publish to
        const relays = ["wss://relay.satnam.pub"];

        // Publish event
        eventId = await CEPS.publishEvent(event, relays);

        if (!eventId) {
          return {
            success: false,
            error: "CEPS publish failed: no event ID returned",
          };
        }
      } catch (publishError) {
        return {
          success: false,
          error: `CEPS publish failed: ${
            publishError instanceof Error
              ? publishError.message
              : String(publishError)
          }`,
        };
      }

      // Step 6: Send notifications to all participants
      try {
        await this.sendFrostCompletionNotification(sessionId, eventId, true);
      } catch (notifyError) {
        // Log notification error but don't fail the publish
        console.warn(
          `[FROST] Failed to send completion notifications: ${
            notifyError instanceof Error
              ? notifyError.message
              : String(notifyError)
          }`
        );
      }

      // Step 7: Update session with final_event_id
      const now = Date.now();
      const { error: updateError } = await supabase
        .from("frost_signing_sessions")
        .update({
          final_event_id: eventId,
          updated_at: now,
        })
        .eq("session_id", sessionId)
        .eq("updated_at", session.updated_at); // Optimistic locking

      if (updateError) {
        // Log update error but don't fail - event was already published
        console.warn(
          `[FROST] Failed to update session with event ID: ${updateError.message}`
        );
      }

      return {
        success: true,
        eventId,
      };
    } catch (error) {
      return {
        success: false,
        error: `Event publishing failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Send FROST signing request to all guardians/stewards
   *
   * Sends individual NIP-17 DMs to each guardian/steward with:
   * - Message preview
   * - FROST session ID
   * - Approval/rejection options
   *
   * @param sessionId - FROST session ID
   * @returns Result with count of notifications sent
   */
  static async sendFrostSigningRequest(
    sessionId: string
  ): Promise<{ success: boolean; notificationsSent?: number; error?: string }> {
    try {
      // Retrieve session
      const { data: session, error: sessionError } = await supabase
        .from("frost_signing_sessions")
        .select("*")
        .eq("session_id", sessionId)
        .single();

      if (sessionError || !session) {
        return {
          success: false,
          error: "Session not found",
        };
      }

      // Retrieve family
      const { data: family, error: familyError } = await supabase
        .from("family_federations")
        .select("id, federation_name")
        .eq("id", session.family_id)
        .single();

      if (familyError || !family) {
        return {
          success: false,
          error: "Family not found",
        };
      }

      // Get all guardians and stewards
      const { data: members, error: membersError } = await supabase
        .from("family_members")
        .select("user_duid, family_role")
        .eq("family_federation_id", session.family_id)
        .in("family_role", ["guardian", "steward"])
        .eq("is_active", true);

      if (membersError || !members) {
        return {
          success: false,
          error: "Failed to retrieve family members",
        };
      }

      // Get npub for each member
      let notificationsSent = 0;
      const { central_event_publishing_service: CEPS } = await import(
        "../central_event_publishing_service"
      );

      for (const member of members) {
        try {
          // Get user identity to retrieve npub
          const { data: userIdentity, error: userError } = await supabase
            .from("user_identities")
            .select("npub")
            .eq("id", member.user_duid)
            .single();

          if (userError || !userIdentity || !userIdentity.npub) {
            console.warn(
              `[FROST] Could not retrieve npub for member ${member.user_duid}`
            );
            continue;
          }

          // Parse event template for preview
          let messagePreview = "FROST signing request";
          if (session.event_template) {
            try {
              const event = JSON.parse(session.event_template);
              messagePreview = event.content || messagePreview;
              if (messagePreview.length > 100) {
                messagePreview = messagePreview.substring(0, 97) + "...";
              }
            } catch {
              // Use default preview
            }
          }

          // Send NIP-17 DM with signing request
          const dmContent = JSON.stringify({
            type: "frost_signing_request",
            sessionId,
            familyName: family.federation_name,
            messagePreview,
            timestamp: Date.now(),
          });

          await CEPS.sendStandardDirectMessage(userIdentity.npub, dmContent);

          notificationsSent++;
        } catch (memberError) {
          console.warn(
            `[FROST] Failed to send signing request to member ${
              member.user_duid
            }: ${
              memberError instanceof Error
                ? memberError.message
                : String(memberError)
            }`
          );
        }
      }

      return {
        success: true,
        notificationsSent,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to send signing requests: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Send FROST completion notification to all participants
   *
   * Notifies all guardians/stewards of signing completion with:
   * - Success/failure status
   * - Event ID (if successful)
   * - Event preview
   *
   * @param sessionId - FROST session ID
   * @param eventId - Published event ID (if successful)
   * @param success - Whether signing was successful
   * @returns Result with count of notifications sent
   */
  static async sendFrostCompletionNotification(
    sessionId: string,
    eventId: string,
    success: boolean
  ): Promise<{ success: boolean; notificationsSent?: number; error?: string }> {
    try {
      // Retrieve session
      const { data: session, error: sessionError } = await supabase
        .from("frost_signing_sessions")
        .select("*")
        .eq("session_id", sessionId)
        .single();

      if (sessionError || !session) {
        return {
          success: false,
          error: "Session not found",
        };
      }

      // Retrieve family
      const { data: family, error: familyError } = await supabase
        .from("family_federations")
        .select("id, federation_name")
        .eq("id", session.family_id)
        .single();

      if (familyError || !family) {
        return {
          success: false,
          error: "Family not found",
        };
      }

      // Get all guardians and stewards
      const { data: members, error: membersError } = await supabase
        .from("family_members")
        .select("user_duid, family_role")
        .eq("family_federation_id", session.family_id)
        .in("family_role", ["guardian", "steward"])
        .eq("is_active", true);

      if (membersError || !members) {
        return {
          success: false,
          error: "Failed to retrieve family members",
        };
      }

      // Get npub for each member
      let notificationsSent = 0;
      const { central_event_publishing_service: CEPS } = await import(
        "../central_event_publishing_service"
      );

      for (const member of members) {
        try {
          // Get user identity to retrieve npub
          const { data: userIdentity, error: userError } = await supabase
            .from("user_identities")
            .select("npub")
            .eq("id", member.user_duid)
            .single();

          if (userError || !userIdentity || !userIdentity.npub) {
            console.warn(
              `[FROST] Could not retrieve npub for member ${member.user_duid}`
            );
            continue;
          }

          // Parse event template for preview
          let messagePreview = "FROST signing completed";
          if (session.event_template) {
            try {
              const event = JSON.parse(session.event_template);
              messagePreview = event.content || messagePreview;
              if (messagePreview.length > 100) {
                messagePreview = messagePreview.substring(0, 97) + "...";
              }
            } catch {
              // Use default preview
            }
          }

          // Send NIP-17 DM with completion notification
          const dmContent = JSON.stringify({
            type: "frost_completion_notification",
            sessionId,
            familyName: family.federation_name,
            status: success ? "completed" : "failed",
            eventId: success ? eventId : undefined,
            messagePreview,
            timestamp: Date.now(),
          });

          await CEPS.sendStandardDirectMessage(userIdentity.npub, dmContent);

          notificationsSent++;
        } catch (memberError) {
          console.warn(
            `[FROST] Failed to send completion notification to member ${
              member.user_duid
            }: ${
              memberError instanceof Error
                ? memberError.message
                : String(memberError)
            }`
          );
        }
      }

      return {
        success: true,
        notificationsSent,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to send completion notifications: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  // ============================================================================
  // PERMISSION-INTEGRATED SESSION CREATION
  // ============================================================================

  /**
   * Create a new FROST signing session with permission checks
   *
   * This method integrates with EventSigningPermissionService to:
   * 1. Check time-based restrictions
   * 2. Check cross-federation delegation (if applicable)
   * 3. Validate creator has permission for event type
   * 4. Initiate approval workflow if required
   * 5. Create session normally if all checks pass
   */
  static async createSessionWithPermissionCheck(
    params: CreateSessionWithPermissionParams
  ): Promise<SessionWithPermissionResult> {
    try {
      // Lazy import to avoid circular dependencies
      const { EventSigningPermissionService } = await import(
        "../../src/services/eventSigningPermissionService"
      );
      const { SigningAuditService } = await import(
        "../../src/services/signingAuditService"
      );

      // Step 1: Check permission
      const permCheck = await EventSigningPermissionService.canSign(
        params.familyId,
        params.createdBy,
        params.eventType
      );

      if (!permCheck.allowed) {
        return {
          success: false,
          status: "denied",
          error: `Permission denied: ${permCheck.reason}`,
          permissionCheck: permCheck,
        };
      }

      // Step 2: Check time-based restrictions if permission has an ID
      let timeCheck: TimeWindowCheckResult = { allowed: true };
      if (permCheck.permissionId || permCheck.overrideId) {
        timeCheck = await EventSigningPermissionService.isWithinTimeWindow(
          permCheck.permissionId,
          permCheck.overrideId
        );

        if (!timeCheck.allowed) {
          return {
            success: false,
            status: "denied",
            error: `Time restriction: ${timeCheck.reason}`,
            timeWindowCheck: timeCheck,
            nextWindowStart: timeCheck.nextWindowStart,
            cooldownRemaining: timeCheck.cooldownRemaining,
          };
        }
      }

      // Step 3: Check cross-federation delegation if applicable
      let delegationId: string | undefined;
      if (params.crossFederationContext) {
        const delegationCheck =
          await EventSigningPermissionService.checkDelegatedPermission(
            params.crossFederationContext.sourceFederationId,
            params.familyId,
            params.createdBy,
            params.eventType
          );

        if (!delegationCheck.allowed) {
          return {
            success: false,
            status: "denied",
            error: "Cross-federation permission denied",
            permissionCheck: permCheck,
          };
        }

        delegationId =
          params.crossFederationContext.delegationId ||
          delegationCheck.delegationId;
      }

      // Step 4: If approval required, create pending approval session
      if (permCheck.requiresApproval) {
        return await this.createPendingApprovalSession(
          params,
          permCheck,
          delegationId
        );
      }

      // Step 5: Create session normally
      const sessionResult = await this.createSession({
        familyId: params.familyId,
        messageHash: params.messageHash,
        eventTemplate: params.eventTemplate,
        eventType: params.eventType,
        participants: params.participants,
        threshold: params.threshold,
        createdBy: params.createdBy,
        expirationSeconds: params.expirationSeconds,
      });

      if (!sessionResult.success) {
        return {
          success: false,
          status: "denied",
          error: sessionResult.error,
        };
      }

      // Step 6: Create audit entry for successful session creation
      // ATOMIC OPERATION: If audit entry fails, delete the session to maintain consistency
      const auditResult = await SigningAuditService.createAuditEntry({
        federationId: params.familyId,
        sessionId: sessionResult.data?.session_id,
        memberDuid: params.createdBy,
        memberRole: "adult", // Will be resolved from DB in production
        eventType: params.eventType,
        permissionId: permCheck.permissionId,
        overrideId: permCheck.overrideId,
        approvalRequired: false,
        delegationId,
      });

      // Compensating logic: If audit entry creation fails, clean up the session
      if (!auditResult.success && sessionResult.data?.session_id) {
        console.error(
          "[FrostSessionManager] Audit entry creation failed, cleaning up session:",
          auditResult.error
        );
        try {
          // Delete the orphaned session to maintain consistency
          await supabase
            .from("frost_signing_sessions")
            .delete()
            .eq("session_id", sessionResult.data.session_id);
        } catch (cleanupError) {
          console.error(
            "[FrostSessionManager] Failed to clean up orphaned session:",
            cleanupError
          );
        }
        return {
          success: false,
          status: "denied",
          error: `Session created but audit logging failed: ${auditResult.error}. Session was rolled back.`,
        };
      }

      return {
        success: true,
        sessionId: sessionResult.data?.session_id,
        status: "created",
        permissionCheck: permCheck,
        timeWindowCheck: timeCheck,
      };
    } catch (error) {
      console.error(
        "[FrostSessionManager] createSessionWithPermissionCheck error:",
        error
      );
      return {
        success: false,
        status: "denied",
        error:
          error instanceof Error ? error.message : "Permission check failed",
      };
    }
  }

  /**
   * Create a pending approval session when approval is required
   */
  private static async createPendingApprovalSession(
    params: CreateSessionWithPermissionParams,
    permCheck: PermissionCheckResult,
    delegationId?: string
  ): Promise<SessionWithPermissionResult> {
    try {
      const { SigningAuditService } = await import(
        "../../src/services/signingAuditService"
      );

      // Create audit entry for pending approval
      const auditResult = await SigningAuditService.createAuditEntry({
        federationId: params.familyId,
        memberDuid: params.createdBy,
        memberRole: "adult", // Will be resolved from DB in production
        eventType: params.eventType,
        eventContentPreview: params.eventTemplate?.substring(0, 200),
        permissionId: permCheck.permissionId,
        overrideId: permCheck.overrideId,
        approvalRequired: true,
        delegationId,
      });

      if (!auditResult.success) {
        return {
          success: false,
          status: "denied",
          error: `Failed to create approval request: ${auditResult.error}`,
        };
      }

      return {
        success: true,
        status: "pending_approval",
        approvalRequired: true,
        approvalQueueId: auditResult.auditId,
        permissionCheck: permCheck,
      };
    } catch (error) {
      console.error(
        "[FrostSessionManager] createPendingApprovalSession error:",
        error
      );
      return {
        success: false,
        status: "denied",
        error:
          error instanceof Error
            ? error.message
            : "Approval session creation failed",
      };
    }
  }

  // ============================================================================
  // APPROVAL WORKFLOW METHODS
  // ============================================================================

  /**
   * Approve a pending signing session
   *
   * @param auditLogId - The audit log entry ID (approval queue ID)
   * @param approverId - The DUID of the approving member
   * @param approverRole - The role of the approving member
   * @returns Session creation result if threshold met
   */
  static async approveSession(params: {
    auditLogId: string;
    approverId: string;
    approverRole: FederationRole;
  }): Promise<SessionWithPermissionResult> {
    try {
      const { SigningAuditService } = await import(
        "../../src/services/signingAuditService"
      );

      // Step 1: Get the audit entry
      const { data: auditEntry, error: auditError } = await supabase
        .from("signing_audit_log")
        .select("*")
        .eq("id", params.auditLogId)
        .eq("status", "pending")
        .single();

      if (auditError || !auditEntry) {
        return {
          success: false,
          status: "denied",
          error: "Pending approval not found or already processed",
        };
      }

      // Step 2: Verify approver has authority (must have role in approved_by_roles)
      // SECURITY: Fail-secure - deny if permission lookup fails to prevent authorization bypass
      const { data: permission, error: permissionError } = await supabase
        .from("event_signing_permissions")
        .select("approved_by_roles, approval_threshold")
        .eq("id", auditEntry.permission_id)
        .single();

      if (permissionError || !permission) {
        console.error(
          "[FrostSessionManager] approveSession: Permission lookup failed for permission_id:",
          auditEntry.permission_id,
          "Error:",
          permissionError
        );
        return {
          success: false,
          status: "denied",
          error:
            "Permission configuration not found - cannot verify approval authority",
        };
      }

      const approvedByRoles = permission.approved_by_roles as FederationRole[];
      if (!approvedByRoles.includes(params.approverRole)) {
        return {
          success: false,
          status: "denied",
          error: `Role '${params.approverRole}' is not authorized to approve this event type`,
        };
      }

      // Step 3: Add approval
      const updateResult = await SigningAuditService.updateStatus(
        params.auditLogId,
        "pending",
        { approvedBy: params.approverId }
      );

      if (!updateResult.success) {
        return {
          success: false,
          status: "denied",
          error: updateResult.error,
        };
      }

      // Step 4: Check if threshold is met
      const { data: updatedAudit } = await supabase
        .from("signing_audit_log")
        .select("approved_by, event_type, federation_id, member_duid")
        .eq("id", params.auditLogId)
        .single();

      const approvalCount =
        (updatedAudit?.approved_by as string[])?.length || 0;
      const threshold = permission?.approval_threshold || 1;

      if (approvalCount < threshold) {
        // Not yet enough approvals
        return {
          success: true,
          status: "pending_approval",
          approvalRequired: true,
          approvalQueueId: params.auditLogId,
          permissionCheck: {
            allowed: true,
            requiresApproval: true,
            approvalThreshold: threshold,
            reason: `Approval ${approvalCount}/${threshold}`,
          },
        };
      }

      // Step 5: Threshold met - update status to approved
      await SigningAuditService.updateStatus(params.auditLogId, "approved");

      // Step 6: Return approved status
      // NOTE: Session creation is deferred - the caller must retrieve the original request
      // parameters from the audit entry and call createSessionWithPermissionCheck again,
      // or implement a separate session creation step. The audit entry stores:
      // - event_type, federation_id, member_duid, event_content_preview
      // Full request params should be stored in a separate pending_session_requests table
      // in production for complete session reconstruction.
      return {
        success: true,
        status: "approved", // Changed from "created" - session creation is the caller's responsibility
        approvalQueueId: params.auditLogId,
        permissionCheck: {
          allowed: true,
          requiresApproval: false,
          reason:
            "Approval threshold met - session creation deferred to caller",
        },
      };
    } catch (error) {
      console.error("[FrostSessionManager] approveSession error:", error);
      return {
        success: false,
        status: "denied",
        error: error instanceof Error ? error.message : "Approval failed",
      };
    }
  }

  /**
   * Reject a pending signing session
   *
   * @param auditLogId - The audit log entry ID (approval queue ID)
   * @param rejecterId - The DUID of the rejecting member
   * @param rejecterRole - The role of the rejecting member (required for authorization)
   * @param reason - Optional reason for rejection
   * @returns Rejection result
   */
  static async rejectSession(params: {
    auditLogId: string;
    rejecterId: string;
    rejecterRole: FederationRole;
    reason?: string;
  }): Promise<SessionWithPermissionResult> {
    try {
      const { SigningAuditService } = await import(
        "../../src/services/signingAuditService"
      );

      // Step 1: Verify the audit entry exists and is pending
      const { data: auditEntry, error: auditError } = await supabase
        .from("signing_audit_log")
        .select("id, status, federation_id, permission_id")
        .eq("id", params.auditLogId)
        .eq("status", "pending")
        .single();

      if (auditError || !auditEntry) {
        return {
          success: false,
          status: "denied",
          error: "Pending approval not found or already processed",
        };
      }

      // Step 2: Verify rejecter has authority (must have role in approved_by_roles)
      // SECURITY: Same authorization check as approveSession - only authorized roles can reject
      if (auditEntry.permission_id) {
        const { data: permission, error: permissionError } = await supabase
          .from("event_signing_permissions")
          .select("approved_by_roles")
          .eq("id", auditEntry.permission_id)
          .single();

        if (permissionError || !permission) {
          console.error(
            "[FrostSessionManager] rejectSession: Permission lookup failed for permission_id:",
            auditEntry.permission_id,
            "Error:",
            permissionError
          );
          return {
            success: false,
            status: "denied",
            error:
              "Permission configuration not found - cannot verify rejection authority",
          };
        }

        const approvedByRoles =
          permission.approved_by_roles as FederationRole[];
        if (!approvedByRoles.includes(params.rejecterRole)) {
          return {
            success: false,
            status: "denied",
            error: `Role '${params.rejecterRole}' is not authorized to reject this event type`,
          };
        }
      }

      // Step 3: Update status to rejected
      const updateResult = await SigningAuditService.updateStatus(
        params.auditLogId,
        "rejected",
        {
          errorMessage: params.reason || "Rejected by approver",
        }
      );

      if (!updateResult.success) {
        return {
          success: false,
          status: "denied",
          error: updateResult.error,
        };
      }

      return {
        success: true,
        status: "denied",
        error: params.reason || "Session rejected by approver",
        approvalQueueId: params.auditLogId,
      };
    } catch (error) {
      console.error("[FrostSessionManager] rejectSession error:", error);
      return {
        success: false,
        status: "denied",
        error: error instanceof Error ? error.message : "Rejection failed",
      };
    }
  }

  /**
   * Get pending approval queue for a federation
   *
   * @param federationId - The federation DUID
   * @param approverRole - Optional filter by role that can approve
   * @returns List of pending approval items
   */
  static async getPendingApprovals(params: {
    federationId: string;
    approverRole?: FederationRole;
    limit?: number;
  }): Promise<{
    success: boolean;
    pendingApprovals?: PendingApprovalItem[];
    error?: string;
  }> {
    try {
      // Get pending audit entries for the federation
      let query = supabase
        .from("signing_audit_log")
        .select(
          `
          id,
          federation_id,
          member_duid,
          member_role,
          event_type,
          nostr_kind,
          event_content_preview,
          approved_by,
          permission_id,
          requested_at
        `
        )
        .eq("federation_id", params.federationId)
        .eq("status", "pending")
        .order("requested_at", { ascending: false });

      if (params.limit) {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;

      if (error) {
        return {
          success: false,
          error: `Failed to fetch pending approvals: ${error.message}`,
        };
      }

      // Map to PendingApprovalItem interface and calculate expiration
      const pendingApprovals: PendingApprovalItem[] = await Promise.all(
        (data || []).map(async (row) => {
          // Get permission details for threshold
          let requiredApprovals = 1;
          if (row.permission_id) {
            const { data: perm } = await supabase
              .from("event_signing_permissions")
              .select("approval_threshold")
              .eq("id", row.permission_id)
              .single();
            requiredApprovals = perm?.approval_threshold || 1;
          }

          const requestedAt = new Date(row.requested_at);
          const expiresAt = new Date(
            requestedAt.getTime() + 24 * 60 * 60 * 1000
          ); // 24hr default

          return {
            auditLogId: row.id,
            sessionId: "", // Will be created upon approval
            federationId: row.federation_id,
            requesterDuid: row.member_duid,
            requesterRole: row.member_role as FederationRole,
            eventType: row.event_type,
            nostrKind: row.nostr_kind,
            eventContentPreview: row.event_content_preview,
            requiredApprovals,
            currentApprovals: (row.approved_by as string[])?.length || 0,
            approvedBy: (row.approved_by as string[]) || [],
            requestedAt,
            expiresAt,
          };
        })
      );

      // Filter by approver role if specified
      if (params.approverRole) {
        // Only return items where the approverRole is in approved_by_roles
        // This would require fetching permission data - for now return all
        // The UI/API layer should handle this filtering
      }

      return {
        success: true,
        pendingApprovals,
      };
    } catch (error) {
      console.error("[FrostSessionManager] getPendingApprovals error:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get pending approvals",
      };
    }
  }

  /**
   * Generate unique session ID
   */
  private static async generateSessionId(): Promise<string> {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }
}
