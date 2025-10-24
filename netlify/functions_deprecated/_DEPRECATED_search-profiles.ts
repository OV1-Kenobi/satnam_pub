/**
 * Profile Search Endpoint
 * GET /.netlify/functions/search-profiles?q={query}&limit={limit}
 *
 * Searches public profiles by username, npub, or NIP-05 identifier.
 * Only returns profiles with profile_visibility = 'public'.
 * Implements rate limiting to prevent enumeration attacks.
 * Privacy-first: Never exposes sensitive data.
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { allowRequest } from "./utils/rate-limiter.js";

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";
const RATE_LIMIT_KEY = "search-profiles";
const RATE_LIMIT_REQUESTS = 100; // 100 requests
const RATE_LIMIT_WINDOW = 3600; // per hour

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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

function sanitizeProfile(profile: any) {
  // Remove sensitive fields
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
    // Rate limiting
    const clientIp = event.headers["client-ip"] || event.headers["x-forwarded-for"] || "unknown";
    const allowed = allowRequest(RATE_LIMIT_KEY, clientIp, RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW);

    if (!allowed) {
      return json(429, {
        success: false,
        error: "Rate limit exceeded. Maximum 100 requests per hour.",
      });
    }

    const query = (event.queryStringParameters?.q || "").trim();
    const limitParam = event.queryStringParameters?.limit || "20";
    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100);

    if (!query || query.length < 2) {
      return badRequest({
        error: "Search query must be at least 2 characters",
      }, 422);
    }

    if (query.length > 100) {
      return badRequest({
        error: "Search query must be less than 100 characters",
      }, 422);
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

    // Search by username (case-insensitive)
    const { data: usernameResults, error: usernameError } = await supabase
      .from("user_identities")
      .select("*")
      .eq("profile_visibility", "public")
      .ilike("username", `%${query}%`)
      .limit(limit);

    if (usernameError) {
      console.error("Username search error:", usernameError);
      return badRequest({ error: "Search failed" }, 500);
    }

    // Search by NIP-05 (case-insensitive)
    const { data: nip05Results, error: nip05Error } = await supabase
      .from("user_identities")
      .select("*")
      .eq("profile_visibility", "public")
      .ilike("nip05", `%${query}%`)
      .limit(limit);

    if (nip05Error) {
      console.error("NIP-05 search error:", nip05Error);
      return badRequest({ error: "Search failed" }, 500);
    }

    // Search by npub (exact match or prefix)
    const { data: npubResults, error: npubError } = await supabase
      .from("user_identities")
      .select("*")
      .eq("profile_visibility", "public")
      .or(`npub.ilike.${query}%,npub.eq.${query}`)
      .limit(limit);

    if (npubError) {
      console.error("Npub search error:", npubError);
      return badRequest({ error: "Search failed" }, 500);
    }

    // Combine and deduplicate results
    const resultsMap = new Map();
    [...(usernameResults || []), ...(nip05Results || []), ...(npubResults || [])].forEach(
      (profile) => {
        if (!resultsMap.has(profile.id)) {
          resultsMap.set(profile.id, sanitizeProfile(profile));
        }
      }
    );

    const results = Array.from(resultsMap.values()).slice(0, limit);

    return json(200, {
      success: true,
      data: results,
      count: results.length,
    });
  } catch (error) {
    console.error("Profile search error:", error);
    return badRequest(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
};

