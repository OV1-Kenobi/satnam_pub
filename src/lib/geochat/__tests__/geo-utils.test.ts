/**
 * Geochat Utilities Tests
 *
 * Unit tests for Phase 1 geo-room discovery utility functions.
 *
 * @module src/lib/geochat/__tests__/geo-utils.test.ts
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  normalizeGeohash,
  resolveGeoPrecision,
  getApproximateRadius,
  getRadiusDescription,
  validateGeohash,
  isValidGeohash,
  buildGeoRoomPreview,
} from "../geo-utils";
import { GeoDiscoveryError } from "../types";
import { GeoRelaySelector } from "../../noise/geo-relay-selector";
import type { GeoRelayRegistry } from "../../noise/types";

// Mock relay registry for testing
const mockRegistry: GeoRelayRegistry = {
  version: "1.0.0",
  updatedAt: new Date().toISOString(),
  relays: [
    {
      relayUrl: "wss://relay.satnam.pub",
      trustLevel: "self-hosted",
      latitude: 37.7749,
      longitude: -122.4194,
    },
    {
      relayUrl: "wss://relay.damus.io",
      trustLevel: "public",
      latitude: 37.3382,
      longitude: -121.8863,
    },
  ],
};

describe("geo-utils", () => {
  beforeEach(() => {
    // Reset and initialize GeoRelaySelector for tests that need it
    GeoRelaySelector.resetInstance();
    GeoRelaySelector.getInstance().loadFromJson(mockRegistry);
  });

  describe("normalizeGeohash", () => {
    it("should normalize valid geohash to lowercase", () => {
      expect(normalizeGeohash("9Q8YY")).toBe("9q8yy");
      expect(normalizeGeohash("U4PruYDQ")).toBe("u4pruydq");
    });

    it("should trim whitespace", () => {
      expect(normalizeGeohash("  9q8yy  ")).toBe("9q8yy");
      expect(normalizeGeohash("\t9q8yy\n")).toBe("9q8yy");
    });

    it("should return null for empty input", () => {
      expect(normalizeGeohash("")).toBe(null);
      expect(normalizeGeohash("   ")).toBe(null);
    });

    it("should return null for too long geohash", () => {
      expect(normalizeGeohash("9q8yy9q8yy9q8")).toBe(null); // 13 chars
    });

    it("should return null for invalid characters", () => {
      expect(normalizeGeohash("9q8yya")).toBe(null); // 'a' is invalid
      expect(normalizeGeohash("9q8yyi")).toBe(null); // 'i' is invalid
      expect(normalizeGeohash("9q8yyl")).toBe(null); // 'l' is invalid
      expect(normalizeGeohash("9q8yyo")).toBe(null); // 'o' is invalid
    });

    it("should accept all valid base32 characters", () => {
      // All valid: 0123456789bcdefghjkmnpqrstuvwxyz
      expect(normalizeGeohash("0123456789")).toBe("0123456789");
      expect(normalizeGeohash("bcdefghjkm")).toBe("bcdefghjkm");
      expect(normalizeGeohash("npqrstuvwx")).toBe("npqrstuvwx");
      expect(normalizeGeohash("yz")).toBe("yz");
    });
  });

  describe("resolveGeoPrecision", () => {
    it("should return 'region' for length 1-2", () => {
      expect(resolveGeoPrecision("9")).toBe("region");
      expect(resolveGeoPrecision("9q")).toBe("region");
    });

    it("should return 'city' for length 3-4", () => {
      expect(resolveGeoPrecision("9q8")).toBe("city");
      expect(resolveGeoPrecision("9q8y")).toBe("city");
    });

    it("should return 'neighborhood' for length 5-6", () => {
      expect(resolveGeoPrecision("9q8yy")).toBe("neighborhood");
      expect(resolveGeoPrecision("9q8yyk")).toBe("neighborhood");
    });

    it("should return 'block' for length 7+", () => {
      expect(resolveGeoPrecision("9q8yykm")).toBe("block");
      expect(resolveGeoPrecision("9q8yykm5")).toBe("block");
      expect(resolveGeoPrecision("9q8yykm5678")).toBe("block");
    });
  });

  describe("getApproximateRadius", () => {
    it("should return correct radius for each length", () => {
      expect(getApproximateRadius(1)).toBe(2500);
      expect(getApproximateRadius(2)).toBe(630);
      expect(getApproximateRadius(3)).toBe(78);
      expect(getApproximateRadius(4)).toBe(20);
      expect(getApproximateRadius(5)).toBe(2.4);
      expect(getApproximateRadius(6)).toBe(0.61);
      expect(getApproximateRadius(7)).toBe(0.076);
      expect(getApproximateRadius(8)).toBe(0.019);
    });

    it("should clamp values below 1 to length 1", () => {
      expect(getApproximateRadius(0)).toBe(2500);
      expect(getApproximateRadius(-5)).toBe(2500);
    });

    it("should clamp values above 8 to length 8", () => {
      expect(getApproximateRadius(9)).toBe(0.019);
      expect(getApproximateRadius(12)).toBe(0.019);
    });
  });

  describe("getRadiusDescription", () => {
    it("should return human-readable descriptions", () => {
      expect(getRadiusDescription(1)).toBe("~2500km (continent)");
      expect(getRadiusDescription(4)).toBe("~20km (city)");
      expect(getRadiusDescription(6)).toBe("~610m (neighborhood)");
    });
  });

  describe("validateGeohash", () => {
    it("should not throw for valid geohash", () => {
      expect(() => validateGeohash("9q8yy")).not.toThrow();
      expect(() => validateGeohash("u4pruydq")).not.toThrow();
    });

    it("should throw GeoDiscoveryError for invalid geohash", () => {
      expect(() => validateGeohash("invalid!")).toThrow(GeoDiscoveryError);
      expect(() => validateGeohash("")).toThrow(GeoDiscoveryError);
    });
  });

  describe("isValidGeohash", () => {
    it("should return true for valid geohashes", () => {
      expect(isValidGeohash("9q8yy")).toBe(true);
      expect(isValidGeohash("u4pruydq")).toBe(true);
      expect(isValidGeohash("9")).toBe(true);
    });

    it("should return false for invalid geohashes", () => {
      expect(isValidGeohash("")).toBe(false);
      expect(isValidGeohash("invalid!")).toBe(false);
      expect(isValidGeohash("9q8yyaaaaaaaaa")).toBe(false); // too long
    });
  });

  describe("buildGeoRoomPreview", () => {
    it("should build preview with correct geohash and precision", () => {
      const preview = buildGeoRoomPreview("9q8yy");
      expect(preview.geohash).toBe("9q8yy");
      expect(preview.precision).toBe("neighborhood");
      expect(preview.radiusKm).toBe(2.4);
    });

    it("should include relays from GeoRelaySelector", () => {
      const preview = buildGeoRoomPreview("9q8yy");
      expect(preview.relays.length).toBeGreaterThan(0);
      expect(preview.relays[0]).toHaveProperty("url");
      expect(preview.relays[0]).toHaveProperty("trustLevel");
    });

    it("should normalize geohash input", () => {
      const preview = buildGeoRoomPreview("9Q8YY");
      expect(preview.geohash).toBe("9q8yy");
    });

    it("should throw for invalid geohash", () => {
      expect(() => buildGeoRoomPreview("invalid!")).toThrow(GeoDiscoveryError);
    });

    it("should include radius description", () => {
      const preview = buildGeoRoomPreview("9q8y");
      expect(preview.radiusDescription).toBe("~20km (city)");
    });
  });
});
