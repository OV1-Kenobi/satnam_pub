/**
 * Admin Account Control - Verification and Rollback Utilities
 *
 * Provides programmatic utilities for verifying admin account operations
 * and managing rollbacks. Used by the admin-account-control function and
 * admin dashboard.
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// Types
// ============================================================================

export interface RemovalLogEntry {
  id: string;
  admin_user_duid: string;
  admin_type: "platform" | "federation";
  admin_federation_id: string | null;
  target_user_duid: string;
  target_nip05_duid: string;
  target_account_type: string;
  target_federation_id: string | null;
  removal_reason: string;
  removal_notes: string | null;
  status: string;
  backup_snapshot: Record<string, unknown> | null;
  rollback_expires_at: string | null;
  rollback_executed: boolean;
  rollback_executed_at: string | null;
  rollback_executed_by: string | null;
  rollback_reason: string | null;
  records_deleted: number;
  requested_at: string;
  completed_at: string | null;
}

export interface OrphanRecord {
  id: string;
  user_duid: string;
  domain: string;
  entity_type: string;
  created_at: string;
}

export interface VerificationResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface RollbackEligibility {
  eligible: boolean;
  reason: string;
  daysRemaining?: number;
  backupAvailable: boolean;
}

// ============================================================================
// Verification Queries
// ============================================================================

/**
 * Get pending removal operations (not yet completed)
 */
export async function getPendingRemovals(
  supabase: SupabaseClient,
  limit = 50
): Promise<VerificationResult> {
  const { data, error } = await supabase
    .from("admin_account_removal_log")
    .select("*")
    .in("status", ["pending", "confirmed", "executing"])
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { success: false, message: error.message };
  }

  return {
    success: true,
    message: `Found ${data?.length || 0} pending removals`,
    data,
  };
}

/**
 * Get completed removals with active rollback window
 */
export async function getRollbackableRemovals(
  supabase: SupabaseClient,
  federationId?: string,
  limit = 50
): Promise<VerificationResult> {
  let query = supabase
    .from("admin_account_removal_log")
    .select("*")
    .eq("status", "completed")
    .eq("rollback_executed", false)
    .gt("rollback_expires_at", new Date().toISOString())
    .order("rollback_expires_at", { ascending: true })
    .limit(limit);

  if (federationId) {
    query = query.eq("admin_federation_id", federationId);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, message: error.message };
  }

  return {
    success: true,
    message: `Found ${data?.length || 0} rollbackable removals`,
    data,
  };
}

/**
 * Get failed removal operations for investigation
 */
export async function getFailedRemovals(
  supabase: SupabaseClient,
  limit = 20
): Promise<VerificationResult> {
  const { data, error } = await supabase
    .from("admin_account_removal_log")
    .select("*")
    .eq("status", "failed")
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { success: false, message: error.message };
  }

  return {
    success: true,
    message: `Found ${data?.length || 0} failed removals`,
    data,
  };
}

/**
 * Check rollback eligibility for a specific removal log entry
 */
