/**
 * Netlify Function: /api/admin/account-control
 * Purpose: Admin account management - removal, rollback, orphan cleanup
 * Methods: POST (all actions)
 *
 * Actions:
 * - remove_account: Remove a user account by NIP-05 identifier
 * - rollback: Restore a previously removed account from backup
 * - list_removals: List removal log entries (for admin review)
 * - cleanup_orphans: Remove orphaned nip05_records (platform admin only)
 *
 * Security:
 * - All operations require admin authentication via JWT
 * - Platform admins can remove any account
 * - Federation admins can only remove accounts in their federation
 * - All operations are logged in admin_account_removal_log
 */

import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import * as crypto from "node:crypto";
import {
  RATE_LIMITS,
  checkRateLimit,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.js";
import { getEnvVar } from "./utils/env.js";
import {
  createAuthErrorResponse,
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.js";
import {
  errorResponse,
  preflightResponse,
  successResponse,
} from "./utils/security-headers.js";
import { requireAnyAdmin, type AdminContext } from "./utils/admin-auth.js";

// Helper to get DUID server secret
function getDuidServerSecret(): string | undefined {
  return getEnvVar("DUID_SERVER_SECRET");
}

// ============================================================================
// Types
// ============================================================================

interface AccountControlRequest {
  action: "remove_account" | "rollback" | "list_removals" | "cleanup_orphans";
  nip05?: string;
  domain?: string;
  reason?: string;
  notes?: string;
  removalLogId?: string;
  rollbackReason?: string;
  limit?: number;
  offset?: number;
  dryRun?: boolean;
}

interface RemovalResult {
  success: boolean;
  removal_log_id?: string;
  user_duid?: string;
  account_type?: string;
  tables_affected?: Record<string, number>;
  total_deleted?: number;
  rollback_available_until?: string;
  error?: string;
  message?: string;
}

// ============================================================================
// Initialize Supabase
// ============================================================================

const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
const supabaseServiceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase configuration");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// Main Handler
// ============================================================================

export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    (event.headers || {}) as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🔐 Admin account control handler started:", {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  if ((event.httpMethod || "GET").toUpperCase() === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  try {
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitAllowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.ADMIN_DASHBOARD
    );

    if (!rateLimitAllowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "admin-account-control",
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    const authHeader =
      event.headers.authorization || event.headers.Authorization;
    const adminResult = await requireAnyAdmin(authHeader);

    if (!adminResult.success || !adminResult.context.isAdmin) {
      return createAuthErrorResponse(
        adminResult.context.error || "Admin privileges required",
        requestId,
        requestOrigin
      );
    }

    const adminContext = adminResult.context;

    let body: AccountControlRequest;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return createValidationErrorResponse(
        "Invalid JSON",
        requestId,
        requestOrigin
      );
    }

    switch (body.action) {
      case "remove_account":
        return await handleRemoveAccount(
          body,
          adminContext,
          clientIP,
          requestOrigin
        );
      case "rollback":
        return await handleRollback(body, adminContext, requestOrigin);
      case "list_removals":
        return await handleListRemovals(body, adminContext, requestOrigin);
      case "cleanup_orphans":
        return await handleCleanupOrphans(body, adminContext, requestOrigin);
      default:
        return createValidationErrorResponse(
          "Invalid action",
          requestId,
          requestOrigin
        );
    }
  } catch (error) {
    logError(error, { requestId, endpoint: "admin-account-control" });
    return errorResponse(
      500,
      error instanceof Error ? error.message : "Internal error",
      requestOrigin
    );
  }
};

// ============================================================================
// Handler: Remove Account
// ============================================================================

async function handleRemoveAccount(
  request: AccountControlRequest,
  admin: AdminContext,
  clientIP: string,
  requestOrigin: string | undefined
) {
  const { nip05, domain = "satnam.pub", reason, notes } = request;

  if (!nip05) {
    return errorResponse(400, "NIP-05 identifier required", requestOrigin);
  }

  // Parse NIP-05 (handle both "username" and "username@domain" formats)
  const [username, nip05Domain] = nip05.includes("@")
    ? nip05.split("@")
    : [nip05, domain];

  // Compute target user DUID from NIP-05
  const duidSecret = getDuidServerSecret();
  if (!duidSecret) {
    return errorResponse(500, "Server configuration error", requestOrigin);
  }

  const targetNip05 = `${username.toLowerCase()}@${nip05Domain.toLowerCase()}`;
  const targetDuid = crypto
    .createHmac("sha256", duidSecret)
    .update(targetNip05)
    .digest("hex");

  // Federation admin scope check
  if (admin.adminType === "federation" && admin.federationId) {
    const { data: targetMember, error: memberError } = await supabase
      .from("family_members")
      .select("federation_id")
      .eq("user_duid", targetDuid)
      .single();

    if (memberError || !targetMember) {
      return errorResponse(404, "Target user not found", requestOrigin);
    }

    if (targetMember.federation_id !== admin.federationId) {
      return errorResponse(
        403,
        "Cannot remove accounts outside your federation",
        requestOrigin
      );
    }
  }

  // Hash client IP for audit
  const ipHash = crypto
    .createHash("sha256")
    .update(clientIP)
    .digest("hex")
    .slice(0, 16);
  const uaHash = crypto
    .createHash("sha256")
    .update("admin-api")
    .digest("hex")
    .slice(0, 16);

  // Call the RPC function
  const { data, error } = await supabase.rpc("remove_user_account_by_nip05", {
    p_target_nip05_duid: targetDuid,
    p_admin_user_duid: admin.userDuid,
    p_admin_type: admin.adminType,
    p_admin_federation_id: admin.federationId || null,
    p_removal_reason: reason || "admin_removal",
    p_removal_notes: notes || null,
    p_request_id: crypto.randomUUID(),
    p_ip_hash: ipHash,
    p_ua_hash: uaHash,
  });

  if (error) {
    console.error("RPC error:", error);
    return errorResponse(500, error.message, requestOrigin);
  }

  const result = data as RemovalResult;

  if (!result.success) {
    return errorResponse(
      400,
      result.message || result.error || "Removal failed",
      requestOrigin
    );
  }

  return successResponse(result, requestOrigin);
}

