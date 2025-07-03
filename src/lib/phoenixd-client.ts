/**
 * PhoenixD LSP Client for Satnam Family Banking
 *
 * Replaces Zeus Olympus integration with PhoenixD self-custodial lightning
 * Provides automated liquidity management and zero-configuration setup
 *
 * @fileoverview PhoenixD Lightning Service Provider client
 */

import axios, { AxiosResponse } from "axios";
import {
  SatnamPrivacyLayer,
  type PrivacyWrappedInvoice,
} from "../../lib/privacy/lnproxy-privacy";

// PhoenixD API Types
interface PhoenixdNodeInfo {
  nodeId: string;
  alias: string;
  blockHeight: number;
  version: string;
  network: "mainnet" | "testnet" | "regtest";
}

interface PhoenixdBalance {
  balanceSat: number;
  feeCreditSat: number;
}

interface PhoenixdChannel {
  channelId: string;
  nodeId: string;
  data: {
    commitments: {
      localCommit: {
        spec: {
          toLocal: number;
          toRemote: number;
        };
      };
    };
  };
  state: "NORMAL" | "OFFLINE" | "SYNCING" | "WAIT_FOR_FUNDING_CONFIRMED";
}

interface PhoenixdInvoice {
  serialized: string;
  paymentHash: string;
  description: string;
  preimage?: string;
  amountSat: number;
  fees: number;
  invoice: string;
  completedAt?: number;
  createdAt: number;
}

interface PhoenixdPayment {
  paymentId: string;
  paymentHash: string;
  preimage?: string;
  isPaid: boolean;
  sent: number;
  fees: number;
  invoice: string;
  completedAt?: number;
  createdAt: number;
}

interface PhoenixdLiquidityRequest {
  amountSat: number;
  channelId?: string;
  fundingFeeSat?: number;
}

interface PhoenixdLiquidityResponse {
  txId: string;
  amountSat: number;
  feeSat: number;
  fundingFeeSat: number;
  channelId: string;
}

// Note: PhoenixdError interface reserved for future error handling enhancement
// interface PhoenixdError {
//   error: string;
//   reason: string;
// }

interface FamilyChannelConfig {
  username: string;
  minChannelSize: number;
  maxChannelSize: number;
  paymentTarget: number;
  autoLiquidity: boolean;
}

interface FamilyTransaction {
  id: string;
  familyMember: string;
  type: "incoming" | "outgoing";
  amountSat: number;
  feeSat: number;
  timestamp: number;
  paymentHash: string;
  description?: string;
  tags: string[];
}

interface FamilyMemberBalance {
  familyMember: string;
  balanceSat: number;
  incomingSat: number;
  outgoingSat: number;
  feesSat: number;
  transactionCount: number;
  lastActivity?: number;
}

interface PhoenixdClientConfig {
  host: string;
  apiToken: string;
  username: string;
  minChannelSize: number;
  familyEnabled: boolean;
}

export class PhoenixdClient {
  private config: PhoenixdClientConfig;
  private privacyLayer: SatnamPrivacyLayer;
  private axiosInstance;
  private familyTransactions: Map<string, FamilyTransaction[]> = new Map();
  private familyBalances: Map<string, FamilyMemberBalance> = new Map();

  constructor() {
    // Environment variable helper for browser
    const getEnvVar = (key: string): string => {
      return import.meta.env[key] || "";
    };

    this.config = {
      host: getEnvVar("VITE_PHOENIXD_HOST") || "http://127.0.0.1:9740",
      apiToken: getEnvVar("VITE_PHOENIXD_API_TOKEN") || "",
      username: getEnvVar("VITE_PHOENIXD_USERNAME") || "phoenix",
      minChannelSize: parseInt(
        getEnvVar("VITE_PHOENIXD_MIN_CHANNEL_SIZE") || "50000"
      ),
      familyEnabled: getEnvVar("VITE_FAMILY_PHOENIXD_ENABLED") === "true",
    };

    // Initialize HTTP client with authentication
    this.axiosInstance = axios.create({
      baseURL: this.config.host,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30 second timeout
    });

    // Initialize privacy layer integration
    this.privacyLayer = new SatnamPrivacyLayer();

    console.log("🔥 PhoenixD Client initialized:", {
      host: this.config.host,
      familyEnabled: this.config.familyEnabled,
      minChannelSize: this.config.minChannelSize,
    });
  }

