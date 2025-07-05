/**
 * @fileoverview Automated Family Treasury & Payments Management
 * @description Schedules recurring Bitcoin payments, manages PhoenixD liquidity, and handles approval workflows
 * @compliance Master Context - Bitcoin-only, privacy-first, sovereign family banking
 * @integration PhoenixD, Lightning, eCash, Fedimint
 */

import { PhoenixdClient } from './phoenixd-client';
import { EnhancedPhoenixdManager } from './enhanced-phoenixd-manager';
import { createClient } from '@supabase/supabase-js';

// Browser-compatible Supabase configuration
const getSupabaseConfig = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rhfqfftkizyengcuhuvq.supabase.co';
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoZnFmZnRraXp5ZW5nY3VodXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3NjA1ODQsImV4cCI6MjA2NTMzNjU4NH0.T9UoL9ozgIzpqDBrY9qefq4V9bCbbenYkO5bTRrdhQE';
  
  return { supabaseUrl, supabaseKey };
};

const config = getSupabaseConfig();
const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// --- TYPE ENHANCEMENTS FOR CASCADE/SPLIT PAYMENTS ---

export interface PaymentCascadeNode {
  recipientId: string;
  recipientNpub: string;
  amount: number;
  currency: 'sats' | 'ecash';
  method: 'voltage' | 'lnbits' | 'phoenixd' | 'ecash';
  children?: PaymentCascadeNode[];
}

export interface PaymentSchedule {
  id: string;
  familyId: string;
  recipientId: string;
  recipientNpub: string;
  amount: number; // in satoshis
  currency: 'sats' | 'ecash' | 'fedimint';
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  customInterval?: number; // days for custom frequency
  startDate: string;
  endDate?: string;
  nextPaymentDate: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
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
}

export interface PaymentTransaction {
  id: string;
  scheduleId: string;
  familyId: string;
  recipientId: string;
  recipientNpub: string;
  amount: number;
  currency: 'sats' | 'ecash' | 'fedimint';
  status: 'pending' | 'approved' | 'rejected' | 'sent' | 'failed';
  paymentMethod: 'lightning' | 'ecash' | 'fedimint';
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
  amount: number;
  currency: 'sats' | 'ecash' | 'fedimint';
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  approvers: {
    npub: string;
    role: 'guardian' | 'steward' | 'adult';
    status: 'pending' | 'approved' | 'rejected';
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
  type: 'payment_sent' | 'payment_received' | 'limit_exceeded' | 'approval_required' | 'approval_granted' | 'approval_rejected';
  title: string;
  message: string;
  amount?: number;
  currency?: 'sats' | 'ecash' | 'fedimint';
  read: boolean;
  createdAt: string;
}

// --- VOLTAGE & LNBITS INTEGRATION HELPERS ---

async function sendViaVoltage(invoice: string, familyId: string) {
  const response = await fetch('/api/voltage/pay-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice, familyId })
  });
  if (!response.ok) throw new Error('Voltage payment failed');
  return response.json();
}

async function sendViaLNbits(invoice: string, walletId: string) {
  const response = await fetch('/api/lnbits/pay-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice, walletId })
  });
  if (!response.ok) throw new Error('LNbits payment failed');
  return response.json();
}

// --- CASCADE EXECUTION LOGIC ---

