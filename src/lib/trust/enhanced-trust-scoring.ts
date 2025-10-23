/**
 * Enhanced Trust Scoring Service
 * Phase 2: Multi-Metric Trust Scoring & Provider Management
 *
 * Calculates individual trust metrics and composite scores using:
 * - Rank: Normalized overall trust score (0-100)
 * - Followers: Estimated social reach from contact count
 * - Hops: Network distance in social graph (1-6)
 * - Influence: PageRank-style influence score (0-100)
 * - Reliability: Success rate and consistency (0-100)
 * - Recency: Time-decay for recent activity (0-100)
 *
 * Composite Score = rank*0.25 + followers*0.15 + hops*0.15 + influence*0.20 + reliability*0.15 + recency*0.10
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import type {
  TrustMetrics,
  TrustMetricValue,
  NetworkHops,
  MetricCalculationInput,
  MetricCalculationResult,
} from "./types";
import {
  createTrustMetricValue,
  createNetworkHops,
} from "./types";

/**
 * Enhanced Trust Scoring Service
 * Calculates multi-metric trust scores for users
 */
export class EnhancedTrustScoringService {
  /**
   * Calculate rank metric (0-100)
   * Normalized overall trust score based on verification and social signals
   *
   * @param trustScore - Base trust score (0-100)
   * @param verificationCount - Number of verification methods used
   * @param attestationCount - Number of social attestations
   * @returns Rank metric (0-100)
   */
  calculateRankMetric(
    trustScore: number,
    verificationCount: number = 0,
    attestationCount: number = 0
  ): TrustMetricValue {
    // Clamp trust score to 0-100
    let rank = Math.max(0, Math.min(100, trustScore));

    // Bonus for multiple verification methods (up to +10)
    const verificationBonus = Math.min(verificationCount * 3, 10);

    // Bonus for social attestations (up to +10)
    const attestationBonus = Math.min(attestationCount * 2, 10);

    rank = Math.min(100, rank + verificationBonus + attestationBonus);

    return createTrustMetricValue(Math.round(rank));
  }

  /**
   * Calculate followers metric
   * Estimate social reach from contact count
   *
   * @param contactCount - Number of contacts
   * @param maxContactsForFullScore - Contact count for 100% score (default: 1000)
   * @returns Followers count (normalized)
   */
  calculateFollowersMetric(
    contactCount: number = 0,
    maxContactsForFullScore: number = 1000
  ): number {
    // Normalize contact count to followers estimate
    // Assumes 1 contact ≈ 1 follower for simplicity
    const followers = Math.max(0, contactCount);

    return followers;
  }

  /**
   * Calculate hops metric (1-6)
   * Network distance in social graph
   *
   * @param directConnection - Is direct connection (1 hop)
   * @param mutualConnections - Number of mutual connections
   * @param pathLength - Shortest path length (if known)
   * @returns Network hops (1-6)
   */
  calculateHopsMetric(
    directConnection: boolean = false,
    mutualConnections: number = 0,
    pathLength?: number
  ): NetworkHops {
    let hops: number;

    if (pathLength !== undefined && pathLength > 0) {
      // Use provided path length
      hops = Math.min(6, Math.max(1, pathLength));
    } else if (directConnection) {
      // Direct connection = 1 hop
      hops = 1;
    } else if (mutualConnections > 0) {
      // Mutual connections suggest 2 hops
      hops = 2;
    } else {
      // Default to 6 (maximum distance)
      hops = 6;
    }

    return createNetworkHops(hops);
  }

  /**
   * Calculate influence metric (0-100)
   * PageRank-style influence score based on network position
   *
   * @param hops - Network distance (1-6)
   * @param followerCount - Number of followers
   * @param engagementRate - Engagement rate (0-1)
   * @returns Influence score (0-100)
   */
  calculateInfluenceMetric(
    hops: number = 6,
    followerCount: number = 0,
    engagementRate: number = 0
  ): TrustMetricValue {
    // Base influence from network position (closer = higher)
    const hopsFactor = ((7 - Math.max(1, Math.min(6, hops))) / 6) * 40; // 0-40 points

    // Follower-based influence (0-30 points)
    const followerFactor = Math.min(30, (followerCount / 1000) * 30);

    // Engagement-based influence (0-30 points)
    const engagementFactor = Math.max(0, Math.min(1, engagementRate)) * 30;

    const influence = hopsFactor + followerFactor + engagementFactor;

    return createTrustMetricValue(Math.round(Math.min(100, influence)));
  }

