/**
 * Provider Management Service
 * Phase 2 Day 3: Provider Management & Database Integration
 *
 * Manages user's trusted provider list and trust level configurations
 * Integrates with EnhancedTrustScoringService for metric calculation
 * Stores metrics in trust_metrics table via Supabase
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { EnhancedTrustScoringService } from "./enhanced-trust-scoring";
import type {
  MetricCalculationInput,
  MetricWeight,
  ProviderTrustLevel,
  ProviderTrustLevelRow,
  TrustedProvider,
  TrustedProviderRow,
  TrustLevel,
  TrustMetrics,
  TrustMetricsRow,
} from "./types";
import {
  createMetricWeight,
  createNetworkHops,
  createTrustMetricValue,
} from "./types";

/**
 * Provider Management Service
 * Handles CRUD operations for trusted providers and trust levels
 * Integrates metric calculation and storage
 */
export class ProviderManagementService {
  private supabase: SupabaseClient;
  private trustScoringService: EnhancedTrustScoringService;

  constructor(
    supabaseClient: SupabaseClient,
    trustScoringService?: EnhancedTrustScoringService
  ) {
    this.supabase = supabaseClient;
    this.trustScoringService =
      trustScoringService || new EnhancedTrustScoringService();
  }

  /**
   * Add a provider to user's trusted list
   *
   * @param userId - User ID (DUID) from user_identities table
   * @param providerPubkey - Provider's Nostr pubkey (hex format)
   * @param providerName - Optional provider display name
   * @param providerRelay - Optional provider relay URL
   * @param trustLevel - Initial trust level (1-5, default: 3)
   * @returns Created TrustedProvider
   * @throws Error if provider already exists or database operation fails
   */
  async addTrustedProvider(
    userId: string,
    providerPubkey: string,
    providerName?: string,
    providerRelay?: string,
    trustLevel: TrustLevel = 3
  ): Promise<TrustedProvider> {
    try {
      // Validate inputs
      if (!userId || !providerPubkey) {
        throw new Error("userId and providerPubkey are required");
      }

      if (trustLevel < 1 || trustLevel > 5) {
        throw new Error("trustLevel must be between 1 and 5");
      }

      // Insert into trusted_providers table
      const { data, error } = await this.supabase
        .from("trusted_providers")
        .insert({
          user_id: userId,
          provider_pubkey: providerPubkey,
          provider_name: providerName || null,
          provider_relay: providerRelay || null,
          trust_level: trustLevel,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to add trusted provider: ${error.message}`);
      }

      return this.rowToTrustedProvider(data as TrustedProviderRow);
    } catch (error) {
      throw new Error(
        `addTrustedProvider failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Remove a provider from user's trusted list
   *
   * @param userId - User ID (DUID)
   * @param providerPubkey - Provider's Nostr pubkey
   * @returns true if provider was removed, false if not found
   * @throws Error if database operation fails
   */
  async removeTrustedProvider(
    userId: string,
    providerPubkey: string
  ): Promise<boolean> {
    try {
      if (!userId || !providerPubkey) {
        throw new Error("userId and providerPubkey are required");
      }

      const { error } = await this.supabase
        .from("trusted_providers")
        .delete()
        .eq("user_id", userId)
        .eq("provider_pubkey", providerPubkey);

      if (error) {
        throw new Error(`Failed to remove trusted provider: ${error.message}`);
      }

      return true;
    } catch (error) {
      throw new Error(
        `removeTrustedProvider failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get all trusted providers for a user
   *
   * @param userId - User ID (DUID)
   * @param activeOnly - If true, only return active providers (default: true)
   * @returns Array of TrustedProvider objects
   * @throws Error if database operation fails
   */
  async getTrustedProviders(
    userId: string,
    activeOnly: boolean = true
  ): Promise<TrustedProvider[]> {
    try {
      if (!userId) {
        throw new Error("userId is required");
      }

      let query = this.supabase
        .from("trusted_providers")
        .select("*")
        .eq("user_id", userId);

      if (activeOnly) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to get trusted providers: ${error.message}`);
      }

      return (data as TrustedProviderRow[]).map((row) =>
        this.rowToTrustedProvider(row)
      );
    } catch (error) {
      throw new Error(
        `getTrustedProviders failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Set custom trust level and weight for a provider
   *
   * @param userId - User ID (DUID)
   * @param providerPubkey - Provider's Nostr pubkey
   * @param trustLevel - Trust level (1-5)
   * @param weight - Weight for aggregation (0.0-1.0)
   * @returns Created or updated ProviderTrustLevel
   * @throws Error if inputs invalid or database operation fails
   */
  async setProviderTrustLevel(
    userId: string,
    providerPubkey: string,
    trustLevel: TrustLevel,
    weight: number
  ): Promise<ProviderTrustLevel> {
    try {
      if (!userId || !providerPubkey) {
        throw new Error("userId and providerPubkey are required");
      }

      if (trustLevel < 1 || trustLevel > 5) {
        throw new Error("trustLevel must be between 1 and 5");
      }

      const metricWeight = createMetricWeight(weight);

      // Upsert into provider_trust_levels table
      const { data, error } = await this.supabase
        .from("provider_trust_levels")
        .upsert({
          user_id: userId,
          provider_pubkey: providerPubkey,
          trust_level: trustLevel,
          weight: metricWeight,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to set provider trust level: ${error.message}`);
      }

      return this.rowToProviderTrustLevel(data as ProviderTrustLevelRow);
    } catch (error) {
      throw new Error(
        `setProviderTrustLevel failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get trust level configuration for a provider
   *
   * @param userId - User ID (DUID)
   * @param providerPubkey - Provider's Nostr pubkey
   * @returns ProviderTrustLevel or null if not found
   * @throws Error if database operation fails
   */
  async getProviderTrustLevel(
    userId: string,
    providerPubkey: string
  ): Promise<ProviderTrustLevel | null> {
    try {
      if (!userId || !providerPubkey) {
        throw new Error("userId and providerPubkey are required");
      }

      const { data, error } = await this.supabase
        .from("provider_trust_levels")
        .select("*")
        .eq("user_id", userId)
        .eq("provider_pubkey", providerPubkey)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found
        throw new Error(`Failed to get provider trust level: ${error.message}`);
      }

      return data
        ? this.rowToProviderTrustLevel(data as ProviderTrustLevelRow)
        : null;
    } catch (error) {
      throw new Error(
        `getProviderTrustLevel failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Calculate metrics and store in trust_metrics table
   *
   * @param userId - User ID (DUID)
   * @param providerPubkey - Provider's Nostr pubkey
   * @param input - MetricCalculationInput with trust data
   * @returns Stored TrustMetrics
   * @throws Error if calculation or storage fails
   */
  async calculateAndStoreMetrics(
    userId: string,
    providerPubkey: string,
    input: MetricCalculationInput
  ): Promise<TrustMetrics> {
    try {
      if (!userId || !providerPubkey) {
        throw new Error("userId and providerPubkey are required");
      }

      // Calculate metrics using EnhancedTrustScoringService
      const metrics = this.trustScoringService.calculateAllMetrics(input);

      // Store in trust_metrics table
      const { data, error } = await this.supabase
        .from("trust_metrics")
        .upsert({
          user_id: userId,
          provider_pubkey: providerPubkey,
          rank: metrics.rank,
          followers: metrics.followers,
          hops: metrics.hops,
          influence: metrics.influence,
          reliability: metrics.reliability,
          recency: metrics.recency,
          composite_score: metrics.compositeScore,
          calculated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hour TTL
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to store metrics: ${error.message}`);
      }

      return this.rowToTrustMetrics(data as TrustMetricsRow);
    } catch (error) {
      throw new Error(
        `calculateAndStoreMetrics failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Convert database row to TrustedProvider object
   */
  private rowToTrustedProvider(row: TrustedProviderRow): TrustedProvider {
    return {
      id: row.id,
      providerPubkey: row.provider_pubkey,
      providerName: row.provider_name || undefined,
      providerRelay: row.provider_relay || undefined,
      trustLevel: row.trust_level as TrustLevel,
      isActive: row.is_active,
      addedAt: new Date(row.added_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Convert database row to ProviderTrustLevel object
   */
  private rowToProviderTrustLevel(
    row: ProviderTrustLevelRow
  ): ProviderTrustLevel {
    return {
      id: row.id,
      providerPubkey: row.provider_pubkey,
      trustLevel: row.trust_level as TrustLevel,
      weight: row.weight as MetricWeight,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Convert database row to TrustMetrics object
   */
  private rowToTrustMetrics(row: TrustMetricsRow): TrustMetrics {
    return {
      rank: createTrustMetricValue(row.rank || 0),
      followers: row.followers || 0,
      hops: createNetworkHops(row.hops || 6),
      influence: createTrustMetricValue(row.influence || 0),
      reliability: createTrustMetricValue(row.reliability || 0),
      recency: createTrustMetricValue(row.recency || 0),
      compositeScore: createTrustMetricValue(row.composite_score || 0),
    };
  }
}

/**
 * Singleton instance of ProviderManagementService
 * Initialized with Supabase client
 */
export let providerManagementService: ProviderManagementService;

/**
 * Initialize provider management service with Supabase client
 */
export function initializeProviderManagementService(
  supabaseClient: SupabaseClient
): ProviderManagementService {
  providerManagementService = new ProviderManagementService(supabaseClient);
  return providerManagementService;
}
