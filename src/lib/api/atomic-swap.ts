/**
 * @fileoverview Atomic Swap API Client
 * @description Client-side API for atomic swaps between Fedimint and Cashu via Lightning
 */

import { ApiClient } from "../api";
import type {
  AtomicSwapRequest,
  AtomicSwapResult,
} from "../internal-lightning-bridge";

interface SwapQuoteRequest {
  fromContext: "family" | "individual";
  toContext: "family" | "individual";
  amount: number;
  swapType: "fedimint_to_cashu" | "cashu_to_fedimint";
}

interface SwapQuote {
  success: boolean;
  estimatedFees: {
    fedimintFee: number;
    lightningFee: number;
    cashuFee: number;
    totalFee: number;
  };
  estimatedTotal: number;
  estimatedDuration: string;
  error?: string;
}

interface SwapStatusResponse {
  success: boolean;
  swap?: {
    swapId: string;
    status: "initiated" | "processing" | "completed" | "failed";
    amount: number;
    fromContext: string;
    toContext: string;
    createdAt: string;
    completedAt?: string;
    error?: string;
  };
  logs?: Array<{
    step: number;
    description: string;
    status: string;
    txId?: string;
    timestamp: string;
  }>;
  error?: string;
}

class AtomicSwapAPI extends ApiClient {
  /**
   * Get a quote for an atomic swap
   */
  async getSwapQuote(request: SwapQuoteRequest): Promise<SwapQuote> {
    return this.request("/api/atomic-swap/quote", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Execute an atomic swap
   */
  async executeSwap(request: AtomicSwapRequest): Promise<AtomicSwapResult> {
    return this.request("/api/atomic-swap/execute", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Get swap status and transaction history
   */
  async getSwapStatus(swapId: string): Promise<SwapStatusResponse> {
    return this.request(`/api/atomic-swap/status/${swapId}`, {
      method: "GET",
    });
  }

  /**
   * Get user's swap history
   */
  async getSwapHistory(
    memberId: string,
    limit: number = 10
  ): Promise<{
    success: boolean;
    swaps?: Array<any>;
    error?: string;
  }> {
    return this.request(`/api/atomic-swap/history/${memberId}?limit=${limit}`, {
      method: "GET",
    });
  }

  /**
   * Cancel a pending swap (if possible)
   */
  async cancelSwap(swapId: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    return this.request(`/api/atomic-swap/cancel/${swapId}`, {
      method: "POST",
    });
  }
}

// Export singleton instance
export const atomicSwapAPI = new AtomicSwapAPI();
export type {
  AtomicSwapRequest,
  AtomicSwapResult,
  SwapQuote,
  SwapQuoteRequest,
  SwapStatusResponse,
};
