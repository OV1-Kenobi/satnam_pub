/**
 * Bitcoin Fee Estimation Netlify Function
 * Fetches real-time Bitcoin on-chain fee estimates from Mempool.space API
 * with 5-minute in-memory caching to reduce API calls
 *
 * Privacy: No user identifiers or sensitive data sent to Mempool.space
 * Zero-Knowledge: Public API, no authentication required
 */

import type { Handler } from "@netlify/functions";
import type {
  CacheEntry,
  FeeEstimateResponse,
  MempoolFeeEstimate,
} from "../../types/bitcoin-fees.js";

// In-memory cache for fee estimates (5-minute TTL)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY = "bitcoin-fees";
const feeCache = new Map<string, CacheEntry>();

// Fallback fee estimate (only used if no cache exists)
const DEFAULT_FALLBACK_FEE = 500;

// Mempool.space API endpoint
const MEMPOOL_API_URL = "https://mempool.space/api/v1/fees/recommended";
const API_TIMEOUT_MS = 5000; // 5 second timeout

/**
 * Get cached fee estimate if available and not expired
 */
function getCachedFees(): MempoolFeeEstimate | null {
  const cached = feeCache.get(CACHE_KEY);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL_MS) {
    // Cache expired, but keep it for fallback
    return null;
  }

  return cached.fees;
}

/**
 * Get last known fee estimate (even if expired) for fallback
 */
function getLastKnownFees(): MempoolFeeEstimate | null {
  const cached = feeCache.get(CACHE_KEY);
  return cached ? cached.fees : null;
}

/**
 * Store fee estimate in cache
 */
function setCachedFees(fees: MempoolFeeEstimate): void {
  feeCache.set(CACHE_KEY, {
    fees,
    timestamp: Date.now(),
  });
}

/**
 * Fetch fee estimates from Mempool.space API with timeout
 */
async function fetchMempoolFees(): Promise<MempoolFeeEstimate | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(MEMPOOL_API_URL, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        console.warn(
          `[bitcoin-fee-estimate] Mempool.space API error: ${response.status}`
        );
        return null;
      }

      const data = (await response.json()) as MempoolFeeEstimate;

      // Validate response structure - check all required fields
      if (
        typeof data.fastestFee !== "number" ||
        typeof data.halfHourFee !== "number" ||
        typeof data.hourFee !== "number" ||
        typeof data.economyFee !== "number" ||
        typeof data.minimumFee !== "number"
      ) {
        console.warn("[bitcoin-fee-estimate] Invalid Mempool.space response");
        return null;
      }

      return data;
    } finally {
      // Ensure timeout is always cleaned up, even if fetch times out or throws
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[bitcoin-fee-estimate] API fetch failed: ${errorMsg}`);
    return null;
  }
}

/**
 * Main handler for fee estimation requests
 */
export const handler: Handler = async (event, context) => {
  // CORS headers
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers,
    };
  }

  try {
    // Check cache first
    const cachedFees = getCachedFees();
    if (cachedFees) {
      const cacheAge = Date.now() - (feeCache.get(CACHE_KEY)?.timestamp || 0);
      const response: FeeEstimateResponse = {
        success: true,
        data: {
          ...cachedFees,
          recommendedFee: cachedFees.hourFee,
          cached: true,
          cacheAge,
          fallback: false,
        },
      };
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response),
      };
    }

    // Cache miss or expired - fetch from API
    const fees = await fetchMempoolFees();

    if (fees) {
      // API success - cache and return
      setCachedFees(fees);
      const response: FeeEstimateResponse = {
        success: true,
        data: {
          ...fees,
          recommendedFee: fees.hourFee,
          cached: false,
          cacheAge: 0,
          fallback: false,
        },
      };
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response),
      };
    }

    // API failed - try fallback strategy
    const lastKnownFees = getLastKnownFees();

    if (lastKnownFees) {
      // Use last known fees (even if expired)
      const cacheAge = Date.now() - (feeCache.get(CACHE_KEY)?.timestamp || 0);
      const response: FeeEstimateResponse = {
        success: true,
        data: {
          ...lastKnownFees,
          recommendedFee: lastKnownFees.hourFee,
          cached: true,
          cacheAge,
          fallback: true,
          fallbackReason: "API unavailable, using last known fees",
        },
      };
      console.warn(
        "[bitcoin-fee-estimate] Using last known fees due to API failure"
      );
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response),
      };
    }

    // No cache exists - use hardcoded default
    const defaultFees: MempoolFeeEstimate = {
      fastestFee: DEFAULT_FALLBACK_FEE,
      halfHourFee: DEFAULT_FALLBACK_FEE,
      hourFee: DEFAULT_FALLBACK_FEE,
      economyFee: DEFAULT_FALLBACK_FEE,
      minimumFee: DEFAULT_FALLBACK_FEE,
    };

    const response: FeeEstimateResponse = {
      success: true,
      data: {
        ...defaultFees,
        recommendedFee: DEFAULT_FALLBACK_FEE,
        cached: false,
        cacheAge: 0,
        fallback: true,
        fallbackReason: "No cache available, using default estimate",
      },
    };
    console.warn(
      "[bitcoin-fee-estimate] No cache available, using default 500 sats"
    );
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[bitcoin-fee-estimate] Unexpected error: ${errorMsg}`);

    // Even on unexpected error, try to return last known fees
    const lastKnownFees = getLastKnownFees();
    if (lastKnownFees) {
      const cacheAge = Date.now() - (feeCache.get(CACHE_KEY)?.timestamp || 0);
      const response: FeeEstimateResponse = {
        success: true,
        data: {
          ...lastKnownFees,
          recommendedFee: lastKnownFees.hourFee,
          cached: true,
          cacheAge,
          fallback: true,
          fallbackReason: "Unexpected error, using last known fees",
        },
      };
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response),
      };
    }

    // Last resort: return error response
    const response: FeeEstimateResponse = {
      success: false,
      error: "Failed to estimate fees",
    };
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify(response),
    };
  }
};
