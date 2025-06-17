/**
 * Family PhoenixD Manager (Legacy Compatibility Layer)
 *
 * DEPRECATED: This file maintains backward compatibility.
 * New implementations should use EnhancedPhoenixdManager from ./enhanced-phoenixd-manager.ts
 * which supports both individual and family operations.
 *
 * @fileoverview Legacy PhoenixD family banking automation layer
 * @deprecated Use EnhancedPhoenixdManager instead
 */

import { getFamilyMember } from "../../lib/family-api";
import { PhoenixdClient } from "./phoenixd-client";

// Family Banking Types
interface FamilyMember {
  id: string;
  username: string;
  name: string;
  role: "parent" | "teen" | "child";
  dailyLimit?: number;
  weeklyLimit?: number;
  phoenixd_channel_id?: string;
  allowance_config?: FamilyAllowanceConfig;
}

interface FamilyAllowanceConfig {
  enabled: boolean;
  amount: number;
  frequency: "daily" | "weekly" | "monthly";
  next_payment: Date;
  auto_topup: boolean;
  emergency_threshold: number;
}

interface LiquidityEvent {
  id: string;
  family_member_id: string;
  channel_id: string;
  amount_sat: number;
  trigger_type: "allowance" | "emergency" | "manual" | "scheduled";
  status: "pending" | "completed" | "failed";
  fees_sat: number;
  created_at: Date;
  completed_at?: Date;
  error_message?: string;
}

interface EmergencyLiquidityRequest {
  familyMember: string;
  requiredAmount: number;
  urgency: "low" | "medium" | "high" | "critical";
  reason: string;
  maxFees: number;
}

interface FamilyLiquidityStatus {
  familyMember: string;
  currentBalance: number;
  channelCapacity: number;
  dailySpent: number;
  weeklySpent: number;
  allowanceStatus: {
    nextPayment: Date;
    amount: number;
    daysUntilNext: number;
  };
  needsLiquidity: boolean;
  recommendedAction: "none" | "topup" | "emergency" | "allowance_prep";
}

export class FamilyPhoenixdManager {
  private phoenixdClient: PhoenixdClient;
  private emergencyThreshold: number;
  private maxEmergencyAmount: number;
  private allowancePreparationDays: number;

  constructor() {
    this.phoenixdClient = new PhoenixdClient();

    // Configuration from environment
    const getEnvVar = (key: string, defaultValue: string): string => {
      if (typeof import.meta !== "undefined" && import.meta.env) {
        return import.meta.env[key] || defaultValue;
      }
      return process.env[key] || defaultValue;
    };

    this.emergencyThreshold =
      parseInt(getEnvVar("FAMILY_EMERGENCY_THRESHOLD", "10000")) || 10000; // 10k sats - guard against NaN
    this.maxEmergencyAmount =
      parseInt(getEnvVar("FAMILY_MAX_EMERGENCY", "100000")) || 100000; // 100k sats - guard against NaN
    this.allowancePreparationDays =
      parseInt(getEnvVar("FAMILY_ALLOWANCE_PREP_DAYS", "2")) || 2; // 2 days ahead - guard against NaN

    console.log("👨‍👩‍👧‍👦 Family PhoenixD Manager initialized");
  }

  /**
   * Setup automated channel for new family member
   */
  async setupFamilyMemberChannel(
    familyMember: FamilyMember,
    initialLiquidity?: number
  ): Promise<{
    channelId: string;
    amountSat: number;
    feeSat: number;
  }> {
    try {
      console.log(
        `🔧 Setting up PhoenixD channel for ${familyMember.name} (${familyMember.role})`
      );

      // Calculate optimal channel size based on role and limits
      const optimalSize = this.calculateOptimalChannelSize(familyMember);
      const channelSize = initialLiquidity || optimalSize;

      // Validate minimum channel size
      const config = this.phoenixdClient.getConfig();
      if (channelSize < config.minChannelSize) {
        throw new Error(
          `Channel size ${channelSize} below minimum ${config.minChannelSize} sats`
        );
      }

      // Request liquidity from PhoenixD
      const liquidityResponse = await this.phoenixdClient.requestLiquidity({
        amountSat: channelSize,
      });

      // Log the liquidity event
      await this.logLiquidityEvent({
        family_member_id: familyMember.id,
        channel_id: liquidityResponse.channelId,
        amount_sat: liquidityResponse.amountSat,
        trigger_type: "manual",
        status: "completed",
        fees_sat: liquidityResponse.feeSat,
        created_at: new Date(),
        completed_at: new Date(),
      });

      console.log(
        `✅ Family channel setup complete for ${familyMember.name}:`,
        {
          channelId: liquidityResponse.channelId,
          amount: liquidityResponse.amountSat,
          fees: liquidityResponse.feeSat,
        }
      );

      return {
        channelId: liquidityResponse.channelId,
        amountSat: liquidityResponse.amountSat,
        feeSat: liquidityResponse.feeSat,
      };
    } catch (error) {
      console.error(
        `❌ Failed to setup channel for ${familyMember.name}:`,
        error
      );
      throw new Error(`Channel setup failed: ${error}`);
    }
  }

