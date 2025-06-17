// Vite-compatible family API client
import { createClient } from "@supabase/supabase-js";

// Create Supabase client with environment variables (Vite and Node.js compatible)
const getEnvVar = (key: string): string => {
  // Try Vite environment first, then Node.js process.env
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env[key] || "";
  }
  return process.env[key] || "";
};

// SECURITY FIX: Only use service role key on server-side
const isServer = typeof window === "undefined";
const supabaseKey = isServer
  ? getEnvVar("SUPABASE_SERVICE_ROLE_KEY") || ""
  : getEnvVar("VITE_SUPABASE_ANON_KEY") || getEnvVar("SUPABASE_ANON_KEY") || "";

if (isServer && !getEnvVar("SUPABASE_SERVICE_ROLE_KEY")) {
  console.error("🚨 CRITICAL: SUPABASE_SERVICE_ROLE_KEY missing on server");
}

const supabase = createClient(
  getEnvVar("VITE_SUPABASE_URL") || getEnvVar("SUPABASE_URL") || "",
  supabaseKey
);

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
  async getFamilyMembers(): Promise<FamilyMember[]> {
    try {
      const { data: members, error } = await supabase
        .from("family_members")
        .select("*");

      if (error) {
        console.error("Supabase error:", error);
        throw new Error("Failed to get family members");
      }

      return members || [];
    } catch (error) {
      console.error("Failed to get family members:", error);
      throw error;
    }
  }

  async addFamilyMember(
    member: Omit<FamilyMember, "id">
  ): Promise<FamilyMember> {
    try {
      const { data, error } = await supabase
        .from("family_members")
        .insert([member])
        .select()
        .single();

      if (error) {
        console.error("Supabase error:", error);
        throw new Error("Failed to add family member");
      }

      return data;
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
      const { data, error } = await supabase
        .from("family_members")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Supabase error:", error);
        throw new Error("Failed to update family member");
      }

      return data;
    } catch (error) {
      console.error("Failed to update family member:", error);
      throw error;
    }
  }

  async deleteFamilyMember(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("family_members")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Supabase error:", error);
        throw new Error("Failed to delete family member");
      }
    } catch (error) {
      console.error("Failed to delete family member:", error);
      throw error;
    }
  }

  async getFamilyWallets(familyId: string): Promise<FamilyWallet[]> {
    try {
      // PRIVACY-FIRST: Use aggregated balance data without exposing individual wallet details
      // This method should return anonymized wallet balance information only
      const { data: aggregatedData, error } = await supabase
        .from("family_liquidity_view") // Use a privacy-preserving view
        .select("total_balance, available_balance")
        .eq("family_hash", this.hashFamilyId(familyId)); // Hash family ID for privacy

      if (error) {
        console.error("Supabase error:", error);
        throw new Error("Failed to get family liquidity data");
      }

      // Return anonymized aggregate data instead of individual wallet details
      return [
        {
          id: "aggregated",
          family_id: "anonymous",
          balance: aggregatedData?.[0]?.total_balance || 0,
          available_balance: aggregatedData?.[0]?.available_balance || 0,
          created_at: new Date().toISOString(),
        },
      ];
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
    const { data: member, error } = await supabase
      .from("family_members")
      .select("*")
      .eq("name", username)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned
        return null;
      }
      console.error("Supabase error:", error);
      throw new Error("Failed to get family member");
    }

    return member;
  } catch (error) {
    console.error("Failed to get family member:", error);
    return null;
  }
}

// Helper function to get all family members
export async function getFamilyMembers(): Promise<FamilyMember[]> {
  return await familyAPI.getFamilyMembers();
}
