/**
 * Geo Room Service Tests - Phase 2
 *
 * Unit tests for Phase 2 geo-room messaging functionality.
 *
 * @module src/lib/geochat/__tests__/geo-room-service.test.ts
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import {
  publishGeoRoomMessage,
  subscribeToGeoRoom,
  mapGeoRoomErrorToMessage,
  getGeoRoomConfig,
} from "../geo-room-service";
import { GeoRoomError, DEFAULT_GEO_ROOM_CONFIG } from "../types";
import type { Event as NostrEvent } from "nostr-tools";

// Mock CEPS
const mockPublishEvent = vi.fn();
const mockSubscribeMany = vi.fn();
const mockClose = vi.fn();

vi.mock("../../../../lib/central_event_publishing_service", () => ({
  central_event_publishing_service: {
    publishEvent: (...args: unknown[]) => mockPublishEvent(...args),
    subscribeMany: (...args: unknown[]) => mockSubscribeMany(...args),
  },
  DEFAULT_UNIFIED_CONFIG: {
    relays: ["wss://fallback1.test", "wss://fallback2.test"],
  },
}));

// Mock GeoRelaySelector
const mockSelectForGeoRoom = vi.fn();
vi.mock("../../noise/geo-relay-selector", () => ({
  GeoRelaySelector: {
    getInstance: () => ({
      selectForGeoRoom: (...args: unknown[]) => mockSelectForGeoRoom(...args),
    }),
  },
}));

// Mock clientConfig
vi.mock("../../../config/env.client", () => ({
  clientConfig: {
    flags: {
      geochatEnabled: true,
      geochatLiveEnabled: true,
      geochatDefaultRelayCount: 3,
    },
  },
}));

describe("geo-room-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    mockSelectForGeoRoom.mockReturnValue([
      { relayUrl: "wss://relay1.test" },
      { relayUrl: "wss://relay2.test" },
    ]);
    mockPublishEvent.mockResolvedValue("event123");
    mockSubscribeMany.mockReturnValue({ close: mockClose });
  });

  describe("getGeoRoomConfig()", () => {
    it("should return config with correct event kind", () => {
      const config = getGeoRoomConfig();
      expect(config.eventKind).toBe(1); // kind 1 = short text note
    });

    it("should return config with maxRelaysPerGeoRoom from clientConfig", () => {
      const config = getGeoRoomConfig();
      expect(config.maxRelaysPerGeoRoom).toBe(3);
    });

    it("should include minHealthScore from default config", () => {
      const config = getGeoRoomConfig();
      expect(config.minHealthScore).toBe(
        DEFAULT_GEO_ROOM_CONFIG.minHealthScore
      );
    });
  });

  describe("publishGeoRoomMessage()", () => {
    it("should throw GeoRoomError for invalid geohash", async () => {
      await expect(
        publishGeoRoomMessage({
          geohash: "invalid!",
          content: "test",
          authorPubkey: "abc123",
        })
      ).rejects.toThrow(GeoRoomError);

      await expect(
        publishGeoRoomMessage({
          geohash: "",
          content: "test",
          authorPubkey: "abc123",
        })
      ).rejects.toThrow(GeoRoomError);
    });

    it("should throw GeoRoomError for empty content", async () => {
      await expect(
        publishGeoRoomMessage({
          geohash: "9q8yy",
          content: "",
          authorPubkey: "abc123",
        })
      ).rejects.toThrow(GeoRoomError);
    });

    it("should throw GeoRoomError for empty authorPubkey", async () => {
      await expect(
        publishGeoRoomMessage({
          geohash: "9q8yy",
          content: "test",
          authorPubkey: "",
        })
      ).rejects.toThrow(GeoRoomError);
    });

    it("should select relays via GeoRelaySelector", async () => {
      await publishGeoRoomMessage({
        geohash: "9q8yy",
        content: "Hello world",
        authorPubkey: "abc123def456",
      });

      expect(mockSelectForGeoRoom).toHaveBeenCalledWith("9q8yy", 1, 2);
    });

    it("should call CEPS.publishEvent with correct event", async () => {
      await publishGeoRoomMessage({
        geohash: "9Q8YY", // Test normalization
        content: "Hello world",
        authorPubkey: "abc123def456",
      });

      expect(mockPublishEvent).toHaveBeenCalled();
      const [event, relays] = mockPublishEvent.mock.calls[0] as [
        NostrEvent,
        string[]
      ];
      expect(event.kind).toBe(1); // kind 1 = short text note
      expect(event.content).toBe("Hello world");
      expect(event.pubkey).toBe("abc123def456");
      expect(event.tags).toContainEqual(["t", "#9q8yy"]);
      expect(relays).toEqual(["wss://relay1.test", "wss://relay2.test"]);
    });

    it("should return PublishGeoRoomMessageResult with eventId", async () => {
      const result = await publishGeoRoomMessage({
        geohash: "9q8yy",
        content: "Hello",
        authorPubkey: "abc123",
      });

      expect(result.eventId).toBe("event123");
      expect(result.usedFallbackRelays).toBe(false);
      expect(result.relays).toEqual(["wss://relay1.test", "wss://relay2.test"]);
    });

    it("should fall back to DEFAULT_UNIFIED_CONFIG.relays when selector fails", async () => {
      mockSelectForGeoRoom.mockImplementation(() => {
        throw new Error("Selector failed");
      });

      const result = await publishGeoRoomMessage({
        geohash: "9q8yy",
        content: "Hello",
        authorPubkey: "abc123",
      });

      expect(result.usedFallbackRelays).toBe(true);
      expect(result.relays).toContain("wss://fallback1.test");
    });

    it("should throw GeoRoomError with kind publish_failed on CEPS failure", async () => {
      mockPublishEvent.mockRejectedValue(new Error("CEPS failed"));

      try {
        await publishGeoRoomMessage({
          geohash: "9q8yy",
          content: "Hello",
          authorPubkey: "abc123",
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GeoRoomError);
        expect((error as GeoRoomError).kind).toBe("publish_failed");
      }
    });
  });

  describe("subscribeToGeoRoom()", () => {
    it("should throw GeoRoomError for invalid geohash", async () => {
      const onEvent = vi.fn();

      await expect(
        subscribeToGeoRoom({ geohash: "invalid!", onEvent })
      ).rejects.toThrow(GeoRoomError);
    });

    it("should select relays via GeoRelaySelector", async () => {
      const onEvent = vi.fn();

      await subscribeToGeoRoom({ geohash: "9q8yy", onEvent });

      expect(mockSelectForGeoRoom).toHaveBeenCalledWith("9q8yy", 1, 2);
    });

    it("should call CEPS.subscribeMany with correct filters", async () => {
      const onEvent = vi.fn();

      await subscribeToGeoRoom({ geohash: "9q8yy", onEvent });

      expect(mockSubscribeMany).toHaveBeenCalled();
      const [relays, filters] = mockSubscribeMany.mock.calls[0] as [
        string[],
        Array<{ kinds: number[]; "#t": string[] }>
      ];
      expect(relays).toEqual(["wss://relay1.test", "wss://relay2.test"]);
      expect(filters[0].kinds).toContain(1); // kind 1 = short text note
      expect(filters[0]["#t"]).toContain("#9q8yy");
    });

    it("should return GeoRoomSubscription with correct properties", async () => {
      const onEvent = vi.fn();

      const subscription = await subscribeToGeoRoom({
        geohash: "9q8yy",
        onEvent,
      });

      expect(subscription.activeGeohash).toBe("9q8yy");
      expect(subscription.isActive).toBe(true);
      expect(typeof subscription.unsubscribe).toBe("function");
      expect(typeof subscription.updateGeohash).toBe("function");
    });

    it("should fire onEvent callback when CEPS emits events", async () => {
      const onEvent = vi.fn();

      mockSubscribeMany.mockImplementation(
        (
          _relays: string[],
          _filters: unknown[],
          handlers: { onevent: (event: NostrEvent) => void }
        ) => {
          // Simulate receiving an event
          setTimeout(() => {
            handlers.onevent({
              id: "test-id",
              content: "test message",
              kind: 42,
              pubkey: "test-pubkey",
              created_at: 12345,
              tags: [],
              sig: "test-sig",
            });
          }, 10);
          return { close: mockClose };
        }
      );

      await subscribeToGeoRoom({ geohash: "9q8yy", onEvent });

      // Wait for the simulated event
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ content: "test message" })
      );
    });

    it("should fire onConnect and onEose callbacks", async () => {
      const onEvent = vi.fn();
      const onConnect = vi.fn();
      const onEose = vi.fn();

      mockSubscribeMany.mockImplementation(
        (
          _relays: string[],
          _filters: unknown[],
          handlers: { oneose: () => void }
        ) => {
          setTimeout(() => handlers.oneose(), 10);
          return { close: mockClose };
        }
      );

      await subscribeToGeoRoom({
        geohash: "9q8yy",
        onEvent,
        onConnect,
        onEose,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(onConnect).toHaveBeenCalled();
      expect(onEose).toHaveBeenCalled();
    });

    it("should call close() on CEPS subscription when unsubscribe() is called", async () => {
      const onEvent = vi.fn();

      const subscription = await subscribeToGeoRoom({
        geohash: "9q8yy",
        onEvent,
      });
      subscription.unsubscribe();

      expect(mockClose).toHaveBeenCalled();
      expect(subscription.isActive).toBe(false);
    });

    it("should throw GeoRoomError with kind subscription_failed on CEPS failure", async () => {
      const onEvent = vi.fn();
      const onError = vi.fn();

      mockSubscribeMany.mockImplementation(() => {
        throw new Error("CEPS subscription failed");
      });

      try {
        await subscribeToGeoRoom({ geohash: "9q8yy", onEvent, onError });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GeoRoomError);
        expect((error as GeoRoomError).kind).toBe("subscription_failed");
        expect(onError).toHaveBeenCalled();
      }
    });

    it("should update geohash and resubscribe when updateGeohash is called", async () => {
      const onEvent = vi.fn();

      const subscription = await subscribeToGeoRoom({
        geohash: "9q8yy",
        onEvent,
      });
      expect(mockSubscribeMany).toHaveBeenCalledTimes(1);

      await subscription.updateGeohash("dr5rs");

      expect(mockClose).toHaveBeenCalled();
      expect(mockSubscribeMany).toHaveBeenCalledTimes(2);
      expect(subscription.activeGeohash).toBe("dr5rs");
    });

    it("should be a no-op when updateGeohash is called with the same geohash", async () => {
      const onEvent = vi.fn();

      const subscription = await subscribeToGeoRoom({
        geohash: "9q8yy",
        onEvent,
      });
      const initialCallCount = mockSubscribeMany.mock.calls.length;

      await subscription.updateGeohash("9q8yy");

      expect(mockSubscribeMany.mock.calls.length).toBe(initialCallCount);
    });
  });

  describe("mapGeoRoomErrorToMessage()", () => {
    it("should map no_relays_available to user-friendly message", () => {
      const error = new GeoRoomError("no_relays_available", "No relays");
      const message = mapGeoRoomErrorToMessage(error);
      expect(message).toContain("No healthy relays");
    });

    it("should map invalid_geohash to user-friendly message", () => {
      const error = new GeoRoomError("invalid_geohash", "Bad geohash");
      const message = mapGeoRoomErrorToMessage(error);
      expect(message).toContain("geohash");
      expect(message).toContain("valid");
    });

    it("should map registry_unavailable to user-friendly message", () => {
      const error = new GeoRoomError("registry_unavailable", "Registry down");
      const message = mapGeoRoomErrorToMessage(error);
      expect(message).toContain("registry");
      expect(message).toContain("unavailable");
    });

    it("should map publish_failed to user-friendly message", () => {
      const error = new GeoRoomError("publish_failed", "Publish error");
      const message = mapGeoRoomErrorToMessage(error);
      expect(message).toContain("send message");
    });

    it("should map subscription_failed to user-friendly message", () => {
      const error = new GeoRoomError("subscription_failed", "Sub error");
      const message = mapGeoRoomErrorToMessage(error);
      expect(message).toContain("connect");
    });

    it("should handle unknown error kinds with default message", () => {
      // Force an unknown kind for testing
      const error = new GeoRoomError("unknown_kind" as never, "Unknown");
      const message = mapGeoRoomErrorToMessage(error);
      expect(message).toContain("unexpected error");
    });
  });
});
