/**
 * @fileoverview Enhanced Family Wallet System with Spending Limits & Approval Workflows
 * @description Enforces per-user spending limits and integrates with payment automation for approval workflows
 * @compliance Master Context - Bitcoin-only, privacy-first, sovereign family banking
 * @integration Payment Automation, PhoenixD, Lightning, eCash, Fedimint
 */

import { createClient } from '@supabase/supabase-js';
import { PaymentAutomationService, ApprovalRequest, PaymentTransaction } from './payment-automation';

// Browser-compatible Supabase configuration
const getSupabaseConfig = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rhfqfftkizyengcuhuvq.supabase.co';
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoZnFmZnRraXp5ZW5nY3VodXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3NjA1ODQsImV4cCI6MjA2NTMzNjU4NH0.T9UoL9ozgIzpqDBrY9qefq4V9bCbbenYkO5bTRrdhQE';
  
  return { supabaseUrl, supabaseKey };
};

const config = getSupabaseConfig();
const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// --- ENHANCED FAMILY MEMBER INTERFACE ---

export interface FamilyMemberSpendingLimits {
  daily: number; // in satoshis
  weekly: number; // in satoshis
  monthly: number; // in satoshis
  requiresApproval: number; // amount that triggers approval requirement
  autoApprovalLimit: number; // amount that can be auto-approved
  approvalRoles: ('guardian' | 'steward' | 'adult')[]; // who can approve
  requiredApprovals: number; // number of approvals needed
}

export interface FamilyMemberWallet {
  id: string;
  familyId: string;
  memberId: string;
  memberNpub: string;
  role: 'guardian' | 'steward' | 'adult' | 'offspring';
  name: string;
  
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
  canApproveFor: string[]; // member IDs this member can approve for
  
  // Privacy Settings
  privacySettings: {
    enableLNProxy: boolean;
    enableFedimintPrivacy: boolean;
    defaultRouting: 'lightning' | 'ecash' | 'fedimint' | 'auto';
  };
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  lastActivity: string;
}

export interface PaymentRequest {
  id: string;
  familyId: string;
  requesterId: string;
  requesterNpub: string;
  recipientId?: string;
  recipientNpub: string;
  amount: number; // in satoshis
  currency: 'sats' | 'ecash' | 'fedimint';
  method: 'voltage' | 'lnbits' | 'phoenixd' | 'ecash';
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'sent' | 'failed';
  approvalRequired: boolean;
  approvalId?: string;
  transactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpendingLimitViolation {
  id: string;
  familyId: string;
  memberId: string;
  memberNpub: string;
  violationType: 'daily' | 'weekly' | 'monthly' | 'approval_threshold';
  currentAmount: number;
  limitAmount: number;
  attemptedAmount: number;
  timestamp: string;
  resolved: boolean;
  resolution?: 'approved' | 'rejected' | 'auto_resolved';
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
   */
  async getFamilyMemberWallet(memberId: string, familyId: string): Promise<FamilyMemberWallet | null> {
    try {
      const { data: member, error } = await supabase
        .from('family_member_wallets')
        .select('*')
        .eq('member_id', memberId)
        .eq('family_id', familyId)
        .single();

      if (error) {
        console.error('Failed to get family member wallet:', error);
        return null;
      }

      // Calculate current spending history
      const spendingHistory = await this.calculateSpendingHistory(memberId, familyId);
      
      return {
        ...member,
        spendingHistory,
        totalBalance: member.lightning_balance + member.ecash_balance + member.fedimint_balance
      };
    } catch (error) {
      console.error('Error getting family member wallet:', error);
      return null;
    }
  }

  /**
   * Calculate current spending history for a family member
   */
  private async calculateSpendingHistory(memberId: string, familyId: string): Promise<FamilyMemberWallet['spendingHistory']> {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - (now.getDay() * 24 * 60 * 60 * 1000));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: transactions, error } = await supabase
      .from('family_payment_transactions')
      .select('amount, created_at')
      .eq('family_id', familyId)
      .eq('requester_id', memberId)
      .gte('created_at', monthStart.toISOString())
      .eq('status', 'sent');

