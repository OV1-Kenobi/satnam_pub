/**
 * useGeoDiscovery Hook - Read-Only Geo Discovery
 *
 * React hook for geo-room state management and consent tracking.
 * Phase 1: Read-only preview mode with no network calls.
 *
 * @module src/hooks/useGeoDiscovery
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  type GeoDiscoveryState,
  type GeoRoomSelection,
  type GeoRoomPreview,
  type GeoConsentStatus,
  GEO_CONSENT_STORAGE_KEY,
  GEO_CONSENT_VERSION,
  GeoDiscoveryError,
} from "../lib/geochat/types";
import {
  normalizeGeohash,
  resolveGeoPrecision,
  getGeohashFromBrowserLocation,
  buildGeoRoomPreview,
} from "../lib/geochat/geo-utils";
import { GeoRelaySelector } from "../lib/noise/geo-relay-selector";
import geoRelaysData from "../config/georelays.json";
import type { GeoRelayRegistry } from "../lib/noise/types";

/**
 * Hook return type for geo-room discovery.
 */
export interface UseGeoDiscoveryReturn {
  /** Current discovery state */
  state: GeoDiscoveryState;
  /** Set a manual geohash selection */
  setSelection: (geohash: string) => void;
  /** Clear current selection */
  reset: () => void;
  /** Record user consent */
  recordConsent: () => void;
  /** Revoke user consent */
  revokeConsent: () => void;
  /** Get consent status */
  consentStatus: GeoConsentStatus;
  /** Request browser geolocation */
  requestBrowserLocation: () => Promise<void>;
  /** Current geo-room preview (if selection exists) */
  preview: GeoRoomPreview | null;
  /** Whether geochat feature is enabled */
  isEnabled: boolean;
}

/**
 * Load consent status from localStorage.
 */
function loadConsentStatus(): GeoConsentStatus {
  try {
    const stored = localStorage.getItem(GEO_CONSENT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as GeoConsentStatus;
      // Validate consent version matches
      if (parsed.consentVersion === GEO_CONSENT_VERSION) {
        return parsed;
      }
    }
  } catch {
    // Ignore localStorage errors
  }
  return { consented: false };
}

/**
 * Save consent status to localStorage.
 */
function saveConsentStatus(status: GeoConsentStatus): void {
  try {
    localStorage.setItem(GEO_CONSENT_STORAGE_KEY, JSON.stringify(status));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * React hook for geo-room discovery with consent management.
 * @param isEnabled - Whether geochat feature is enabled (from feature flag)
 */
export function useGeoDiscovery(
  isEnabled: boolean = true
): UseGeoDiscoveryReturn {
  // Initialize GeoRelaySelector on mount
  useEffect(() => {
    const selector = GeoRelaySelector.getInstance();
    if (!selector.isInitialized()) {
      selector.loadFromJson(geoRelaysData as GeoRelayRegistry);
    }
  }, []);

  // Consent state (persisted in localStorage)
  const [consentStatus, setConsentStatus] = useState<GeoConsentStatus>(() =>
    loadConsentStatus()
  );

  // Discovery state (ephemeral, not persisted)
  const [state, setState] = useState<GeoDiscoveryState>({
    hasConsented: consentStatus.consented,
    isLocating: false,
  });

  // Sync hasConsented when consentStatus changes
  useEffect(() => {
    setState((prev) => ({ ...prev, hasConsented: consentStatus.consented }));
  }, [consentStatus.consented]);

  // Set manual geohash selection
  const setSelection = useCallback((geohash: string) => {
    const normalized = normalizeGeohash(geohash);
    if (!normalized) {
      setState((prev) => ({
        ...prev,
        error: `Invalid geohash: "${geohash}"`,
        currentSelection: undefined,
      }));
      return;
    }

    const selection: GeoRoomSelection = {
      geohash: normalized,
      precision: resolveGeoPrecision(normalized),
      source: "manual",
      selectedAt: Date.now(),
    };

    setState((prev) => ({
      ...prev,
      currentSelection: selection,
      error: undefined,
    }));
  }, []);

  // Reset selection
  const reset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentSelection: undefined,
      error: undefined,
      isLocating: false,
    }));
  }, []);

  // Record consent
  const recordConsent = useCallback(() => {
    const newStatus: GeoConsentStatus = {
      consented: true,
      consentedAt: Date.now(),
      consentVersion: GEO_CONSENT_VERSION,
    };
    setConsentStatus(newStatus);
    saveConsentStatus(newStatus);
  }, []);

  // Revoke consent
  const revokeConsent = useCallback(() => {
    const newStatus: GeoConsentStatus = { consented: false };
    setConsentStatus(newStatus);
    saveConsentStatus(newStatus);
    reset();
  }, [reset]);

  // Request browser geolocation
  const requestBrowserLocation = useCallback(async () => {
    setState((prev) => ({ ...prev, isLocating: true, error: undefined }));

    try {
      const geohash = await getGeohashFromBrowserLocation(6);
      const selection: GeoRoomSelection = {
        geohash,
        precision: resolveGeoPrecision(geohash),
        source: "browser_geolocation",
        selectedAt: Date.now(),
      };

      setState((prev) => ({
        ...prev,
        currentSelection: selection,
        isLocating: false,
        error: undefined,
      }));
    } catch (error) {
      const message =
        error instanceof GeoDiscoveryError
          ? error.message
          : "Failed to get location";
      setState((prev) => ({
        ...prev,
        isLocating: false,
        error: message,
      }));
    }
  }, []);

  // Compute preview from current selection
  const preview = useMemo<GeoRoomPreview | null>(() => {
    if (!state.currentSelection) return null;
    try {
      return buildGeoRoomPreview(state.currentSelection.geohash);
    } catch {
      return null;
    }
  }, [state.currentSelection]);

  return {
    state,
    setSelection,
    reset,
    recordConsent,
    revokeConsent,
    consentStatus,
    requestBrowserLocation,
    preview,
    isEnabled,
  };
}