export class PaymentAutomationService {
  private static instance: PaymentAutomationService;
  private notificationCallbacks: Map<string, (notification: PaymentNotification) => void> = new Map();
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
        console.warn('PhoenixD connection failed, some features may be limited');
        return;
      }

      // Get node status
      const nodeStatus = await this.phoenixDClient.getFamilyNodeStatus();
      console.log('🔥 PhoenixD initialized successfully:', {
        nodeId: nodeStatus.nodeInfo.nodeId,
        balance: nodeStatus.balance.balanceSat,
        activeChannels: nodeStatus.activeChannels,
        totalLiquidity: nodeStatus.totalLiquidity
      });
      
      // Set up liquidity monitoring
      this.monitorPhoenixDLiquidity();
    } catch (error) {
      console.error('Failed to initialize PhoenixD:', error);
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
  static async createPaymentSchedule(schedule: Omit<PaymentSchedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<PaymentSchedule> {
    try {
      const { data, error } = await supabase
        .from('family_payment_schedules')
        .insert({
          ...schedule,
          nextPaymentDate: this.calculateNextPaymentDate(schedule.startDate, schedule.frequency, schedule.customInterval)
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
        type: 'payment_sent',
        title: 'New Payment Schedule Created',
        message: `A new ${schedule.frequency} payment of ${schedule.amount} ${schedule.currency} has been scheduled.`,
        amount: schedule.amount,
        currency: schedule.currency,
        read: false,
        createdAt: new Date().toISOString()
      });

      return data;
    } catch (error) {
      console.error('Error creating payment schedule:', error);
      throw error;
    }
  }

  /**
   * Process all due payments
   */
  private async processDuePayments() {
    try {
      const now = new Date().toISOString();
      
      // Get all active payment schedules that are due
      const { data: dueSchedules, error } = await supabase
        .from('family_payment_schedules')
        .select('*')
        .eq('status', 'active')
        .lte('nextPaymentDate', now);

      if (error) {
        console.error('Error fetching due payments:', error);
        return;
      }

      for (const schedule of dueSchedules || []) {
        await this.processPayment(schedule);
      }
    } catch (error) {
      console.error('Error processing due payments:', error);
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
      if (schedule.requiresApproval && schedule.amount >= schedule.approvalThreshold) {
        await this.createApprovalRequest(schedule);
        return;
      }

      // Create payment transaction
      const transaction: Omit<PaymentTransaction, 'id' | 'createdAt' | 'updatedAt'> = {
        scheduleId: schedule.id,
        familyId: schedule.familyId,
        recipientId: schedule.recipientId,
        recipientNpub: schedule.recipientNpub,
        amount: schedule.amount,
        currency: schedule.currency,
        status: 'pending',
        paymentMethod: this.determinePaymentMethod(schedule.currency),
        approvalRequired: false
      };

      const { data: paymentTx, error } = await supabase
        .from('family_payment_transactions')
        .insert(transaction)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create payment transaction: ${error.message}`);
      }

      // Execute the payment
      await this.executePayment(paymentTx);

      // Update next payment date
      await PaymentAutomationService.updateNextPaymentDate(schedule);

    } catch (error) {
      console.error('Error processing payment:', error);
      
      // Send failure notification
      await PaymentAutomationService.sendNotification({
        familyId: schedule.familyId,
        recipientId: schedule.recipientId,
        recipientNpub: schedule.recipientNpub,
        type: 'payment_sent',
        title: 'Payment Failed',
        message: `Scheduled payment of ${schedule.amount} ${schedule.currency} failed to process.`,
        amount: schedule.amount,
        currency: schedule.currency,
        read: false,
        createdAt: new Date().toISOString()
      });
    }
  }

  /**
   * Execute payment using appropriate method
   */
  private async executePayment(transaction: PaymentTransaction) {
    try {
      switch (transaction.paymentMethod) {
        case 'lightning':
          await this.executeLightningPayment(transaction);
          break;
        case 'ecash':
          await this.executeECashPayment(transaction);
          break;
        case 'fedimint':
          await this.executeFedimintPayment(transaction);
          break;
        default:
          throw new Error(`Unsupported payment method: ${transaction.paymentMethod}`);
      }

      // Update transaction status
      await supabase
        .from('family_payment_transactions')
        .update({
          status: 'sent',
          sentAt: new Date().toISOString()
        })
        .eq('id', transaction.id);

      // Send success notification
      await PaymentAutomationService.sendNotification({
        familyId: transaction.familyId,
        recipientId: transaction.recipientId,
        recipientNpub: transaction.recipientNpub,
        type: 'payment_sent',
        title: 'Payment Sent Successfully',
        message: `Payment of ${transaction.amount} ${transaction.currency} has been sent.`,
        amount: transaction.amount,
        currency: transaction.currency,
        read: false,
        createdAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error executing payment:', error);
      
      // Update transaction status to failed
      await supabase
        .from('family_payment_transactions')
        .update({
          status: 'failed',
          failedAt: new Date().toISOString(),
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        })
        .eq('id', transaction.id);

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
        throw new Error('No Lightning invoice provided for payment');
      }

      // Execute payment via PhoenixD
      const payment = await this.phoenixDClient.payInvoice(
        transaction.lightningInvoice,
        transaction.amount,
        transaction.recipientId // family member tracking
      );

      if (payment.isPaid) {
        // Update transaction status
        await supabase
          .from('family_payment_transactions')
          .update({
            status: 'sent',
            sentAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
          .eq('id', transaction.id);

        // Send success notification
        await PaymentAutomationService.sendNotification({
          familyId: transaction.familyId,
          recipientId: transaction.recipientId,
          recipientNpub: transaction.recipientNpub,
          type: 'payment_sent',
          title: 'Payment Sent Successfully',
          message: `Lightning payment of ${transaction.amount} ${transaction.currency} has been sent.`,
          amount: transaction.amount,
          currency: transaction.currency,
          read: false,
          createdAt: new Date().toISOString()
        });

        console.log(`✅ Lightning payment executed: ${payment.sent} sats (fees: ${payment.fees})`);
      } else {
        throw new Error('Payment was not completed successfully');
      }
    } catch (error) {
      console.error('Lightning payment failed:', error);
      
      // Update transaction status
      await supabase
        .from('family_payment_transactions')
        .update({
          status: 'failed',
          failedAt: new Date().toISOString(),
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date().toISOString()
        })
        .eq('id', transaction.id);

      throw error;
    }
  }

  /**
   * Execute eCash payment
   */
  private async executeECashPayment(transaction: PaymentTransaction) {
    try {
      // Create eCash tokens for the recipient
      const ecashResponse = await fetch('/api/ecash/create-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: transaction.amount,
          recipientNpub: transaction.recipientNpub,
          familyId: transaction.familyId
        })
      });

      if (!ecashResponse.ok) {
        throw new Error('Failed to create eCash tokens');
      }

      const { tokens } = await ecashResponse.json();

      // Update transaction with eCash token details
      await supabase
        .from('family_payment_transactions')
        .update({
          ecashToken: JSON.stringify(tokens)
        })
        .eq('id', transaction.id);

    } catch (error) {
      console.error('Error executing eCash payment:', error);
      throw error;
    }
  }

  /**
   * Execute Fedimint payment
   */
  private async executeFedimintPayment(transaction: PaymentTransaction) {
    try {
      // Create Fedimint proof for the recipient
      const fedimintResponse = await fetch('/api/fedimint/create-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: transaction.amount,
          recipientNpub: transaction.recipientNpub,
          familyId: transaction.familyId
        })
      });

      if (!fedimintResponse.ok) {
        throw new Error('Failed to create Fedimint proof');
      }

      const { proof } = await fedimintResponse.json();

      // Update transaction with Fedimint proof details
      await supabase
        .from('family_payment_transactions')
        .update({
          fedimintProof: JSON.stringify(proof)
        })
        .eq('id', transaction.id);

    } catch (error) {
      console.error('Error executing Fedimint payment:', error);
      throw error;
    }
  }

  /**
   * Entry point for executing a payment (with or without cascade)
   */
  private async executeCascadePayment(node: PaymentCascadeNode, parentTxId?: string, familyId?: string) {
    // 1. If node has children, split and recursively execute
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        await this.executeCascadePayment(child, parentTxId, familyId);
      }
      return;
    }
    // 2. Otherwise, execute the payment for this node
    if (node.currency === 'sats') {
      await this.executeLNPayment(node, familyId);
    } else if (node.currency === 'ecash') {
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
        'Cascade payment from family treasury',
        { enablePrivacy: true }
      );

      // Execute payment via PhoenixD
      const payment = await this.phoenixDClient.payInvoice(
        invoice.serialized,
        node.amount,
        node.recipientId
      );

      if (payment.isPaid) {
        console.log(`✅ Cascade LN payment: ${node.amount} sats to ${node.recipientId}`);
        
        // Process children recursively
        if (node.children && node.children.length > 0) {
          for (const child of node.children) {
            await this.executeCascadePayment(child, payment.paymentId, familyId);
          }
        }
      } else {
        throw new Error('Cascade Lightning payment failed');
      }
    } catch (error) {
      console.error('Cascade Lightning payment failed:', error);
      throw error;
    }
  }

  /**
   * Execute an eCash payment and recursively split if needed
   */
  private async executeECashCascade(node: PaymentCascadeNode, familyId?: string) {
    // 1. Mint eCash tokens for the recipient
    const ecashRes = await fetch('/api/ecash/create-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: node.amount,
        recipientNpub: node.recipientNpub,
        familyId: familyId || ''
      })
    });
    if (!ecashRes.ok) throw new Error('Failed to mint eCash tokens');
    const { tokens } = await ecashRes.json();
    // 2. Notify recipient
    await PaymentAutomationService.sendNotification({
      familyId: familyId || '',
      recipientId: node.recipientId,
      recipientNpub: node.recipientNpub,
      type: 'payment_sent',
      title: 'Cascade eCash Payment',
      message: `You have received a split eCash payment of ${node.amount}.`,
      amount: node.amount,
      currency: 'ecash',
      read: false,
      createdAt: new Date().toISOString()
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
      // Get family members with approval roles
      const { data: approvers, error } = await supabase
        .from('family_members')
        .select('npub, role')
        .eq('familyId', schedule.familyId)
        .in('role', ['guardian', 'steward', 'adult']);

      if (error) {
        throw new Error(`Failed to fetch approvers: ${error.message}`);
      }

      const approvalRequest: Omit<ApprovalRequest, 'id' | 'createdAt' | 'updatedAt'> = {
        transactionId: '', // Will be set when transaction is created
        familyId: schedule.familyId,
        requesterId: schedule.createdBy,
        requesterNpub: '', // Will be set from user context
        amount: schedule.amount,
        currency: schedule.currency,
        description: schedule.metadata.description || 'Scheduled family payment',
        urgency: this.determineUrgency(schedule.amount),
        status: 'pending',
        approvers: approvers?.map(approver => ({
          npub: approver.npub,
          role: approver.role as 'guardian' | 'steward' | 'adult',
          status: 'pending'
        })) || [],
        requiredApprovals: this.calculateRequiredApprovals(approvers?.length || 0),
        receivedApprovals: 0,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      };

      const { data, error: approvalError } = await supabase
        .from('family_approval_requests')
        .insert(approvalRequest)
        .select()
        .single();

      if (approvalError) {
        throw new Error(`Failed to create approval request: ${approvalError.message}`);
      }

      // Send notification to all approvers
      for (const approver of approvalRequest.approvers as Array<{ npub: string; role: string; status: string }>) {
        await PaymentAutomationService.sendNotification({
          familyId: schedule.familyId,
          recipientId: '',
          recipientNpub: approver.npub,
          type: 'approval_required',
          title: 'Payment Approval Required',
          message: `A payment of ${schedule.amount} ${schedule.currency} requires your approval.`,
          amount: schedule.amount,
          currency: schedule.currency,
          read: false,
          createdAt: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('Error creating approval request:', error);
      throw error;
    }
  }

  /**
   * Approve or reject a payment request
   */
  static async approvePayment(approvalId: string, approverNpub: string, approved: boolean, reason?: string) {
    try {
      const { data: approval, error } = await supabase
        .from('family_approval_requests')
        .select('*')
        .eq('id', approvalId)
        .single();

      if (error) {
        throw new Error(`Failed to fetch approval request: ${error.message}`);
      }

      // Update approver status
      const updatedApprovers = approval.approvers.map((approver: any) => {
        if (approver.npub === approverNpub) {
          return {
            ...approver,
            status: approved ? 'approved' : 'rejected',
            [approved ? 'approvedAt' : 'rejectedAt']: new Date().toISOString(),
            reason
          };
        }
        return approver;
      });

      const receivedApprovals = updatedApprovers.filter((a: any) => a.status === 'approved').length;
      const status = approved && receivedApprovals >= approval.requiredApprovals ? 'approved' : 
                    !approved ? 'rejected' : 'pending';

      // Update approval request
      await supabase
        .from('family_approval_requests')
        .update({
          approvers: updatedApprovers,
          receivedApprovals,
          status,
          updatedAt: new Date().toISOString()
        })
        .eq('id', approvalId);

      // Send notification to requester
      await this.sendNotification({
        familyId: approval.familyId,
        recipientId: approval.requesterId,
        recipientNpub: approval.requesterNpub,
        type: approved ? 'approval_granted' : 'approval_rejected',
        title: approved ? 'Payment Approved' : 'Payment Rejected',
        message: approved ? 
          `Your payment of ${approval.amount} ${approval.currency} has been approved.` :
          `Your payment of ${approval.amount} ${approval.currency} has been rejected.`,
        amount: approval.amount,
        currency: approval.currency,
        read: false,
        createdAt: new Date().toISOString()
      });

      // If approved and has enough approvals, process the payment
      if (status === 'approved') {
        // Process the approved payment
        // This would trigger the actual payment execution
      }

    } catch (error) {
      console.error('Error approving payment:', error);
      throw error;
    }
  }

  /**
   * Monitor PhoenixD liquidity and auto-replenish when needed
   */
  private async monitorPhoenixDLiquidity() {
    try {
      // Get all family liquidity configurations
      const { data: liquidityConfigs, error } = await supabase
        .from('family_phoenixd_liquidity_configs')
        .select('*')
        .eq('autoReplenish', true);

      if (error) {
        console.error('Error fetching liquidity configs:', error);
        return;
      }

      for (const config of liquidityConfigs || []) {
        await this.checkFamilyLiquidity(config);
      }
    } catch (error) {
      console.error('Error monitoring PhoenixD liquidity:', error);
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
      const replenishThreshold = config.minBalance * (config.replenishThreshold / 100);
      
      if (currentBalance < replenishThreshold && this.canReplenishToday(config)) {
        await this.replenishLiquidity(config, currentBalance);
      }
    } catch (error) {
      console.error(`Error checking liquidity for family ${config.familyId}:`, error);
    }
  }

  /**
   * Replenish family liquidity via PhoenixD
   */
  private async replenishLiquidity(config: PhoenixDLiquidityConfig, currentBalance: number) {
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
        amountSat: replenishAmount
      });

      // Update replenishment tracking
      await supabase
        .from('family_phoenixd_liquidity_configs')
        .update({
          dailyReplenishCount: config.dailyReplenishCount + 1,
          lastReplenishDate: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .eq('familyId', config.familyId);

      console.log(`🌊 Replenished liquidity for family ${config.familyId}:`, {
        amount: replenishAmount,
        channelId: liquidityResponse.channelId,
        fees: liquidityResponse.feeSat
      });

      // Send notification to family guardians
      await PaymentAutomationService.sendNotification({
        familyId: config.familyId,
        recipientId: 'guardian', // This would need to be expanded to notify all guardians
        recipientNpub: '', // Would need guardian npub
        type: 'payment_sent',
        title: 'Liquidity Replenished',
        message: `Family liquidity has been automatically replenished with ${replenishAmount} sats.`,
        amount: replenishAmount,
        currency: 'sats',
        read: false,
        createdAt: new Date().toISOString()
      });

    } catch (error) {
      console.error(`Error replenishing liquidity for family ${config.familyId}:`, error);
      
      // Send alert notification
      await PaymentAutomationService.sendNotification({
        familyId: config.familyId,
        recipientId: 'guardian',
        recipientNpub: '',
        type: 'limit_exceeded',
        title: 'Liquidity Replenishment Failed',
        message: `Failed to replenish family liquidity. Manual intervention may be required.`,
        read: false,
        createdAt: new Date().toISOString()
      });
    }
  }

  /**
   * Send notification to family members
   */
  static async sendNotification(notification: Omit<PaymentNotification, 'id'>) {
    try {
      const { data, error } = await supabase
        .from('family_payment_notifications')
        .insert(notification)
        .select()
        .single();

      if (error) {
        console.error('Error sending notification:', error);
        return;
      }

      // Trigger real-time notification callbacks
      const service = PaymentAutomationService.getInstance();
      service.notificationCallbacks.forEach(callback => {
        callback(data);
      });

    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  /**
   * Subscribe to payment notifications
   */
  static subscribeToNotifications(callback: (notification: PaymentNotification) => void): string {
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
  private static calculateNextPaymentDate(startDate: string, frequency: string, customInterval?: number): string {
    const start = new Date(startDate);
    const now = new Date();
    
    if (start > now) {
      return startDate;
    }

    let nextDate = new Date(start);
    
    while (nextDate <= now) {
      switch (frequency) {
        case 'daily':
          nextDate.setDate(nextDate.getDate() + 1);
          break;
        case 'weekly':
          nextDate.setDate(nextDate.getDate() + 7);
          break;
        case 'monthly':
          nextDate.setMonth(nextDate.getMonth() + 1);
          break;
        case 'yearly':
          nextDate.setFullYear(nextDate.getFullYear() + 1);
          break;
        case 'custom':
          nextDate.setDate(nextDate.getDate() + (customInterval || 1));
          break;
      }
    }

    return nextDate.toISOString();
  }

  static updateNextPaymentDate(schedule: PaymentSchedule) {
    const nextDate = this.calculateNextPaymentDate(
      schedule.nextPaymentDate,
      schedule.frequency,
      schedule.customInterval
    );

    return supabase
      .from('family_payment_schedules')
      .update({ nextPaymentDate: nextDate })
      .eq('id', schedule.id);
  }

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

  private determineUrgency(amount: number): 'low' | 'medium' | 'high' | 'urgent' {
    if (amount >= 1000000) return 'urgent'; // 1M sats
    if (amount >= 100000) return 'high'; // 100K sats
    if (amount >= 10000) return 'medium'; // 10K sats
    return 'low';
  }

  private calculateRequiredApprovals(approverCount: number): number {
    if (approverCount <= 2) return 1;
    if (approverCount <= 4) return 2;
    return Math.ceil(approverCount * 0.6); // 60% of approvers
  }

  private isNewDay(lastReplenishDate: string): boolean {
    const last = new Date(lastReplenishDate);
    const now = new Date();
    return last.getDate() !== now.getDate() || 
           last.getMonth() !== now.getMonth() || 
           last.getFullYear() !== now.getFullYear();
  }

  private canReplenishToday(config: PhoenixDLiquidityConfig): boolean {
    const lastReplenish = new Date(config.lastReplenishDate);
    const now = new Date();
    return lastReplenish.getDate() !== now.getDate() ||
           lastReplenish.getMonth() !== now.getMonth() ||
           lastReplenish.getFullYear() !== now.getFullYear();
  }

  /**
   * Get payment schedules for a family
   */
  static async getPaymentSchedules(familyId: string): Promise<PaymentSchedule[]> {
    try {
      const { data, error } = await supabase
        .from('family_payment_schedules')
        .select('*')
        .eq('familyId', familyId)
        .order('nextPaymentDate', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch payment schedules: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching payment schedules:', error);
      return [];
    }
  }

  /**
   * Get payment transactions for a family
   */
  static async getPaymentTransactions(familyId: string): Promise<PaymentTransaction[]> {
    try {
      const { data, error } = await supabase
        .from('family_payment_transactions')
        .select('*')
        .eq('familyId', familyId)
        .order('createdAt', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch payment transactions: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching payment transactions:', error);
      return [];
    }
  }

  /**
   * Get approval requests for a family
   */
  static async getApprovalRequests(familyId: string): Promise<ApprovalRequest[]> {
    try {
      const { data, error } = await supabase
        .from('family_approval_requests')
        .select('*')
        .eq('familyId', familyId)
        .order('createdAt', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch approval requests: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching approval requests:', error);
      return [];
    }
  }

  /**
   * Get notifications for a user
   */
  static async getNotifications(recipientNpub: string): Promise<PaymentNotification[]> {
    try {
      const { data, error } = await supabase
        .from('family_payment_notifications')
        .select('*')
        .eq('recipientNpub', recipientNpub)
        .order('createdAt', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch notifications: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  static async markNotificationAsRead(notificationId: string) {
    try {
      await supabase
        .from('family_payment_notifications')
        .update({ read: true })
        .eq('id', notificationId);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }
}

export default PaymentAutomationService;

