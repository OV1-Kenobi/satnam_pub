/**
 * Trust System Type Definitions
 * Phase 2: Multi-Metric Trust Scoring & Provider Management
 *
 * Defines all TypeScript interfaces for:
 * - Multi-metric trust calculations
 * - Provider management
 * - Trust level configurations
 * - Metric aggregation
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

/**
 * Individual trust metric (0-100 scale)
 * Represents a single dimension of trust
 */
export type TrustMetricValue = number & {
  readonly __brand: "TrustMetricValue";
};

/**
 * Create a branded TrustMetricValue (0-100)
 */
export function createTrustMetricValue(value: number): TrustMetricValue {
  if (value < 0 || value > 100) {
    throw new Error(
      `Trust metric value must be between 0 and 100, got ${value}`
    );
  }
  return value as TrustMetricValue;
}

/**
 * Network hops (1-6 scale)
 * Represents degrees of separation in social graph
 */
export type NetworkHops = number & { readonly __brand: "NetworkHops" };

/**
 * Create a branded NetworkHops value (1-6)
 */
export function createNetworkHops(value: number): NetworkHops {
  if (value < 1 || value > 6) {
    throw new Error(`Network hops must be between 1 and 6, got ${value}`);
  }
  return value as NetworkHops;
}

/**
 * Trust level (1-5 stars)
 * User's confidence in a provider
 */
export type TrustLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Metric weight (0.0-1.0)
 * Used for weighted aggregation of metrics
 */
export type MetricWeight = number & { readonly __brand: "MetricWeight" };

/**
 * Create a branded MetricWeight value (0.0-1.0)
 */
export function createMetricWeight(value: number): MetricWeight {
  if (value < 0 || value > 1) {
    throw new Error(`Metric weight must be between 0 and 1, got ${value}`);
  }
  return value as MetricWeight;
}

/**
 * Multi-metric trust score
 * Contains all 6 trust metrics for a user
 */
export interface TrustMetrics {
  /** Normalized overall trust score (0-100) */
  rank: TrustMetricValue;

  /** Estimated social reach (followers count) */
  followers: number;

  /** Network distance in social graph (1-6) */
  hops: NetworkHops;

  /** PageRank-style influence score (0-100) */
  influence: TrustMetricValue;

  /** Success rate and consistency (0-100) */
  reliability: TrustMetricValue;

  /** Time-decay for recent activity (0-100) */
  recency: TrustMetricValue;

  /** Weighted composite score (0-100) */
  compositeScore: TrustMetricValue;
}

/**
 * Metric breakdown with component details
 * Used for detailed analysis and visualization
 */
export interface MetricBreakdown extends TrustMetrics {
  /** Timestamp when metrics were calculated */
  calculatedAt: Date;

  /** Timestamp when metrics expire (for caching) */
  expiresAt?: Date;

  /** Provider pubkey that calculated these metrics */
  providerPubkey: string;

  /** Calculation method/version */
  calculationMethod: string;
}

/**
 * Trusted provider configuration
 * Represents a provider in user's trust list
 */
export interface TrustedProvider {
  /** Unique identifier */
  id: string;

  /** Provider's Nostr pubkey (hex format) */
  providerPubkey: string;

  /** Provider display name */
  providerName?: string;

  /** Provider's relay URL */
  providerRelay?: string;

  /** User's trust level in this provider (1-5 stars) */
  trustLevel: TrustLevel;

  /** Whether provider is active */
  isActive: boolean;

  /** When provider was added to trust list */
  addedAt: Date;

  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Provider trust level configuration
 * Customized trust level and weight per provider
 */
export interface ProviderTrustLevel {
  /** Unique identifier */
  id: string;

  /** Provider's Nostr pubkey (hex format) */
  providerPubkey: string;

  /** User's trust level in this provider (1-5) */
  trustLevel: TrustLevel;

  /** Weight for metric aggregation (0.0-1.0) */
  weight: MetricWeight;

  /** Creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Aggregated metrics from multiple providers
 * Result of combining metrics from trusted providers
 */
export interface AggregatedMetrics extends TrustMetrics {
  /** Number of providers aggregated */
  providerCount: number;

  /** List of provider pubkeys used in aggregation */
  providerPubkeys: string[];

  /** Aggregation method used */
  aggregationMethod: "weighted-average" | "median" | "consensus";

  /** Confidence score (0-100) based on provider agreement */
  confidenceScore: TrustMetricValue;

  /** Timestamp of aggregation */
  aggregatedAt: Date;
}

/**
 * Trust model selection
 * Determines how trust is calculated
 */
export type TrustModel = "action-based" | "multi-metric" | "hybrid";

/**
 * Trust model configuration
 * Customizable weights for metric calculation
 */
export interface TrustModelConfig {
  /** Selected trust model */
  model: TrustModel;

  /** Metric weights for composite score calculation */
  weights: {
    rank: number;
    followers: number;
    hops: number;
    influence: number;
    reliability: number;
    recency: number;
  };

