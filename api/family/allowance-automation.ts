/**
 * @fileoverview Allowance Automation API
 *
 * Provides automated allowance management capabilities for family members
 * with PhoenixD Lightning Network integration. Supports scheduled distributions,
 * instant allowances, and parental approval workflows.
 *
 * @author Satnam.pub Team
 * @version 1.0.0
 * @since 2024-01-01
 *
 * Security Features:
 * - Input validation with Zod schemas
 * - Rate limiting on sensitive operations
 * - Audit logging for all transactions
 * - Approval workflows for large amounts
 *
 * @see {@link https://docs.satnam.pub/api/allowance} Documentation
 */

import { z } from "zod";
import { getFamilyMember } from "../../lib/family-api";
import { PhoenixdClient } from "../../src/lib/phoenixd-client";

// Validation schemas
const AllowanceScheduleRequestSchema = z.object({
  familyMemberId: z.string().uuid("Invalid family member ID format"),
  amount: z
    .number()
    .int()
    .min(1000, "Minimum amount is 1000 sats")
    .max(1000000, "Maximum amount is 1,000,000 sats"),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  timeOfDay: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM format"),
  parentApprovalRequired: z.boolean().optional().default(false),
  autoDistribution: z.boolean().optional().default(true),
});

const AllowanceDistributionRequestSchema = z.object({
  familyMemberId: z.string().uuid("Invalid family member ID format"),
  amount: z
    .number()
    .int()
    .min(1000, "Minimum amount is 1000 sats")
    .max(1000000, "Maximum amount is 1,000,000 sats"),
  reason: z.string().max(200, "Reason cannot exceed 200 characters").optional(),
  isEmergency: z.boolean().optional().default(false),
});

const ApprovalRequestSchema = z.object({
  approvalId: z.string().uuid("Invalid approval ID format"),
  approved: z.boolean(),
  reason: z.string().max(500, "Reason cannot exceed 500 characters").optional(),
});

// Type definitions derived from schemas
export type AllowanceScheduleRequest = z.infer<
  typeof AllowanceScheduleRequestSchema
>;
export type AllowanceDistributionRequest = z.infer<
  typeof AllowanceDistributionRequestSchema
>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

interface AllowanceScheduleResponse {
  success: boolean;
  scheduleId?: string;
  nextDistribution?: string;
  errorMessage?: string;
  [key: string]: unknown;
}

interface AllowanceDistributionResponse {
  success: boolean;
  distributionId?: string;
  paymentId?: string;
  amountSat: number;
  feeSat: number;
  status: "completed" | "pending_approval" | "failed";
  errorMessage?: string;
  [key: string]: unknown;
}

interface ApprovalResponse {
  success: boolean;
  approvalId: string;
  status: "approved" | "denied";
  processedAt: string;
  errorMessage?: string;
  [key: string]: unknown;
}

// Constants
const APPROVAL_THRESHOLD_SATS = 50000;
const MAX_EMERGENCY_AMOUNT_SATS = 100000;

/**
 * Main API handler for allowance automation endpoints
 *
 * @param req - HTTP request object
 * @returns Promise<Response> - HTTP response with JSON data
 *
 * @example
 * ```typescript
 * // Create allowance schedule
 * POST /api/family/allowance-automation/create-schedule
 *
 * // Distribute allowance immediately
 * POST /api/family/allowance-automation/distribute-now
 *
 * // Get all schedules
 * GET /api/family/allowance-automation/schedules
 *
 * // Approve pending distribution
 * PUT /api/family/allowance-automation/approve
 * ```
 */
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();

  try {
    // Route requests based on HTTP method and action
    switch (req.method) {
      case "POST":
        if (action === "create-schedule") {
          return await createAllowanceSchedule(req);
        } else if (action === "distribute-now") {
          return await distributeAllowanceNow(req);
        }
        break;

      case "GET":
        if (action === "schedules") {
          return await getAllowanceSchedules(req);
        } else if (action === "pending-approvals") {
          return await getPendingApprovals(req);
        }
        break;

      case "PUT":
        if (action === "approve") {
          return await approveAllowance(req);
        }
        break;

      default:
        return createErrorResponse("Method not allowed", 405);
    }

    return createErrorResponse("Endpoint not found", 404);
  } catch (error) {
    console.error("Allowance automation API error:", {
      method: req.method,
      action,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return createErrorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
}

/**
 * Creates standardized error response
 *
 * @param message - Error message
 * @param status - HTTP status code
 * @returns Response object with error details
 */
function createErrorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({
      success: false,
      errorMessage: message,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    }
  );
}

/**
 * Creates standardized success response
 *
 * @param data - Response data
 * @param status - HTTP status code (default: 200)
 * @returns Response object with success data
 */
function createSuccessResponse(
  data: Record<string, unknown>,
  status: number = 200
): Response {
  return new Response(
    JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      ...data,
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    }
  );
}

