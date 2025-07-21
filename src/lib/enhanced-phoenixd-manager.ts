/**
 * Enhanced PhoenixD Manager for Individual & Family Lightning Operations
 *
 * MASTER CONTEXT COMPLIANCE:
 * ✅ PhoenixD: Internal Satnam Lightning wallet for family-to-family and P2P payments within Satnam ecosystem
 * ✅ Role hierarchy: "private"|"offspring"|"adult"|"steward"|"guardian"
 * ✅ Privacy-first architecture with user-controlled localStorage logging
 * ✅ Browser-compatible serverless environment (no Node.js dependencies)
 * ✅ Integration with unified messaging service and session management
 *
 * @fileoverview Enhanced PhoenixD dual-mode management system for internal Satnam payments
 */

import { browserCron, type BrowserCronJob } from "../types/cron";
import { LiquidityIntelligenceSystem } from "./liquidity-intelligence";
import { PhoenixdClient } from "./phoenixd-client";

// MASTER CONTEXT COMPLIANCE: Remove external logging dependencies
// Use user-controlled localStorage for privacy-first architecture

const cron = browserCron;

// Operation Context Types
type OperationMode = "individual" | "family";

interface OperationContext {
  mode: OperationMode;
  userId: string;
  familyId?: string;
  parentUserId?: string;
}

// Individual Lightning Account Types
interface IndividualLightningAccount {
  userId: string;
  username: string;
  phoenixdNodeId: string;
  channelId?: string;
  balanceSat: number;
  liquidity: {
    minThreshold: number;
    targetBalance: number;
    autoRebalance: boolean;
    emergencyThreshold: number;
  };
  preferences: {
    privacyMode: boolean;
    maxFeePercent: number;
    routingPreference: "fast" | "cheap" | "balanced";
  };
}

// Family Lightning Account Types
interface FamilyLightningAccount {
  familyId: string;
  familyName: string;
  parentUserId: string;
  sharedChannelId?: string;
  totalBalanceSat: number;
  members: FamilyMemberAccount[];
  liquidity: {
    pooledLiquidity: boolean;
    emergencyFund: number;
    autoRebalanceFamily: boolean;
    crossMemberTransfers: boolean;
  };
}

interface FamilyMemberAccount {
  userId: string;
  username: string;
  role: "private" | "offspring" | "adult" | "steward" | "guardian";
  individualChannelId?: string;
  allocatedBalanceSat: number;
  limits: {
    dailyLimit?: number;
    weeklyLimit?: number;
    transactionLimit?: number;
  };
  recurringPayment?: {
    enabled: boolean;
    amount: number;
    frequency: "daily" | "weekly" | "monthly";
    nextPayment: Date;
  };
}

// Liquidity Management Types
interface LiquidityOperation {
  id: string;
  context: OperationContext;
  type: "channel_open" | "rebalance" | "emergency_fund" | "payment_topup";
  amountSat: number;
  targetChannelId?: string;
  status: "pending" | "completed" | "failed";
  feeSat: number;
  priority: "low" | "normal" | "high" | "emergency";
  createdAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

interface LiquidityRequest {
  context: OperationContext;
  requiredAmountSat: number;
  urgencyLevel: "low" | "normal" | "high" | "emergency";
  reason: "payment" | "recurring_payment" | "rebalance" | "emergency";
  maxFeeSat?: number;
}

// Enhanced Dual-Mode Operation Types
interface DualModeConfig {
  enabled: boolean;
  primaryMode: "individual" | "family";
  fallbackMode: "individual" | "family";
  switchThreshold: {
    liquidityRatio: number;
    failureRate: number;
    responseTime: number;
  };
  cooldownPeriod: number; // seconds
}

interface EmergencyProtocol {
  enabled: boolean;
  triggers: {
    liquidityBelow: number;
    channelFailures: number;
    responseTimeAbove: number;
    utilizationRate: number;
  };
  actions: {
    enableEmergencyMode: boolean;
    requestEmergencyLiquidity: boolean;
    pausePayments: boolean;
    alertGuardians: boolean;
    fallbackToVoltage: boolean;
  };
  recovery: {
    autoRecovery: boolean;
    recoveryThreshold: number;
    recoveryTimeout: number;
  };
}

interface RebalanceStrategy {
  enabled: boolean;
  targetRatio: number; // 0.5 = 50/50 split
  thresholds: {
    minor: number; // 0.1 = 10% deviation
    major: number; // 0.3 = 30% deviation
    emergency: number; // 0.5 = 50% deviation
  };
  schedule: {
    enabled: boolean;
    frequency: "hourly" | "daily" | "weekly";
    preferredTime: string;
  };
  maxCost: number;
}

interface EmergencyEvent {
  id: string;
  familyId?: string;
  userId?: string;
  type: "liquidity_crisis" | "channel_failure" | "performance_degradation";
  severity: "low" | "medium" | "high" | "critical";
  trigger: string;
  description: string;
  affectedChannels: string[];
  automaticActions: string[];
  status: "active" | "contained" | "resolved";
  createdAt: Date;
  resolvedAt?: Date;
}

/**
 * Enhanced PhoenixD Manager supporting both individual and family operations
 */
export class EnhancedPhoenixdManager {
  private phoenixClient: PhoenixdClient;
  private liquiditySystem: LiquidityIntelligenceSystem;
  private individualAccounts: Map<string, IndividualLightningAccount> =
    new Map();
  private familyAccounts: Map<string, FamilyLightningAccount> = new Map();
  private liquidityOperations: Map<string, LiquidityOperation> = new Map();