  /**
   * Calculate reliability metric (0-100)
   * Success rate and consistency of actions
   *
   * @param successCount - Number of successful actions
   * @param totalCount - Total number of actions
   * @param consistencyScore - Consistency over time (0-1)
   * @returns Reliability score (0-100)
   */
  calculateReliabilityMetric(
    successCount: number = 0,
    totalCount: number = 0,
    consistencyScore: number = 0
  ): TrustMetricValue {
    // Success rate (0-60 points)
    let successRate = 0;
    if (totalCount > 0) {
      successRate = (successCount / totalCount) * 60;
    }

    // Consistency bonus (0-40 points)
    const consistency = Math.max(0, Math.min(1, consistencyScore)) * 40;

    const reliability = successRate + consistency;

    return createTrustMetricValue(Math.round(Math.min(100, reliability)));
  }

  /**
   * Calculate recency metric (0-100)
   * Time-decay for recent activity
   *
   * @param lastActivityDays - Days since last activity
   * @param maxAgeDays - Days for full decay (default: 180)
   * @returns Recency score (0-100)
   */
  calculateRecencyMetric(
    lastActivityDays: number = 180,
    maxAgeDays: number = 180
  ): TrustMetricValue {
    // Recent activity (within 30 days) = 100
    if (lastActivityDays <= 30) {
      return createTrustMetricValue(100);
    }

    // Activity within 60 days = 80
    if (lastActivityDays <= 60) {
      return createTrustMetricValue(80);
    }

    // Activity within 90 days = 60
    if (lastActivityDays <= 90) {
      return createTrustMetricValue(60);
    }

    // Activity within 180 days = 40
    if (lastActivityDays <= 180) {
      return createTrustMetricValue(40);
    }

    // Activity older than 180 days = 0
    return createTrustMetricValue(0);
  }

  /**
   * Calculate composite score
   * Weighted aggregation of all 6 metrics
   *
   * Formula: rank*0.25 + followers*0.15 + hops*0.15 + influence*0.20 + reliability*0.15 + recency*0.10
   *
   * @param metrics - All 6 trust metrics
   * @returns Composite score (0-100)
   */
  calculateCompositeScore(metrics: TrustMetrics): TrustMetricValue {
    // Normalize followers to 0-100 scale (assuming max 1000 followers = 100)
    const followersNormalized = Math.min(100, (metrics.followers / 1000) * 100);

    // Normalize hops to 0-100 scale (inverse: 1 hop = 100, 6 hops = 0)
    const hopsNormalized = ((7 - metrics.hops) / 6) * 100;

    // Apply weights
    const composite =
      metrics.rank * 0.25 +
      followersNormalized * 0.15 +
      hopsNormalized * 0.15 +
      metrics.influence * 0.2 +
      metrics.reliability * 0.15 +
      metrics.recency * 0.1;

    return createTrustMetricValue(Math.round(Math.min(100, composite)));
  }

  /**
   * Calculate all metrics
   * Comprehensive metric calculation from input data
   *
   * @param input - Metric calculation input
   * @returns Complete TrustMetrics object
   */
  calculateAllMetrics(input: MetricCalculationInput): TrustMetrics {
    // Calculate individual metrics
    const rank = this.calculateRankMetric(
      input.trustScore || 50,
      0,
      input.attestationCount || 0
    );

    const followers = this.calculateFollowersMetric(
      input.contactCount || 0
    );

    const hops = this.calculateHopsMetric(
      input.contactCount !== undefined && input.contactCount > 0,
      input.contactCount || 0
    );

    const influence = this.calculateInfluenceMetric(
      hops,
      followers,
      0
    );

    const reliability = this.calculateReliabilityMetric(
      input.successCount || 0,
      input.totalActionCount || 0,
      0
    );

    const recency = this.calculateRecencyMetric(
      input.lastActivityDate
        ? Math.floor(
            (Date.now() - input.lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        : 180,
      180
    );

    // Build metrics object
    const metrics: TrustMetrics = {
      rank,
      followers,
      hops,
      influence,
      reliability,
      recency,
      compositeScore: createTrustMetricValue(0), // Placeholder, will be calculated below
    };

    // Calculate composite score
    metrics.compositeScore = this.calculateCompositeScore(metrics);

    return metrics;
  }
}

// Export singleton instance
export const enhancedTrustScoringService = new EnhancedTrustScoringService();

