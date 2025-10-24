/**
 * Profile Analytics Endpoint
 * GET /.netlify/functions/profile-analytics?days={number}
 *
 * Returns aggregated profile analytics for authenticated user.
 * Only the profile owner can access their analytics.
 * Privacy-first: Returns only aggregated data, no individual viewer tracking.
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { jwtDecode } from "jwt-decode";

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

function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...corsHeaders() } };
  }

  if (event.httpMethod !== "GET") {
    return badRequest({ error: "Method not allowed" }, 405);
  }

  try {
    // Extract and validate JWT token
    const token = extractToken(event.headers.authorization);
    if (!token) {
      return badRequest({ error: "Missing or invalid authorization header" }, 401);
    }

    let userId: string;
    try {
      const decoded = jwtDecode<{ sub: string }>(token);
      userId = decoded.sub;
      if (!userId) {
        return badRequest({ error: "Invalid token: missing user ID" }, 401);
      }
    } catch (err) {
      return badRequest({ error: "Invalid token" }, 401);
    }

    // Parse days parameter (default: 30)
    let days = 30;
    const daysParam = event.queryStringParameters?.days;
    if (daysParam) {
      const parsed = parseInt(daysParam, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 365) {
        days = parsed;
      }
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase configuration");
      return badRequest({ error: "Server configuration error" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Get user's profile
    const { data: profile, error: profileError } = await supabase
      .from("user_identities")
      .select("id, profile_views_count, last_profile_view, analytics_enabled")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return badRequest({ error: "Profile not found" }, 404);
    }

    // Get recent views (aggregated, no individual viewer data)
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: views, error: viewsError } = await supabase
      .from("profile_views")
      .select("viewed_at, referrer")
      .eq("profile_id", userId)
      .gte("viewed_at", cutoffDate)
      .order("viewed_at", { ascending: false })
      .limit(100);

    if (viewsError) {
      console.error("Analytics retrieval error:", viewsError);
      return badRequest({ error: "Failed to retrieve analytics" }, 500);
    }

    // Aggregate referrer data
    const referrerCounts: Record<string, number> = {};
    (views || []).forEach((view: any) => {
      if (view.referrer) {
        referrerCounts[view.referrer] = (referrerCounts[view.referrer] || 0) + 1;
      }
    });

    return json(200, {
      success: true,
      data: {
        total_views: profile.profile_views_count || 0,
        last_profile_view: profile.last_profile_view,
        analytics_enabled: profile.analytics_enabled,
        recent_views: (views || []).map((v: any) => ({
          viewed_at: v.viewed_at,
          referrer: v.referrer,
        })),
        referrer_summary: referrerCounts,
        period_days: days,
      },
    });
  } catch (error) {
    console.error("Profile analytics error:", error);
    return badRequest(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
};