  /**
   * Get PhoenixD node information and status
   */
  async getNodeInfo(): Promise<PhoenixdNodeInfo> {
    try {
      const response: AxiosResponse<PhoenixdNodeInfo> =
        await this.axiosInstance.get("/getinfo");
      return response.data;
    } catch (error) {
      console.error("❌ Failed to get PhoenixD node info:", error);
      throw new Error(`PhoenixD node unreachable: ${error}`);
    }
  }

  /**
   * Get current balance including fee credits
   */
  async getBalance(): Promise<PhoenixdBalance> {
    try {
      const response: AxiosResponse<PhoenixdBalance> =
        await this.axiosInstance.get("/getbalance");
      return response.data;
    } catch (error) {
      console.error("❌ Failed to get PhoenixD balance:", error);
      throw new Error(`Failed to get balance: ${error}`);
    }
  }

  /**
   * List all channels with detailed state information
   */
  async listChannels(): Promise<PhoenixdChannel[]> {
    try {
      const response: AxiosResponse<PhoenixdChannel[]> =
        await this.axiosInstance.get("/listchannels");
      return response.data;
    } catch (error) {
      console.error("❌ Failed to list PhoenixD channels:", error);
      throw new Error(`Failed to list channels: ${error}`);
    }
  }

  /**
   * Create invoice with optional privacy wrapping and family member tracking
   */
  async createInvoice(
    amountSat: number,
    description: string,
    enablePrivacy: boolean = true,
    familyMember?: string
  ): Promise<PhoenixdInvoice & { privacy?: PrivacyWrappedInvoice }> {
    try {
      if (amountSat < 1) {
        throw new Error("Amount must be at least 1 satoshi");
      }

      const requestData = {
        amountSat,
        description: description || "Satnam.pub family payment",
      };

      const response: AxiosResponse<PhoenixdInvoice> =
        await this.axiosInstance.post("/createinvoice", requestData);
      const invoice = response.data;

      console.log(`⚡ Created PhoenixD invoice: ${amountSat} sats`);

      // Track invoice creation for family member (when paid, we'll track as incoming)
      if (familyMember && this.config.familyEnabled) {
        // Note: We'll track the actual payment when the invoice is paid
        console.log(`📝 Invoice created for family member: ${familyMember}`);
      }

      // Add privacy protection if enabled
      if (enablePrivacy && this.config.familyEnabled) {
        try {
          const privacyWrapped = await this.privacyLayer.wrapInvoiceForPrivacy(
            invoice.serialized,
            description
          );

          return {
            ...invoice,
            serialized: privacyWrapped.wrappedInvoice, // Use privacy-wrapped invoice
            privacy: privacyWrapped,
          };
        } catch (error) {
          console.warn(
            "⚠️ Privacy wrapping failed, using direct invoice:",
            error
          );
          return {
            ...invoice,
            privacy: {
              wrappedInvoice: invoice.serialized,
              originalInvoice: invoice.serialized,
              privacyFee: 0,
              isPrivacyEnabled: false,
            },
          };
        }
      }

      return invoice;
    } catch (error) {
      console.error("❌ Failed to create PhoenixD invoice:", error);
      throw new Error(`Failed to create invoice: ${error}`);
    }
  }

