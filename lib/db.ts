/**
 * Database interface using Supabase Vault for secure credential management
 * Bitcoin-only, privacy-first sovereign family banking platform
 *
 * This module provides:
 * - Secure Supabase connection using Vault credentials
 * - TypeScript models for all database operations
 * - Privacy-first data handling
 * - Zero-knowledge authentication support
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../types/database";

// Server-side database client with Vault credentials
let supabaseClient: SupabaseClient<Database> | null = null;

/**
 * Initialize Supabase client with Vault credentials
 * Following Master Context security protocols
 */
async function initializeSupabaseClient(): Promise<SupabaseClient<Database>> {
  if (supabaseClient) {
    return supabaseClient;
  }

  // Get credentials from environment (browser-compatible following Master Context)
  const supabaseUrl =
    import.meta.env?.VITE_SUPABASE_URL || process.env?.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    import.meta.env?.VITE_SUPABASE_ANON_KEY ||
    process.env?.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase credentials not found in environment variables");
  }

  // Use the singleton client from src/lib/supabase.ts instead of creating a new one
  const { supabase } = await import("../src/lib/supabase");
  supabaseClient = supabase as SupabaseClient<Database>; // Type assertion for Database generic

  return supabaseClient;
}

/**
 * Database models following privacy-first principles
 */
