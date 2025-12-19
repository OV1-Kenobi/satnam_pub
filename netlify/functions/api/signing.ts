/**
 * Signing Approval Workflow API Endpoints
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Guardian/Steward approval for restricted signing
 * - Immutable audit logging of all approvals/rejections
 * - Role-based access to approval queue
 *
 * Endpoints:
 * - GET /api/signing/approval-queue - Get pending approval requests
 * - POST /api/signing/approve - Approve a pending request
 * - POST /api/signing/reject - Reject a pending request
 * - GET /api/signing/audit-log - Query signing audit log
 */

import type { Handler, HandlerContext, HandlerEvent } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { SigningAuditService } from "../../../src/services/signingAuditService";
import { FrostSessionManager } from "../../../lib/frost/frost-session-manager";
import type {
  AuditLogStatus,
  FederationRole,
} from "../../../src/types/permissions";

// Valid AuditLogStatus values for validation
const VALID_AUDIT_STATUSES: AuditLogStatus[] = [
  "pending",
  "approved",
  "rejected",
  "signed",
  "failed",
];

// Lazy-initialized Supabase client
let supabaseInstance: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabaseInstance) {
    const supabaseUrl =
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration for SigningAPI");
    }
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseInstance;
}

// Store current CORS headers for use by helper functions
let currentCorsHeaders: Record<string, string> = {};

/**
 * Build CORS headers with restricted origin for sensitive operations
 */
function getCorsHeaders(requestOrigin?: string): Record<string, string> {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((s) =>
    s.trim()
  ) || [
    process.env.FRONTEND_URL || "https://satnam.pub",
    "http://localhost:3000",
    "http://localhost:5173",
  ];

  // Only allow specific trusted origins
  const corsOrigin =
    requestOrigin && allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedOrigins[0] || "https://satnam.pub";

  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

/**
 * Extract and validate authorization token
 */
function extractAuthToken(event: HandlerEvent): string | null {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Get a member's role in a federation
 */
async function getMemberRole(
  federationId: string,
  memberDuid: string
): Promise<FederationRole | null> {
  const { data, error } = await getSupabase()
    .from("family_members")
    .select("role")
    .eq("federation_id", federationId)
    .eq("user_duid", memberDuid)
    .single();

  if (error || !data) {
    return null;
  }
  return data.role as FederationRole;
}

/**
 * Verify the requester has guardian/steward role in the federation
 */
async function verifyApproverRole(
  federationId: string,
  memberDuid: string
): Promise<{ valid: boolean; role?: FederationRole; error?: string }> {
  const role = await getMemberRole(federationId, memberDuid);

  if (!role) {
    return { valid: false, error: "Member not found in federation" };
  }

  if (!["guardian", "steward"].includes(role)) {
    return {
      valid: false,
      error: `Role '${role}' is not authorized to approve/reject signing requests`,
    };
  }

  return { valid: true, role };
}

/**
 * Signing Approval Workflow API Handler
 */
export const handler: Handler = async (
  event: HandlerEvent,
  _context: HandlerContext
) => {
  // Set CORS headers based on request origin
  const requestOrigin = event.headers.origin;
  currentCorsHeaders = getCorsHeaders(requestOrigin);

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: currentCorsHeaders, body: "" };
  }

  try {
    const { path, httpMethod, body, queryStringParameters } = event;
    const pathSegments = path.split("/").filter(Boolean);

    // Remove 'api' prefix if present
    const apiIndex = pathSegments.indexOf("api");
    if (apiIndex !== -1) {
      pathSegments.splice(0, apiIndex + 1);
    }

    // Route: /signing/...
    if (pathSegments[0] !== "signing") {
      return notFound();
    }

    // Validate Authorization header for all non-OPTIONS requests
    const authToken = extractAuthToken(event);
    if (!authToken) {
      return unauthorized("Missing or invalid Authorization header");
    }

    const resource = pathSegments[1];

    // GET /signing/approval-queue
    if (resource === "approval-queue" && httpMethod === "GET") {
      const federationId = queryStringParameters?.federationId;
      const approverRole =
        queryStringParameters?.approverRole as FederationRole;
      const limitStr = queryStringParameters?.limit;

      if (!federationId) {
        return badRequest("Missing federationId");
      }

      // Validate limit if provided
      let limit: number | undefined;
      if (limitStr) {
        limit = parseInt(limitStr, 10);
        if (isNaN(limit)) {
          return badRequest("Invalid limit parameter");
        }
      }

      return await getApprovalQueue(federationId, approverRole, limit);
    }

    // POST /signing/approve
    if (resource === "approve" && httpMethod === "POST") {
      let parsedBody;
      try {
        parsedBody = JSON.parse(body || "{}");
      } catch {
        return badRequest("Invalid JSON body");
      }
      return await approveRequest(parsedBody);
    }

    // POST /signing/reject
    if (resource === "reject" && httpMethod === "POST") {
      let parsedBody;
      try {
        parsedBody = JSON.parse(body || "{}");
      } catch {
        return badRequest("Invalid JSON body");
      }
      return await rejectRequest(parsedBody);
    }

    // GET /signing/audit-log
    if (resource === "audit-log" && httpMethod === "GET") {
      const federationId = queryStringParameters?.federationId;
      if (!federationId) {
        return badRequest("Missing federationId");
      }
      return await getAuditLog(federationId, queryStringParameters);
    }

    return notFound();
  } catch (error) {
    console.error("[SigningAPI] Error:", error);
    return {
      statusCode: 500,
      headers: currentCorsHeaders,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
    };
  }
};

