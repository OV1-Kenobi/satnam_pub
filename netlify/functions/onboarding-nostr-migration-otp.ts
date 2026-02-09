/**
 * Onboarding Nostr Migration OTP Endpoint
 *
 * Generates and verifies OTP for Nostr account migration.
 * Uses NIP-59 gift-wrapped messaging for OTP delivery.
 *
 * @route POST /.netlify/functions/onboarding-nostr-migration-otp
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env";

// ============================================================================
// Types
// ============================================================================

interface GenerateOTPRequest {
  action: "generate";
  participantId: string;
  oldNpub: string;
  newNpub: string;
}

interface VerifyOTPRequest {
  action: "verify";
  otpSessionId: string;
  otp: string;
}

type OTPRequest = GenerateOTPRequest | VerifyOTPRequest;

interface GenerateOTPResponse {
  otpSessionId: string;
  expiresAt: string;
}

interface VerifyOTPResponse {
  verified: boolean;
  migrationId?: string;
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
    const body: OTPRequest = JSON.parse(event.body || "{}");

    // Validate action
    if (!body.action || !["generate", "verify"].includes(body.action)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Invalid action. Must be 'generate' or 'verify'",
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

    // Handle generate action
    if (body.action === "generate") {
      const generateBody = body as GenerateOTPRequest;

      // TODO: Implement OTP generation logic
      // - Generate RFC 6238 TOTP
      // - Send via NIP-59 gift wrap + NIP-44 encryption
      // - Store OTP session in database
      // - Return session ID and expiry

      // Stub response
      const response: GenerateOTPResponse = {
        otpSessionId: "stub-otp-session-id",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(response),
      };
    }

    // Handle verify action
    if (body.action === "verify") {
      const verifyBody = body as VerifyOTPRequest;

      // TODO: Implement OTP verification logic
      // - Verify OTP against stored session
      // - Check expiry
      // - Create migration record
      // - Return verification result

      // Stub response
      const response: VerifyOTPResponse = {
        verified: false,
        migrationId: undefined,
      };

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(response),
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid request" } as ErrorResponse),
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
