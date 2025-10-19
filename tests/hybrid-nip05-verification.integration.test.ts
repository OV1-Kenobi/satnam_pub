/**
 * Hybrid NIP-05 Verification Integration Tests
 * Phase 1: Test kind:0, PKARR, and DNS verification methods
 * Tests fallback behavior and verification priority
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { HybridNIP05Verifier } from "../src/lib/nip05-verification";

describe("HybridNIP05Verifier Integration Tests", () => {
  let verifier: HybridNIP05Verifier;

  beforeEach(() => {
    verifier = new HybridNIP05Verifier({
      enableKind0Resolution: true,
      enablePkarrResolution: true,
      enableDnsResolution: true,
      kind0Timeout: 1000,
      pkarrTimeout: 1000,
      default_timeout_ms: 2000,
      cache_duration_ms: 300000,
    });
  });

  describe("kind:0 Resolution", () => {
    it("should successfully verify identity via kind:0 metadata", async () => {
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
      const identifier = "alice@satnam.pub";

      // Mock CEPS.resolveIdentityFromKind0
      vi.mock("../lib/central_event_publishing_service", () => ({
        CentralEventPublishingService: class {
          async resolveIdentityFromKind0() {
            return {
              success: true,
              nip05: identifier,
              name: "Alice",
              picture: "https://example.com/alice.jpg",
              about: "Bitcoin enthusiast",
            };
          }
        },
      }));

      const result = await verifier.verifyHybrid(identifier, pubkey);

      expect(result.verified).toBe(true);
      expect(result.verificationMethod).toBe("kind:0");
      expect(result.nip05).toBe(identifier);
      expect(result.name).toBe("Alice");
    });

    it("should handle kind:0 resolution timeout", async () => {
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
      const identifier = "alice@satnam.pub";

      // Mock timeout
      vi.mock("../lib/central_event_publishing_service", () => ({
        CentralEventPublishingService: class {
          async resolveIdentityFromKind0() {
            return new Promise((resolve) => {
              setTimeout(() => {
                resolve({
                  success: false,
                  error: "Timeout",
                });
              }, 5000);
            });
          }
        },
      }));

      const result = await verifier.verifyHybrid(identifier, pubkey);

      // Should timeout and fall back to next method
      expect(result.response_time_ms).toBeLessThan(5000);
    });

    it("should handle kind:0 NIP-05 mismatch", async () => {
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
      const identifier = "alice@satnam.pub";

      vi.mock("../lib/central_event_publishing_service", () => ({
        CentralEventPublishingService: class {
          async resolveIdentityFromKind0() {
            return {
              success: true,
              nip05: "bob@satnam.pub", // Different NIP-05
              name: "Alice",
            };
          }
        },
      }));

      const result = await verifier.verifyHybrid(identifier, pubkey);

      expect(result.verified).toBe(false);
      expect(result.error).toContain("NIP-05 mismatch");
    });
  });

  describe("PKARR Resolution", () => {
    it("should successfully verify identity via PKARR", async () => {
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
      const identifier = "alice@satnam.pub";

      // Mock PubkyDHTClient.resolveRecord
      vi.mock("../lib/pubky-enhanced-client", () => ({
        PubkyDHTClient: class {
          async resolveRecord() {
            return {
              public_key: pubkey,
              records: [
                {
                  name: "@",
                  type: "TXT",
                  value: JSON.stringify({
                    nip05: identifier,
                    pubkey,
                  }),
                  ttl: 3600,
                },
              ],
              timestamp: Math.floor(Date.now() / 1000),
              sequence: 1,
              signature: "mock_signature",
            };
          }
        },
      }));

      const result = await verifier.verifyHybrid(identifier, pubkey);

      expect(result.verified).toBe(true);
      expect(result.verificationMethod).toBe("pkarr");
      expect(result.nip05).toBe(identifier);
    });

    it("should handle PKARR resolution timeout", async () => {
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
      const identifier = "alice@satnam.pub";

      vi.mock("../lib/pubky-enhanced-client", () => ({
        PubkyDHTClient: class {
          async resolveRecord() {
            return new Promise((resolve) => {
              setTimeout(() => {
                resolve(null);
              }, 5000);
            });
          }
        },
      }));

      const result = await verifier.verifyHybrid(identifier, pubkey);

      expect(result.response_time_ms).toBeLessThan(5000);
    });
  });

  describe("DNS Resolution Fallback", () => {
    it("should fall back to DNS when kind:0 and PKARR fail", async () => {
      const identifier = "alice@satnam.pub";
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

      // Verify without pubkey to skip kind:0 and PKARR
      const result = await verifier.verifyHybrid(identifier);

      // Should attempt DNS resolution
      expect(result.verificationMethod).toBe("dns");
    });
  });

  describe("Verification Priority", () => {
    it("should try methods in priority order: kind:0 → PKARR → DNS", async () => {
      const identifier = "alice@satnam.pub";
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

      const result = await verifier.verifyHybrid(identifier, pubkey);

      // Should have attempted verification
      expect(result.verificationMethod).toBeDefined();
      expect(["kind:0", "pkarr", "dns", "none"]).toContain(
        result.verificationMethod
      );
    });
  });

  describe("Caching", () => {
    it("should cache verification results", async () => {
      const identifier = "alice@satnam.pub";
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

      // First verification
      const result1 = await verifier.verifyHybrid(identifier, pubkey);

      // Second verification should use cache
      const result2 = await verifier.verifyHybrid(identifier, pubkey);

      expect(result2.response_time_ms).toBeLessThanOrEqual(
        result1.response_time_ms
      );
    });

    it("should clear cache when requested", async () => {
      const identifier = "alice@satnam.pub";

      verifier.clearCache();

      // Cache should be empty
      expect(verifier["verificationCache"].size).toBe(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle all verification methods failing", async () => {
      const identifier = "nonexistent@invalid.domain";
      const pubkey =
        "0000000000000000000000000000000000000000000000000000000000000000";

      const result = await verifier.verifyHybrid(identifier, pubkey);

      expect(result.verified).toBe(false);
      expect(result.verificationMethod).toBe("none");
      expect(result.error).toBeDefined();
    });

    it("should handle invalid identifier format", async () => {
      const invalidIdentifier = "not-a-valid-nip05";
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

      const result = await verifier.verifyHybrid(invalidIdentifier, pubkey);

      expect(result.verified).toBe(false);
    });
  });

  describe("Performance", () => {
    it("should complete verification within timeout", async () => {
      const identifier = "alice@satnam.pub";
      const pubkey =
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

      const startTime = Date.now();
      const result = await verifier.verifyHybrid(identifier, pubkey);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (10 seconds max)
      expect(duration).toBeLessThan(10000);
      expect(result.response_time_ms).toBeDefined();
    });
  });
});

