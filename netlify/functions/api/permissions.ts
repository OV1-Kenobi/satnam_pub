/**
 * Permission Management API Endpoints
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Guardian/Steward-only access for configuration
 * - Role-based access to own permissions
 * - Immutable audit logging
 *
 * Endpoints:
 * - GET /api/permissions/federation/{id} - Get all permissions for federation
 * - GET /api/permissions/member/{id} - Get effective permissions for member
 * - POST /api/permissions/role - Configure role permissions (Guardian/Steward)
 * - POST /api/permissions/override - Set member override (Guardian/Steward)
 * - DELETE /api/permissions/override/{id} - Revoke member override
 * - POST /api/permissions/time-window - Set time window
 * - POST /api/permissions/delegation - Create cross-federation delegation
 * - GET /api/permissions/delegation/{id} - Get delegation details
 * - GET /api/permissions/alliances - Get alliance permissions
 */

import type { Handler, HandlerContext, HandlerEvent } from "@netlify/functions";
import { EventSigningPermissionService } from "../../../src/services/eventSigningPermissionService";
import type {
  ConfigureRolePermissionsRequest,
  FederationRole,
  TimeWindowType,
} from "../../../src/types/permissions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

/**
 * Permission Management API Handler
 */
export const handler: Handler = async (
  event: HandlerEvent,
  _context: HandlerContext
) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    const { path, httpMethod, body } = event;
    const pathSegments = path.split("/").filter(Boolean);

    // Remove 'api' prefix if present
    const apiIndex = pathSegments.indexOf("api");
    if (apiIndex !== -1) {
      pathSegments.splice(0, apiIndex + 1);
    }

    // Route: /permissions/...
    if (pathSegments[0] !== "permissions") {
      return notFound();
    }

    const resource = pathSegments[1];

    // GET /permissions/federation/{federationId}
    if (resource === "federation" && httpMethod === "GET") {
      const federationId = pathSegments[2];
      if (!federationId) return badRequest("Missing federationId");
      return await getFederationPermissions(federationId);
    }

    // GET /permissions/member/{memberDuid}?federationId={id}
    if (resource === "member" && httpMethod === "GET") {
      const memberDuid = pathSegments[2];
      const federationId = event.queryStringParameters?.federationId;
      if (!memberDuid || !federationId) {
        return badRequest("Missing memberDuid or federationId");
      }
      return await getMemberPermissions(federationId, memberDuid);
    }

    // POST /permissions/role
    if (resource === "role" && httpMethod === "POST") {
      let parsedBody;
      try {
        parsedBody = JSON.parse(body || "{}");
      } catch {
        return badRequest("Invalid JSON body");
      }
      return await configureRolePermissions(parsedBody);
    }

    // POST /permissions/override
    if (resource === "override" && httpMethod === "POST") {
      let parsedBody;
      try {
        parsedBody = JSON.parse(body || "{}");
      } catch {
        return badRequest("Invalid JSON body");
      }
      return await setMemberOverride(parsedBody);
    }

    // DELETE /permissions/override/{overrideId}?federationId=...&revokerDuid=...&reason=...
    if (resource === "override" && httpMethod === "DELETE") {
      const overrideId = pathSegments[2];
      const federationId = event.queryStringParameters?.federationId;
      const revokerDuid = event.queryStringParameters?.revokerDuid;
      const reason = event.queryStringParameters?.reason ?? undefined;

      if (!overrideId) return badRequest("Missing overrideId");
      if (!federationId || !revokerDuid) {
        return badRequest("Missing federationId or revokerDuid");
      }

      return await revokeOverride({
        overrideId,
        federationId,
        revokerDuid,
        reason,
      });
    }

    // POST /permissions/time-window
    if (resource === "time-window" && httpMethod === "POST") {
      let parsedBody;
      try {
        parsedBody = JSON.parse(body || "{}");
      } catch {
        return badRequest("Invalid JSON body");
      }
      return await setTimeWindow(parsedBody);
    }

    // POST /permissions/delegation
    if (resource === "delegation" && httpMethod === "POST") {
      let parsedBody;
      try {
        parsedBody = JSON.parse(body || "{}");
      } catch {
        return badRequest("Invalid JSON body");
      }
      return await createDelegation(parsedBody);
    }

    // GET /permissions/delegation/{delegationId}
    if (resource === "delegation" && httpMethod === "GET") {
      const delegationId = pathSegments[2];
      if (!delegationId) return badRequest("Missing delegationId");
      return await getDelegation(delegationId);
    }

    // GET /permissions/alliances?federationId={id}
    if (resource === "alliances" && httpMethod === "GET") {
      const federationId = event.queryStringParameters?.federationId;
      if (!federationId) return badRequest("Missing federationId");
      return await getAlliancePermissions(federationId);
    }

    return notFound();
  } catch (error) {
    console.error("[PermissionsAPI] Error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
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
    headers: corsHeaders,
    body: JSON.stringify({ success: false, error: "Not found" }),
  };
}