  /**
   * Pay a Lightning invoice with family member tracking
   */
  async payInvoice(
    invoice: string,
    amountSat?: number,
    familyMember?: string
  ): Promise<PhoenixdPayment> {
    try {
      const requestData: Record<string, unknown> = { invoice };
      if (amountSat) {
        requestData.amountSat = amountSat;
      }

      const response: AxiosResponse<PhoenixdPayment> =
        await this.axiosInstance.post("/payinvoice", requestData);
      console.log(
        `💸 Paid invoice: ${response.data.sent} sats (fees: ${response.data.fees})`
      );

      // Track outgoing payment for family member
      if (familyMember && this.config.familyEnabled && response.data.isPaid) {
        this.trackFamilyTransaction(familyMember, {
          type: "outgoing",
          amountSat: response.data.sent,
          feeSat: response.data.fees,
          timestamp: response.data.completedAt || Date.now(),
          paymentHash: response.data.paymentHash,
          description: `Payment from ${familyMember}`,
          tags: ["payment", "outgoing"],
        });
      }

      return response.data;
    } catch (error) {
      console.error("❌ Failed to pay invoice:", error);
      throw new Error(`Payment failed: ${error}`);
    }
  }

  /**
   * Request automated liquidity for family member
   */
  async requestLiquidity(
    request: PhoenixdLiquidityRequest
  ): Promise<PhoenixdLiquidityResponse> {
    try {
      if (request.amountSat < this.config.minChannelSize) {
        throw new Error(
          `Liquidity amount must be at least ${this.config.minChannelSize} sats`
        );
      }

      const response: AxiosResponse<PhoenixdLiquidityResponse> =
        await this.axiosInstance.post("/openschannel", {
          amountSat: request.amountSat,
          channelId: request.channelId,
          fundingFeeSat: request.fundingFeeSat,
        });

      console.log(
        `🌊 Requested liquidity: ${request.amountSat} sats (Channel: ${response.data.channelId})`
      );
      return response.data;
    } catch (error) {
      console.error("❌ Failed to request liquidity:", error);
      throw new Error(`Liquidity request failed: ${error}`);
    }
  }

  /**
   * Create a family-specific invoice with enhanced privacy
   */
  async createFamilyInvoice(
    familyMember: string,
    amountSat: number,
    purpose?: string,
    options?: { enablePrivacy?: boolean }
  ): Promise<PhoenixdInvoice & { privacy?: PrivacyWrappedInvoice }> {
    const description = purpose
      ? `Payment to ${familyMember}@satnam.pub: ${purpose}`
      : `Payment to ${familyMember}@satnam.pub`;

    const enablePrivacy = options?.enablePrivacy !== false; // Default to true for family invoices
    const invoice = await this.createInvoice(
      amountSat,
      description,
      enablePrivacy,
      familyMember
    );

    // For family invoices with privacy enabled, ensure privacy protection worked
    if (
      enablePrivacy &&
      (!invoice.privacy || !invoice.privacy.isPrivacyEnabled)
    ) {
      throw new Error("Privacy protection failed for family invoice");
    }

    return invoice as PhoenixdInvoice & { privacy?: PrivacyWrappedInvoice };
  }

  /**
   * Track a transaction for a specific family member
   */
  trackFamilyTransaction(
    familyMember: string,
    transaction: Omit<FamilyTransaction, "id" | "familyMember">
  ): void {
    const transactionId = `${transaction.paymentHash}-${Date.now()}`;
    const familyTransaction: FamilyTransaction = {
      id: transactionId,
      familyMember,
      ...transaction,
    };

    // Add to family transactions
    if (!this.familyTransactions.has(familyMember)) {
      this.familyTransactions.set(familyMember, []);
    }
    this.familyTransactions.get(familyMember)!.push(familyTransaction);

    // Update family member balance
    this.updateFamilyMemberBalance(familyMember, familyTransaction);

    console.log(`📊 Tracked transaction for ${familyMember}:`, {
      type: transaction.type,
      amount: transaction.amountSat,
      fees: transaction.feeSat,
    });
  }

  /**
   * Update family member balance based on transaction
   */
  private updateFamilyMemberBalance(
    familyMember: string,
    transaction: FamilyTransaction
  ): void {
    const balance = this.familyBalances.get(familyMember) || {
      familyMember,
      balanceSat: 0,
      incomingSat: 0,
      outgoingSat: 0,
      feesSat: 0,
      transactionCount: 0,
    };

    balance.transactionCount++;
    balance.feesSat += transaction.feeSat;
    balance.lastActivity = transaction.timestamp;

    if (transaction.type === "incoming") {
      balance.incomingSat += transaction.amountSat;
      balance.balanceSat += transaction.amountSat;
    } else {
      balance.outgoingSat += transaction.amountSat;
      balance.balanceSat -= transaction.amountSat + transaction.feeSat;
    }

    this.familyBalances.set(familyMember, balance);
  }

