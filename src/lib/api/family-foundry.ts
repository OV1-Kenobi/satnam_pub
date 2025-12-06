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
      const { data, error } = await supabase
        .from("family_federation_creations")
        .select("*")
        .eq("charter_id", charterId)
        .single();

      if (error) {
        console.error("Error fetching family foundry status:", error);
        return null;
      }

      return {
        charterId: data.charter_id,
        federationId: data.id,
        status: data.status,
        progress: data.progress,
        errorMessage: data.error_message,
      };
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
      const { data, error } = await supabase
        .from("family_charters")
        .select("*")
        .eq("id", charterId)
        .single();

      if (error) {
        console.error("Error fetching family charter:", error);
        return null;
      }

      return data;
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
      const { data, error } = await supabase
        .from("family_rbac_configs")
        .select("*")
        .eq("charter_id", charterId)
        .order("hierarchy_level", { ascending: false });

      if (error) {
        console.error("Error fetching RBAC config:", error);
        return null;
      }

      return data;
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
      const updateData: any = { progress };
      if (status) {
        updateData.status = status;
        if (status === "active") {
          updateData.activated_at = new Date().toISOString();
        }
      }

      const { error } = await supabase
        .from("family_federation_creations")
        .update(updateData)
        .eq("id", federationId);

      if (error) {
        console.error("Error updating federation progress:", error);
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
