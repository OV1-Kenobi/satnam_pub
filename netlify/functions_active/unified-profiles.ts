/**
 * Unified Profiles Netlify Function
 * Consolidates all profile-related operations with action-based routing
 *
 * Actions:
 * - getProfile (public): GET profile by username/npub
 * - searchProfiles (public): GET profile search
 * - trackView (public): POST view tracking (privacy-first)
 * - updateVisibility (user): PATCH visibility settings
 * - getAnalytics (user): GET analytics data
 *
 * Pattern: Similar to lnbits-proxy.ts with scope-based access control
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { jwtDecode } from "jwt-decode";
import { allowRequest } from "./utils/rate-limiter.js";

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";
const FEATURE_ENABLED =
  ((process.env.VITE_PUBLIC_PROFILES_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Action definitions with scope-based access control
const ACTIONS = {
  // Public-scoped operations (no auth required)
  getProfile: { scope: "public" as const },
  searchProfiles: { scope: "public" as const },
  trackView: { scope: "public" as const },

  // User-scoped operations (requires JWT auth)
  updateVisibility: { scope: "user" as const },
  getAnalytics: { scope: "user" as const },

  // Phase 4: Profile Customization actions (user-scoped, requires JWT auth)
  updateTheme: { scope: "user" as const },
  updateBanner: { scope: "user" as const }, // Phase 4B: Banner Management
  updateSocialLinks: { scope: "user" as const }, // Phase 4C: Social Links Editor
} as const;

type ActionName = keyof typeof ACTIONS;

// ============================================================================
// Shared Helper Functions
// ============================================================================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
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

function sanitizeProfile(profile: any) {
  // Remove sensitive fields - never expose these
  const {
    encrypted_nsec,
    password_hash,
    password_salt,
    auth_salt_hash,
    session_hash,
    session_salt,
    ...sanitized
  } = profile;
  return sanitized;
}

function getSupabaseClient(token?: string) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase configuration");
  }

  const config: any = {
    auth: { autoRefreshToken: false, persistSession: false },
  };

  if (token) {
    config.global = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  return createClient(supabaseUrl, supabaseKey, config);
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleGetProfile(event: any) {
  const username = (event.queryStringParameters?.username || "").trim();
  const npub = (event.queryStringParameters?.npub || "").trim();

  if (!username && !npub) {
    return badRequest(
      { error: "Missing username or npub query parameter" },
      422
    );
  }

  const supabase = getSupabaseClient();

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

  const sanitized = sanitizeProfile(data);

  return json(200, {
    success: true,
    data: sanitized,
  });
}

async function handleSearchProfiles(event: any) {
  const query = (event.queryStringParameters?.q || "").trim();
  const limitParam = event.queryStringParameters?.limit || "20";
  const limit = Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100);

  if (!query || query.length < 2) {
    return badRequest(
      {
        error: "Search query must be at least 2 characters",
      },
      422
    );
  }

  if (query.length > 100) {
    return badRequest(
      {
        error: "Search query must be less than 100 characters",
      },
      422
    );
  }

  const supabase = getSupabaseClient();

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
  [
    ...(usernameResults || []),
    ...(nip05Results || []),
    ...(npubResults || []),
  ].forEach((profile) => {
    if (!resultsMap.has(profile.id)) {
      resultsMap.set(profile.id, sanitizeProfile(profile));
    }
  });

  const results = Array.from(resultsMap.values()).slice(0, limit);

  return json(200, {
    success: true,
    data: results,
    count: results.length,
  });
}

async function handleTrackView(event: any) {
  let body: any;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return badRequest({ error: "Invalid JSON body" }, 400);
  }

  const { profile_id, viewer_hash, referrer } = body;

  // Validate required fields
  if (!profile_id || !viewer_hash) {
    return badRequest(
      {
        error: "Missing required fields: profile_id, viewer_hash",
      },
      422
    );
  }

  // Validate profile_id is a valid UUID
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(profile_id)) {
    return badRequest({ error: "Invalid profile_id format" }, 422);
  }

  // Validate viewer_hash is a reasonable length (SHA-256 hex is 64 chars, we use first 50)
  if (
    typeof viewer_hash !== "string" ||
    viewer_hash.length < 20 ||
    viewer_hash.length > 64
  ) {
    return badRequest({ error: "Invalid viewer_hash format" }, 422);
  }

  const supabase = getSupabaseClient();

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
  const { error: insertError } = await supabase.from("profile_views").insert({
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
}

async function handleUpdateVisibility(event: any, userId: string) {
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
      !["public", "contacts_only", "trusted_contacts_only", "private"].includes(
        visibility
      )
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

  const token = extractToken(event.headers.authorization);
  if (!token) {
    return badRequest({ error: "Missing authorization token" }, 401);
  }

  const supabase = getSupabaseClient(token);

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
}

// ============================================================================
// Phase 4: Profile Customization Handlers
// ============================================================================

/**
 * Update profile theme
 * Phase 4A: Theme Editor
 */
