/**
 * Enhanced PhoenixD Manager for Individual & Family Lightning Operations
 *
 * Provides unified interface for both individual and family Lightning accounts
 * with PhoenixD liquidity management, automated balancing, and emergency protocols
 *
 * @fileoverview Enhanced PhoenixD dual-mode management system
 */

import { PhoenixdClient } from "./phoenixd-client";

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
  role: "parent" | "teen" | "child";
  individualChannelId?: string;
  allocatedBalanceSat: number;
  limits: {
    dailyLimit?: number;
    weeklyLimit?: number;
    transactionLimit?: number;
  };
  allowance?: {
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
  type: "channel_open" | "rebalance" | "emergency_fund" | "allowance_topup";
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
  reason: "payment" | "allowance" | "rebalance" | "emergency";
  maxFeeSat?: number;
}

/**
 * Enhanced PhoenixD Manager supporting both individual and family operations
 */
export class EnhancedPhoenixdManager {
  private phoenixClient: PhoenixdClient;
  private individualAccounts: Map<string, IndividualLightningAccount> =
    new Map();
  private familyAccounts: Map<string, FamilyLightningAccount> = new Map();
  private liquidityOperations: Map<string, LiquidityOperation> = new Map();

  constructor() {
    this.phoenixClient = new PhoenixdClient();
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
      role: "parent" | "teen" | "child";
      limits?: FamilyMemberAccount["limits"];
      allowance?: FamilyMemberAccount["allowance"];
    }>
  ): Promise<FamilyLightningAccount> {
    await this.phoenixClient.getNodeInfo(); // Verify connection
    const balance = await this.phoenixClient.getBalance();

    const familyMembers: FamilyMemberAccount[] = members.map((member) => ({
      ...member,
      allocatedBalanceSat: 0,
      limits: member.limits || {
        dailyLimit:
          member.role === "child"
            ? 10000
            : member.role === "teen"
              ? 50000
              : undefined,
        weeklyLimit:
          member.role === "child"
            ? 50000
            : member.role === "teen"
              ? 200000
              : undefined,
        transactionLimit:
          member.role === "child"
            ? 5000
            : member.role === "teen"
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
        message: `Payment failed: ${error instanceof Error ? error.message : "Unknown error"}`,
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
    const operationId = `liq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
   * Process family allowance payments
   */
  async processFamilyAllowances(familyId: string): Promise<{
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
      if (member.allowance?.enabled && this.isAllowanceDue(member.allowance)) {
        try {
          const operation = await this.provisionLiquidity({
            context: {
              mode: "family",
              userId: member.userId,
              familyId,
              parentUserId: familyAccount.parentUserId,
            },
            requiredAmountSat: member.allowance.amount,
            urgencyLevel: "normal",
            reason: "allowance",
          });

          operations.push(operation);

          if (operation.status === "completed") {
            processed++;
            // Update next payment date
            member.allowance.nextPayment = this.calculateNextPaymentDate(
              member.allowance
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
   * Check if allowance payment is due
   */
  private isAllowanceDue(allowance: FamilyMemberAccount["allowance"]): boolean {
    if (!allowance) return false;
    return new Date() >= allowance.nextPayment;
  }

  /**
   * Calculate next allowance payment date
   */
  private calculateNextPaymentDate(
    allowance: FamilyMemberAccount["allowance"]
  ): Date {
    if (!allowance) return new Date();

    const now = new Date();
    switch (allowance.frequency) {
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
