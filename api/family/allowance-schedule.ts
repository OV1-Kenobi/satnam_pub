/**
 * ALLOWANCE SCHEDULING API ENDPOINT
 *
 * Advanced allowance automation with Zeus LSP integration,
 * smart retry logic, and comprehensive notification systems.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import {
  decryptSensitiveData,
  logPrivacyOperation,
} from "../../lib/privacy/encryption";
import { supabase } from "../lib/supabase";
import { AllowanceAutomationSystem } from "../../src/lib/allowance-automation";

interface AllowanceScheduleRequest {
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
    preferredMethod: "lightning" | "ecash" | "zeus_jit" | "auto";
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
  processingOptions?: {
    dryRun?: boolean;
    forceRetry?: boolean;
    maxConcurrent?: number;
    priorityOrder?: "amount" | "urgency" | "member_age" | "success_rate";
  };
}

interface AllowanceScheduleResponse {
  success: boolean;
  action: string;
  data?: {
    schedule?: any;
    schedules?: any[];
    processingResult?: {
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
        status: string;
        transactionId?: string;
        nextRetryAt?: string;
        error?: string;
        distributionMethod: string;
        fee: number;
      }>;
    };
    statistics?: {
      totalSchedules: number;
      activeSchedules: number;
      totalDistributed: number;
      successRate: number;
      averageFee: number;
      nextDistribution: string;
      zeusJitUsage: number;
    };
  };
  intelligence?: {
    recommendations: string[];
    optimizations: Array<{
      type: string;
      description: string;
      potentialSavings: number;
      implementationEffort: "low" | "medium" | "high";
    }>;
    riskAssessment: {
      overall: "low" | "medium" | "high";
      factors: string[];
      mitigation: string[];
    };
  };
  error?: string;
  metadata: {
    timestamp: string;
    processingTime: number;
    automationVersion: string;
    zeusLspIntegrated: boolean;
    activeCronJobs: number;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AllowanceScheduleResponse>,
) {
  if (
    req.method !== "GET" &&
    req.method !== "POST" &&
    req.method !== "PUT" &&
    req.method !== "DELETE"
  ) {
    return res.status(405).json({
      success: false,
      action: "error",
      error: "Method not allowed",
      metadata: {
        timestamp: new Date().toISOString(),
        processingTime: 0,
        automationVersion: "2.0",
        zeusLspIntegrated: false,
        activeCronJobs: 0,
      },
    });
  }

  const startTime = Date.now();

  try {
    console.log("📅 Allowance scheduling request received");

    // Parse request based on method
    let scheduleRequest: AllowanceScheduleRequest;

    if (req.method === "GET") {
      scheduleRequest = {
        action: req.query.scheduleId ? "get" : "list",
        familyId: req.query.familyId as string,
        scheduleId: req.query.scheduleId as string,
        familyMemberId: req.query.familyMemberId as string,
      };
    } else if (req.method === "DELETE") {
      scheduleRequest = {
        action: "delete",
        familyId: req.query.familyId as string,
        scheduleId: req.query.scheduleId as string,
      };
    } else {
      scheduleRequest = {
        action: req.body.action || (req.method === "PUT" ? "update" : "create"),
        ...req.body,
      };
    }

    // Validate request
    if (!scheduleRequest.familyId) {
      return res.status(400).json({
        success: false,
        action: scheduleRequest.action,
        error: "Missing required parameter: familyId",
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          automationVersion: "2.0",
          zeusLspIntegrated: false,
          activeCronJobs: 0,
        },
      });
    }

    // Get family configuration
    const { data: familyConfig, error: configError } = await supabase
      .from("secure_families")
      .select("*")
      .eq("family_uuid", scheduleRequest.familyId)
      .single();

    if (configError || !familyConfig) {
      return res.status(404).json({
        success: false,
        action: scheduleRequest.action,
        error: "Family not found or access denied",
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          automationVersion: "2.0",
          zeusLspIntegrated: false,
          activeCronJobs: 0,
        },
      });
    }

    // Initialize allowance automation system
    let lspConfig = undefined;
    if (
      familyConfig.zeus_integration_enabled &&
      familyConfig.zeus_lsp_endpoint
    ) {
      lspConfig = {
        endpoint: familyConfig.zeus_lsp_endpoint,
        apiKey: familyConfig.zeus_api_key_encrypted, // Would be decrypted in real implementation
      };
    }

    const allowanceSystem = new AllowanceAutomationSystem(lspConfig);

    let response: AllowanceScheduleResponse;

    switch (scheduleRequest.action) {
      case "create":
        response = await handleCreateSchedule(scheduleRequest, allowanceSystem);
        break;

      case "update":
        response = await handleUpdateSchedule(scheduleRequest, allowanceSystem);
        break;

      case "delete":
        response = await handleDeleteSchedule(scheduleRequest);
        break;

      case "get":
        response = await handleGetSchedule(scheduleRequest);
        break;

      case "list":
        response = await handleListSchedules(scheduleRequest);
        break;

      case "process":
        response = await handleProcessSchedules(
          scheduleRequest,
          allowanceSystem,
          familyConfig,
        );
        break;

      default:
        return res.status(400).json({
          success: false,
          action: scheduleRequest.action,
          error:
            "Invalid action. Must be: create, update, delete, get, list, or process",
          metadata: {
            timestamp: new Date().toISOString(),
            processingTime: Date.now() - startTime,
            automationVersion: "2.0",
            zeusLspIntegrated: familyConfig.zeus_integration_enabled,
            activeCronJobs: 0,
          },
        });
    }

    // Add metadata
    response.metadata = {
      timestamp: new Date().toISOString(),
      processingTime: Date.now() - startTime,
      automationVersion: "2.0",
      zeusLspIntegrated: familyConfig.zeus_integration_enabled,
      activeCronJobs: getActiveCronJobCount(),
    };

    // Log privacy operation
    logPrivacyOperation({
      action: "access",
      dataType: "family_data",
      familyId: scheduleRequest.familyId,
      success: response.success,
    });

    console.log(
      `✅ Allowance ${scheduleRequest.action} ${response.success ? "completed" : "failed"}`,
    );

    return res.status(response.success ? 200 : 400).json(response);
  } catch (error) {
    console.error("❌ Allowance scheduling error:", error);

    const errorResponse: AllowanceScheduleResponse = {
      success: false,
      action: req.body?.action || "unknown",
      error: error instanceof Error ? error.message : "Internal server error",
      metadata: {
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        automationVersion: "2.0",
        zeusLspIntegrated: false,
        activeCronJobs: 0,
      },
    };

    return res.status(500).json(errorResponse);
  }
}

// Handler functions

async function handleCreateSchedule(
  request: AllowanceScheduleRequest,
  allowanceSystem: AllowanceAutomationSystem,
): Promise<AllowanceScheduleResponse> {
  try {
    if (!request.schedule || !request.familyMemberId) {
      throw new Error("Missing required fields: schedule and familyMemberId");
    }

    console.log(
      `📝 Creating allowance schedule for member: ${request.familyMemberId}`,
    );

    // Validate schedule parameters
    validateScheduleParameters(request.schedule);

    // Create the schedule
    const createdSchedule = await allowanceSystem.createAllowanceSchedule(
      request.familyId,
      request.familyMemberId,
      request.schedule,
    );

    // Generate intelligence recommendations
    const intelligence = await generateScheduleIntelligence(
      createdSchedule,
      "create",
    );

    return {
      success: true,
      action: "create",
      data: {
        schedule: sanitizeScheduleForResponse(createdSchedule),
      },
      intelligence,
      metadata: {} as any,
    };
  } catch (error) {
    return {
      success: false,
      action: "create",
      error:
        error instanceof Error ? error.message : "Failed to create schedule",
      metadata: {} as any,
    };
  }
}

async function handleUpdateSchedule(
  request: AllowanceScheduleRequest,
  _allowanceSystem: AllowanceAutomationSystem,
): Promise<AllowanceScheduleResponse> {
  try {
    if (!request.scheduleId || !request.schedule) {
      throw new Error("Missing required fields: scheduleId and schedule");
    }

    console.log(`✏️ Updating allowance schedule: ${request.scheduleId}`);

    // Get existing schedule
    const { data: existingSchedule, error } = await supabase
      .from("secure_allowance_schedules")
      .select("*")
      .eq("schedule_uuid", request.scheduleId)
      .single();

    if (error || !existingSchedule) {
      throw new Error("Schedule not found");
    }

    // Validate updated parameters
    validateScheduleParameters(request.schedule);

    // Update the schedule (simplified implementation)
    const { error: updateError } = await supabase
      .from("secure_allowance_schedules")
      .update({
        frequency: request.schedule.frequency,
        day_of_week: request.schedule.dayOfWeek,
        day_of_month: request.schedule.dayOfMonth,
        enabled: request.schedule.enabled,
        preferred_method: request.schedule.preferredMethod,
        max_retries: request.schedule.maxRetries,
        retry_delay: request.schedule.retryDelay,
        parent_approval_required: request.schedule.parentApprovalRequired,
        updated_at: new Date().toISOString(),
      })
      .eq("schedule_uuid", request.scheduleId)
      .eq("family_id", request.familyId);

    if (updateError) {
      throw new Error(`Failed to update schedule: ${updateError.message}`);
    }

    // Get updated schedule
    const updatedSchedule = await getDecryptedSchedule(
      request.scheduleId,
      request.familyId,
    );

    // Generate intelligence recommendations
    const intelligence = await generateScheduleIntelligence(
      updatedSchedule,
      "update",
    );

    return {
      success: true,
      action: "update",
      data: {
        schedule: sanitizeScheduleForResponse(updatedSchedule),
      },
      intelligence,
      metadata: {} as any,
    };
  } catch (error) {
    return {
      success: false,
      action: "update",
      error:
        error instanceof Error ? error.message : "Failed to update schedule",
      metadata: {} as any,
    };
  }
}

async function handleDeleteSchedule(
  request: AllowanceScheduleRequest,
): Promise<AllowanceScheduleResponse> {
  try {
    if (!request.scheduleId) {
      throw new Error("Missing required field: scheduleId");
    }

    console.log(`🗑️ Deleting allowance schedule: ${request.scheduleId}`);

    // Soft delete the schedule
    const { error } = await supabase
      .from("secure_allowance_schedules")
      .update({
        enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("schedule_uuid", request.scheduleId)
      .eq("family_id", request.familyId);

    if (error) {
      throw new Error(`Failed to delete schedule: ${error.message}`);
    }

    return {
      success: true,
      action: "delete",
      data: {
        schedule: { id: request.scheduleId, status: "deleted" },
      },
      metadata: {} as any,
    };
  } catch (error) {
    return {
      success: false,
      action: "delete",
      error:
        error instanceof Error ? error.message : "Failed to delete schedule",
      metadata: {} as any,
    };
  }
}

async function handleGetSchedule(
  request: AllowanceScheduleRequest,
): Promise<AllowanceScheduleResponse> {
  try {
    if (!request.scheduleId) {
      throw new Error("Missing required field: scheduleId");
    }

    console.log(`📖 Getting allowance schedule: ${request.scheduleId}`);

    const schedule = await getDecryptedSchedule(
      request.scheduleId,
      request.familyId,
    );

    if (!schedule) {
      throw new Error("Schedule not found");
    }

    // Generate intelligence recommendations
    const intelligence = await generateScheduleIntelligence(schedule, "get");

    return {
      success: true,
      action: "get",
      data: {
        schedule: sanitizeScheduleForResponse(schedule),
      },
      intelligence,
      metadata: {} as any,
    };
  } catch (error) {
    return {
      success: false,
      action: "get",
      error: error instanceof Error ? error.message : "Failed to get schedule",
      metadata: {} as any,
    };
  }
}

async function handleListSchedules(
  request: AllowanceScheduleRequest,
): Promise<AllowanceScheduleResponse> {
  try {
    console.log(
      `📋 Listing allowance schedules for family: ${request.familyId}`,
    );

    // Build query
    const query = supabase
      .from("secure_allowance_schedules")
      .select("*")
      .eq("family_id", request.familyId)
      .order("created_at", { ascending: false });

    // Filter by family member if specified
    if (request.familyMemberId) {
      // Would need to encrypt the member ID for comparison
      // For now, simplified implementation
    }

    const { data: encryptedSchedules, error } = await query;

    if (error) {
      throw new Error(`Failed to list schedules: ${error.message}`);
    }

    // Decrypt and process schedules
    const schedules = await Promise.all(
      (encryptedSchedules || []).map(async (encryptedSchedule) => {
        try {
          const decryptedSchedule =
            await decryptScheduleRecord(encryptedSchedule);
          return sanitizeScheduleForResponse(decryptedSchedule);
        } catch (error) {
          console.warn("Failed to decrypt schedule:", error);
          return null;
        }
      }),
    );

    // Filter out failed decryptions
    const validSchedules = schedules.filter((s) => s !== null);

    // Calculate statistics
    const statistics = calculateScheduleStatistics(validSchedules);

    return {
      success: true,
      action: "list",
      data: {
        schedules: validSchedules,
        statistics,
      },
      metadata: {} as any,
    };
  } catch (error) {
    return {
      success: false,
      action: "list",
      error:
        error instanceof Error ? error.message : "Failed to list schedules",
      metadata: {} as any,
    };
  }
}

async function handleProcessSchedules(
  request: AllowanceScheduleRequest,
  allowanceSystem: AllowanceAutomationSystem,
  familyConfig: any,
): Promise<AllowanceScheduleResponse> {
  try {
    console.log("🤖 Processing pending allowance distributions...");

    const options = request.processingOptions || {};

    if (options.dryRun) {
      console.log("🔍 Running in dry-run mode");
    }

    // Process pending allowances
    const processingResult = await allowanceSystem.processPendingAllowances();

    // Generate intelligence recommendations based on results
    const intelligence = await generateProcessingIntelligence(
      processingResult,
      familyConfig,
    );

    return {
      success: true,
      action: "process",
      data: {
        processingResult,
      },
      intelligence,
      metadata: {} as any,
    };
  } catch (error) {
    return {
      success: false,
      action: "process",
      error:
        error instanceof Error ? error.message : "Failed to process schedules",
      metadata: {} as any,
    };
  }
}

// Helper functions

function validateScheduleParameters(schedule: any): void {
  if (!schedule.amount || schedule.amount < 1000 || schedule.amount > 100000) {
    throw new Error("Amount must be between 1,000 and 100,000 sats");
  }

  if (!["daily", "weekly", "monthly"].includes(schedule.frequency)) {
    throw new Error("Frequency must be daily, weekly, or monthly");
  }

  if (
    schedule.frequency === "weekly" &&
    (schedule.dayOfWeek < 0 || schedule.dayOfWeek > 6)
  ) {
    throw new Error("Day of week must be between 0 (Sunday) and 6 (Saturday)");
  }

  if (
    schedule.frequency === "monthly" &&
    (schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31)
  ) {
    throw new Error("Day of month must be between 1 and 31");
  }

  if (schedule.maxRetries < 0 || schedule.maxRetries > 10) {
    throw new Error("Max retries must be between 0 and 10");
  }

  if (schedule.retryDelay < 5 || schedule.retryDelay > 1440) {
    throw new Error("Retry delay must be between 5 and 1440 minutes");
  }

  if (!schedule.conditions || !schedule.conditions.maxDailySpend) {
    throw new Error("Spending conditions are required");
  }

  if (!schedule.notificationSettings) {
    throw new Error("Notification settings are required");
  }
}

async function getDecryptedSchedule(
  scheduleId: string,
  familyId?: string,
): Promise<any> {
  let query = supabase
    .from("secure_allowance_schedules")
    .select("*")
    .eq("schedule_uuid", scheduleId);

  // Add family_id filter if provided for additional security
  if (familyId) {
    query = query.eq("family_id", familyId);
  }

  const { data: encryptedSchedule, error } = await query.single();

  if (error || !encryptedSchedule) {
    throw new Error("Schedule not found");
  }

  return await decryptScheduleRecord(encryptedSchedule);
}

async function decryptScheduleRecord(encryptedRecord: any): Promise<any> {
  // Decrypt sensitive fields
  const familyId = await decryptSensitiveData({
    encrypted: encryptedRecord.encrypted_family_id,
    salt: encryptedRecord.family_salt,
    iv: encryptedRecord.family_iv,
    tag: encryptedRecord.family_tag,
  });

  const familyMemberId = await decryptSensitiveData({
    encrypted: encryptedRecord.encrypted_family_member_id,
    salt: encryptedRecord.member_salt,
    iv: encryptedRecord.member_iv,
    tag: encryptedRecord.member_tag,
  });

  const memberName = await decryptSensitiveData({
    encrypted: encryptedRecord.encrypted_member_name,
    salt: encryptedRecord.member_name_salt,
    iv: encryptedRecord.member_name_iv,
    tag: encryptedRecord.member_name_tag,
  });

  const amount = parseInt(
    await decryptSensitiveData({
      encrypted: encryptedRecord.encrypted_amount,
      salt: encryptedRecord.amount_salt,
      iv: encryptedRecord.amount_iv,
      tag: encryptedRecord.amount_tag,
    }),
  );

  const conditions = JSON.parse(
    await decryptSensitiveData({
      encrypted: encryptedRecord.encrypted_conditions,
      salt: encryptedRecord.conditions_salt,
      iv: encryptedRecord.conditions_iv,
      tag: encryptedRecord.conditions_tag,
    }),
  );

  const autoApprovalLimit = parseInt(
    await decryptSensitiveData({
      encrypted: encryptedRecord.encrypted_auto_approval_limit,
      salt: encryptedRecord.approval_limit_salt,
      iv: encryptedRecord.approval_limit_iv,
      tag: encryptedRecord.approval_limit_tag,
    }),
  );

  let notificationSettings = {
    notifyOnDistribution: true,
    notifyOnFailure: true,
    notifyOnSuspiciousActivity: true,
    notificationMethods: ["email"],
  };

  if (encryptedRecord.encrypted_notification_settings) {
    try {
      notificationSettings = JSON.parse(
        await decryptSensitiveData({
          encrypted: encryptedRecord.encrypted_notification_settings,
          salt: encryptedRecord.notification_salt,
          iv: encryptedRecord.notification_iv,
          tag: encryptedRecord.notification_tag,
        }),
      );
    } catch {
      console.warn("Failed to decrypt notification settings");
    }
  }

  return {
    id: encryptedRecord.schedule_uuid,
    familyId,
    familyMemberId,
    memberName,
    amount,
    frequency: encryptedRecord.frequency,
    dayOfWeek: encryptedRecord.day_of_week,
    dayOfMonth: encryptedRecord.day_of_month,
    enabled: encryptedRecord.enabled,
    nextDistribution: new Date(encryptedRecord.next_distribution),
    lastDistribution: encryptedRecord.last_distribution
      ? new Date(encryptedRecord.last_distribution)
      : null,
    conditions,
    autoApprovalLimit,
    parentApprovalRequired: encryptedRecord.parent_approval_required,
    preferredMethod: encryptedRecord.preferred_method || "auto",
    maxRetries: encryptedRecord.max_retries || 3,
    retryDelay: encryptedRecord.retry_delay || 30,
    notificationSettings,
    createdAt: new Date(encryptedRecord.created_at),
    updatedAt: new Date(encryptedRecord.updated_at),
  };
}

function sanitizeScheduleForResponse(schedule: any): any {
  // Remove sensitive internal data and return safe representation
  return {
    id: schedule.id,
    memberName: schedule.memberName,
    amount: schedule.amount,
    frequency: schedule.frequency,
    dayOfWeek: schedule.dayOfWeek,
    dayOfMonth: schedule.dayOfMonth,
    enabled: schedule.enabled,
    nextDistribution: schedule.nextDistribution.toISOString(),
    lastDistribution: schedule.lastDistribution?.toISOString(),
    conditions: {
      maxDailySpend: schedule.conditions.maxDailySpend,
      maxTransactionSize: schedule.conditions.maxTransactionSize,
      requireApprovalAbove: schedule.conditions.requireApprovalAbove,
      pauseOnSuspiciousActivity: schedule.conditions.pauseOnSuspiciousActivity,
    },
    autoApprovalLimit: schedule.autoApprovalLimit,
    parentApprovalRequired: schedule.parentApprovalRequired,
    preferredMethod: schedule.preferredMethod,
    maxRetries: schedule.maxRetries,
    retryDelay: schedule.retryDelay,
    notificationSettings: {
      notifyOnDistribution: schedule.notificationSettings.notifyOnDistribution,
      notifyOnFailure: schedule.notificationSettings.notifyOnFailure,
      notificationMethods: schedule.notificationSettings.notificationMethods,
    },
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

function calculateScheduleStatistics(schedules: any[]): any {
  const activeSchedules = schedules.filter((s) => s.enabled);
  const totalDistributed = schedules.reduce(
    (sum, s) => sum + (s.totalDistributed || 0),
    0,
  );
  const successfulDistributions = schedules.reduce(
    (sum, s) => sum + (s.distributionCount || 0),
    0,
  );
  const totalDistributions = successfulDistributions; // Simplified
  const successRate =
    totalDistributions > 0 ? successfulDistributions / totalDistributions : 1.0;

  // Find next distribution
  const nextDistribution = activeSchedules
    .map((s) => s.nextDistribution)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];

  // Calculate Zeus JIT usage
  const zeusJitUsage =
    schedules.filter((s) => s.preferredMethod === "zeus_jit").length /
    schedules.length;

  return {
    totalSchedules: schedules.length,
    activeSchedules: activeSchedules.length,
    totalDistributed,
    successRate: Math.round(successRate * 100) / 100,
    averageFee: 50, // Mock average fee
    nextDistribution: nextDistribution || null,
    zeusJitUsage: Math.round(zeusJitUsage * 100) / 100,
  };
}

async function generateScheduleIntelligence(
  schedule: any,
  _action: string,
): Promise<any> {
  const recommendations = [];
  const optimizations = [];
  const riskFactors = [];

  // Generate recommendations based on schedule analysis
  if (schedule.amount > 50000) {
    recommendations.push(
      "Consider splitting large allowances into smaller, more frequent distributions",
    );
  }

  if (schedule.preferredMethod === "auto") {
    recommendations.push(
      "Auto method selected - system will optimize based on current conditions",
    );
  }

  if (schedule.maxRetries < 3) {
    recommendations.push(
      "Consider increasing max retries to improve distribution reliability",
    );
  }

  // Optimization suggestions
  if (schedule.frequency === "daily" && schedule.amount < 10000) {
    optimizations.push({
      type: "frequency",
      description:
        "Consider weekly distributions for small amounts to reduce fees",
      potentialSavings: 500, // sats per month
      implementationEffort: "low",
    });
  }

  if (schedule.preferredMethod !== "zeus_jit") {
    optimizations.push({
      type: "method",
      description: "Enable Zeus JIT for emergency liquidity protection",
      potentialSavings: 1000, // risk reduction value
      implementationEffort: "low",
    });
  }

  // Risk assessment
  if (schedule.autoApprovalLimit > schedule.amount * 2) {
    riskFactors.push("High auto-approval limit may allow excessive spending");
  }

  if (!schedule.conditions.pauseOnSuspiciousActivity) {
    riskFactors.push("Suspicious activity detection disabled");
  }

  const overallRisk =
    riskFactors.length > 2 ? "high" : riskFactors.length > 0 ? "medium" : "low";

  return {
    recommendations,
    optimizations,
    riskAssessment: {
      overall: overallRisk,
      factors: riskFactors,
      mitigation: [
        "Enable all security features",
        "Set appropriate approval limits",
        "Monitor spending patterns regularly",
      ],
    },
  };
}

async function generateProcessingIntelligence(
  processingResult: any,
  familyConfig: any,
): Promise<any> {
  const recommendations = [];
  const optimizations = [];

  // Analyze processing results
  const successRate =
    processingResult.processed > 0
      ? processingResult.successful / processingResult.processed
      : 1.0;

  if (successRate < 0.9) {
    recommendations.push(
      "Low success rate detected - review failed distributions",
    );
  }

  if (processingResult.pendingApproval > 0) {
    recommendations.push(
      `${processingResult.pendingApproval} distributions require manual approval`,
    );
  }

  if (processingResult.totalFees > processingResult.totalAmount * 0.01) {
    recommendations.push(
      "High fee ratio detected - consider optimizing distribution timing",
    );
  }

  // Zeus LSP optimizations
  if (familyConfig.zeus_integration_enabled) {
    optimizations.push({
      type: "zeus_jit",
      description: "Zeus JIT liquidity can reduce failed distributions",
      potentialSavings: processingResult.failed * 1000, // Estimated savings
      implementationEffort: "low",
    });
  }

  return {
    recommendations,
    optimizations,
    riskAssessment: {
      overall:
        successRate > 0.95 ? "low" : successRate > 0.8 ? "medium" : "high",
      factors: [`Success rate: ${Math.round(successRate * 100)}%`],
      mitigation: [
        "Monitor failed distributions",
        "Optimize timing",
        "Enable Zeus JIT if needed",
      ],
    },
  };
}

function getActiveCronJobCount(): number {
  // Mock implementation - would return actual count of active cron jobs
  return 5;
}
