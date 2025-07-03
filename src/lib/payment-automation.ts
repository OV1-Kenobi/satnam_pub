/**
 * PRIVACY-FIRST PAYMENT AUTOMATION SYSTEM
 *
 * Automated payment distribution with Lightning integration,
 * end-to-end encryption, and scheduled processing using node-cron.
 */

import * as cron from "node-cron";
import { LightningClient } from "../../lib/lightning-client";
import {
  decryptSensitiveData,
  encryptSensitiveData,
  generateSecureUUID,
  logPrivacyOperation,
} from "../../lib/privacy/encryption";

import { supabase } from "../../lib/supabase";

export interface PaymentSchedule {
  id: string;
  familyId: string;
  familyMemberId: string;
  memberName: string;
  amount: number;
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek?: number; // 0-6 for weekly (0 = Sunday)
  dayOfMonth?: number; // 1-31 for monthly
  enabled: boolean;
  nextDistribution: Date;
  lastDistribution?: Date;
  distributionCount: number;
  totalDistributed: number;
  conditions: PaymentConditions;
  autoApprovalLimit: number;
  parentApprovalRequired: boolean;
  preferredMethod: "lightning" | "ecash" | "auto";
  maxRetries: number;
  retryDelay: number; // minutes
  notificationSettings: NotificationSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentConditions {
  maxDailySpend: number;
  maxTransactionSize: number;
  restrictedCategories?: string[];
  restrictedMerchants?: string[];
  allowedTimeWindows?: {
    start: string; // HH:MM format
    end: string; // HH:MM format
    days: number[]; // 0-6 (Sunday-Saturday)
  }[];
  requireApprovalAbove: number;
  pauseOnSuspiciousActivity: boolean;
  geofencing?: {
    enabled: boolean;
    allowedLocations: string[];
    restrictedLocations: string[];
  };
  spendingVelocityLimits?: {
    maxTransactionsPerHour: number;
    maxTransactionsPerDay: number;
    cooldownPeriod: number; // minutes
  };
}

export interface NotificationSettings {
  notifyOnDistribution: boolean;
  notifyOnFailure: boolean;
  notifyOnSuspiciousActivity: boolean;
  notificationMethods: ("email" | "sms" | "push" | "nostr_dm")[];
  escalationPolicy?: {
    retryCount: number;
    escalationDelay: number; // minutes
    escalationContacts: string[];
  };
}

export interface PaymentDistribution {
  id: string;
  scheduleId: string;
  familyId: string;
  familyMemberId: string;
  amount: number;
  status:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled"
    | "requires_approval";
  distributionMethod: "lightning" | "ecash";
  transactionId?: string;
  fee: number;
  executedAt?: Date;
  failureReason?: string;
  approvedBy?: string;
  approvalRequired: boolean;
  liquiditySource: "family_balance" | "rebalanced" | "emergency_reserve";
  retryCount: number;
  nextRetryAt?: Date;
  routingDetails?: {
    routeType: string;
    hops: number;
    totalTimeMs: number;
  };
  createdAt: Date;
}

export interface SpendingTracker {
  familyMemberId: string;
  date: string; // YYYY-MM-DD format
  dailySpent: number;
  transactionCount: number;
  largestTransaction: number;
  categories: { [category: string]: number };
  merchants: { [merchant: string]: number };
  flaggedTransactions: number;
  paymentReceived: number;
  remainingPayment: number;
  spendingVelocity: {
    transactionsLastHour: number;
    transactionsToday: number;
    averageTransactionSize: number;
  };
  riskScore: number;
  updatedAt: Date;
}

export interface PaymentApproval {
  id: string;
  familyId: string;
  paymentDistributionId: string;
  requestedBy: string;
  requestedAmount: number;
  reason: string;
  status: "pending" | "approved" | "denied" | "expired";
  approvedBy?: string;
  approvalComment?: string;
  requestedAt: Date;
  respondedAt?: Date;
  expiresAt: Date;
  urgency: "low" | "medium" | "high" | "critical";
  riskAssessment?: {
    riskLevel: "low" | "medium" | "high";
    riskFactors: string[];
    automaticApproval: boolean;
  };
}

export interface PaymentProcessingResult {
  processed: number;
  successful: number;
  failed: number;
  pendingApproval: number;
  totalAmount: number;
  totalFees: number;
  processingTimeMs: number;
  details: Array<{
    scheduleId: string;
    memberName: string;
    amount: number;
    status: "success" | "failed" | "pending_approval" | "retry_scheduled";
    transactionId?: string;
    nextRetryAt?: Date;
    error?: string;
    distributionMethod: string;
    fee: number;
  }>;
}

export class PaymentAutomationSystem {
  private lightningClient: LightningClient;
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private processingQueue: Map<string, any> = new Map();
  private retryQueue: Map<string, any> = new Map();

