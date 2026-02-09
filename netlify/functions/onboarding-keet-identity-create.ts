/**
 * Onboarding Keet Identity Creation Endpoint
 *
 * Persists Keet P2P identity data (peer ID, encrypted seed, PRK) for an onboarding participant.
 * Called after KeetIdentityStep generates and encrypts the seed phrase.
 *
 * @route POST /.netlify/functions/onboarding-keet-identity-create
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env.js";

// ============================================================================
// Types
// ============================================================================

/** PRK encryption result structure */
interface PRKEncryptionResult {
  encrypted: string;
  salt: string;
  iv: string;
}

interface CreateKeetIdentityRequest {
  participantId: string;
  keetPeerId: string;
  encryptedKeetSeed: string;
  keetSeedSalt: string;
  /** Optional PRK for Keet seed-based password recovery */
  prkKeet?: PRKEncryptionResult;
}

interface CreateKeetIdentityResponse {
  participant: {
    participantId: string;
    keetPeerId: string;
    currentStep: string;
    status: string;
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
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
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
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Parse request body
    const body: CreateKeetIdentityRequest = JSON.parse(event.body || "{}");

    // Validate required fields
    if (
      !body.participantId ||
      !body.keetPeerId ||
      !body.encryptedKeetSeed ||
      !body.keetSeedSalt
    ) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error:
            "Missing required fields: participantId, keetPeerId, encryptedKeetSeed, keetSeedSalt",
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
          "Access-Control-Allow-Methods": "POST, OPTIONS",
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
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Invalid authentication token",
        } as ErrorResponse),
      };
    }

    // Verify participant exists and belongs to a session coordinated by this user
    const { data: participant, error: participantError } = await supabase
      .from("onboarded_identities")
      .select("*, onboarding_sessions!inner(coordinator_user_id)")
      .eq("participant_id", body.participantId)
      .single();

    if (participantError || !participant) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Participant not found",
        } as ErrorResponse),
      };
    }

    // Verify coordinator owns this session
    if (participant.onboarding_sessions.coordinator_user_id !== user.id) {
      return {
        statusCode: 403,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Access denied: not session coordinator",
        } as ErrorResponse),
      };
    }

    // Update participant with Keet identity data and PRK (if provided)
    const updateData: Record<string, unknown> = {
      keet_peer_id: body.keetPeerId,
      encrypted_keet_seed: body.encryptedKeetSeed,
      keet_seed_salt: body.keetSeedSalt,
      current_step: "keet",
      updated_at: new Date().toISOString(),
    };

    // Add PRK fields if provided (for password recovery via Keet seed)
    if (body.prkKeet) {
      updateData.encrypted_prk_keet = body.prkKeet.encrypted;
      updateData.prk_salt_keet = body.prkKeet.salt;
      updateData.prk_iv_keet = body.prkKeet.iv;
    }

    const { data: updatedParticipant, error: updateError } = await supabase
      .from("onboarded_identities")
      .update(updateData)
      .eq("participant_id", body.participantId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating participant Keet identity:", updateError);
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Failed to update participant Keet identity",
          details: updateError.message,
        } as ErrorResponse),
      };
    }

    // Return success response
    const response: CreateKeetIdentityResponse = {
      participant: {
        participantId: updatedParticipant.participant_id,
        keetPeerId: updatedParticipant.keet_peer_id,
        currentStep: updatedParticipant.current_step,
        status: updatedParticipant.status,
      },
    };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Unexpected error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      } as ErrorResponse),
    };
  }
};