  /**
   * Process just-in-time liquidity for allowance payments
   */
  async processAllowanceLiquidity(familyMember: FamilyMember): Promise<{
    liquidityAdded: boolean;
    amount: number;
    fees: number;
    reason: string;
  }> {
    try {
      if (!familyMember.allowance_config?.enabled) {
        return {
          liquidityAdded: false,
          amount: 0,
          fees: 0,
          reason: "Allowance not enabled",
        };
      }

      const allowanceConfig = familyMember.allowance_config;
      const liquidityCheck = await this.phoenixdClient.checkFamilyLiquidity(
        familyMember.username,
        allowanceConfig.amount
      );

      if (!liquidityCheck.needsLiquidity) {
        return {
          liquidityAdded: false,
          amount: liquidityCheck.currentBalance,
          fees: 0,
          reason: "Sufficient liquidity available",
        };
      }

      console.log(
        `💰 Processing allowance liquidity for ${familyMember.name}:`,
        {
          allowanceAmount: allowanceConfig.amount,
          currentBalance: liquidityCheck.currentBalance,
          recommendedTopup: liquidityCheck.recommendedTopup,
        }
      );

      // Request additional liquidity
      const liquidityResponse = await this.phoenixdClient.requestLiquidity({
        amountSat: liquidityCheck.recommendedTopup,
      });

      // Log the event
      await this.logLiquidityEvent({
        family_member_id: familyMember.id,
        channel_id: liquidityResponse.channelId,
        amount_sat: liquidityResponse.amountSat,
        trigger_type: "allowance",
        status: "completed",
        fees_sat: liquidityResponse.feeSat,
        created_at: new Date(),
        completed_at: new Date(),
      });

      return {
        liquidityAdded: true,
        amount: liquidityResponse.amountSat,
        fees: liquidityResponse.feeSat,
        reason: "Allowance preparation",
      };
    } catch (error) {
      console.error(
        `❌ Failed to process allowance liquidity for ${familyMember.name}:`,
        error
      );
      throw new Error(`Allowance liquidity failed: ${error}`);
    }
  }

  /**
   * Handle emergency liquidity protocols
   */
  async handleEmergencyLiquidity(request: EmergencyLiquidityRequest): Promise<{
    approved: boolean;
    amount: number;
    fees: number;
    channelId?: string;
    message: string;
  }> {
    try {
      console.log(
        `🚨 Emergency liquidity request for ${request.familyMember}:`,
        {
          amount: request.requiredAmount,
          urgency: request.urgency,
          reason: request.reason,
        }
      );

      // Validate emergency request
      if (request.requiredAmount <= 0) {
        return {
          approved: false,
          amount: 0,
          fees: 0,
          message: `Emergency amount must be positive, got ${request.requiredAmount} sats`,
        };
      }

      if (request.requiredAmount > this.maxEmergencyAmount) {
        return {
          approved: false,
          amount: 0,
          fees: 0,
          message: `Emergency amount ${request.requiredAmount} exceeds maximum ${this.maxEmergencyAmount} sats`,
        };
      }

      // Get family member details
      const familyMember = await getFamilyMember(request.familyMember);
      if (!familyMember) {
        return {
          approved: false,
          amount: 0,
          fees: 0,
          message: "Family member not found",
        };
      }

      // Check current liquidity status
      const liquidityCheck = await this.phoenixdClient.checkFamilyLiquidity(
        request.familyMember,
        request.requiredAmount
      );

      if (!liquidityCheck.needsLiquidity) {
        return {
          approved: true,
          amount: liquidityCheck.currentBalance,
          fees: 0,
          message: "Sufficient liquidity already available",
        };
      }

      // Calculate emergency liquidity amount
      const emergencyAmount = Math.min(
        request.requiredAmount * 1.5, // 50% buffer
        this.maxEmergencyAmount
      );

      // Request emergency liquidity
      const liquidityResponse = await this.phoenixdClient.requestLiquidity({
        amountSat: emergencyAmount,
        fundingFeeSat: request.maxFees,
      });

      // Log emergency event
      await this.logLiquidityEvent({
        family_member_id: familyMember.id,
        channel_id: liquidityResponse.channelId,
        amount_sat: liquidityResponse.amountSat,
        trigger_type: "emergency",
        status: "completed",
        fees_sat: liquidityResponse.feeSat,
        created_at: new Date(),
        completed_at: new Date(),
      });

      console.log(
        `✅ Emergency liquidity approved for ${request.familyMember}:`,
        {
          amount: liquidityResponse.amountSat,
          fees: liquidityResponse.feeSat,
          channelId: liquidityResponse.channelId,
        }
      );

      return {
        approved: true,
        amount: liquidityResponse.amountSat,
        fees: liquidityResponse.feeSat,
        channelId: liquidityResponse.channelId,
        message: "Emergency liquidity provided successfully",
      };
    } catch (error) {
      console.error(
        `❌ Emergency liquidity failed for ${request.familyMember}:`,
        error
      );

      // Log failed emergency event
      try {
        const familyMember = await getFamilyMember(request.familyMember);
        if (familyMember) {
          await this.logLiquidityEvent({
            family_member_id: familyMember.id,
            channel_id: "",
            amount_sat: request.requiredAmount,
            trigger_type: "emergency",
            status: "failed",
            fees_sat: 0,
            created_at: new Date(),
            error_message: String(error),
          });
        }
      } catch (logError) {
        console.error("Failed to log emergency failure:", logError);
      }

      return {
        approved: false,
        amount: 0,
        fees: 0,
        message: `Emergency liquidity failed: ${error}`,
      };
    }
  }