  /** Whether to use provider aggregation */
  useProviderAggregation: boolean;

  /** Aggregation method */
  aggregationMethod: "weighted-average" | "median" | "consensus";

  /** Cache TTL in milliseconds */
  cacheTTLMs: number;
}

/**
 * Database row for trust_metrics table
 * Raw database representation
 */
export interface TrustMetricsRow {
  id: string;
  user_id: string;
  provider_pubkey: string;
  rank: number | null;
  followers: number | null;
  hops: number | null;
  influence: number | null;
  reliability: number | null;
  recency: number | null;
  composite_score: number | null;
  calculated_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database row for trusted_providers table
 * Raw database representation
 */
export interface TrustedProviderRow {
  id: string;
  user_id: string;
  provider_pubkey: string;
  provider_name: string | null;
  provider_relay: string | null;
  trust_level: number;
  is_active: boolean;
  added_at: string;
  updated_at: string;
}

/**
 * Database row for provider_trust_levels table
 * Raw database representation
 */
export interface ProviderTrustLevelRow {
  id: string;
  user_id: string;
  provider_pubkey: string;
  trust_level: number;
  weight: number;
  created_at: string;
  updated_at: string;
}

/**
 * Metric calculation input
 * Parameters for calculating individual metrics
 */
export interface MetricCalculationInput {
  /** User ID (DUID) */
  userId: string;

  /** Target user ID for metric calculation */
  targetUserId: string;

  /** Trust score (0-100) for rank calculation */
  trustScore?: number;

  /** Contact count for followers estimation */
  contactCount?: number;

  /** Social attestation count */
  attestationCount?: number;

  /** Last activity date for recency calculation */
  lastActivityDate?: Date;

  /** Success count for reliability calculation */
  successCount?: number;

  /** Total action count for reliability calculation */
  totalActionCount?: number;
}

/**
 * Metric calculation result
 * Output of metric calculation
 */
export interface MetricCalculationResult {
  /** Calculated metric value */
  value: TrustMetricValue;

  /** Calculation method used */
  method: string;

  /** Confidence in the calculation (0-100) */
  confidence: TrustMetricValue;

  /** Timestamp of calculation */
  calculatedAt: Date;

  /** Optional metadata about calculation */
  metadata?: Record<string, unknown>;
}

/**
 * Provider validation result
 * Result of validating a provider
 */
export interface ProviderValidationResult {
  /** Whether provider is valid */
  isValid: boolean;

  /** Provider pubkey (hex format) */
  providerPubkey: string;

  /** Provider name (if available) */
  providerName?: string;

  /** Validation errors (if any) */
  errors: string[];

  /** Validation timestamp */
  validatedAt: Date;
}

/**
 * Trust provider for marketplace
 * Phase 3 Day 1: Trust Provider Discovery & Marketplace UI
 */
export interface Provider {
  /** Unique provider identifier */
  id: string;

  /** Provider's Nostr pubkey (hex format) */
  pubkey: string;

  /** Provider display name */
  name: string;

  /** Provider description */
  description: string;

  /** Provider category (e.g., "reputation", "verification", "social") */
  category: string;

  /** Provider icon URL */
  iconUrl?: string;

  /** Provider website URL */
  websiteUrl?: string;

  /** Average rating (0-5 stars) */
  rating: number;

  /** Number of users subscribed */
  userCount: number;

  /** Provider creation timestamp */
  createdAt: number;

  /** Last update timestamp */
  updatedAt: number;

  /** Whether provider is verified */
  isVerified?: boolean;

  /** Provider metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Provider filters for marketplace search
 */
export interface ProviderFilters {
  /** Search query */
  query?: string;

  /** Filter by category */
  category?: string;

  /** Minimum rating (0-5) */
  minRating?: number;

  /** Minimum user count */
  minUserCount?: number;

  /** Sort by field */
  sortBy?: "rating" | "userCount" | "createdAt" | "name";

  /** Sort direction */
  sortDirection?: "asc" | "desc";

  /** Pagination limit */
  limit?: number;

  /** Pagination offset */
  offset?: number;
}

/**
 * Provider subscription
 */
export interface ProviderSubscription {
  /** Unique subscription identifier */
  id: string;

  /** Provider ID */
  providerId: string;

  /** Subscription timestamp */
  subscribedAt: number;

  /** Notification preferences */
  notificationPreferences?: {
    scoreChanges: boolean;
    newAttestations: boolean;
    providerUpdates: boolean;
  };
}

/**
 * Provider rating and review
 */
export interface ProviderRating {
  /** Unique rating identifier */
  id: string;

  /** Provider ID */
  providerId: string;

  /** Rating value (1-5 stars) */
  rating: number;

  /** Review text (optional) */
  review?: string;

  /** Rating timestamp */
  ratedAt: number;

  /** User who rated (anonymized) */
  ratedBy?: string;
}
