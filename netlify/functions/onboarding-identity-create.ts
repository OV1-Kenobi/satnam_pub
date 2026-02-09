/**
 * Onboarding Identity Creation Endpoint
 *
 * Persists Nostr identity data (npub, encrypted_nsec, nip05) for an onboarding participant.
 * Called after NostrIdentityStep generates and encrypts the keypair.
 *
 * @route POST /.netlify/functions/onboarding-identity-create
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env.js";

// ============================================================================
// Types
// ============================================================================

/** PRK encryption result structure from password-recovery-key.ts */
interface PRKEncryptionResult {
  encrypted: string; // Base64url-encoded encrypted password
  salt: string; // Base64url-encoded 32-byte salt
  iv: string; // Base64url-encoded 12-byte IV
}

interface CreateIdentityRequest {
  participantId: string;
  npub: string;
  nip05: string;
  encryptedNsec: string;
  /** Optional PRK for nsec-based password recovery */
  prkNsec?: PRKEncryptionResult;
}

interface CreateIdentityResponse {
  participant: {
    participantId: string;
    npub: string;
    nip05: string;
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
    const body: CreateIdentityRequest = JSON.parse(event.body || "{}");

    // Validate required fields
    if (
      !body.participantId ||
      !body.npub ||
      !body.nip05 ||
      !body.encryptedNsec
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
            "Missing required fields: participantId, npub, nip05, encryptedNsec",
        } as ErrorResponse),
      };
    }

    // Validate npub format (should start with "npub1" and be 63 chars total)
    if (!body.npub.startsWith("npub1") || body.npub.length !== 63) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Invalid npub format",
        } as ErrorResponse),
      };
    }

    // Validate encrypted nsec format (should be salt:iv:ciphertext in hex)
    const encryptedParts = body.encryptedNsec.split(":");
    if (encryptedParts.length !== 3) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Invalid encrypted nsec format (expected salt:iv:ciphertext)",
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

    // Update participant with Nostr identity data and PRK (if provided)
    const updateData: Record<string, unknown> = {
      npub: body.npub,
      nip05: body.nip05,
      encrypted_nsec: body.encryptedNsec,
      current_step: "identity",
      updated_at: new Date().toISOString(),
    };

    // Add PRK fields if provided (for password recovery via nsec)
    if (body.prkNsec) {
      updateData.encrypted_prk_nsec = body.prkNsec.encrypted;
      updateData.prk_salt_nsec = body.prkNsec.salt;
      updateData.prk_iv_nsec = body.prkNsec.iv;
    }

    const { data: updatedParticipant, error: updateError } = await supabase
      .from("onboarded_identities")
      .update(updateData)
      .eq("participant_id", body.participantId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating participant identity:", updateError);
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Failed to update participant identity",
          details: updateError.message,
        } as ErrorResponse),
      };
    }

    // Return success response
    const response: CreateIdentityResponse = {
      participant: {
        participantId: updatedParticipant.participant_id,
        npub: updatedParticipant.npub,
        nip05: updatedParticipant.nip05,
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