export async function checkRollbackEligibility(
  supabase: SupabaseClient,
  removalLogId: string
): Promise<RollbackEligibility> {
  const { data, error } = await supabase
    .from("admin_account_removal_log")
    .select("*")
    .eq("id", removalLogId)
    .single();

  if (error || !data) {
    return {
      eligible: false,
      reason: "Removal log entry not found",
      backupAvailable: false,
    };
  }

  const entry = data as RemovalLogEntry;

  if (entry.status !== "completed") {
    return {
      eligible: false,
      reason: `Removal not completed (status: ${entry.status})`,
      backupAvailable: entry.backup_snapshot !== null,
    };
  }

  if (entry.rollback_executed) {
    return {
      eligible: false,
      reason: `Already rolled back on ${entry.rollback_executed_at}`,
      backupAvailable: false,
    };
  }

  if (!entry.backup_snapshot) {
    return {
      eligible: false,
      reason: "No backup snapshot available",
      backupAvailable: false,
    };
  }

  if (!entry.rollback_expires_at) {
    return {
      eligible: false,
      reason: "No rollback window set",
      backupAvailable: true,
    };
  }

  const expiresAt = new Date(entry.rollback_expires_at);
  const now = new Date();

  if (expiresAt <= now) {
    return {
      eligible: false,
      reason: "Rollback window has expired",
      backupAvailable: true,
    };
  }

  const daysRemaining = Math.ceil(
    (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    eligible: true,
    reason: `Rollback available for ${daysRemaining} more days`,
    daysRemaining,
    backupAvailable: true,
  };
}

/**
 * Find orphaned NIP-05 records (no matching user_identities)
 */
export async function findOrphanedRecords(
  supabase: SupabaseClient,
  domain?: string,
  limit = 100
): Promise<VerificationResult> {
  // Get all nip05_records
  let nip05Query = supabase
    .from("nip05_records")
    .select("id, user_duid, domain, entity_type, created_at")
    .limit(limit * 2); // Get more to account for filtering

  if (domain) {
    nip05Query = nip05Query.eq("domain", domain);
  }

  const { data: nip05Records, error: nip05Error } = await nip05Query;

  if (nip05Error) {
    return { success: false, message: nip05Error.message };
  }

  if (!nip05Records || nip05Records.length === 0) {
    return { success: true, message: "No NIP-05 records found", data: [] };
  }

  // Get unique user_duids
  const userDuids = Array.from(
    new Set(nip05Records.map((r) => r.user_duid).filter(Boolean))
  );

  if (userDuids.length === 0) {
    return {
      success: true,
      message: "All records have null user_duid",
      data: nip05Records,
    };
  }

  // Check which user_duids exist in user_identities
  const { data: existingUsers, error: userError } = await supabase
    .from("user_identities")
    .select("id")
    .in("id", userDuids);

  if (userError) {
    return { success: false, message: userError.message };
  }

  const existingUserDuids = new Set((existingUsers || []).map((u) => u.id));
  const orphans = nip05Records.filter(
    (r) => r.user_duid && !existingUserDuids.has(r.user_duid)
  );

  return {
    success: true,
    message: `Found ${orphans.length} orphaned records out of ${nip05Records.length} total`,
    data: orphans.slice(0, limit),
  };
}

/**
 * Verify backup snapshot integrity
 */
export async function verifyBackupIntegrity(
  supabase: SupabaseClient,
  removalLogId: string
): Promise<VerificationResult> {
  const { data, error } = await supabase
    .from("admin_account_removal_log")
    .select("backup_snapshot, status, rollback_executed")
    .eq("id", removalLogId)
    .single();

  if (error || !data) {
    return { success: false, message: "Removal log entry not found" };
  }

  const backup = data.backup_snapshot as Record<string, unknown> | null;

  if (!backup) {
    return {
      success: false,
      message: "No backup snapshot exists for this removal",
    };
  }

  const requiredTables = ["user_identities", "nip05_records"];
  const missingTables = requiredTables.filter((table) => !(table in backup));

  if (missingTables.length > 0) {
    return {
      success: false,
      message: `Backup missing required tables: ${missingTables.join(", ")}`,
      data: { backup, missingTables },
    };
  }

  const tableStats = Object.entries(backup).map(([table, records]) => ({
    table,
    recordCount: Array.isArray(records) ? records.length : 0,
  }));

  return {
    success: true,
    message: "Backup snapshot is complete",
    data: { tableStats, canRollback: !data.rollback_executed },
  };
}

/**
 * Get removal statistics for admin dashboard
 */
export async function getRemovalStatistics(
  supabase: SupabaseClient,
  federationId?: string
): Promise<VerificationResult> {
  let baseQuery = supabase.from("admin_account_removal_log").select("*");

  if (federationId) {
    baseQuery = baseQuery.eq("admin_federation_id", federationId);
  }

  const { data, error } = await baseQuery;

  if (error) {
    return { success: false, message: error.message };
  }

  const entries = data as RemovalLogEntry[];
  const now = new Date();

  const stats = {
    total: entries.length,
    completed: entries.filter((e) => e.status === "completed").length,
    failed: entries.filter((e) => e.status === "failed").length,
    pending: entries.filter((e) =>
      ["pending", "confirmed", "executing"].includes(e.status)
    ).length,
    rolledBack: entries.filter((e) => e.rollback_executed).length,
    rollbackAvailable: entries.filter(
      (e) =>
        e.status === "completed" &&
        !e.rollback_executed &&
        e.rollback_expires_at &&
        new Date(e.rollback_expires_at) > now
    ).length,
    totalRecordsDeleted: entries.reduce(
      (sum, e) => sum + (e.records_deleted || 0),
      0
    ),
  };

  return {
    success: true,
    message: "Statistics retrieved successfully",
    data: stats,
  };
}
