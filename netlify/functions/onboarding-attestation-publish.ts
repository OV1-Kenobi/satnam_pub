/**
 * Onboarding Attestation Publishing Endpoint
 *
 * Publishes cryptographic attestations for onboarding events.
 * Supports OpenTimestamps (OTS) and NIP-03 timestamped events.
 *
 * @route POST /.netlify/functions/onboarding-attestation-publish
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env";

// ============================================================================
// Types
// ============================================================================

interface PublishAttestationRequest {
  participantId: string;
  type: "opentimestamps" | "nip03";
  commitment: string;
}

interface PublishAttestationResponse {
  attestation: {
    attestationId: string;
    participantId: string;
    type: string;
    commitment: string;
    timestamp: string;
    publishedAt?: string;
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
    const body: PublishAttestationRequest = JSON.parse(event.body || "{}");

    // Validate required fields
    if (!body.participantId || !body.type || !body.commitment) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields: participantId, type, commitment",
        } as ErrorResponse),
      };
    }

    // Validate attestation type
    if (!["opentimestamps", "nip03"].includes(body.type)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Invalid type. Must be opentimestamps or nip03",
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

    // Verify participant exists
    const { data: participant, error: participantError } = await supabase
      .from("onboarded_identities")
      .select("*")
      .eq("participant_id", body.participantId)
      .single();

    if (participantError || !participant) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: "Participant not found",
        } as ErrorResponse),
      };
    }

    // TODO: Implement actual attestation publishing logic
    // - For OpenTimestamps: Create OTS commitment and submit to calendar servers
    // - For NIP-03: Publish timestamped Nostr event
    // - Integrate with existing attestation-manager.ts

    // Create attestation record (stub)
    // Note: This would be stored in a separate attestations table
    // For now, we'll just return a success response

    const response: PublishAttestationResponse = {
      attestation: {
        attestationId: "stub-attestation-id",
        participantId: body.participantId,
        type: body.type,
        commitment: body.commitment,
        timestamp: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
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
