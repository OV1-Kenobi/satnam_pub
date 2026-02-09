/**
 * Onboarding Session Creation Endpoint
 *
 * Creates a new onboarding session for a coordinator.
 * Supports single and batch modes.
 *
 * @route POST /.netlify/functions/onboarding-session-create
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env";

// ============================================================================
// Types
// ============================================================================

interface CreateSessionRequest {
  mode: "single" | "batch";
  expiresInMinutes?: number;
}

interface CreateSessionResponse {
  session: {
    sessionId: string;
    coordinatorUserId: string;
    mode: string;
    status: string;
    participantCount: number;
    completedCount: number;
    createdAt: string;
    expiresAt?: string;
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
    const body: CreateSessionRequest = JSON.parse(event.body || "{}");

    // Validate required fields
    if (!body.mode || !["single", "batch"].includes(body.mode)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Invalid mode. Must be 'single' or 'batch'",
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

    // Calculate expiry time
    const expiresInMinutes = body.expiresInMinutes || 120; // Default 2 hours
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Create onboarding session
    const { data: session, error: insertError } = await supabase
      .from("onboarding_sessions")
      .insert({
        coordinator_user_id: user.id,
        mode: body.mode,
        status: "active",
        participant_count: 0,
        completed_count: 0,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating session:", insertError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Failed to create onboarding session",
          details: insertError.message,
        } as ErrorResponse),
      };
    }

    // Return success response
    const response: CreateSessionResponse = {
      session: {
        sessionId: session.session_id,
        coordinatorUserId: session.coordinator_user_id,
        mode: session.mode,
        status: session.status,
        participantCount: session.participant_count,
        completedCount: session.completed_count,
        createdAt: session.created_at,
        expiresAt: session.expires_at,
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
