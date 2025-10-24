/**
 * Profile Service - Privacy-First Profile Management
 *
 * Handles all profile-related operations with privacy-first principles:
 * - No nsec/encrypted credential exposure
 * - Respects user privacy settings
 * - Hashes viewer identity for analytics
 * - Enforces RLS policies
 */

import { createClient } from "@supabase/supabase-js";

export type ProfileVisibility =
  | "public"
  | "contacts_only"
  | "trusted_contacts_only"
  | "private";

export interface UserProfile {
  id: string;
  username: string;
  npub: string;
  nip05?: string;
  lightning_address?: string;
  display_name?: string;
  bio?: string;
  picture?: string;
  website?: string;
  profile_visibility: ProfileVisibility;
  profile_banner_url?: string;
  profile_theme?: Record<string, any>;
  social_links?: Record<string, string>;
  is_discoverable: boolean;
  profile_views_count: number;
  last_profile_view?: string;
  analytics_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileViewData {
  profile_id: string;
  viewer_hash: string;
  referrer?: string;
}

export class ProfileService {
  private supabase: any;

  constructor() {
    this.supabase = createClient(
      process.env.VITE_SUPABASE_URL || "",
      process.env.VITE_SUPABASE_ANON_KEY || ""
    );
  }

  /**
   * Get public profile by username
   * Respects privacy settings - only returns public profiles
   */
  async getPublicProfileByUsername(
    username: string
  ): Promise<UserProfile | null> {
    try {
      const { data, error } = await this.supabase
        .from("user_identities")
        .select("*")
        .eq("username", username)
        .eq("profile_visibility", "public")
        .single();

      if (error || !data) {
        return null;
      }

      return this.sanitizeProfile(data);
    } catch (error) {
      console.error("Error fetching public profile by username:", error);
      return null;
    }
  }

  /**
   * Get public profile by npub
   * Respects privacy settings - only returns public profiles
   */
  async getPublicProfileByNpub(npub: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await this.supabase
        .from("user_identities")
        .select("*")
        .eq("npub", npub)
        .eq("profile_visibility", "public")
        .single();

      if (error || !data) {
        return null;
      }

      return this.sanitizeProfile(data);
    } catch (error) {
      console.error("Error fetching public profile by npub:", error);
      return null;
    }
  }

  /**
   * Get profile for authenticated user
   * Returns full profile data for the authenticated user
   */
  async getAuthenticatedUserProfile(
    userId: string
  ): Promise<UserProfile | null> {
    try {
      const { data, error } = await this.supabase
        .from("user_identities")
        .select("*")
        .eq("id", userId)
        .single();

      if (error || !data) {
        return null;
      }

      return data as UserProfile;
    } catch (error) {
      console.error("Error fetching authenticated user profile:", error);
      return null;
    }
  }

  /**
   * Update profile visibility settings
   * Only the profile owner can update their visibility
   */
  async updateProfileVisibility(
    userId: string,
    visibility: ProfileVisibility
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from("user_identities")
        .update({ profile_visibility: visibility })
        .eq("id", userId);

      if (error) {
        console.error("Error updating profile visibility:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error updating profile visibility:", error);
      return false;
    }
  }

  /**
   * Update analytics settings
   * Only the profile owner can enable/disable analytics
   */
  async updateAnalyticsSettings(
    userId: string,
    enabled: boolean
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from("user_identities")
        .update({ analytics_enabled: enabled })
        .eq("id", userId);

      if (error) {
        console.error("Error updating analytics settings:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error updating analytics settings:", error);
      return false;
    }
  }

  /**
   * Record a profile view (privacy-first analytics)
   * Hashes viewer identity - no PII stored
   */
  async recordProfileView(
    profileId: string,
    viewerHash: string,
    referrer?: string
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase.from("profile_views").insert({
        profile_id: profileId,
        viewer_hash: viewerHash,
        referrer: referrer ? new URL(referrer).hostname : null,
      });

      if (error) {
        console.error("Error recording profile view:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error recording profile view:", error);
      return false;
    }
  }

  /**
   * Get profile analytics (view count and recent views)
   * Only the profile owner can access their analytics
   */
  async getProfileAnalytics(
    userId: string,
    days: number = 30
  ): Promise<{
    total_views: number;
    recent_views: Array<{ viewed_at: string; referrer?: string }>;
  } | null> {
    try {
      // Get total view count
      const { data: profile, error: profileError } = await this.supabase
        .from("user_identities")
        .select("profile_views_count, last_profile_view")
        .eq("id", userId)
        .single();

      if (profileError || !profile) {
        return null;
      }

      // Get recent views (aggregated, no individual viewer data)
      const { data: views, error: viewsError } = await this.supabase
        .from("profile_views")
        .select("viewed_at, referrer")
        .eq("profile_id", userId)
        .gte(
          "viewed_at",
          new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        )
        .order("viewed_at", { ascending: false })
        .limit(100);

      if (viewsError) {
        console.error("Error fetching profile analytics:", viewsError);
        return null;
      }

      return {
        total_views: profile.profile_views_count || 0,
        recent_views: views || [],
      };
    } catch (error) {
      console.error("Error getting profile analytics:", error);
      return null;
    }
  }

  /**
   * Sanitize profile data for public display
   * Removes sensitive fields that should never be exposed
   */
  private sanitizeProfile(profile: any): UserProfile {
    return {
      id: profile.id,
      username: profile.username,
      npub: profile.npub,
      nip05: profile.nip05,
      lightning_address: profile.lightning_address,
      display_name: profile.display_name,
      bio: profile.bio,
      picture: profile.picture,
      website: profile.website,
      profile_visibility: profile.profile_visibility,
      profile_banner_url: profile.profile_banner_url,
      profile_theme: profile.profile_theme,
      social_links: profile.social_links,
      is_discoverable: profile.is_discoverable,
      profile_views_count: profile.profile_views_count || 0,
      last_profile_view: profile.last_profile_view,
      analytics_enabled: profile.analytics_enabled,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      // NEVER expose these fields:
      // - encrypted_nsec
      // - password_hash
      // - password_salt
      // - auth_salt_hash
      // - session_hash
      // - session_salt
    };
  }

  /**
   * Hash viewer identity for privacy-first analytics
   * Uses SHA-256 to create a consistent hash without storing PII
   */
  static async hashViewerIdentity(viewerId: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(viewerId);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return hashHex.substring(0, 50); // Return first 50 chars
    } catch (error) {
      console.error("Error hashing viewer identity:", error);
      return "";
    }
  }
}

// Export singleton instance
export const profileService = new ProfileService();
