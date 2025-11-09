/**
 * SimpleProof Fee Estimation Wrapper Component
 * Fetches real-time Bitcoin fee estimates and passes them to SimpleProofTimestampButton
 * Handles loading states, error fallbacks, and displays fee information to users
 */

import type { FeeEstimateResponse } from "@/types/bitcoin-fees";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SimpleProofTimestampButton } from "./SimpleProofTimestampButton";

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

  useEffect(() => {
    fetchDynamicFeeEstimate();
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

  const formatCacheAge = (ms: number): string => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s ago`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
    return `${Math.round(ms / 3600000)}h ago`;
  };

  return (
    <div className="space-y-3">
      {/* Fee Estimate Display */}
      <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {feeLoading && <Loader2 className="h-4 w-4 animate-spin text-purple-400" />}
            <div>
              <p className="text-purple-300 text-xs font-semibold">
                Bitcoin Fee Estimate
              </p>
              <p className="text-white text-sm font-bold">
                {estimatedFeeSats} sats/vB
                {feeDetails?.cached && (
                  <span className="text-purple-300 text-xs ml-2">
                    (cached {formatCacheAge(feeDetails.cacheAge)})
                  </span>
                )}
              </p>
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

