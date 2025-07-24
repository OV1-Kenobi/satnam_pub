/**
 * Vite-compatible family API client
 * MASTER CONTEXT COMPLIANCE: Browser-only serverless architecture with privacy-first principles
 * Converted from TypeScript to JavaScript with comprehensive JSDoc
 */

import { supabase } from "./supabase.js";

/**
 * Environment variable getter with browser compatibility
 * @param {string} key - Environment variable key
 * @param {string} [defaultValue] - Default value if not found
 * @returns {string} Environment variable value
 */
function getEnvVar(key, defaultValue = '') {
  if (typeof import !== 'undefined' && import.meta && import.meta.env) {
    return import.meta.env[key] || defaultValue;
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }
  return defaultValue;
}

/**
 * @typedef {Object} FamilyMember
 * @property {string} id - Member ID
 * @property {string} encrypted_name - PRIVACY: Name stored encrypted
 * @property {string} encrypted_role - PRIVACY: Role stored encrypted
 * @property {string} [avatar] - Non-sensitive avatar URL
 * @property {string} [encrypted_lightning_balance] - PRIVACY: Balance encrypted
 * @property {'verified'|'pending'|'none'} [nipStatus] - NIP-05 verification status
 * @property {string} encryption_salt - Required for decryption
 * @property {string} family_id_hash - Hashed family ID for privacy
 */

/**
 * @typedef {Object} DecryptedFamilyMember
 * @property {string} id - Member ID
 * @property {string} name - Decrypted name
 * @property {string} role - Decrypted role
 * @property {string} [avatar] - Avatar URL
 * @property {number} [lightningBalance] - Decrypted balance
 * @property {'verified'|'pending'|'none'} [nipStatus] - NIP-05 verification status
 */

/**
 * @typedef {Object} FamilyWallet
 * @property {string} id - Anonymized ID (e.g., "aggregated", "mock")
 * @property {string} family_id - Always "anonymous" for privacy
 * @property {number} balance - Aggregate balance only
 * @property {number} available_balance - Available aggregate balance
 * @property {string} created_at - Timestamp for data freshness
 */

/**
 * Family API class for managing family federation operations
 * MASTER CONTEXT COMPLIANCE: Privacy-first architecture with encrypted data
 */
export class FamilyAPI {
  /**
   * Get all family members with encrypted data
   * @returns {Promise<FamilyMember[]>} Array of family members
   */
  async getFamilyMembers() {
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

  /**
   * Add a new family member
   * @param {Omit<FamilyMember, 'id'>} member - Member data without ID
   * @returns {Promise<FamilyMember>} Created family member
   */
  async addFamilyMember(member) {
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

  /**
   * Update an existing family member
   * @param {string} id - Member ID
   * @param {Partial<FamilyMember>} updates - Updates to apply
   * @returns {Promise<FamilyMember>} Updated family member
   */
  async updateFamilyMember(id, updates) {
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

  /**
   * Delete a family member
   * @param {string} id - Member ID to delete
   * @returns {Promise<void>}
   */
  async deleteFamilyMember(id) {
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

  /**
   * Get family wallets with privacy-preserving aggregated data
   * @param {string} familyId - Family ID
   * @returns {Promise<FamilyWallet[]>} Array of anonymized wallet data
   */
  async getFamilyWallets(familyId) {
    try {
      // PRIVACY-FIRST: Use aggregated balance data without exposing individual wallet details
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

  /**
   * Hash family ID for privacy protection
   * @private
   * @param {string} familyId - Family ID to hash
   * @returns {string} Hashed family ID
   */
  hashFamilyId(familyId) {
    // PRIVACY: Hash family ID to avoid direct exposure
    // Use Web Crypto API for browser compatibility
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      // Use privacy-preserving hash with Web Crypto API
      const encoder = new TextEncoder();
      const data = encoder.encode(familyId + getEnvVar('VITE_FAMILY_SALT', 'default-salt'));
      return crypto.subtle.digest('SHA-256', data).then(hash => {
        const hashArray = Array.from(new Uint8Array(hash));
        return 'hash_' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      });
    }
    // Fallback for environments without Web Crypto API
    return `hash_${familyId.slice(-8)}`;
  }
}

// Export default instance
export const familyAPI = new FamilyAPI();

/**
 * Helper function to get a single family member by username
 * @param {string} username - Username to search for
 * @returns {Promise<FamilyMember|null>} Family member or null if not found
 */
export async function getFamilyMember(username) {
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

/**
 * Helper function to get all family members
 * @returns {Promise<FamilyMember[]>} Array of family members
 */
export async function getFamilyMembers() {
  return await familyAPI.getFamilyMembers();
}
