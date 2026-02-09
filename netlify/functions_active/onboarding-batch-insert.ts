/**
 * Onboarding Batch Insert Endpoint
 *
 * Accepts multiple participant records and performs atomic batch inserts
 * to reduce database round-trips from N operations to 1 operation.
 *
 * Performance Target: Process 10+ participants in <2 seconds
 *
 * @route POST /.netlify/functions/onboarding-batch-insert
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "../functions/utils/env";

// ============================================================================
// Types
// ============================================================================

interface BatchParticipantData {
  participantId: string;
  sessionId: string;
  trueName: string;
  displayName?: string;
  language: string;
  npub: string;
  nip05?: string;
  migrationFlag: boolean;
  oldNpub?: string;
  technicalComfort?: "low" | "medium" | "high";
  currentStep: string;
  completedSteps: string[];
  status: "pending" | "in_progress" | "completed" | "failed";

  // Optional encrypted data
  encrypted_nsec?: string;
  encrypted_keet_seed?: string;
  keet_seed_salt?: string;
  keet_peer_id?: string;

  // Optional attestation data
  nip03_event_id?: string;
  ots_proof?: string;
  federation_linked?: boolean;
  attestation_published?: boolean;
}

interface BatchInsertRequest {
  sessionId: string;
  participants: BatchParticipantData[];
}

interface ParticipantResult {
  participantId: string;
  success: boolean;
  error?: string;
}

interface BatchInsertResponse {
  totalRequested: number;
  totalSucceeded: number;
  totalFailed: number;
  results: ParticipantResult[];
  processingTimeMs: number;
}

interface ErrorResponse {
  error: string;
  details?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_BATCH_SIZE = 50;

// ============================================================================
// Handler
// ============================================================================

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext,
) => {
  const startTime = Date.now();

  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Parse request body
    const body: BatchInsertRequest = JSON.parse(event.body || "{}");

    // Validate required fields
    if (
      !body.sessionId ||
      !body.participants ||
      !Array.isArray(body.participants)
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields: sessionId, participants (array)",
        } as ErrorResponse),
      };
    }

    // Validate batch size
    if (body.participants.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Participants array cannot be empty",
        } as ErrorResponse),
      };
    }

    if (body.participants.length > MAX_BATCH_SIZE) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} participants`,
        } as ErrorResponse),
      };
    }

    // Get authenticated user from JWT
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" } as ErrorResponse),
      };
    }

    const token = authHeader.substring(7);

    // Initialize Supabase client
    const supabaseUrl = getEnvVar("VITE_PUBLIC_SUPABASE_URL");
    const supabaseKey = getEnvVar("VITE_PUBLIC_SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Verify user authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: "Invalid authentication token",
        } as ErrorResponse),
      };
    }

    // Verify session exists and belongs to coordinator
    const { data: session, error: sessionError } = await supabase
      .from("onboarding_sessions")
      .select("*")
      .eq("session_id", body.sessionId)
      .eq("coordinator_user_id", user.id)
      .single();

    if (sessionError || !session) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: "Session not found or access denied",
        } as ErrorResponse),
      };
    }

    // Check if session is active
    if (session.status !== "active") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `Session is ${session.status}, not active`,
        } as ErrorResponse),
      };
    }

    // ============================================================================
    // Batch Insert Processing
    // ============================================================================

    const results: ParticipantResult[] = [];
    const validParticipants: any[] = [];

    // Validate and prepare participant data
    for (const participant of body.participants) {
      try {
        // Validate required fields
        if (
          !participant.participantId ||
          !participant.trueName ||
          !participant.language
        ) {
          results.push({
            participantId: participant.participantId || "unknown",
            success: false,
            error: "Missing required fields: participantId, trueName, language",
          });
          continue;
        }

        // Validate session ID matches
        if (participant.sessionId !== body.sessionId) {
          results.push({
            participantId: participant.participantId,
            success: false,
            error: "Participant sessionId does not match request sessionId",
          });
          continue;
        }

        // Prepare database record
        const dbRecord = {
          participant_id: participant.participantId,
          session_id: participant.sessionId,
          true_name: participant.trueName,
          display_name: participant.displayName,
          language: participant.language,
          npub: participant.npub || "pending",
          nip05: participant.nip05,
          migration_flag: participant.migrationFlag || false,
          old_npub: participant.oldNpub,
          technical_comfort: participant.technicalComfort,
          current_step: participant.currentStep || "intake",
          completed_steps: participant.completedSteps || [],
          status: participant.status || "pending",
          encrypted_nsec: participant.encrypted_nsec,
          encrypted_keet_seed: participant.encrypted_keet_seed,
          keet_seed_salt: participant.keet_seed_salt,
          keet_peer_id: participant.keet_peer_id,
          nip03_event_id: participant.nip03_event_id,
          ots_proof: participant.ots_proof,
          federation_linked: participant.federation_linked || false,
          attestation_published: participant.attestation_published || false,
        };

        validParticipants.push(dbRecord);
      } catch (err) {
        results.push({
          participantId: participant.participantId || "unknown",
          success: false,
          error: err instanceof Error ? err.message : "Validation failed",
        });
      }
    }

    // Perform batch insert if we have valid participants
    if (validParticipants.length > 0) {
      const { data: insertedParticipants, error: insertError } = await supabase
        .from("onboarded_identities")
        .insert(validParticipants)
        .select("participant_id");

      if (insertError) {
        // If batch insert fails, mark all as failed
        for (const participant of validParticipants) {
          results.push({
            participantId: participant.participant_id,
            success: false,
            error: `Batch insert failed: ${insertError.message}`,
          });
        }
      } else {
        // Mark all inserted participants as successful
        const insertedIds = new Set(
          insertedParticipants?.map((p: any) => p.participant_id) || [],
        );
        for (const participant of validParticipants) {
          results.push({
            participantId: participant.participant_id,
            success: insertedIds.has(participant.participant_id),
            error: insertedIds.has(participant.participant_id)
              ? undefined
              : "Insert failed - participant not in result set",
          });
        }
      }
    }

    // Calculate statistics
    const totalSucceeded = results.filter((r) => r.success).length;
    const totalFailed = results.filter((r) => !r.success).length;
    const processingTimeMs = Date.now() - startTime;

    console.log(
      `[BatchInsert] Processed ${body.participants.length} participants: ${totalSucceeded} succeeded, ${totalFailed} failed in ${processingTimeMs}ms`,
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        totalRequested: body.participants.length,
        totalSucceeded,
        totalFailed,
        results,
        processingTimeMs,
      } as BatchInsertResponse),
    };
  } catch (err) {
    console.error("[BatchInsert] Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal server error",
        details: err instanceof Error ? err.message : "Unknown error",
      } as ErrorResponse),
    };
  }
};
