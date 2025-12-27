/**
 * Profile API Endpoints - Client-side API client
 *
 * Handles all profile-related API calls with proper error handling
 * and privacy-first principles.
 */

import { getEnvVar } from "../../config/env.client";
import { ProfileVisibility, UserProfile } from "../services/profile-service";

// Lazy initialization to prevent TDZ errors in production builds
// Environment variables are accessed at call time, not module load time
function getApiBase(): string {
  return getEnvVar("VITE_API_BASE_URL") || "/.netlify/functions";
}

export interface ProfileAPIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class ProfileAPI {
  /**
   * Get public profile by username
   * Uses unified-profiles function with action-based routing
   */
  static async getPublicProfileByUsername(
    username: string
  ): Promise<ProfileAPIResponse<UserProfile>> {
    try {
      const response = await fetch(
        `${getApiBase()}/unified-profiles?action=getProfile&username=${encodeURIComponent(
          username
        )}`
      );

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get public profile by npub
   * Uses unified-profiles function with action-based routing
   */
  static async getPublicProfileByNpub(
    npub: string
  ): Promise<ProfileAPIResponse<UserProfile>> {
    try {
      const response = await fetch(
        `${getApiBase()}/unified-profiles?action=getProfile&npub=${encodeURIComponent(
          npub
        )}`
      );

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get current user's profile (authenticated)
   */
  static async getCurrentUserProfile(
    token: string
  ): Promise<ProfileAPIResponse<UserProfile>> {
    try {
      const response = await fetch(`${getApiBase()}/profile/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update profile visibility settings
   * Phase 3: Uses unified-profiles function with action-based routing
   */
  static async updateProfileVisibility(
    token: string,
    visibility: ProfileVisibility
  ): Promise<ProfileAPIResponse<{ success: boolean }>> {
    try {
      const response = await fetch(
        `${getApiBase()}/unified-profiles?action=updateVisibility`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ visibility }),
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update profile settings (unified endpoint)
   * Phase 3: Uses unified-profiles function with action-based routing
   * Supports visibility, is_discoverable, and analytics_enabled
   */
  static async updateProfileSettings(
    token: string,
    settings: {
      visibility?: ProfileVisibility;
      is_discoverable?: boolean;
      analytics_enabled?: boolean;
    }
  ): Promise<ProfileAPIResponse<{ success: boolean }>> {
    try {
      const response = await fetch(
        `${getApiBase()}/unified-profiles?action=updateVisibility`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(settings),
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update analytics settings
   * @deprecated Use updateProfileSettings instead
   */
  static async updateAnalyticsSettings(
    token: string,
    enabled: boolean
  ): Promise<ProfileAPIResponse<{ success: boolean }>> {
    return this.updateProfileSettings(token, { analytics_enabled: enabled });
  }

  /**
   * Get profile analytics (view count and recent views)
   * Uses unified-profiles function with action-based routing
   */
  static async getProfileAnalytics(
    token: string,
    days?: number
  ): Promise<
    ProfileAPIResponse<{
      total_views: number;
      recent_views: Array<{ viewed_at: string; referrer?: string }>;
    }>
  > {
    try {
      const url = new URL(
        `${getApiBase()}/unified-profiles`,
        window.location.origin
      );
      url.searchParams.append("action", "getAnalytics");
      if (days) {
        url.searchParams.append("days", days.toString());
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Record a profile view (privacy-first analytics)
   * Uses unified-profiles function with action-based routing
   */
  static async recordProfileView(
    profileId: string,
    viewerHash: string,
    referrer?: string
  ): Promise<ProfileAPIResponse<{ success: boolean }>> {
    try {
      const response = await fetch(
        `${getApiBase()}/unified-profiles?action=trackView`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            profile_id: profileId,
            viewer_hash: viewerHash,
            referrer,
          }),
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Search public profiles
   * Uses unified-profiles function with action-based routing
   */
  static async searchProfiles(
    query: string,
    limit?: number
  ): Promise<ProfileAPIResponse<UserProfile[]>> {
    try {
      const url = new URL(
        `${getApiBase()}/unified-profiles`,
        window.location.origin
      );
      url.searchParams.append("action", "searchProfiles");
      url.searchParams.append("q", query);
      if (limit) {
        url.searchParams.append("limit", limit.toString());
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update profile theme
   * Phase 4A: Theme Editor
   * Uses unified-profiles function with action-based routing
   */
  static async updateTheme(
    theme: any,
    token: string
  ): Promise<ProfileAPIResponse<{ profile_theme: any }>> {
    try {
      const response = await fetch(
        `${getApiBase()}/unified-profiles?action=updateTheme`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ theme }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error:
            errorData.error ||
            `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update profile banner
   * Phase 4B: Banner Management
   * Uses unified-profiles function with action-based routing
   */
  static async updateBanner(
    bannerUrl: string,
    token: string
  ): Promise<ProfileAPIResponse<{ profile_banner_url: string }>> {
    try {
      const response = await fetch(
        `${getApiBase()}/unified-profiles?action=updateBanner`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ bannerUrl }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error:
            errorData.error ||
            `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update social links
   * Phase 4C: Social Links Editor
   * Uses unified-profiles function with action-based routing
   */
  static async updateSocialLinks(
    links: Array<{
      id: string;
      platform: string;
      url: string;
      label?: string;
      order: number;
    }>,
    token: string
  ): Promise<ProfileAPIResponse<{ social_links: Record<string, any> }>> {
    try {
      const response = await fetch(
        `${getApiBase()}/unified-profiles?action=updateSocialLinks`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ links }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error:
            errorData.error ||
            `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

export default ProfileAPI;
