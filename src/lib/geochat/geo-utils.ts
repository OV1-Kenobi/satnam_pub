/**
 * Geochat Utilities - Read-Only Geo Discovery
 *
 * Browser-safe utility functions for geohash validation, precision detection,
 * and coordinate conversion. Uses pure TypeScript with no Node.js dependencies.
 *
 * @module src/lib/geochat/geo-utils
 */

import {
  type GeoPrecision,
  type GeoRoomPreview,
  type GeoRoomRelayPreview,
  GeoDiscoveryError,
  GEOHASH_PRECISION_MAP,
} from "./types";
import { GeoRelaySelector, BASE32 } from "../noise/geo-relay-selector";

/**
 * Normalize a geohash string: lowercase, trim, validate characters.
 * @param input - Raw geohash input
 * @returns Normalized geohash or null if invalid
 */
export function normalizeGeohash(input: string): string | null {
  if (!input || typeof input !== "string") {
    return null;
  }

  const normalized = input.toLowerCase().trim();

  // Must be 1-12 characters
  if (normalized.length < 1 || normalized.length > 12) {
    return null;
  }

  // Validate all characters are in base32 alphabet
  for (const char of normalized) {
    if (!BASE32.includes(char)) {
      return null;
    }
  }

  return normalized;
}

/**
 * Resolve geohash length to human-readable precision level.
 * @param geohash - Valid geohash string
 * @returns GeoPrecision level
 */
export function resolveGeoPrecision(geohash: string): GeoPrecision {
  const length = geohash.length;

  if (length <= 2) return "region";
  if (length <= 4) return "city";
  if (length <= 6) return "neighborhood";
  return "block";
}

/**
 * Get approximate radius in kilometers for a geohash length.
 * @param geohashLength - Length of geohash (1-12)
 * @returns Approximate radius in km
 */
export function getApproximateRadius(geohashLength: number): number {
  const clamped = Math.max(1, Math.min(8, geohashLength));
  return GEOHASH_PRECISION_MAP[clamped]?.radiusKm ?? 0.01;
}

/**
 * Get human-readable radius description for a geohash length.
 * @param geohashLength - Length of geohash (1-12)
 * @returns Description string
 */
export function getRadiusDescription(geohashLength: number): string {
  const clamped = Math.max(1, Math.min(8, geohashLength));
  return GEOHASH_PRECISION_MAP[clamped]?.description ?? "< 19m";
}

/**
 * Validate a geohash and throw structured error if invalid.
 * @param geohash - Geohash to validate
 * @throws GeoDiscoveryError if invalid
 */
export function validateGeohash(geohash: string): void {
  const normalized = normalizeGeohash(geohash);
  if (!normalized) {
    throw new GeoDiscoveryError(
      "INVALID_GEOHASH",
      `Invalid geohash: "${geohash}". Must be 1-12 characters from base32 alphabet.`
    );
  }
}

/**
 * Get browser geolocation and convert to geohash.
 * @param precision - Desired geohash length (default: 6 for ~610m)
 * @returns Promise resolving to geohash string
 * @throws GeoDiscoveryError on failure
 */
export async function getGeohashFromBrowserLocation(
  precision: number = 6
): Promise<string> {
  if (!navigator.geolocation) {
    throw new GeoDiscoveryError(
      "GEOLOCATION_UNAVAILABLE",
      "Browser geolocation is not available"
    );
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const selector = GeoRelaySelector.getInstance();
        const geohash = selector.encodeGeohash(latitude, longitude, precision);
        resolve(geohash);
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(
              new GeoDiscoveryError(
                "GEOLOCATION_DENIED",
                "Location permission denied by user"
              )
            );
            break;
          case error.POSITION_UNAVAILABLE:
            reject(
              new GeoDiscoveryError(
                "GEOLOCATION_UNAVAILABLE",
                "Location information unavailable"
              )
            );
            break;
          case error.TIMEOUT:
            reject(
              new GeoDiscoveryError(
                "GEOLOCATION_TIMEOUT",
                "Location request timed out"
              )
            );
            break;
          default:
            reject(
              new GeoDiscoveryError(
                "GEOLOCATION_UNAVAILABLE",
                "Unknown geolocation error"
              )
            );
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}

/**
 * Build a geo-room preview with relay information.
 * Uses GeoRelaySelector from Phase 0 for relay selection.
 * @param geohash - Valid geohash string
 * @returns GeoRoomPreview object
 */
export function buildGeoRoomPreview(geohash: string): GeoRoomPreview {
  const normalized = normalizeGeohash(geohash);
  if (!normalized) {
    throw new GeoDiscoveryError(
      "INVALID_GEOHASH",
      `Invalid geohash: "${geohash}"`
    );
  }

  const precision = resolveGeoPrecision(normalized);
  const radiusKm = getApproximateRadius(normalized.length);
  const radiusDescription = getRadiusDescription(normalized.length);

  // Use GeoRelaySelector from Phase 0 for relay preview
  const selector = GeoRelaySelector.getInstance();
  let relays: GeoRoomRelayPreview[] = [];

  if (selector.isInitialized()) {
    const selectedRelays = selector.selectForGeoRoom(normalized, 1, 4);
    relays = selectedRelays.map((r) => ({
      url: r.relayUrl,
      trustLevel: r.trustLevel,
      // Note: distanceKm is not calculated in Phase 1 (would require exposing haversineDistance)
      distanceKm: undefined,
      // Note: countryCode is not available in GeoRelayRecord (only lat/long/trustLevel)
      countryCode: undefined,
    }));
  }

  return {
    geohash: normalized,
    precision,
    radiusKm,
    radiusDescription,
    relays,
  };
}

/**
 * Check if a geohash is valid without throwing.
 * @param geohash - Geohash to check
 * @returns true if valid, false otherwise
 */
export function isValidGeohash(geohash: string): boolean {
  return normalizeGeohash(geohash) !== null;
}
