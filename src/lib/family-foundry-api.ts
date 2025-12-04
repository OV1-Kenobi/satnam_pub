/**
 * Family Foundry API Service
 *
 * Handles all API calls for family federation creation and member management.
 * Integrates with the backend /api/family/foundry endpoint.
 */

import { supabase } from "./supabase";
import {
  mapNpubToUserDuid,
  batchMapNpubsToUserDuids,
} from "./family-foundry-integration";

/**
 * Type definitions for API requests and responses
 */
export interface FamilyMember {
  name: string;
  npub: string;
  role: "guardian" | "steward" | "adult" | "offspring";
  relationship: string;
}

export interface CreateFamilyFoundryRequest {
  charter: {
    familyName: string;
    familyMotto?: string;
    foundingDate: string;
    missionStatement?: string;
    values: string[];
  };
  rbac: {
    roles: Array<{
      id: string;
      name: string;
      rights: string[];
      responsibilities: string[];
      rewards?: string[];
    }>;
  };
  members: Array<{
    user_duid: string;
    role: string;
    relationship: string;
  }>;
  /**
   * Optional federation-level identity provisioning payload.
   *
   * When provided, all three fields should be present so that the backend
   * can provision the federation's npub, NIP-05, Lightning address, and
   * encrypted nsec in a single atomic operation. If omitted, the backend
   * will create the federation without an attached identity and log this
   * in metadata for future follow-up.
   */
  federation_npub?: string;
  federation_nsec_encrypted?: string;
  federation_handle?: string;
}

export interface CreateFamilyFoundryResponse {
  success: boolean;
  data?: {
    charterId: string;
    federationId: string;
    federationDuid: string;
    familyName: string;
    foundingDate: string;
    status: string;
  };
  error?: string;
  message?: string;
}

/**
 * Create a family federation with charter, RBAC, and members
 *
 * @param request - Federation creation request with charter, RBAC, and members
 * @returns Promise<CreateFamilyFoundryResponse> - Response with federation details
 */
export async function createFamilyFoundry(
  request: CreateFamilyFoundryRequest
): Promise<CreateFamilyFoundryResponse> {
  try {
    const response = await fetch("/api/family/foundry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `API request failed with status ${response.status}`
      );
    }

    const data: CreateFamilyFoundryResponse = await response.json();
    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Map trusted peers to family members with user_duids
 *
 * Converts trusted peers (with npubs) to family members (with user_duids)
 * by querying the user_identities table.
 *
 * @param trustedPeers - Array of trusted peers with npubs
 * @returns Promise<Array<{ user_duid: string; role: string; relationship: string }>>
 */
export async function mapTrustedPeersToMembers(
  trustedPeers: Array<{
    name: string;
    npub: string;
    role: string;
    relationship: string;
  }>
): Promise<Array<{ user_duid: string; role: string; relationship: string }>> {
  if (trustedPeers.length === 0) {
    return [];
  }

  try {
    const npubs = trustedPeers.map((p) => p.npub);
    const npubToDuidMap = await batchMapNpubsToUserDuids(npubs, supabase);

    const members = trustedPeers.map((peer) => {
      const user_duid = npubToDuidMap.get(peer.npub);
      if (!user_duid) {
        throw new Error(
          `Failed to find user_duid for npub: ${peer.npub} (${peer.name})`
        );
      }
      return {
        user_duid,
        role: peer.role,
        relationship: peer.relationship,
      };
    });
    return members;
  } catch (error) {
    throw new Error(
      `Failed to map peers to members: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