  constructor() {
    this.lightningClient = new LightningClient();

    // Setup retry processing
    this.setupRetryProcessor();
  }

  /**
   * Setup retry processor for failed distributions
   */
  private setupRetryProcessor(): void {
    // Process retries every 5 minutes
    const retryJob = cron.schedule(
      "*/5 * * * *",
      async () => {
        try {
          await this.processRetryQueue();
        } catch (error) {
          console.error("❌ Retry processor failed:", error);
        }
      },
      {
        scheduled: false,
        timezone: "UTC",
      } as any
    );

    this.scheduledJobs.set("retry-processor", retryJob);
    retryJob.start();

    console.log("🔄 Retry processor scheduled every 5 minutes");
  }

  /**
   * Create a new payment schedule with enhanced privacy protection
   */
  async createPaymentSchedule(
    familyId: string,
    familyMemberId: string,
    schedule: Omit<
      PaymentSchedule,
      | "id"
      | "familyId"
      | "familyMemberId"
      | "memberName"
      | "distributionCount"
      | "totalDistributed"
      | "createdAt"
      | "updatedAt"
    >
  ): Promise<PaymentSchedule> {
    try {
      console.log(
        `📅 Creating enhanced payment schedule for member: ${familyMemberId}`
      );

      // Validate schedule parameters
      this.validatePaymentSchedule(schedule);

      // Get and encrypt/decrypt member name
      const { data: member } = await supabase
        .from("secure_family_members")
        .select("encrypted_name, name_salt, name_iv, name_tag")
        .eq("member_uuid", familyMemberId)
        .single();

      if (!member) {
        throw new Error("Family member not found");
      }

      const memberName = await decryptSensitiveData({
        encrypted: member.encrypted_name,
        salt: member.name_salt,
        iv: member.name_iv,
        tag: member.name_tag,
      });

      // Encrypt all sensitive schedule data
      const encryptedFamilyId = await encryptSensitiveData(familyId);
      const encryptedMemberId = await encryptSensitiveData(familyMemberId);
      const encryptedMemberName = await encryptSensitiveData(memberName);
      const encryptedAmount = await encryptSensitiveData(
        schedule.amount.toString()
      );
      const encryptedConditions = await encryptSensitiveData(
        JSON.stringify(schedule.conditions)
      );
      const encryptedApprovalLimit = await encryptSensitiveData(
        schedule.autoApprovalLimit.toString()
      );
      const encryptedNotificationSettings = await encryptSensitiveData(
        JSON.stringify(schedule.notificationSettings)
      );

      // Calculate next distribution date
      const nextDistribution = this.calculateNextDistribution(
        schedule.frequency,
        schedule.dayOfWeek,
        schedule.dayOfMonth
      );

      // Insert encrypted schedule
      const { data: newSchedule, error } = await supabase
        .from("secure_payment_schedules")
        .insert({
          schedule_uuid: generateSecureUUID(),
          encrypted_family_id: encryptedFamilyId.encrypted,
          family_salt: encryptedFamilyId.salt,
          family_iv: encryptedFamilyId.iv,
          family_tag: encryptedFamilyId.tag,
          encrypted_family_member_id: encryptedMemberId.encrypted,
          member_salt: encryptedMemberId.salt,
          member_iv: encryptedMemberId.iv,
          member_tag: encryptedMemberId.tag,
          encrypted_member_name: encryptedMemberName.encrypted,
          member_name_salt: encryptedMemberName.salt,
          member_name_iv: encryptedMemberName.iv,
          member_name_tag: encryptedMemberName.tag,
          encrypted_amount: encryptedAmount.encrypted,
          amount_salt: encryptedAmount.salt,
          amount_iv: encryptedAmount.iv,
          amount_tag: encryptedAmount.tag,
          frequency: schedule.frequency,
          day_of_week: schedule.dayOfWeek,
          day_of_month: schedule.dayOfMonth,
          enabled: schedule.enabled,
          next_distribution: nextDistribution.toISOString(),
          encrypted_conditions: encryptedConditions.encrypted,
          conditions_salt: encryptedConditions.salt,
          conditions_iv: encryptedConditions.iv,
          conditions_tag: encryptedConditions.tag,
          encrypted_auto_approval_limit: encryptedApprovalLimit.encrypted,
          approval_limit_salt: encryptedApprovalLimit.salt,
          approval_limit_iv: encryptedApprovalLimit.iv,
          approval_limit_tag: encryptedApprovalLimit.tag,
          parent_approval_required: schedule.parentApprovalRequired,
          encrypted_distribution_count: (
            await encryptSensitiveData("0")
          ).encrypted,
          count_salt: (await encryptSensitiveData("0")).salt,
          count_iv: (await encryptSensitiveData("0")).iv,
          count_tag: (await encryptSensitiveData("0")).tag,
          encrypted_total_distributed: (
            await encryptSensitiveData("0")
          ).encrypted,
          total_salt: (await encryptSensitiveData("0")).salt,
          total_iv: (await encryptSensitiveData("0")).iv,
          total_tag: (await encryptSensitiveData("0")).tag,
          // Enhanced fields
          preferred_method: schedule.preferredMethod,
          max_retries: schedule.maxRetries,
          retry_delay: schedule.retryDelay,
          encrypted_notification_settings:
            encryptedNotificationSettings.encrypted,
          notification_salt: encryptedNotificationSettings.salt,
          notification_iv: encryptedNotificationSettings.iv,
          notification_tag: encryptedNotificationSettings.tag,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create payment schedule: ${error.message}`);
      }

      // Setup individual cron job for this schedule if it's a specific time-based schedule
      if (schedule.enabled) {
        await this.setupScheduleSpecificCron(newSchedule);
      }

      // Log privacy operation
      logPrivacyOperation({
        action: "encrypt",
        dataType: "family_data",
        familyId,
        success: true,
      });

      console.log(`✅ Enhanced payment schedule created for ${memberName}`);

      return await this.mapDatabaseToSchedule(newSchedule);
    } catch (error) {
      console.error("❌ Failed to create enhanced payment schedule:", error);

      logPrivacyOperation({
        action: "encrypt",
        dataType: "family_data",
        familyId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw new Error(
        `Enhanced payment schedule creation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Process all pending payment distributions with enhanced retry logic
   */
  async processPendingPayments(): Promise<PaymentProcessingResult> {
    const startTime = Date.now();

    try {
      console.log(
        "🤖 Processing pending payment distributions with enhanced features..."
      );

      // Get all enabled encrypted schedules that are due for distribution
      const { data: dueSchedules, error } = await supabase
        .from("secure_payment_schedules")
        .select("*")
        .eq("enabled", true)
        .lte("next_distribution", new Date().toISOString());

      if (error) {
        throw new Error(`Failed to fetch due schedules: ${error.message}`);
      }

      if (!dueSchedules || dueSchedules.length === 0) {
        console.log("No payments due for distribution");
        return {
          processed: 0,
          successful: 0,
          failed: 0,
          pendingApproval: 0,
          totalAmount: 0,
          totalFees: 0,
          processingTimeMs: Date.now() - startTime,
          details: [],
        };
      }

      console.log(`Found ${dueSchedules.length} payments due for distribution`);

      const results: PaymentProcessingResult = {
        processed: 0,
        successful: 0,
        failed: 0,
        pendingApproval: 0,
        totalAmount: 0,
        totalFees: 0,
        processingTimeMs: 0,
        details: [],
      };

      // Process each due payment
      for (const encryptedSchedule of dueSchedules) {
        try {
          results.processed++;

          // Decrypt schedule data
          const schedule = await this.mapDatabaseToSchedule(encryptedSchedule);

          // Check if already being processed
          if (this.processingQueue.has(schedule.id)) {
            console.log(`Skipping already processing schedule: ${schedule.id}`);
            continue;
          }

          // Mark as processing
          this.processingQueue.set(schedule.id, {
            startTime: Date.now(),
            schedule,
          });

          // Pre-distribution checks
          const preCheckResult = await this.performPreDistributionChecks(
            schedule
          );

          if (!preCheckResult.canProceed) {
            if (preCheckResult.requiresApproval) {
              results.pendingApproval++;
              results.details.push({
                scheduleId: schedule.id,
                memberName: schedule.memberName,
                amount: schedule.amount,
                status: "pending_approval",
                distributionMethod: schedule.preferredMethod,
                fee: 0,
              });

              await this.createApprovalRequest(schedule, preCheckResult.reason);
            } else {
              results.failed++;
              results.details.push({
                scheduleId: schedule.id,
                memberName: schedule.memberName,
                amount: schedule.amount,
                status: "failed",
                error: preCheckResult.reason,
                distributionMethod: schedule.preferredMethod,
                fee: 0,
              });
            }

            this.processingQueue.delete(schedule.id);
            continue;
          }

          // Attempt distribution
          const distributionResult = await this.distributePaymentEnhanced(
            schedule
          );

          results.totalAmount += schedule.amount;
          results.totalFees += distributionResult.fee;

          if (distributionResult.status === "completed") {
            results.successful++;
            results.details.push({
              scheduleId: schedule.id,
              memberName: schedule.memberName,
              amount: schedule.amount,
              status: "success",
              transactionId: distributionResult.transactionId,
              distributionMethod: distributionResult.distributionMethod,
              fee: distributionResult.fee,
            });

            // Update schedule for next distribution
            await this.updateNextDistribution(
              schedule.id,
              schedule.frequency,
              schedule.dayOfWeek,
              schedule.dayOfMonth
            );

            // Send success notification
            await this.sendNotification(schedule, "distribution_success", {
              amount: schedule.amount,
              transactionId: distributionResult.transactionId,
              method: distributionResult.distributionMethod,
            });
          } else if (distributionResult.status === "requires_approval") {
            results.pendingApproval++;
            results.details.push({
              scheduleId: schedule.id,
              memberName: schedule.memberName,
              amount: schedule.amount,
              status: "pending_approval",
              distributionMethod: distributionResult.distributionMethod,
              fee: distributionResult.fee,
            });

            await this.createApprovalRequest(
              schedule,
              distributionResult.failureReason
            );
          } else {
            // Failed - check if we should retry
            if (distributionResult.retryCount < schedule.maxRetries) {
              const nextRetryAt = new Date(
                Date.now() + schedule.retryDelay * 60 * 1000
              );

              // Add to retry queue
              this.retryQueue.set(distributionResult.id, {
                distribution: distributionResult,
                schedule,
                nextRetryAt,
              });

              results.details.push({
                scheduleId: schedule.id,
                memberName: schedule.memberName,
                amount: schedule.amount,
                status: "retry_scheduled",
                nextRetryAt,
                error: distributionResult.failureReason,
                distributionMethod: distributionResult.distributionMethod,
                fee: distributionResult.fee,
              });

              console.log(
                `📅 Retry scheduled for ${
                  schedule.memberName
                } at ${nextRetryAt.toISOString()}`
              );
            } else {
              results.failed++;
              results.details.push({
                scheduleId: schedule.id,
                memberName: schedule.memberName,
                amount: schedule.amount,
                status: "failed",
                error: distributionResult.failureReason,
                distributionMethod: distributionResult.distributionMethod,
                fee: distributionResult.fee,
              });

              // Send failure notification
              await this.sendNotification(schedule, "distribution_failed", {
                amount: schedule.amount,
                reason: distributionResult.failureReason,
                retryCount: distributionResult.retryCount,
              });
            }
          }

          this.processingQueue.delete(schedule.id);
        } catch (error) {
          results.failed++;
          results.details.push({
            scheduleId: encryptedSchedule.schedule_uuid,
            memberName: "Unknown",
            amount: 0,
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
            distributionMethod: "unknown",
            fee: 0,
          });

          this.processingQueue.delete(encryptedSchedule.schedule_uuid);
          console.error(`Failed to process encrypted payment:`, error);
        }
      }

      results.processingTimeMs = Date.now() - startTime;

      console.log(
        `✅ Enhanced processing complete: ${results.processed} processed, ${results.successful} successful, ${results.failed} failed, ${results.pendingApproval} pending approval (${results.processingTimeMs}ms)`
      );

      return results;
    } catch (error) {
      console.error("❌ Failed to process pending payments:", error);
      throw new Error(
        `Enhanced payment processing failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Enhanced payment distribution with Lightning integration
   */
  private async distributePaymentEnhanced(
    schedule: PaymentSchedule
  ): Promise<PaymentDistribution> {
    try {
      console.log(
        `💰 Enhanced payment distribution: ${schedule.amount} sats to ${schedule.memberName}`
      );

      // Determine best distribution method
      const distributionMethod = await this.determineBestDistributionMethod(
        schedule
      );

      let result: any;
      let liquiditySource: PaymentDistribution["liquiditySource"] =
        "family_balance";

      switch (distributionMethod) {
        case "lightning":
          result = await this.distributeViaLightning(schedule);
          liquiditySource = "family_balance";
          break;

        case "ecash":
          result = await this.distributeViaEcash(schedule);
          liquiditySource = "family_balance";
          break;

        default:
          throw new Error(
            `Unsupported distribution method: ${distributionMethod}`
          );
      }

      const distribution: PaymentDistribution = {
        id: generateSecureUUID(),
        scheduleId: schedule.id,
        familyId: schedule.familyId,
        familyMemberId: schedule.familyMemberId,
        amount: schedule.amount,
        status: result.success ? "completed" : "failed",
        distributionMethod,
        transactionId: result.transactionId,
        fee: result.fee || 0,
        executedAt: result.success ? new Date() : undefined,
        failureReason: result.error,
        approvalRequired: false,
        liquiditySource,
        retryCount: 0,
        routingDetails: result.routingDetails,
        createdAt: new Date(),
      };

      // Store encrypted distribution record
      await this.storeEncryptedDistribution(distribution);

      return distribution;
    } catch (error) {
      console.error("❌ Enhanced payment distribution failed:", error);

      return {
        id: generateSecureUUID(),
        scheduleId: schedule.id,
        familyId: schedule.familyId,
        familyMemberId: schedule.familyMemberId,
        amount: schedule.amount,
        status: "failed",
        distributionMethod: "lightning",
        fee: 0,
        failureReason: error instanceof Error ? error.message : "Unknown error",
        approvalRequired: false,
        liquiditySource: "family_balance",
        retryCount: 0,
        createdAt: new Date(),
      };
    }
  }

  /**
   * Distribute payment via Lightning Network
   */
  private async distributeViaLightning(
    schedule: PaymentSchedule
  ): Promise<any> {
    try {
      console.log(`⚡ Distributing via Lightning: ${schedule.amount} sats`);

      // Mock Lightning payment
      const fee = Math.ceil(schedule.amount * 0.001); // 0.1% fee
      const success = Math.random() > 0.1; // 90% success rate

      if (success) {
        return {
          success: true,
          transactionId: `ln_${generateSecureUUID()}`,
          fee,
          routingDetails: {
            routeType: "lightning",
            hops: 3,
            totalTimeMs: 15000,
          },
        };
      } else {
        throw new Error("Lightning payment failed");
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Lightning failed",
        fee: 0,
      };
    }
  }

  /**
   * Distribute payment via eCash
   */
  private async distributeViaEcash(schedule: PaymentSchedule): Promise<any> {
    try {
      console.log(`🪙 Distributing via eCash: ${schedule.amount} sats`);

      // Mock eCash transfer
      return {
        success: true,
        transactionId: `ecash_${generateSecureUUID()}`,
        fee: 0, // eCash transfers are typically free
        routingDetails: {
          routeType: "ecash",
          hops: 0,
          totalTimeMs: 5000,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "eCash failed",
        fee: 0,
      };
    }
  }

  /**
   * Determine the best distribution method based on conditions
   */
  private async determineBestDistributionMethod(
    schedule: PaymentSchedule
  ): Promise<"lightning" | "ecash"> {
    // If explicitly set and not auto
    if (schedule.preferredMethod !== "auto") {
      return schedule.preferredMethod as "lightning" | "ecash";
    }

    // Check current family liquidity
    const liquidityStatus = await this.checkFamilyLiquidity(schedule.familyId);

    // If insufficient liquidity, prefer Lightning for better routing
    if (liquidityStatus.availableBalance < schedule.amount) {
      return "lightning";
    }

    // For privacy-sensitive amounts, prefer eCash
    if (schedule.amount < 50000) {
      // Less than 50k sats
      return "ecash";
    }

    // Default to Lightning
    return "lightning";
  }

  /**
   * Process retry queue for failed distributions
   */
  private async processRetryQueue(): Promise<void> {
    const now = new Date();
    const retryItems = Array.from(this.retryQueue.entries()).filter(
      ([_, item]) => item.nextRetryAt <= now
    );

    if (retryItems.length === 0) {
      return;
    }

    console.log(`🔄 Processing ${retryItems.length} retry items...`);

    for (const [id, item] of retryItems) {
      try {
        // Remove from retry queue
        this.retryQueue.delete(id);

        // Increment retry count
        item.distribution.retryCount++;

        // Attempt distribution again
        const distributionResult = await this.distributePaymentEnhanced(
          item.schedule
        );

        if (distributionResult.status === "completed") {
          console.log(`✅ Retry successful for ${item.schedule.memberName}`);

          // Update schedule for next distribution
          await this.updateNextDistribution(
            item.schedule.id,
            item.schedule.frequency,
            item.schedule.dayOfWeek,
            item.schedule.dayOfMonth
          );

          // Send success notification
          await this.sendNotification(
            item.schedule,
            "distribution_success_retry",
            {
              amount: item.schedule.amount,
              retryCount: item.distribution.retryCount,
              transactionId: distributionResult.transactionId,
            }
          );
        } else if (item.distribution.retryCount < item.schedule.maxRetries) {
          // Schedule another retry
          const nextRetryAt = new Date(
            Date.now() + item.schedule.retryDelay * 60 * 1000
          );
          this.retryQueue.set(id, {
            ...item,
            nextRetryAt,
          });

          console.log(
            `📅 Retry rescheduled for ${
              item.schedule.memberName
            } at ${nextRetryAt.toISOString()}`
          );
        } else {
          // Max retries reached
          console.log(`❌ Max retries reached for ${item.schedule.memberName}`);

          await this.sendNotification(
            item.schedule,
            "distribution_failed_final",
            {
              amount: item.schedule.amount,
              retryCount: item.distribution.retryCount,
              reason: distributionResult.failureReason,
            }
          );
        }
      } catch (error) {
        console.error(`❌ Retry processing failed for ${id}:`, error);

        // Remove failed retry to prevent infinite loops
        this.retryQueue.delete(id);
      }
    }
  }

  /**
   * Setup schedule-specific cron job
   */
  private async setupScheduleSpecificCron(schedule: any): Promise<void> {
    try {
      // Create cron expression based on frequency
      let cronExpression = "";

      switch (schedule.frequency) {
        case "daily":
          cronExpression = "0 9 * * *"; // 9 AM daily
          break;
        case "weekly":
          cronExpression = `0 9 * * ${schedule.day_of_week || 0}`; // 9 AM on specific day
          break;
        case "monthly":
          cronExpression = `0 9 ${schedule.day_of_month || 1} * *`; // 9 AM on specific day of month
          break;
      }

      if (cronExpression) {
        const scheduleJob = cron.schedule(
          cronExpression,
          async () => {
            try {
              const mappedSchedule = await this.mapDatabaseToSchedule(schedule);
              await this.distributePaymentEnhanced(mappedSchedule);
            } catch (error) {
              console.error(
                `❌ Schedule-specific distribution failed for ${schedule.schedule_uuid}:`,
                error
              );
            }
          },
          {
            scheduled: false,
            timezone: "UTC",
          } as any
        );

        this.scheduledJobs.set(
          `schedule-${schedule.schedule_uuid}`,
          scheduleJob
        );
        scheduleJob.start();

        console.log(
          `⏰ Individual cron job setup for schedule ${schedule.schedule_uuid}: ${cronExpression}`
        );
      }
    } catch (error) {
      console.error("❌ Failed to setup schedule-specific cron:", error);
    }
  }

  // Helper methods and mock implementations

  private validatePaymentSchedule(schedule: any): void {
    if (schedule.amount < 1000) {
      throw new Error("Payment amount must be at least 1000 sats");
    }

    if (schedule.amount > 100000) {
      throw new Error("Payment amount cannot exceed 100000 sats");
    }

    if (!["daily", "weekly", "monthly"].includes(schedule.frequency)) {
      throw new Error("Frequency must be daily, weekly, or monthly");
    }

    if (schedule.maxRetries < 0 || schedule.maxRetries > 10) {
      throw new Error("Max retries must be between 0 and 10");
    }

    if (schedule.retryDelay < 5 || schedule.retryDelay > 1440) {
      throw new Error("Retry delay must be between 5 and 1440 minutes");
    }
  }

  private calculateNextDistribution(
    frequency: string,
    dayOfWeek?: number,
    dayOfMonth?: number
  ): Date {
    const now = new Date();
    const next = new Date(now);

    switch (frequency) {
      case "daily":
        next.setDate(now.getDate() + 1);
        break;
      case "weekly":
        const daysUntilTarget = ((dayOfWeek || 0) - now.getDay() + 7) % 7;
        next.setDate(now.getDate() + (daysUntilTarget || 7));
        break;
      case "monthly":
        next.setMonth(now.getMonth() + 1);
        next.setDate(
          Math.min(
            dayOfMonth || 1,
            new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
          )
        );
        break;
    }

    next.setHours(9, 0, 0, 0); // 9 AM distribution time
    return next;
  }

  private async mapDatabaseToSchedule(dbRecord: any): Promise<PaymentSchedule> {
    // Decrypt all sensitive fields
    const familyId = await decryptSensitiveData({
      encrypted: dbRecord.encrypted_family_id,
      salt: dbRecord.family_salt,
      iv: dbRecord.family_iv,
      tag: dbRecord.family_tag,
    });

    const familyMemberId = await decryptSensitiveData({
      encrypted: dbRecord.encrypted_family_member_id,
      salt: dbRecord.member_salt,
      iv: dbRecord.member_iv,
      tag: dbRecord.member_tag,
    });

    const memberName = await decryptSensitiveData({
      encrypted: dbRecord.encrypted_member_name,
      salt: dbRecord.member_name_salt,
      iv: dbRecord.member_name_iv,
      tag: dbRecord.member_name_tag,
    });

    const amount = parseInt(
      await decryptSensitiveData({
        encrypted: dbRecord.encrypted_amount,
        salt: dbRecord.amount_salt,
        iv: dbRecord.amount_iv,
        tag: dbRecord.amount_tag,
      })
    );

    const conditions = JSON.parse(
      await decryptSensitiveData({
        encrypted: dbRecord.encrypted_conditions,
        salt: dbRecord.conditions_salt,
        iv: dbRecord.conditions_iv,
        tag: dbRecord.conditions_tag,
      })
    );

    const autoApprovalLimit = parseInt(
      await decryptSensitiveData({
        encrypted: dbRecord.encrypted_auto_approval_limit,
        salt: dbRecord.approval_limit_salt,
        iv: dbRecord.approval_limit_iv,
        tag: dbRecord.approval_limit_tag,
      })
    );

    // Decrypt notification settings if available
    let notificationSettings = {
      notifyOnDistribution: true,
      notifyOnFailure: true,
      notifyOnSuspiciousActivity: true,
      notificationMethods: ["email"] as (
        | "email"
        | "sms"
        | "push"
        | "nostr_dm"
      )[],
    };

    if (dbRecord.encrypted_notification_settings) {
      try {
        notificationSettings = JSON.parse(
          await decryptSensitiveData({
            encrypted: dbRecord.encrypted_notification_settings,
            salt: dbRecord.notification_salt,
            iv: dbRecord.notification_iv,
            tag: dbRecord.notification_tag,
          })
        );
      } catch (error) {
        console.warn("Failed to decrypt notification settings, using defaults");
      }
    }

    let distributionCount = 0;
    let totalDistributed = 0;

    try {
      distributionCount = parseInt(
        await decryptSensitiveData({
          encrypted: dbRecord.encrypted_distribution_count,
          salt: dbRecord.count_salt,
          iv: dbRecord.count_iv,
          tag: dbRecord.count_tag,
        })
      );

      totalDistributed = parseInt(
        await decryptSensitiveData({
          encrypted: dbRecord.encrypted_total_distributed,
          salt: dbRecord.total_salt,
          iv: dbRecord.total_iv,
          tag: dbRecord.total_tag,
        })
      );
    } catch (error) {
      console.warn("Failed to decrypt counters, using defaults");
    }

    return {
      id: dbRecord.schedule_uuid,
      familyId,
      familyMemberId,
      memberName,
      amount,
      frequency: dbRecord.frequency,
      dayOfWeek: dbRecord.day_of_week,
      dayOfMonth: dbRecord.day_of_month,
      enabled: dbRecord.enabled,
      nextDistribution: new Date(dbRecord.next_distribution),
      lastDistribution: dbRecord.last_distribution
        ? new Date(dbRecord.last_distribution)
        : undefined,
      distributionCount,
      totalDistributed,
      conditions,
      autoApprovalLimit,
      parentApprovalRequired: dbRecord.parent_approval_required,
      preferredMethod: dbRecord.preferred_method || "auto",
      maxRetries: dbRecord.max_retries || 3,
      retryDelay: dbRecord.retry_delay || 30,
      notificationSettings,
      createdAt: new Date(dbRecord.created_at),
      updatedAt: new Date(dbRecord.updated_at),
    };
  }

  private async performPreDistributionChecks(
    schedule: PaymentSchedule
  ): Promise<{
    canProceed: boolean;
    requiresApproval: boolean;
    reason?: string;
  }> {
    // Mock implementation for pre-distribution checks
    const riskScore = Math.random();

    if (riskScore > 0.8) {
      return {
        canProceed: false,
        requiresApproval: true,
        reason: "High risk score detected",
      };
    }

    if (schedule.amount > schedule.autoApprovalLimit) {
      return {
        canProceed: false,
        requiresApproval: true,
        reason: "Amount exceeds auto-approval limit",
      };
    }

    return { canProceed: true, requiresApproval: false };
  }

  private async createApprovalRequest(
    schedule: PaymentSchedule,
    reason?: string
  ): Promise<void> {
    // Mock implementation for creating approval requests
    console.log(
      `📋 Approval request created for ${schedule.memberName}: ${reason}`
    );
  }

  private async sendNotification(
    schedule: PaymentSchedule,
    type: string,
    data: any
  ): Promise<void> {
    // Mock implementation for sending notifications
    console.log(
      `📨 Notification sent for ${schedule.memberName}: ${type}`,
      data
    );
  }

  private async checkFamilyLiquidity(
    familyId: string
  ): Promise<{ availableBalance: number }> {
    // Mock implementation
    return { availableBalance: Math.random() * 1000000 };
  }

  private async getMemberPubkey(memberId: string): Promise<string> {
    // Mock implementation
    return "02" + "a".repeat(62);
  }

  private async storeEncryptedDistribution(
    distribution: PaymentDistribution
  ): Promise<void> {
    // Mock implementation for storing encrypted distribution records
    console.log(`💾 Stored encrypted distribution record: ${distribution.id}`);
  }

  private async updateNextDistribution(
    scheduleId: string,
    frequency: string,
    dayOfWeek?: number,
    dayOfMonth?: number
  ): Promise<void> {
    const nextDistribution = this.calculateNextDistribution(
      frequency,
      dayOfWeek,
      dayOfMonth
    );

    await supabase
      .from("secure_payment_schedules")
      .update({
        next_distribution: nextDistribution.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("schedule_uuid", scheduleId);
  }

  /**
   * Cleanup resources when shutting down
   */
  async shutdown(): Promise<void> {
    try {
      console.log("🛑 Shutting down Payment Automation System...");

      // Stop all cron jobs
      for (const [name, job] of this.scheduledJobs) {
        job.stop();
        console.log(`⏰ Stopped cron job: ${name}`);
      }
      this.scheduledJobs.clear();

      console.log("✅ Payment Automation System shutdown complete");
    } catch (error) {
      console.error("❌ Error during payment system shutdown:", error);
    }
  }
}
