/**
 * @fileoverview Atomic Swap API Client
 * @description Client-side API for atomic swaps between Fedimint and Cashu via Lightning
 */

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

// Lazy ApiClient import to avoid circular dependencies
let ApiClient: any = null;

class AtomicSwapAPI {
  private apiClient: any = null;

  constructor() {
    // Lazy initialization of ApiClient using dynamic import
    this.initializeApiClient();
  }

  private async initializeApiClient() {
    if (!ApiClient) {
      const apiModule = await import("../api");
      ApiClient = apiModule.ApiClient;
    }
    this.apiClient = new ApiClient();
  }

  /**
   * Get a quote for an atomic swap
   */
  async getSwapQuote(request: SwapQuoteRequest): Promise<SwapQuote> {
    await this.ensureApiClient();
    return this.apiClient.request("/api/atomic-swap/quote", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Execute an atomic swap
   */
  async executeSwap(request: AtomicSwapRequest): Promise<AtomicSwapResult> {
    await this.ensureApiClient();
    return this.apiClient.request("/api/atomic-swap/execute", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Get swap status and transaction history
   */
  async getSwapStatus(swapId: string): Promise<SwapStatusResponse> {
    await this.ensureApiClient();
    return this.apiClient.request(`/api/atomic-swap/status/${swapId}`, {
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
    await this.ensureApiClient();
    return this.apiClient.request(
      `/api/atomic-swap/history/${memberId}?limit=${limit}`,
      {
        method: "GET",
      }
    );
  }

  /**
   * Cancel a pending swap (if possible)
   */
  async cancelSwap(swapId: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    await this.ensureApiClient();
    return this.apiClient.request(`/api/atomic-swap/cancel/${swapId}`, {
      method: "POST",
    });
  }

  private async ensureApiClient() {
    if (!this.apiClient) {
      await this.initializeApiClient();
    }
  }
}

// Export singleton instance lazily to avoid circular dependencies
let _atomicSwapAPI: AtomicSwapAPI | null = null;

export function getAtomicSwapAPI(): AtomicSwapAPI {
  if (!_atomicSwapAPI) {
    _atomicSwapAPI = new AtomicSwapAPI();
  }
  return _atomicSwapAPI;
}

// Export a getter for backward compatibility
export const atomicSwapAPI = new Proxy({} as AtomicSwapAPI, {
  get(target, prop) {
    return getAtomicSwapAPI()[prop as keyof AtomicSwapAPI];
  },
});

export type {
  AtomicSwapRequest,
  AtomicSwapResult,
  SwapQuote,
  SwapQuoteRequest,
  SwapStatusResponse,
};