async function handleUpdateTheme(event: any, userId: string) {
  // Check if customization feature is enabled
  const CUSTOMIZATION_ENABLED =
    ((process.env.VITE_PROFILE_CUSTOMIZATION_ENABLED as string) || "false")
      .toString()
      .toLowerCase() === "true";

  if (!CUSTOMIZATION_ENABLED) {
    return json(503, {
      success: false,
      error: "Profile customization feature is disabled",
    });
  }

  let body: any;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return badRequest({ error: "Invalid JSON body" }, 400);
  }

  const { theme } = body;

  // Validate theme is provided
  if (!theme || typeof theme !== "object") {
    return badRequest({ error: "Missing or invalid theme object" }, 422);
  }

  // Validate theme structure
  if (!theme.colorScheme || typeof theme.colorScheme !== "object") {
    return badRequest({ error: "Invalid theme: colorScheme is required" }, 422);
  }

  if (!theme.typography || typeof theme.typography !== "object") {
    return badRequest({ error: "Invalid theme: typography is required" }, 422);
  }

  if (!theme.layout || typeof theme.layout !== "object") {
    return badRequest({ error: "Invalid theme: layout is required" }, 422);
  }

  // Validate color scheme (hex colors only)
  const hexRegex = /^#[0-9A-Fa-f]{6}$/;
  const colors = ["primary", "secondary", "background", "text", "accent"];
  for (const color of colors) {
    if (!hexRegex.test(theme.colorScheme[color])) {
      return badRequest(
        {
          error: `Invalid ${color} color. Must be in format #RRGGBB`,
        },
        422
      );
    }
  }

  // Validate typography
  const validFonts = ["Inter", "Roboto", "Open Sans", "Lato", "Montserrat"];
  if (!validFonts.includes(theme.typography.fontFamily)) {
    return badRequest(
      {
        error: `Invalid font family. Must be one of: ${validFonts.join(", ")}`,
      },
      422
    );
  }

  const validSizes = ["small", "medium", "large"];
  if (!validSizes.includes(theme.typography.fontSize)) {
    return badRequest(
      {
        error: `Invalid font size. Must be one of: ${validSizes.join(", ")}`,
      },
      422
    );
  }

  // Validate layout
  const validStyles = ["modern", "classic", "minimal"];
  if (!validStyles.includes(theme.layout.style)) {
    return badRequest(
      {
        error: `Invalid layout style. Must be one of: ${validStyles.join(
          ", "
        )}`,
      },
      422
    );
  }

  if (
    typeof theme.layout.showBanner !== "boolean" ||
    typeof theme.layout.showSocialLinks !== "boolean"
  ) {
    return badRequest(
      {
        error: "Invalid layout: showBanner and showSocialLinks must be boolean",
      },
      422
    );
  }

  // Sanitize theme (ensure version is set)
  const sanitizedTheme = {
    colorScheme: {
      primary: theme.colorScheme.primary.toUpperCase(),
      secondary: theme.colorScheme.secondary.toUpperCase(),
      background: theme.colorScheme.background.toUpperCase(),
      text: theme.colorScheme.text.toUpperCase(),
      accent: theme.colorScheme.accent.toUpperCase(),
    },
    typography: {
      fontFamily: theme.typography.fontFamily,
      fontSize: theme.typography.fontSize,
    },
    layout: {
      style: theme.layout.style,
      showBanner: Boolean(theme.layout.showBanner),
      showSocialLinks: Boolean(theme.layout.showSocialLinks),
    },
    version: "1.0",
  };

  const token = extractToken(event.headers.authorization);
  if (!token) {
    return badRequest({ error: "Missing authorization token" }, 401);
  }

  const supabase = getSupabaseClient(token);

  // Update profile theme
  const { error } = await supabase
    .from("user_identities")
    .update({ profile_theme: sanitizedTheme })
    .eq("id", userId);

  if (error) {
    console.error("Update theme error:", error);
    return badRequest({ error: "Failed to update profile theme" }, 500);
  }

  return json(200, {
    success: true,
    data: { profile_theme: sanitizedTheme },
  });
}