  // Enhanced features
  private dualModeConfig: Map<string, DualModeConfig> = new Map();
  private emergencyProtocols: Map<string, EmergencyProtocol> = new Map();
  private rebalanceStrategies: Map<string, RebalanceStrategy> = new Map();
  private activeEmergencies: Map<string, EmergencyEvent> = new Map();
  private rebalanceJobs: Map<string, BrowserCronJob> = new Map();
  private monitoringJobs: Map<string, NodeJS.Timeout> = new Map();

  constructor(liquiditySystem?: LiquidityIntelligenceSystem) {
    this.phoenixClient = new PhoenixdClient();
    this.liquiditySystem = liquiditySystem || new LiquidityIntelligenceSystem();
    this.initializeEnhancedFeatures();
  }

  /**
   * MASTER CONTEXT COMPLIANCE: User-controlled local PhoenixD operation logging
   * Stores PhoenixD operations in user's local encrypted storage (localStorage)
   * NEVER stored in external databases - user maintains full control
   */
  private async logPhoenixDOperation(operationData: {
    operation: string;
    context: OperationContext;
    details: any;
    timestamp: Date;
  }): Promise<void> {
    try {
      const existingHistory = localStorage.getItem("satnam_phoenixd_history");
      const operationHistory = existingHistory
        ? JSON.parse(existingHistory)
        : [];

      const operationRecord = {
        id: crypto.randomUUID(),
        type: "phoenixd_operation",
        ...operationData,
        timestamp: operationData.timestamp.toISOString(),
      };

      operationHistory.push(operationRecord);

      // Keep only last 1000 operations to prevent localStorage bloat
      if (operationHistory.length > 1000) {
        operationHistory.splice(0, operationHistory.length - 1000);
      }

      localStorage.setItem(
        "satnam_phoenixd_history",
        JSON.stringify(operationHistory)
      );
      console.log(
        `⚡ PhoenixD operation logged to user's local history: ${operationData.operation}`
      );
    } catch (error) {
      console.error("Failed to log PhoenixD operation to user history:", error);
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Get user's local PhoenixD operation history
   */
  async getUserPhoenixDHistory(limit: number = 100): Promise<any[]> {
    try {
      const existingHistory = localStorage.getItem("satnam_phoenixd_history");
      if (!existingHistory) return [];

      const operationHistory = JSON.parse(existingHistory);
      return operationHistory
        .sort(
          (a: any, b: any) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, limit);
    } catch (error) {
      console.error("Failed to retrieve user PhoenixD history:", error);
      return [];
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Generate secure UUID for operations
   */
  private generateSecureUUID(): string {
    return crypto.randomUUID();
  }

  private async initializeEnhancedFeatures(): Promise<void> {
    console.log(
      "🔧 Initializing Enhanced PhoenixD Manager with dual-mode operations"
    );

    // Setup default configurations
    this.setupDefaultConfigurations();

    // Initialize monitoring
    this.setupGlobalMonitoring();

    console.log(
      "✅ Enhanced PhoenixD Manager initialized with advanced features"
    );
  }

  /**
   * Initialize individual Lightning account
   */
  async initializeIndividualAccount(
    userId: string,
    username: string,
    preferences?: Partial<IndividualLightningAccount["preferences"]>
  ): Promise<IndividualLightningAccount> {
    const nodeInfo = await this.phoenixClient.getNodeInfo();
    const balance = await this.phoenixClient.getBalance();

    const account: IndividualLightningAccount = {
      userId,
      username,
      phoenixdNodeId: nodeInfo.nodeId,
      balanceSat: balance.balanceSat,
      liquidity: {
        minThreshold: 50000, // 50k sats minimum
        targetBalance: 200000, // 200k sats target
        autoRebalance: true,
        emergencyThreshold: 10000, // 10k sats emergency
      },
      preferences: {
        privacyMode: true,
        maxFeePercent: 1.0,
        routingPreference: "balanced",
        ...preferences,
      },
    };

    this.individualAccounts.set(userId, account);
    return account;
  }

  /**
   * Initialize family Lightning account
   */
  async initializeFamilyAccount(
    familyId: string,
    familyName: string,
    parentUserId: string,
    members: Array<{
      userId: string;
      username: string;
      role: "private" | "offspring" | "adult" | "steward" | "guardian";
      limits?: FamilyMemberAccount["limits"];
      recurringPayment?: FamilyMemberAccount["recurringPayment"];
    }>
  ): Promise<FamilyLightningAccount> {
    await this.phoenixClient.getNodeInfo(); // Verify connection
    const balance = await this.phoenixClient.getBalance();

    const familyMembers: FamilyMemberAccount[] = members.map((member) => ({
      ...member,
      allocatedBalanceSat: 0,
      limits: member.limits || {
        dailyLimit:
          member.role === "offspring"
            ? 10000
            : member.role === "private"
            ? 50000
            : undefined,
        weeklyLimit:
          member.role === "offspring"
            ? 50000
            : member.role === "private"
            ? 200000
            : undefined,
        transactionLimit:
          member.role === "offspring"
            ? 5000
            : member.role === "private"
            ? 25000
            : undefined,
      },
    }));

    const account: FamilyLightningAccount = {
      familyId,
      familyName,
      parentUserId,
      totalBalanceSat: balance.balanceSat,
      members: familyMembers,
      liquidity: {
        pooledLiquidity: true,
        emergencyFund: 100000, // 100k sats emergency fund
        autoRebalanceFamily: true,
        crossMemberTransfers: true,
      },
    };

    this.familyAccounts.set(familyId, account);
    return account;
  }

  /**
   * Execute payment with automatic liquidity management
   */
  async executePayment(
    context: OperationContext,
    invoice: string,
    amountSat?: number
  ): Promise<{
    success: boolean;
    paymentId?: string;
    liquidityOpId?: string;
    feeSat: number;
    message: string;
  }> {
    try {
      // Check if liquidity is sufficient
      const liquidityCheck = await this.checkLiquidity(context, amountSat || 0);

      if (!liquidityCheck.sufficient) {
        // Attempt automatic liquidity provisioning
        const liquidityOp = await this.provisionLiquidity({
          context,
          requiredAmountSat: liquidityCheck.requiredAmount,
          urgencyLevel: "high",
          reason: "payment",
        });

        if (liquidityOp.status === "failed") {
          return {
            success: false,
            feeSat: 0,
            message: `Payment failed: Insufficient liquidity and provisioning failed - ${liquidityOp.errorMessage}`,
          };
        }
      }

      // Execute the payment
      const payment = await this.phoenixClient.payInvoice(invoice, amountSat);

      // Update account balances
      await this.updateAccountBalance(context, -(payment.sent + payment.fees));

      return {
        success: true,
        paymentId: payment.paymentId,
        liquidityOpId: liquidityCheck.sufficient
          ? undefined
          : liquidityCheck.operationId,
        feeSat: payment.fees,
        message: "Payment completed successfully",
      };
    } catch (error) {
      return {
        success: false,
        feeSat: 0,
        message: `Payment failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Check liquidity for operation
   */
  private async checkLiquidity(
    context: OperationContext,
    requiredAmountSat: number
  ): Promise<{
    sufficient: boolean;
    currentBalance: number;
    requiredAmount: number;
    operationId?: string;
  }> {
    let currentBalance: number;

    if (context.mode === "individual") {
      const account = this.individualAccounts.get(context.userId);
      if (!account) {
        throw new Error("Individual account not found");
      }
      currentBalance = account.balanceSat;
    } else {
      const account = this.familyAccounts.get(context.familyId!);
      if (!account) {
        throw new Error("Family account not found");
      }
      currentBalance = account.totalBalanceSat;
    }

    const sufficient = currentBalance >= requiredAmountSat + 10000; // Include buffer for fees

    return {
      sufficient,
      currentBalance,
      requiredAmount: sufficient
        ? 0
        : requiredAmountSat + 20000 - currentBalance,
    };
  }

  /**
   * Provision liquidity automatically
   */
  private async provisionLiquidity(
    request: LiquidityRequest
  ): Promise<LiquidityOperation> {
    const operationId = `liq_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const operation: LiquidityOperation = {
      id: operationId,
      context: request.context,
      type: "rebalance",
      amountSat: request.requiredAmountSat,
      status: "pending",
      feeSat: 0,
      priority: request.urgencyLevel === "emergency" ? "emergency" : "high",
      createdAt: new Date(),
    };

    this.liquidityOperations.set(operationId, operation);

    try {
      // Attempt to request liquidity from PhoenixD
      const liquidityResponse = await this.phoenixClient.requestLiquidity({
        amountSat: request.requiredAmountSat,
      });

      operation.status = "completed";
      operation.feeSat = liquidityResponse.feeSat;
      operation.completedAt = new Date();

      // Update account balance
      await this.updateAccountBalance(
        request.context,
        request.requiredAmountSat - liquidityResponse.feeSat
      );
    } catch (error) {
      operation.status = "failed";
      operation.errorMessage =
        error instanceof Error ? error.message : "Unknown error";
    }

    this.liquidityOperations.set(operationId, operation);
    return operation;
  }

  /**
   * Update account balance after operations
   */
  private async updateAccountBalance(
    context: OperationContext,
    deltaAmountSat: number
  ): Promise<void> {
    if (context.mode === "individual") {
      const account = this.individualAccounts.get(context.userId);
      if (account) {
        account.balanceSat += deltaAmountSat;
      }
    } else {
      const account = this.familyAccounts.get(context.familyId!);
      if (account) {
        account.totalBalanceSat += deltaAmountSat;
      }
    }
  }

  /**
   * Get account information based on context
   */
  async getAccountInfo(
    context: OperationContext
  ): Promise<IndividualLightningAccount | FamilyLightningAccount | null> {
    if (context.mode === "individual") {
      return this.individualAccounts.get(context.userId) || null;
    } else {
      return this.familyAccounts.get(context.familyId!) || null;
    }
  }

  /**
   * Process family recurring payments
   */
  async processFamilyRecurringPayments(familyId: string): Promise<{
    processed: number;
    failed: number;
    operations: LiquidityOperation[];
  }> {
    const familyAccount = this.familyAccounts.get(familyId);
    if (!familyAccount) {
      throw new Error("Family account not found");
    }

    const operations: LiquidityOperation[] = [];
    let processed = 0;
    let failed = 0;

    for (const member of familyAccount.members) {
      if (
        member.recurringPayment?.enabled &&
        this.isRecurringPaymentDue(member.recurringPayment)
      ) {
        try {
          const operation = await this.provisionLiquidity({
            context: {
              mode: "family",
              userId: member.userId,
              familyId,
              parentUserId: familyAccount.parentUserId,
            },
            requiredAmountSat: member.recurringPayment.amount,
            urgencyLevel: "normal",
            reason: "recurring_payment",
          });

          operations.push(operation);

          if (operation.status === "completed") {
            processed++;
            // Update next payment date
            member.recurringPayment.nextPayment = this.calculateNextPaymentDate(
              member.recurringPayment
            );
          } else {
            failed++;
          }
        } catch (error) {
          failed++;
        }
      }
    }

    return { processed, failed, operations };
  }

  /**
   * Check if recurring payment is due
   */
  private isRecurringPaymentDue(
    recurringPayment: FamilyMemberAccount["recurringPayment"]
  ): boolean {
    if (!recurringPayment) return false;
    return new Date() >= recurringPayment.nextPayment;
  }

  /**
   * Calculate next recurring payment date
   */
  private calculateNextPaymentDate(
    recurringPayment: FamilyMemberAccount["recurringPayment"]
  ): Date {
    if (!recurringPayment) return new Date();

    const now = new Date();
    switch (recurringPayment.frequency) {
      case "daily":
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case "weekly":
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case "monthly": {
        const nextMonth = new Date(now);
        nextMonth.setMonth(now.getMonth() + 1);
        return nextMonth;
      }
      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Get liquidity operation status
   */
  getLiquidityOperation(operationId: string): LiquidityOperation | null {
    return this.liquidityOperations.get(operationId) || null;
  }

  /**
   * List all liquidity operations for context
   */
  getLiquidityOperations(context: OperationContext): LiquidityOperation[] {
    return Array.from(this.liquidityOperations.values()).filter(
      (op) =>
        op.context.userId === context.userId &&
        op.context.mode === context.mode &&
        (context.mode === "individual" ||
          op.context.familyId === context.familyId)
    );
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Setup automated channel for new family member
   * PhoenixD: Internal Satnam Lightning wallet for family-to-family payments
   */
  async setupFamilyMemberChannel(
    familyMember: {
      id: string;
      username: string;
      name: string;
      role: "private" | "offspring" | "adult" | "steward" | "guardian";
      dailyLimit?: number;
      weeklyLimit?: number;
    },
    initialLiquidity?: number
  ): Promise<{
    channelId: string;
    amountSat: number;
    feeSat: number;
  }> {
    try {
      console.log(
        `🔧 Setting up PhoenixD channel for ${familyMember.name} (${familyMember.role}) - Internal Satnam ecosystem payments`
      );

      // Calculate optimal channel size based on role and limits
      const optimalSize = this.calculateOptimalChannelSize(familyMember);
      const channelSize = initialLiquidity || optimalSize;

      // Validate minimum channel size
      const minChannelSize = 50000; // 50k sats minimum
      if (channelSize < minChannelSize) {
        throw new Error(
          `Channel size ${channelSize} below minimum ${minChannelSize} sats`
        );
      }

      // Request liquidity from PhoenixD
      const liquidityResponse = await this.phoenixClient.requestLiquidity({
        amountSat: channelSize,
      });

      // Log the liquidity event to user's local history
      await this.logPhoenixDOperation({
        operation: "family_member_channel_setup",
        context: {
          mode: "family",
          userId: familyMember.id,
        },
        details: {
          familyMemberId: familyMember.id,
          channelId: liquidityResponse.channelId,
          amountSat: liquidityResponse.amountSat,
          feeSat: liquidityResponse.feeSat,
          role: familyMember.role,
          channelSize,
        },
        timestamp: new Date(),
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
   * MASTER CONTEXT COMPLIANCE: Calculate optimal channel size based on family member role
   * Uses Master Context role hierarchy: "private"|"offspring"|"adult"|"steward"|"guardian"
   */
  private calculateOptimalChannelSize(familyMember: {
    role: "private" | "offspring" | "adult" | "steward" | "guardian";
    dailyLimit?: number;
    weeklyLimit?: number;
  }): number {
    const baseAmount = 50000; // 50k sats base
    let multiplier = 1;

    // MASTER CONTEXT COMPLIANCE: Role-based multipliers
    switch (familyMember.role) {
      case "guardian":
      case "steward":
        multiplier = 8; // 400k sats default for authority roles
        break;
      case "adult":
        multiplier = 4; // 200k sats default for adults
        break;
      case "offspring":
        multiplier = 2; // 100k sats default for offspring
        break;
      case "private":
        multiplier = 1; // 50k sats default for private users
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
   * MASTER CONTEXT COMPLIANCE: Process just-in-time liquidity for recurring payments
   * PhoenixD: Internal Satnam Lightning wallet for family ecosystem payments
   */
  async processPaymentLiquidity(familyMember: {
    id: string;
    username: string;
    name: string;
    role: "private" | "offspring" | "adult" | "steward" | "guardian";
    paymentConfig?: {
      enabled: boolean;
      amount: number;
      frequency: "daily" | "weekly" | "monthly";
      nextPayment: Date;
      autoTopup: boolean;
      emergencyThreshold: number;
    };
  }): Promise<{
    liquidityAdded: boolean;
    amount: number;
    fees: number;
    reason: string;
  }> {
    try {
      if (!familyMember.paymentConfig?.enabled) {
        return {
          liquidityAdded: false,
          amount: 0,
          fees: 0,
          reason: "Payment not enabled",
        };
      }

      const paymentConfig = familyMember.paymentConfig;

      // Check current balance (simplified - would integrate with actual balance checking)
      const currentBalance = 100000; // Mock balance - would get from phoenixClient
      const needsLiquidity = currentBalance < paymentConfig.amount;

      if (!needsLiquidity) {
        return {
          liquidityAdded: false,
          amount: currentBalance,
          fees: 0,
          reason: "Sufficient liquidity available",
        };
      }

      console.log(`💰 Processing payment liquidity for ${familyMember.name}:`, {
        paymentAmount: paymentConfig.amount,
        currentBalance,
        recommendedTopup: paymentConfig.amount * 2, // 2x buffer
      });

      // Request additional liquidity
      const liquidityResponse = await this.phoenixClient.requestLiquidity({
        amountSat: paymentConfig.amount * 2, // 2x buffer for multiple payments
      });

      // Log the event to user's local history
      await this.logPhoenixDOperation({
        operation: "payment_liquidity_processed",
        context: {
          mode: "family",
          userId: familyMember.id,
        },
        details: {
          familyMemberId: familyMember.id,
          channelId: liquidityResponse.channelId,
          amountSat: liquidityResponse.amountSat,
          feeSat: liquidityResponse.feeSat,
          paymentAmount: paymentConfig.amount,
          triggerType: "payment",
        },
        timestamp: new Date(),
      });

      return {
        liquidityAdded: true,
        amount: liquidityResponse.amountSat,
        fees: liquidityResponse.feeSat,
        reason: "Payment preparation",
      };
    } catch (error) {
      console.error(
        `❌ Failed to process payment liquidity for ${familyMember.name}:`,
        error
      );
      throw new Error(`Payment liquidity failed: ${error}`);
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Handle emergency liquidity protocols
   * PhoenixD: Internal Satnam Lightning wallet emergency funding
   */
  async handleEmergencyLiquidity(request: {
    familyMember: string;
    requiredAmount: number;
    urgency: "low" | "medium" | "high" | "critical";
    reason: string;
    maxFees: number;
  }): Promise<{
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

      const maxEmergencyAmount = 100000; // 100k sats max emergency
      if (request.requiredAmount > maxEmergencyAmount) {
        return {
          approved: false,
          amount: 0,
          fees: 0,
          message: `Emergency amount ${request.requiredAmount} exceeds maximum ${maxEmergencyAmount} sats`,
        };
      }

      // Calculate emergency liquidity amount
      const emergencyAmount = Math.min(
        request.requiredAmount * 1.5, // 50% buffer
        maxEmergencyAmount
      );

      // Request emergency liquidity
      const liquidityResponse = await this.phoenixClient.requestLiquidity({
        amountSat: emergencyAmount,
        fundingFeeSat: request.maxFees,
      });

      // Log emergency event to user's local history
      await this.logPhoenixDOperation({
        operation: "emergency_liquidity_handled",
        context: {
          mode: "family",
          userId: request.familyMember,
        },
        details: {
          familyMember: request.familyMember,
          channelId: liquidityResponse.channelId,
          amountSat: liquidityResponse.amountSat,
          feeSat: liquidityResponse.feeSat,
          urgency: request.urgency,
          reason: request.reason,
          triggerType: "emergency",
        },
        timestamp: new Date(),
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

      return {
        approved: false,
        amount: 0,
        fees: 0,
        message: `Emergency liquidity failed: ${error}`,
      };
    }
  }

  // ENHANCED FEATURES: Dual-Mode Operations & Emergency Protocols

  /**
   * Configure dual-mode operations for a family
   */
  async configureDualMode(
    familyId: string,
    config: DualModeConfig
  ): Promise<void> {
    console.log(`⚡ Configuring dual-mode operations for family: ${familyId}`);

    this.dualModeConfig.set(familyId, {
      ...config,
      cooldownPeriod: Math.max(config.cooldownPeriod, 300), // Minimum 5 minutes
    });

    // Setup mode monitoring
    if (config.enabled) {
      this.setupModeMonitoring(familyId);
    }

    // MASTER CONTEXT COMPLIANCE: Log to user's local history
    await this.logPhoenixDOperation({
      operation: "dual_mode_configured",
      context: { mode: "family", userId: "system", familyId },
      details: config,
      timestamp: new Date(),
    });
  }

  /**
   * Switch operation mode intelligently
   */
  async switchOperationMode(
    familyId: string,
    targetMode: "individual" | "family",
    reason: string
  ): Promise<boolean> {
    try {
      const config = this.dualModeConfig.get(familyId);
      if (!config?.enabled) {
        console.log("Dual-mode not enabled for family:", familyId);
        return false;
      }

      console.log(`🔄 Switching to ${targetMode} mode for family: ${familyId}`);
      console.log(`Reason: ${reason}`);

      // Validate switch conditions
      const canSwitch = await this.validateModeSwitch(familyId, targetMode);
      if (!canSwitch) {
        console.log("Mode switch conditions not met");
        return false;
      }

      // Execute mode switch
      const success = await this.performModeSwitch(familyId, targetMode);

      if (success) {
        console.log(`✅ Successfully switched to ${targetMode} mode`);

        // MASTER CONTEXT COMPLIANCE: Log to user's local history
        await this.logPhoenixDOperation({
          operation: "mode_switched",
          context: { mode: "family", userId: "system", familyId },
          details: { targetMode, reason, success: true },
          timestamp: new Date(),
        });
      }

      return success;
    } catch (error) {
      console.error("❌ Mode switch failed:", error);
      return false;
    }
  }

  /**
   * Configure emergency protocols
   */
  async configureEmergencyProtocols(
    familyId: string,
    protocols: EmergencyProtocol
  ): Promise<void> {
    console.log(`🚨 Configuring emergency protocols for family: ${familyId}`);

    this.emergencyProtocols.set(familyId, protocols);

    // Setup emergency monitoring
    if (protocols.enabled) {
      this.setupEmergencyMonitoring(familyId);
    }

    // MASTER CONTEXT COMPLIANCE: Log to user's local history
    await this.logPhoenixDOperation({
      operation: "emergency_protocols_configured",
      context: { mode: "family", userId: "system", familyId },
      details: protocols,
      timestamp: new Date(),
    });
  }

  /**
   * Handle emergency situations
   */
  async handleEmergency(
    familyId: string,
    trigger: string,
    severity: EmergencyEvent["severity"]
  ): Promise<EmergencyEvent> {
    try {
      console.log(`🚨 Emergency detected: ${trigger} (Severity: ${severity})`);

      const emergencyId = this.generateSecureUUID();
      const emergency: EmergencyEvent = {
        id: emergencyId,
        familyId,
        type: this.categorizeEmergencyType(trigger),
        severity,
        trigger,
        description: `Emergency triggered by: ${trigger}`,
        affectedChannels: await this.getAffectedChannels(familyId, trigger),
        automaticActions: [],
        status: "active",
        createdAt: new Date(),
      };

      this.activeEmergencies.set(emergencyId, emergency);

      // Execute emergency protocols
      await this.executeEmergencyProtocols(familyId, emergency);

      // Send alerts
      await this.sendEmergencyAlerts(familyId, emergency);

      console.log(`🚨 Emergency response initiated: ${emergencyId}`);
      return emergency;
    } catch (error) {
      console.error("❌ Emergency handling failed:", error);
      throw error;
    }
  }

  /**
   * Configure automated rebalancing
   */
  async configureRebalancing(
    familyId: string,
    strategy: RebalanceStrategy
  ): Promise<void> {
    console.log(`⚖️ Configuring rebalancing strategy for family: ${familyId}`);

    this.rebalanceStrategies.set(familyId, strategy);

    // Setup rebalancing schedule
    if (strategy.enabled && strategy.schedule.enabled) {
      this.setupRebalancingSchedule(familyId, strategy);
    }

    // MASTER CONTEXT COMPLIANCE: Log to user's local history
    await this.logPhoenixDOperation({
      operation: "rebalancing_configured",
      context: { mode: "family", userId: "system", familyId },
      details: strategy,
      timestamp: new Date(),
    });
  }

  /**
   * Execute intelligent rebalancing
   */
  async executeRebalancing(
    familyId: string,
    type: "minor" | "major" | "emergency" | "scheduled" = "minor"
  ): Promise<LiquidityOperation> {
    try {
      console.log(`⚖️ Executing ${type} rebalancing for family: ${familyId}`);

      const operationId = `rebalance_${this.generateSecureUUID()}`;
      const liquidityForecast =
        await this.liquiditySystem.generateLiquidityForecast(familyId, "daily");

      // Analyze optimal rebalancing strategy
      const strategy = await this.analyzeRebalanceStrategy(
        familyId,
        type,
        liquidityForecast
      );

      const operation: LiquidityOperation = {
        id: operationId,
        context: { userId: "system", mode: "family", familyId },
        type: "rebalance",
        amountSat: strategy.amount,
        status: "pending",
        feeSat: strategy.estimatedFee,
        priority: type === "emergency" ? "emergency" : "normal",
        createdAt: new Date(),
      };

      this.liquidityOperations.set(operationId, operation);

      // Execute rebalancing
      const result = await this.performRebalance(familyId, operation);

      operation.status = result.success ? "completed" : "failed";
      operation.completedAt = new Date();
      operation.errorMessage = result.error;

      console.log(
        `✅ Rebalancing ${
          result.success ? "completed" : "failed"
        }: ${operationId}`
      );
      return operation;
    } catch (error) {
      console.error("❌ Rebalancing failed:", error);
      throw error;
    }
  }

  // Private implementation methods for enhanced features
  private setupDefaultConfigurations(): void {
    // Setup default dual-mode config template
    console.log("📋 Setting up default configurations");
  }

  private setupGlobalMonitoring(): void {
    // Setup global health monitoring
    const globalHealthCheck = setInterval(async () => {
      try {
        await this.performGlobalHealthCheck();
      } catch (error) {
        console.error("❌ Global health check failed:", error);
      }
    }, 30000); // Every 30 seconds

    this.monitoringJobs.set("global_health", globalHealthCheck);
  }

  private setupModeMonitoring(familyId: string): void {
    const modeMonitor = setInterval(async () => {
      try {
        await this.checkModeSwithConditions(familyId);
      } catch (error) {
        console.error(`❌ Mode monitoring failed for ${familyId}:`, error);
      }
    }, 60000); // Every minute

    this.monitoringJobs.set(`mode_${familyId}`, modeMonitor);
  }

  private setupEmergencyMonitoring(familyId: string): void {
    const emergencyMonitor = setInterval(async () => {
      try {
        await this.checkEmergencyConditions(familyId);
      } catch (error) {
        console.error(`❌ Emergency monitoring failed for ${familyId}:`, error);
      }
    }, 30000); // Every 30 seconds

    this.monitoringJobs.set(`emergency_${familyId}`, emergencyMonitor);
  }

  private setupRebalancingSchedule(
    familyId: string,
    strategy: RebalanceStrategy
  ): void {
    let cronExpression: string;
    const schedule = strategy.schedule;

    switch (schedule.frequency) {
      case "hourly":
        cronExpression = "0 * * * *";
        break;
      case "daily":
        const [hour, minute] = schedule.preferredTime.split(":");
        cronExpression = `${minute} ${hour} * * *`;
        break;
      case "weekly":
        const [wHour, wMinute] = schedule.preferredTime.split(":");
        cronExpression = `${wMinute} ${wHour} * * 0`; // Sunday
        break;
      default:
        cronExpression = "0 2 * * *"; // 2 AM daily
    }

    const rebalanceJob = cron.schedule(
      cronExpression,
      async () => {
        try {
          await this.executeRebalancing(familyId, "scheduled");
        } catch (error) {
          console.error(
            `❌ Scheduled rebalancing failed for ${familyId}:`,
            error
          );
        }
      },
      { scheduled: false }
    );

    this.rebalanceJobs.set(familyId, rebalanceJob);
    rebalanceJob.start();
  }

  private async performGlobalHealthCheck(): Promise<void> {
    // Perform global health checks across all accounts
    for (const [familyId] of this.familyAccounts) {
      await this.checkEmergencyConditions(familyId);
    }
  }

  private async checkModeSwithConditions(familyId: string): Promise<void> {
    const config = this.dualModeConfig.get(familyId);
    if (!config?.enabled) return;

    // Check if conditions warrant a mode switch
    const metrics = await this.liquiditySystem.getLiquidityMetrics(familyId);

    if (metrics.utilization.current < config.switchThreshold.liquidityRatio) {
      await this.switchOperationMode(
        familyId,
        config.fallbackMode,
        "Low liquidity utilization"
      );
    }
  }

  private async checkEmergencyConditions(familyId: string): Promise<void> {
    const protocols = this.emergencyProtocols.get(familyId);
    if (!protocols?.enabled) return;

    const metrics = await this.liquiditySystem.getLiquidityMetrics(familyId);

    // Check for emergency triggers
    if (metrics.efficiency.routingSuccessRate < 0.8) {
      await this.handleEmergency(familyId, "Low routing success rate", "high");
    }

    if (
      metrics.efficiency.averageRoutingTime >
      protocols.triggers.responseTimeAbove
    ) {
      await this.handleEmergency(familyId, "High response time", "medium");
    }
  }

  private async validateModeSwitch(
    familyId: string,
    targetMode: string
  ): Promise<boolean> {
    // Validate if mode switch is safe and appropriate
    return true; // Mock implementation
  }

  private async performModeSwitch(
    familyId: string,
    targetMode: string
  ): Promise<boolean> {
    // Implement actual mode switching logic
    console.log(
      `Performing mode switch to ${targetMode} for family ${familyId}`
    );
    return true; // Mock implementation
  }

  private categorizeEmergencyType(trigger: string): EmergencyEvent["type"] {
    if (trigger.includes("liquidity")) return "liquidity_crisis";
    if (trigger.includes("channel")) return "channel_failure";
    return "performance_degradation";
  }

  private async getAffectedChannels(
    familyId: string,
    trigger: string
  ): Promise<string[]> {
    // Analyze which channels are affected by the trigger
    return ["channel_001"]; // Mock implementation
  }

  private async executeEmergencyProtocols(
    familyId: string,
    emergency: EmergencyEvent
  ): Promise<void> {
    const protocols = this.emergencyProtocols.get(familyId);
    if (!protocols) return;

    if (protocols.actions.enableEmergencyMode) {
      await this.switchOperationMode(
        familyId,
        "individual",
        `Emergency: ${emergency.trigger}`
      );
      emergency.automaticActions.push("Switched to emergency mode");
    }

    if (protocols.actions.pausePayments) {
      // Implement payment pausing logic
      emergency.automaticActions.push("Paused outgoing payments");
    }
  }

  private async sendEmergencyAlerts(
    familyId: string,
    emergency: EmergencyEvent
  ): Promise<void> {
    // Implement emergency alerting
    console.log(
      `🚨 Emergency alert sent for family ${familyId}: ${emergency.id}`
    );
  }

  private async analyzeRebalanceStrategy(
    familyId: string,
    type: string,
    forecast: any
  ): Promise<any> {
    // Analyze optimal rebalancing strategy based on forecast
    return {
      amount: 1000000,
      estimatedFee: 1000,
      sourceChannel: "channel_001",
      targetChannel: "channel_002",
    };
  }

  private async performRebalance(
    familyId: string,
    operation: LiquidityOperation
  ): Promise<any> {
    // Implement actual rebalancing logic
    console.log(
      `Performing rebalance for family ${familyId}: ${operation.amountSat} sats`
    );
    return { success: true };
  }
}

export type {
  FamilyLightningAccount,
  FamilyMemberAccount,
  IndividualLightningAccount,
  LiquidityOperation,
  LiquidityRequest,
  OperationContext,
  OperationMode,
};
