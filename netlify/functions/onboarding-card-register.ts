/**
 * Onboarding NFC Card Registration Endpoint
 *
 * Registers an NFC card (NTAG424/Boltcard/Tapsigner) for a participant.
 * Stores card UID, type, and hashed PIN.
 *
 * @route POST /.netlify/functions/onboarding-card-register
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

/**
 * Get environment variable (process.env for Netlify Functions)
 */
function getEnvVar(key: string): string | undefined {
  return process.env[key];
}

// ============================================================================
// Types
// ============================================================================

interface RegisterCardRequest {
  participantId: string;
  cardUid: string;
  cardType: "ntag424" | "boltcard" | "tapsigner";
  pinHash?: string;
  pinSalt?: string;
  lnbitsCardId?: string;
}

interface RegisterCardResponse {
  card: {
    cardId: string;
    participantId: string;
    cardUid: string;
    cardType: string;
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

// CORS headers for browser compatibility
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const handler: Handler = async (
  event: HandlerEvent,
  _context: HandlerContext,
) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Parse request body
    const body: RegisterCardRequest = JSON.parse(event.body || "{}");

    // Validate required fields
    if (!body.participantId || !body.cardUid || !body.cardType) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Missing required fields: participantId, cardUid, cardType",
        } as ErrorResponse),
      };
    }

    // Validate card type
    if (!["ntag424", "boltcard", "tapsigner"].includes(body.cardType)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Invalid cardType. Must be ntag424, boltcard, or tapsigner",
        } as ErrorResponse),
      };
    }

    // Get authenticated user from JWT
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: corsHeaders,
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
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Invalid authentication token",
        } as ErrorResponse),
      };
    }

    // Verify participant exists
    const { data: participant, error: participantError } = await supabase
      .from("onboarding_participants")
      .select("*")
      .eq("participant_id", body.participantId)
      .single();

    if (participantError || !participant) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Participant not found",
        } as ErrorResponse),
      };
    }

    // TODO: Implement actual NFC card programming logic
    // - Program NTAG424/Boltcard via useProductionNTAG424
    // - Program Tapsigner via tapsigner-unified function
    // - Create LNbits Boltcard entry if applicable
    // - Register MFA factor

    // Create NFC card record (stub)
    const { data: card, error: insertError } = await supabase
      .from("nfc_cards")
      .insert({
        participant_id: body.participantId,
        user_id: participant.user_id || user.id,
        card_uid: body.cardUid,
        card_type: body.cardType,
        pin_hash: body.pinHash,
        pin_salt: body.pinSalt,
        lnbits_card_id: body.lnbitsCardId,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error registering card:", insertError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Failed to register NFC card",
          details: insertError.message,
        } as ErrorResponse),
      };
    }

    // Return success response
    const response: RegisterCardResponse = {
      card: {
        cardId: card.card_id,
        participantId: card.participant_id,
        cardUid: card.card_uid,
        cardType: card.card_type,
        status: card.status,
        createdAt: card.created_at,
      },
    };

    return {
      statusCode: 201,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Unexpected error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      } as ErrorResponse),
    };
  }
};
