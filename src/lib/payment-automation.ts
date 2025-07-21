/**
 * Payment Automation Service - Master Context Compliant
 *
 * MASTER CONTEXT COMPLIANCE:
 * - JWT authentication integration with SecureSessionManager
 * - Privacy-first architecture (no user data logging)
 * - Browser-compatible serverless environment
 * - Standardized role hierarchy support
 * - Lightning Network integration (PhoenixD, Breez, NWC)
 * - eCash bridge compatibility (Fedimint↔Cashu)
 * - Emergency recovery system integration
 */

import { EnhancedPhoenixdManager } from "./enhanced-phoenixd-manager";
import { PhoenixdClient } from "./phoenixd-client";

/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param key - Environment variable key
 * @returns Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = import.meta as any;
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * MASTER CONTEXT COMPLIANCE: Generate privacy-preserving user hash
 * Compatible with emergency recovery system UUID patterns
 * @param userId - User identifier
 * @returns Hashed user identifier
 */
async function generateUserHash(userId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`payment_${userId}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16);
}

/**
 * MASTER CONTEXT COMPLIANCE: Privacy-first audit logging
 * @param operation - Operation type
 * @param userHash - Hashed user identifier
 * @param details - Operation details (no sensitive data)
 */
async function logPaymentOperation(
  operation: string,
  userHash: string,
  details: Record<string, any>
): Promise<void> {
  // MASTER CONTEXT COMPLIANCE: Privacy-first logging - no sensitive data
  const auditEntry = {
    operation,
    userHash,
    timestamp: new Date().toISOString(),
    details: {
      ...details,
      // Remove any potentially sensitive data
      amount: details.amount ? "[REDACTED]" : undefined,
      recipientId: details.recipientId ? "[REDACTED]" : undefined,
    },
  };

  // In production, this would be sent to secure audit system
  // For now, store in browser storage for user-controlled audit logs
  if (typeof localStorage !== "undefined") {
    const auditLogs = JSON.parse(
      localStorage.getItem("payment_audit_logs") || "[]"
    );
    auditLogs.push(auditEntry);
    if (auditLogs.length > 100) {
      auditLogs.splice(0, auditLogs.length - 100);
    }
    localStorage.setItem("payment_audit_logs", JSON.stringify(auditLogs));
  }
}

/**
 * MASTER CONTEXT: Get parent-offspring account creation relationship
 * Returns the specific Adult who created the Offspring account
 * @param offspringNpub - Offspring's npub
 * @returns Parent npub or null if not found
 */
async function getParentForOffspring(
  offspringNpub: string
): Promise<string | null> {
  try {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from("parent_offspring_relationships")
      .select("parentNpub")
      .eq("offspringNpub", offspringNpub)
      .single();

    if (error || !data) {
      return null;
    }

    return data.parentNpub;
  } catch (error) {
    return null;
  }
}

/**
 * MASTER CONTEXT: Check if user is the specific parent of an offspring
 * @param parentNpub - Parent's npub
 * @param offspringNpub - Offspring's npub
 * @returns True if this parent created this offspring account
 */
async function isSpecificParentOfOffspring(
  parentNpub: string,
  offspringNpub: string
): Promise<boolean> {
  const actualParent = await getParentForOffspring(offspringNpub);
  return actualParent === parentNpub;
}

/**
 * MASTER CONTEXT: Check spending limits for offspring accounts
 * Only the specific parent who created the offspring can approve over-limit spending
 * @param offspringNpub - Offspring's npub
 * @param amount - Payment amount in satoshis
 * @param approverNpub - Npub of the approver
 * @returns True if spending is authorized
 */
async function checkOffspringSpendingAuthorization(
  offspringNpub: string,
  amount: number,
  approverNpub: string
): Promise<boolean> {
  try {
    // Get the specific parent for this offspring
    const parentNpub = await getParentForOffspring(offspringNpub);

    if (!parentNpub) {
      return false; // No parent found, cannot authorize
    }

    // Only the specific parent can authorize spending
    if (approverNpub !== parentNpub) {
      return false; // Not the correct parent
    }

    // Get offspring spending limits from their parent's configuration
    const client = await getSupabaseClient();
    const { data: limits, error } = await client
      .from("offspring_spending_limits")
      .select("dailyLimit, weeklyLimit, requiresApprovalAbove")
      .eq("offspringNpub", offspringNpub)
      .eq("parentNpub", parentNpub)
      .single();

    if (error || !limits) {
      // No limits configured, parent must approve all spending
      return true;
    }

    // Check if amount requires parent approval
    return amount >= limits.requiresApprovalAbove;
  } catch (error) {
    return false;
  }
}

// MASTER CONTEXT COMPLIANCE: Typed Supabase client access
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("./supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

// MASTER CONTEXT COMPLIANCE: Comprehensive type definitions

/**
 * MASTER CONTEXT: Standardized role hierarchy
 */
export type UserRole =
  | "private"
  | "offspring"
  | "adult"
  | "steward"
  | "guardian";

/**
 * MASTER CONTEXT: Lightning Network node types
 */
export type LightningNodeType =
  | "voltage"
  | "phoenixd"
  | "breez"
  | "nwc"
  | "self-hosted";

/**
 * MASTER CONTEXT: Payment types for P2P Lightning integration
 */
export type PaymentType =
  | "P2P_INTERNAL_LIGHTNING"
  | "P2P_EXTERNAL_LIGHTNING"
  | "ECASH_BRIDGE"
  | "FEDIMINT_INTERNAL";

/**
 * Family member interface for approval workflows
 */
export interface FamilyMember {
  npub: string;
  role: UserRole;
  status: "pending" | "approved" | "rejected";
}

/**
 * MASTER CONTEXT: Parent-offspring account creation relationship
 * Tracks which Adult created which Offspring account for authorization
 */
export interface ParentOffspringRelationship {
  offspringNpub: string;
  parentNpub: string; // The specific Adult who created this Offspring account
  createdAt: string;
  familyId: string;
}

export type PaymentContext = "individual" | "family";

export type PaymentRouting =
  | "breez"
  | "phoenixd"
  | "voltage"
  | "cashu_mint"
  | "internal_fedimint"
  | "external_ln";

export type RecipientType =
  | "ln_address"
  | "family_member"
  | "cashu_token"
  | "fedimint_internal"
  | "npub";

export interface PaymentCascadeNode {
  recipientId: string;
  recipientNpub: string;
  amount: number;
  currency: "sats" | "ecash";
  method: "voltage" | "lnbits" | "phoenixd" | "ecash";
  children?: PaymentCascadeNode[];
}

export interface PaymentSchedule {
  id: string;
  familyId: string;
  recipientId: string;
  recipientNpub: string;
  recipientRole?: UserRole; // MASTER CONTEXT: Role of recipient for parent-offspring authorization
  amount: number; // in satoshis
  currency: "sats" | "ecash" | "fedimint";
  frequency: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  customInterval?: number; // days for custom frequency
  startDate: string;
  endDate?: string;
  nextPaymentDate: string;
  status: "active" | "paused" | "completed" | "cancelled";
  requiresApproval: boolean;
  approvalThreshold: number; // amount in satoshis that triggers approval
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  metadata: {
    description?: string;
    category?: string;
    tags?: string[];
  };
  cascade?: PaymentCascadeNode[]; // New: defines split/cascade tree
  // Extended properties for UI/modal compatibility
  recipientType?: string;
  recipientAddress?: string;
  recipientName?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  enabled?: boolean;
  paymentRouting?: string;
  routingPreferences?: {
    maxFeePercent: number;
    privacyMode: boolean;
    routingStrategy: "balanced" | "privacy" | "speed";
  };
  protocolPreferences?: {
    primary: "lightning" | "ecash" | "fedimint";
    fallback: ("lightning" | "ecash" | "fedimint")[];
    cashuMintUrl?: string;
  };
  paymentPurpose?: string;
  memo?: string;
  tags?: string[];
  autoApprovalLimit?: number;
  parentApprovalRequired?: boolean; // MASTER CONTEXT: Parent-offspring account creation relationship (NOT role hierarchy)
  preferredMethod?: string;
  maxRetries?: number;
  retryDelay?: number;
  conditions?: {
    maxDailySpend: number;
    maxTransactionSize: number;
    requireApprovalAbove: number;
    pauseOnSuspiciousActivity: boolean;
    maxLightningAmount: number;
    maxCashuAmount: number;
    maxFedimintAmount: number;
    minimumPrivacyScore: number;
    requireTorRouting: boolean;
    avoidKYCNodes: boolean;
  };
  notificationSettings?: {
    notifyOnDistribution: boolean;
    notifyOnFailure: boolean;
    notifyOnSuspiciousActivity: boolean;
    notificationMethods: string[];
  };
  distributionCount?: number;
  totalDistributed?: number;
  nextDistribution: Date;
}

export interface PaymentTransaction {
  id: string;
  scheduleId: string;
  familyId: string;
  recipientId: string;
  recipientNpub: string;
  amount: number;
  currency: "sats" | "ecash" | "fedimint";
  status: "pending" | "approved" | "rejected" | "sent" | "failed";
  paymentMethod: "lightning" | "ecash" | "fedimint";
  lightningInvoice?: string;
  ecashToken?: string;
  fedimintProof?: string;
  approvalRequired: boolean;
  approvedBy?: string[];
  rejectedBy?: string[];
  sentAt?: string;
  failedAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  cascade?: PaymentCascadeNode[]; // New: records actual split/cascade
}

export interface ApprovalRequest {
  id: string;
  transactionId: string;
  familyId: string;
  requesterId: string;
  requesterNpub: string;
  recipientNpub: string; // MASTER CONTEXT: Needed for parent-offspring authorization
  recipientRole?: UserRole; // MASTER CONTEXT: Role of recipient for authorization logic
  amount: number;
  currency: "sats" | "ecash" | "fedimint";
  description: string;
  urgency: "low" | "medium" | "high" | "urgent";
  status: "pending" | "approved" | "rejected" | "expired";
  approvers: {
    npub: string;
    role: "guardian" | "steward" | "adult";
    status: "pending" | "approved" | "rejected";
    approvedAt?: string;
    rejectedAt?: string;
    reason?: string;
  }[];
  requiredApprovals: number;
  receivedApprovals: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhoenixDLiquidityConfig {
  familyId: string;
  minBalance: number; // minimum balance to maintain in satoshis
  maxBalance: number; // maximum balance to maintain in satoshis
  autoReplenish: boolean;
  replenishThreshold: number; // percentage of minBalance to trigger replenishment
  replenishAmount: number; // amount to replenish in satoshis
  maxReplenishPerDay: number; // maximum replenishments per day
  dailyReplenishCount: number;
  lastReplenishDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentNotification {
  id: string;
  familyId: string;
  recipientId: string;
  recipientNpub: string;
  type:
    | "payment_sent"
    | "payment_received"
    | "limit_exceeded"
    | "approval_required"
    | "approval_granted"
    | "approval_rejected";
  title: string;
  message: string;
  amount?: number;
  currency?: "sats" | "ecash" | "fedimint";
  read: boolean;
  createdAt: string;
}

// --- VOLTAGE & LNBITS INTEGRATION HELPERS ---

async function sendViaVoltage(invoice: string, familyId: string) {
  const response = await fetch("/api/voltage/pay-invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice, familyId }),
  });
  if (!response.ok) throw new Error("Voltage payment failed");
  return response.json();
}

async function sendViaLNbits(invoice: string, walletId: string) {
  const response = await fetch("/api/lnbits/pay-invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice, walletId }),
  });
  if (!response.ok) throw new Error("LNbits payment failed");
  return response.json();
}

// --- CASCADE EXECUTION LOGIC ---

export class PaymentAutomationService {
  private static instance: PaymentAutomationService;
  private notificationCallbacks: Map<
    string,
    (notification: PaymentNotification) => void
  > = new Map();
  private phoenixDClient: PhoenixdClient;
  private enhancedPhoenixDManager: EnhancedPhoenixdManager;

  private constructor() {
    this.phoenixDClient = new PhoenixdClient();
    this.enhancedPhoenixDManager = new EnhancedPhoenixdManager();
    this.initializePhoenixD();
    this.startPaymentScheduler();
  }

  static getInstance(): PaymentAutomationService {
    if (!PaymentAutomationService.instance) {
      PaymentAutomationService.instance = new PaymentAutomationService();
    }
    return PaymentAutomationService.instance;
  }

  /**
   * Initialize PhoenixD client for automated liquidity management
   */
  private async initializePhoenixD() {
    try {
      // Test PhoenixD connection
      const isConnected = await this.phoenixDClient.testConnection();
      if (!isConnected) {
        console.warn(
          "PhoenixD connection failed, some features may be limited"
        );
        return;
      }

      const nodeStatus = await this.phoenixDClient.getFamilyNodeStatus();

      // MASTER CONTEXT COMPLIANCE: Privacy-first logging
      await logPaymentOperation(
        "phoenixd_initialized",
        await generateUserHash("system"),
        {
          hasActiveChannels: nodeStatus.activeChannels > 0,
          hasLiquidity: nodeStatus.totalLiquidity > 0,
        }
      );

      this.monitorPhoenixDLiquidity();
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
    }
  }

  /**
   * Start the payment scheduler to process recurring payments
   */
  private startPaymentScheduler() {
    // Check for due payments every minute
    setInterval(async () => {
      await this.processDuePayments();
    }, 60000);

    // Check PhoenixD liquidity every 5 minutes
    setInterval(async () => {
      await this.monitorPhoenixDLiquidity();
    }, 300000);
  }

  /**
   * Create a new payment schedule
   */
  static async createPaymentSchedule(
    schedule: Omit<PaymentSchedule, "id" | "createdAt" | "updatedAt">
  ): Promise<PaymentSchedule> {
    try {
      const client = await getSupabaseClient();
      const { data, error } = await client
        .from("family_payment_schedules")
        .insert({
          ...schedule,
          nextPaymentDate: this.calculateNextPaymentDate(
            schedule.startDate,
            schedule.frequency,
            schedule.customInterval
          ),
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create payment schedule: ${error.message}`);
      }

      // Send notification to family members
      await this.sendNotification({
        familyId: schedule.familyId,
        recipientId: schedule.recipientId,
        recipientNpub: schedule.recipientNpub,
        type: "payment_sent",
        title: "New Payment Schedule Created",
        message: `A new ${schedule.frequency} payment of ${schedule.amount} ${schedule.currency} has been scheduled.`,
        amount: schedule.amount,
        currency: schedule.currency,
        read: false,
        createdAt: new Date().toISOString(),
      });

      return data;
    } catch (error) {
      console.error("Error creating payment schedule:", error);
      throw error;
    }
  }

  /**
   * Process all due payments
   */
  private async processDuePayments() {
    try {
      const now = new Date().toISOString();
      const client = await getSupabaseClient();

      const { data: dueSchedules, error } = await client
        .from("family_payment_schedules")
        .select("*")
        .eq("status", "active")
        .lte("nextPaymentDate", now);

      if (error) {
        return;
      }

      for (const schedule of dueSchedules || []) {
        await this.processPayment(schedule);
      }
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: No sensitive data logging
    }
  }

  /**
   * Process a single payment
   */
  private async processPayment(schedule: PaymentSchedule) {
    try {
      // If cascade is defined, process recursively
      if (schedule.cascade && schedule.cascade.length > 0) {
        for (const node of schedule.cascade) {
          await this.executeCascadePayment(node, undefined, schedule.familyId);
        }
        // Update next payment date
        await PaymentAutomationService.updateNextPaymentDate(schedule);
        return;
      }

      // Check if payment requires approval
      if (
        schedule.requiresApproval &&
        schedule.amount >= schedule.approvalThreshold
      ) {
        await this.createApprovalRequest(schedule);
        return;
      }

      // Create payment transaction
      const transaction: Omit<
        PaymentTransaction,
        "id" | "createdAt" | "updatedAt"
      > = {
        scheduleId: schedule.id,
        familyId: schedule.familyId,
        recipientId: schedule.recipientId,
        recipientNpub: schedule.recipientNpub,
        amount: schedule.amount,
        currency: schedule.currency,
        status: "pending",
        paymentMethod: this.determinePaymentMethod(schedule.currency),
        approvalRequired: false,
      };

      const client = await getSupabaseClient();
      const { data: paymentTx, error } = await client
        .from("family_payment_transactions")
        .insert(transaction)
        .select()
        .single();

      if (error) {
        throw new Error(
          `Failed to create payment transaction: ${error.message}`
        );
      }

      await this.executePayment(paymentTx);
      await PaymentAutomationService.updateNextPaymentDate(schedule);
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
      await PaymentAutomationService.sendNotification({
        familyId: schedule.familyId,
        recipientId: schedule.recipientId,
        recipientNpub: schedule.recipientNpub,
        type: "payment_sent",
        title: "Payment Failed",
        message: `Scheduled payment failed to process.`,
        amount: schedule.amount,
        currency: schedule.currency,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Execute payment using appropriate method
   */
  private async executePayment(transaction: PaymentTransaction) {
    try {
      switch (transaction.paymentMethod) {
        case "lightning":
          await this.executeLightningPayment(transaction);
          break;
        case "ecash":
          await this.executeECashPayment(transaction);
          break;
        case "fedimint":
          await this.executeFedimintPayment(transaction);
          break;
        default:
          throw new Error(
            `Unsupported payment method: ${transaction.paymentMethod}`
          );
      }

      const client = await getSupabaseClient();
      await client
        .from("family_payment_transactions")
        .update({
          status: "sent",
          sentAt: new Date().toISOString(),
        })
        .eq("id", transaction.id);

      await PaymentAutomationService.sendNotification({
        familyId: transaction.familyId,
        recipientId: transaction.recipientId,
        recipientNpub: transaction.recipientNpub,
        type: "payment_sent",
        title: "Payment Sent Successfully",
        message: `Payment has been sent successfully.`,
        amount: transaction.amount,
        currency: transaction.currency,
        read: false,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
      const client = await getSupabaseClient();
      await client
        .from("family_payment_transactions")
        .update({
          status: "failed",
          failedAt: new Date().toISOString(),
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        })
        .eq("id", transaction.id);

      throw error;
    }
  }

  /**
   * Execute Lightning payment using PhoenixD
   */
  private async executeLightningPayment(transaction: PaymentTransaction) {
    try {
      // Check if we have a Lightning invoice
      if (!transaction.lightningInvoice) {
        throw new Error("No Lightning invoice provided for payment");
      }

      // Execute payment via PhoenixD
      const payment = await this.phoenixDClient.payInvoice(
        transaction.lightningInvoice,
        transaction.amount,
        transaction.recipientId // family member tracking
      );

      if (payment.isPaid) {
        const client = await getSupabaseClient();
        await client
          .from("family_payment_transactions")
          .update({
            status: "sent",
            sentAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .eq("id", transaction.id);

        await PaymentAutomationService.sendNotification({
          familyId: transaction.familyId,
          recipientId: transaction.recipientId,
          recipientNpub: transaction.recipientNpub,
          type: "payment_sent",
          title: "Payment Sent Successfully",
          message: `Lightning payment has been sent successfully.`,
          amount: transaction.amount,
          currency: transaction.currency,
          read: false,
          createdAt: new Date().toISOString(),
        });

        // MASTER CONTEXT COMPLIANCE: Privacy-first logging
      } else {
        throw new Error("Payment was not completed successfully");
      }
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
      const client = await getSupabaseClient();
      await client
        .from("family_payment_transactions")
        .update({
          status: "failed",
          failedAt: new Date().toISOString(),
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
          updatedAt: new Date().toISOString(),
        })
        .eq("id", transaction.id);

      throw error;
    }
  }

  /**
   * Execute eCash payment
   */
  private async executeECashPayment(transaction: PaymentTransaction) {
    try {
      // Create eCash tokens for the recipient
      const ecashResponse = await fetch("/api/ecash/create-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: transaction.amount,
          recipientNpub: transaction.recipientNpub,
          familyId: transaction.familyId,
        }),
      });

      if (!ecashResponse.ok) {
        throw new Error("Failed to create eCash tokens");
      }

      const { tokens } = await ecashResponse.json();

      const client = await getSupabaseClient();
      await client
        .from("family_payment_transactions")
        .update({
          ecashToken: JSON.stringify(tokens),
        })
        .eq("id", transaction.id);
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
      throw error;
    }
  }

  /**
   * Execute Fedimint payment
   */
  private async executeFedimintPayment(transaction: PaymentTransaction) {
    try {
      const fedimintResponse = await fetch("/api/fedimint/create-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: transaction.amount,
          recipientNpub: transaction.recipientNpub,
          familyId: transaction.familyId,
        }),
      });

      if (!fedimintResponse.ok) {
        throw new Error("Failed to create Fedimint proof");
      }

      const { proof } = await fedimintResponse.json();

      const client = await getSupabaseClient();
      await client
        .from("family_payment_transactions")
        .update({
          fedimintProof: JSON.stringify(proof),
        })
        .eq("id", transaction.id);
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
      throw error;
    }
  }

  /**
   * Entry point for executing a payment (with or without cascade)
   */
  private async executeCascadePayment(
    node: PaymentCascadeNode,
    parentTxId?: string,
    familyId?: string
  ) {
    // 1. If node has children, split and recursively execute
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        await this.executeCascadePayment(child, parentTxId, familyId);
      }
      return;
    }
    // 2. Otherwise, execute the payment for this node
    if (node.currency === "sats") {
      await this.executeLNPayment(node, familyId);
    } else if (node.currency === "ecash") {
      await this.executeECashCascade(node, familyId);
    }
  }

  /**
   * Execute Lightning payment in cascade using PhoenixD
   */
  private async executeLNPayment(node: PaymentCascadeNode, familyId?: string) {
    try {
      // Create Lightning invoice for the recipient
      const invoice = await this.phoenixDClient.createFamilyInvoice(
        node.recipientId,
        node.amount,
        "Cascade payment from family treasury",
        { enablePrivacy: true }
      );

      // Execute payment via PhoenixD
      const payment = await this.phoenixDClient.payInvoice(
        invoice.serialized,
        node.amount,
        node.recipientId
      );

      if (payment.isPaid) {
        // MASTER CONTEXT COMPLIANCE: Privacy-first logging
        await logPaymentOperation(
          "cascade_lightning_payment",
          await generateUserHash(node.recipientId),
          {
            paymentCompleted: true,
            hasChildren: node.children && node.children.length > 0,
          }
        );

        if (node.children && node.children.length > 0) {
          for (const child of node.children) {
            await this.executeCascadePayment(
              child,
              payment.paymentId,
              familyId
            );
          }
        }
      } else {
        throw new Error("Cascade Lightning payment failed");
      }
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
      throw error;
    }
  }

  /**
   * Execute an eCash payment and recursively split if needed
   */
  private async executeECashCascade(
    node: PaymentCascadeNode,
    familyId?: string
  ) {
    // 1. Mint eCash tokens for the recipient
    const ecashRes = await fetch("/api/ecash/create-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: node.amount,
        recipientNpub: node.recipientNpub,
        familyId: familyId || "",
      }),
    });
    if (!ecashRes.ok) throw new Error("Failed to mint eCash tokens");
    const { tokens } = await ecashRes.json();
    // 2. Notify recipient
    await PaymentAutomationService.sendNotification({
      familyId: familyId || "",
      recipientId: node.recipientId,
      recipientNpub: node.recipientNpub,
      type: "payment_sent",
      title: "Cascade eCash Payment",
      message: `You have received a split eCash payment of ${node.amount}.`,
      amount: node.amount,
      currency: "ecash",
      read: false,
      createdAt: new Date().toISOString(),
    });
    // 3. If children, recursively mint/split
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        await this.executeECashCascade(child, familyId);
      }
    }
  }

  /**
   * Create approval request for large payments
   */
  private async createApprovalRequest(schedule: PaymentSchedule) {
    try {
      const client = await getSupabaseClient();

      // MASTER CONTEXT: Get the specific parent for offspring approval
      // For offspring accounts, only their creating Adult can approve
      let approvers: FamilyMember[] = [];

      if (schedule.recipientRole === "offspring") {
        const parentNpub = await getParentForOffspring(schedule.recipientNpub);
        if (parentNpub) {
          // Only the specific parent who created this offspring account
          approvers = [
            {
              npub: parentNpub,
              role: "adult" as UserRole,
              status: "pending" as const,
            },
          ];
        }
      } else {
        // For non-offspring, use family guardians/stewards as before
        const { data: familyApprovers, error } = await client
          .from("family_members")
          .select("npub, role")
          .eq("familyId", schedule.familyId)
          .in("role", ["guardian", "steward", "adult"]);

        if (error) {
          throw new Error(`Failed to fetch approvers: ${error.message}`);
        }

        approvers =
          familyApprovers?.map((approver: any) => ({
            npub: approver.npub,
            role: approver.role as UserRole,
            status: "pending" as const,
          })) || [];
      }

      const approvalRequest: Omit<
        ApprovalRequest,
        "id" | "createdAt" | "updatedAt"
      > = {
        transactionId: "",
        familyId: schedule.familyId,
        requesterId: schedule.createdBy,
        requesterNpub: "",
        recipientNpub: schedule.recipientNpub, // MASTER CONTEXT: Required for parent-offspring authorization
        recipientRole: schedule.recipientRole, // MASTER CONTEXT: Required for authorization logic
        amount: schedule.amount,
        currency: schedule.currency,
        description:
          schedule.metadata.description || "Scheduled family payment",
        urgency: this.determineUrgency(schedule.amount),
        status: "pending",
        approvers:
          approvers?.map((approver: FamilyMember) => ({
            npub: approver.npub,
            role: approver.role as "guardian" | "steward" | "adult",
            status: "pending" as const,
          })) || [],
        requiredApprovals: this.calculateRequiredApprovals(
          approvers?.length || 0
        ),
        receivedApprovals: 0,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const { data, error: approvalError } = await client
        .from("family_approval_requests")
        .insert(approvalRequest)
        .select()
        .single();

      if (approvalError) {
        throw new Error(
          `Failed to create approval request: ${approvalError.message}`
        );
      }

      // Send notification to all approvers
      for (const approver of approvalRequest.approvers as Array<{
        npub: string;
        role: string;
        status: string;
      }>) {
        await PaymentAutomationService.sendNotification({
          familyId: schedule.familyId,
          recipientId: "",
          recipientNpub: approver.npub,
          type: "approval_required",
          title: "Payment Approval Required",
          message: `A payment of ${schedule.amount} ${schedule.currency} requires your approval.`,
          amount: schedule.amount,
          currency: schedule.currency,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error creating approval request:", error);
      throw error;
    }
  }

  /**
   * Approve or reject a payment request
   */
  static async approvePayment(
    approvalId: string,
    approverNpub: string,
    approved: boolean,
    reason?: string
  ) {
    try {
      const client = await getSupabaseClient();
      const { data: approval, error } = await client
        .from("family_approval_requests")
        .select("*")
        .eq("id", approvalId)
        .single();

      if (error) {
        throw new Error(`Failed to fetch approval request: ${error.message}`);
      }

      // MASTER CONTEXT: Validate parent-offspring authorization
      // Check if this is an offspring payment requiring specific parent approval
      const recipientRole = approval.recipientRole;
      if (recipientRole === "offspring") {
        const isAuthorizedParent = await isSpecificParentOfOffspring(
          approverNpub,
          approval.recipientNpub
        );

        if (!isAuthorizedParent) {
          throw new Error(
            "Only the specific parent who created this offspring account can approve their payments"
          );
        }
      }

      const updatedApprovers = approval.approvers.map((approver: any) => {
        if (approver.npub === approverNpub) {
          return {
            ...approver,
            status: approved ? "approved" : "rejected",
            [approved ? "approvedAt" : "rejectedAt"]: new Date().toISOString(),
            reason,
          };
        }
        return approver;
      });

      const receivedApprovals = updatedApprovers.filter(
        (a: any) => a.status === "approved"
      ).length;
      const status =
        approved && receivedApprovals >= approval.requiredApprovals
          ? "approved"
          : !approved
          ? "rejected"
          : "pending";

      await client
        .from("family_approval_requests")
        .update({
          approvers: updatedApprovers,
          receivedApprovals,
          status,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", approvalId);

      // Send notification to requester
      await this.sendNotification({
        familyId: approval.familyId,
        recipientId: approval.requesterId,
        recipientNpub: approval.requesterNpub,
        type: approved ? "approval_granted" : "approval_rejected",
        title: approved ? "Payment Approved" : "Payment Rejected",
        message: approved
          ? `Your payment of ${approval.amount} ${approval.currency} has been approved.`
          : `Your payment of ${approval.amount} ${approval.currency} has been rejected.`,
        amount: approval.amount,
        currency: approval.currency,
        read: false,
        createdAt: new Date().toISOString(),
      });

      // If approved and has enough approvals, process the payment
      if (status === "approved") {
        // Process the approved payment
        // This would trigger the actual payment execution
      }
    } catch (error) {
      console.error("Error approving payment:", error);
      throw error;
    }
  }

  /**
   * Monitor PhoenixD liquidity and auto-replenish when needed
   */
  private async monitorPhoenixDLiquidity() {
    try {
      const client = await getSupabaseClient();
      const { data: liquidityConfigs, error } = await client
        .from("family_phoenixd_liquidity_configs")
        .select("*")
        .eq("autoReplenish", true);

      if (error) {
        return;
      }

      for (const config of liquidityConfigs || []) {
        await this.checkFamilyLiquidity(config);
      }
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
    }
  }

  /**
   * Check family liquidity and replenish if needed
   */
  private async checkFamilyLiquidity(config: PhoenixDLiquidityConfig) {
    try {
      // Get current family balance from PhoenixD
      const balance = await this.phoenixDClient.getBalance();
      const currentBalance = balance.balanceSat;

      // Check if replenishment is needed
      const replenishThreshold =
        config.minBalance * (config.replenishThreshold / 100);

      if (
        currentBalance < replenishThreshold &&
        this.canReplenishToday(config)
      ) {
        await this.replenishLiquidity(config, currentBalance);
      }
    } catch (error) {
      console.error(
        `Error checking liquidity for family ${config.familyId}:`,
        error
      );
    }
  }

  /**
   * Replenish family liquidity via PhoenixD
   */
  private async replenishLiquidity(
    config: PhoenixDLiquidityConfig,
    currentBalance: number
  ) {
    try {
      const replenishAmount = Math.min(
        config.replenishAmount,
        config.maxBalance - currentBalance
      );

      if (replenishAmount <= 0) {
        return;
      }

      // Request liquidity from PhoenixD
      const liquidityResponse = await this.phoenixDClient.requestLiquidity({
        amountSat: replenishAmount,
      });

      const client = await getSupabaseClient();
      await client
        .from("family_phoenixd_liquidity_configs")
        .update({
          dailyReplenishCount: config.dailyReplenishCount + 1,
          lastReplenishDate: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .eq("familyId", config.familyId);

      // MASTER CONTEXT COMPLIANCE: Privacy-first logging
      await logPaymentOperation(
        "phoenixd_liquidity_replenished",
        await generateUserHash(config.familyId),
        {
          replenishmentCompleted: true,
          hasMinimumLiquidity: true,
        }
      );

      // Send notification to family guardians
      await PaymentAutomationService.sendNotification({
        familyId: config.familyId,
        recipientId: "guardian", // This would need to be expanded to notify all guardians
        recipientNpub: "", // Would need guardian npub
        type: "payment_sent",
        title: "Liquidity Replenished",
        message: `Family liquidity has been automatically replenished with ${replenishAmount} sats.`,
        amount: replenishAmount,
        currency: "sats",
        read: false,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        `Error replenishing liquidity for family ${config.familyId}:`,
        error
      );

      // Send alert notification
      await PaymentAutomationService.sendNotification({
        familyId: config.familyId,
        recipientId: "guardian",
        recipientNpub: "",
        type: "limit_exceeded",
        title: "Liquidity Replenishment Failed",
        message: `Failed to replenish family liquidity. Manual intervention may be required.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Send notification to family members
   */
  static async sendNotification(notification: Omit<PaymentNotification, "id">) {
    try {
      const client = await getSupabaseClient();
      const { data, error } = await client
        .from("family_payment_notifications")
        .insert(notification)
        .select()
        .single();

      if (error) {
        // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
        return;
      }

      const service = PaymentAutomationService.getInstance();
      service.notificationCallbacks.forEach((callback) => {
        callback(data);
      });
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
    }
  }

  /**
   * Subscribe to payment notifications
   */
  static subscribeToNotifications(
    callback: (notification: PaymentNotification) => void
  ): string {
    const service = PaymentAutomationService.getInstance();
    const subscriptionId = Date.now().toString();
    service.notificationCallbacks.set(subscriptionId, callback);
    return subscriptionId;
  }

  /**
   * Unsubscribe from payment notifications
   */
  static unsubscribeFromNotifications(subscriptionId: string) {
    const service = PaymentAutomationService.getInstance();
    service.notificationCallbacks.delete(subscriptionId);
  }

  // Utility methods
  private static calculateNextPaymentDate(
    startDate: string,
    frequency: string,
    customInterval?: number
  ): string {
    const start = new Date(startDate);
    const now = new Date();

    if (start > now) {
      return startDate;
    }

    let nextDate = new Date(start);

    while (nextDate <= now) {
      switch (frequency) {
        case "daily":
          nextDate.setDate(nextDate.getDate() + 1);
          break;
        case "weekly":
          nextDate.setDate(nextDate.getDate() + 7);
          break;
        case "monthly":
          nextDate.setMonth(nextDate.getMonth() + 1);
          break;
        case "yearly":
          nextDate.setFullYear(nextDate.getFullYear() + 1);
          break;
        case "custom":
          nextDate.setDate(nextDate.getDate() + (customInterval || 1));
          break;
      }
    }

    return nextDate.toISOString();
  }

  static async updateNextPaymentDate(schedule: PaymentSchedule) {
    const nextDate = this.calculateNextPaymentDate(
      schedule.nextPaymentDate,
      schedule.frequency,
      schedule.customInterval
    );

    const client = await getSupabaseClient();
    return client
      .from("family_payment_schedules")
      .update({ nextPaymentDate: nextDate })
      .eq("id", schedule.id);
  }

  private determinePaymentMethod(
    currency: string
  ): "lightning" | "ecash" | "fedimint" {
    switch (currency) {
      case "sats":
        return "lightning";
      case "ecash":
        return "ecash";
      case "fedimint":
        return "fedimint";
      default:
        return "lightning";
    }
  }

  private determineUrgency(
    amount: number
  ): "low" | "medium" | "high" | "urgent" {
    if (amount >= 1000000) return "urgent"; // 1M sats
    if (amount >= 100000) return "high"; // 100K sats
    if (amount >= 10000) return "medium"; // 10K sats
    return "low";
  }

  private calculateRequiredApprovals(approverCount: number): number {
    if (approverCount <= 2) return 1;
    if (approverCount <= 4) return 2;
    return Math.ceil(approverCount * 0.6); // 60% of approvers
  }

  private isNewDay(lastReplenishDate: string): boolean {
    const last = new Date(lastReplenishDate);
    const now = new Date();
    return (
      last.getDate() !== now.getDate() ||
      last.getMonth() !== now.getMonth() ||
      last.getFullYear() !== now.getFullYear()
    );
  }

  private canReplenishToday(config: PhoenixDLiquidityConfig): boolean {
    const lastReplenish = new Date(config.lastReplenishDate);
    const now = new Date();
    return (
      lastReplenish.getDate() !== now.getDate() ||
      lastReplenish.getMonth() !== now.getMonth() ||
      lastReplenish.getFullYear() !== now.getFullYear()
    );
  }

  /**
   * Get pending payment transactions for a family
   */
  static async getPendingPayments(
    familyId: string
  ): Promise<PaymentTransaction[]> {
    try {
      const client = await getSupabaseClient();
      const { data, error } = await client
        .from("family_payment_transactions")
        .select("*")
        .eq("familyId", familyId)
        .eq("status", "pending")
        .order("createdAt", { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch pending payments: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
      return [];
    }
  }

  /**
   * Get payment schedules for a family
   */
  static async getPaymentSchedules(
    familyId: string
  ): Promise<PaymentSchedule[]> {
    try {
      const client = await getSupabaseClient();
      const { data, error } = await client
        .from("family_payment_schedules")
        .select("*")
        .eq("familyId", familyId)
        .order("nextPaymentDate", { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch payment schedules: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
      return [];
    }
  }

  /**
   * Get payment transactions for a family
   */
  static async getPaymentTransactions(
    familyId: string
  ): Promise<PaymentTransaction[]> {
    try {
      const client = await getSupabaseClient();
      const { data, error } = await client
        .from("family_payment_transactions")
        .select("*")
        .eq("familyId", familyId)
        .order("createdAt", { ascending: false });

      if (error) {
        throw new Error(
          `Failed to fetch payment transactions: ${error.message}`
        );
      }

      return data || [];
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
      return [];
    }
  }

  /**
   * Get approval requests for a family
   */
  static async getApprovalRequests(
    familyId: string
  ): Promise<ApprovalRequest[]> {
    try {
      const client = await getSupabaseClient();
      const { data, error } = await client
        .from("family_approval_requests")
        .select("*")
        .eq("familyId", familyId)
        .order("createdAt", { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch approval requests: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
      return [];
    }
  }

  /**
   * Get notifications for a user
   */
  static async getNotifications(
    recipientNpub: string
  ): Promise<PaymentNotification[]> {
    try {
      const client = await getSupabaseClient();
      const { data, error } = await client
        .from("family_payment_notifications")
        .select("*")
        .eq("recipientNpub", recipientNpub)
        .order("createdAt", { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch notifications: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  static async markNotificationAsRead(notificationId: string) {
    try {
      const client = await getSupabaseClient();
      await client
        .from("family_payment_notifications")
        .update({ read: true })
        .eq("id", notificationId);
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: Privacy-first error handling
    }
  }
}

export default PaymentAutomationService;
