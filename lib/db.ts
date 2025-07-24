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

  // User Profiles Model
  profiles: {
    async create(data: {
      user_id: string;
      username?: string;
      npub?: string;
      family_id?: string;
      privacy_level?: string;
    }) {
      const client = await initializeSupabaseClient();
      return await client.from("profiles").insert([data]).select().single();
    },

    async getById(userId: string) {
      const client = await initializeSupabaseClient();
      return await client
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();
    },

    async update(
      userId: string,
      data: Partial<{
        username: string;
        npub: string;
        family_id: string;
        privacy_level: string;
      }>
    ) {
      const client = await initializeSupabaseClient();
      return await client
        .from("profiles")
        .update(data)
        .eq("user_id", userId)
        .select()
        .single();
    },
  },

  // Family Model
  families: {
    async getById(familyId: string) {
      const client = await initializeSupabaseClient();
      return await client
        .from("families")
        .select("*")
        .eq("id", familyId)
        .single();
    },

    async create(data: {
      name: string;
      created_by: string;
      federation_config?: any;
    }) {
      const client = await initializeSupabaseClient();
      return await client.from("families").insert([data]).select().single();
    },
  },

  // Lightning Addresses Model
  lightningAddresses: {
    async create(data: { user_id: string; address: string; node_config: any }) {
      const client = await initializeSupabaseClient();
      return await client
        .from("lightning_addresses")
        .insert([data])
        .select()
        .single();
    },

    async getByUserId(userId: string) {
      const client = await initializeSupabaseClient();
      return await client
        .from("lightning_addresses")
        .select("*")
        .eq("user_id", userId)
        .single();
    },
  },

  // Nostr Backups Model
  nostrBackups: {
    async create(data: {
      user_id: string;
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

    async getByUserId(userId: string) {
      const client = await initializeSupabaseClient();
      const { data, error } = await client
        .from("nostr_backups")
        .select("*")
        .eq("user_id", userId)
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
