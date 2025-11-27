/**
 * GeoRelaySelector - Relay selection based on geohash proximity
 *
 * Implements deterministic relay selection for geo-rooms based on
 * distance calculation from user location to relay coordinates.
 *
 * @module src/lib/noise/geo-relay-selector
 */

import type {
  GeoRelayRecord,
  GeoRelayRegistry,
  RelayTrustLevel,
} from "./types";
import { GeoRelaySelectionError } from "./types";

// Earth's radius in kilometers
const EARTH_RADIUS_KM = 6371;

// Base32 geohash alphabet (exported for use in geo-utils.ts)
export const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Singleton class for selecting relays based on geohash proximity.
 */
export class GeoRelaySelector {
  private static instance: GeoRelaySelector | null = null;
  private registry: GeoRelayRegistry | null = null;
  private initialized = false;

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  static getInstance(): GeoRelaySelector {
    if (!GeoRelaySelector.instance) {
      GeoRelaySelector.instance = new GeoRelaySelector();
    }
    return GeoRelaySelector.instance;
  }

  /**
   * Initialize with relay registry data.
   * @param registry - The geo relay registry to use
   */
  initialize(registry: GeoRelayRegistry): void {
    this.registry = registry;
    this.initialized = true;
  }

  /**
   * Load registry from JSON (for browser environment).
   * Call this with the imported georelays.json data.
   */
  loadFromJson(jsonData: GeoRelayRegistry): void {
    this.initialize(jsonData);
  }

  /**
   * Check if selector is initialized.
   */
  isInitialized(): boolean {
    return this.initialized && this.registry !== null;
  }

  /**
   * Get all relays in the registry.
   */
  getAllRelays(): GeoRelayRecord[] {
    this.ensureInitialized();
    return [...this.registry!.relays];
  }

  /**
   * Get relays filtered by trust level.
   */
  getRelaysByTrustLevel(trustLevel: RelayTrustLevel): GeoRelayRecord[] {
    this.ensureInitialized();
    return this.registry!.relays.filter((r) => r.trustLevel === trustLevel);
  }

  /**
   * Select nearest relays to a given geohash.
   *
   * @param geohash - The geohash string representing user location
   * @param count - Number of relays to return (default: 5)
   * @param trustLevel - Optional filter by trust level
   * @returns Array of nearest relays sorted by distance
   */
  selectNearestRelays(
    geohash: string,
    count: number = 5,
    trustLevel?: RelayTrustLevel
  ): GeoRelayRecord[] {
    this.ensureInitialized();

    // Decode geohash to lat/lng
    const { latitude, longitude } = this.decodeGeohash(geohash);

    // Get relays to consider
    let candidates = trustLevel
      ? this.getRelaysByTrustLevel(trustLevel)
      : this.getAllRelays();

    // Calculate distances and sort
    const withDistances = candidates.map((relay) => ({
      relay,
      distance: this.haversineDistance(
        latitude,
        longitude,
        relay.latitude,
        relay.longitude
      ),
    }));

    withDistances.sort((a, b) => a.distance - b.distance);

    return withDistances.slice(0, count).map((item) => item.relay);
  }

  /**
   * Select relays for a geo-room, prioritizing self-hosted then nearest public.
   *
   * @param geohash - The geohash for the geo-room
   * @param selfHostedCount - Number of self-hosted relays (default: 1)
   * @param publicCount - Number of public relays (default: 4)
   * @returns Combined array of relays
   */
  selectForGeoRoom(
    geohash: string,
    selfHostedCount: number = 1,
    publicCount: number = 4
  ): GeoRelayRecord[] {
    const selfHosted = this.selectNearestRelays(
      geohash,
      selfHostedCount,
      "self-hosted"
    );
    const publicRelays = this.selectNearestRelays(
      geohash,
      publicCount,
      "public"
    );
    return [...selfHosted, ...publicRelays];
  }

