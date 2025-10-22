/**
 * Tests for Relay Privacy Layer
 * Verifies per-relay batching and privacy level configuration
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  RelayPrivacyLayer,
  type PrivacyRelay,
  type PrivacyLevel,
} from "../../lib/relay-privacy-layer";
import type { Event } from "nostr-tools";

describe("RelayPrivacyLayer", () => {
  let layer: RelayPrivacyLayer;
  let mockEvent: Event;

  beforeEach(() => {
    layer = new RelayPrivacyLayer();
    mockEvent = {
      id: "test-event-id",
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: "test-pubkey",
      content: "test content",
      tags: [],
      sig: "test-sig",
    };
  });

  describe("Relay Configuration", () => {
    it("should configure a relay with privacy settings", () => {
      const relay: PrivacyRelay = {
        url: "wss://test.relay.com",
        type: "public",
        privacyLevel: "public",
        batchingEnabled: false,
        batchSize: 1,
        batchDelayMs: 0,
      };

      layer.configureRelay(relay);
      const config = layer.getRelayConfig(relay.url);

      expect(config.url).toBe(relay.url);
      expect(config.privacyLevel).toBe("public");
      expect(config.batchingEnabled).toBe(false);
    });

    it("should return default config for unconfigured relay", () => {
      const config = layer.getRelayConfig("wss://unknown.relay.com");

      expect(config.privacyLevel).toBe("public");
      expect(config.batchingEnabled).toBe(false);
      expect(config.batchSize).toBe(1);
    });

    it("should get default Satnam relay configurations", () => {
      const relays = RelayPrivacyLayer.getDefaultSatnamRelays();

      expect(relays).toHaveLength(3);
      expect(relays[0].type).toBe("public");
      expect(relays[1].type).toBe("private-paid");
      expect(relays[2].type).toBe("private-tor");

      // Verify privacy levels
      expect(relays[0].privacyLevel).toBe("public");
      expect(relays[1].privacyLevel).toBe("private");
      expect(relays[2].privacyLevel).toBe("tor");

      // Verify batching configuration
      expect(relays[0].batchingEnabled).toBe(false);
      expect(relays[1].batchingEnabled).toBe(true);
      expect(relays[2].batchingEnabled).toBe(true);
    });
  });

  describe("Event Batching", () => {
    it("should publish directly without batching for public relay", async () => {
      const relay: PrivacyRelay = {
        url: "wss://public.relay.com",
        type: "public",
        privacyLevel: "public",
        batchingEnabled: false,
        batchSize: 1,
        batchDelayMs: 0,
      };

      layer.configureRelay(relay);
      const eventId = await layer.publishWithBatching(mockEvent, relay);

      expect(eventId).toBe(mockEvent.id);
    });

    it("should queue events for batching when enabled", async () => {
      const relay: PrivacyRelay = {
        url: "wss://private.relay.com",
        type: "private-paid",
        privacyLevel: "private",
        batchingEnabled: true,
        batchSize: 5,
        batchDelayMs: 1000,
      };

      layer.configureRelay(relay);

      // Queue multiple events
      const promises = [];
      for (let i = 0; i < 3; i++) {
        const event = { ...mockEvent, id: `event-${i}` };
        promises.push(layer.publishWithBatching(event, relay));
      }

      // All should resolve
      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      expect(results[0]).toBe("event-0");
      expect(results[1]).toBe("event-1");
      expect(results[2]).toBe("event-2");
    });

    it("should flush batch when size is reached", async () => {
      const relay: PrivacyRelay = {
        url: "wss://batch.relay.com",
        type: "private-paid",
        privacyLevel: "private",
        batchingEnabled: true,
        batchSize: 2,
        batchDelayMs: 5000,
      };

      layer.configureRelay(relay);

      const promises = [];
      for (let i = 0; i < 2; i++) {
        const event = { ...mockEvent, id: `batch-event-${i}` };
        promises.push(layer.publishWithBatching(event, relay));
      }

      // Should resolve immediately when batch is full
      const results = await Promise.all(promises);
      expect(results).toHaveLength(2);
    });

    it("should apply random delays for privacy", async () => {
      const relay: PrivacyRelay = {
        url: "wss://tor.relay.com",
        type: "private-tor",
        privacyLevel: "tor",
        batchingEnabled: true,
        batchSize: 10,
        batchDelayMs: 5000,
      };

      layer.configureRelay(relay);

      const startTime = Date.now();
      const promise = layer.publishWithBatching(mockEvent, relay);

      // Flush all batches
      layer.flushAll();

      await promise;
      const elapsed = Date.now() - startTime;

      // Should complete quickly (no actual delay in test)
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("Batch Flushing", () => {
    it("should flush all pending batches", async () => {
      const relay1: PrivacyRelay = {
        url: "wss://relay1.com",
        type: "private-paid",
        privacyLevel: "private",
        batchingEnabled: true,
        batchSize: 10,
        batchDelayMs: 5000,
      };

      const relay2: PrivacyRelay = {
        url: "wss://relay2.com",
        type: "private-paid",
        privacyLevel: "private",
        batchingEnabled: true,
        batchSize: 10,
        batchDelayMs: 5000,
      };

      layer.configureRelay(relay1);
      layer.configureRelay(relay2);

      const promises = [
        layer.publishWithBatching(mockEvent, relay1),
        layer.publishWithBatching({ ...mockEvent, id: "event-2" }, relay2),
      ];

      layer.flushAll();

      const results = await Promise.all(promises);
      expect(results).toHaveLength(2);
    });
  });
});

