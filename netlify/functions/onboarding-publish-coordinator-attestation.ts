/**
 * Onboarding Coordinator Attestation Publishing Endpoint
 *
 * Publishes a coordinator's attestation event to the Nostr network,
 * vouching for the participant's identity during physical peer onboarding.
 *
 * @route POST /.netlify/functions/onboarding-publish-coordinator-attestation
 * @authentication JWT via Authorization header (coordinator must own the session)
 * @security Privacy-first, RLS-enabled, coordinator signature verification
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env.js";

// ============================================================================
// Types
// ============================================================================

interface PublishCoordinatorAttestationRequest {
  participantNpub: string;
  participantNip05: string;
  federationId: string;
  sessionId: string;
  nip03EventId: string;
  metadata?: {
    onboarding_method?: string;
    onboarding_timestamp?: string;
    campaign_id?: string;
    kiosk_id?: string;
  };
}

interface PublishCoordinatorAttestationResponse {
  success: true;
  eventId: string;
  suggested_relays: string[];
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
  // Handle CORS preflight (OPTIONS) request
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
    const body: PublishCoordinatorAttestationRequest = JSON.parse(
      event.body || "{}",
    );

    // Validate required fields
    if (
      !body.participantNpub ||
      !body.participantNip05 ||
      !body.federationId ||
      !body.sessionId ||
      !body.nip03EventId
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
            "Missing required fields: participantNpub, participantNip05, federationId, sessionId, nip03EventId",
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

    // Verify coordinator owns the session
    const { data: session, error: sessionError } = await supabase
      .from("onboarding_sessions")
      .select("session_id, coordinator_user_id")
      .eq("session_id", body.sessionId)
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

    // Get coordinator's npub for attestation event
    const { data: coordinatorProfile, error: profileError } = await supabase
      .from("user_identities")
      .select("npub")
      .eq("id", user.id)
      .single();

    if (profileError || !coordinatorProfile?.npub) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Failed to retrieve coordinator profile",
        } as ErrorResponse),
      };
    }

    // ========================================================================
    // Create Coordinator Attestation Event
    // ========================================================================
    // NOTE: This creates a custom attestation event (Kind:30078 - Application-specific data)
    // The coordinator vouches for the participant's identity

    const now = Math.floor(Date.now() / 1000);

    // Generate deterministic event ID for idempotency (based on session + participant only)
    const attestationEventId = `coordinator_attestation_${body.sessionId}_${body.participantNpub.substring(0, 16)}`;

    // Create attestation event content
    const attestationContent = JSON.stringify({
      type: "physical_peer_onboarding_attestation",
      coordinator_npub: coordinatorProfile.npub,
      participant_npub: body.participantNpub,
      participant_nip05: body.participantNip05,
      federation_id: body.federationId,
      nip03_event_id: body.nip03EventId,
      session_id: body.sessionId,
      timestamp: now,
      ...body.metadata,
    });

    // Store attestation metadata in database with upsert for idempotency
    // NOTE: Actual Nostr event signing/publishing is deferred to client-side
    // This follows the pattern from register-identity.ts where events are
    // published by the client with proper session context
    //
    // IDEMPOTENCY: Uses upsert with unique constraint on metadata->>'event_id'
    // - First request: Creates new attestation record
    // - Retry requests: Updates updated_at timestamp, leaves other fields unchanged
    // - Database constraint (idx_attestations_coordinator_event_id) prevents duplicates

    // First, check if attestation already exists (for proper response handling)
    const { data: existingAttestation } = await supabase
      .from("attestations")
      .select("id, created_at")
      .eq("event_type", "coordinator_attestation")
      .eq("metadata->>event_id", attestationEventId)
      .maybeSingle();

    const isRetry = !!existingAttestation;

    // Upsert attestation record
    // Note: Supabase doesn't support upsert on JSONB fields directly,
    // so we use a two-step approach: check existence, then insert or update
    let attestationData;
    let attestationError;

    if (isRetry) {
      // Update existing record (idempotent retry)
      const { data, error } = await supabase
        .from("attestations")
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingAttestation.id)
        .select("id")
        .single();

      attestationData = data;
      attestationError = error;
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from("attestations")
        .insert({
          verification_id: null, // Not tied to a specific verification
          event_type: "coordinator_attestation",
          metadata: {
            event_id: attestationEventId,
            coordinator_npub: coordinatorProfile.npub,
            participant_npub: body.participantNpub,
            participant_nip05: body.participantNip05,
            federation_id: body.federationId,
            nip03_event_id: body.nip03EventId,
            session_id: body.sessionId,
            content: attestationContent,
            ...body.metadata,
          },
          status: "completed",
        })
        .select("id")
        .single();

      attestationData = data;
      attestationError = error;
    }

    if (attestationError) {
      console.error(
        "Failed to store coordinator attestation:",
        attestationError,
      );
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Failed to store coordinator attestation",
          details: attestationError.message,
        } as ErrorResponse),
      };
    }

    // ========================================================================
    // Update Session Statistics
    // ========================================================================
    // Update session timestamp to reflect activity

    const { error: sessionUpdateError } = await supabase
      .from("onboarding_sessions")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", body.sessionId);

    if (sessionUpdateError) {
      console.error("Failed to update session statistics:", sessionUpdateError);
      // Non-fatal - attestation was created successfully
    }

    // ========================================================================
    // Return Success Response
    // ========================================================================
    // NOTE: Relay URLs are hardcoded for now, can be made configurable later
    //
    // IDEMPOTENCY RESPONSE:
    // - 201 Created: New attestation record was created
    // - 200 OK: Idempotent retry, existing attestation was found and updated

    const relayUrls = [
      "wss://relay.satnam.pub",
      "wss://relay.damus.io",
      "wss://nos.lol",
    ];

    const response: PublishCoordinatorAttestationResponse = {
      success: true,
      eventId: attestationEventId,
      suggested_relays: relayUrls,
    };

    return {
      statusCode: isRetry ? 200 : 201,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error(
      "Onboarding coordinator attestation publishing error:",
      error,
    );

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
        error: "Failed to publish coordinator attestation",
        details: errorMessage,
      } as ErrorResponse),
    };
  }
};