// ============================================================================
// Handler: Rollback Account Removal
// ============================================================================

async function handleRollback(
  request: AccountControlRequest,
  admin: AdminContext,
  requestOrigin: string | undefined
) {
  const { removalLogId, rollbackReason } = request;

  if (!removalLogId) {
    return errorResponse(400, "Removal log ID required", requestOrigin);
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(removalLogId)) {
    return errorResponse(400, "Invalid removal log ID format", requestOrigin);
  }

  const { data, error } = await supabase.rpc("rollback_account_removal", {
    p_removal_log_id: removalLogId,
    p_admin_user_duid: admin.userDuid,
    p_rollback_reason: rollbackReason || null,
  });

  if (error) {
    console.error("Rollback RPC error:", error);
    return errorResponse(500, error.message, requestOrigin);
  }

  const result = data as { success: boolean; error?: string; message?: string };

  if (!result.success) {
    return errorResponse(
      400,
      result.message || result.error || "Rollback failed",
      requestOrigin
    );
  }

  return successResponse(result, requestOrigin);
}

// ============================================================================
// Handler: List Removal Log Entries
// ============================================================================

async function handleListRemovals(
  request: AccountControlRequest,
  admin: AdminContext,
  requestOrigin: string | undefined
) {
  const { limit = 50, offset = 0 } = request;

  let query = supabase
    .from("admin_account_removal_log")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Federation admins can only see their own federation's removals
  if (admin.adminType === "federation" && admin.federationId) {
    query = query.eq("admin_federation_id", admin.federationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("List removals error:", error);
    return errorResponse(500, error.message, requestOrigin);
  }

  return successResponse(
    {
      success: true,
      removals: data || [],
      count: data?.length || 0,
      offset,
      limit,
    },
    requestOrigin
  );
}

// ============================================================================
// Handler: Cleanup Orphan NIP-05 Records (Platform Admin Only)
// ============================================================================

async function handleCleanupOrphans(
  request: AccountControlRequest,
  admin: AdminContext,
  requestOrigin: string | undefined
) {
  // Platform admin only
  if (admin.adminType !== "platform") {
    return errorResponse(
      403,
      "Platform admin required for orphan cleanup",
      requestOrigin
    );
  }

  const { domain, dryRun = true, limit = 100 } = request;

  // Find orphaned nip05_records (no matching user_identities)
  // An orphan is a nip05_record where:
  // 1. The user_duid doesn't exist in user_identities.id
  // 2. The record is older than 24 hours (to allow for registration delays)

  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Build the query to find orphans
  let orphanQuery = supabase
    .from("nip05_records")
    .select("id, user_duid, domain, created_at, entity_type")
    .lt("created_at", cutoffTime)
    .limit(limit);

  if (domain) {
    orphanQuery = orphanQuery.ilike("domain", domain);
  }

  const { data: candidates, error: queryError } = await orphanQuery;

  if (queryError) {
    console.error("Orphan query error:", queryError);
    return errorResponse(500, queryError.message, requestOrigin);
  }

  if (!candidates || candidates.length === 0) {
    return successResponse(
      {
        success: true,
        message: "No orphan candidates found",
        orphans: [],
        deleted: 0,
        dryRun,
      },
      requestOrigin
    );
  }

  // Check which user_duids actually exist in user_identities
  const userDuids = Array.from(new Set(candidates.map((c) => c.user_duid)));
  const { data: existingUsers, error: userError } = await supabase
    .from("user_identities")
    .select("id")
    .in("id", userDuids);

  if (userError) {
    console.error("User lookup error:", userError);
    return errorResponse(500, userError.message, requestOrigin);
  }

  const existingUserDuids = new Set((existingUsers || []).map((u) => u.id));
  const orphans = candidates.filter((c) => !existingUserDuids.has(c.user_duid));

  if (orphans.length === 0) {
    return successResponse(
      {
        success: true,
        message: "No orphans found",
        orphans: [],
        deleted: 0,
        dryRun,
      },
      requestOrigin
    );
  }

  if (dryRun) {
    return successResponse(
      {
        success: true,
        message: `Found ${orphans.length} orphan record(s). Use dryRun: false to delete.`,
        orphans: orphans.map((o) => ({
          id: o.id,
          user_duid: o.user_duid.slice(0, 8) + "...",
          domain: o.domain,
          created_at: o.created_at,
          entity_type: o.entity_type,
        })),
        deleted: 0,
        dryRun: true,
      },
      requestOrigin
    );
  }

  // Actually delete the orphans
  const orphanIds = orphans.map((o) => o.id);
  const { error: deleteError, count } = await supabase
    .from("nip05_records")
    .delete()
    .in("id", orphanIds);

  if (deleteError) {
    console.error("Orphan delete error:", deleteError);
    return errorResponse(500, deleteError.message, requestOrigin);
  }

  console.log(
    `🧹 Cleaned up ${count} orphan nip05_records by admin ${admin.userDuid?.slice(
      0,
      8
    )}...`
  );

  return successResponse(
    {
      success: true,
      message: `Deleted ${count} orphan record(s)`,
      orphans: orphans.map((o) => ({
        id: o.id,
        user_duid: o.user_duid.slice(0, 8) + "...",
        domain: o.domain,
      })),
      deleted: count || 0,
      dryRun: false,
    },
    requestOrigin
  );
}
