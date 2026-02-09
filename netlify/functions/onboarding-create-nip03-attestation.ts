/**
 * Onboarding NIP-03 Attestation Creation Endpoint
 *
 * Creates and publishes a NIP-03 timestamped attestation event (Kind:1040)
 * for a participant's identity creation during physical peer onboarding.
 *
 * @route POST /.netlify/functions/onboarding-create-nip03-attestation
 * @authentication JWT via Authorization header (coordinator must own the session)
 * @security Privacy-first, RLS-enabled, zero-knowledge architecture
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env.js";

// ============================================================================
// Types
// ============================================================================

interface CreateNIP03AttestationRequest {
  participantId: string;
  npub: string;
  nip05: string;
  simpleproofTimestampId?: string | null;
  otsProof?: string;
  eventType: string;
  relayUrls: string[];
}

interface CreateNIP03AttestationResponse {
  success: true;
  nip03_event_id: string;
  relay_count: number;
  target_relays: string[];
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
  // Handle CORS preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      } as Record<string, string>,
      body: "",
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Parse request body
    const body: CreateNIP03AttestationRequest = JSON.parse(event.body || "{}");

    // Validate required fields
    if (
      !body.participantId ||
      !body.npub ||
      !body.nip05 ||
      !body.eventType ||
      !body.relayUrls
    ) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error:
            "Missing required fields: participantId, npub, nip05, eventType, relayUrls",
        } as ErrorResponse),
      };
    }

    // Validate relay URLs
    if (!Array.isArray(body.relayUrls) || body.relayUrls.length === 0) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "relayUrls must be a non-empty array",
        } as ErrorResponse),
      };
    }

    // Get authenticated user from JWT
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
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
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Invalid authentication token",
        } as ErrorResponse),
      };
    }

    // Verify participant exists and belongs to coordinator's session
    const { data: participant, error: participantError } = await supabase
      .from("onboarded_identities")
      .select("participant_id, session_id, user_duid, npub, nip05")
      .eq("participant_id", body.participantId)
      .single();

    if (participantError || !participant) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Participant not found",
        } as ErrorResponse),
      };
    }

    // Verify coordinator owns the session
    const { data: session, error: sessionError } = await supabase
      .from("onboarding_sessions")
      .select("session_id, coordinator_user_id")
      .eq("session_id", participant.session_id)
      .single();

    if (sessionError || !session || session.coordinator_user_id !== user.id) {
      return {
        statusCode: 403,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Forbidden: You do not own this onboarding session",
        } as ErrorResponse),
      };
    }

    // ========================================================================
    // Create NIP-03 Attestation Record with Transaction
    // ========================================================================
    // Use database transaction to ensure atomicity and prevent data inconsistency
    // If any operation fails, the entire transaction is rolled back

    const now = Math.floor(Date.now() / 1000);

    // Generate a unique event ID for the NIP-03 attestation
    // This will be used as the attested_event_id (the participant's identity)
    const attestedEventId = body.nip05; // Use NIP-05 as public identifier
    const nip03EventId = `nip03_${body.participantId}_${now}`;

    // Execute all database operations in a transaction
    const { data: transactionResult, error: transactionError } =
      await supabase.rpc("create_nip03_attestation_transaction", {
        p_attested_event_id: attestedEventId,
        p_attested_event_kind: 0, // Kind:0 profile event
        p_nip03_event_id: nip03EventId,
        p_nip03_event_kind: 1040, // NIP-03 attestation event
        p_simpleproof_timestamp_id: body.simpleproofTimestampId || null,
        p_ots_proof: body.otsProof || "",
        p_event_type: body.eventType,
        p_user_duid: participant.user_duid,
        p_relay_urls: body.relayUrls,
        p_published_at: now,
        p_metadata: {
          nip05: body.nip05,
          npub: body.npub,
          onboarding_session_id: participant.session_id,
          onboarding_participant_id: body.participantId,
        },
        p_participant_id: body.participantId,
        p_updated_at: new Date().toISOString(),
      });

    if (transactionError) {
      console.error(
        "Failed to create NIP-03 attestation (transaction failed):",
        transactionError,
      );
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Failed to create NIP-03 attestation",
          details: "Database transaction failed: " + transactionError.message,
        } as ErrorResponse),
      };
    }

    // ========================================================================
    // Return Success Response
    // ========================================================================
    // NOTE: Actual Nostr event publishing is deferred to client-side
    // This follows the pattern from register-identity.ts where NIP-03 events
    // are published by the client with proper session context

    const response: CreateNIP03AttestationResponse = {
      success: true,
      nip03_event_id: nip03EventId,
      relay_count: body.relayUrls.length,
      target_relays: body.relayUrls,
    };

    return {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Onboarding NIP-03 attestation creation error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify({
        error: "Failed to create NIP-03 attestation",
        details: errorMessage,
      } as ErrorResponse),
    };
  }
};