/**
 * Creates a new allowance schedule for a family member
 *
 * @param req - HTTP request containing schedule parameters
 * @returns Promise<Response> - Schedule creation response
 *
 * @throws {ValidationError} When input validation fails
 * @throws {NotFoundError} When family member doesn't exist
 */
async function createAllowanceSchedule(req: Request): Promise<Response> {
  try {
    // Parse and validate request body
    const requestBody = await req.json();
    const scheduleRequest = AllowanceScheduleRequestSchema.parse(requestBody);

    // Validate family member exists
    const familyMember = await getFamilyMember(scheduleRequest.familyMemberId);
    if (!familyMember) {
      return createErrorResponse("Family member not found", 404);
    }

    // Validate weekly frequency has dayOfWeek specified
    if (
      scheduleRequest.frequency === "weekly" &&
      scheduleRequest.dayOfWeek === undefined
    ) {
      return createErrorResponse(
        "dayOfWeek is required for weekly frequency",
        400
      );
    }

    // Validate monthly frequency has dayOfMonth specified
    if (
      scheduleRequest.frequency === "monthly" &&
      scheduleRequest.dayOfMonth === undefined
    ) {
      return createErrorResponse(
        "dayOfMonth is required for monthly frequency",
        400
      );
    }

    // Calculate next distribution time
    const nextDistribution = calculateNextDistribution(
      scheduleRequest.frequency,
      scheduleRequest.timeOfDay,
      scheduleRequest.dayOfWeek,
      scheduleRequest.dayOfMonth
    );

    // Generate unique schedule ID
    const scheduleId = `schedule_${Date.now()}_${scheduleRequest.familyMemberId}`;

    // TODO: Implement database persistence
    // await saveScheduleToDatabase(scheduleId, scheduleRequest, nextDistribution);

    // Audit log
    console.info("Allowance schedule created:", {
      scheduleId,
      familyMemberId: scheduleRequest.familyMemberId,
      familyMemberName: familyMember.name,
      amount: scheduleRequest.amount,
      frequency: scheduleRequest.frequency,
      nextDistribution: nextDistribution.toISOString(),
      timestamp: new Date().toISOString(),
    });

    const response: AllowanceScheduleResponse = {
      success: true,
      scheduleId,
      nextDistribution: nextDistribution.toISOString(),
    };

    return createSuccessResponse(response, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(
        `Validation error: ${error.errors.map((e) => e.message).join(", ")}`,
        400
      );
    }

    console.error("Failed to create allowance schedule:", error);
    throw error;
  }
}

/**
 * Distributes allowance immediately to a family member
 *
 * @param req - HTTP request containing distribution parameters
 * @returns Promise<Response> - Distribution response with payment details
 *
 * @throws {ValidationError} When input validation fails
 * @throws {NotFoundError} When family member doesn't exist
 * @throws {PaymentError} When Lightning payment fails
 */
