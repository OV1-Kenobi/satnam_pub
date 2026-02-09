/**
 * Onboarding Participant Registration Endpoint
 *
 * Registers a new participant in an onboarding session.
 * Creates initial participant record with intake data.
 *
 * @route POST /.netlify/functions/onboarding-participant-register
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env";

// ============================================================================
// Types
// ============================================================================

interface RegisterParticipantRequest {
  sessionId: string;
  trueName: string;
  displayName?: string;
  language: string;
  /** Indicates if participant already has an existing Nostr npub (drives migration flow) */
  existingNostrAccount?: boolean;
  /** Indicates if participant already has an existing Lightning wallet */
  existingLightningWallet?: boolean;
  migrationFlag: boolean;
  oldNpub?: string;
  technicalComfort?: "low" | "medium" | "high";
}

interface RegisterParticipantResponse {
  participant: {
    participantId: string;
    sessionId: string;
    trueName: string;
    displayName?: string;
    language: string;
    existingNostrAccount?: boolean;
    existingLightningWallet?: boolean;
    migrationFlag: boolean;
    oldNpub?: string;
    technicalComfort?: string;
    currentStep: string;
    status: string;
    createdAt: string;
  };
}

interface ErrorResponse {
  error: string;
  details?: string;
}

// ============================================================================
// Handler
// ============================================================================

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext,
) => {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Parse request body
    const body: RegisterParticipantRequest = JSON.parse(event.body || "{}");

    // Validate required fields
    if (!body.sessionId || !body.trueName || !body.language) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields: sessionId, trueName, language",
        } as ErrorResponse),
      };
    }

    // Validate migration flag consistency
    if (body.migrationFlag && !body.oldNpub) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "oldNpub required when migrationFlag is true",
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

    // Create participant record (npub will be set later during identity step)
    // Note: existingNostrAccount drives migrationFlag; existingLightningWallet is informational
    const { data: participant, error: insertError } = await supabase
      .from("onboarded_identities")
      .insert({
        session_id: body.sessionId,
        true_name: body.trueName,
        display_name: body.displayName,
        language: body.language,
        npub: "pending", // Placeholder until identity created
        migration_flag:
          body.migrationFlag ?? body.existingNostrAccount ?? false,
        old_npub: body.oldNpub,
        technical_comfort: body.technicalComfort,
        current_step: "intake",
        completed_steps: [],
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating participant:", insertError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Failed to register participant",
          details: insertError.message,
        } as ErrorResponse),
      };
    }

    // Update session participant count
    await supabase
      .from("onboarding_sessions")
      .update({
        participant_count: session.participant_count + 1,
      })
      .eq("session_id", body.sessionId);

    // Return success response
    // Note: existingNostrAccount and existingLightningWallet are derived/passed through
    const response: RegisterParticipantResponse = {
      participant: {
        participantId: participant.participant_id,
        sessionId: participant.session_id,
        trueName: participant.true_name,
        displayName: participant.display_name,
        language: participant.language,
        existingNostrAccount:
          body.existingNostrAccount ?? participant.migration_flag,
        existingLightningWallet: body.existingLightningWallet ?? false,
        migrationFlag: participant.migration_flag,
        oldNpub: participant.old_npub,
        technicalComfort: participant.technical_comfort,
        currentStep: participant.current_step,
        status: participant.status,
        createdAt: participant.created_at,
      },
    };

    return {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Unexpected error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      } as ErrorResponse),
    };
  }
};
