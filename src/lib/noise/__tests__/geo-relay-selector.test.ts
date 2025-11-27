/**
 * @fileoverview Unit tests for GeoRelaySelector
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GeoRelaySelector } from "../geo-relay-selector";
import type { GeoRelayRegistry } from "../types";

// Sample registry for testing
const testRegistry: GeoRelayRegistry = {
  version: "1.0.0",
  updatedAt: "2025-11-26T00:00:00Z",
  relays: [
    {
      relayUrl: "wss://relay.satnam.pub",
      latitude: 0,
      longitude: 0,
      trustLevel: "self-hosted",
    },
    {
      relayUrl: "wss://relay.tokyo.example",
      latitude: 35.6762,
      longitude: 139.6503,
      trustLevel: "public",
    },
    {
      relayUrl: "wss://relay.nyc.example",
      latitude: 40.7128,
      longitude: -74.006,
      trustLevel: "public",
    },
    {
      relayUrl: "wss://relay.london.example",
      latitude: 51.5074,
      longitude: -0.1278,
      trustLevel: "public",
    },
    {
      relayUrl: "wss://relay.sydney.example",
      latitude: -33.8688,
      longitude: 151.2093,
      trustLevel: "public",
    },
    {
      relayUrl: "wss://relay.berlin.example",
      latitude: 52.52,
      longitude: 13.405,
      trustLevel: "public",
    },
  ],
};

describe("GeoRelaySelector", () => {
  let selector: GeoRelaySelector;

  beforeEach(() => {
    GeoRelaySelector.resetInstance();
    selector = GeoRelaySelector.getInstance();
  });

  afterEach(() => {
    GeoRelaySelector.resetInstance();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = GeoRelaySelector.getInstance();
      const instance2 = GeoRelaySelector.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("Initialization", () => {
    it("should initialize with registry", () => {
      selector.initialize(testRegistry);
      expect(selector.isInitialized()).toBe(true);
    });

    it("should throw when not initialized", () => {
      expect(() => selector.getAllRelays()).toThrow();
    });

    it("should load from JSON", () => {
      selector.loadFromJson(testRegistry);
      expect(selector.isInitialized()).toBe(true);
      expect(selector.getRelayCount()).toBe(6);
    });
  });

  describe("Relay Retrieval", () => {
    beforeEach(() => {
      selector.initialize(testRegistry);
    });

    it("should get all relays", () => {
      const relays = selector.getAllRelays();
      expect(relays).toHaveLength(6);
    });

    it("should filter by trust level - public", () => {
      const publicRelays = selector.getRelaysByTrustLevel("public");
      expect(publicRelays).toHaveLength(5);
      expect(publicRelays.every((r) => r.trustLevel === "public")).toBe(true);
    });

    it("should filter by trust level - self-hosted", () => {
      const selfHosted = selector.getRelaysByTrustLevel("self-hosted");
      expect(selfHosted).toHaveLength(1);
      expect(selfHosted[0].relayUrl).toBe("wss://relay.satnam.pub");
    });

    it("should get registry version", () => {
      expect(selector.getVersion()).toBe("1.0.0");
    });

    it("should get updated timestamp", () => {
      expect(selector.getUpdatedAt()).toBe("2025-11-26T00:00:00Z");
    });
  });

  describe("Geohash Encoding/Decoding", () => {
    beforeEach(() => {
      selector.initialize(testRegistry);
    });

    it("should decode geohash to coordinates", () => {
      // "gcpvj" is roughly London (51.5, -0.1)
      const coords = selector.decodeGeohash("gcpvj");
      expect(coords.latitude).toBeCloseTo(51.5, 0);
      expect(coords.longitude).toBeCloseTo(-0.1, 0);
    });

    it("should encode coordinates to geohash", () => {
      const geohash = selector.encodeGeohash(51.5074, -0.1278, 5);
      expect(geohash).toBe("gcpvj");
    });

    it("should round-trip encode/decode", () => {
      const lat = 35.6762;
      const lon = 139.6503;
      const geohash = selector.encodeGeohash(lat, lon, 6);
      const decoded = selector.decodeGeohash(geohash);

      expect(decoded.latitude).toBeCloseTo(lat, 1);
      expect(decoded.longitude).toBeCloseTo(lon, 1);
    });

    it("should throw on invalid geohash", () => {
      expect(() => selector.decodeGeohash("")).toThrow();
      expect(() => selector.decodeGeohash("invalid!")).toThrow();
    });
  });

  describe("Nearest Relay Selection", () => {
    beforeEach(() => {
      selector.initialize(testRegistry);
    });

    it("should select nearest relays to Tokyo", () => {
      // Tokyo geohash
      const tokyoGeohash = selector.encodeGeohash(35.6762, 139.6503, 5);
      const nearest = selector.selectNearestRelays(tokyoGeohash, 3);

      expect(nearest).toHaveLength(3);
      expect(nearest[0].relayUrl).toBe("wss://relay.tokyo.example");
    });

    it("should select nearest relays to NYC", () => {
      const nycGeohash = selector.encodeGeohash(40.7128, -74.006, 5);
      const nearest = selector.selectNearestRelays(nycGeohash, 2);

      expect(nearest).toHaveLength(2);
      expect(nearest[0].relayUrl).toBe("wss://relay.nyc.example");
    });

    it("should filter by trust level when selecting", () => {
      const londonGeohash = selector.encodeGeohash(51.5074, -0.1278, 5);
      const publicOnly = selector.selectNearestRelays(
        londonGeohash,
        10,
        "public"
      );

      expect(publicOnly.every((r) => r.trustLevel === "public")).toBe(true);
    });

    it("should return fewer relays if not enough available", () => {
      const geohash = selector.encodeGeohash(0, 0, 5);
      const selfHosted = selector.selectNearestRelays(
        geohash,
        10,
        "self-hosted"
      );

      expect(selfHosted).toHaveLength(1); // Only one self-hosted relay
    });
  });

  describe("Geo-Room Selection", () => {
    beforeEach(() => {
      selector.initialize(testRegistry);
    });

    it("should select relays for geo-room", () => {
      const geohash = selector.encodeGeohash(51.5074, -0.1278, 5);
      const relays = selector.selectForGeoRoom(geohash, 1, 3);

      expect(relays.length).toBe(4); // 1 self-hosted + 3 public
      expect(relays[0].trustLevel).toBe("self-hosted");
    });
  });

  describe("Geohash Precision Helper", () => {
    beforeEach(() => {
      selector.initialize(testRegistry);
    });

    it("should return appropriate precision for distance", () => {
      // Precision 6 covers ~1.2km, precision 5 covers ~4.9km, precision 4 covers ~39km
      expect(selector.getGeohashPrecisionForDistance(1)).toBe(6); // 1km <= 1.2km -> precision 6
      expect(selector.getGeohashPrecisionForDistance(4)).toBe(5); // 4km <= 4.9km -> precision 5
      expect(selector.getGeohashPrecisionForDistance(30)).toBe(4); // 30km <= 39km -> precision 4
      expect(selector.getGeohashPrecisionForDistance(100)).toBe(3); // 100km <= 156km -> precision 3
    });
  });
});
