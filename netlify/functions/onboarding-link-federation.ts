/**
 * Onboarding Federation Linking Endpoint
 *
 * Links a newly onboarded participant to the coordinator's family federation.
 * Creates family_members record with Master Context role assignment.
 *
 * @route POST /.netlify/functions/onboarding-link-federation
 * @authentication JWT via Authorization header (coordinator must own the session)
 * @security Privacy-first, RLS-enabled, Master Context role hierarchy
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env.js";

// ============================================================================
// Types
// ============================================================================

interface LinkFederationRequest {
  participantId: string;
  userId: string;
  federationId: string;
  role: "private" | "offspring" | "adult" | "steward" | "guardian";
  sessionId: string;
}

interface LinkFederationResponse {
  success: true;
  federationId: string;
  membershipId: string;
  role: string;
}

interface ErrorResponse {
  error: string;
  details?: string;
}

// ============================================================================
// Constants
// ============================================================================

const VALID_ROLES = [
  "private",
  "offspring",
  "adult",
  "steward",
  "guardian",
] as const;

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
      statusCode: 204,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": getEnvVar("ALLOWED_ORIGIN") || "*",
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
        "Access-Control-Allow-Origin": getEnvVar("ALLOWED_ORIGIN") || "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Parse request body
    const body: LinkFederationRequest = JSON.parse(event.body || "{}");

    // Validate required fields
    if (
      !body.participantId ||
      !body.userId ||
      !body.federationId ||
      !body.role ||
      !body.sessionId
    ) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getEnvVar("ALLOWED_ORIGIN") || "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error:
            "Missing required fields: participantId, userId, federationId, role, sessionId",
        } as ErrorResponse),
      };
    }

    // Validate role
    if (!VALID_ROLES.includes(body.role)) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getEnvVar("ALLOWED_ORIGIN") || "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
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
          "Access-Control-Allow-Origin": getEnvVar("ALLOWED_ORIGIN") || "*",
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
          "Access-Control-Allow-Origin": getEnvVar("ALLOWED_ORIGIN") || "*",
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
          "Access-Control-Allow-Origin": getEnvVar("ALLOWED_ORIGIN") || "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Forbidden: You do not own this onboarding session",
        } as ErrorResponse),
      };
    }

    // Verify participant exists
    const { data: participant, error: participantError } = await supabase
      .from("onboarded_identities")
      .select("participant_id, user_duid")
      .eq("participant_id", body.participantId)
      .single();

    if (
      participantError ||
      !participant ||
      participant.user_duid !== body.userId
    ) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getEnvVar("ALLOWED_ORIGIN") || "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Participant not found or user ID mismatch",
        } as ErrorResponse),
      };
    }

    // ========================================================================
    // Ensure Family Federation Exists and Validate Ownership
    // ========================================================================
    // Check if the federation exists and validate coordinator ownership

    const { data: existingFederation, error: federationCheckError } =
      await supabase
        .from("family_federations")
        .select("federation_duid, federation_name, created_by")
        .eq("federation_duid", body.federationId)
        .maybeSingle();

    if (federationCheckError) {
      console.error(
        "Failed to check federation existence:",
        federationCheckError,
      );
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getEnvVar("ALLOWED_ORIGIN") || "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Failed to verify federation",
          details: federationCheckError.message,
        } as ErrorResponse),
      };
    }

    // If federation exists, validate coordinator ownership
    if (existingFederation) {
      if (existingFederation.created_by !== user.id) {
        return {
          statusCode: 403,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": getEnvVar("ALLOWED_ORIGIN") || "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
          body: JSON.stringify({
            error: "Forbidden: You do not own this federation",
            details:
              "Only the federation creator can add members to this federation",
          } as ErrorResponse),
        };
      }
    } else {
      // If federation doesn't exist, create it (coordinator becomes owner)
      const { error: createFederationError } = await supabase
        .from("family_federations")
        .insert({
          federation_duid: body.federationId,
          federation_name: `Onboarding Federation ${body.sessionId.substring(0, 8)}`,
          created_by: user.id,
          metadata: {
            created_via: "physical_peer_onboarding",
            session_id: body.sessionId,
          },
        });

      if (createFederationError) {
        console.error("Failed to create federation:", createFederationError);
        return {
          statusCode: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": getEnvVar("ALLOWED_ORIGIN") || "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
          body: JSON.stringify({
            error: "Failed to create family federation",
            details: createFederationError.message,
          } as ErrorResponse),
        };
      }
    }

    // ========================================================================
    // Link Participant to Federation with Transaction
    // ========================================================================
    // Use database transaction to ensure atomicity and prevent data inconsistency

    const { data: transactionResult, error: transactionError } =
      await supabase.rpc("link_participant_to_federation_transaction", {
        p_federation_duid: body.federationId,
        p_user_duid: body.userId,
        p_role: body.role,
        p_joined_at: new Date().toISOString(),
        p_metadata: {
          onboarding_session_id: body.sessionId,
          onboarding_participant_id: body.participantId,
          added_by: user.id,
        },
        p_participant_id: body.participantId,
        p_federation_id: body.federationId,
        p_updated_at: new Date().toISOString(),
      });

    if (transactionError) {
      console.error(
        "Failed to link participant to federation (transaction failed):",
        transactionError,
      );
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getEnvVar("ALLOWED_ORIGIN") || "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Failed to link participant to federation",
          details: "Database transaction failed: " + transactionError.message,
        } as ErrorResponse),
      };
    }

    // ========================================================================
    // Return Success Response
    // ========================================================================

    const response: LinkFederationResponse = {
      success: true,
      federationId: body.federationId,
      membershipId: transactionResult.membership_id,
      role: body.role,
    };

    return {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": getEnvVar("ALLOWED_ORIGIN") || "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Onboarding federation linking error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": getEnvVar("ALLOWED_ORIGIN") || "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify({
        error: "Failed to link participant to federation",
        details: errorMessage,
      } as ErrorResponse),
    };
  }
};
