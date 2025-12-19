/**
 * Signing Permissions API Endpoint
 * POST /.netlify/functions/signing-permissions
 *
 * Handles event signing permission management and approval queue operations.
 * Master Context compliant with role-based access control.
 *
 * Actions:
 * - check: Check if a member can sign an event type
 * - list: List all permissions and overrides for a federation
 * - configure: Configure role permissions (Guardian/Steward only)
 * - override: Set member-specific overrides (Guardian/Steward only)
 * - pending: Get pending approval queue
 * - approve: Approve a pending signing request
 * - reject: Reject a pending signing request
 * - audit: Query signing audit log
 */

import type { Handler } from "@netlify/functions";

import {
  RATE_LIMITS,
  checkRateLimitStatus,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.ts";
import {
  createRateLimitErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.ts";
import {
  errorResponse,
  getSecurityHeaders,
  preflightResponse,
} from "./utils/security-headers.ts";

import { SecureSessionManager } from "./security/session-manager.js";
import { getRequestClient, getServiceClient } from "./supabase.js";

export const config = {
  path: "/signing-permissions",
};

// Request types
interface PermissionCheckRequest {
  action: "check";
  federationId: string;
  memberDuid: string;
  memberRole: string;
  eventType: string;
  nostrKind?: number;
}

interface ConfigurePermissionRequest {
  action: "configure";
  federationId: string;
  role: string;
  eventType: string;
  canSign: boolean;
  requiresApproval?: boolean;
  approvalThreshold?: number;
  approvedByRoles?: string[];
  maxDailyCount?: number;
}

interface SetOverrideRequest {
  action: "override";
  federationId: string;
  memberDuid: string;
  eventType: string;
  canSign?: boolean;
  requiresApproval?: boolean;
  maxDailyCount?: number;
  validUntil?: string;
  reason?: string;
}

interface PendingApprovalsRequest {
  action: "pending";
  federationId: string;
  limit?: number;
}

interface ApproveRequest {
  action: "approve";
  auditLogId: string;
  approverId: string;
  approverRole: string;
}

interface RejectRequest {
  action: "reject";
  auditLogId: string;
  rejecterId: string;
  rejecterRole: string;
  reason?: string;
}

interface ListPermissionsRequest {
  action: "list";
  federationId: string;
}

interface AuditLogRequest {
  action: "audit";
  federationId: string;
  memberDuid?: string;
  eventType?: string;
  status?: "pending" | "approved" | "rejected" | "expired" | "executed";
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

type SigningPermissionRequest =
  | PermissionCheckRequest
  | ConfigurePermissionRequest
  | SetOverrideRequest
  | PendingApprovalsRequest
  | ApproveRequest
  | RejectRequest
  | ListPermissionsRequest
  | AuditLogRequest;

export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = (event.headers?.origin || event.headers?.Origin) as
    | string
    | undefined;

  console.log("🔐 Signing permissions handler started", {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  try {
    // Rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitResult = await checkRateLimitStatus(
      rateLimitKey,
      RATE_LIMITS.NFC_OPERATIONS
    );

    if (!rateLimitResult.allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        clientIP,
        endpoint: "signing-permissions",
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Parse request body
    if (!event.body) {
      return errorResponse(400, "Request body required", requestOrigin);
    }

    const request: SigningPermissionRequest = JSON.parse(event.body);

    if (!request.action) {
      return errorResponse(400, "Action required", requestOrigin);
    }

    // Authenticate user - extract token from Authorization header
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;
    const sessionData = token
      ? await SecureSessionManager.validateSession(token)
      : null;

    if (!sessionData) {
      return errorResponse(401, "Authentication required", requestOrigin);
    }

    // Route to appropriate handler - sessionData contains the user info directly
    const user = { duid: sessionData.userId, role: sessionData.federationRole };
    const result = await handleAction(request, user, requestId);

    return {
      statusCode: result.success ? 200 : 400,
      headers: getSecurityHeaders(requestOrigin),
      body: JSON.stringify(result),
    };
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      requestId,
      endpoint: "signing-permissions",
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};

/**
 * Route action to appropriate handler
 */
async function handleAction(
  request: SigningPermissionRequest,
  user: { duid?: string; role?: string },
  requestId: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  // Dynamic imports to avoid bundling issues
  const { EventSigningPermissionService } = await import(
    "../../src/services/eventSigningPermissionService"
  );
  const { FrostSessionManager } = await import(
    "../../lib/frost/frost-session-manager"
  );

  switch (request.action) {
    case "check": {
      const checkReq = request as PermissionCheckRequest;
      const result = await EventSigningPermissionService.canSign(
        checkReq.federationId,
        checkReq.memberDuid,
        checkReq.eventType,
        checkReq.nostrKind
      );
      // PermissionCheckResult has 'allowed' instead of 'success'
      return {
        success: result.allowed,
        data: result,
        error: result.reason,
      };
    }

    case "configure": {
      const configReq = request as ConfigurePermissionRequest;
      // Only Guardian/Steward can configure permissions
      if (!["guardian", "steward"].includes((user.role || "").toLowerCase())) {
        return { success: false, error: "Insufficient permissions" };
      }
      const result =
        await EventSigningPermissionService.configureRolePermissions(
          {
            federationId: configReq.federationId,
            targetRole: configReq.role as
              | "private"
              | "offspring"
              | "adult"
              | "steward"
              | "guardian",
            permissions: [
              {
                eventType: configReq.eventType,
                canSign: configReq.canSign,
                requiresApproval: configReq.requiresApproval,
                approvalThreshold: configReq.approvalThreshold,
                approvedByRoles: configReq.approvedByRoles as (
                  | "private"
                  | "offspring"
                  | "adult"
                  | "steward"
                  | "guardian"
                )[],
                maxDailyCount: configReq.maxDailyCount,
              },
            ],
          },
          user.duid || ""
        );
      return { success: result.success, error: result.error };
    }

    case "override": {
      const overrideReq = request as SetOverrideRequest;
      // Only Guardian/Steward can set overrides
      if (!["guardian", "steward"].includes((user.role || "").toLowerCase())) {
        return { success: false, error: "Insufficient permissions" };
      }
      const result = await EventSigningPermissionService.setMemberOverride(
        {
          federationId: overrideReq.federationId,
          memberDuid: overrideReq.memberDuid,
          eventType: overrideReq.eventType,
          canSign: overrideReq.canSign,
          requiresApproval: overrideReq.requiresApproval,
          maxDailyCount: overrideReq.maxDailyCount,
          validUntil: overrideReq.validUntil
            ? new Date(overrideReq.validUntil)
            : undefined,
          grantReason: overrideReq.reason,
        },
        user.duid || ""
      );
      return { success: result.success, error: result.error };
    }

    case "pending": {
      const pendingReq = request as PendingApprovalsRequest;
      // Only Guardian/Steward can view pending approvals
      if (!["guardian", "steward"].includes((user.role || "").toLowerCase())) {
        return { success: false, error: "Insufficient permissions" };
      }
      const result = await FrostSessionManager.getPendingApprovals({
        federationId: pendingReq.federationId,
        limit: pendingReq.limit,
      });
      return {
        success: result.success,
        data: { pendingApprovals: result.pendingApprovals },
        error: result.error,
      };
    }

    case "approve": {
      const approveReq = request as ApproveRequest;
      // Verify the authenticated user is the approver
      if (user.duid !== approveReq.approverId) {
        return {
          success: false,
          error: "Cannot approve on behalf of another user",
        };
      }
      const result = await FrostSessionManager.approveSession({
        auditLogId: approveReq.auditLogId,
        approverId: approveReq.approverId,
        approverRole: approveReq.approverRole as
          | "private"
          | "offspring"
          | "adult"
          | "steward"
          | "guardian",
      });
      return { success: result.success, data: result, error: result.error };
    }

    case "reject": {
      const rejectReq = request as RejectRequest;
      // Verify the authenticated user is the rejecter
      if (user.duid !== rejectReq.rejecterId) {
        return {
          success: false,
          error: "Cannot reject on behalf of another user",
        };
      }
      const result = await FrostSessionManager.rejectSession({
        auditLogId: rejectReq.auditLogId,
        rejecterId: rejectReq.rejecterId,
        rejecterRole: rejectReq.rejecterRole as
          | "private"
          | "offspring"
          | "adult"
          | "steward"
          | "guardian",
        reason: rejectReq.reason,
      });
      return { success: result.success, data: result, error: result.error };
    }

    case "list": {
      const listReq = request as ListPermissionsRequest;
      // Only Guardian/Steward can list all permissions
      if (!["guardian", "steward"].includes((user.role || "").toLowerCase())) {
        return { success: false, error: "Insufficient permissions" };
      }
      const result =
        await EventSigningPermissionService.getFederationPermissionsConfig(
          listReq.federationId
        );
      return {
        success: result.success,
        data: result.data,
        error: result.error,
      };
    }

    case "audit": {
      const auditReq = request as AuditLogRequest;
      // Only Guardian/Steward can view audit logs
      if (!["guardian", "steward"].includes((user.role || "").toLowerCase())) {
        return { success: false, error: "Insufficient permissions" };
      }
      // Dynamic import SigningAuditService
      const { SigningAuditService } = await import(
        "../../src/services/signingAuditService"
      );
      const result = await SigningAuditService.getAuditLog({
        federationId: auditReq.federationId,
        memberDuid: auditReq.memberDuid,
        eventType: auditReq.eventType,
        status: auditReq.status,
        startDate: auditReq.startDate
          ? new Date(auditReq.startDate)
          : undefined,
        endDate: auditReq.endDate ? new Date(auditReq.endDate) : undefined,
        limit: auditReq.limit,
        offset: auditReq.offset,
      });
      return {
        success: result.success,
        data: { auditLog: result.data },
        error: result.error,
      };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${(request as { action: string }).action}`,
      };
  }
}