/**
 * Update profile banner
 * Phase 4B: Banner Management
 */
async function handleUpdateBanner(event: any, userId: string) {
  // Check if customization feature is enabled
  const CUSTOMIZATION_ENABLED =
    ((process.env.VITE_PROFILE_CUSTOMIZATION_ENABLED as string) || "false")
      .toString()
      .toLowerCase() === "true";

  if (!CUSTOMIZATION_ENABLED) {
    return json(503, {
      success: false,
      error: "Profile customization feature is disabled",
    });
  }

  let body: any;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return badRequest({ error: "Invalid JSON body" }, 400);
  }

  const { bannerUrl } = body;

  // Validate banner URL is provided
  if (!bannerUrl || typeof bannerUrl !== "string") {
    return badRequest({ error: "Missing or invalid bannerUrl" }, 422);
  }

  // Validate banner URL format
  // Allow data URLs (base64) or HTTPS URLs from approved domains
  const isDataUrl = bannerUrl.startsWith("data:image/");
  const isHttpsUrl = bannerUrl.startsWith("https://");

  if (!isDataUrl && !isHttpsUrl) {
    return badRequest(
      { error: "Banner URL must be a data URL or HTTPS URL" },
      422
    );
  }

  // Validate data URL format
  if (isDataUrl) {
    const dataUrlRegex = /^data:image\/(jpeg|png|webp);base64,/;
    if (!dataUrlRegex.test(bannerUrl)) {
      return badRequest(
        { error: "Invalid data URL format. Must be JPEG, PNG, or WebP" },
        422
      );
    }

    // Check data URL size (estimate: base64 is ~33% larger than binary)
    const base64Data = bannerUrl.split(",")[1];
    const estimatedSize = (base64Data.length * 3) / 4;

    if (estimatedSize > 500 * 1024) {
      // 500KB limit
      return badRequest(
        {
          error:
            "Data URL too large (>500KB). Please upload to Blossom instead",
        },
        422
      );
    }
  }

  // Validate HTTPS URL domain (Phase 5A: Dynamic domain validation)
  if (isHttpsUrl) {
    // Get approved domains dynamically from environment
    const approvedDomains: string[] = [];

    try {
      // Extract domain from primary Blossom server
      const primaryUrl = process.env.VITE_BLOSSOM_PRIMARY_URL;
      if (primaryUrl) {
        const primaryDomain = new URL(primaryUrl).hostname;
        approvedDomains.push(primaryDomain);
        approvedDomains.push(`cdn.${primaryDomain}`);
        approvedDomains.push(`i.${primaryDomain}`);
      }

      // Extract domain from fallback Blossom server
      const fallbackUrl = process.env.VITE_BLOSSOM_FALLBACK_URL;
      if (fallbackUrl) {
        const fallbackDomain = new URL(fallbackUrl).hostname;
        approvedDomains.push(fallbackDomain);
        approvedDomains.push(`cdn.${fallbackDomain}`);
        approvedDomains.push(`i.${fallbackDomain}`);
      }

      // Legacy support: VITE_BLOSSOM_NOSTR_BUILD_URL
      const legacyUrl = process.env.VITE_BLOSSOM_NOSTR_BUILD_URL;
      if (legacyUrl) {
        const legacyDomain = new URL(legacyUrl).hostname;
        approvedDomains.push(legacyDomain);
      }
    } catch (error) {
      console.warn(
        "Failed to parse Blossom server URLs from environment:",
        error
      );
    }

    // Fallback to hardcoded domains if environment not configured
    if (approvedDomains.length === 0) {
      approvedDomains.push(
        "blossom.nostr.build",
        "nostr.build",
        "cdn.nostr.build",
        "i.nostr.build"
      );
    }

    // Remove duplicates
    const uniqueDomains = [...new Set(approvedDomains)];

    try {
      const urlObj = new URL(bannerUrl);
      const hostname = urlObj.hostname;

      const isApproved = uniqueDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
      );

      if (!isApproved) {
        return badRequest(
          {
            error: `Banner URL domain (${hostname}) is not approved. Only Blossom servers are allowed`,
          },
          422
        );
      }
    } catch {
      return badRequest({ error: "Invalid URL format" }, 422);
    }
  }

  const token = extractToken(event.headers.authorization);
  if (!token) {
    return badRequest({ error: "Missing authorization token" }, 401);
  }

  const supabase = getSupabaseClient(token);

  // Update profile banner URL
  const { error } = await supabase
    .from("user_identities")
    .update({ profile_banner_url: bannerUrl })
    .eq("id", userId);

  if (error) {
    console.error("Update banner error:", error);
    return badRequest({ error: "Failed to update profile banner" }, 500);
  }

  return json(200, {
    success: true,
    data: { profile_banner_url: bannerUrl },
  });
}

