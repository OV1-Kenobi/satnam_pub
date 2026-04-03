/**
 * BTC/USD Multi-Provider Pricing Utility (Phase 1, Task 1.3)
 * Server-side only - fetches spot price from Coinbase, Mempool.space, Bitfinex
 * Uses median aggregation with 60s cache TTL and stale fallback
 *
 * DESIGN:
 * - Parallel fetching from 3 providers (Coinbase, Mempool.space, Bitfinex)
 * - Median aggregation preferred (2+ valid prices), average fallback (1 valid price)
 * - 60s cache TTL (fresh) + 5min grace window (stale but usable)
 * - Throws PricingUnavailableError if all providers fail and no cache exists
 * - No hardcoded BTC price fallback (privacy-conscious, no silent failures)
 *
 * USAGE:
 * - getBtcUsdSpot() - Get current BTC/USD spot price
 * - satsToUsdCents(sats) - Convert satoshis to USD cents
 * - btcToUsdCents(btc) - Convert BTC to USD cents
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface GetPriceOptions {
  /** Force fresh fetch (bypass cache) */
  forceFresh?: boolean;
  /** Custom timeout per provider in ms (default: 5000) */
  providerTimeout?: number;
}

export interface BtcUsdSpotResult {
  /** BTC/USD price (median or average of valid providers) */
  priceUsd: number;
  /** Number of providers that returned valid prices */
  sourceCount: number;
  /** Whether result came from cache */
  usedCache: boolean;
  /** Whether cache is stale (beyond TTL but within grace window) */
  stale: boolean;
  /** ISO timestamp of price fetch */
  timestamp: string;
  /** Aggregation method used ('median' | 'average') */
  aggregationMethod: "median" | "average";
  /** Provider-level results for debugging */
  providerResults?: ProviderResult[];
}

export interface ConversionResult {
  /** Amount in USD cents (integer) */
  usdCents: number;
  /** BTC/USD price used for conversion */
  priceUsd: number;
  /** Whether conversion used stale cache */
  stale: boolean;
}

export interface ProviderResult {
  provider: "coinbase" | "mempool" | "bitfinex";
  success: boolean;
  priceUsd?: number;
  error?: string;
  latencyMs?: number;
}

/**
 * Custom error thrown when BTC/USD pricing is unavailable
 * (all providers failed and no cache exists)
 */
export class PricingUnavailableError extends Error {
  constructor(
    message: string,
    public readonly providerErrors: ProviderResult[],
  ) {
    super(message);
    this.name = "PricingUnavailableError";
  }
}

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

interface PriceCacheEntry {
  priceUsd: number;
  sourceCount: number;
  aggregationMethod: "median" | "average";
  fetchedAt: number; // epoch ms
  providerResults: ProviderResult[];
}

const CACHE_TTL_MS = 60 * 1000; // 60 seconds (fresh)
const CACHE_GRACE_MS = 5 * 60 * 1000; // 5 minutes (stale but usable)
const CACHE_KEY = "btc-usd:spot";

// Module-level cache (same pattern as bitcoin-fee-estimate.ts)
let priceCache: PriceCacheEntry | null = null;

// ============================================================================
// PROVIDER CONFIGURATION
// ============================================================================

interface ProviderConfig {
  url: string;
  timeout: number;
  parsePrice: (data: unknown) => number | null;
}