// Helper responses
function notFound() {
  return {
    statusCode: 404,
    headers: currentCorsHeaders,
    body: JSON.stringify({ success: false, error: "Not found" }),
  };
}

function badRequest(message: string) {
  return {
    statusCode: 400,
    headers: currentCorsHeaders,
    body: JSON.stringify({ success: false, error: message }),
  };
}

function unauthorized(message: string) {
  return {
    statusCode: 401,
    headers: currentCorsHeaders,
    body: JSON.stringify({ success: false, error: message }),
  };
}

function forbidden(message: string) {
  return {
    statusCode: 403,
    headers: currentCorsHeaders,
    body: JSON.stringify({ success: false, error: message }),
  };
}

function success(data: unknown) {
  return {
    statusCode: 200,
    headers: currentCorsHeaders,
    body: JSON.stringify({ success: true, data }),
  };
}

// ============================================================================
// ENDPOINT IMPLEMENTATIONS
// ============================================================================

/**
 * GET /signing/approval-queue
 * Get pending approval requests for an approver
 */
async function getApprovalQueue(
  federationId: string,
  approverRole?: FederationRole,
  limit?: number
) {
  const result = await SigningAuditService.getPendingApprovals({
    federationId,
    approverRole: approverRole || "guardian",
    limit,
  });

  if (!result.success) {
    return {
      statusCode: 400,
      headers: currentCorsHeaders,
      body: JSON.stringify(result),
    };
  }

  return success(result.data);
}

/**
 * POST /signing/approve
 * Approve a pending signing request
 */
async function approveRequest(body: {
  auditId: string;
  approvedBy: string;
  federationId: string;
}) {
  const { auditId, approvedBy, federationId } = body;

  if (!auditId || !approvedBy || !federationId) {
    return badRequest("Missing auditId, approvedBy, or federationId");
  }

  // Verify approver has guardian/steward role
  const roleCheck = await verifyApproverRole(federationId, approvedBy);
  if (!roleCheck.valid) {
    return forbidden(roleCheck.error || "Unauthorized to approve requests");
  }

  // Get current audit entry
  const auditEntry = await SigningAuditService.getAuditEntry(auditId);
  if (!auditEntry.success || !auditEntry.data) {
    return {
      statusCode: 404,
      headers: currentCorsHeaders,
      body: JSON.stringify({ success: false, error: "Audit entry not found" }),
    };
  }

  // Verify the audit entry belongs to the specified federation
  if (auditEntry.data.federationId !== federationId) {
    return forbidden("Audit entry does not belong to specified federation");
  }

  // Use FrostSessionManager.approveSession which handles:
  // 1. Role verification against approved_by_roles
  // 2. Approval threshold checking
  // 3. Session creation when threshold is met
  const result = await FrostSessionManager.approveSession({
    auditLogId: auditId,
    approverId: approvedBy,
    approverRole: roleCheck.role!,
  });

  if (!result.success) {
    return {
      statusCode: 400,
      headers: currentCorsHeaders,
      body: JSON.stringify(result),
    };
  }

  return success({
    auditId,
    status: result.status,
    approvedBy,
    sessionId: result.sessionId,
    message:
      result.status === "created"
        ? "Approval threshold met. Signing session created."
        : result.status === "pending_approval"
        ? `Approval recorded. ${
            result.permissionCheck?.reason || "Awaiting additional approvals."
          }`
        : "Request approved.",
  });
}

