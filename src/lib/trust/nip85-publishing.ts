/**
 * NIP-85 Trust Provider Publishing Service
 * Publishes user trust scores to Nostr network as NIP-85 assertions
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Event } from "nostr-tools";
import { central_event_publishing_service as CEPS } from "../../../lib/central_event_publishing_service";
import { clientConfig } from "../../config/env.client";

/**
 * NIP-85 Assertion interface
 * Represents a trust assertion published to Nostr network
 */
export interface NIP85Assertion {
  kind: 30382 | 30383 | 30384;
  dTag: string;
  metrics: Record<string, string>;
  publishedAt: Date;
  relayUrls: string[];
  eventId?: string;
}

/**
 * User trust preferences from database
 */
interface TrustPreferences {
  exposure_level: "public" | "contacts" | "whitelist" | "private";
  visible_metrics: string[];
  whitelisted_pubkeys: string[];
  encryption_enabled: boolean;
}

/**
 * Cached assertion entry with TTL
 */
interface CachedAssertion {
  assertions: NIP85Assertion[];
  timestamp: number;
  ttl: number;
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  queried_user_id: string;
  querier_pubkey?: string;
  query_type: "api" | "relay" | "internal";
  ip_hash?: string;
  user_agent_hash?: string;
  success: boolean;
  metrics_returned?: Record<string, any>;
  created_at: string;
}

/**
 * NIP85PublishingService
 * Handles publishing and querying NIP-85 trust assertions
 */
export class NIP85PublishingService {
  private supabase: SupabaseClient;
  private publishRateLimit = new Map<string, number[]>(); // userId -> timestamps
  private assertionCache = new Map<string, CachedAssertion>(); // pubkey -> cached assertions
  private cacheTTL = 5 * 60 * 1000; // 5 minutes default TTL

  constructor(supabaseClient: SupabaseClient, cacheTTLMs?: number) {
    this.supabase = supabaseClient;
    if (cacheTTLMs) {
      this.cacheTTL = cacheTTLMs;
    }
  }