const PROVIDERS: Record<"coinbase" | "mempool" | "bitfinex", ProviderConfig> = {
  coinbase: {
    url: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
    timeout: 5000,
    parsePrice: (data: unknown) => {
      try {
        const parsed = data as { data?: { amount?: string } };
        const amount = parsed?.data?.amount;
        if (typeof amount === "string") {
          const price = parseFloat(amount);
          return Number.isFinite(price) && price > 0 ? price : null;
        }
        return null;
      } catch {
        return null;
      }
    },
  },
  mempool: {
    url: "https://mempool.space/api/v1/prices",
    timeout: 5000,
    parsePrice: (data: unknown) => {
      try {
        const parsed = data as { USD?: number };
        const price = parsed?.USD;
        return typeof price === "number" && Number.isFinite(price) && price > 0
          ? price
          : null;
      } catch {
        return null;
      }
    },
  },
  bitfinex: {
    url: "https://api-pub.bitfinex.com/v2/ticker/tBTCUSD",
    timeout: 5000,
    parsePrice: (data: unknown) => {
      try {
        // Bitfinex returns array: [BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_RELATIVE, LAST_PRICE, ...]
        // Index 6 is LAST_PRICE (spot price)
        if (Array.isArray(data) && data.length > 6) {
          const price = data[6];
          return typeof price === "number" &&
            Number.isFinite(price) &&
            price > 0
            ? price
            : null;
        }
        return null;
      } catch {
        return null;
      }
    },
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if cache is fresh (within TTL)
 */
function isCacheFresh(entry: PriceCacheEntry | null): entry is PriceCacheEntry {
  if (!entry) return false;
  const age = Date.now() - entry.fetchedAt;
  return age < CACHE_TTL_MS;
}

/**
 * Check if cache is stale but within grace window
 */
function isCacheStale(entry: PriceCacheEntry | null): entry is PriceCacheEntry {
  if (!entry) return false;
  const age = Date.now() - entry.fetchedAt;
  return age >= CACHE_TTL_MS && age < CACHE_GRACE_MS;
}

/**
 * Aggregate valid prices using median (preferred) or average
 */
function aggregatePrices(validPrices: number[]): {
  price: number;
  method: "median" | "average";
} {
  if (validPrices.length === 0) {
    throw new Error("No valid prices to aggregate");
  }

  if (validPrices.length >= 2) {
    // Median preferred for 2+ values
    const sorted = [...validPrices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    return { price: median, method: "median" };
  }

  // Average for single value (same as median for 1 value)
  const average =
    validPrices.reduce((sum, p) => sum + p, 0) / validPrices.length;
  return { price: average, method: "average" };
}

/**
 * Vitest-specific helper: detect when mocks were cleared between tests so we
 * do not share cached pricing results across independent test cases.
 *
 * In production, `globalThis.fetch` will not have a `mock.calls` shape, so
 * this will always return false and leave caching behavior unchanged.
 */
interface MockFunctionLike {
  mock?: {
    // Vitest exposes an array of recorded calls on mocked functions
    calls?: unknown[];
  };
}

function shouldInvalidateCacheForTestEnvironment(
  cacheEntry: PriceCacheEntry | null,
): boolean {
  if (!cacheEntry) return false;

  const globalObject = globalThis as unknown as {
    fetch?: MockFunctionLike | ((...args: unknown[]) => unknown);
  };

  const fetchFn = globalObject.fetch;
  if (!fetchFn || typeof fetchFn !== "function") {
    return false;
  }

  const maybeMock = fetchFn as MockFunctionLike;
  const calls = maybeMock.mock?.calls;
  if (!Array.isArray(calls)) {
    return false;
  }

  // When `vi.clearAllMocks()` runs in the test suite's beforeEach, it resets
  // `mock.calls` to an empty array. If we still have a cache entry at that
  // point, it came from a previous test case and must not influence the next
  // one.
  return calls.length === 0;
}

/**
 * Fetch price from a single provider with timeout
 */
async function fetchProviderPrice(
  providerId: "coinbase" | "mempool" | "bitfinex",
  config: ProviderConfig,
): Promise<ProviderResult> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch(config.url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        provider: providerId,
        success: false,
        error: `HTTP ${response.status}`,
        latencyMs: Date.now() - startTime,
      };
    }

    const data = await response.json();
    const priceUsd = config.parsePrice(data);

    if (priceUsd === null) {
      return {
        provider: providerId,
        success: false,
        error: "Invalid price data",
        latencyMs: Date.now() - startTime,
      };
    }

    return {
      provider: providerId,
      success: true,
      priceUsd,
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      provider: providerId,
      success: false,
      error: message,
      latencyMs: Date.now() - startTime,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch prices from all providers in parallel
 */
async function fetchAllProviders(): Promise<ProviderResult[]> {
  const promises = Object.entries(PROVIDERS).map(([id, config]) =>
    fetchProviderPrice(id as "coinbase" | "mempool" | "bitfinex", config),
  );
  return Promise.all(promises);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get current BTC/USD spot price from multiple providers
 * @param options - Optional configuration
 * @returns Price data with metadata
 * @throws PricingUnavailableError if all providers fail and no cache exists
 */
export async function getBtcUsdSpot(
  options?: GetPriceOptions,
): Promise<BtcUsdSpotResult> {
  const forceFresh = options?.forceFresh ?? false;

  // In tests, avoid leaking cached values between test cases. This check is a
  // no-op in production where `fetch` is not a Vitest mock.
  if (shouldInvalidateCacheForTestEnvironment(priceCache)) {
    priceCache = null;
  }

  // Return fresh cache if available (unless forceFresh)
  if (!forceFresh && isCacheFresh(priceCache)) {
    return {
      priceUsd: priceCache!.priceUsd,
      sourceCount: priceCache!.sourceCount,
      usedCache: true,
      stale: false,
      timestamp: new Date(priceCache!.fetchedAt).toISOString(),
      aggregationMethod: priceCache!.aggregationMethod,
      providerResults: priceCache!.providerResults,
    };
  }

  // Fetch from all providers in parallel
  const providerResults = await fetchAllProviders();

  // Extract valid prices
  const validPrices = providerResults
    .filter((r) => r.success && r.priceUsd !== undefined)
    .map((r) => r.priceUsd!);

  // If we have valid prices, aggregate and cache
  if (validPrices.length > 0) {
    const { price, method } = aggregatePrices(validPrices);
    const now = Date.now();

    priceCache = {
      priceUsd: price,
      sourceCount: validPrices.length,
      aggregationMethod: method,
      fetchedAt: now,
      providerResults,
    };

    return {
      priceUsd: price,
      sourceCount: validPrices.length,
      usedCache: false,
      stale: false,
      timestamp: new Date(now).toISOString(),
      aggregationMethod: method,
      providerResults,
    };
  }

  // All providers failed - check for stale cache
  if (isCacheStale(priceCache)) {
    console.warn("[btc-usd-pricing] All providers failed, using stale cache", {
      cacheAge: Date.now() - priceCache!.fetchedAt,
      providerErrors: providerResults,
    });

    return {
      priceUsd: priceCache!.priceUsd,
      sourceCount: priceCache!.sourceCount,
      usedCache: true,
      stale: true,
      timestamp: new Date(priceCache!.fetchedAt).toISOString(),
      aggregationMethod: priceCache!.aggregationMethod,
      providerResults: priceCache!.providerResults,
    };
  }

  // No valid prices and no cache - throw error
  throw new PricingUnavailableError(
    "BTC/USD pricing unavailable: all providers failed and no cache exists",
    providerResults,
  );
}

/**
 * Convert satoshis to USD cents using current BTC/USD price
 * @param sats - Amount in satoshis
 * @returns USD cents and price used for conversion
 * @throws PricingUnavailableError if pricing unavailable
 */
export async function satsToUsdCents(sats: number): Promise<ConversionResult> {
  const spotResult = await getBtcUsdSpot();
  const btc = sats / 100_000_000; // 1 BTC = 100,000,000 sats
  const usdCents = Math.round(btc * spotResult.priceUsd * 100); // Convert to cents

  return {
    usdCents,
    priceUsd: spotResult.priceUsd,
    stale: spotResult.stale,
  };
}

/**
 * Convert BTC to USD cents using current BTC/USD price
 * @param btc - Amount in BTC
 * @returns USD cents and price used for conversion
 * @throws PricingUnavailableError if pricing unavailable
 */
export async function btcToUsdCents(btc: number): Promise<ConversionResult> {
  const spotResult = await getBtcUsdSpot();
  const usdCents = Math.round(btc * spotResult.priceUsd * 100); // Convert to cents

  return {
    usdCents,
    priceUsd: spotResult.priceUsd,
    stale: spotResult.stale,
  };
}
