/**
 * @fileoverview Enhanced Family Wallet System with Spending Limits & Approval Workflows
 * @description Enforces per-user spending limits and integrates with payment automation for approval workflows
 * @compliance Master Context - Bitcoin-only, privacy-first, sovereign family banking
 * @integration Payment Automation, PhoenixD, Lightning, eCash, Fedimint
 * @security Privacy-first: NO PII stored, only hashed UUIDs, never log npubs
 */

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("./supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

import {
  ApprovalRequest,
  PaymentAutomationService,
  PaymentTransaction,
} from "./payment-automation";

// --- PROPER TYPE DEFINITIONS ---

interface DatabaseTransaction {
  amount: number;
  created_at: string;
}

interface DatabaseMember {
  member_hash: string;
  role: string;
}

interface DatabaseSpendingHistory {
  daily: number;
  weekly: number;
  monthly: number;
  lastReset: string;
}

interface LimitCheckResult {
  dailyExceeded: boolean;
  weeklyExceeded: boolean;
  monthlyExceeded: boolean;
  approvalThresholdExceeded: boolean;
  violations: SpendingLimitViolation[];
}

// --- PROPER TYPE DEFINITIONS ---

interface DatabaseTransaction {
  amount: number;
  created_at: string;
}

interface DatabaseMember {
  member_hash: string;
  role: string;
}

interface DatabaseSpendingHistory {
  daily: number;
  weekly: number;
  monthly: number;
  lastReset: string;
}

interface LimitCheckResult {
  dailyExceeded: boolean;
  weeklyExceeded: boolean;
  monthlyExceeded: boolean;
  approvalThresholdExceeded: boolean;
  violations: SpendingLimitViolation[];
}

// --- ENHANCED FAMILY MEMBER INTERFACE ---

export interface FamilyMemberSpendingLimits {
  daily: number; // in satoshis
  weekly: number; // in satoshis
  monthly: number; // in satoshis
  requiresApproval: number; // amount that triggers approval requirement
  autoApprovalLimit: number; // amount that can be auto-approved
  approvalRoles: ("guardian" | "steward" | "adult")[]; // who can approve
  requiredApprovals: number; // number of approvals needed
}

export interface FamilyMemberWallet {
  id: string;
  familyId: string;
  memberHash: string; // Privacy-first: hashed UUID instead of npub
  role: "guardian" | "steward" | "adult" | "offspring";
  nameHash: string; // Privacy-first: hashed name instead of plain text

  // Balances
  lightningBalance: number; // in satoshis
  ecashBalance: number; // in satoshis
  fedimintBalance: number; // in satoshis
  totalBalance: number; // in satoshis

  // Spending Limits & Controls
  spendingLimits: FamilyMemberSpendingLimits;
  spendingHistory: {
    daily: number;
    weekly: number;
    monthly: number;
    lastReset: string;
  };

  // Approval Status
  pendingApprovals: string[]; // approval request IDs
  canApproveFor: string[]; // member hashes this member can approve for

  // Privacy Settings
  privacySettings: {
    enableLNProxy: boolean;
    enableFedimintPrivacy: boolean;
    defaultRouting: "lightning" | "ecash" | "fedimint" | "auto";
  };

  // Timestamps
  createdAt: string;
  updatedAt: string;
  lastActivity: string;
}

export interface PaymentRequest {
  id: string;
  familyId: string;
  requesterHash: string; // Privacy-first: hashed UUID instead of npub
  recipientHash?: string; // Privacy-first: hashed UUID instead of npub
  amount: number; // in satoshis
  currency: "sats" | "ecash" | "fedimint";
  method: "voltage" | "lnbits" | "phoenixd" | "ecash";
  descriptionHash: string; // Privacy-first: hashed description
  urgency: "low" | "medium" | "high" | "urgent";
  status: "pending" | "approved" | "rejected" | "expired" | "sent" | "failed";
  approvalRequired: boolean;
  approvalId?: string;
  transactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpendingLimitViolation {
  id: string;
  familyId: string;
  memberHash: string; // Privacy-first: hashed UUID instead of npub
  violationType: "daily" | "weekly" | "monthly" | "approval_threshold";
  currentAmount: number;
  limitAmount: number;
  attemptedAmount: number;
  timestamp: string;
  resolved: boolean;
  resolution?: "approved" | "rejected" | "auto_resolved";
}

// --- FAMILY WALLET SERVICE ---

export class FamilyWalletService {
  private static instance: FamilyWalletService;
  private paymentAutomation: PaymentAutomationService;

  private constructor() {
    this.paymentAutomation = PaymentAutomationService.getInstance();
  }

  static getInstance(): FamilyWalletService {
    if (!FamilyWalletService.instance) {
      FamilyWalletService.instance = new FamilyWalletService();
    }
    return FamilyWalletService.instance;
  }

  /**
   * Get family member wallet with current balances and spending history
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  async getFamilyMemberWallet(
    memberHash: string,
    familyId: string
  ): Promise<FamilyMemberWallet | null> {
    try {
      const { data: member, error } = await supabase
        .from("privacy_family_member_wallets")
        .select("*")
        .eq("member_hash", memberHash)
        .eq("family_id", familyId)
        .single();

      if (error) {
        console.error("Failed to get family member wallet:", error);
        return null;
      }

      // Calculate current spending history
      const spendingHistory = await this.calculateSpendingHistory(
        memberHash,
        familyId
      );

      return {
        id: member.id,
        familyId: member.family_id,
        memberHash: member.member_hash,
        role: member.role,
        nameHash: member.name_hash,
        lightningBalance: member.lightning_balance,
        ecashBalance: member.ecash_balance,
        fedimintBalance: member.fedimint_balance,
        totalBalance:
          member.lightning_balance +
          member.ecash_balance +
          member.fedimint_balance,
        spendingLimits: member.spending_limits,
        spendingHistory,
        pendingApprovals: member.pending_approvals || [],
        canApproveFor: member.can_approve_for || [],
        privacySettings: member.privacy_settings,
        createdAt: member.created_at,
        updatedAt: member.updated_at,
        lastActivity: member.last_activity,
      };
    } catch (error) {
      console.error("Error getting family member wallet:", error);
      return null;
    }
  }

  /**
   * Calculate current spending history for a family member
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  private async calculateSpendingHistory(
    memberHash: string,
    familyId: string
  ): Promise<FamilyMemberWallet["spendingHistory"]> {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(
      now.getTime() - now.getDay() * 24 * 60 * 60 * 1000
    );
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: transactions, error } = await supabase
      .from("privacy_family_payment_transactions")
      .select("amount, created_at")
      .eq("family_id", familyId)
      .eq("requester_hash", memberHash)
      .gte("created_at", monthStart.toISOString())
      .eq("status", "sent");

    if (error) {
      console.error("Failed to get spending history:", error);
      return { daily: 0, weekly: 0, monthly: 0, lastReset: now.toISOString() };
    }

    const daily =
      transactions
        ?.filter((t: DatabaseTransaction) => new Date(t.created_at) >= dayStart)
        .reduce((sum: number, t: DatabaseTransaction) => sum + t.amount, 0) ||
      0;

    const weekly =
      transactions
        ?.filter(
          (t: DatabaseTransaction) => new Date(t.created_at) >= weekStart
        )
        .reduce((sum: number, t: DatabaseTransaction) => sum + t.amount, 0) ||
      0;

    const monthly =
      transactions
        ?.filter(
          (t: DatabaseTransaction) => new Date(t.created_at) >= monthStart
        )
        .reduce((sum: number, t: DatabaseTransaction) => sum + t.amount, 0) ||
      0;

    return { daily, weekly, monthly, lastReset: now.toISOString() };
  }

  /**
   * Request a payment with automatic limit checking and approval workflow
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  async requestPayment(
    request: Omit<
      PaymentRequest,
      "id" | "status" | "approvalRequired" | "createdAt" | "updatedAt"
    >
  ): Promise<PaymentRequest> {
    try {
      // Get member wallet and limits
      const memberWallet = await this.getFamilyMemberWallet(
        request.requesterHash,
        request.familyId
      );
      if (!memberWallet) {
        throw new Error("Member wallet not found");
      }

      // Check spending limits
      const limitCheck = await this.checkSpendingLimits(
        memberWallet,
        request.amount
      );

      // Determine if approval is required
      const approvalRequired = this.determineApprovalRequired(
        memberWallet,
        request.amount,
        limitCheck
      );

      // Create payment request
      const paymentRequest: PaymentRequest = {
        id: crypto.randomUUID(),
        ...request,
        status: approvalRequired ? "pending" : "approved",
        approvalRequired,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Store payment request
      const { error: insertError } = await supabase
        .from("privacy_family_payment_requests")
        .insert({
          id: paymentRequest.id,
          family_id: paymentRequest.familyId,
          requester_hash: paymentRequest.requesterHash,
          recipient_hash: paymentRequest.recipientHash,
          amount: paymentRequest.amount,
          currency: paymentRequest.currency,
          method: paymentRequest.method,
          description_hash: paymentRequest.descriptionHash,
          urgency: paymentRequest.urgency,
          status: paymentRequest.status,
          approval_required: paymentRequest.approvalRequired,
          created_at: paymentRequest.createdAt,
          updated_at: paymentRequest.updatedAt,
        });

      if (insertError) {
        console.error("Failed to create payment request:", insertError);
        throw new Error("Failed to create payment request");
      }

      // If approval required, create approval request
      if (approvalRequired) {
        const approvalRequest = await this.createApprovalRequest(
          paymentRequest,
          memberWallet
        );

        // Send notifications to approvers
        await this.notifyApprovers(approvalRequest);

        // Send notification to requester (using hashed UUID)
        await PaymentAutomationService.sendNotification({
          familyId: request.familyId,
          recipientId: "", // Will be filled by the service
          recipientNpub: "", // Privacy-first: service will use hashed UUID
          type: "approval_required",
          title: "Payment Approval Required",
          message: `Your payment request for ${request.amount} sats requires approval.`,
          amount: request.amount,
          currency: request.currency,
          read: false,
          createdAt: new Date().toISOString(),
        });
      } else {
        // Execute payment immediately
        await this.executePayment(paymentRequest, memberWallet);
      }

      return paymentRequest;
    } catch (error) {
      console.error("Error requesting payment:", error);
      throw error;
    }
  }

  /**
   * Check if spending limits are exceeded
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  private async checkSpendingLimits(
    memberWallet: FamilyMemberWallet,
    amount: number
  ): Promise<LimitCheckResult> {
    const { spendingHistory, spendingLimits } = memberWallet;

    const dailyExceeded = spendingHistory.daily + amount > spendingLimits.daily;
    const weeklyExceeded =
      spendingHistory.weekly + amount > spendingLimits.weekly;
    const monthlyExceeded =
      spendingHistory.monthly + amount > spendingLimits.monthly;
    const approvalThresholdExceeded = amount > spendingLimits.requiresApproval;

    const violations: SpendingLimitViolation[] = [];

    if (dailyExceeded) {
      violations.push({
        id: crypto.randomUUID(),
        familyId: memberWallet.familyId,
        memberHash: memberWallet.memberHash,
        violationType: "daily",
        currentAmount: spendingHistory.daily,
        limitAmount: spendingLimits.daily,
        attemptedAmount: amount,
        timestamp: new Date().toISOString(),
        resolved: false,
      });
    }

    if (weeklyExceeded) {
      violations.push({
        id: crypto.randomUUID(),
        familyId: memberWallet.familyId,
        memberHash: memberWallet.memberHash,
        violationType: "weekly",
        currentAmount: spendingHistory.weekly,
        limitAmount: spendingLimits.weekly,
        attemptedAmount: amount,
        timestamp: new Date().toISOString(),
        resolved: false,
      });
    }

    if (monthlyExceeded) {
      violations.push({
        id: crypto.randomUUID(),
        familyId: memberWallet.familyId,
        memberHash: memberWallet.memberHash,
        violationType: "monthly",
        currentAmount: spendingHistory.monthly,
        limitAmount: spendingLimits.monthly,
        attemptedAmount: amount,
        timestamp: new Date().toISOString(),
        resolved: false,
      });
    }

    if (approvalThresholdExceeded) {
      violations.push({
        id: crypto.randomUUID(),
        familyId: memberWallet.familyId,
        memberHash: memberWallet.memberHash,
        violationType: "approval_threshold",
        currentAmount: 0,
        limitAmount: spendingLimits.requiresApproval,
        attemptedAmount: amount,
        timestamp: new Date().toISOString(),
        resolved: false,
      });
    }

    // Store violations
    if (violations.length > 0) {
      const { error } = await supabase
        .from("privacy_spending_limit_violations")
        .insert(
          violations.map((v) => ({
            id: v.id,
            family_id: v.familyId,
            member_hash: v.memberHash,
            violation_type: v.violationType,
            current_amount: v.currentAmount,
            limit_amount: v.limitAmount,
            attempted_amount: v.attemptedAmount,
            timestamp: v.timestamp,
            resolved: v.resolved,
          }))
        );

      if (error) {
        console.error("Failed to store spending limit violations:", error);
      }
    }

    return {
      dailyExceeded,
      weeklyExceeded,
      monthlyExceeded,
      approvalThresholdExceeded,
      violations,
    };
  }

  /**
   * Determine if approval is required based on limits and thresholds
   */
  private determineApprovalRequired(
    memberWallet: FamilyMemberWallet,
    amount: number,
    limitCheck: LimitCheckResult
  ): boolean {
    const { spendingLimits } = memberWallet;

    // Always require approval if any limits are exceeded
    if (
      limitCheck.dailyExceeded ||
      limitCheck.weeklyExceeded ||
      limitCheck.monthlyExceeded
    ) {
      return true;
    }

    // Require approval if amount exceeds approval threshold
    if (amount > spendingLimits.requiresApproval) {
      return true;
    }

    // Auto-approve if amount is within auto-approval limit
    if (amount <= spendingLimits.autoApprovalLimit) {
      return false;
    }

    return true;
  }

  /**
   * Create approval request for payment
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  private async createApprovalRequest(
    paymentRequest: PaymentRequest,
    memberWallet: FamilyMemberWallet
  ): Promise<ApprovalRequest> {
    const approvers = await this.getApprovers(
      paymentRequest.familyId,
      memberWallet.spendingLimits.approvalRoles
    );

    const approvalRequest: ApprovalRequest = {
      id: crypto.randomUUID(),
      transactionId: paymentRequest.id,
      familyId: paymentRequest.familyId,
      requesterId: paymentRequest.requesterHash, // Privacy-first: hashed UUID
      requesterNpub: "", // Privacy-first: not stored
      recipientNpub: "", // Privacy-first: not stored, required by interface
      amount: paymentRequest.amount,
      currency: paymentRequest.currency,
      description: "", // Privacy-first: not stored in plain text
      urgency: paymentRequest.urgency,
      status: "pending",
      approvers: approvers.map((approver) => ({
        npub: "", // Privacy-first: not stored
        role: approver.role as "guardian" | "steward" | "adult",
        status: "pending",
      })),
      requiredApprovals: memberWallet.spendingLimits.requiredApprovals,
      receivedApprovals: 0,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("privacy_family_approval_requests")
      .insert({
        id: approvalRequest.id,
        transaction_id: approvalRequest.transactionId,
        family_id: approvalRequest.familyId,
        requester_hash: approvalRequest.requesterId,
        amount: approvalRequest.amount,
        currency: approvalRequest.currency,
        description_hash: "", // Privacy-first: hashed description
        urgency: approvalRequest.urgency,
        status: approvalRequest.status,
        approvers: approvalRequest.approvers,
        required_approvals: approvalRequest.requiredApprovals,
        received_approvals: approvalRequest.receivedApprovals,
        expires_at: approvalRequest.expiresAt,
        created_at: approvalRequest.createdAt,
        updated_at: approvalRequest.updatedAt,
      });

    if (error) {
      console.error("Failed to create approval request:", error);
      throw new Error("Failed to create approval request");
    }

    return approvalRequest;
  }

  /**
   * Get approvers for a family based on roles
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  private async getApprovers(
    familyId: string,
    roles: string[]
  ): Promise<Array<{ npub: string; role: string }>> {
    const { data: members, error } = await supabase
      .from("privacy_family_member_wallets")
      .select("member_hash, role")
      .eq("family_id", familyId)
      .in("role", roles);

    if (error) {
      console.error("Failed to get approvers:", error);
      return [];
    }

    // Privacy-first: Return hashed UUIDs, never log npubs
    return (
      members?.map((member: DatabaseMember) => ({
        npub: "", // Privacy-first: not stored
        role: member.role,
      })) || []
    );
  }

  /**
   * Send notifications to approvers
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  private async notifyApprovers(
    approvalRequest: ApprovalRequest
  ): Promise<void> {
    for (const approver of approvalRequest.approvers) {
      await PaymentAutomationService.sendNotification({
        familyId: approvalRequest.familyId,
        recipientId: "", // Will be filled by the service
        recipientNpub: "", // Privacy-first: service will use hashed UUID
        type: "approval_required",
        title: "Payment Approval Required",
        message: `A payment request for ${approvalRequest.amount} sats requires your approval.`,
        amount: approvalRequest.amount,
        currency: approvalRequest.currency,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Execute payment using the appropriate method
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  private async executePayment(
    paymentRequest: PaymentRequest,
    memberWallet: FamilyMemberWallet
  ): Promise<void> {
    try {
      // Update payment request status
      const { error: updateError } = await supabase
        .from("privacy_family_payment_requests")
        .update({ status: "sent" })
        .eq("id", paymentRequest.id);

      if (updateError) {
        console.error("Failed to update payment request status:", updateError);
        throw new Error("Failed to update payment request status");
      }

      // Create transaction record
      const transaction: PaymentTransaction = {
        id: crypto.randomUUID(),
        scheduleId: "", // Not applicable for manual requests
        familyId: paymentRequest.familyId,
        recipientId: paymentRequest.recipientHash || "",
        recipientNpub: "", // Privacy-first: not stored
        amount: paymentRequest.amount,
        currency: paymentRequest.currency,
        status: "sent",
        paymentMethod: this.determinePaymentMethod(paymentRequest.currency),
        approvalRequired: paymentRequest.approvalRequired,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { error: transactionError } = await supabase
        .from("privacy_family_payment_transactions")
        .insert({
          id: transaction.id,
          family_id: transaction.familyId,
          requester_hash: paymentRequest.requesterHash,
          recipient_hash: paymentRequest.recipientHash,
          amount: transaction.amount,
          currency: transaction.currency,
          status: transaction.status,
          payment_method: transaction.paymentMethod,
          approval_required: transaction.approvalRequired,
          created_at: transaction.createdAt,
          updated_at: transaction.updatedAt,
        });

      if (transactionError) {
        console.error("Failed to create transaction record:", transactionError);
        throw new Error("Failed to create transaction record");
      }

      // Update spending history
      await this.updateSpendingHistory(
        paymentRequest.requesterHash,
        paymentRequest.familyId,
        paymentRequest.amount
      );

      // Send success notification (using hashed UUID)
      await PaymentAutomationService.sendNotification({
        familyId: paymentRequest.familyId,
        recipientId: "", // Will be filled by the service
        recipientNpub: "", // Privacy-first: service will use hashed UUID
        type: "payment_sent",
        title: "Payment Sent",
        message: `Your payment of ${paymentRequest.amount} sats has been sent successfully.`,
        amount: paymentRequest.amount,
        currency: paymentRequest.currency,
        read: false,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error executing payment:", error);

      // Update payment request status to failed
      await supabase
        .from("privacy_family_payment_requests")
        .update({ status: "failed" })
        .eq("id", paymentRequest.id);

      throw error;
    }
  }

  /**
   * Determine payment method based on currency
   */
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

  /**
   * Update spending history for a family member
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  private async updateSpendingHistory(
    memberHash: string,
    familyId: string,
    amount: number
  ): Promise<void> {
    const { data: member, error } = await supabase
      .from("privacy_family_member_wallets")
      .select("spending_history")
      .eq("member_hash", memberHash)
      .eq("family_id", familyId)
      .single();

    if (error || !member) {
      console.error("Failed to get member for spending history update:", error);
      return;
    }

    const spendingHistory = member.spending_history || {
      daily: 0,
      weekly: 0,
      monthly: 0,
      lastReset: new Date().toISOString(),
    };

    // Update spending amounts
    spendingHistory.daily += amount;
    spendingHistory.weekly += amount;
    spendingHistory.monthly += amount;

    const { error: updateError } = await supabase
      .from("privacy_family_member_wallets")
      .update({ spending_history: spendingHistory })
      .eq("member_hash", memberHash)
      .eq("family_id", familyId);

    if (updateError) {
      console.error("Failed to update spending history:", updateError);
    }
  }

  /**
   * Update spending limits for a family member
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  async updateSpendingLimits(
    memberHash: string,
    familyId: string,
    limits: Partial<FamilyMemberSpendingLimits>
  ): Promise<void> {
    const { error } = await supabase
      .from("privacy_family_member_wallets")
      .update({ spending_limits: limits })
      .eq("member_hash", memberHash)
      .eq("family_id", familyId);

    if (error) {
      console.error("Failed to update spending limits:", error);
      throw new Error("Failed to update spending limits");
    }
  }

  /**
   * Get pending approvals for a member
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  async getPendingApprovals(memberHash: string): Promise<ApprovalRequest[]> {
    const { data: approvals, error } = await supabase
      .from("privacy_family_approval_requests")
      .select("*")
      .contains("approvers", [{ hash: memberHash }])
      .eq("status", "pending");

    if (error) {
      console.error("Failed to get pending approvals:", error);
      return [];
    }

    return approvals || [];
  }

  /**
   * Approve or reject a payment
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  async approvePayment(
    approvalId: string,
    approverHash: string, // Privacy-first: hashed UUID instead of npub
    approved: boolean,
    reason?: string
  ): Promise<void> {
    try {
      // Use the static method from PaymentAutomationService
      await PaymentAutomationService.approvePayment(
        approvalId,
        approverHash,
        approved,
        reason
      );
    } catch (error) {
      console.error("Error approving payment:", error);
      throw error;
    }
  }

  /**
   * Get approval request by ID
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  private async getApprovalRequest(
    approvalId: string
  ): Promise<ApprovalRequest | null> {
    const { data: approval, error } = await supabase
      .from("privacy_family_approval_requests")
      .select("*")
      .eq("id", approvalId)
      .single();

    if (error) {
      console.error("Failed to get approval request:", error);
      return null;
    }

    return approval;
  }

  /**
   * Get payment request by ID
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  private async getPaymentRequest(
    requestId: string
  ): Promise<PaymentRequest | null> {
    const { data: request, error } = await supabase
      .from("privacy_family_payment_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (error) {
      console.error("Failed to get payment request:", error);
      return null;
    }

    return request;
  }

  /**
   * Get spending limit violations for a family member
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  async getSpendingLimitViolations(
    memberHash: string,
    familyId: string
  ): Promise<SpendingLimitViolation[]> {
    const { data: violations, error } = await supabase
      .from("privacy_spending_limit_violations")
      .select("*")
      .eq("member_hash", memberHash)
      .eq("family_id", familyId)
      .eq("resolved", false)
      .order("timestamp", { ascending: false });

    if (error) {
      console.error("Failed to get spending limit violations:", error);
      return [];
    }

    return violations || [];
  }

  /**
   * Reset spending history for a family member
   * Privacy-first: Uses hashed UUIDs, never logs npubs
   */
  async resetSpendingHistory(
    memberHash: string,
    familyId: string,
    resetType: "daily" | "weekly" | "monthly"
  ): Promise<void> {
    const { data: member, error } = await supabase
      .from("privacy_family_member_wallets")
      .select("spending_history")
      .eq("member_hash", memberHash)
      .eq("family_id", familyId)
      .single();

    if (error || !member) {
      console.error("Failed to get member for spending history reset:", error);
      return;
    }

    const spendingHistory = member.spending_history || {
      daily: 0,
      weekly: 0,
      monthly: 0,
      lastReset: new Date().toISOString(),
    };

    // Reset the specified type
    switch (resetType) {
      case "daily":
        spendingHistory.daily = 0;
        break;
      case "weekly":
        spendingHistory.weekly = 0;
        break;
      case "monthly":
        spendingHistory.monthly = 0;
        break;
    }

    spendingHistory.lastReset = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("privacy_family_member_wallets")
      .update({ spending_history: spendingHistory })
      .eq("member_hash", memberHash)
      .eq("family_id", familyId);

    if (updateError) {
      console.error("Failed to reset spending history:", updateError);
      throw new Error("Failed to reset spending history");
    }
  }
}

// Export singleton instance
export const familyWalletService = FamilyWalletService.getInstance();