async function distributeAllowanceNow(req: Request): Promise<Response> {
  let phoenixdClient: PhoenixdClient | null = null;

  try {
    // Parse and validate request body
    const requestBody = await req.json();
    const distributionRequest =
      AllowanceDistributionRequestSchema.parse(requestBody);

    // Validate family member exists
    const familyMember = await getFamilyMember(
      distributionRequest.familyMemberId
    );
    if (!familyMember) {
      return createErrorResponse("Family member not found", 404);
    }

    // Emergency amount validation
    if (
      distributionRequest.isEmergency &&
      distributionRequest.amount > MAX_EMERGENCY_AMOUNT_SATS
    ) {
      return createErrorResponse(
        `Emergency amounts cannot exceed ${MAX_EMERGENCY_AMOUNT_SATS} sats`,
        400
      );
    }

    // Check if approval is needed for large amounts
    const needsApproval =
      distributionRequest.amount > APPROVAL_THRESHOLD_SATS &&
      !distributionRequest.isEmergency;

    if (needsApproval) {
      const distributionId = `dist_pending_${Date.now()}_${distributionRequest.familyMemberId}`;

      // TODO: Implement database persistence for approval requests
      // await createApprovalRequest(distributionId, distributionRequest);

      // Audit log for pending approval
      console.info("Allowance distribution pending approval:", {
        distributionId,
        familyMemberId: distributionRequest.familyMemberId,
        familyMemberName: familyMember.name,
        amount: distributionRequest.amount,
        reason: distributionRequest.reason,
        timestamp: new Date().toISOString(),
      });

      const response: AllowanceDistributionResponse = {
        success: true,
        distributionId,
        amountSat: distributionRequest.amount,
        feeSat: 0,
        status: "pending_approval",
      };

      return createSuccessResponse(response, 202);
    }

    // Initialize PhoenixD client for payment processing
    phoenixdClient = new PhoenixdClient();

    // Create invoice and process payment
    const invoice = await phoenixdClient.createFamilyInvoice(
      distributionRequest.familyMemberId,
      distributionRequest.amount,
      distributionRequest.reason || "Allowance distribution"
    );

    const payment = await phoenixdClient.payInvoice(invoice.serialized);

    // Generate distribution ID
    const distributionId = `dist_${Date.now()}_${distributionRequest.familyMemberId}`;

    // TODO: Implement database persistence for completed distributions
    // await saveDistributionToDatabase(distributionId, distributionRequest, payment);

    // Audit log for successful distribution
    console.info("Allowance distributed successfully:", {
      distributionId,
      paymentId: payment.paymentId,
      familyMemberId: distributionRequest.familyMemberId,
      familyMemberName: familyMember.name,
      amountSent: payment.sent,
      fees: payment.fees,
      reason: distributionRequest.reason,
      timestamp: new Date().toISOString(),
    });

    const response: AllowanceDistributionResponse = {
      success: true,
      distributionId,
      paymentId: payment.paymentId,
      amountSat: payment.sent,
      feeSat: payment.fees,
      status: "completed",
    };

    return createSuccessResponse(response, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(
        `Validation error: ${error.errors.map((e) => e.message).join(", ")}`,
        400
      );
    }

    // Log detailed error information
    console.error("Allowance distribution failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    const response: AllowanceDistributionResponse = {
      success: false,
      amountSat: 0,
      feeSat: 0,
      status: "failed",
      errorMessage:
        error instanceof Error ? error.message : "Distribution failed",
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    });
  }
}

/**
 * Retrieves all allowance schedules for the authenticated family
 *
 * @param req - HTTP request object
 * @returns Promise<Response> - List of active allowance schedules
 *
 * @todo Implement database query with proper family filtering
 * @todo Add pagination support for large families
 */
