/**
 * @fileoverview Family Foundry API Client
 * @description Frontend service for interacting with Family Foundry API endpoints
 * @compliance Master Context - NIP-59 Gift Wrapped messaging, privacy-first, no email storage
 * @note Invitations use existing PostAuthInvitationModal system (/api/authenticated/generate-peer-invite)
 */

import { SecureTokenManager } from "../auth/secure-token-manager";

export interface CharterDefinition {
  familyName: string;
  familyMotto: string;
  foundingDate: string;
  missionStatement: string;
  values: string[];
  initialTreasury?: number;
}

export interface RBACDefinition {
  roles: {
    id: string;
    name: string;
    description: string;
    rights: string[];
    responsibilities: string[];
    rewards: string[];
    hierarchyLevel: number;
  }[];
  frostThreshold?: number; // User-configurable FROST signing threshold (1-5)
}

export interface CreateFamilyFoundryRequest {
  charter: CharterDefinition;
  rbac: RBACDefinition;
}

export interface CreateFamilyFoundryResponse {
  success: boolean;
  data?: {
    charterId: string;
    federationId?: string;
  };
  error?: string;
  message?: string;
}

export interface FamilyFoundryStatus {
  charterId: string;
  federationId: string;
  status: "creating" | "active" | "failed" | "suspended";
  progress: number;
  errorMessage?: string;
}

export class FamilyFoundryService {
  /**
   * Create a new family foundry with charter and RBAC
   */
  static async createFamilyFoundry(
    request: CreateFamilyFoundryRequest
  ): Promise<CreateFamilyFoundryResponse> {
    try {
      const response = await fetch("/api/family/foundry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await this.getSessionToken()}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create family foundry");
      }

      return await response.json();
    } catch (error) {
      console.error("Error creating family foundry:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get family foundry status by charter ID
   */
  static async getFamilyFoundryStatus(
    charterId: string
  ): Promise<FamilyFoundryStatus | null> {
    try {
      const token = await this.getSessionToken();
      if (!token) {
        console.warn("No session token available for getFamilyFoundryStatus");
        return null;
      }

      const response = await fetch(
        `/api/family/foundry/status?charterId=${encodeURIComponent(charterId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        console.error("Error fetching family foundry status:", result.error);
        return null;
      }

      return result.data;
    } catch (error) {
      console.error("Error getting family foundry status:", error);
      return null;
    }
  }

  /**
   * Get family charter by ID
   */
  static async getFamilyCharter(charterId: string) {
    try {
      const token = await this.getSessionToken();
      if (!token) {
        console.warn("No session token available for getFamilyCharter");
        return null;
      }

      const response = await fetch(
        `/api/family/foundry/charter?charterId=${encodeURIComponent(
          charterId
        )}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        console.error("Error fetching family charter:", result.error);
        return null;
      }

      return result.data;
    } catch (error) {
      console.error("Error getting family charter:", error);
      return null;
    }
  }

  /**
   * Get RBAC configuration for a charter
   */
  static async getRBACConfig(charterId: string) {
    try {
      const token = await this.getSessionToken();
      if (!token) {
        console.warn("No session token available for getRBACConfig");
        return null;
      }

      const response = await fetch(
        `/api/family/foundry/rbac?charterId=${encodeURIComponent(charterId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        console.error("Error fetching RBAC config:", result.error);
        return null;
      }

      return result.data;
    } catch (error) {
      console.error("Error getting RBAC config:", error);
      return null;
    }
  }

  /**
   * Update federation creation progress
   */
  static async updateFederationProgress(
    federationId: string,
    progress: number,
    status?: "creating" | "active" | "failed" | "suspended"
  ): Promise<boolean> {
    try {
      const token = await this.getSessionToken();
      if (!token) {
        console.warn("No session token available for updateFederationProgress");
        return false;
      }

      const response = await fetch("/api/family/foundry/progress", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ federationId, progress, status }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        console.error("Error updating federation progress:", result.error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error updating federation progress:", error);
      return false;
    }
  }

  /**
   * Get session token for API calls
   * Uses SecureTokenManager (custom JWT) instead of Supabase auth.getSession()
   * which would cause AuthSessionMissingError since we use custom JWT auth
   */
  private static async getSessionToken(): Promise<string> {
    try {
      // First try to get existing access token from memory
      let accessToken = SecureTokenManager.getAccessToken();

      // If no token or needs refresh, attempt silent refresh
      if (!accessToken || SecureTokenManager.needsRefresh()) {
        console.log("🔐 FamilyFoundryService: Attempting token refresh");
        accessToken = await SecureTokenManager.silentRefresh();
      }

      if (!accessToken) {
        console.warn(
          "🔐 FamilyFoundryService: No valid access token available - user may need to re-authenticate"
        );
        return "";
      }

      return accessToken;
    } catch (error) {
      console.error("Error getting session token:", error);
      return "";
    }
  }
}
