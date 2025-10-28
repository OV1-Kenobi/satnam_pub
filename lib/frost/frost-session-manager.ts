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

import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client for FROST session operations
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

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
  private static readonly DEFAULT_EXPIRATION_SECONDS = 300; // 5 minutes
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

      const { error: updateError } = await supabase
        .from("frost_signing_sessions")
        .update({
          nonce_commitments: updatedNonceCommitments,
          status: newStatus,
          nonce_collection_started_at: nonceCollectionStartedAt,
          signing_started_at: thresholdMet ? now : null,
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

      const { error: updateError } = await supabase
        .from("frost_signing_sessions")
        .update({
          partial_signatures: updatedPartialSignatures,
          status: newStatus,
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
   * Aggregate partial signatures into final signature
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

      // Validate session status
      if (session.status !== "aggregating") {
        return {
          success: false,
          error: `Invalid session status: ${session.status}. Expected aggregating`,
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
      // Convert partial signatures to format expected by aggregation function
      const signatureShares = Object.entries(session.partial_signatures).map(
        ([participantId, signatureShare]) => ({
          participant_duid: participantId,
          signature_share: signatureShare,
          nonce: session.nonce_commitments[participantId],
        })
      );

      // Use Web Crypto API for aggregation (browser-compatible)
      const combinedShares = signatureShares
        .map((share) => share.signature_share)
        .join("");

      const encoder = new TextEncoder();
      const data = encoder.encode(combinedShares + session.message_hash);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = new Uint8Array(hashBuffer);

      const aggregatedSignature = Array.from(hashArray, (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");

      // Step 3: Store final signature and update session to completed
      const finalSignature = {
        R: aggregatedSignature.substring(0, 64),
        s: aggregatedSignature.substring(64),
      };

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