/**
 * POST /signing/reject
 * Reject a pending signing request
 */
async function rejectRequest(body: {
  auditId: string;
  rejectedBy: string;
  federationId: string;
  reason?: string;
}) {
  const { auditId, rejectedBy, federationId, reason } = body;

  if (!auditId || !rejectedBy || !federationId) {
    return badRequest("Missing auditId, rejectedBy, or federationId");
  }

  // Verify rejector has guardian/steward role
  const roleCheck = await verifyApproverRole(federationId, rejectedBy);
  if (!roleCheck.valid) {
    return forbidden(roleCheck.error || "Unauthorized to reject requests");
  }

  // Get current audit entry to verify it belongs to the federation
  const auditEntry = await SigningAuditService.getAuditEntry(auditId);
  if (!auditEntry.success || !auditEntry.data) {
    return {
      statusCode: 404,
      headers: currentCorsHeaders,
      body: JSON.stringify({ success: false, error: "Audit entry not found" }),
    };
  }

  if (auditEntry.data.federationId !== federationId) {
    return forbidden("Audit entry does not belong to specified federation");
  }

  // Use FrostSessionManager.rejectSession for consistent handling
  // roleCheck.role is guaranteed to be defined at this point since roleCheck.valid is true
  const result = await FrostSessionManager.rejectSession({
    auditLogId: auditId,
    rejecterId: rejectedBy,
    rejecterRole: roleCheck.role!,
    reason: reason,
  });

  if (!result.success) {
    return {
      statusCode: 400,
      headers: currentCorsHeaders,
      body: JSON.stringify(result),
    };
  }

  return success({
    auditId,
    status: "rejected",
    rejectedBy,
    reason,
  });
}

/**
 * GET /signing/audit-log
 * Query signing audit log with filters
 */
async function getAuditLog(
  federationId: string,
  params: Record<string, string | undefined> | null
) {
  // Validate dates
  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (params?.startDate) {
    startDate = new Date(params.startDate);
    if (isNaN(startDate.getTime())) {
      return badRequest("Invalid startDate format");
    }
  }

  if (params?.endDate) {
    endDate = new Date(params.endDate);
    if (isNaN(endDate.getTime())) {
      return badRequest("Invalid endDate format");
    }
  }

  // Validate numeric parameters
  let limit: number | undefined;
  let offset: number | undefined;

  if (params?.limit) {
    limit = parseInt(params.limit, 10);
    if (isNaN(limit)) {
      return badRequest("Invalid limit parameter");
    }
  }

  if (params?.offset) {
    offset = parseInt(params.offset, 10);
    if (isNaN(offset)) {
      return badRequest("Invalid offset parameter");
    }
  }

  // Validate status if provided
  if (
    params?.status &&
    !VALID_AUDIT_STATUSES.includes(params.status as AuditLogStatus)
  ) {
    return badRequest(
      `Invalid status. Must be one of: ${VALID_AUDIT_STATUSES.join(", ")}`
    );
  }

  const result = await SigningAuditService.getAuditLog({
    federationId,
    memberDuid: params?.memberDuid,
    eventType: params?.eventType,
    status: params?.status as AuditLogStatus | undefined,
    startDate,
    endDate,
    limit,
    offset,
  });

  if (!result.success) {
    return {
      statusCode: 400,
      headers: currentCorsHeaders,
      body: JSON.stringify(result),
    };
  }

  return success(result.data);
}
