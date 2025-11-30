/// <reference path="../../../types/web-nfc.d.ts" />
import { getEnvVar } from "../../config/env.client";

export type NFCCapabilityFallback = "password" | "nip07" | "qrcode" | null;

export type NFCCapabilityFeatures = {
  read: boolean;
  write: boolean;
  signature: boolean;
};

export interface NFCCapability {
  available: boolean;
  reason: string | null;
  fallback: NFCCapabilityFallback;
  features: NFCCapabilityFeatures;
  debug?: {
    isBrowser: boolean;
    hasNDEFReader: boolean;
    isHttps: boolean;
    isAndroid: boolean;
    nfcEnabledFlag: boolean;
  };
}

const DEFAULT_FEATURES: NFCCapabilityFeatures = {
  read: false,
  write: false,
  signature: false,
};

const isBrowser = () => typeof window !== "undefined";

let cachedCapability: Map<boolean, NFCCapability> = new Map();
let cachedTimestamp: Map<boolean, number> = new Map();
const CACHE_TTL_MS = 5_000;

/**
 * Detect NFC capabilities for the current runtime environment.
 * Results are cached briefly to avoid redundant checks.
 * @param opts Optional settings (e.g., forceRefresh, includeDebug)
 */
export async function detectNFCCapability(opts?: {
  forceRefresh?: boolean;
  includeDebug?: boolean;
}): Promise<NFCCapability> {
  const cacheKey = !!opts?.includeDebug;
  const now = Date.now();
  const cached = cachedCapability.get(cacheKey);
  const timestamp = cachedTimestamp.get(cacheKey) || 0;
  if (!opts?.forceRefresh && cached && now - timestamp < CACHE_TTL_MS) {
    return cached;
  }

  const capability = computeCapability(opts);
  cachedCapability.set(cacheKey, capability);
  cachedTimestamp.set(cacheKey, now);
  return capability;
}

function computeCapability(opts?: { includeDebug?: boolean }): NFCCapability {
  const browser = isBrowser();
  if (!browser) {
    return withDebug(
      {
        available: false,
        reason: "NFC unavailable in server environment",
        fallback: null,
        features: DEFAULT_FEATURES,
      },
      {
        isBrowser: false,
        hasNDEFReader: false,
        isHttps: false,
        isAndroid: false,
        nfcEnabledFlag: false,
      },
      opts
    );
  }

  const hasNDEFReader = typeof window !== "undefined" && "NDEFReader" in window;
  const isHttps =
    typeof window !== "undefined" &&
    (window.location.protocol === "https:" ||
      window.location.hostname === "localhost");
  const ua =
    typeof window !== "undefined" ? window.navigator.userAgent || "" : "";
  const isAndroid = /Android/i.test(ua);
  const nfcEnabledFlag =
    (getEnvVar("VITE_ENABLE_NFC_AUTH") || "false").toString().toLowerCase() ===
    "true";

  if (!nfcEnabledFlag) {
    return withDebug(
      {
        available: false,
        reason: "NFC disabled via feature flag",
        fallback: "password",
        features: DEFAULT_FEATURES,
      },
      {
        isBrowser: true,
        hasNDEFReader,
        isHttps,
        isAndroid,
        nfcEnabledFlag,
      },
      opts
    );
  }

  if (!hasNDEFReader) {
    return withDebug(
      {
        available: false,
        reason: "Web NFC not supported in this browser",
        fallback: "password",
        features: DEFAULT_FEATURES,
      },
      {
        isBrowser: true,
        hasNDEFReader,
        isHttps,
        isAndroid,
        nfcEnabledFlag,
      },
      opts
    );
  }

  if (!isHttps) {
    return withDebug(
      {
        available: false,
        reason: "NFC requires HTTPS or localhost",
        fallback: "password",
        features: DEFAULT_FEATURES,
      },
      {
        isBrowser: true,
        hasNDEFReader,
        isHttps,
        isAndroid,
        nfcEnabledFlag,
      },
      opts
    );
  }

  if (!isAndroid) {
    return withDebug(
      {
        available: false,
        reason: "NFC available only on Android devices",
        fallback: "password",
        features: DEFAULT_FEATURES,
      },
      {
        isBrowser: true,
        hasNDEFReader,
        isHttps,
        isAndroid,
        nfcEnabledFlag,
      },
      opts
    );
  }

  const features: NFCCapabilityFeatures = {
    read: true,
    write: !!window.NDEFWriter,
    signature: true,
  };

  return withDebug(
    {
      available: true,
      reason: null,
      fallback: null,
      features,
    },
    {
      isBrowser: true,
      hasNDEFReader,
      isHttps,
      isAndroid,
      nfcEnabledFlag,
    },
    opts
  );
}

function withDebug(
  capability: NFCCapability,
  debugInfo: Required<NFCCapability["debug"]>,
  opts?: { includeDebug?: boolean }
): NFCCapability {
  if (opts?.includeDebug) {
    return { ...capability, debug: debugInfo };
  }
  return capability;
}

/**
 * Clears cached capability detection result. Useful for tests.
 */
export function resetNFCCapabilityCache(): void {
  cachedCapability.clear();
  cachedTimestamp.clear();
}