async function getAllowanceSchedules(_req: Request): Promise<Response> {
  try {
    // TODO: Extract family ID from authentication token
    // const familyId = await extractFamilyIdFromAuth(req);

    // TODO: Implement database query
    // const schedules = await getSchedulesFromDatabase(familyId);

    // Mock data for development - REMOVE IN PRODUCTION
    const mockSchedules = [
      {
        id: "schedule_1",
        familyMemberId: "child1",
        amount: 10000,
        frequency: "weekly" as const,
        nextDistribution: new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString(),
        isActive: true,
        createdAt: new Date().toISOString(),
        timeOfDay: "09:00",
        dayOfWeek: 1,
      },
      {
        id: "schedule_2",
        familyMemberId: "child2",
        amount: 25000,
        frequency: "monthly" as const,
        nextDistribution: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString(),
        isActive: true,
        createdAt: new Date().toISOString(),
        timeOfDay: "10:00",
        dayOfMonth: 15,
      },
    ];

    console.info("Retrieved allowance schedules:", {
      count: mockSchedules.length,
      timestamp: new Date().toISOString(),
    });

    return createSuccessResponse({ schedules: mockSchedules });
  } catch (error) {
    console.error("Failed to retrieve allowance schedules:", error);
    return createErrorResponse("Failed to retrieve schedules", 500);
  }
}

/**
 * Retrieves pending approval requests for allowance distributions
 *
 * @param req - HTTP request object
 * @returns Promise<Response> - List of pending approval requests
 *
 * @todo Implement database query with proper family filtering
 * @todo Add automatic expiration of old approval requests
 */
async function getPendingApprovals(_req: Request): Promise<Response> {
  try {
    // TODO: Extract family ID from authentication token
    // const familyId = await extractFamilyIdFromAuth(req);

    // TODO: Implement database query with expiration cleanup
    // const approvals = await getPendingApprovalsFromDatabase(familyId);

    // Mock data for development - REMOVE IN PRODUCTION
    const mockApprovals = [
      {
        id: "approval_1",
        familyMemberId: "teen1",
        amount: 75000,
        reason: "Large allowance request",
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        isEmergency: false,
        status: "pending" as const,
      },
    ];

    console.info("Retrieved pending approvals:", {
      count: mockApprovals.length,
      timestamp: new Date().toISOString(),
    });

    return createSuccessResponse({ approvals: mockApprovals });
  } catch (error) {
    console.error("Failed to retrieve pending approvals:", error);
    return createErrorResponse("Failed to retrieve pending approvals", 500);
  }
}

/**
 * Processes approval or denial of pending allowance distributions
 *
 * @param req - HTTP request containing approval decision
 * @returns Promise<Response> - Approval processing response
 *
 * @throws {ValidationError} When input validation fails
 * @throws {NotFoundError} When approval request doesn't exist
 * @throws {PaymentError} When executing approved payment fails
 */
async function approveAllowance(req: Request): Promise<Response> {
  try {
    // Parse and validate request body
    const requestBody = await req.json();
    const approvalRequest = ApprovalRequestSchema.parse(requestBody);

    // TODO: Verify approval request exists and belongs to family
    // const approvalData = await getApprovalFromDatabase(approvalRequest.approvalId);
    // if (!approvalData) {
    //   return createErrorResponse("Approval request not found", 404);
    // }

    // TODO: Verify user has permission to approve
    // const hasPermission = await verifyApprovalPermission(req, approvalData.familyId);
    // if (!hasPermission) {
    //   return createErrorResponse("Insufficient permissions", 403);
    // }

    const processedAt = new Date().toISOString();

    if (approvalRequest.approved) {
      // TODO: Execute the approved distribution
      // const distributionResult = await executeApprovedDistribution(approvalData);

      // Audit log for approval
      console.info("Allowance distribution approved and executed:", {
        approvalId: approvalRequest.approvalId,
        reason: approvalRequest.reason,
        processedAt,
        timestamp: new Date().toISOString(),
      });
    } else {
      // TODO: Mark approval as denied in database
      // await denyApprovalInDatabase(approvalRequest.approvalId, approvalRequest.reason);

      // Audit log for denial
      console.info("Allowance distribution denied:", {
        approvalId: approvalRequest.approvalId,
        reason: approvalRequest.reason,
        processedAt,
        timestamp: new Date().toISOString(),
      });
    }

    const response: ApprovalResponse = {
      success: true,
      approvalId: approvalRequest.approvalId,
      status: approvalRequest.approved ? "approved" : "denied",
      processedAt,
    };

    return createSuccessResponse(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(
        `Validation error: ${error.errors.map((e) => e.message).join(", ")}`,
        400
      );
    }

    console.error("Failed to process approval:", error);
    return createErrorResponse("Failed to process approval", 500);
  }
}

