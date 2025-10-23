/**
 * Enhanced Trust Scoring Service Tests
 * Phase 2 Day 2: Multi-Metric Trust Scoring Service
 *
 * Tests for all 8 core methods of EnhancedTrustScoringService
 */

import { beforeEach, describe, expect, it } from "vitest";
import { EnhancedTrustScoringService } from "../../src/lib/trust/enhanced-trust-scoring";
import type {
  MetricCalculationInput,
  TrustMetrics,
} from "../../src/lib/trust/types";

describe("EnhancedTrustScoringService", () => {
  let service: EnhancedTrustScoringService;

  beforeEach(() => {
    service = new EnhancedTrustScoringService();
  });

  describe("calculateRankMetric()", () => {
    it("should return 0 for zero trust score", () => {
      const rank = service.calculateRankMetric(0, 0, 0);
      expect(rank).toBe(0);
    });

    it("should return 100 for max trust score", () => {
      const rank = service.calculateRankMetric(100, 0, 0);
      expect(rank).toBe(100);
    });

    it("should clamp values above 100", () => {
      const rank = service.calculateRankMetric(150, 0, 0);
      expect(rank).toBeLessThanOrEqual(100);
    });

    it("should add verification bonus (up to +10)", () => {
      const rankNoVerification = service.calculateRankMetric(50, 0, 0);
      const rankWithVerification = service.calculateRankMetric(50, 5, 0);
      expect(rankWithVerification).toBeGreaterThan(rankNoVerification);
    });

    it("should add attestation bonus (up to +10)", () => {
      const rankNoAttestations = service.calculateRankMetric(50, 0, 0);
      const rankWithAttestations = service.calculateRankMetric(50, 0, 5);
      expect(rankWithAttestations).toBeGreaterThan(rankNoAttestations);
    });

    it("should cap total at 100", () => {
      const rank = service.calculateRankMetric(100, 10, 10);
      expect(rank).toBe(100);
    });
  });

  describe("calculateFollowersMetric()", () => {
    it("should return 0 for zero contacts", () => {
      const followers = service.calculateFollowersMetric(0);
      expect(followers).toBe(0);
    });

    it("should return contact count as followers", () => {
      const followers = service.calculateFollowersMetric(100);
      expect(followers).toBe(100);
    });

    it("should handle large contact counts", () => {
      const followers = service.calculateFollowersMetric(10000);
      expect(followers).toBe(10000);
    });

    it("should not go negative", () => {
      const followers = service.calculateFollowersMetric(-10);
      expect(followers).toBeGreaterThanOrEqual(0);
    });
  });

  describe("calculateHopsMetric()", () => {
    it("should return 1 for direct connection", () => {
      const hops = service.calculateHopsMetric(true, 0);
      expect(hops).toBe(1);
    });

    it("should return 2 for mutual connections", () => {
      const hops = service.calculateHopsMetric(false, 5);
      expect(hops).toBe(2);
    });

    it("should return 6 for no connection", () => {
      const hops = service.calculateHopsMetric(false, 0);
      expect(hops).toBe(6);
    });

    it("should use provided path length", () => {
      const hops = service.calculateHopsMetric(false, 0, 3);
      expect(hops).toBe(3);
    });

    it("should clamp path length to 1-6", () => {
      const hopsTooLow = service.calculateHopsMetric(false, 0, 0);
      const hopsTooHigh = service.calculateHopsMetric(false, 0, 10);
      // pathLength=0 clamps to 1, pathLength=10 clamps to 6
      expect(hopsTooLow).toBeGreaterThanOrEqual(1);
      expect(hopsTooHigh).toBe(6);
    });
  });

  describe("calculateInfluenceMetric()", () => {
    it("should return minimal influence for no influence", () => {
      const influence = service.calculateInfluenceMetric(6, 0, 0);
      // Even with hops=6, there's a small base from hops factor: (7-6)/6 * 40 = 6.67
      expect(influence).toBeLessThan(10);
    });

    it("should increase with closer hops", () => {
      const influenceFar = service.calculateInfluenceMetric(6, 0, 0);
      const influenceClose = service.calculateInfluenceMetric(1, 0, 0);
      expect(influenceClose).toBeGreaterThan(influenceFar);
    });

    it("should increase with more followers", () => {
      const influenceNoFollowers = service.calculateInfluenceMetric(3, 0, 0);
      const influenceWithFollowers = service.calculateInfluenceMetric(
        3,
        500,
        0
      );
      expect(influenceWithFollowers).toBeGreaterThan(influenceNoFollowers);
    });

    it("should increase with higher engagement", () => {
      const influenceNoEngagement = service.calculateInfluenceMetric(3, 100, 0);
      const influenceWithEngagement = service.calculateInfluenceMetric(
        3,
        100,
        0.5
      );
      expect(influenceWithEngagement).toBeGreaterThan(influenceNoEngagement);
    });

    it("should cap at 100", () => {
      const influence = service.calculateInfluenceMetric(1, 10000, 1);
      expect(influence).toBeLessThanOrEqual(100);
    });
  });

  describe("calculateReliabilityMetric()", () => {
    it("should return 0 for no actions", () => {
      const reliability = service.calculateReliabilityMetric(0, 0, 0);
      expect(reliability).toBe(0);
    });

    it("should return 100 for perfect success rate and consistency", () => {
      const reliability = service.calculateReliabilityMetric(100, 100, 1);
      expect(reliability).toBe(100);
    });

    it("should calculate success rate", () => {
      const reliability50 = service.calculateReliabilityMetric(50, 100, 0);
      const reliability100 = service.calculateReliabilityMetric(100, 100, 0);
      expect(reliability100).toBeGreaterThan(reliability50);
    });

    it("should add consistency bonus", () => {
      const reliabilityNoConsistency = service.calculateReliabilityMetric(
        50,
        100,
        0
      );
      const reliabilityWithConsistency = service.calculateReliabilityMetric(
        50,
        100,
        0.5
      );
      expect(reliabilityWithConsistency).toBeGreaterThan(
        reliabilityNoConsistency
      );
    });

    it("should cap at 100", () => {
      const reliability = service.calculateReliabilityMetric(200, 100, 2);
      expect(reliability).toBeLessThanOrEqual(100);
    });
  });

  describe("calculateRecencyMetric()", () => {
    it("should return 100 for recent activity (0-30 days)", () => {
      const recency = service.calculateRecencyMetric(15);
      expect(recency).toBe(100);
    });

    it("should return 80 for activity within 60 days", () => {
      const recency = service.calculateRecencyMetric(45);
      expect(recency).toBe(80);
    });

    it("should return 60 for activity within 90 days", () => {
      const recency = service.calculateRecencyMetric(75);
      expect(recency).toBe(60);
    });

    it("should return 40 for activity within 180 days", () => {
      const recency = service.calculateRecencyMetric(120);
      expect(recency).toBe(40);
    });

    it("should return 0 for old activity (>180 days)", () => {
      const recency = service.calculateRecencyMetric(200);
      expect(recency).toBe(0);
    });

    it("should handle boundary cases", () => {
      expect(service.calculateRecencyMetric(30)).toBe(100);
      expect(service.calculateRecencyMetric(31)).toBe(80);
      expect(service.calculateRecencyMetric(60)).toBe(80);
      expect(service.calculateRecencyMetric(61)).toBe(60);
    });
  });

  describe("calculateCompositeScore()", () => {
    it("should calculate weighted composite score", () => {
      const metrics: TrustMetrics = {
        rank: 80,
        followers: 500,
        hops: 2,
        influence: 75,
        reliability: 85,
        recency: 90,
        compositeScore: 0,
      };

      const composite = service.calculateCompositeScore(metrics);
      expect(composite).toBeGreaterThan(0);
      expect(composite).toBeLessThanOrEqual(100);
    });

    it("should apply correct weights", () => {
      // Test with all metrics at 100
      const metricsHigh: TrustMetrics = {
        rank: 100,
        followers: 1000,
        hops: 1,
        influence: 100,
        reliability: 100,
        recency: 100,
        compositeScore: 0,
      };

      const compositeHigh = service.calculateCompositeScore(metricsHigh);
      expect(compositeHigh).toBe(100);
    });

    it("should handle zero metrics", () => {
      const metricsZero: TrustMetrics = {
        rank: 0,
        followers: 0,
        hops: 6,
        influence: 0,
        reliability: 0,
        recency: 0,
        compositeScore: 0,
      };

      const compositeZero = service.calculateCompositeScore(metricsZero);
      // Even with all zeros, hops=6 contributes a small amount (1/6 * 0.15 = 0.025 * 100 ≈ 2)
      expect(compositeZero).toBeLessThanOrEqual(5);
    });

    it("should normalize followers to 0-100 scale", () => {
      const metrics1: TrustMetrics = {
        rank: 50,
        followers: 500,
        hops: 3,
        influence: 50,
        reliability: 50,
        recency: 50,
        compositeScore: 0,
      };

      const metrics2: TrustMetrics = {
        rank: 50,
        followers: 1000,
        hops: 3,
        influence: 50,
        reliability: 50,
        recency: 50,
        compositeScore: 0,
      };

      const composite1 = service.calculateCompositeScore(metrics1);
      const composite2 = service.calculateCompositeScore(metrics2);
      expect(composite2).toBeGreaterThan(composite1);
    });

    it("should normalize hops inversely", () => {
      const metricsClose: TrustMetrics = {
        rank: 50,
        followers: 100,
        hops: 1,
        influence: 50,
        reliability: 50,
        recency: 50,
        compositeScore: 0,
      };

      const metricsFar: TrustMetrics = {
        rank: 50,
        followers: 100,
        hops: 6,
        influence: 50,
        reliability: 50,
        recency: 50,
        compositeScore: 0,
      };

      const compositeClose = service.calculateCompositeScore(metricsClose);
      const compositeFar = service.calculateCompositeScore(metricsFar);
      expect(compositeClose).toBeGreaterThan(compositeFar);
    });
  });

  describe("calculateAllMetrics()", () => {
    it("should calculate all metrics from input", () => {
      const input: MetricCalculationInput = {
        userId: "user-1",
        targetUserId: "user-2",
        trustScore: 75,
        contactCount: 100,
        attestationCount: 5,
        lastActivityDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        successCount: 90,
        totalActionCount: 100,
      };

      const metrics = service.calculateAllMetrics(input);

      expect(metrics.rank).toBeGreaterThan(0);
      expect(metrics.followers).toBe(100);
      expect(metrics.hops).toBeGreaterThanOrEqual(1);
      expect(metrics.hops).toBeLessThanOrEqual(6);
      expect(metrics.influence).toBeGreaterThanOrEqual(0);
      expect(metrics.influence).toBeLessThanOrEqual(100);
      expect(metrics.reliability).toBeGreaterThanOrEqual(0);
      expect(metrics.reliability).toBeLessThanOrEqual(100);
      expect(metrics.recency).toBeGreaterThanOrEqual(0);
      expect(metrics.recency).toBeLessThanOrEqual(100);
      expect(metrics.compositeScore).toBeGreaterThanOrEqual(0);
      expect(metrics.compositeScore).toBeLessThanOrEqual(100);
    });

    it("should handle minimal input", () => {
      const input: MetricCalculationInput = {
        userId: "user-1",
        targetUserId: "user-2",
      };

      const metrics = service.calculateAllMetrics(input);

      expect(metrics.rank).toBeDefined();
      expect(metrics.followers).toBe(0);
      expect(metrics.hops).toBe(6);
      expect(metrics.influence).toBeDefined();
      expect(metrics.reliability).toBe(0);
      // Default lastActivityDate is 180 days ago, which gives recency=40
      expect(metrics.recency).toBe(40);
      expect(metrics.compositeScore).toBeDefined();
    });

    it("should handle null/undefined values gracefully", () => {
      const input: MetricCalculationInput = {
        userId: "user-1",
        targetUserId: "user-2",
        trustScore: undefined,
        contactCount: undefined,
        attestationCount: undefined,
        lastActivityDate: undefined,
        successCount: undefined,
        totalActionCount: undefined,
      };

      const metrics = service.calculateAllMetrics(input);

      expect(metrics.rank).toBeDefined();
      expect(metrics.followers).toBe(0);
      expect(metrics.hops).toBe(6);
      expect(metrics.influence).toBeDefined();
      expect(metrics.reliability).toBe(0);
      // Default lastActivityDate is 180 days ago, which gives recency=40
      expect(metrics.recency).toBe(40);
      expect(metrics.compositeScore).toBeDefined();
    });

    it("should produce consistent results", () => {
      const input: MetricCalculationInput = {
        userId: "user-1",
        targetUserId: "user-2",
        trustScore: 75,
        contactCount: 100,
        attestationCount: 5,
      };

      const metrics1 = service.calculateAllMetrics(input);
      const metrics2 = service.calculateAllMetrics(input);

      expect(metrics1.rank).toBe(metrics2.rank);
      expect(metrics1.followers).toBe(metrics2.followers);
      expect(metrics1.hops).toBe(metrics2.hops);
      expect(metrics1.influence).toBe(metrics2.influence);
      expect(metrics1.reliability).toBe(metrics2.reliability);
      expect(metrics1.compositeScore).toBe(metrics2.compositeScore);
    });
  });

  describe("Integration Tests", () => {
    it("should calculate realistic trust profile", () => {
      const input: MetricCalculationInput = {
        userId: "user-1",
        targetUserId: "user-2",
        trustScore: 85,
        contactCount: 250,
        attestationCount: 8,
        lastActivityDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        successCount: 95,
        totalActionCount: 100,
      };

      const metrics = service.calculateAllMetrics(input);

      // Verify all metrics are in valid ranges
      expect(metrics.rank).toBeGreaterThan(50);
      expect(metrics.followers).toBe(250);
      expect(metrics.hops).toBeLessThanOrEqual(2);
      // Influence with 250 followers and hops=2: (5/6)*40 + (250/1000)*30 + 0 ≈ 33 + 7.5 = 40-50
      expect(metrics.influence).toBeGreaterThan(40);
      // Reliability with 95/100 success: (95/100)*60 = 57
      expect(metrics.reliability).toBeGreaterThan(50);
      expect(metrics.recency).toBe(100);
      expect(metrics.compositeScore).toBeGreaterThan(70);
    });

    it("should calculate low-trust profile", () => {
      const input: MetricCalculationInput = {
        userId: "user-1",
        targetUserId: "user-2",
        trustScore: 20,
        contactCount: 5,
        attestationCount: 0,
        lastActivityDate: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // 200 days ago
        successCount: 30,
        totalActionCount: 100,
      };

      const metrics = service.calculateAllMetrics(input);

      // Verify low trust metrics
      expect(metrics.rank).toBeLessThan(50);
      expect(metrics.followers).toBe(5);
      // With contactCount=5, hops will be 2 (mutual connections)
      expect(metrics.hops).toBeLessThanOrEqual(2);
      // Influence with 5 followers and hops=2: (5/6)*40 + (5/1000)*30 ≈ 33 + 0.15 = 33-40
      expect(metrics.influence).toBeLessThanOrEqual(40);
      expect(metrics.reliability).toBeLessThan(50);
      expect(metrics.recency).toBe(0);
      // Composite score with low metrics but hops=2 contribution: ~31
      expect(metrics.compositeScore).toBeLessThanOrEqual(35);
    });
  });
});
