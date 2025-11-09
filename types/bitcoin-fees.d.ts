/**
 * Bitcoin Fee Estimation Types
 * Mempool.space API response structures and fee estimation data
 */

/**
 * Mempool.space fee estimate response
 * All values in satoshis per byte (sat/vB)
 */
export interface MempoolFeeEstimate {
  fastestFee: number; // sat/vB for next block (~10 minutes)
  halfHourFee: number; // sat/vB for ~30 minutes
  hourFee: number; // sat/vB for ~1 hour
  economyFee: number; // sat/vB for economy rate (~2+ hours)
  minimumFee: number; // sat/vB minimum
}

/**
 * Fee estimate response from bitcoin-fee-estimate Netlify Function
 */
export interface FeeEstimateResponse {
  success: boolean;
  data?: {
    fastestFee: number; // sat/vB for next block
    halfHourFee: number; // sat/vB for ~30 minutes
    hourFee: number; // sat/vB for ~1 hour
    economyFee: number; // sat/vB for economy rate
    minimumFee: number; // sat/vB minimum
    recommendedFee: number; // Suggested fee (hourFee) - use this for SimpleProof
    cached: boolean; // Whether result came from in-memory cache
    cacheAge: number; // Age of cache in milliseconds
    fallback: boolean; // True if using fallback (last known or 500 sats default)
    fallbackReason?: string; // Why fallback was used (e.g., "API timeout", "no cache")
  };
  error?: string;
}

/**
 * Internal cache entry structure for Netlify Function
 */
export interface CacheEntry {
  fees: MempoolFeeEstimate;
  timestamp: number;
}

