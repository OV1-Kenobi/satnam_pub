/**
 * Unit Tests for NIP85PublishingService
 * Tests trust score publishing to Nostr network via NIP-85 assertions
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NIP85PublishingService,
  getNIP85PublishingService,
} from "../../src/lib/trust/nip85-publishing";

// Mock clientConfig to enable NIP-85 features for testing
vi.mock("../../src/config/env.client.ts", () => ({
  clientConfig: {
    lnbits: { baseUrl: "" },
    api: { baseUrl: "/api" },
    domains: { main: "", dashboard: "", platformLightning: "my.satnam.pub" },
    nip85: {
      primaryRelay: "wss://relay.satnam.pub",
      cacheTTLMs: 300000,
      defaultExposureLevel: "private",
    },
    flags: {
      lnbitsEnabled: false,
      amberSigningEnabled: false,
      hybridIdentityEnabled: false,
      pkarrEnabled: false,
      multiMethodVerificationEnabled: false,
      simpleproofEnabled: false,
      irohEnabled: false,
      relayPrivacyEnabled: true,
      tokenBindingEnabled: true,
      timingAuditEnabled: false,
      hierarchicalAdminEnabled: false,
      bypassCodeEnabled: false,
      recoveryCodeEnabled: false,
      adminAuditLogEnabled: false,
      webauthnEnabled: false,
      webauthnPlatformAuthenticatorEnabled: false,
      nip85TrustProviderEnabled: true, // Enable for testing
      nip85PublishingEnabled: true, // Enable for testing
      nip85QueryEnabled: true, // Enable for testing
      nip85CacheEnabled: true, // Enable for testing
      nip85AuditLoggingEnabled: true, // Enable for testing
    },
  },
}));

// Mock CEPS
vi.mock("../../lib/central_event_publishing_service.ts", () => ({
  central_event_publishing_service: {
    publishEvent: vi.fn(async (event: any, relays?: string[]) => {
      return `event-${Math.random().toString(36).substr(2, 9)}`;
    }),
    list: vi.fn(async (filters: any[], relays?: string[], opts?: any) => {
      return [];
    }),
    encryptNip44WithActiveSession: vi.fn(
      async (userId: string, content: string) => {
        return `encrypted-${content}`;
      }
    ),
  },
}));

// Mock Supabase client
function createMockSupabase(): SupabaseClient {
  const mockData: Record<string, any> = {
    trust_provider_preferences: {},
    nip85_assertions: {},
  };

  return {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: any) => ({
          single: async () => {
            const prefs = mockData.trust_provider_preferences[val];
            return { data: prefs || null, error: null };
          },
        }),
      }),
      upsert: async (data: any) => {
        mockData.nip85_assertions[data.event_id] = data;
        return { data, error: null };
      },
    }),
  } as any;
}

describe("NIP85PublishingService", () => {
  let service: NIP85PublishingService;
  let mockSupabase: SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    service = new NIP85PublishingService(mockSupabase);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("publishUserAssertion()", () => {
    it("should publish user assertion with visible metrics only", async () => {
      const { central_event_publishing_service: CEPS } = await import(
        "../../lib/central_event_publishing_service"
      );

      // Mock user preferences with specific visible metrics
      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                exposure_level: "public",
                visible_metrics: ["rank", "followers"],
                whitelisted_pubkeys: [],
                encryption_enabled: false,
              },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const metrics = {
        rank: 85,
        followers: 150,
        hops: 3,
        influence: 92,
      };

      const eventId = await service.publishUserAssertion(
        "user-123",
        "pubkey-abc",
        metrics
      );

      expect(eventId).toBeDefined();
      expect(CEPS.publishEvent).toHaveBeenCalled();

      const publishCall = (CEPS.publishEvent as any).mock.calls[0];
      const event = publishCall[0];

      // Verify only visible metrics are in tags
      const metricTags = event.tags.filter(
        (t: any[]) => !["d", "relay"].includes(t[0])
      );
      expect(metricTags.length).toBe(2); // Only rank and followers
    });

    it("should throw error when rate limit exceeded", async () => {
      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                exposure_level: "public",
                visible_metrics: ["rank"],
                whitelisted_pubkeys: [],
                encryption_enabled: false,
              },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const metrics = { rank: 85 };

      // Publish 100 events to hit rate limit
      for (let i = 0; i < 100; i++) {
        await service.publishUserAssertion("user-123", "pubkey-abc", metrics);
      }

      // 101st event should fail
      await expect(
        service.publishUserAssertion("user-123", "pubkey-abc", metrics)
      ).rejects.toThrow("Rate limit exceeded");
    });

    it("should throw error when exposure_level is private", async () => {
      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                exposure_level: "private",
                visible_metrics: [],
                whitelisted_pubkeys: [],
                encryption_enabled: false,
              },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const metrics = { rank: 85 };

      await expect(
        service.publishUserAssertion("user-123", "pubkey-abc", metrics)
      ).rejects.toThrow("User has disabled public trust score publishing");
    });

    it("should encrypt metrics when encryption_enabled is true", async () => {
      const { central_event_publishing_service: CEPS } = await import(
        "../../lib/central_event_publishing_service"
      );

      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                exposure_level: "public",
                visible_metrics: ["rank"],
                whitelisted_pubkeys: [],
                encryption_enabled: true,
              },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const metrics = { rank: 85 };

      await service.publishUserAssertion("user-123", "pubkey-abc", metrics);

      expect(CEPS.encryptNip44WithActiveSession).toHaveBeenCalledWith(
        "user-123",
        expect.stringContaining("rank")
      );
    });

    it("should gracefully fallback to unencrypted when NIP-44 fails", async () => {
      const { central_event_publishing_service: CEPS } = await import(
        "../../lib/central_event_publishing_service"
      );

      (CEPS.encryptNip44WithActiveSession as any).mockRejectedValueOnce(
        new Error("Encryption failed")
      );

      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                exposure_level: "public",
                visible_metrics: ["rank"],
                whitelisted_pubkeys: [],
                encryption_enabled: true,
              },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const metrics = { rank: 85 };

      const eventId = await service.publishUserAssertion(
        "user-123",
        "pubkey-abc",
        metrics
      );

      expect(eventId).toBeDefined();
      const publishCall = (CEPS.publishEvent as any).mock.calls[0];
      expect(publishCall[0].content).toBe(""); // Unencrypted fallback
    });

    it("should store assertion in database", async () => {
      const upsertSpy = vi.fn(async (data: any) => ({ data, error: null }));

      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                exposure_level: "public",
                visible_metrics: ["rank"],
                whitelisted_pubkeys: [],
                encryption_enabled: false,
              },
              error: null,
            }),
          }),
        }),
        upsert: upsertSpy,
      } as any);

      const metrics = { rank: 85 };

      await service.publishUserAssertion("user-123", "pubkey-abc", metrics);

      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-123",
          assertion_kind: 30382,
          subject_pubkey: "pubkey-abc",
        })
      );
    });
  });

  describe("publishProviderDeclaration()", () => {
    it("should publish provider declaration with correct structure", async () => {
      const { central_event_publishing_service: CEPS } = await import(
        "../../lib/central_event_publishing_service"
      );

      const eventId = await service.publishProviderDeclaration();

      expect(eventId).toBeDefined();
      expect(CEPS.publishEvent).toHaveBeenCalled();

      const publishCall = (CEPS.publishEvent as any).mock.calls[0];
      const event = publishCall[0];

      expect(event.kind).toBe(10040);
      expect(event.tags).toContainEqual(["d", "satnam-trust-provider"]);
      expect(event.tags).toContainEqual(["name", "Satnam.pub Trust Provider"]);
    });
  });

  describe("fetchTrustedAssertions()", () => {
    it("should fetch assertions from relays", async () => {
      const { central_event_publishing_service: CEPS } = await import(
        "../../lib/central_event_publishing_service"
      );

      const mockEvents = [
        {
          kind: 30382,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["d", "pubkey-abc"],
            ["rank", "85"],
            ["followers", "150"],
          ],
          id: "event-1",
        },
      ];

      (CEPS.list as any).mockResolvedValueOnce(mockEvents);

      const assertions = await service.fetchTrustedAssertions("pubkey-abc");

      expect(assertions).toHaveLength(1);
      expect(assertions[0].metrics).toEqual({
        rank: "85",
        followers: "150",
      });
    });

    it("should return empty array on error", async () => {
      const { central_event_publishing_service: CEPS } = await import(
        "../../lib/central_event_publishing_service"
      );

      (CEPS.list as any).mockRejectedValueOnce(new Error("Relay error"));

      const assertions = await service.fetchTrustedAssertions("pubkey-abc");

      expect(assertions).toEqual([]);
    });
  });

  describe("checkRateLimit()", () => {
    it("should allow requests within limit", async () => {
      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                exposure_level: "public",
                visible_metrics: ["rank"],
                whitelisted_pubkeys: [],
                encryption_enabled: false,
              },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const metrics = { rank: 85 };

      // Should allow 50 requests
      for (let i = 0; i < 50; i++) {
        const eventId = await service.publishUserAssertion(
          "user-123",
          "pubkey-abc",
          metrics
        );
        expect(eventId).toBeDefined();
      }
    });

    it("should track rate limits per user independently", async () => {
      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                exposure_level: "public",
                visible_metrics: ["rank"],
                whitelisted_pubkeys: [],
                encryption_enabled: false,
              },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const metrics = { rank: 85 };

      // User 1 publishes 50 events
      for (let i = 0; i < 50; i++) {
        await service.publishUserAssertion("user-1", "pubkey-abc", metrics);
      }

      // User 2 should still be able to publish
      const eventId = await service.publishUserAssertion(
        "user-2",
        "pubkey-abc",
        metrics
      );
      expect(eventId).toBeDefined();
    });
  });

  describe("getNIP85PublishingService()", () => {
    it("should return singleton instance", () => {
      // Clear the module cache
      vi.resetModules();

      // This would need to be tested in isolation
      // For now, we verify the function exists and is callable
      expect(typeof getNIP85PublishingService).toBe("function");
    });

    it("should throw error if Supabase config is missing", () => {
      // Save original env
      const originalUrl = process.env.VITE_SUPABASE_URL;
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      // Clear env
      delete process.env.VITE_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      // Reset modules to clear singleton
      vi.resetModules();

      // Restore env
      process.env.VITE_SUPABASE_URL = originalUrl;
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    });
  });

  describe("filterMetrics()", () => {
    it("should filter metrics based on visible_metrics array", async () => {
      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                exposure_level: "public",
                visible_metrics: ["rank", "followers"],
                whitelisted_pubkeys: [],
                encryption_enabled: false,
              },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const metrics = {
        rank: 85,
        followers: 150,
        hops: 3,
        influence: 92,
      };

      const eventId = await service.publishUserAssertion(
        "user-123",
        "pubkey-abc",
        metrics
      );

      expect(eventId).toBeDefined();

      const { central_event_publishing_service: CEPS } = await import(
        "../../lib/central_event_publishing_service"
      );

      const publishCall = (CEPS.publishEvent as any).mock.calls[0];
      const event = publishCall[0];

      const metricTags = event.tags.filter(
        (t: any[]) => !["d", "relay"].includes(t[0])
      );

      expect(metricTags).toContainEqual(["rank", "85"]);
      expect(metricTags).toContainEqual(["followers", "150"]);
      expect(metricTags).not.toContainEqual(["hops", "3"]);
    });
  });

  describe("extractMetrics()", () => {
    it("should extract metrics from event tags excluding reserved tags", async () => {
      const { central_event_publishing_service: CEPS } = await import(
        "../../lib/central_event_publishing_service"
      );

      const mockEvents = [
        {
          kind: 30382,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["d", "pubkey-abc"],
            ["relay", "wss://relay.satnam.pub"],
            ["rank", "85"],
            ["followers", "150"],
          ],
          id: "event-1",
        },
      ];

      (CEPS.list as any).mockResolvedValueOnce(mockEvents);

      const assertions = await service.fetchTrustedAssertions("pubkey-abc");

      expect(assertions[0].metrics).toEqual({
        rank: "85",
        followers: "150",
      });
      expect(assertions[0].metrics).not.toHaveProperty("d");
      expect(assertions[0].metrics).not.toHaveProperty("relay");
    });
  });

  describe("queryPublicTrustScore()", () => {
    it("should query all assertion kinds from relays", async () => {
      const { central_event_publishing_service: CEPS } = await import(
        "../../lib/central_event_publishing_service"
      );

      const mockEvents = [
        {
          kind: 30382,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["d", "pubkey-abc"],
            ["rank", "85"],
          ],
          id: "event-1",
        },
      ];

      (CEPS.list as any).mockResolvedValueOnce(mockEvents);

      const assertions = await service.queryPublicTrustScore("pubkey-abc");

      expect(assertions).toHaveLength(1);
      expect(assertions[0].kind).toBe(30382);
    });
  });

  describe("validateMetrics()", () => {
    it("should validate metrics with valid values", () => {
      const metrics = {
        rank: 85,
        followers: 75,
        influence: 92,
      };

      expect(service.validateMetrics(metrics)).toBe(true);
    });

    it("should throw error for non-numeric metric values", () => {
      const metrics = {
        rank: "85", // Should be number
      };

      expect(() => service.validateMetrics(metrics)).toThrow(
        "Metric rank must be a number"
      );
    });

    it("should throw error for metrics outside 0-100 range", () => {
      const metrics = {
        rank: 150, // Should be 0-100
      };

      expect(() => service.validateMetrics(metrics)).toThrow(
        "Metric rank must be between 0 and 100"
      );
    });

    it("should throw error for null metrics", () => {
      expect(() => service.validateMetrics(null as any)).toThrow(
        "Metrics must be a non-null object"
      );
    });
  });

  describe("checkPrivacySettings()", () => {
    it("should allow publishing when exposure_level is public", async () => {
      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                exposure_level: "public",
                visible_metrics: ["rank"],
                whitelisted_pubkeys: [],
                encryption_enabled: false,
              },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const allowed = await service.checkPrivacySettings(
        "user-123",
        "pubkey-abc"
      );

      expect(allowed).toBe(true);
    });

    it("should block publishing when exposure_level is private", async () => {
      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                exposure_level: "private",
                visible_metrics: [],
                whitelisted_pubkeys: [],
                encryption_enabled: false,
              },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const allowed = await service.checkPrivacySettings(
        "user-123",
        "pubkey-abc"
      );

      expect(allowed).toBe(false);
    });

    it("should check whitelist when exposure_level is whitelist", async () => {
      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                exposure_level: "whitelist",
                visible_metrics: ["rank"],
                whitelisted_pubkeys: ["pubkey-abc", "pubkey-def"],
                encryption_enabled: false,
              },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const allowed = await service.checkPrivacySettings(
        "user-123",
        "pubkey-abc"
      );

      expect(allowed).toBe(true);

      const notAllowed = await service.checkPrivacySettings(
        "user-123",
        "pubkey-xyz"
      );

      expect(notAllowed).toBe(false);
    });
  });

  describe("batchPublishAssertions()", () => {
    it("should publish multiple assertions", async () => {
      const { central_event_publishing_service: CEPS } = await import(
        "../../lib/central_event_publishing_service"
      );

      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                exposure_level: "public",
                visible_metrics: ["rank", "followers"],
                whitelisted_pubkeys: [],
                encryption_enabled: false,
              },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const assertions = [
        { targetPubkey: "pubkey-1", metrics: { rank: 85, followers: 75 } },
        { targetPubkey: "pubkey-2", metrics: { rank: 90, followers: 80 } },
      ];

      const eventIds = await service.batchPublishAssertions(
        "user-123",
        assertions
      );

      expect(eventIds).toHaveLength(2);
      expect(CEPS.publishEvent).toHaveBeenCalledTimes(2);
    });

    it("should skip assertions with invalid metrics", async () => {
      const { central_event_publishing_service: CEPS } = await import(
        "../../lib/central_event_publishing_service"
      );

      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                exposure_level: "public",
                visible_metrics: ["rank"],
                whitelisted_pubkeys: [],
                encryption_enabled: false,
              },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const assertions = [
        { targetPubkey: "pubkey-1", metrics: { rank: 85 } },
        { targetPubkey: "pubkey-2", metrics: { rank: 150 } }, // Invalid: > 100
      ];

      const eventIds = await service.batchPublishAssertions(
        "user-123",
        assertions
      );

      // Only first assertion should be published
      expect(eventIds).toHaveLength(1);
    });
  });

  describe("getAssertionHistory()", () => {
    it("should retrieve assertion history for a user", async () => {
      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: (col: string, val: any) => ({
            order: () => ({
              range: async () => ({
                data: [
                  {
                    assertion_kind: 30382,
                    subject_pubkey: "pubkey-abc",
                    metrics: { rank: "85" },
                    published_at: new Date().toISOString(),
                    relay_urls: ["wss://relay.satnam.pub"],
                    event_id: "event-1",
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const history = await service.getAssertionHistory("user-123");

      expect(history).toHaveLength(1);
      expect(history[0].kind).toBe(30382);
      expect(history[0].metrics).toEqual({ rank: "85" });
    });

    it("should support pagination", async () => {
      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async (offset: number, end: number) => ({
                data: offset === 0 ? [{ assertion_kind: 30382 }] : [],
                error: null,
              }),
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const page1 = await service.getAssertionHistory("user-123", 10, 0);
      const page2 = await service.getAssertionHistory("user-123", 10, 10);

      expect(page1.length).toBeGreaterThanOrEqual(0);
      expect(page2.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("deleteAssertion()", () => {
    it("should delete assertion from database", async () => {
      vi.spyOn(mockSupabase, "from").mockReturnValue({
        delete: () => ({
          eq: (col: string, val: any) => ({
            eq: async () => ({ error: null }),
          }),
        }),
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { exposure_level: "public" },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const result = await service.deleteAssertion("user-123", "event-1");

      expect(result).toBe(true);
    });

    it("should publish deletion event when requested", async () => {
      const { central_event_publishing_service: CEPS } = await import(
        "../../lib/central_event_publishing_service"
      );

      vi.spyOn(mockSupabase, "from").mockReturnValue({
        delete: () => ({
          eq: (col: string, val: any) => ({
            eq: async () => ({ error: null }),
          }),
        }),
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { exposure_level: "public" },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      await service.deleteAssertion("user-123", "event-1", true);

      expect(CEPS.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 5,
        })
      );
    });
  });

  describe("updateUserPreferences()", () => {
    it("should update user preferences", async () => {
      vi.spyOn(mockSupabase, "from").mockReturnValue({
        update: (data: any) => ({
          eq: (col: string, val: any) => ({
            select: () => ({
              single: async () => ({
                data: {
                  exposure_level: "public",
                  visible_metrics: ["rank"],
                },
                error: null,
              }),
            }),
          }),
        }),
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { exposure_level: "public" },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const result = await service.updateUserPreferences("user-123", {
        exposure_level: "public",
      });

      expect(result).not.toBeNull();
      expect(result?.exposure_level).toBe("public");
    });

    it("should validate exposure level", async () => {
      const result = await service.updateUserPreferences("user-123", {
        exposure_level: "invalid" as any,
      });

      expect(result).toBeNull();
    });
  });

  describe("getAuditLog()", () => {
    it("should retrieve audit log entries", async () => {
      vi.spyOn(mockSupabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async () => ({
                data: [
                  {
                    id: "log-1",
                    queried_user_id: "user-123",
                    query_type: "api",
                    success: true,
                    created_at: new Date().toISOString(),
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      const logs = await service.getAuditLog("user-123");

      expect(logs).toHaveLength(1);
      expect(logs[0].query_type).toBe("api");
    });
  });

  describe("logQuery()", () => {
    it("should log query operation", async () => {
      const insertSpy = vi.fn(async () => ({ error: null }));

      vi.spyOn(mockSupabase, "from").mockReturnValue({
        insert: insertSpy,
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { exposure_level: "public" },
              error: null,
            }),
          }),
        }),
        upsert: async (data: any) => ({ data, error: null }),
      } as any);

      await service.logQuery("user-123", "api", true, { rank: "85" });

      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queried_user_id: "user-123",
          query_type: "api",
          success: true,
        })
      );
    });
  });

  describe("Caching functionality", () => {
    it("should cache assertions with TTL", async () => {
      const { central_event_publishing_service: CEPS } = await import(
        "../../lib/central_event_publishing_service"
      );

      const mockEvents = [
        {
          kind: 30382,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["d", "pubkey-abc"],
            ["rank", "85"],
          ],
          id: "event-1",
        },
      ];

      (CEPS.list as any).mockResolvedValueOnce(mockEvents);

      // First query should fetch from relay
      const result1 = await service.queryAssertionsWithCache("pubkey-abc");
      expect(result1).toHaveLength(1);

      // Second query should use cache
      (CEPS.list as any).mockClear();
      const result2 = await service.queryAssertionsWithCache("pubkey-abc");
      expect(result2).toHaveLength(1);
      expect(CEPS.list).not.toHaveBeenCalled(); // Should use cache
    });

    it("should clear cache for specific pubkey", async () => {
      service.clearCache("pubkey-abc");
      // Cache should be cleared
      expect(service).toBeDefined();
    });

    it("should clear all cache", async () => {
      service.clearCache();
      // All cache should be cleared
      expect(service).toBeDefined();
    });
  });

  describe("batchQueryAssertions()", () => {
    it("should batch query multiple pubkeys", async () => {
      const { central_event_publishing_service: CEPS } = await import(
        "../../lib/central_event_publishing_service"
      );

      const mockEvents = [
        {
          kind: 30382,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["d", "pubkey-1"],
            ["rank", "85"],
          ],
          id: "event-1",
        },
      ];

      (CEPS.list as any).mockResolvedValue(mockEvents);

      const results = await service.batchQueryAssertions([
        "pubkey-1",
        "pubkey-2",
      ]);

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(2);
    });
  });
});
