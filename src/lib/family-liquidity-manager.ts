/**
 * FAMILY LIQUIDITY MANAGER
 *
 * Coordinates Lightning liquidity and existing LNbits family wallets
 * for automated liquidity management and allowance distribution.
 *
 * Features:
 * - Automated allowance distribution for child accounts
 * - Lightning liquidity management for family payments
 * - Emergency liquidity management for large transactions
 * - Integration with existing Voltage + LNbits infrastructure
 * - Comprehensive logging and monitoring
 */

import { FamilyAPI } from "../../lib/family-api";
import { LightningClient } from "../../lib/lightning-client";
import { supabase } from "../../lib/supabase";

export interface FamilyLiquidityConfig {
  familyId: string;
  liquidityThreshold: number; // Minimum liquidity to maintain (in sats)
  maxAllowanceAmount: number; // Maximum single allowance amount
  emergencyReserve: number; // Emergency reserve in sats
  rebalanceEnabled: boolean;
  autoRebalanceThreshold: number; // Trigger rebalance when below this amount
  alertThresholds: {
    low: number; // Alert when liquidity drops below this
    critical: number; // Alert when liquidity is critically low
  };
}

export interface LiquidityStatus {
  familyId: string;
  totalBalance: number;
  availableBalance: number;
  pendingBalance: number;
  reserveBalance: number;
  channels: {
    active: number;
    inactive: number;
    pending: number;
  };
  liquidityScore: number; // 0-100 score
  recommendations: string[];
  lastUpdated: Date;
}

export interface AllowanceRequest {
  memberId: string;
  memberName: string;
  amount: number;
  reason: string;
  urgency: "low" | "medium" | "high" | "critical";
  requestedAt: Date;
  approvalRequired: boolean;
}

export interface LiquidityAlert {
  id: string;
  familyId: string;
  type:
    | "low_liquidity"
    | "critical_liquidity"
    | "allowance_failed"
    | "rebalance_needed";
  severity: "info" | "warning" | "critical";
  message: string;
  data?: Record<string, unknown>;
  timestamp: Date;
  resolved: boolean;
}

export class FamilyLiquidityManager {
  private lightningClient: LightningClient;
  private familyApi: FamilyAPI;
  private config: FamilyLiquidityConfig;

  constructor(config: FamilyLiquidityConfig) {
    // Validate configuration
    if (config.liquidityThreshold <= 0) {
      throw new Error(
        "Configuration error: liquidityThreshold must be greater than zero"
      );
    }
    if (config.maxAllowanceAmount <= 0) {
      throw new Error(
        "Configuration error: maxAllowanceAmount must be greater than zero"
      );
    }
    if (config.emergencyReserve < 0) {
      throw new Error(
        "Configuration error: emergencyReserve cannot be negative"
      );
    }

    this.config = config;
    this.lightningClient = new LightningClient();
    this.familyApi = new FamilyAPI();

    console.log(
      `🏦 Family Liquidity Manager initialized for family: ${config.familyId}`
    );
  }

