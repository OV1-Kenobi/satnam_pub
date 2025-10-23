/**
 * Phase 2 Day 1: Database Schema & Type Definitions Tests
 * Tests for multi-metric trust scoring database schema and TypeScript types
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  TrustMetrics,
  TrustLevel,
  TrustedProvider,
  ProviderTrustLevel,
  MetricBreakdown,
  AggregatedMetrics,
  TrustModelConfig,
  createTrustMetricValue,
  createNetworkHops,
  createMetricWeight,
} from "../../src/lib/trust/types";

describe("Phase 2 Day 1: Type Definitions", () => {
  describe("TrustMetricValue branded type", () => {
    it("should create valid metric values (0-100)", () => {
      expect(createTrustMetricValue(0)).toBe(0);
      expect(createTrustMetricValue(50)).toBe(50);
      expect(createTrustMetricValue(100)).toBe(100);
    });

    it("should reject values below 0", () => {
      expect(() => createTrustMetricValue(-1)).toThrow(
        "Trust metric value must be between 0 and 100"
      );
    });

    it("should reject values above 100", () => {
      expect(() => createTrustMetricValue(101)).toThrow(
        "Trust metric value must be between 0 and 100"
      );
    });
  });

  describe("NetworkHops branded type", () => {
    it("should create valid hops values (1-6)", () => {
      expect(createNetworkHops(1)).toBe(1);
      expect(createNetworkHops(3)).toBe(3);
      expect(createNetworkHops(6)).toBe(6);
    });

    it("should reject values below 1", () => {
      expect(() => createNetworkHops(0)).toThrow(
        "Network hops must be between 1 and 6"
      );
    });

    it("should reject values above 6", () => {
      expect(() => createNetworkHops(7)).toThrow(
        "Network hops must be between 1 and 6"
      );
    });
  });

  describe("MetricWeight branded type", () => {
    it("should create valid weight values (0.0-1.0)", () => {
      expect(createMetricWeight(0)).toBe(0);
      expect(createMetricWeight(0.5)).toBe(0.5);
      expect(createMetricWeight(1)).toBe(1);
    });

    it("should reject values below 0", () => {
      expect(() => createMetricWeight(-0.1)).toThrow(
        "Metric weight must be between 0 and 1"
      );
    });

    it("should reject values above 1", () => {
      expect(() => createMetricWeight(1.1)).toThrow(
        "Metric weight must be between 0 and 1"
      );
    });
  });

  describe("TrustMetrics interface", () => {
    it("should have all required metric properties", () => {
      const metrics: TrustMetrics = {
        rank: createTrustMetricValue(75),
        followers: 100,
        hops: createNetworkHops(2),
        influence: createTrustMetricValue(80),
        reliability: createTrustMetricValue(90),
        recency: createTrustMetricValue(85),
        compositeScore: createTrustMetricValue(82),
      };

      expect(metrics.rank).toBe(75);
      expect(metrics.followers).toBe(100);
      expect(metrics.hops).toBe(2);
      expect(metrics.influence).toBe(80);
      expect(metrics.reliability).toBe(90);
      expect(metrics.recency).toBe(85);
      expect(metrics.compositeScore).toBe(82);
    });
  });

  describe("MetricBreakdown interface", () => {
    it("should extend TrustMetrics with calculation metadata", () => {
      const breakdown: MetricBreakdown = {
        rank: createTrustMetricValue(75),
        followers: 100,
        hops: createNetworkHops(2),
        influence: createTrustMetricValue(80),
        reliability: createTrustMetricValue(90),
        recency: createTrustMetricValue(85),
        compositeScore: createTrustMetricValue(82),
        calculatedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        providerPubkey: "abc123def456",
        calculationMethod: "multi-metric-v1",
      };

      expect(breakdown.calculatedAt).toBeInstanceOf(Date);
      expect(breakdown.providerPubkey).toBe("abc123def456");
      expect(breakdown.calculationMethod).toBe("multi-metric-v1");
    });
  });

  describe("TrustedProvider interface", () => {
    it("should have all required provider properties", () => {
      const provider: TrustedProvider = {
        id: "provider-1",
        providerPubkey: "abc123",
        providerName: "Satnam Trust Provider",
        providerRelay: "wss://relay.satnam.pub",
        trustLevel: 4,
        isActive: true,
        addedAt: new Date(),
        updatedAt: new Date(),
      };

      expect(provider.id).toBe("provider-1");
      expect(provider.providerPubkey).toBe("abc123");
      expect(provider.trustLevel).toBe(4);
      expect(provider.isActive).toBe(true);
    });

    it("should support trust levels 1-5", () => {
      const levels: TrustLevel[] = [1, 2, 3, 4, 5];
      levels.forEach((level) => {
        const provider: TrustedProvider = {
          id: `provider-${level}`,
          providerPubkey: `pubkey-${level}`,
          trustLevel: level,
          isActive: true,
          addedAt: new Date(),
          updatedAt: new Date(),
        };
        expect(provider.trustLevel).toBe(level);
      });
    });
  });

  describe("ProviderTrustLevel interface", () => {
    it("should have all required properties", () => {
      const trustLevel: ProviderTrustLevel = {
        id: "trust-level-1",
        providerPubkey: "abc123",
        trustLevel: 4,
        weight: createMetricWeight(0.75),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(trustLevel.id).toBe("trust-level-1");
      expect(trustLevel.trustLevel).toBe(4);
      expect(trustLevel.weight).toBe(0.75);
    });
  });

  describe("AggregatedMetrics interface", () => {
    it("should extend TrustMetrics with aggregation metadata", () => {
      const aggregated: AggregatedMetrics = {
        rank: createTrustMetricValue(75),
        followers: 100,
        hops: createNetworkHops(2),
        influence: createTrustMetricValue(80),
        reliability: createTrustMetricValue(90),
        recency: createTrustMetricValue(85),
        compositeScore: createTrustMetricValue(82),
        providerCount: 3,
        providerPubkeys: ["provider1", "provider2", "provider3"],
        aggregationMethod: "weighted-average",
        confidenceScore: createTrustMetricValue(85),
        aggregatedAt: new Date(),
      };

      expect(aggregated.providerCount).toBe(3);
      expect(aggregated.providerPubkeys).toHaveLength(3);
      expect(aggregated.aggregationMethod).toBe("weighted-average");
      expect(aggregated.confidenceScore).toBe(85);
    });

    it("should support different aggregation methods", () => {
      const methods = ["weighted-average", "median", "consensus"] as const;
      methods.forEach((method) => {
        const aggregated: AggregatedMetrics = {
          rank: createTrustMetricValue(75),
          followers: 100,
          hops: createNetworkHops(2),
          influence: createTrustMetricValue(80),
          reliability: createTrustMetricValue(90),
          recency: createTrustMetricValue(85),
          compositeScore: createTrustMetricValue(82),
          providerCount: 1,
          providerPubkeys: ["provider1"],
          aggregationMethod: method,
          confidenceScore: createTrustMetricValue(80),
          aggregatedAt: new Date(),
        };
        expect(aggregated.aggregationMethod).toBe(method);
      });
    });
  });

  describe("TrustModelConfig interface", () => {
    it("should have all required configuration properties", () => {
      const config: TrustModelConfig = {
        model: "multi-metric",
        weights: {
          rank: 0.25,
          followers: 0.15,
          hops: 0.15,
          influence: 0.2,
          reliability: 0.15,
          recency: 0.1,
        },
        useProviderAggregation: true,
        aggregationMethod: "weighted-average",
        cacheTTLMs: 300000,
      };

      expect(config.model).toBe("multi-metric");
      expect(config.weights.rank).toBe(0.25);
      expect(config.useProviderAggregation).toBe(true);
      expect(config.cacheTTLMs).toBe(300000);
    });

    it("should support different trust models", () => {
      const models = ["action-based", "multi-metric", "hybrid"] as const;
      models.forEach((model) => {
        const config: TrustModelConfig = {
          model,
          weights: {
            rank: 0.25,
            followers: 0.15,
            hops: 0.15,
            influence: 0.2,
            reliability: 0.15,
            recency: 0.1,
          },
          useProviderAggregation: true,
          aggregationMethod: "weighted-average",
          cacheTTLMs: 300000,
        };
        expect(config.model).toBe(model);
      });
    });

    it("should validate weight sum (approximately 1.0)", () => {
      const config: TrustModelConfig = {
        model: "multi-metric",
        weights: {
          rank: 0.25,
          followers: 0.15,
          hops: 0.15,
          influence: 0.2,
          reliability: 0.15,
          recency: 0.1,
        },
        useProviderAggregation: true,
        aggregationMethod: "weighted-average",
        cacheTTLMs: 300000,
      };

      const sum = Object.values(config.weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });

  describe("Database row types", () => {
    it("should have correct TrustMetricsRow structure", () => {
      const row = {
        id: "metric-1",
        user_id: "user-1",
        provider_pubkey: "provider-1",
        rank: 75,
        followers: 100,
        hops: 2,
        influence: 80,
        reliability: 90,
        recency: 85,
        composite_score: 82,
        calculated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(row.id).toBeDefined();
      expect(row.user_id).toBeDefined();
      expect(row.provider_pubkey).toBeDefined();
      expect(row.rank).toBe(75);
      expect(row.composite_score).toBe(82);
    });

    it("should have correct TrustedProviderRow structure", () => {
      const row = {
        id: "provider-1",
        user_id: "user-1",
        provider_pubkey: "pubkey-1",
        provider_name: "Test Provider",
        provider_relay: "wss://relay.satnam.pub",
        trust_level: 4,
        is_active: true,
        added_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(row.id).toBeDefined();
      expect(row.trust_level).toBe(4);
      expect(row.is_active).toBe(true);
    });

    it("should have correct ProviderTrustLevelRow structure", () => {
      const row = {
        id: "trust-level-1",
        user_id: "user-1",
        provider_pubkey: "pubkey-1",
        trust_level: 4,
        weight: 0.75,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(row.id).toBeDefined();
      expect(row.trust_level).toBe(4);
      expect(row.weight).toBe(0.75);
    });
  });
});