  /**
   * Publish user-level assertion (kind 30382)
   * Metrics: rank, followers, hops, influence, reliability, recency, composite
   *
   * @param userId - User ID (DUID) from user_identities table
   * @param targetPubkey - Subject pubkey (hex format)
   * @param metrics - Trust metrics to publish
   * @param relayUrls - Relay URLs to publish to (default: wss://relay.satnam.pub)
   * @returns Event ID of published assertion
   * @throws Error if rate limit exceeded or user has disabled publishing
   */
  async publishUserAssertion(
    userId: string,
    targetPubkey: string,
    metrics: Record<string, any>,
    relayUrls: string[] = ["wss://relay.satnam.pub"]
  ): Promise<string> {
    try {
      // Check if NIP-85 publishing is enabled
      if (!clientConfig.flags.nip85TrustProviderEnabled) {
        throw new Error("NIP-85 Trust Provider is disabled");
      }

      if (!clientConfig.flags.nip85PublishingEnabled) {
        throw new Error("NIP-85 Publishing is disabled");
      }

      // Rate limiting: 100 events/hour per user
      if (!this.checkRateLimit(userId, 100, 3600000)) {
        throw new Error("Rate limit exceeded: 100 events per hour");
      }

      // Check user's exposure preferences
      const prefs = await this.getUserPreferences(userId);
      if (prefs.exposure_level === "private") {
        throw new Error("User has disabled public trust score publishing");
      }

      // Filter metrics based on user preferences
      const visibleMetrics = this.filterMetrics(metrics, prefs.visible_metrics);

      // Encrypt if needed (NIP-44 encryption)
      let content = "";
      if (prefs.encryption_enabled) {
        try {
          content = await CEPS.encryptNip44WithActiveSession(
            userId,
            JSON.stringify(visibleMetrics)
          );
        } catch (error) {
          console.warn(
            "[NIP85] NIP-44 encryption failed, publishing unencrypted:",
            error instanceof Error ? error.message : "Unknown error"
          );
          content = "";
        }
      }

      // Build NIP-85 kind 30382 event tags
      const tags = [
        ["d", targetPubkey], // d-tag identifies subject
        ...Object.entries(visibleMetrics).map(([key, value]) => [
          key,
          String(value),
        ]),
        ...relayUrls.map((url) => ["relay", url]), // relay hints
      ];

      // Publish via CEPS
      const eventId = await CEPS.publishEvent(
        {
          kind: 30382,
          tags,
          content,
          created_at: Math.floor(Date.now() / 1000),
        },
        relayUrls
      );

      // Store in database for audit trail
      await this.supabase.from("nip85_assertions").upsert({
        user_id: userId,
        assertion_kind: 30382,
        subject_pubkey: targetPubkey,
        metrics: visibleMetrics,
        event_id: eventId,
        published_at: new Date().toISOString(),
        relay_urls: relayUrls,
      });

      return eventId;
    } catch (error) {
      throw new Error(
        `Failed to publish user assertion: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Publish provider declaration (kind 10040)
   * Declares Satnam.pub as a trusted service provider
   *
   * @param relayUrls - Relay URLs to publish to
   * @returns Event ID of published declaration
   */
  async publishProviderDeclaration(
    relayUrls: string[] = ["wss://relay.satnam.pub"]
  ): Promise<string> {
    try {
      const tags = [
        ["d", "satnam-trust-provider"],
        ["name", "Satnam.pub Trust Provider"],
        ["description", "Publishes trust scores for Satnam.pub users"],
        ["kinds", "30382", "30383", "30384"],
        ...relayUrls.map((url) => ["relay", url]),
      ];

      const eventId = await CEPS.publishEvent(
        {
          kind: 10040,
          tags,
          content: "Satnam.pub publishes NIP-85 trust assertions",
          created_at: Math.floor(Date.now() / 1000),
        },
        relayUrls
      );

      return eventId;
    } catch (error) {
      throw new Error(
        `Failed to publish provider declaration: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Fetch trusted assertions from relays
   * Queries for NIP-85 assertions about a specific pubkey
   *
   * @param targetPubkey - Subject pubkey to query
   * @param kinds - Assertion kinds to fetch (default: [30382])
   * @param relayUrls - Relay URLs to query
   * @returns Array of NIP85Assertion objects
   */
  async fetchTrustedAssertions(
    targetPubkey: string,
    kinds: number[] = [30382],
    relayUrls: string[] = ["wss://relay.satnam.pub"]
  ): Promise<NIP85Assertion[]> {
    try {
      // Check if NIP-85 query is enabled
      if (!clientConfig.flags.nip85TrustProviderEnabled) {
        throw new Error("NIP-85 Trust Provider is disabled");
      }

      if (!clientConfig.flags.nip85QueryEnabled) {
        throw new Error("NIP-85 Query is disabled");
      }

      const assertions: NIP85Assertion[] = [];

      // Query relays for assertions with d-tag matching targetPubkey
      const events = await CEPS.list(
        [
          {
            kinds,
            "#d": [targetPubkey],
          },
        ],
        relayUrls,
        { eoseTimeout: 5000 }
      );

      for (const event of events) {
        assertions.push({
          kind: event.kind as 30382 | 30383 | 30384,
          dTag: targetPubkey,
          metrics: this.extractMetrics(event),
          publishedAt: new Date(event.created_at * 1000),
          relayUrls,
          eventId: event.id,
        });
      }

      return assertions;
    } catch (error) {
      console.error(
        "[NIP85] Failed to fetch trusted assertions:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return [];
    }
  }

  /**
   * Get user's trust provider preferences
   * Returns default private settings if no preferences exist
   *
   * @param userId - User ID (DUID)
   * @returns User's trust preferences
   */
  private async getUserPreferences(userId: string): Promise<TrustPreferences> {
    try {
      const { data } = await this.supabase
        .from("trust_provider_preferences")
        .select("*")
        .eq("user_id", userId)
        .single();

      return (
        data || {
          exposure_level: "private",
          visible_metrics: [],
          whitelisted_pubkeys: [],
          encryption_enabled: false,
        }
      );
    } catch (error) {
      console.warn(
        "[NIP85] Failed to fetch user preferences, using defaults:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return {
        exposure_level: "private",
        visible_metrics: [],
        whitelisted_pubkeys: [],
        encryption_enabled: false,
      };
    }
  }

  /**
   * Filter metrics based on user's visible_metrics preference
   * Only returns metrics that user has explicitly enabled
   *
   * @param metrics - All available metrics
   * @param visibleMetrics - Array of metric names user wants visible
   * @returns Filtered metrics object
   */
  private filterMetrics(
    metrics: Record<string, any>,
    visibleMetrics: string[]
  ): Record<string, string> {
    const filtered: Record<string, string> = {};
    for (const key of visibleMetrics) {
      if (key in metrics) {
        filtered[key] = String(metrics[key]);
      }
    }
    return filtered;
  }

  /**
   * Extract metrics from Nostr event tags
   * Parses event tags to reconstruct metrics object
   *
   * @param event - Nostr event
   * @returns Extracted metrics
   */
  private extractMetrics(event: Event): Record<string, string> {
    const metrics: Record<string, string> = {};
    for (const tag of event.tags) {
      if (
        Array.isArray(tag) &&
        tag.length >= 2 &&
        !["d", "relay"].includes(tag[0])
      ) {
        metrics[tag[0]] = String(tag[1]);
      }
    }
    return metrics;
  }

  /**
   * Check rate limit for user
   * Enforces 100 events per hour per user
   *
   * @param userId - User ID
   * @param maxRequests - Maximum requests allowed
   * @param windowMs - Time window in milliseconds
   * @returns true if within rate limit, false if exceeded
   */
  private checkRateLimit(
    userId: string,
    maxRequests: number,
    windowMs: number
  ): boolean {
    const now = Date.now();
    const timestamps = this.publishRateLimit.get(userId) || [];
    const recentTimestamps = timestamps.filter((t) => now - t < windowMs);

    if (recentTimestamps.length >= maxRequests) {
      return false;
    }

    recentTimestamps.push(now);
    this.publishRateLimit.set(userId, recentTimestamps);
    return true;
  }

  /**
   * Query public trust scores from relays
   * Fetches all NIP-85 assertions about a specific pubkey from multiple relays
   *
   * @param targetPubkey - Subject pubkey to query
   * @param relayUrls - Relay URLs to query (default: wss://relay.satnam.pub)
   * @returns Array of all assertions found
   */
  async queryPublicTrustScore(
    targetPubkey: string,
    relayUrls: string[] = ["wss://relay.satnam.pub"]
  ): Promise<NIP85Assertion[]> {
    try {
      // Query all assertion kinds (30382, 30383, 30384)
      const assertions = await this.fetchTrustedAssertions(
        targetPubkey,
        [30382, 30383, 30384],
        relayUrls
      );

      return assertions;
    } catch (error) {
      console.error(
        "[NIP85] Failed to query public trust score:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return [];
    }
  }

  /**
   * Validate metric values before publishing
   * Ensures metrics are within acceptable ranges and properly formatted
   *
   * @param metrics - Metrics to validate
   * @returns true if valid, false otherwise
   * @throws Error if validation fails
   */
  validateMetrics(metrics: Record<string, any>): boolean {
    if (!metrics || typeof metrics !== "object") {
      throw new Error("Metrics must be a non-null object");
    }

    // Validate common trust metrics
    const validMetrics = [
      "rank",
      "followers",
      "hops",
      "influence",
      "reliability",
      "recency",
      "composite",
    ];

    for (const [key, value] of Object.entries(metrics)) {
      // Check if metric name is valid
      if (!validMetrics.includes(key)) {
        console.warn(`[NIP85] Unknown metric: ${key}`);
      }

      // Validate metric value is a number
      if (typeof value !== "number") {
        throw new Error(`Metric ${key} must be a number, got ${typeof value}`);
      }

      // Validate metric value is within reasonable range (0-100 for most metrics)
      if (value < 0 || value > 100) {
        throw new Error(
          `Metric ${key} must be between 0 and 100, got ${value}`
        );
      }
    }

    return true;
  }

  /**
   * Check privacy settings for a user
   * Validates exposure level and whitelisted pubkeys
   *
   * @param userId - User ID (DUID)
   * @param targetPubkey - Target pubkey to check against whitelist
   * @returns true if user allows publishing to this pubkey, false otherwise
   */
  async checkPrivacySettings(
    userId: string,
    targetPubkey: string
  ): Promise<boolean> {
    try {
      const prefs = await this.getUserPreferences(userId);

      // Private exposure blocks all publishing
      if (prefs.exposure_level === "private") {
        return false;
      }

      // Public exposure allows all
      if (prefs.exposure_level === "public") {
        return true;
      }

      // Contacts exposure allows all (simplified - would need contacts list in production)
      if (prefs.exposure_level === "contacts") {
        return true;
      }

      // Whitelist exposure only allows whitelisted pubkeys
      if (prefs.exposure_level === "whitelist") {
        return prefs.whitelisted_pubkeys.includes(targetPubkey);
      }

      return false;
    } catch (error) {
      console.error(
        "[NIP85] Failed to check privacy settings:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return false;
    }
  }

  /**
   * Encrypt metrics using NIP-44 encryption
   * Helper method for encrypting sensitive metrics
   *
   * @param userId - User ID for session lookup
   * @param metrics - Metrics to encrypt
   * @returns Encrypted metrics string or empty string if encryption fails
   */
  private async encryptMetrics(
    userId: string,
    metrics: Record<string, string>
  ): Promise<string> {
    try {
      const metricsJson = JSON.stringify(metrics);
      const encrypted = await CEPS.encryptNip44WithActiveSession(
        userId,
        metricsJson
      );
      return encrypted;
    } catch (error) {
      console.warn(
        "[NIP85] Metrics encryption failed:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return "";
    }
  }

  /**
   * Batch publish multiple assertions
   * Publishes multiple trust assertions in a single operation
   *
   * @param userId - User ID (DUID)
   * @param assertions - Array of assertions to publish
   * @param relayUrls - Relay URLs to publish to
   * @returns Array of published event IDs
   */
  async batchPublishAssertions(
    userId: string,
    assertions: Array<{
      targetPubkey: string;
      metrics: Record<string, any>;
    }>,
    relayUrls: string[] = ["wss://relay.satnam.pub"]
  ): Promise<string[]> {
    try {
      const eventIds: string[] = [];

      for (const assertion of assertions) {
        try {
          // Validate metrics before publishing
          this.validateMetrics(assertion.metrics);

          // Check privacy settings
          const allowed = await this.checkPrivacySettings(
            userId,
            assertion.targetPubkey
          );
          if (!allowed) {
            console.warn(
              `[NIP85] Publishing blocked for ${assertion.targetPubkey} due to privacy settings`
            );
            continue;
          }

          // Publish assertion
          const eventId = await this.publishUserAssertion(
            userId,
            assertion.targetPubkey,
            assertion.metrics,
            relayUrls
          );

          eventIds.push(eventId);
        } catch (error) {
          console.error(
            `[NIP85] Failed to publish assertion for ${assertion.targetPubkey}:`,
            error instanceof Error ? error.message : "Unknown error"
          );
          // Continue with next assertion on error
        }
      }

      return eventIds;
    } catch (error) {
      throw new Error(
        `Failed to batch publish assertions: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get assertion history for a user from database
   * Retrieves all historical assertions published by a user
   *
   * @param userId - User ID (DUID)
   * @param limit - Maximum number of results (default: 100)
   * @param offset - Pagination offset (default: 0)
   * @returns Array of historical assertions
   */
  async getAssertionHistory(
    userId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<NIP85Assertion[]> {
    try {
      const { data, error } = await this.supabase
        .from("nip85_assertions")
        .select("*")
        .eq("user_id", userId)
        .order("published_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw error;
      }

      return (data || []).map((row: any) => ({
        kind: row.assertion_kind,
        dTag: row.subject_pubkey,
        metrics: row.metrics,
        publishedAt: new Date(row.published_at),
        relayUrls: row.relay_urls || ["wss://relay.satnam.pub"],
        eventId: row.event_id,
      }));
    } catch (error) {
      console.error(
        "[NIP85] Failed to get assertion history:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return [];
    }
  }

  /**
   * Delete an assertion from database
   * Removes a specific assertion and optionally publishes deletion event
   *
   * @param userId - User ID (DUID)
   * @param eventId - Event ID of assertion to delete
   * @param publishDeletion - Whether to publish deletion event (default: false)
   * @returns true if deletion successful, false otherwise
   */
  async deleteAssertion(
    userId: string,
    eventId: string,
    publishDeletion: boolean = false
  ): Promise<boolean> {
    try {
      // Delete from database
      const { error } = await this.supabase
        .from("nip85_assertions")
        .delete()
        .eq("user_id", userId)
        .eq("event_id", eventId);

      if (error) {
        throw error;
      }

      // Optionally publish deletion event (kind 5)
      if (publishDeletion) {
        try {
          await CEPS.publishEvent({
            kind: 5,
            tags: [["e", eventId]],
            content: "Deleting NIP-85 assertion",
            created_at: Math.floor(Date.now() / 1000),
          });
        } catch (delError) {
          console.warn(
            "[NIP85] Failed to publish deletion event:",
            delError instanceof Error ? delError.message : "Unknown error"
          );
        }
      }

      return true;
    } catch (error) {
      console.error(
        "[NIP85] Failed to delete assertion:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return false;
    }
  }

  /**
   * Update user's trust provider preferences
   * Updates exposure level, visible metrics, and whitelist
   *
   * @param userId - User ID (DUID)
   * @param updates - Partial preferences to update
   * @returns Updated preferences or null on error
   */
  async updateUserPreferences(
    userId: string,
    updates: Partial<TrustPreferences>
  ): Promise<TrustPreferences | null> {
    try {
      // Validate exposure level if provided
      if (
        updates.exposure_level &&
        !["public", "contacts", "whitelist", "private"].includes(
          updates.exposure_level
        )
      ) {
        throw new Error(`Invalid exposure_level: ${updates.exposure_level}`);
      }

      const { data, error } = await this.supabase
        .from("trust_provider_preferences")
        .update(updates)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error(
        "[NIP85] Failed to update user preferences:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return null;
    }
  }

  /**
   * Get audit log entries for a user
   * Retrieves query audit logs for a specific user
   *
   * @param userId - User ID (DUID)
   * @param limit - Maximum number of results (default: 50)
   * @param offset - Pagination offset (default: 0)
   * @returns Array of audit log entries
   */
  async getAuditLog(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<AuditLogEntry[]> {
    try {
      const { data, error } = await this.supabase
        .from("trust_query_audit_log")
        .select("*")
        .eq("queried_user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error(
        "[NIP85] Failed to get audit log:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return [];
    }
  }

  /**
   * Log a query operation to audit log
   * Records query operations for security and compliance
   *
   * @param queriedUserId - User ID being queried
   * @param queryType - Type of query (api, relay, internal)
   * @param success - Whether query was successful
   * @param metricsReturned - Metrics that were returned
   * @param ipHash - Optional IP address hash
   * @param userAgentHash - Optional user agent hash
   */
  async logQuery(
    queriedUserId: string,
    queryType: "api" | "relay" | "internal",
    success: boolean,
    metricsReturned?: Record<string, any>,
    ipHash?: string,
    userAgentHash?: string
  ): Promise<void> {
    try {
      // Check if audit logging is enabled
      if (!clientConfig.flags.nip85AuditLoggingEnabled) {
        return;
      }

      await this.supabase.from("trust_query_audit_log").insert({
        queried_user_id: queriedUserId,
        query_type: queryType,
        success,
        metrics_returned: metricsReturned,
        ip_hash: ipHash,
        user_agent_hash: userAgentHash,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.warn(
        "[NIP85] Failed to log query:",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  /**
   * Cache assertions for a pubkey
   * Stores assertions in memory with TTL for performance
   *
   * @param pubkey - Subject pubkey
   * @param assertions - Assertions to cache
   */
  private cacheAssertions(pubkey: string, assertions: NIP85Assertion[]): void {
    this.assertionCache.set(pubkey, {
      assertions,
      timestamp: Date.now(),
      ttl: this.cacheTTL,
    });
  }

  /**
   * Get cached assertions for a pubkey
   * Returns cached assertions if still valid (within TTL)
   *
   * @param pubkey - Subject pubkey
   * @returns Cached assertions or null if expired/not found
   */
  private getCachedAssertions(pubkey: string): NIP85Assertion[] | null {
    const cached = this.assertionCache.get(pubkey);
    if (!cached) {
      return null;
    }

    const age = Date.now() - cached.timestamp;
    if (age > cached.ttl) {
      this.assertionCache.delete(pubkey);
      return null;
    }

    return cached.assertions;
  }

  /**
   * Clear cached assertions
   * Removes cached assertions for a specific pubkey or all
   *
   * @param pubkey - Specific pubkey to clear, or undefined to clear all
   */
  clearCache(pubkey?: string): void {
    if (pubkey) {
      this.assertionCache.delete(pubkey);
    } else {
      this.assertionCache.clear();
    }
  }

  /**
   * Query assertions with caching
   * Fetches assertions from cache if available, otherwise from relays
   *
   * @param targetPubkey - Subject pubkey to query
   * @param relayUrls - Relay URLs to query
   * @returns Array of assertions
   */
  async queryAssertionsWithCache(
    targetPubkey: string,
    relayUrls: string[] = ["wss://relay.satnam.pub"]
  ): Promise<NIP85Assertion[]> {
    try {
      // Check cache first if caching is enabled
      if (clientConfig.flags.nip85CacheEnabled) {
        const cached = this.getCachedAssertions(targetPubkey);
        if (cached) {
          return cached;
        }
      }

      // Fetch from relays
      const assertions = await this.fetchTrustedAssertions(
        targetPubkey,
        [30382, 30383, 30384],
        relayUrls
      );

      // Cache results if caching is enabled
      if (clientConfig.flags.nip85CacheEnabled && assertions.length > 0) {
        this.cacheAssertions(targetPubkey, assertions);
      }

      return assertions;
    } catch (error) {
      console.error(
        "[NIP85] Failed to query assertions with cache:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return [];
    }
  }

  /**
   * Batch query assertions for multiple pubkeys
   * Optimized batch querying with caching support
   *
   * @param pubkeys - Array of pubkeys to query
   * @param relayUrls - Relay URLs to query
   * @returns Map of pubkey to assertions
   */
  async batchQueryAssertions(
    pubkeys: string[],
    relayUrls: string[] = ["wss://relay.satnam.pub"]
  ): Promise<Map<string, NIP85Assertion[]>> {
    const results = new Map<string, NIP85Assertion[]>();

    try {
      for (const pubkey of pubkeys) {
        const assertions = await this.queryAssertionsWithCache(
          pubkey,
          relayUrls
        );
        results.set(pubkey, assertions);
      }

      return results;
    } catch (error) {
      console.error(
        "[NIP85] Failed to batch query assertions:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return results;
    }
  }
}

/**
 * Create singleton instance of NIP85PublishingService
 * Ensures single instance across application
 */
let nip85ServiceInstance: NIP85PublishingService | null = null;

export function getNIP85PublishingService(): NIP85PublishingService {
  if (!nip85ServiceInstance) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Missing Supabase configuration: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    // Use configured cache TTL from environment
    nip85ServiceInstance = new NIP85PublishingService(
      supabase,
      clientConfig.nip85.cacheTTLMs
    );
  }

  return nip85ServiceInstance;
}
