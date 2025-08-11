/**
 * Family Federation API Service
 * Privacy-first API integration for family federation operations
 */

import { FamilyFederation, FamilyMember } from "../../types/database";

/**
 * Get family federation by DUID
 */
export async function getFamilyFederationByDuid(
  federationDuid: string
): Promise<FamilyFederation | null> {
  try {
    const response = await fetch(`/api/family-federations/${federationDuid}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching family federation:", error);
    return null;
  }
}

/**
 * Get family federation members
 */
export async function getFamilyFederationMembers(
  familyFederationId: string
): Promise<FamilyMember[]> {
  try {
    const response = await fetch(
      `/api/family-federations/${familyFederationId}/members`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching family federation members:", error);
    return [];
  }
}

/**
 * Get family federations for a user by DUID
 */
export async function getUserFamilyFederations(
  userDuid: string
): Promise<FamilyFederation[]> {
  try {
    const response = await fetch(`/api/users/${userDuid}/family-federations`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching user family federations:", error);
    return [];
  }
}

/**
 * Get members by role for voting power calculations
 */
export async function getFamilyMembersByRole(
  familyFederationId: string,
  role: "offspring" | "adult" | "steward" | "guardian"
): Promise<FamilyMember[]> {
  try {
    const response = await fetch(
      `/api/family-federations/${familyFederationId}/members?role=${role}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching family members by role:", error);
    return [];
  }
}

/**
 * Check if user has guardian/steward permissions
 */
export async function checkFamilyPermissions(
  familyFederationId: string,
  userDuid: string
): Promise<{
  canApproveSpending: boolean;
  votingPower: number;
  familyRole: "offspring" | "adult" | "steward" | "guardian";
}> {
  try {
    const response = await fetch(
      `/api/family-federations/${familyFederationId}/permissions/${userDuid}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error checking family permissions:", error);
    return {
      canApproveSpending: false,
      votingPower: 0,
      familyRole: "offspring",
    };
  }
}

/**
 * Create spending approval request
 */
export async function createSpendingApprovalRequest(data: {
  familyFederationId: string;
  userDuid: string;
  amount: number;
  recipient: string;
  description: string;
  paymentMethod: "lightning" | "fedimint";
}): Promise<{ success: boolean; approvalId?: string; error?: string }> {
  try {
    const response = await fetch("/api/spending-approvals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const result = await response.json();
    return { success: true, approvalId: result.id };
  } catch (error) {
    console.error("Error creating spending approval request:", error);
    return { success: false, error: "Network error" };
  }
}

/**
 * Get pending spending approvals for family federation
 */
export async function getPendingSpendingApprovals(
  familyFederationId: string
): Promise<
  Array<{
    id: string;
    userDuid: string;
    amount: number;
    recipient: string;
    description: string;
    paymentMethod: "lightning" | "fedimint";
    requiredApprovals: number;
    currentApprovals: number;
    createdAt: Date;
  }>
> {
  try {
    const response = await fetch(
      `/api/family-federations/${familyFederationId}/pending-approvals`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching pending approvals:", error);
    return [];
  }
}