  /**
   * Get family member balance from transaction history
   */
  async getFamilyMemberBalance(
    familyMember: string
  ): Promise<FamilyMemberBalance> {
    // Check if we have cached balance
    let balance = this.familyBalances.get(familyMember);

    if (!balance) {
      // Initialize balance for new family member
      balance = {
        familyMember,
        balanceSat: 0,
        incomingSat: 0,
        outgoingSat: 0,
        feesSat: 0,
        transactionCount: 0,
      };
      this.familyBalances.set(familyMember, balance);
    }

    return { ...balance };
  }

  /**
   * Get all family member transactions
   */
  getFamilyMemberTransactions(familyMember: string): FamilyTransaction[] {
    return [...(this.familyTransactions.get(familyMember) || [])];
  }

  /**
   * Initialize family member with starting balance
   */
  async initializeFamilyMember(
    familyMember: string,
    initialBalanceSat: number = 0
  ): Promise<void> {
    if (initialBalanceSat > 0) {
      this.trackFamilyTransaction(familyMember, {
        type: "incoming",
        amountSat: initialBalanceSat,
        feeSat: 0,
        timestamp: Date.now(),
        paymentHash: `init-${familyMember}-${Date.now()}`,
        description: "Initial family member balance",
        tags: ["initialization", "family-setup"],
      });
    }

    console.log(
      `👤 Initialized family member ${familyMember} with ${initialBalanceSat} sats`
    );
  }

  /**
   * Track an incoming payment for a family member (when their invoice is paid)
   */
  async trackIncomingPayment(
    familyMember: string,
    paymentHash: string,
    amountSat: number,
    feeSat: number = 0,
    description?: string
  ): Promise<void> {
    this.trackFamilyTransaction(familyMember, {
      type: "incoming",
      amountSat,
      feeSat,
      timestamp: Date.now(),
      paymentHash,
      description: description || `Incoming payment to ${familyMember}`,
      tags: ["payment", "incoming"],
    });

    console.log(
      `📥 Tracked incoming payment for ${familyMember}: ${amountSat} sats`
    );
  }

  /**
   * Get all family members with balances
   */
  getAllFamilyBalances(): FamilyMemberBalance[] {
    return Array.from(this.familyBalances.values());
  }

  /**
   * Check if family member needs liquidity
   */
  async checkFamilyLiquidity(
    familyMember: string,
    targetAmount: number
  ): Promise<{
    needsLiquidity: boolean;
    currentBalance: number;
    recommendedTopup: number;
    globalBalance?: number;
    memberTransactionCount: number;
  }> {
    try {
      // Get per-member balance from transaction history
      const memberBalance = await this.getFamilyMemberBalance(familyMember);

      // Also get global balance for reference
      const globalBalance = await this.getBalance();

      const needsLiquidity = memberBalance.balanceSat < targetAmount;
      const recommendedTopup = needsLiquidity
        ? Math.max(this.config.minChannelSize, targetAmount * 2)
        : 0;

      console.log(`💰 Family liquidity check for ${familyMember}:`, {
        memberBalance: memberBalance.balanceSat,
        globalBalance: globalBalance.balanceSat,
        targetAmount,
        needsLiquidity,
        recommendedTopup,
        transactionCount: memberBalance.transactionCount,
      });

      return {
        needsLiquidity,
        currentBalance: memberBalance.balanceSat,
        recommendedTopup,
        globalBalance: globalBalance.balanceSat,
        memberTransactionCount: memberBalance.transactionCount,
      };
    } catch (error) {
      console.error("❌ Failed to check family liquidity:", error);
      throw new Error(`Liquidity check failed: ${error}`);
    }
  }

