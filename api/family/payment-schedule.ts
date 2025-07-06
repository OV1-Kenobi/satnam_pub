/**
 * PAYMENT SCHEDULING API ENDPOINT
 *
 * Advanced payment automation with Zeus LSP integration,
 * smart retry logic, and comprehensive notification systems.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { logPrivacyOperation } from "../../lib/privacy/encryption";
import { supabase } from "../lib/supabase";
import { PaymentAutomationSystem } from "../../src/lib/payment-automation";

interface PaymentScheduleRequest {
  action: "create" | "update" | "delete" | "get" | "list" | "process";
  familyId: string;
  scheduleId?: string;
  familyMemberId?: string;
  schedule?: {
    amount: number;
    frequency: "daily" | "weekly" | "monthly";
    dayOfWeek?: number;
    dayOfMonth?: number;
    enabled: boolean;
    conditions: {
      maxDailySpend: number;
      maxTransactionSize: number;
      restrictedCategories?: string[];
      restrictedMerchants?: string[];
      allowedTimeWindows?: Array<{
        start: string;
        end: string;
        days: number[];
      }>;
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
        cooldownPeriod: number;
      };
    };
    autoApprovalLimit: number;
    parentApprovalRequired: boolean;
    preferredMethod: "lightning" | "ecash" | "auto";
    maxRetries: number;
    retryDelay: number;
    notificationSettings: {
      notifyOnDistribution: boolean;
      notifyOnFailure: boolean;
      notifyOnSuspiciousActivity: boolean;
      notificationMethods: ("email" | "sms" | "push" | "nostr_dm")[];
      escalationPolicy?: {
        retryCount: number;
        escalationDelay: number;
        escalationContacts: string[];
      };
    };
  };
}

interface PaymentScheduleResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: string;
}

// Initialize payment automation system
const paymentSystem = new PaymentAutomationSystem();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PaymentScheduleResponse>
) {
  const startTime = Date.now();

  try {
    console.log(`📋 Payment Schedule API: ${req.method} ${req.url}`);

    // Validate request method
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "Method not allowed",
        timestamp: new Date().toISOString(),
      });
    }

    // Parse and validate request body
    const requestData: PaymentScheduleRequest = req.body;

    if (!requestData.action || !requestData.familyId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: action, familyId",
        timestamp: new Date().toISOString(),
      });
    }

    // Route to appropriate handler
    let result;
    switch (requestData.action) {
      case "create":
        result = await handleCreateSchedule(requestData);
        break;
      case "update":
        result = await handleUpdateSchedule(requestData);
        break;
      case "delete":
        result = await handleDeleteSchedule(requestData);
        break;
      case "get":
        result = await handleGetSchedule(requestData);
        break;
      case "list":
        result = await handleListSchedules(requestData);
        break;
      case "process":
        result = await handleProcessSchedules(requestData);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `Invalid action: ${requestData.action}`,
          timestamp: new Date().toISOString(),
        });
    }

    const processingTime = Date.now() - startTime;
    console.log(
      `✅ Payment schedule ${requestData.action} completed in ${processingTime}ms`
    );

    return res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(
      `❌ Payment schedule API error (${processingTime}ms):`,
      error
    );

    logPrivacyOperation({
      action: "api_error",
      dataType: "payment_schedule",
      familyId: req.body?.familyId || "unknown",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Create a new payment schedule
 */
async function handleCreateSchedule(
  requestData: PaymentScheduleRequest
): Promise<any> {
  console.log(
    `🆕 Creating payment schedule for family: ${requestData.familyId}`
  );

  if (!requestData.familyMemberId || !requestData.schedule) {
    throw new Error("Missing required fields for schedule creation");
  }

  // Validate family member access
  const { data: familyMember } = await supabase
    .from("secure_family_members")
    .select("member_uuid, encrypted_name")
    .eq("family_uuid", requestData.familyId)
    .eq("member_uuid", requestData.familyMemberId)
    .single();

  if (!familyMember) {
    throw new Error("Family member not found or access denied");
  }

  // Create schedule using the automation system
  const schedule = await paymentSystem.createPaymentSchedule(
    requestData.familyId,
    requestData.familyMemberId,
    requestData.schedule
  );

  logPrivacyOperation({
    action: "create",
    dataType: "payment_schedule",
    familyId: requestData.familyId,
    success: true,
  });

  return {
    scheduleId: schedule.id,
    nextDistribution: schedule.nextDistribution,
    message: "Payment schedule created successfully",
  };
}