function badRequest(message: string) {
  return {
    statusCode: 400,
    headers: corsHeaders,
    body: JSON.stringify({ success: false, error: message }),
  };
}

function success(data: unknown) {
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ success: true, data }),
  };
}

// ============================================================================
// ENDPOINT IMPLEMENTATIONS
// ============================================================================

/**
 * GET /permissions/federation/{federationId}
 * Returns all permission configurations for a federation
 */
async function getFederationPermissions(federationId: string) {
  const result =
    await EventSigningPermissionService.getFederationPermissionsConfig(
      federationId
    );

  if (!result.success) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify(result),
    };
  }

  return success(result.data ?? { rolePermissions: [], memberOverrides: [] });
}

/**
 * GET /permissions/member/{memberDuid}
 * Returns effective permissions for a specific member
 */
async function getMemberPermissions(federationId: string, memberDuid: string) {
  const result = await EventSigningPermissionService.getEffectivePermissions(
    federationId,
    memberDuid
  );
  return success(result);
}

/**
 * POST /permissions/role
 * Configure permissions for a role (Guardian/Steward only)
 */
async function configureRolePermissions(body: {
  federationId: string;
  targetRole: FederationRole;
  permissions: Array<{
    eventType: string;
    canSign?: boolean;
    requiresApproval?: boolean;
    approvedByRoles?: FederationRole[];
    maxDailyCount?: number;
  }>;
  configuredBy: string;
}) {
  const { federationId, targetRole, permissions, configuredBy } = body;

  if (!federationId || !targetRole || !permissions || !configuredBy) {
    return badRequest("Missing required fields");
  }

  const request: ConfigureRolePermissionsRequest = {
    federationId,
    targetRole,
    permissions: permissions.map((perm) => ({
      eventType: perm.eventType,
      canSign: perm.canSign,
      requiresApproval: perm.requiresApproval,
      approvedByRoles: perm.approvedByRoles,
      maxDailyCount: perm.maxDailyCount,
    })),
  };

  const result = await EventSigningPermissionService.configureRolePermissions(
    request,
    configuredBy
  );

  const allSuccess = result.success;
  return {
    statusCode: allSuccess ? 200 : 207,
    headers: corsHeaders,
    body: JSON.stringify({
      success: allSuccess,
      results: [result],
    }),
  };
}

/**
 * POST /permissions/override
 * Grant member-specific permission override
 */
async function setMemberOverride(body: {
  federationId: string;
  memberDuid: string;
  eventType: string;
  allowed: boolean;
  expiresAt?: string | null;
  dailyLimit?: number;
  reason?: string;
  /**
   * DUID of the guardian/steward granting the override.
   * For backward compatibility, we also accept `createdBy` and prefer `grantedBy` when both are present.
   */
  grantedBy?: string;
  createdBy?: string;
}) {
  const {
    federationId,
    memberDuid,
    eventType,
    allowed,
    expiresAt,
    dailyLimit,
    reason,
    grantedBy,
    createdBy,
  } = body;

  const granterDuid = grantedBy ?? createdBy;

  if (!granterDuid) {
    return badRequest("Missing granterDuid (grantedBy/createdBy)");
  }

  const overrideRequest = {
    federationId,
    memberDuid,
    eventType,
    canSign: allowed,
    maxDailyCount: dailyLimit,
    validUntil: expiresAt ? new Date(expiresAt) : undefined,
    grantReason: reason,
  };

  const result = await EventSigningPermissionService.setMemberOverride(
    overrideRequest,
    granterDuid
  );

  if (!result.success) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify(result),
    };
  }

  return success(result);
}

/**
 * DELETE /permissions/override/{overrideId}
 * Revoke member permission override by ID (Guardian/Steward only)
 */
