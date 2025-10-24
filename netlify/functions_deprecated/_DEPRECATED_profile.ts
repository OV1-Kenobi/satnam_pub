/**
 * Public Profile Retrieval Endpoint
 * GET /.netlify/functions/profile?username={username} or ?npub={npub}
 *
 * Returns public profile data respecting privacy settings.
 * No authentication required for public profiles.
 * Privacy-first: Never exposes nsec, encrypted credentials, or sensitive data.
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
    "Content-Security-Policy": "default-src 'none'",
  } as const;
}

function json(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function badRequest(body: unknown, status = 400) {
  return json(status, body);
}

function sanitizeProfile(profile: any) {
  // Remove sensitive fields - never expose these
  const { encrypted_nsec, password_hash, password_salt, auth_salt_hash, session_hash, session_salt, ...sanitized } = profile;
  return sanitized;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...corsHeaders() } };
  }

  if (event.httpMethod !== "GET") {
    return badRequest({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase configuration");
      return badRequest({ error: "Server configuration error" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const username = (event.queryStringParameters?.username || "").trim();
    const npub = (event.queryStringParameters?.npub || "").trim();

    if (!username && !npub) {
      return badRequest({ error: "Missing username or npub query parameter" }, 422);
    }

    let query = supabase
      .from("user_identities")
      .select("*")
      .eq("profile_visibility", "public");

    if (username) {
      query = query.eq("username", username);
    } else if (npub) {
      query = query.eq("npub", npub);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return json(404, { success: false, error: "Profile not found" });
    }

    // Sanitize profile data before returning
    const sanitized = sanitizeProfile(data);

    return json(200, {
      success: true,
      data: sanitized,
    });
  } catch (error) {
    console.error("Profile retrieval error:", error);
    return badRequest(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
};