/**
 * Update social links
 * Phase 4C: Social Links Editor
 */
async function handleUpdateSocialLinks(event: any, userId: string) {
  // Check if customization feature is enabled
  const CUSTOMIZATION_ENABLED =
    ((process.env.VITE_PROFILE_CUSTOMIZATION_ENABLED as string) || "false")
      .toString()
      .toLowerCase() === "true";

  if (!CUSTOMIZATION_ENABLED) {
    return json(503, {
      success: false,
      error: "Profile customization feature is disabled",
    });
  }

  // Parse request body
  let body: any;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return badRequest({ error: "Invalid JSON in request body" }, 400);
  }

  const { links } = body;

  // Validate links array
  if (!Array.isArray(links)) {
    return badRequest({ error: "Links must be an array" }, 400);
  }

  // Maximum 10 social links
  const MAX_SOCIAL_LINKS = 10;
  if (links.length > MAX_SOCIAL_LINKS) {
    return badRequest(
      {
        error: `Maximum ${MAX_SOCIAL_LINKS} social links allowed`,
      },
      400
    );
  }

  // Validate each link
  const SUPPORTED_PLATFORMS = [
    "twitter",
    "github",
    "telegram",
    "nostr",
    "lightning",
    "website",
    "youtube",
    "linkedin",
    "instagram",
    "facebook",
  ];

  for (let i = 0; i < links.length; i++) {
    const link = links[i];

    // Validate required fields
    if (!link.id || !link.platform || !link.url) {
      return badRequest(
        {
          error: `Link ${i + 1}: Missing required fields (id, platform, url)`,
        },
        400
      );
    }

    // Validate platform
    if (!SUPPORTED_PLATFORMS.includes(link.platform)) {
      return badRequest(
        {
          error: `Link ${i + 1}: Unsupported platform '${link.platform}'`,
        },
        400
      );
    }

    // Validate URL length
    if (link.url.length > 500) {
      return badRequest(
        {
          error: `Link ${i + 1}: URL exceeds maximum length of 500 characters`,
        },
        400
      );
    }

    // Validate label length (if provided)
    if (link.label && link.label.length > 50) {
      return badRequest(
        {
          error: `Link ${i + 1}: Label exceeds maximum length of 50 characters`,
        },
        400
      );
    }

    // Basic XSS prevention: disallow HTML tags and script content
    const xssPattern = /<[^>]*>|javascript:/i;
    if (
      xssPattern.test(link.url) ||
      (link.label && xssPattern.test(link.label))
    ) {
      return badRequest(
        {
          error: `Link ${
            i + 1
          }: Invalid characters detected (HTML/script tags not allowed)`,
        },
        400
      );
    }

    // Validate HTTPS for website URLs
    if (link.platform === "website" && !link.url.startsWith("https://")) {
      return badRequest(
        {
          error: `Link ${i + 1}: Website URLs must use HTTPS`,
        },
        400
      );
    }
  }

  // Convert links array to JSONB object for storage
  // Format: { "0": { platform, url, label, order }, "1": { ... }, ... }
  const socialLinksObject: Record<string, any> = {};
  links.forEach((link: any, index: number) => {
    socialLinksObject[index.toString()] = {
      id: link.id,
      platform: link.platform,
      url: link.url,
      label: link.label || undefined,
      order: link.order !== undefined ? link.order : index,
    };
  });

  // Get Supabase client
  const token = extractToken(event.headers.authorization);
  if (!token) {
    return badRequest({ error: "Missing authorization token" }, 401);
  }

  const supabase = getSupabaseClient(token);

  // Update social links
  const { error } = await supabase
    .from("user_identities")
    .update({ social_links: socialLinksObject })
    .eq("id", userId);

  if (error) {
    console.error("Update social links error:", error);
    return badRequest({ error: "Failed to update social links" }, 500);
  }

  return json(200, {
    success: true,
    data: { social_links: socialLinksObject },
  });
}