async function revokeOverride(params: {
  overrideId: string;
  federationId: string;
  revokerDuid: string;
  reason?: string;
}) {
  const { overrideId, federationId, revokerDuid, reason } = params;

  const result = await EventSigningPermissionService.revokeMemberOverrideById(
    federationId,
    revokerDuid,
    overrideId,
    reason
  );

  if (!result.success) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify(result),
    };
  }

  return success(result);
}

/**
 * POST /permissions/time-window
 * Configure time-based permission window
 */
async function setTimeWindow(body: {
  federationId: string;
  permissionId?: string;
  overrideId?: string;
  windowType: "scheduled" | "temporary" | "cooldown";
  allowedDays?: number[];
  startHour?: number;
  endHour?: number;
  timezone?: string;
  tempStartTime?: string;
  tempEndTime?: string;
  cooldownMinutes?: number;
  /** Optional human-readable reason for this window (e.g. "Business hours only") */
  reason?: string;
  /**
   * DUID of the guardian/steward configuring the time window.
   */
  configuredBy: string;
}) {
  const {
    federationId,
    permissionId,
    overrideId,
    windowType,
    allowedDays,
    startHour,
    endHour,
    timezone,
    tempStartTime,
    tempEndTime,
    cooldownMinutes,
    reason,
    configuredBy,
  } = body;

  if (!federationId) {
    return badRequest("Missing federationId");
  }

  if (!configuredBy) {
    return badRequest("Missing configuredBy");
  }

  if (!permissionId && !overrideId) {
    return badRequest("Either permissionId or overrideId is required");
  }

  const request = {
    federationId,
    permissionId,
    overrideId,
    // Map simplified window type into service TimeWindowType
    windowType: (windowType === "temporary"
      ? "temporary_elevation"
      : windowType) as TimeWindowType,
    daysOfWeek: allowedDays,
    // Convert hour-of-day numbers into HH:MM:SS strings when provided
    startTime:
      typeof startHour === "number"
        ? `${String(startHour).padStart(2, "0")}:00:00`
        : undefined,
    endTime:
      typeof endHour === "number"
        ? `${String(endHour).padStart(2, "0")}:00:00`
        : undefined,
    timezone,
    elevationStart: tempStartTime ? new Date(tempStartTime) : undefined,
    elevationEnd: tempEndTime ? new Date(tempEndTime) : undefined,
    cooldownMinutes,
    description: reason,
  };

  const result = await EventSigningPermissionService.setTimeWindow(
    configuredBy,
    request
  );

  if (!result.success) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify(result),
    };
  }

  return success(result);
}

/**
 * POST /permissions/delegation
 * Create cross-federation delegation
 */
async function createDelegation(body: {
  sourceFederationId: string;
  targetFederationId: string;
  delegatedEventTypes: string[];
  delegatedToMember?: string;
  expiresAt?: string;
  maxUsageCount?: number;
  createdBy: string;
}) {
  const {
    sourceFederationId,
    targetFederationId,
    delegatedEventTypes,
    delegatedToMember,
    expiresAt,
    maxUsageCount,
    createdBy,
  } = body;

  if (
    !sourceFederationId ||
    !targetFederationId ||
    !createdBy ||
    !delegatedEventTypes ||
    delegatedEventTypes.length === 0
  ) {
    return badRequest(
      "Missing required delegation fields (sourceFederationId, targetFederationId, createdBy, delegatedEventTypes)"
    );
  }

  const request = {
    targetFederationId,
    targetMemberDuid: delegatedToMember,
    delegatedEventTypes,
    maxDailyUses: maxUsageCount,
    validUntil: expiresAt ? new Date(expiresAt) : undefined,
  };

  const result = await EventSigningPermissionService.createDelegation(
    sourceFederationId,
    createdBy,
    request
  );

  if (!result.success) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify(result),
    };
  }

  return success(result);
}

/**
 * GET /permissions/delegation/{delegationId}
 * Get delegation details and usage stats
 */
async function getDelegation(delegationId: string) {
  const result = await EventSigningPermissionService.getDelegationById(
    delegationId
  );

  if (!result.success) {
    const statusCode = result.errorCode === "NOT_FOUND" ? 404 : 400;
    return {
      statusCode,
      headers: corsHeaders,
      body: JSON.stringify(result),
    };
  }

  return success(result.data);
}

/**
 * GET /permissions/alliances
 * Get federation alliance permissions
 */
async function getAlliancePermissions(federationId: string) {
  const result = await EventSigningPermissionService.getAlliancePermissions(
    federationId
  );
  return success(result);
}
