/**
 * Fedimint Client for Satnam Family Banking
 *
 * Provides integration with Fedimint federation for eCash operations
 * Handles atomic swaps, balance management, and transaction processing
 *
 * @fileoverview Fedimint federation client for eCash operations
 */

import axios, { AxiosResponse } from "axios";

// Fedimint API Types
interface FedimintBalance {
  ecash: number;
  lightning: number;
}

interface FedimintTransaction {
  txId: string;
  amount: number;
  fee: number;
  timestamp: number;
  type: "deposit" | "withdrawal" | "transfer";
  status: "pending" | "confirmed" | "failed";
}

interface FedimintRedemptionRequest {
  memberId: string;
  amount: number;
  lightningInvoice: string;
  swapId: string;
}

interface FedimintRedemptionResult {
  success: boolean;
  txId?: string;
  fee?: number;
  error?: string;
}

interface FedimintClientConfig {
  federationId: string;
  gatewayUrl: string;
  apiToken: string;
  network: "mainnet" | "testnet" | "regtest";
}

export class FedimintClient {
  private config: FedimintClientConfig;
  private axiosInstance;

  constructor() {
    // Environment variable helper for both Vite and Node.js
    const getEnvVar = (key: string): string => {
      return import.meta.env[key] || "";
    };

    this.config = {
      federationId:
        getEnvVar("VITE_FEDIMINT_FEDERATION_ID") || "test_federation",
      gatewayUrl:
        getEnvVar("VITE_FEDIMINT_GATEWAY_URL") || "http://127.0.0.1:8080",
      apiToken: getEnvVar("VITE_FEDIMINT_API_TOKEN") || "",
      network: (getEnvVar("VITE_FEDIMINT_NETWORK") as any) || "testnet",
    };

    // Initialize HTTP client with authentication
    this.axiosInstance = axios.create({
      baseURL: this.config.gatewayUrl,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30 second timeout
    });

    console.log("🏦 Fedimint Client initialized:", {
      federationId: this.config.federationId,
      gatewayUrl: this.config.gatewayUrl,
      network: this.config.network,
    });
  }

  /**
   * Get Fedimint eCash balance for a family member
   */
  async getBalance(memberId: string): Promise<number> {
    try {
      const response: AxiosResponse<FedimintBalance> =
        await this.axiosInstance.get(`/balance/${memberId}`);
      return response.data.ecash;
    } catch (error) {
      console.error("❌ Failed to get Fedimint balance:", error);
      throw new Error(`Failed to get balance: ${error}`);
    }
  }

  /**
   * Execute atomic redemption to pay Lightning invoice
   */
  async atomicRedeemToPay(
    request: FedimintRedemptionRequest
  ): Promise<FedimintRedemptionResult> {
    try {
      const response: AxiosResponse<FedimintRedemptionResult> =
        await this.axiosInstance.post("/atomic-redeem", {
          member_id: request.memberId,
          amount: request.amount,
          lightning_invoice: request.lightningInvoice,
          swap_id: request.swapId,
        });

      console.log(`⚡ Fedimint atomic redemption: ${request.amount} sats`);
      return response.data;
    } catch (error) {
      console.error("❌ Fedimint atomic redemption failed:", error);
      return {
        success: false,
        error: `Atomic redemption failed: ${error}`,
      };
    }
  }

  /**
   * Rollback a failed redemption
   */
  async rollbackRedemption(swapId: string): Promise<void> {
    try {
      await this.axiosInstance.post("/rollback-redemption", {
        swap_id: swapId,
      });
      console.log(`🔄 Rolled back Fedimint redemption: ${swapId}`);
    } catch (error) {
      console.error("❌ Failed to rollback Fedimint redemption:", error);
      throw new Error(`Rollback failed: ${error}`);
    }
  }

  /**
   * Get transaction history for a family member
   */
  async getTransactionHistory(
    memberId: string,
    limit: number = 50
  ): Promise<FedimintTransaction[]> {
    try {
      const response: AxiosResponse<FedimintTransaction[]> =
        await this.axiosInstance.get(
          `/transactions/${memberId}?limit=${limit}`
        );
      return response.data;
    } catch (error) {
      console.error("❌ Failed to get Fedimint transaction history:", error);
      throw new Error(`Failed to get transaction history: ${error}`);
    }
  }

  /**
   * Deposit eCash to family member account
   */
  async depositEcash(
    memberId: string,
    amount: number,
    notes: string
  ): Promise<FedimintTransaction> {
    try {
      const response: AxiosResponse<FedimintTransaction> =
        await this.axiosInstance.post("/deposit", {
          member_id: memberId,
          amount,
          ecash_notes: notes,
        });

      console.log(`💰 Deposited ${amount} sats eCash for ${memberId}`);
      return response.data;
    } catch (error) {
      console.error("❌ Failed to deposit eCash:", error);
      throw new Error(`Deposit failed: ${error}`);
    }
  }

  /**
   * Withdraw eCash from family member account
   */
  async withdrawEcash(
    memberId: string,
    amount: number
  ): Promise<{ notes: string; txId: string }> {
    try {
      const response: AxiosResponse<{ notes: string; txId: string }> =
        await this.axiosInstance.post("/withdraw", {
          member_id: memberId,
          amount,
        });

      console.log(`💸 Withdrew ${amount} sats eCash for ${memberId}`);
      return response.data;
    } catch (error) {
      console.error("❌ Failed to withdraw eCash:", error);
      throw new Error(`Withdrawal failed: ${error}`);
    }
  }

  /**
   * Check federation status and connectivity
   */
  async getFederationInfo(): Promise<{
    federationId: string;
    guardians: number;
    network: string;
    blockHeight: number;
  }> {
    try {
      const response = await this.axiosInstance.get("/federation-info");
      return response.data;
    } catch (error) {
      console.error("❌ Failed to get federation info:", error);
      throw new Error(`Federation unreachable: ${error}`);
    }
  }
}

export type {
  FedimintBalance,
  FedimintClientConfig,
  FedimintRedemptionRequest,
  FedimintRedemptionResult,
  FedimintTransaction,
};