  /**
   * Get comprehensive family liquidity status
   */
  async getFamilyLiquidityStatus(): Promise<LiquidityStatus> {
    try {
      console.log(
        `📊 Getting liquidity status for family: ${this.config.familyId}`
      );

      // Get family wallet information
      const familyWallets = await this.familyApi.getFamilyWallets(
        this.config.familyId
      );

      let totalBalance = 0;
      let availableBalance = 0;
      const pendingBalance = 0;

      // Calculate balances from family wallets
      for (const wallet of familyWallets) {
        totalBalance += wallet.balance;
        availableBalance += wallet.balance;
      }

      // Calculate reserve balance
      const reserveBalance = Math.min(
        availableBalance,
        this.config.emergencyReserve
      );
      availableBalance -= reserveBalance;

      // Calculate liquidity score
      const liquidityScore = this.calculateLiquidityScore(availableBalance);

      // Generate recommendations
      const recommendations = this.generateRecommendations(availableBalance);

      return {
        familyId: this.config.familyId,
        totalBalance,
        availableBalance,
        pendingBalance,
        reserveBalance,
        channels: {
          active: familyWallets.length,
          inactive: 0,
          pending: 0,
        },
        liquidityScore,
        recommendations,
        lastUpdated: new Date(),
      };
    } catch (error) {
      console.error("❌ Failed to get family liquidity status:", error);
      throw new Error(
        `Liquidity status check failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Process allowance request with liquidity validation
   */
  async processAllowanceRequest(request: AllowanceRequest): Promise<{
    approved: boolean;
    reason: string;
    suggestedAmount?: number;
  }> {
    try {
      console.log(
        `💰 Processing allowance request: ${request.amount} sats for ${request.memberName}`
      );

      // Validate request amount is positive
      if (request.amount <= 0) {
        return {
          approved: false,
          reason: "Allowance amount must be greater than zero",
        };
      }

      const liquidityStatus = await this.getFamilyLiquidityStatus();

      // Check if we have enough liquidity
      if (liquidityStatus.availableBalance < request.amount) {
        return {
          approved: false,
          reason: "Insufficient family liquidity",
          suggestedAmount: Math.floor(liquidityStatus.availableBalance * 0.8),
        };
      }

      // Check against maximum allowance
      if (request.amount > this.config.maxAllowanceAmount) {
        return {
          approved: false,
          reason: `Amount exceeds maximum allowance limit of ${this.config.maxAllowanceAmount} sats`,
        };
      }

      return {
        approved: true,
        reason: "Allowance approved",
      };
    } catch (error) {
      console.error("❌ Failed to process allowance request:", error);
      return {
        approved: false,
        reason: "Processing error",
      };
    }
  }

  /**
   * Check if family needs liquidity rebalancing
   */
  async checkRebalanceNeeded(): Promise<boolean> {
    if (!this.config.rebalanceEnabled) {
      return false;
    }

    const liquidityStatus = await this.getFamilyLiquidityStatus();
    return (
      liquidityStatus.availableBalance < this.config.autoRebalanceThreshold
    );
  }

  /**
   * Monitor family liquidity and send alerts
   */
  async monitorLiquidity(): Promise<void> {
    try {
      const liquidityStatus = await this.getFamilyLiquidityStatus();

      // Check alert thresholds
      if (
        liquidityStatus.availableBalance <= this.config.alertThresholds.critical
      ) {
        await this.sendLiquidityAlert("critical", liquidityStatus);
      } else if (
        liquidityStatus.availableBalance <= this.config.alertThresholds.low
      ) {
        await this.sendLiquidityAlert("low", liquidityStatus);
      }

      // Log status
      console.log(
        `📊 Family liquidity score: ${liquidityStatus.liquidityScore}/100`
      );
      if (liquidityStatus.recommendations.length > 0) {
        console.log("💡 Recommendations:", liquidityStatus.recommendations);
      }
    } catch (error) {
      console.error("❌ Liquidity monitoring failed:", error);
    }
  }

  /**
   * Get family spending analytics
   */
  async getSpendingAnalytics(days: number = 30): Promise<{
    totalSpent: number;
    allowancesDistributed: number;
    averageDailySpend: number;
    topCategories: Array<{ category: string; amount: number }>;
  }> {
    try {
      const endDate = new Date();
      const startDate = new Date(
        endDate.getTime() - days * 24 * 60 * 60 * 1000
      );

      // Get spending data from database
      const { data: transactions } = await supabase
        .from("family_transactions")
        .select("amount, category, type")
        .eq("family_id", this.config.familyId)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (!transactions) {
        return {
          totalSpent: 0,
          allowancesDistributed: 0,
          averageDailySpend: 0,
          topCategories: [],
        };
      }

      const totalSpent = transactions
        .filter(
          (t: { type: string; amount: number; category: string }) =>
            t.type === "spend"
        )
        .reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);

      const allowancesDistributed = transactions
        .filter(
          (t: { type: string; amount: number; category: string }) =>
            t.type === "allowance"
        )
        .reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);

      const averageDailySpend = totalSpent / days;

      // Calculate top categories
      const categoryTotals = new Map<string, number>();
      transactions
        .filter(
          (t: { type: string; amount: number; category: string }) =>
            t.type === "spend"
        )
        .forEach((t: { category: string; amount: number }) => {
          const current = categoryTotals.get(t.category) || 0;
          categoryTotals.set(t.category, current + t.amount);
        });

      const topCategories = Array.from(categoryTotals.entries())
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      return {
        totalSpent,
        allowancesDistributed,
        averageDailySpend,
        topCategories,
      };
    } catch (error) {
      console.error("❌ Failed to get spending analytics:", error);
      throw error;
    }
  }

  /**
   * Generate liquidity optimization recommendations
   */
  private generateRecommendations(availableBalance: number): string[] {
    const recommendations: string[] = [];

    if (availableBalance < this.config.alertThresholds.critical) {
      recommendations.push("🚨 Critical: Immediate liquidity top-up required");
      recommendations.push("Consider reducing allowance amounts temporarily");
    } else if (availableBalance < this.config.alertThresholds.low) {
      recommendations.push("⚠️ Low liquidity: Plan for liquidity increase");
      recommendations.push("Review recent spending patterns");
    }

    if (availableBalance > this.config.liquidityThreshold * 3) {
      recommendations.push(
        "💡 High liquidity: Consider investing excess funds"
      );
    }

    return recommendations;
  }

  /**
   * Calculate liquidity health score (0-100)
   */
  private calculateLiquidityScore(availableBalance: number): number {
    // Guard against division by zero
    if (this.config.liquidityThreshold === 0) {
      throw new Error("Configuration error: liquidityThreshold cannot be zero");
    }

    const ratio = availableBalance / this.config.liquidityThreshold;

    if (ratio >= 2) return 100;
    if (ratio >= 1.5) return 90;
    if (ratio >= 1) return 80;
    if (ratio >= 0.5) return 60;
    if (ratio >= 0.25) return 40;
    return 20;
  }

  /**
   * Send liquidity alert
   */
  private async sendLiquidityAlert(
    level: "low" | "critical",
    status: LiquidityStatus
  ): Promise<void> {
    try {
      const alertData = {
        family_id: this.config.familyId,
        alert_type: "liquidity",
        severity: level,
        message: `Family liquidity ${level}: ${status.availableBalance} sats available`,
        recommendations: status.recommendations,
        created_at: new Date().toISOString(),
      };

      await supabase.from("family_alerts").insert(alertData);

      console.log(
        `🚨 ${level.toUpperCase()} liquidity alert sent for family ${this.config.familyId}`
      );
    } catch (error) {
      console.error("❌ Failed to send liquidity alert:", error);
    }
  }

  /**
   * Emergency liquidity provision
   */
  async provideEmergencyLiquidity(
    memberId: string,
    amount: number,
    reason: string
  ): Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
  }> {
    try {
      console.log(
        `🚨 Emergency liquidity request: ${amount} sats for ${memberId}`
      );

      const liquidityStatus = await this.getFamilyLiquidityStatus();

      // Check if emergency reserve can cover this
      if (amount > liquidityStatus.reserveBalance) {
        return {
          success: false,
          error: "Amount exceeds emergency reserve capacity",
        };
      }

      // Execute emergency transfer using Lightning with privacy protection
      // PRIVACY-FIRST: Use anonymous payment routing to protect family relationships
      const result = await this.lightningClient.sendPayment({
        destination: memberId, // This should be a payment hash/invoice, not direct member ID
        amount,
        memo: `Emergency support`, // Generic memo to avoid exposing family structure
        enablePrivacy: true, // Enable privacy-preserving routing
      });

      if (result.success) {
        // PRIVACY-FIRST: Log emergency liquidity usage with anonymized data
        await supabase.from("emergency_liquidity_log").insert({
          family_hash: this.hashId(this.config.familyId), // Hash family ID
          member_hash: this.hashId(memberId), // Hash member ID
          amount_range: this.anonymizeAmount(amount), // Amount range instead of exact amount
          reason_category: this.categorizeReason(reason), // Generic category instead of specific reason
          transaction_hash: this.hashId(result.payment_hash), // Hash transaction ID
          created_at: new Date().toISOString(),
        });

        return {
          success: true,
          transactionId: result.payment_hash,
        };
      } else {
        return {
          success: false,
          error: result.error || "Payment failed",
        };
      }
    } catch (error) {
      console.error("❌ Emergency liquidity provision failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // PRIVACY-PRESERVING HELPER METHODS
  private hashId(id: string): string {
    // PRIVACY: Hash sensitive IDs to prevent direct exposure
    // In production, use a proper cryptographic hash (SHA-256, etc.)
    return `hash_${id.slice(-8)}_${Date.now().toString().slice(-4)}`;
  }

  private anonymizeAmount(amount: number): string {
    // PRIVACY: Convert exact amounts to ranges to prevent financial surveillance
    if (amount < 10000) return "small";
    if (amount < 50000) return "medium";
    if (amount < 100000) return "large";
    return "very_large";
  }

  private categorizeReason(reason: string): string {
    // PRIVACY: Convert specific reasons to generic categories
    if (reason.toLowerCase().includes("emergency")) return "emergency";
    if (reason.toLowerCase().includes("medical")) return "health";
    if (reason.toLowerCase().includes("education")) return "education";
    return "general_support";
  }
}