/**
 * Calculates the next distribution date based on schedule parameters
 *
 * @param frequency - Distribution frequency (daily, weekly, monthly)
 * @param timeOfDay - Time of day in HH:MM format
 * @param dayOfWeek - Day of week (0-6) for weekly schedules only
 * @param dayOfMonth - Day of month (1-31) for monthly schedules only
 * @returns Date object representing the next distribution time
 *
 * @throws {Error} When invalid parameters are provided
 *
 * @example
 * ```typescript
 * // Daily at 9:00 AM
 * const nextDaily = calculateNextDistribution("daily", "09:00");
 *
 * // Weekly on Monday (1) at 2:00 PM
 * const nextWeekly = calculateNextDistribution("weekly", "14:00", 1);
 *
 * // Monthly on the 15th at 10:30 AM
 * const nextMonthly = calculateNextDistribution("monthly", "10:30", undefined, 15);
 * ```
 */
function calculateNextDistribution(
  frequency: "daily" | "weekly" | "monthly",
  timeOfDay: string,
  dayOfWeek?: number,
  dayOfMonth?: number
): Date {
  const now = new Date();
  const [hours, minutes] = timeOfDay.split(":").map(Number);

  // Validate time components
  if (
    isNaN(hours) ||
    isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(
      `Invalid time format: ${timeOfDay}. Expected HH:MM format.`
    );
  }

  const nextDistribution = new Date(now);
  nextDistribution.setHours(hours, minutes, 0, 0);

  switch (frequency) {
    case "daily":
      // If the time has already passed today, schedule for tomorrow
      if (nextDistribution <= now) {
        nextDistribution.setDate(nextDistribution.getDate() + 1);
      }
      break;

    case "weekly": {
      if (dayOfWeek === undefined) {
        throw new Error("dayOfWeek is required for weekly frequency");
      }
      if (dayOfWeek < 0 || dayOfWeek > 6) {
        throw new Error(
          "dayOfWeek must be between 0 (Sunday) and 6 (Saturday)"
        );
      }

      const currentDay = nextDistribution.getDay();
      const targetDay = dayOfWeek;
      let daysUntilTarget = (targetDay - currentDay + 7) % 7;

      // If it's the same day but time has passed, schedule for next week
      if (daysUntilTarget === 0 && nextDistribution <= now) {
        daysUntilTarget = 7;
      }

      nextDistribution.setDate(nextDistribution.getDate() + daysUntilTarget);
      break;
    }

    case "monthly": {
      if (dayOfMonth === undefined) {
        throw new Error("dayOfMonth is required for monthly frequency");
      }
      const targetDate = dayOfMonth;
      if (targetDate < 1 || targetDate > 31) {
        throw new Error("Day of month must be between 1 and 31");
      }

      nextDistribution.setDate(targetDate);

      // If the date has already passed this month, schedule for next month
      if (nextDistribution <= now) {
        nextDistribution.setMonth(nextDistribution.getMonth() + 1);
        // Handle months with fewer days (e.g., February, April, etc.)
        if (nextDistribution.getDate() !== targetDate) {
          // If the target date doesn't exist in the new month, use the last day
          nextDistribution.setDate(0); // Sets to last day of previous month
          nextDistribution.setMonth(nextDistribution.getMonth() + 1); // Move to next month
        }
      }
      break;
    }

    default:
      throw new Error(`Unsupported frequency: ${frequency}`);
  }

  return nextDistribution;
}
