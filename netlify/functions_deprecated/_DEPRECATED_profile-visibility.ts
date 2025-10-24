/**
 * Profile Visibility Update Endpoint
 * PATCH /.netlify/functions/profile-visibility
 *
 * Updates user's profile visibility settings.
 * Requires authentication via JWT token.
 * Only the profile owner can update their visibility.
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { jwtDecode } from "jwt-decode";

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "PATCH, OPTIONS",
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

  if (event.httpMethod !== "PATCH") {
    return badRequest({ error: "Method not allowed" }, 405);
  }

  try {
    // Extract and validate JWT token
    const token = extractToken(event.headers.authorization);
    if (!token) {
      return badRequest(
        { error: "Missing or invalid authorization header" },
        401
      );
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

    // Parse request body
    let body: any;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return badRequest({ error: "Invalid JSON body" }, 400);
    }

    const { visibility, is_discoverable, analytics_enabled } = body;

    // Build update object (Phase 3: Support multiple settings)
    const updates: Record<string, any> = {};

    // Validate and add visibility if provided
    if (visibility !== undefined) {
      if (
        ![
          "public",
          "contacts_only",
          "trusted_contacts_only",
          "private",
        ].includes(visibility)
      ) {
        return badRequest(
          {
            error:
              "Invalid visibility value. Must be 'public', 'contacts_only', 'trusted_contacts_only', or 'private'",
          },
          422
        );
      }
      updates.profile_visibility = visibility;
    }

    // Validate and add is_discoverable if provided
    if (is_discoverable !== undefined) {
      if (typeof is_discoverable !== "boolean") {
        return badRequest(
          { error: "Invalid is_discoverable value. Must be boolean" },
          422
        );
      }
      updates.is_discoverable = is_discoverable;
    }

    // Validate and add analytics_enabled if provided
    if (analytics_enabled !== undefined) {
      if (typeof analytics_enabled !== "boolean") {
        return badRequest(
          { error: "Invalid analytics_enabled value. Must be boolean" },
          422
        );
      }
      updates.analytics_enabled = analytics_enabled;
    }

    // Ensure at least one field is being updated
    if (Object.keys(updates).length === 0) {
      return badRequest(
        {
          error:
            "At least one field must be provided: visibility, is_discoverable, or analytics_enabled",
        },
        422
      );
    }

    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

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

    // Update profile settings
    const { error } = await supabase
      .from("user_identities")
      .update(updates)
      .eq("id", userId);

    if (error) {
      console.error("Update error:", error);
      return badRequest({ error: "Failed to update profile settings" }, 500);
    }

    return json(200, {
      success: true,
      data: updates,
    });
  } catch (error) {
    console.error("Profile visibility update error:", error);
    return badRequest(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
};