export const models = {
  // Educational Invitations Model
  educationalInvitations: {
    async create(data: {
      invite_token: string;
      invited_by: string;
      course_credits: number;
      expires_at?: string;
      invitation_data?: any;
    }) {
      const client = await initializeSupabaseClient();
      return await client
        .from("educational_invitations")
        .insert([data])
        .select()
        .single();
    },

    async getByToken(token: string) {
      const client = await initializeSupabaseClient();
      return await client
        .from("educational_invitations")
        .select("*")
        .eq("invite_token", token)
        .single();
    },

    async getUserInvitations(hashedUserId: string) {
      const client = await initializeSupabaseClient();
      const { data, error } = await client
        .from("educational_invitations")
        .select("*")
        .eq("invited_by", hashedUserId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },

    async markAsUsed(token: string) {
      const client = await initializeSupabaseClient();
      return await client
        .from("educational_invitations")
        .update({ used: true, used_at: new Date().toISOString() })
        .eq("invite_token", token);
    },
  },

  // Course Credits Model
  courseCredits: {
    async awardCredits(
      hashedUserId: string,
      credits: number,
      activityType: string = "login",
      description: string = ""
    ) {
      const client = await initializeSupabaseClient();
      return await client
        .from("course_credits")
        .insert([
          {
            user_id: hashedUserId,
            credits_amount: credits,
            activity_type: activityType,
            description: description,
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();
    },

    async getUserCredits(hashedUserId: string) {
      const client = await initializeSupabaseClient();
      const { data, error } = await client
        .from("course_credits")
        .select("credits_amount")
        .eq("user_id", hashedUserId);

      if (error) throw error;
      return (
        data?.reduce(
          (total, record) => total + (record.credits_amount || 0),
          0
        ) || 0
      );
    },

    async getUserReferralStats(hashedUserId: string) {
      const client = await initializeSupabaseClient();

      // Get total referrals
      const { data: totalReferrals, error: totalError } = await client
        .from("educational_invitations")
        .select("id", { count: "exact" })
        .eq("invited_by", hashedUserId);

      // Get completed referrals
      const { data: completedReferrals, error: completedError } = await client
        .from("educational_invitations")
        .select("id", { count: "exact" })
        .eq("invited_by", hashedUserId)
        .eq("used", true);

      // Get total credits earned from referrals
      const { data: creditsData, error: creditsError } = await client
        .from("course_credits")
        .select("credits_amount")
        .eq("user_id", hashedUserId)
        .eq("activity_type", "referral");

      if (totalError || completedError || creditsError) {
        throw new Error("Failed to fetch referral stats");
      }

      const totalCreditsEarned =
        creditsData?.reduce(
          (total, record) => total + (record.credits_amount || 0),
          0
        ) || 0;
      const totalCount = (totalReferrals as any)?.length || 0;
      const completedCount = (completedReferrals as any)?.length || 0;

      return {
        total_referrals: totalCount,
        completed_referrals: completedCount,
        pending_referrals: totalCount - completedCount,
        total_course_credits_earned: totalCreditsEarned,
        pending_course_credits: 0, // Calculate based on pending referrals
      };
    },

    async getUserCreditHistory(hashedUserId: string) {
      const client = await initializeSupabaseClient();
      const { data, error } = await client
        .from("course_credits")
        .select("*")
        .eq("user_id", hashedUserId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  },

  // User Identity Model (Privacy-First)
  userIdentities: {
    async create(data: {
      id: string; // DUID
      user_salt: string;
      hashed_username: string;
      hashed_npub: string;
      password_hash: string;
      password_salt: string;
      role?: string;
      family_federation_id?: string;
    }) {
      const client = await initializeSupabaseClient();
      return await client
        .from("user_identities")
        .insert([data])
        .select()
        .single();
    },

    async getByDuid(userDuid: string) {
      const client = await initializeSupabaseClient();
      return await client
        .from("user_identities")
        .select("*")
        .eq("id", userDuid)
        .single();
    },

    async updateByDuid(
      userDuid: string,
      data: Partial<{
        hashed_username: string;
        hashed_npub: string;
        role: string;
        family_federation_id: string;
        privacy_settings: any;
      }>
    ) {
      const client = await initializeSupabaseClient();
      return await client
        .from("user_identities")
        .update(data)
        .eq("id", userDuid)
        .select()
        .single();
    },
  },

  // Family Federation Model (Privacy-First)
  familyFederations: {
    async getById(federationId: string) {
      const client = await initializeSupabaseClient();
      return await client
        .from("family_federations")
        .select("*")
        .eq("id", federationId)
        .single();
    },

    async getByDuid(federationDuid: string) {
      const client = await initializeSupabaseClient();
      return await client
        .from("family_federations")
        .select("*")
        .eq("federation_duid", federationDuid)
        .single();
    },

    async create(data: {
      federation_name: string;
      federation_duid: string;
      domain?: string;
      relay_url?: string;
    }) {
      const client = await initializeSupabaseClient();
      return await client
        .from("family_federations")
        .insert([data])
        .select()
        .single();
    },
  },

  // Family Members Model (Privacy-First)
  familyMembers: {
    async getByFederation(familyFederationId: string) {
      const client = await initializeSupabaseClient();
      return await client
        .from("family_members")
        .select("*")
        .eq("family_federation_id", familyFederationId)
        .eq("is_active", true);
    },

    async getByUserDuid(userDuid: string) {
      const client = await initializeSupabaseClient();
      return await client
        .from("family_members")
        .select(
          `
          *,
          family_federations(*)
        `
        )
        .eq("user_duid", userDuid)
        .eq("is_active", true);
    },

    async create(data: {
      family_federation_id: string;
      user_duid: string;
      family_role: string;
      spending_approval_required?: boolean;
      voting_power?: number;
    }) {
      const client = await initializeSupabaseClient();
      return await client
        .from("family_members")
        .insert([data])
        .select()
        .single();
    },
  },

  // NIP-05 Records Model (Privacy-First)
  nip05Records: {
    async create(data: {
      name: string;
      pubkey: string;
      name_duid?: string;
      pubkey_duid?: string;
      domain?: string;
    }) {
      const client = await initializeSupabaseClient();
      return await client
        .from("nip05_records")
        .insert([data])
        .select()
        .single();
    },

    async getByDuid(nameDuid: string, domain: string = "satnam.pub") {
      const client = await initializeSupabaseClient();
      return await client
        .from("nip05_records")
        .select("*")
        .eq("name_duid", nameDuid)
        .eq("domain", domain)
        .eq("is_active", true)
        .single();
    },

    async getByDomain(domain: string = "satnam.pub") {
      const client = await initializeSupabaseClient();
      return await client
        .from("nip05_records")
        .select("*")
        .eq("domain", domain)
        .eq("is_active", true);
    },
  },

  // Nostr Backups Model (Privacy-First)
  nostrBackups: {
    async create(data: {
      user_duid: string;
      encrypted_backup: string;
      backup_type: string;
    }) {
      const client = await initializeSupabaseClient();
      return await client
        .from("nostr_backups")
        .insert([data])
        .select()
        .single();
    },

    async getByUserDuid(userDuid: string) {
      const client = await initializeSupabaseClient();
      const { data, error } = await client
        .from("nostr_backups")
        .select("*")
        .eq("user_duid", userDuid)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  },
};

/**
 * Database connection object
 * Provides direct access to Supabase client for advanced operations
 */
export const db = {
  models,

  /**
   * Get raw Supabase client for advanced operations
   */
  async getClient(): Promise<SupabaseClient<Database>> {
    return await initializeSupabaseClient();
  },

  /**
   * Test database connection
   */
  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const client = await initializeSupabaseClient();
      const { data, error } = await client
        .from("profiles")
        .select("id")
        .limit(1);

      if (error) {
        return { connected: false, error: error.message };
      }

      return { connected: true };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};

export default db;