  /**
   * Decode a geohash string to latitude/longitude coordinates.
   * Uses standard geohash decoding algorithm.
   */
  decodeGeohash(geohash: string): { latitude: number; longitude: number } {
    if (!geohash || geohash.length === 0) {
      throw new GeoRelaySelectionError(
        "INVALID_GEOHASH",
        "Geohash cannot be empty"
      );
    }

    let isLon = true;
    let latMin = -90,
      latMax = 90;
    let lonMin = -180,
      lonMax = 180;

    for (const char of geohash.toLowerCase()) {
      const idx = BASE32.indexOf(char);
      if (idx === -1) {
        throw new GeoRelaySelectionError(
          "INVALID_GEOHASH",
          `Invalid character in geohash: ${char}`
        );
      }

      for (let bit = 4; bit >= 0; bit--) {
        const bitValue = (idx >> bit) & 1;
        if (isLon) {
          const mid = (lonMin + lonMax) / 2;
          if (bitValue === 1) lonMin = mid;
          else lonMax = mid;
        } else {
          const mid = (latMin + latMax) / 2;
          if (bitValue === 1) latMin = mid;
          else latMax = mid;
        }
        isLon = !isLon;
      }
    }

    return {
      latitude: (latMin + latMax) / 2,
      longitude: (lonMin + lonMax) / 2,
    };
  }

  /**
   * Encode latitude/longitude to a geohash string.
   * @param latitude - Latitude in degrees
   * @param longitude - Longitude in degrees
   * @param precision - Length of resulting geohash (default: 6)
   */
  encodeGeohash(
    latitude: number,
    longitude: number,
    precision: number = 6
  ): string {
    let latMin = -90,
      latMax = 90;
    let lonMin = -180,
      lonMax = 180;
    let isLon = true;
    let hash = "";
    let bits = 0;
    let currentChar = 0;

    while (hash.length < precision) {
      if (isLon) {
        const mid = (lonMin + lonMax) / 2;
        if (longitude >= mid) {
          currentChar = (currentChar << 1) | 1;
          lonMin = mid;
        } else {
          currentChar = currentChar << 1;
          lonMax = mid;
        }
      } else {
        const mid = (latMin + latMax) / 2;
        if (latitude >= mid) {
          currentChar = (currentChar << 1) | 1;
          latMin = mid;
        } else {
          currentChar = currentChar << 1;
          latMax = mid;
        }
      }
      isLon = !isLon;
      bits++;

      if (bits === 5) {
        hash += BASE32[currentChar];
        bits = 0;
        currentChar = 0;
      }
    }

    return hash;
  }

  /**
   * Calculate distance between two points using the Haversine formula.
   * @returns Distance in kilometers
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_KM * c;
  }

  /**
   * Get estimated geohash precision for a given distance in km.
   * Useful for determining appropriate precision for geo-rooms.
   */
  getGeohashPrecisionForDistance(distanceKm: number): number {
    // Approximate cell sizes for geohash precision levels
    const precisionSizes: Record<number, number> = {
      1: 5000, // ~5000km
      2: 1250, // ~1250km
      3: 156, // ~156km
      4: 39, // ~39km
      5: 4.9, // ~5km
      6: 1.2, // ~1.2km
      7: 0.15, // ~150m
      8: 0.019, // ~19m
    };

    for (let p = 8; p >= 1; p--) {
      if (distanceKm <= precisionSizes[p]) {
        return p;
      }
    }
    return 1;
  }

  /**
   * Get the registry version.
   */
  getVersion(): string {
    this.ensureInitialized();
    return this.registry!.version;
  }

  /**
   * Get the registry update timestamp.
   */
  getUpdatedAt(): string {
    this.ensureInitialized();
    return this.registry!.updatedAt;
  }

  /**
   * Get total relay count.
   */
  getRelayCount(): number {
    this.ensureInitialized();
    return this.registry!.relays.length;
  }

  /**
   * Ensure the selector is initialized before operations.
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.registry) {
      throw new GeoRelaySelectionError(
        "INITIALIZATION_FAILED",
        "GeoRelaySelector not initialized. Call initialize() or loadFromJson() first."
      );
    }
  }

  /**
   * Reset instance for testing purposes.
   */
  static resetInstance(): void {
    GeoRelaySelector.instance = null;
  }
}
