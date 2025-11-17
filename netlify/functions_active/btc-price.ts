/**
 * BTC/USD Price Netlify Function
 * Fetches real-time Bitcoin price data from Mempool.space API
 * with 10-minute in-memory caching to reduce API calls.
 *
 * Public endpoint used for SimpleProof cost transparency.
 */

import type { Handler } from "@netlify/functions";

interface MempoolPriceResponse {
  USD?: number;
  [currency: string]: unknown;
}

interface BtcPriceResponseBody {
  success: boolean;
  price_usd: number;
  timestamp: string;
  cached: boolean;
  cache_expires_at: string;
  error?: string;
}

// Mempool.space prices endpoint
const MEMPOOL_PRICE_URL = "https://mempool.space/api/v1/prices";

// Cache configuration (10 minutes)
const CACHE_TTL_MS = 10 * 60 * 1000;
const API_TIMEOUT_MS = 5000; // 5 second timeout

interface PriceCacheEntry {
  priceUsd: number;
  fetchedAt: number; // epoch ms
}

let cachedPrice: PriceCacheEntry | null = null;

function isCacheValid(entry: PriceCacheEntry | null): entry is PriceCacheEntry {
  if (!entry) return false;
  const age = Date.now() - entry.fetchedAt;
  return age < CACHE_TTL_MS;
}

async function fetchMempoolPriceUsd(): Promise<number> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(MEMPOOL_PRICE_URL, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.warn("[btc-price] Mempool.space API error", {
        provider: "mempool_space",
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`Mempool.space API error: ${response.status}`);
    }

    const data = (await response.json()) as MempoolPriceResponse;

    if (typeof data.USD !== "number" || !Number.isFinite(data.USD)) {
      console.warn("[btc-price] Invalid Mempool.space price response", {
        provider: "mempool_space",
        data,
      });
      throw new Error("Invalid price data from Mempool.space");
    }

    console.info("[btc-price] Fetched BTC price from Mempool.space", {
      provider: "mempool_space",
      price_usd: data.USD,
    });

    return data.USD;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[btc-price] Failed to fetch BTC price", {
      provider: "mempool_space",
      error: message,
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const handler: Handler = async (event) => {
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

  if (event.httpMethod !== "GET") {
    const body: BtcPriceResponseBody = {
      success: false,
      price_usd: 0,
      timestamp: new Date().toISOString(),
      cached: false,
      cache_expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      error: "Method not allowed",
    };
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify(body),
    };
  }

  try {
    // Ignore query parameters for now but allow any to be passed without errors
    // const query = event.queryStringParameters || {};

    // Return cached price if still valid
    if (isCacheValid(cachedPrice)) {
      const fetchedAt = cachedPrice!.fetchedAt;
      const body: BtcPriceResponseBody = {
        success: true,
        price_usd: cachedPrice!.priceUsd,
        timestamp: new Date(fetchedAt).toISOString(),
        cached: true,
        cache_expires_at: new Date(fetchedAt + CACHE_TTL_MS).toISOString(),
      };

      console.info("[btc-price] Returning cached BTC price", {
        provider: "mempool_space",
        price_usd: body.price_usd,
        cache_expires_at: body.cache_expires_at,
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(body),
      };
    }

    // Cache miss or expired: fetch from Mempool.space
    const priceUsd = await fetchMempoolPriceUsd();
    const now = Date.now();
    cachedPrice = { priceUsd, fetchedAt: now };

    const body: BtcPriceResponseBody = {
      success: true,
      price_usd: priceUsd,
      timestamp: new Date(now).toISOString(),
      cached: false,
      cache_expires_at: new Date(now + CACHE_TTL_MS).toISOString(),
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(body),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const nowIso = new Date().toISOString();

    const body: BtcPriceResponseBody = {
      success: false,
      price_usd: 0,
      timestamp: nowIso,
      cached: false,
      cache_expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      error: message,
    };

    return {
      statusCode: 502,
      headers,
      body: JSON.stringify(body),
    };
  }
};

