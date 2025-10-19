/**
 * Hybrid Verification Performance Benchmarking Tests
 * Phase 1: Measure verification method performance and response times
 * Tests caching efficiency and relay connectivity
 */

import { describe, it, expect, beforeEach } from "vitest";
import { HybridNIP05Verifier } from "../src/lib/nip05-verification";

interface PerformanceMetrics {
  method: string;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  successRate: number;
  cacheHitRate: number;
}

describe("Hybrid Verification Performance Benchmarks", () => {
  let verifier: HybridNIP05Verifier;
  const metrics: Map<string, number[]> = new Map();

  beforeEach(() => {
    verifier = new HybridNIP05Verifier({
      enableKind0Resolution: true,
      enablePkarrResolution: true,
      enableDnsResolution: true,
      kind0Timeout: 3000,
      pkarrTimeout: 3000,
      default_timeout_ms: 5000,
      cache_duration_ms: 300000,
    });
    metrics.clear();
  });

  describe("kind:0 Resolution Performance", () => {
    it("should measure kind:0 resolution response time", async () => {
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
      const identifier = "alice@satnam.pub";
      const iterations = 5;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const result = await verifier.verifyHybrid(identifier, pubkey);
        const duration = Date.now() - startTime;

        if (result.verificationMethod === "kind:0") {
          responseTimes.push(result.response_time_ms);
        }
      }

      if (responseTimes.length > 0) {
        const avgTime =
          responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        console.log(`kind:0 average response time: ${avgTime}ms`);
        expect(avgTime).toBeLessThan(3000); // Should be under timeout
      }
    });

    it("should measure kind:0 timeout behavior", async () => {
      const pubkey =
        "0000000000000000000000000000000000000000000000000000000000000000";
      const identifier = "nonexistent@invalid.domain";

      const startTime = Date.now();
      const result = await verifier.verifyHybrid(identifier, pubkey);
      const duration = Date.now() - startTime;

      console.log(`kind:0 timeout duration: ${duration}ms`);
      expect(duration).toBeLessThan(4000); // Should timeout quickly
    });
  });

  describe("PKARR Resolution Performance", () => {
    it("should measure PKARR resolution response time", async () => {
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
      const identifier = "alice@satnam.pub";
      const iterations = 5;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const result = await verifier.verifyHybrid(identifier, pubkey);

        if (result.verificationMethod === "pkarr") {
          responseTimes.push(result.response_time_ms);
        }
      }

      if (responseTimes.length > 0) {
        const avgTime =
          responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        console.log(`PKARR average response time: ${avgTime}ms`);
        expect(avgTime).toBeLessThan(3000); // Should be under timeout
      }
    });
  });

  describe("DNS Resolution Performance", () => {
    it("should measure DNS resolution response time", async () => {
      const identifier = "alice@satnam.pub";
      const iterations = 3;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const result = await verifier.verifyHybrid(identifier);

        if (result.verificationMethod === "dns") {
          responseTimes.push(result.response_time_ms);
        }
      }

      if (responseTimes.length > 0) {
        const avgTime =
          responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        console.log(`DNS average response time: ${avgTime}ms`);
        expect(avgTime).toBeLessThan(5000); // Should be under timeout
      }
    });
  });

  describe("Caching Performance", () => {
    it("should demonstrate cache hit performance improvement", async () => {
      const identifier = "alice@satnam.pub";
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

      // First call (cache miss)
      const startTime1 = Date.now();
      const result1 = await verifier.verifyHybrid(identifier, pubkey);
      const duration1 = Date.now() - startTime1;

      // Second call (cache hit)
      const startTime2 = Date.now();
      const result2 = await verifier.verifyHybrid(identifier, pubkey);
      const duration2 = Date.now() - startTime2;

      console.log(`Cache miss: ${duration1}ms, Cache hit: ${duration2}ms`);

      // Cache hit should be significantly faster
      expect(duration2).toBeLessThan(duration1);
    });

    it("should measure cache efficiency", async () => {
      const identifiers = [
        "alice@satnam.pub",
        "bob@satnam.pub",
        "charlie@satnam.pub",
      ];
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

      const firstPassTimes: number[] = [];
      const secondPassTimes: number[] = [];

      // First pass
      for (const identifier of identifiers) {
        const startTime = Date.now();
        await verifier.verifyHybrid(identifier, pubkey);
        firstPassTimes.push(Date.now() - startTime);
      }

      // Second pass (should hit cache)
      for (const identifier of identifiers) {
        const startTime = Date.now();
        await verifier.verifyHybrid(identifier, pubkey);
        secondPassTimes.push(Date.now() - startTime);
      }

      const avgFirstPass =
        firstPassTimes.reduce((a, b) => a + b, 0) / firstPassTimes.length;
      const avgSecondPass =
        secondPassTimes.reduce((a, b) => a + b, 0) / secondPassTimes.length;

      console.log(
        `First pass avg: ${avgFirstPass}ms, Second pass avg: ${avgSecondPass}ms`
      );

      // Second pass should be faster due to caching
      expect(avgSecondPass).toBeLessThan(avgFirstPass);
    });
  });

  describe("Verification Method Comparison", () => {
    it("should compare response times across all methods", async () => {
      const identifier = "alice@satnam.pub";
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

      const methodTimes: Map<string, number[]> = new Map();

      for (let i = 0; i < 3; i++) {
        verifier.clearCache(); // Clear cache between iterations
        const result = await verifier.verifyHybrid(identifier, pubkey);

        if (!methodTimes.has(result.verificationMethod)) {
          methodTimes.set(result.verificationMethod, []);
        }
        methodTimes.get(result.verificationMethod)!.push(result.response_time_ms);
      }

      // Log comparison
      console.log("\n=== Verification Method Performance Comparison ===");
      for (const [method, times] of methodTimes) {
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const min = Math.min(...times);
        const max = Math.max(...times);
        console.log(
          `${method}: avg=${avg.toFixed(2)}ms, min=${min}ms, max=${max}ms`
        );
      }

      expect(methodTimes.size).toBeGreaterThan(0);
    });
  });

  describe("Concurrent Verification Performance", () => {
    it("should handle concurrent verification requests", async () => {
      const identifiers = [
        "alice@satnam.pub",
        "bob@satnam.pub",
        "charlie@satnam.pub",
        "diana@satnam.pub",
        "eve@satnam.pub",
      ];
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

      const startTime = Date.now();

      // Run all verifications concurrently
      const results = await Promise.all(
        identifiers.map((id) => verifier.verifyHybrid(id, pubkey))
      );

      const duration = Date.now() - startTime;

      console.log(
        `Concurrent verification of ${identifiers.length} identifiers: ${duration}ms`
      );

      expect(results).toHaveLength(identifiers.length);
      expect(duration).toBeLessThan(15000); // Should complete in reasonable time
    });
  });

  describe("Relay Connectivity Performance", () => {
    it("should measure relay response times", async () => {
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
      const identifier = "alice@satnam.pub";

      const result = await verifier.verifyHybrid(identifier, pubkey);

      console.log(`Verification response time: ${result.response_time_ms}ms`);
      console.log(`Verification method: ${result.verificationMethod}`);

      expect(result.response_time_ms).toBeDefined();
      expect(result.response_time_ms).toBeGreaterThanOrEqual(0);
    });
  });
});