// ============================================================================
// Phase 3: Profile Analytics Handler
// ============================================================================

async function handleGetAnalytics(event: any, userId: string) {
  // Parse days parameter (default: 30)
  let days = 30;
  const daysParam = event.queryStringParameters?.days;
  if (daysParam) {
    const parsed = parseInt(daysParam, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 365) {
      days = parsed;
    }
  }

  const token = extractToken(event.headers.authorization);
  if (!token) {
    return badRequest({ error: "Missing authorization token" }, 401);
  }

  const supabase = getSupabaseClient(token);

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
  const cutoffDate = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000
  ).toISOString();

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
}

// ============================================================================
// Main Handler with Action-Based Routing
// ============================================================================

export const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...corsHeaders() } };
  }

  try {
    // Feature flag check
    if (!FEATURE_ENABLED) {
      return json(503, {
        success: false,
        error: "Public profiles feature is disabled",
      });
    }

    // Rate limiting
    const clientIp =
      event.headers["client-ip"] ||
      event.headers["x-forwarded-for"] ||
      "unknown";
    const allowed = allowRequest("unified-profiles", clientIp, 100, 3600);

    if (!allowed) {
      return json(429, {
        success: false,
        error: "Rate limit exceeded. Maximum 100 requests per hour.",
      });
    }

    // Extract action from query params or request body
    const isGet = event.httpMethod === "GET";
    const isPatch = event.httpMethod === "PATCH";
    const isPost = event.httpMethod === "POST";

    let action: ActionName | undefined = undefined;

    if (isGet || isPatch) {
      action = event.queryStringParameters?.action as ActionName;
    }

    if (!action && (isPost || isPatch)) {
      const body = event.body ? JSON.parse(event.body) : {};
      action = body?.action as ActionName;
    }

    if (!action || !(action in ACTIONS)) {
      return json(400, {
        success: false,
        error: "Invalid or missing action parameter",
      });
    }

    const scope = ACTIONS[action].scope;

    // Validate HTTP method for action
    if (
      action === "getProfile" ||
      action === "searchProfiles" ||
      action === "getAnalytics"
    ) {
      if (event.httpMethod !== "GET") {
        return json(405, {
          success: false,
          error: "Method not allowed. Use GET for this action.",
        });
      }
    } else if (
      action === "updateVisibility" ||
      action === "updateTheme" ||
      action === "updateBanner" ||
      action === "updateSocialLinks"
    ) {
      if (event.httpMethod !== "PATCH") {
        return json(405, {
          success: false,
          error: "Method not allowed. Use PATCH for this action.",
        });
      }
    } else if (action === "trackView") {
      if (event.httpMethod !== "POST") {
        return json(405, {
          success: false,
          error: "Method not allowed. Use POST for this action.",
        });
      }
    }

    // Handle user-scoped actions (require authentication)
    if (scope === "user") {
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

      // Route to user-scoped handlers
      switch (action) {
        case "updateVisibility":
          return await handleUpdateVisibility(event, userId);
        case "getAnalytics":
          return await handleGetAnalytics(event, userId);
        case "updateTheme":
          return await handleUpdateTheme(event, userId);
        case "updateBanner":
          return await handleUpdateBanner(event, userId);
        case "updateSocialLinks":
          return await handleUpdateSocialLinks(event, userId);
        default:
          return json(400, {
            success: false,
            error: "Unsupported user action",
          });
      }
    }

    // Handle public-scoped actions (no authentication required)
    if (scope === "public") {
      switch (action) {
        case "getProfile":
          return await handleGetProfile(event);
        case "searchProfiles":
          return await handleSearchProfiles(event);
        case "trackView":
          return await handleTrackView(event);
        default:
          return json(400, {
            success: false,
            error: "Unsupported public action",
          });
      }
    }

    return json(400, {
      success: false,
      error: "Invalid action scope",
    });
  } catch (error) {
    console.error("Unified profiles error:", error);
    return badRequest(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
};
