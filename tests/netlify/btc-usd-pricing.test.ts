/**
 * BTC/USD Pricing Utility Tests (Phase 1, Task 1.5)
 * Tests for multi-provider BTC/USD pricing with median aggregation and caching
 *
 * TEST COVERAGE:
 * - Provider response parsing (happy path + malformed)
 * - Aggregation logic (median vs average)
 * - Caching behavior (fresh vs stale vs no cache)
 * - Error behavior (all providers fail)
 * - Conversion functions (satsToUsdCents, btcToUsdCents)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  btcToUsdCents,
  getBtcUsdSpot,
  PricingUnavailableError,
  satsToUsdCents,
} from "../../netlify/functions/utils/btc-usd-pricing";

// Mock global fetch
global.fetch = vi.fn();

describe("BTC/USD Pricing Utility", () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    vi.clearAllMocks();
    // Clear module cache to reset in-memory cache
    vi.resetModules();
  });

  describe("Provider Response Parsing", () => {
    it("should parse valid Coinbase response", async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("coinbase")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { amount: "95000.50" } }),
          });
        }
        // Other providers fail
        return Promise.resolve({ ok: false, status: 500 });
      });

      const result = await getBtcUsdSpot();
      expect(result.priceUsd).toBe(95000.5);
      expect(result.sourceCount).toBe(1);
      expect(result.aggregationMethod).toBe("average");
    });

    it("should parse valid Mempool.space response", async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("mempool.space")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ USD: 94500.25 }),
          });
        }
        return Promise.resolve({ ok: false, status: 500 });
      });

      const result = await getBtcUsdSpot();
      expect(result.priceUsd).toBe(94500.25);
      expect(result.sourceCount).toBe(1);
    });

    it("should parse valid Bitfinex response", async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("bitfinex")) {
          // Bitfinex returns array with LAST_PRICE at index 6
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([0, 0, 0, 0, 0, 0, 95250.75, 0, 0, 0]),
          });
        }
        return Promise.resolve({ ok: false, status: 500 });
      });

      const result = await getBtcUsdSpot();
      expect(result.priceUsd).toBe(95250.75);
      expect(result.sourceCount).toBe(1);
    });

    it("should handle malformed Coinbase response", async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("coinbase")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { invalid: "field" } }),
          });
        }
        if (url.includes("mempool.space")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ USD: 95000 }),
          });
        }
        return Promise.resolve({ ok: false, status: 500 });
      });

      const result = await getBtcUsdSpot();
      // Should use Mempool.space price since Coinbase failed
      expect(result.priceUsd).toBe(95000);
      expect(result.sourceCount).toBe(1);
    });

    it("should handle malformed Bitfinex response (array too short)", async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("bitfinex")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([1, 2, 3]), // Too short
          });
        }
        if (url.includes("mempool.space")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ USD: 95000 }),
          });
        }
        return Promise.resolve({ ok: false, status: 500 });
      });

      const result = await getBtcUsdSpot();
      expect(result.priceUsd).toBe(95000);
      expect(result.sourceCount).toBe(1);
    });

    it("should reject negative prices", async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("coinbase")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { amount: "-100" } }),
          });
        }
        if (url.includes("mempool.space")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ USD: 95000 }),
          });
        }
        return Promise.resolve({ ok: false, status: 500 });
      });

      const result = await getBtcUsdSpot();
      expect(result.priceUsd).toBe(95000);
      expect(result.sourceCount).toBe(1);
    });
  });

  describe("Aggregation Logic", () => {
    it("should use median for 3 valid prices", async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("coinbase")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { amount: "95000" } }),
          });
        }
        if (url.includes("mempool.space")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ USD: 94000 }),
          });
        }
        if (url.includes("bitfinex")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([0, 0, 0, 0, 0, 0, 96000, 0, 0, 0]),
          });
        }
        return Promise.resolve({ ok: false, status: 500 });
      });

      const result = await getBtcUsdSpot();
      // Median of [94000, 95000, 96000] = 95000
      expect(result.priceUsd).toBe(95000);
      expect(result.sourceCount).toBe(3);
      expect(result.aggregationMethod).toBe("median");
    });

    it("should use median for 2 valid prices (average of middle two)", async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("coinbase")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { amount: "94000" } }),
          });
        }
        if (url.includes("mempool.space")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ USD: 96000 }),
          });
        }
        return Promise.resolve({ ok: false, status: 500 });
      });

      const result = await getBtcUsdSpot();
      // Median of [94000, 96000] = (94000 + 96000) / 2 = 95000
      expect(result.priceUsd).toBe(95000);
      expect(result.sourceCount).toBe(2);
      expect(result.aggregationMethod).toBe("median");
    });

    it("should use average for 1 valid price", async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("mempool.space")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ USD: 95000 }),
          });
        }
        return Promise.resolve({ ok: false, status: 500 });
      });

      const result = await getBtcUsdSpot();
      expect(result.priceUsd).toBe(95000);
      expect(result.sourceCount).toBe(1);
      expect(result.aggregationMethod).toBe("average");
    });

    it("should handle outlier prices correctly with median", async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("coinbase")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { amount: "95000" } }),
          });
        }
        if (url.includes("mempool.space")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ USD: 94500 }),
          });
        }
        if (url.includes("bitfinex")) {
          // Outlier price (much higher)
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([0, 0, 0, 0, 0, 0, 150000, 0, 0, 0]),
          });
        }
        return Promise.resolve({ ok: false, status: 500 });
      });

      const result = await getBtcUsdSpot();
      // Median of [94500, 95000, 150000] = 95000 (outlier ignored)
      expect(result.priceUsd).toBe(95000);
      expect(result.sourceCount).toBe(3);
      expect(result.aggregationMethod).toBe("median");
    });
  });

  describe("Caching Behavior", () => {
    it("should cache fresh results for 60 seconds", async () => {
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ USD: 95000 }),
        }),
      );

      // First call - should fetch
      const result1 = await getBtcUsdSpot();
      expect(result1.usedCache).toBe(false);
      expect(result1.stale).toBe(false);

      // Second call immediately - should use cache
      const result2 = await getBtcUsdSpot();
      expect(result2.usedCache).toBe(true);
      expect(result2.stale).toBe(false);
      expect(result2.priceUsd).toBe(95000);

      // Verify fetch was only called once (3 providers in parallel)
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("should bypass cache with forceFresh option", async () => {
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ USD: 95000 }),
        }),
      );

      // First call
      await getBtcUsdSpot();
      expect(global.fetch).toHaveBeenCalledTimes(3);

      // Second call with forceFresh - should fetch again
      await getBtcUsdSpot({ forceFresh: true });
      expect(global.fetch).toHaveBeenCalledTimes(6); // 3 + 3
    });
  });

  describe("Error Handling", () => {
    it("should throw PricingUnavailableError when all providers fail and no cache", async () => {
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({ ok: false, status: 500 }),
      );

      await expect(getBtcUsdSpot()).rejects.toThrow(PricingUnavailableError);
      await expect(getBtcUsdSpot()).rejects.toThrow(
        "BTC/USD pricing unavailable",
      );
    });

    it("should include provider errors in PricingUnavailableError", async () => {
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({ ok: false, status: 503 }),
      );

      try {
        await getBtcUsdSpot();
        expect.fail("Should have thrown PricingUnavailableError");
      } catch (error) {
        expect(error).toBeInstanceOf(PricingUnavailableError);
        const pricingError = error as PricingUnavailableError;
        expect(pricingError.providerErrors).toHaveLength(3);
        expect(pricingError.providerErrors.every((r) => !r.success)).toBe(true);
      }
    });
  });

  describe("Conversion Functions", () => {
    beforeEach(() => {
      // Mock successful price fetch
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ USD: 100000 }), // $100k BTC
        }),
      );
    });

    it("should convert sats to USD cents correctly", async () => {
      const result = await satsToUsdCents(100_000_000); // 1 BTC
      expect(result.usdCents).toBe(10_000_000); // $100,000 = 10,000,000 cents
      expect(result.priceUsd).toBe(100000);
      expect(result.stale).toBe(false);
    });

    it("should convert small sat amounts correctly", async () => {
      const result = await satsToUsdCents(10); // 10 sats = 0.00000010 BTC
      expect(result.usdCents).toBe(1); // $0.01 = 1 cent at $100k/BTC
      expect(result.priceUsd).toBe(100000);
    });

    it("should convert BTC to USD cents correctly", async () => {
      const result = await btcToUsdCents(1); // 1 BTC
      expect(result.usdCents).toBe(10_000_000); // $100,000 = 10,000,000 cents
      expect(result.priceUsd).toBe(100000);
    });

    it("should convert fractional BTC correctly", async () => {
      const result = await btcToUsdCents(0.5); // 0.5 BTC
      expect(result.usdCents).toBe(5_000_000); // $50,000 = 5,000,000 cents
    });

    it("should round USD cents to nearest integer", async () => {
      const result = await satsToUsdCents(123); // Small amount
      expect(Number.isInteger(result.usdCents)).toBe(true);
    });
  });
});