  /**
   * Transfer balance between family members (internal accounting)
   */
  async transferBetweenFamilyMembers(
    fromMember: string,
    toMember: string,
    amountSat: number,
    description?: string
  ): Promise<{
    success: boolean;
    fromBalance: number;
    toBalance: number;
    transactionId: string;
  }> {
    try {
      if (amountSat <= 0) {
        throw new Error("Transfer amount must be positive");
      }

      const fromBalance = await this.getFamilyMemberBalance(fromMember);
      if (fromBalance.balanceSat < amountSat) {
        throw new Error(
          `Insufficient balance: ${fromBalance.balanceSat} < ${amountSat}`
        );
      }

      const transactionId = `transfer-${Date.now()}`;
      const transferDescription =
        description || `Transfer from ${fromMember} to ${toMember}`;

      // Track outgoing for sender
      this.trackFamilyTransaction(fromMember, {
        type: "outgoing",
        amountSat,
        feeSat: 0,
        timestamp: Date.now(),
        paymentHash: transactionId,
        description: transferDescription,
        tags: ["transfer", "family-internal"],
      });

      // Track incoming for receiver
      this.trackFamilyTransaction(toMember, {
        type: "incoming",
        amountSat,
        feeSat: 0,
        timestamp: Date.now(),
        paymentHash: transactionId,
        description: transferDescription,
        tags: ["transfer", "family-internal"],
      });

      const updatedFromBalance = await this.getFamilyMemberBalance(fromMember);
      const updatedToBalance = await this.getFamilyMemberBalance(toMember);

      console.log(
        `💸 Internal transfer: ${fromMember} → ${toMember}: ${amountSat} sats`
      );

      return {
        success: true,
        fromBalance: updatedFromBalance.balanceSat,
        toBalance: updatedToBalance.balanceSat,
        transactionId,
      };
    } catch (error) {
      console.error("❌ Internal transfer failed:", error);
      throw new Error(`Transfer failed: ${error}`);
    }
  }

  /**
   * Get comprehensive node status for family banking
   */
  async getFamilyNodeStatus(): Promise<{
    nodeInfo: PhoenixdNodeInfo;
    balance: PhoenixdBalance;
    channels: PhoenixdChannel[];
    totalLiquidity: number;
    activeChannels: number;
  }> {
    try {
      const [nodeInfo, balance, channels] = await Promise.all([
        this.getNodeInfo(),
        this.getBalance(),
        this.listChannels(),
      ]);

      const activeChannels = channels.filter(
        (c) => c.state === "NORMAL"
      ).length;
      const totalLiquidity = channels.reduce((sum, channel) => {
        return (
          sum + (channel.data?.commitments?.localCommit?.spec?.toLocal || 0)
        );
      }, 0);

      return {
        nodeInfo,
        balance,
        channels,
        totalLiquidity,
        activeChannels,
      };
    } catch (error) {
      console.error("❌ Failed to get family node status:", error);
      throw new Error(`Failed to get node status: ${error}`);
    }
  }

  /**
   * Test connection to PhoenixD daemon
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getNodeInfo();
      console.log("✅ PhoenixD connection test successful");
      return true;
    } catch (error) {
      console.error("❌ PhoenixD connection test failed:", error);
      return false;
    }
  }

  /**
   * Get client configuration
   */
  getConfig(): PhoenixdClientConfig {
    return { ...this.config };
  }

  /**
   * Update family channel configuration
   */
  updateFamilyConfig(familyConfig: Partial<FamilyChannelConfig>): void {
    if (familyConfig.minChannelSize) {
      this.config.minChannelSize = familyConfig.minChannelSize;
    }

    console.log("🔧 Updated PhoenixD family config:", familyConfig);
  }

  /**
   * Check privacy service health
   */
  async checkPrivacyHealth(): Promise<boolean> {
    try {
      const result = await this.privacyLayer.testPrivacyConnection();
      return result.connected;
    } catch (error) {
      console.error("❌ Privacy health check failed:", error);
      return false;
    }
  }
}
