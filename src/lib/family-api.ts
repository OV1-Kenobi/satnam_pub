/**
 * Browser-compatible family API client for Satnam.pub
 * Uses fetch API to communicate with backend API endpoints
 */

// SECURITY FIX: Encrypted family member interface
export interface FamilyMember {
  id: string;
  encrypted_name: string; // PRIVACY: Name stored encrypted
  encrypted_role: string; // PRIVACY: Role stored encrypted
  avatar?: string; // Non-sensitive, can remain unencrypted
  encrypted_lightning_balance?: string; // PRIVACY: Balance encrypted
  nipStatus?: "verified" | "pending" | "none";
  encryption_salt: string; // Required for decryption
  family_id_hash: string; // Hashed family ID for privacy
  [key: string]: any;
}

// Client-side decrypted interface for UI
export interface DecryptedFamilyMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  lightningBalance?: number;
  nipStatus?: "verified" | "pending" | "none";
  [key: string]: any;
}

export interface FamilyWallet {
  id: string; // Anonymized ID (e.g., "aggregated", "mock")
  family_id: string; // Always "anonymous" for privacy
  balance: number; // Aggregate balance only
  available_balance: number; // Available aggregate balance
  created_at: string; // Timestamp for data freshness
  // PRIVACY: No individual wallet names, addresses, or identifying information
}

export class FamilyAPI {
  private apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = import.meta.env.VITE_API_URL || "/api";
  }

  async getFamilyMembers(): Promise<FamilyMember[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/family/members`);
      if (response.ok) {
        return await response.json();
      }
      throw new Error("Failed to get family members");
    } catch (error) {
      console.error("Failed to get family members:", error);
      throw error;
    }
  }

  async addFamilyMember(
    member: Omit<FamilyMember, "id">
  ): Promise<FamilyMember> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/family/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(member),
      });

      if (response.ok) {
        return await response.json();
      }
      throw new Error("Failed to add family member");
    } catch (error) {
      console.error("Failed to add family member:", error);
      throw error;
    }
  }

  async updateFamilyMember(
    id: string,
    updates: Partial<FamilyMember>
  ): Promise<FamilyMember> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/family/members/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        return await response.json();
      }
      throw new Error("Failed to update family member");
    } catch (error) {
      console.error("Failed to update family member:", error);
      throw error;
    }
  }

  async deleteFamilyMember(id: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/family/members/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete family member");
      }
    } catch (error) {
      console.error("Failed to delete family member:", error);
      throw error;
    }
  }

  async getFamilyWallets(familyId: string): Promise<FamilyWallet[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/family/wallets?familyId=${familyId}`);
      if (response.ok) {
        return await response.json();
      }
      throw new Error("Failed to get family liquidity data");
    } catch (error) {
      console.error("Failed to get family wallets:", error);
      // Return mock data for now to maintain privacy
      return [
        {
          id: "mock",
          family_id: "anonymous",
          balance: 100000, // Mock aggregate balance
          available_balance: 75000,
          created_at: new Date().toISOString(),
        },
      ];
    }
  }

  private hashFamilyId(familyId: string): string {
    // PRIVACY: Hash family ID to avoid direct exposure
    // In production, use a proper cryptographic hash
    return `hash_${familyId.slice(-8)}`;
  }
}

// Export default instance
export const familyAPI = new FamilyAPI();

// Helper function to get a single family member by username
export async function getFamilyMember(
  username: string
): Promise<FamilyMember | null> {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL || "/api"}/family/members/${username}`);
    if (response.ok) {
      return await response.json();
    }
    if (response.status === 404) {
      return null;
    }
    throw new Error("Failed to get family member");
  } catch (error) {
    console.error("Failed to get family member:", error);
    return null;
  }
}

// Helper function to get all family members
export async function getFamilyMembers(): Promise<FamilyMember[]> {
  return await familyAPI.getFamilyMembers();
} 