    if (error) {
      console.error('Failed to get spending history:', error);
      return { daily: 0, weekly: 0, monthly: 0, lastReset: now.toISOString() };
    }

    const daily = transactions
      ?.filter(t => new Date(t.created_at) >= dayStart)
      .reduce((sum, t) => sum + t.amount, 0) || 0;

    const weekly = transactions
      ?.filter(t => new Date(t.created_at) >= weekStart)
      .reduce((sum, t) => sum + t.amount, 0) || 0;

    const monthly = transactions
      ?.filter(t => new Date(t.created_at) >= monthStart)
      .reduce((sum, t) => sum + t.amount, 0) || 0;

    return { daily, weekly, monthly, lastReset: now.toISOString() };
  }

  /**
   * Request a payment with automatic limit checking and approval workflow
   */
  async requestPayment(request: Omit<PaymentRequest, 'id' | 'status' | 'approvalRequired' | 'createdAt' | 'updatedAt'>): Promise<PaymentRequest> {
    try {
      // Get member wallet and limits
      const memberWallet = await this.getFamilyMemberWallet(request.requesterId, request.familyId);
      if (!memberWallet) {
        throw new Error('Member wallet not found');
      }

      // Check spending limits
      const limitCheck = await this.checkSpendingLimits(memberWallet, request.amount);
      
      // Determine if approval is required
      const approvalRequired = this.determineApprovalRequired(memberWallet, request.amount, limitCheck);

      // Create payment request
      const paymentRequest: PaymentRequest = {
        ...request,
        id: crypto.randomUUID(),
        status: approvalRequired ? 'pending' : 'approved',
        approvalRequired,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save to database
      const { data, error } = await supabase
        .from('family_payment_requests')
        .insert([paymentRequest])
        .select()
        .single();

      if (error) {
        throw new Error('Failed to create payment request');
      }

      // If approval is required, create approval request
      if (approvalRequired) {
        const approvalRequest = await this.createApprovalRequest(paymentRequest, memberWallet);
        paymentRequest.approvalId = approvalRequest.id;
        
        // Update payment request with approval ID
        await supabase
          .from('family_payment_requests')
          .update({ approval_id: approvalRequest.id })
          .eq('id', paymentRequest.id);
      } else {
        // Auto-approve and execute payment
        await this.executePayment(paymentRequest, memberWallet);
      }

      return paymentRequest;
    } catch (error) {
      console.error('Error requesting payment:', error);
      throw error;
    }
  }

  /**
   * Check if payment amount violates spending limits
   */
  private async checkSpendingLimits(memberWallet: FamilyMemberWallet, amount: number): Promise<{
    dailyExceeded: boolean;
    weeklyExceeded: boolean;
    monthlyExceeded: boolean;
    approvalThresholdExceeded: boolean;
    violations: SpendingLimitViolation[];
  }> {
    const { spendingLimits, spendingHistory } = memberWallet;
    
    const dailyExceeded = spendingHistory.daily + amount > spendingLimits.daily;
    const weeklyExceeded = spendingHistory.weekly + amount > spendingLimits.weekly;
    const monthlyExceeded = spendingHistory.monthly + amount > spendingLimits.monthly;
    const approvalThresholdExceeded = amount > spendingLimits.requiresApproval;

    const violations: SpendingLimitViolation[] = [];

    if (dailyExceeded) {
      violations.push({
        id: crypto.randomUUID(),
        familyId: memberWallet.familyId,
        memberId: memberWallet.memberId,
        memberNpub: memberWallet.memberNpub,
        violationType: 'daily',
        currentAmount: spendingHistory.daily,
        limitAmount: spendingLimits.daily,
        attemptedAmount: amount,
        timestamp: new Date().toISOString(),
        resolved: false
      });
    }

    if (weeklyExceeded) {
      violations.push({
        id: crypto.randomUUID(),
        familyId: memberWallet.familyId,
        memberId: memberWallet.memberId,
        memberNpub: memberWallet.memberNpub,
        violationType: 'weekly',
        currentAmount: spendingHistory.weekly,
        limitAmount: spendingLimits.weekly,
        attemptedAmount: amount,
        timestamp: new Date().toISOString(),
        resolved: false
      });
    }

    if (monthlyExceeded) {
      violations.push({
        id: crypto.randomUUID(),
        familyId: memberWallet.familyId,
        memberId: memberWallet.memberId,
        memberNpub: memberWallet.memberNpub,
        violationType: 'monthly',
        currentAmount: spendingHistory.monthly,
        limitAmount: spendingLimits.monthly,
        attemptedAmount: amount,
        timestamp: new Date().toISOString(),
        resolved: false
      });
    }

    if (approvalThresholdExceeded) {
      violations.push({
        id: crypto.randomUUID(),
        familyId: memberWallet.familyId,
        memberId: memberWallet.memberId,
        memberNpub: memberWallet.memberNpub,
        violationType: 'approval_threshold',
        currentAmount: 0,
        limitAmount: spendingLimits.requiresApproval,
        attemptedAmount: amount,
        timestamp: new Date().toISOString(),
        resolved: false
      });
    }

    // Save violations to database
    if (violations.length > 0) {
      await supabase
        .from('spending_limit_violations')
        .insert(violations);
    }

    return {
      dailyExceeded,
      weeklyExceeded,
      monthlyExceeded,
      approvalThresholdExceeded,
      violations
    };
  }

  /**
   * Determine if approval is required for a payment
   */
  private determineApprovalRequired(memberWallet: FamilyMemberWallet, amount: number, limitCheck: any): boolean {
    const { spendingLimits } = memberWallet;
    
    // Always require approval if amount exceeds approval threshold
    if (amount > spendingLimits.requiresApproval) {
      return true;
    }

    // Require approval if any spending limit would be exceeded
    if (limitCheck.dailyExceeded || limitCheck.weeklyExceeded || limitCheck.monthlyExceeded) {
      return true;
    }

    // Auto-approve if amount is within auto-approval limit
    return amount > spendingLimits.autoApprovalLimit;
  }

  /**
   * Create approval request for payment
   */
  private async createApprovalRequest(paymentRequest: PaymentRequest, memberWallet: FamilyMemberWallet): Promise<ApprovalRequest> {
    const approvers = await this.getApprovers(memberWallet.familyId, memberWallet.spendingLimits.approvalRoles);
    
    const approvalRequest: ApprovalRequest = {
      id: crypto.randomUUID(),
      transactionId: paymentRequest.id,
      familyId: paymentRequest.familyId,
      requesterId: paymentRequest.requesterId,
      requesterNpub: paymentRequest.requesterNpub,
      amount: paymentRequest.amount,
      currency: paymentRequest.currency,
      description: paymentRequest.description,
      urgency: paymentRequest.urgency,
      status: 'pending',
      approvers: approvers.map(approver => ({
        npub: approver.npub,
        role: approver.role as 'adult' | 'guardian' | 'steward',
        status: 'pending'
      })),
      requiredApprovals: memberWallet.spendingLimits.requiredApprovals,
      receivedApprovals: 0,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save approval request
    const { error } = await supabase
      .from('family_approval_requests')
      .insert([approvalRequest]);

    if (error) {
      throw new Error('Failed to create approval request');
    }

    // Send notifications to approvers
    await this.notifyApprovers(approvalRequest);

    return approvalRequest;
  }

  /**
   * Get available approvers for a family
   */
  private async getApprovers(familyId: string, roles: string[]): Promise<Array<{ npub: string; role: string }>> {
    const { data: members, error } = await supabase
      .from('family_member_wallets')
      .select('member_npub, role')
      .eq('family_id', familyId)
      .in('role', roles);

    if (error) {
      console.error('Failed to get approvers:', error);
      return [];
    }

    return members?.map(member => ({
      npub: member.member_npub,
      role: member.role
    })) || [];
  }

  /**
   * Notify approvers about pending approval request
   */
  private async notifyApprovers(approvalRequest: ApprovalRequest): Promise<void> {
    for (const approver of approvalRequest.approvers) {
      await this.paymentAutomation.sendNotification({
        familyId: approvalRequest.familyId,
        recipientId: '', // Will be looked up by npub
        recipientNpub: approver.npub,
        type: 'approval_required',
        title: 'Payment Approval Required',
        message: `Payment request for ${approvalRequest.amount} ${approvalRequest.currency} requires your approval.`,
        amount: approvalRequest.amount,
        currency: approvalRequest.currency,
        read: false,
        createdAt: new Date().toISOString()
      });
    }
  }

  /**
   * Execute approved payment
   */
  private async executePayment(paymentRequest: PaymentRequest, memberWallet: FamilyMemberWallet): Promise<void> {
    try {
      // Create payment transaction
      const transaction: PaymentTransaction = {
        id: crypto.randomUUID(),
        scheduleId: '', // Not a scheduled payment
        familyId: paymentRequest.familyId,
        recipientId: paymentRequest.recipientId || '',
        recipientNpub: paymentRequest.recipientNpub,
        amount: paymentRequest.amount,
        currency: paymentRequest.currency,
        status: 'pending',
        paymentMethod: this.determinePaymentMethod(paymentRequest.currency),
        approvalRequired: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save transaction
      const { error: txError } = await supabase
        .from('family_payment_transactions')
        .insert([transaction]);

      if (txError) {
        throw new Error('Failed to create payment transaction');
      }

      // Update payment request with transaction ID
      await supabase
        .from('family_payment_requests')
        .update({ 
          transaction_id: transaction.id,
          status: 'sent',
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentRequest.id);

      // Execute payment via payment automation
      await this.paymentAutomation.executePayment(transaction);

      // Update member's spending history
      await this.updateSpendingHistory(memberWallet.memberId, paymentRequest.familyId, paymentRequest.amount);

    } catch (error) {
      console.error('Error executing payment:', error);
      
      // Update payment request status to failed
      await supabase
        .from('family_payment_requests')
        .update({ 
          status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentRequest.id);

      throw error;
    }
  }

  /**
   * Determine payment method based on currency
   */
  private determinePaymentMethod(currency: string): 'lightning' | 'ecash' | 'fedimint' {
    switch (currency) {
      case 'sats':
        return 'lightning';
      case 'ecash':
        return 'ecash';
      case 'fedimint':
        return 'fedimint';
      default:
        return 'lightning';
    }
  }

  /**
   * Update member's spending history after payment
   */
  private async updateSpendingHistory(memberId: string, familyId: string, amount: number): Promise<void> {
    const { data: member, error } = await supabase
      .from('family_member_wallets')
      .select('spending_history')
      .eq('member_id', memberId)
      .eq('family_id', familyId)
      .single();

    if (error || !member) {
      console.error('Failed to get member for spending history update:', error);
      return;
    }

    const spendingHistory = member.spending_history || { daily: 0, weekly: 0, monthly: 0 };
    spendingHistory.daily += amount;
    spendingHistory.weekly += amount;
    spendingHistory.monthly += amount;

    await supabase
      .from('family_member_wallets')
      .update({ 
        spending_history: spendingHistory,
        updated_at: new Date().toISOString()
      })
      .eq('member_id', memberId)
      .eq('family_id', familyId);
  }

  /**
   * Update spending limits for a family member
   */
  async updateSpendingLimits(
    memberId: string, 
    familyId: string, 
    limits: Partial<FamilyMemberSpendingLimits>
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('family_member_wallets')
        .update({ 
          spending_limits: limits,
          updated_at: new Date().toISOString()
        })
        .eq('member_id', memberId)
        .eq('family_id', familyId);

      if (error) {
        throw new Error('Failed to update spending limits');
      }
    } catch (error) {
      console.error('Error updating spending limits:', error);
      throw error;
    }
  }

  /**
   * Get pending approval requests for a family member
   */
  async getPendingApprovals(memberNpub: string): Promise<ApprovalRequest[]> {
    try {
      const { data, error } = await supabase
        .from('family_approval_requests')
        .select('*')
        .contains('approvers', [{ npub: memberNpub }])
        .eq('status', 'pending');

      if (error) {
        throw new Error('Failed to get pending approvals');
      }

      return data || [];
    } catch (error) {
      console.error('Error getting pending approvals:', error);
      throw error;
    }
  }

  /**
   * Approve or reject a payment request
   */
  async approvePayment(
    approvalId: string, 
    approverNpub: string, 
    approved: boolean, 
    reason?: string
  ): Promise<void> {
    try {
      // Use payment automation service for approval
      await this.paymentAutomation.approvePayment(approvalId, approverNpub, approved, reason);

      // If approved, check if enough approvals received to execute payment
      const approvalRequest = await this.getApprovalRequest(approvalId);
      if (approvalRequest && approved) {
        const approvedCount = approvalRequest.approvers.filter(a => a.status === 'approved').length;
        
        if (approvedCount >= approvalRequest.requiredApprovals) {
          // Execute the payment
          const paymentRequest = await this.getPaymentRequest(approvalRequest.transactionId);
          if (paymentRequest) {
            const memberWallet = await this.getFamilyMemberWallet(paymentRequest.requesterId, paymentRequest.familyId);
            if (memberWallet) {
              await this.executePayment(paymentRequest, memberWallet);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error approving payment:', error);
      throw error;
    }
  }

  /**
   * Get approval request by ID
   */
  private async getApprovalRequest(approvalId: string): Promise<ApprovalRequest | null> {
    try {
      const { data, error } = await supabase
        .from('family_approval_requests')
        .select('*')
        .eq('id', approvalId)
        .single();

      if (error) {
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error getting approval request:', error);
      return null;
    }
  }

  /**
   * Get payment request by ID
   */
  private async getPaymentRequest(requestId: string): Promise<PaymentRequest | null> {
    try {
      const { data, error } = await supabase
        .from('family_payment_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (error) {
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error getting payment request:', error);
      return null;
    }
  }

  /**
   * Get spending limit violations for a family member
   */
  async getSpendingLimitViolations(memberId: string, familyId: string): Promise<SpendingLimitViolation[]> {
    try {
      const { data, error } = await supabase
        .from('spending_limit_violations')
        .select('*')
        .eq('member_id', memberId)
        .eq('family_id', familyId)
        .eq('resolved', false)
        .order('timestamp', { ascending: false });

      if (error) {
        throw new Error('Failed to get spending limit violations');
      }

      return data || [];
    } catch (error) {
      console.error('Error getting spending limit violations:', error);
      throw error;
    }
  }

  /**
   * Reset spending history (called daily/weekly/monthly)
   */
  async resetSpendingHistory(memberId: string, familyId: string, resetType: 'daily' | 'weekly' | 'monthly'): Promise<void> {
    try {
      const { data: member, error } = await supabase
        .from('family_member_wallets')
        .select('spending_history')
        .eq('member_id', memberId)
        .eq('family_id', familyId)
        .single();

      if (error || !member) {
        throw new Error('Member not found');
      }

      const spendingHistory = member.spending_history || { daily: 0, weekly: 0, monthly: 0 };
      
      switch (resetType) {
        case 'daily':
          spendingHistory.daily = 0;
          break;
        case 'weekly':
          spendingHistory.weekly = 0;
          break;
        case 'monthly':
          spendingHistory.monthly = 0;
          break;
      }

      spendingHistory.lastReset = new Date().toISOString();

      await supabase
        .from('family_member_wallets')
        .update({ 
          spending_history: spendingHistory,
          updated_at: new Date().toISOString()
        })
        .eq('member_id', memberId)
        .eq('family_id', familyId);

    } catch (error) {
      console.error('Error resetting spending history:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const familyWalletService = FamilyWalletService.getInstance(); 