  /**
   * Get comprehensive family liquidity status
   */
  async getFamilyLiquidityStatus(
    username: string
  ): Promise<FamilyLiquidityStatus> {
    try {
      const familyMember = await getFamilyMember(username);
      if (!familyMember) {
        throw new Error("Family member not found");
      }

      const [liquidityCheck, nodeStatus] = await Promise.all([
        this.phoenixdClient.checkFamilyLiquidity(
          username,
          this.emergencyThreshold
        ),
        this.phoenixdClient.getFamilyNodeStatus(),
      ]);

      // Calculate allowance status
      let allowanceStatus = {
        nextPayment: new Date(),
        amount: 0,
        daysUntilNext: 0,
      };

      if (familyMember.allowance_config?.enabled) {
        const config = familyMember.allowance_config;
        const daysUntilNext = Math.ceil(
          (config.next_payment.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        allowanceStatus = {
          nextPayment: config.next_payment,
          amount: config.amount,
          daysUntilNext,
        };
      }

      // Determine recommended action
      let recommendedAction: FamilyLiquidityStatus["recommendedAction"] =
        "none";

      if (liquidityCheck.needsLiquidity) {
        if (liquidityCheck.currentBalance < this.emergencyThreshold) {
          recommendedAction = "emergency";
        } else if (
          familyMember.allowance_config?.enabled &&
          allowanceStatus.daysUntilNext <= this.allowancePreparationDays
        ) {
          recommendedAction = "allowance_prep";
        } else {
          recommendedAction = "topup";
        }
      }

      return {
        familyMember: username,
        currentBalance: liquidityCheck.currentBalance,
        channelCapacity: nodeStatus.totalLiquidity,
        dailySpent: 0, // TODO: Calculate from transaction history
        weeklySpent: 0, // TODO: Calculate from transaction history
        allowanceStatus,
        needsLiquidity: liquidityCheck.needsLiquidity,
        recommendedAction,
      };
    } catch (error) {
      console.error(
        `❌ Failed to get family liquidity status for ${username}:`,
        error
      );
      throw new Error(`Liquidity status check failed: ${error}`);
    }
  }

  /**
   * Calculate optimal channel size based on family member role and limits
   */
  private calculateOptimalChannelSize(familyMember: FamilyMember): number {
    const baseAmount = this.phoenixdClient.getConfig().minChannelSize;
    let multiplier = 1;

    // Role-based multipliers
    switch (familyMember.role) {
      case "parent":
        multiplier = 4; // 200k sats default
        break;
      case "teen":
        multiplier = 2; // 100k sats default
        break;
      case "child":
        multiplier = 1; // 50k sats default
        break;
    }

    // Consider daily/weekly limits
    if (familyMember.dailyLimit) {
      multiplier = Math.max(
        multiplier,
        (familyMember.dailyLimit / baseAmount) * 7
      ); // Week's worth
    }

    if (familyMember.weeklyLimit) {
      multiplier = Math.max(
        multiplier,
        (familyMember.weeklyLimit / baseAmount) * 2
      ); // 2 weeks worth
    }

    return Math.floor(baseAmount * multiplier);
  }

  /**
   * Log liquidity event to database
   */
  private async logLiquidityEvent(
    event: Omit<LiquidityEvent, "id">
  ): Promise<void> {
    try {
      // TODO: Implement database logging
      console.log("📊 Liquidity event logged:", event);
    } catch (error) {
      console.error("❌ Failed to log liquidity event:", error);
      // Don't throw - logging failure shouldn't break operations
    }
  }

  /**
   * Check if PhoenixD service is healthy
   */
  async checkServiceHealth(): Promise<{
    phoenixdHealthy: boolean;
    privacyHealthy: boolean;
    familyBankingReady: boolean;
  }> {
    try {
      const [phoenixdHealthy, privacyHealthy] = await Promise.all([
        this.phoenixdClient.testConnection(),
        this.phoenixdClient.checkPrivacyHealth(),
      ]);

      const familyBankingReady = phoenixdHealthy && privacyHealthy;

      console.log("🏥 Family PhoenixD service health:", {
        phoenixdHealthy,
        privacyHealthy,
        familyBankingReady,
      });

      return {
        phoenixdHealthy,
        privacyHealthy,
        familyBankingReady,
      };
    } catch (error) {
      console.error("❌ Service health check failed:", error);
      return {
        phoenixdHealthy: false,
        privacyHealthy: false,
        familyBankingReady: false,
      };
    }
  }
}
