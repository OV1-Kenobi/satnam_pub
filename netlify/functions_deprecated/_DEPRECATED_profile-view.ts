/**
 * Profile View Recording Endpoint (Privacy-First Analytics)
 * POST /.netlify/functions/profile-view
 *
 * Records profile views with privacy-first principles:
 * - Hashed viewer identity (no PII stored)
 * - Aggregated data only
 * - No authentication required (anonymous analytics)
 * - Respects user's analytics settings
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...corsHeaders() } };
  }

  if (event.httpMethod !== "POST") {
    return badRequest({ error: "Method not allowed" }, 405);
  }

  try {
    // Parse request body
    let body: any;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return badRequest({ error: "Invalid JSON body" }, 400);
    }

    const { profile_id, viewer_hash, referrer } = body;

    // Validate required fields
    if (!profile_id || !viewer_hash) {
      return badRequest({
        error: "Missing required fields: profile_id, viewer_hash",
      }, 422);
    }

    // Validate profile_id is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(profile_id)) {
      return badRequest({ error: "Invalid profile_id format" }, 422);
    }

    // Validate viewer_hash is a reasonable length (SHA-256 hex is 64 chars, we use first 50)
    if (typeof viewer_hash !== "string" || viewer_hash.length < 20 || viewer_hash.length > 64) {
      return badRequest({ error: "Invalid viewer_hash format" }, 422);
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase configuration");
      return badRequest({ error: "Server configuration error" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if profile exists and has analytics enabled
    const { data: profile, error: profileError } = await supabase
      .from("user_identities")
      .select("id, analytics_enabled")
      .eq("id", profile_id)
      .single();

    if (profileError || !profile) {
      // Don't expose whether profile exists or not (privacy)
      return json(200, { success: true });
    }

    // Only record view if analytics are enabled
    if (!profile.analytics_enabled) {
      return json(200, { success: true });
    }

    // Extract referrer domain (privacy: only store domain, not full URL)
    let referrerDomain: string | null = null;
    if (referrer) {
      try {
        const url = new URL(referrer);
        referrerDomain = url.hostname;
      } catch {
        // Invalid URL, skip referrer
      }
    }

    // Record the view
    const { error: insertError } = await supabase
      .from("profile_views")
      .insert({
        profile_id,
        viewer_hash,
        referrer: referrerDomain,
      });

    if (insertError) {
      console.error("View recording error:", insertError);
      // Don't expose error details to client (privacy)
      return json(200, { success: true });
    }

    return json(200, { success: true });
  } catch (error) {
    console.error("Profile view recording error:", error);
    // Don't expose error details to client (privacy)
    return json(200, { success: true });
  }
};