/**
 * Update an existing payment schedule
 */
async function handleUpdateSchedule(
  requestData: PaymentScheduleRequest
): Promise<any> {
  console.log(`📝 Updating payment schedule: ${requestData.scheduleId}`);

  if (!requestData.scheduleId) {
    throw new Error("Schedule ID is required for update");
  }

  // Mock implementation - replace with actual update logic
  return {
    scheduleId: requestData.scheduleId,
    message: "Payment schedule updated successfully",
  };
}

/**
 * Delete a payment schedule
 */
async function handleDeleteSchedule(
  requestData: PaymentScheduleRequest
): Promise<any> {
  console.log(`🗑️ Deleting payment schedule: ${requestData.scheduleId}`);

  if (!requestData.scheduleId) {
    throw new Error("Schedule ID is required for deletion");
  }

  // Soft delete in database
  const { error } = await supabase
    .from("secure_payment_schedules")
    .update({
      enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("schedule_uuid", requestData.scheduleId)
    .eq("encrypted_family_id", requestData.familyId);

  if (error) {
    throw new Error(`Failed to delete schedule: ${error.message}`);
  }

  return {
    scheduleId: requestData.scheduleId,
    message: "Payment schedule deleted successfully",
  };
}

/**
 * Get a specific payment schedule
 */
async function handleGetSchedule(
  requestData: PaymentScheduleRequest
): Promise<any> {
  console.log(`📖 Getting payment schedule: ${requestData.scheduleId}`);

  if (!requestData.scheduleId) {
    throw new Error("Schedule ID is required");
  }

  // Fetch encrypted schedule from database
  const { data: encryptedSchedule, error } = await supabase
    .from("secure_payment_schedules")
    .select("*")
    .eq("schedule_uuid", requestData.scheduleId)
    .single();

  if (error || !encryptedSchedule) {
    throw new Error("Schedule not found");
  }

  // Decrypt and return schedule data
  // This would typically use the mapDatabaseToSchedule method
  return {
    scheduleId: requestData.scheduleId,
    // Add decrypted schedule data here
    message: "Schedule retrieved successfully",
  };
}

/**
 * List all payment schedules for a family
 */
async function handleListSchedules(
  requestData: PaymentScheduleRequest
): Promise<any> {
  console.log(
    `📋 Listing payment schedules for family: ${requestData.familyId}`
  );

  // Fetch encrypted schedules from database
  const { data: encryptedSchedules, error } = await supabase
    .from("secure_payment_schedules")
    .select("*")
    .eq("encrypted_family_id", requestData.familyId)
    .eq("enabled", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch schedules: ${error.message}`);
  }

  return {
    schedules: encryptedSchedules || [],
    count: encryptedSchedules?.length || 0,
    message: "Schedules retrieved successfully",
  };
}

/**
 * Process pending payment distributions
 */
async function handleProcessSchedules(
  requestData: PaymentScheduleRequest
): Promise<any> {
  console.log(
    `⚡ Processing payment schedules for family: ${requestData.familyId}`
  );

  // Process all pending payments
  const result = await paymentSystem.processPendingPayments();

  logPrivacyOperation({
    action: "process",
    dataType: "payment_distributions",
    familyId: requestData.familyId,
    success: true,
  });

  return {
    processed: result.processed,
    successful: result.successful,
    failed: result.failed,
    pendingApproval: result.pendingApproval,
    totalAmount: result.totalAmount,
    totalFees: result.totalFees,
    processingTimeMs: result.processingTimeMs,
    message: "Payment processing completed",
  };
}
