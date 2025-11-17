/**
 * SimpleProof Fee Estimation Wrapper Component
 * Fetches real-time Bitcoin fee estimates and passes them to SimpleProofTimestampButton
 * Handles loading states, error fallbacks, and displays fee information to users
 */

import type { FeeEstimateResponse } from "@/types/bitcoin-fees";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SimpleProofTimestampButton } from "./SimpleProofTimestampButton";

interface BtcPriceApiResponseBody {
  success: boolean;
  price_usd: number;
  timestamp: string;
  cached: boolean;
  cache_expires_at: string;
  error?: string;
}

interface SimpleProofFeeEstimationWrapperProps {
  data: string; // JSON stringified data to timestamp
  verificationId: string; // UUID linking to verification record
  eventType:
  | "account_creation"
  | "key_rotation"
  | "nfc_registration"
  | "family_federation"
  | "guardian_role_change";
  onSuccess?: (result: {
    ots_proof: string;
    bitcoin_block: number | null;
    bitcoin_tx: string | null;
    verified_at: number;
  }) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
}

export default function SimpleProofFeeEstimationWrapper({
  data,
  verificationId,
  eventType,
  onSuccess,
  onError,
  disabled = false,
  className = "",
  variant = "primary",
  size = "md",
}: SimpleProofFeeEstimationWrapperProps) {
  const [estimatedFeeSats, setEstimatedFeeSats] = useState(500);
  const [feeLoading, setFeeLoading] = useState(true);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [showFeeDetails, setShowFeeDetails] = useState(false);
  const [feeDetails, setFeeDetails] = useState<{
    fastestFee: number;
    halfHourFee: number;
    hourFee: number;
    economyFee: number;
    minimumFee: number;
    cached: boolean;
    cacheAge: number;
    fallback: boolean;
    fallbackReason?: string;
  } | null>(null);

  const [btcPriceUsd, setBtcPriceUsd] = useState<number | null>(null);
  const [btcPriceLoading, setBtcPriceLoading] = useState(false);
  const [btcPriceError, setBtcPriceError] = useState<string | null>(null);
  const [btcPriceTimestamp, setBtcPriceTimestamp] = useState<string | null>(null);
  const [btcPriceCached, setBtcPriceCached] = useState<boolean | null>(null);
  const [btcPriceCacheExpiresAt, setBtcPriceCacheExpiresAt] =
    useState<string | null>(null);

  useEffect(() => {
    fetchDynamicFeeEstimate();
    fetchBtcPrice();
  }, []);

  async function fetchDynamicFeeEstimate() {
    setFeeLoading(true);
    setFeeError(null);

    try {
      const response = await fetch("/api/bitcoin-fee-estimate");
      const data = (await response.json()) as FeeEstimateResponse;

      if (data.success && data.data) {
        setEstimatedFeeSats(data.data.recommendedFee);
        setFeeDetails({
          fastestFee: data.data.fastestFee,
          halfHourFee: data.data.halfHourFee,
          hourFee: data.data.hourFee,
          economyFee: data.data.economyFee,
          minimumFee: data.data.minimumFee,
          cached: data.data.cached,
          cacheAge: data.data.cacheAge,
          fallback: data.data.fallback,
          fallbackReason: data.data.fallbackReason,
        });

        // Log fallback status for transparency
        if (data.data.fallback) {
          console.warn(
            `[SimpleProof] Using fallback fee estimate: ${data.data.fallbackReason}`
          );
          setFeeError(
            `Using fallback fee estimate: ${data.data.fallbackReason}`
          );
        }
      } else {
        console.warn("[SimpleProof] Fee estimation failed, using default 500 sats");
        setFeeError("Could not fetch real-time fees, using default estimate");
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      console.warn(`[SimpleProof] Failed to fetch fee estimate: ${errorMsg}`);
      setFeeError("Could not fetch real-time fees, using default estimate");
    } finally {
      setFeeLoading(false);
    }
  }

  const fetchBtcPrice = useCallback(async () => {
    setBtcPriceLoading(true);
    setBtcPriceError(null);

    try {
      const response = await fetch("/.netlify/functions/btc-price");
      const contentType = response.headers.get("content-type") || "";

      let data: BtcPriceApiResponseBody | null = null;

      if (contentType.includes("application/json")) {
        data = (await response.json()) as BtcPriceApiResponseBody;
      } else {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Non-JSON response from btc-price endpoint: ${text.slice(0, 200)}`
        );
      }

      if (!response.ok || !data || !data.success) {
        const errorMessage = data?.error || `HTTP ${response.status}`;
        console.warn("[SimpleProof] BTC price fetch failed", {
          provider: "mempool_space",
          error: errorMessage,
        });
        setBtcPriceError("Could not fetch BTC/USD price");
        return;
      }

      if (
        typeof data.price_usd !== "number" ||
        !Number.isFinite(data.price_usd)
      ) {
        console.warn("[SimpleProof] Invalid BTC price value", {
          provider: "mempool_space",
          data,
        });
        setBtcPriceError("Invalid BTC/USD price from server");
        return;
      }

      setBtcPriceUsd(data.price_usd);
      setBtcPriceTimestamp(data.timestamp);
      setBtcPriceCached(data.cached);
      setBtcPriceCacheExpiresAt(data.cache_expires_at);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn("[SimpleProof] Failed to fetch BTC price", {
        provider: "mempool_space",
        error: errorMsg,
      });
      setBtcPriceError("Could not fetch BTC/USD price");
    } finally {
      setBtcPriceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!btcPriceCacheExpiresAt) return;

    try {
      const expiresAtMs = new Date(btcPriceCacheExpiresAt).getTime();
      const now = Date.now();

      if (!Number.isFinite(expiresAtMs)) {
        return;
      }

      const delay = expiresAtMs - now;

      if (delay <= 0) {
        // Price is already stale; refresh immediately
        void fetchBtcPrice();
        return;
      }

      const timeoutId = setTimeout(() => {
        void fetchBtcPrice();
      }, delay);

      return () => clearTimeout(timeoutId);
    } catch {
      // Non-critical: ignore cache parsing errors
    }
  }, [btcPriceCacheExpiresAt, fetchBtcPrice]);

  const formatCacheAge = (ms: number): string => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s ago`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
    return `${Math.round(ms / 3600000)}h ago`;
  };

  const getTimestampAgeMs = (timestamp: string | null): number | null => {
    if (!timestamp) return null;
    const ts = new Date(timestamp).getTime();
    if (!Number.isFinite(ts)) return null;
    return Date.now() - ts;
  };

  const formatUsdEstimate = (feeSats: number, priceUsd: number): string => {
    if (!Number.isFinite(feeSats) || !Number.isFinite(priceUsd)) return "0.00";
    const usd = (feeSats / 100_000_000) * priceUsd;
    if (!Number.isFinite(usd)) return "0.00";
    return usd >= 0.01 ? usd.toFixed(2) : usd.toFixed(4);
  };

  const formatBtcPrice = (priceUsd: number): string => {
    if (!Number.isFinite(priceUsd)) return "0.00";
    return priceUsd.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const btcPriceAgeMs = getTimestampAgeMs(btcPriceTimestamp);

  return (
    <div className="space-y-3">
      {/* Fee Estimate Display */}
      <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {(feeLoading || btcPriceLoading) && (
              <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
            )}
            <div>
              <p className="text-purple-300 text-xs font-semibold">
                Bitcoin Fee Estimate
              </p>
              <p className="text-white text-sm font-bold">
                {estimatedFeeSats} sats/vB
                {btcPriceUsd !== null && !btcPriceLoading && !btcPriceError && (
                  <span className="text-purple-200 text-xs ml-2">
                    (~${formatUsdEstimate(estimatedFeeSats, btcPriceUsd)} USD)
                  </span>
                )}
                {feeDetails?.cached && (
                  <span className="text-purple-300 text-xs ml-2">
                    (cached {formatCacheAge(feeDetails.cacheAge)})
                  </span>
                )}
              </p>
              {btcPriceUsd !== null && btcPriceAgeMs !== null && !btcPriceError && (
                <p className="text-purple-300 text-[11px] mt-1">
                  BTC price ~${formatBtcPrice(btcPriceUsd)} USD
                  <span className="opacity-80">
                    {" "}
                    (updated {formatCacheAge(btcPriceAgeMs)}
                    {btcPriceCached ? ", cached" : ""})
                  </span>
                </p>
              )}
              {btcPriceError && (
                <p className="text-yellow-300 text-[11px] mt-1 italic">
                  ⚠️ BTC/USD price unavailable; showing sats only.
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowFeeDetails(!showFeeDetails)}
            className="text-purple-400 hover:text-purple-300 transition-colors"
            title="Show fee breakdown"
          >
            {showFeeDetails ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Fee Details Breakdown */}
        {showFeeDetails && feeDetails && (
          <div className="mt-3 pt-3 border-t border-purple-500/20 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-purple-400">Fastest (next block)</p>
                <p className="text-white font-semibold">
                  {feeDetails.fastestFee} sats/vB
                </p>
              </div>
              <div>
                <p className="text-purple-400">30 minutes</p>
                <p className="text-white font-semibold">
                  {feeDetails.halfHourFee} sats/vB
                </p>
              </div>
              <div>
                <p className="text-purple-400">1 hour (recommended)</p>
                <p className="text-white font-semibold">
                  {feeDetails.hourFee} sats/vB
                </p>
              </div>
              <div>
                <p className="text-purple-400">Economy</p>
                <p className="text-white font-semibold">
                  {feeDetails.economyFee} sats/vB
                </p>
              </div>
            </div>
            {feeDetails.fallback && (
              <p className="text-yellow-300 text-xs italic">
                ⚠️ {feeDetails.fallbackReason}
              </p>
            )}
          </div>
        )}

        {/* Error Message */}
        {feeError && (
          <p className="text-yellow-300 text-xs mt-2 italic">
            ⚠️ {feeError}
          </p>
        )}
      </div>

      {/* SimpleProof Button */}
      <SimpleProofTimestampButton
        data={data}
        verificationId={verificationId}
        eventType={eventType}
        estimatedFeeSats={estimatedFeeSats}
        requireConfirmation={true}
        onSuccess={onSuccess}
        onError={onError}
        disabled={disabled}
        className={className}
        variant={variant}
        size={size}
      />
    </div>
  );
}

