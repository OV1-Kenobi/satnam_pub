/**
 * Signing Audit Service
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Immutable audit trail for all signing operations
 * - Privacy-first logging (no sensitive content exposure)
 * - Role-based access to audit logs
 *
 * This service handles:
 * - Creating audit log entries for signing requests
 * - Updating audit status (approved, rejected, signed, failed)
 * - Querying audit logs with filters
 */

import { createClient } from "@supabase/supabase-js";
import type {
  AuditLogStatus,
  FederationRole,
  SigningAuditLogEntry,
} from "../types/permissions";

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase configuration for SigningAuditService");
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Map database row to TypeScript interface
 */
function mapDbAuditToInterface(
  row: Record<string, unknown>
): SigningAuditLogEntry {
  return {
    id: row.id as string,
    federationId: row.federation_id as string,
    sessionId: row.session_id as string | undefined,
    memberDuid: row.member_duid as string,
    memberRole: row.member_role as FederationRole,
    eventType: row.event_type as string,
    nostrKind: row.nostr_kind as number | undefined,
    eventHash: row.event_hash as string | undefined,
    eventContentPreview: row.event_content_preview as string | undefined,
    permissionId: row.permission_id as string | undefined,
    overrideId: row.override_id as string | undefined,
    approvalRequired: row.approval_required as boolean,
    approvedBy: (row.approved_by as string[]) || [],
    delegationId: row.delegation_id as string | undefined,
    status: row.status as AuditLogStatus,
    errorMessage: row.error_message as string | undefined,
    requestedAt: new Date(row.requested_at as string),
    completedAt: row.completed_at
      ? new Date(row.completed_at as string)
      : undefined,
  };
}

/**
 * Signing Audit Service
 */
export class SigningAuditService {
  /**
   * Create a new audit log entry for a signing request
   */
  static async createAuditEntry(params: {
    federationId: string;
    sessionId?: string;
    memberDuid: string;
    memberRole: FederationRole;
    eventType: string;
    nostrKind?: number;
    eventHash?: string;
    eventContentPreview?: string;
    permissionId?: string;
    overrideId?: string;
    approvalRequired: boolean;
    delegationId?: string;
  }): Promise<{ success: boolean; auditId?: string; error?: string }> {
    try {
      // Truncate content preview for privacy (max 200 chars)
      const preview = params.eventContentPreview?.substring(0, 200);

      const { data, error } = await supabase
        .from("signing_audit_log")
        .insert({
          federation_id: params.federationId,
          session_id: params.sessionId,
          member_duid: params.memberDuid,
          member_role: params.memberRole,
          event_type: params.eventType,
          nostr_kind: params.nostrKind,
          event_hash: params.eventHash,
          event_content_preview: preview,
          permission_id: params.permissionId,
          override_id: params.overrideId,
          approval_required: params.approvalRequired,
          approved_by: [],
          delegation_id: params.delegationId,
          status: params.approvalRequired ? "pending" : "signed",
          requested_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) {
        return {
          success: false,
          error: `Failed to create audit entry: ${error.message}`,
        };
      }

      return { success: true, auditId: data.id };
    } catch (error) {
      console.error("[SigningAuditService] createAuditEntry error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Audit creation failed",
      };
    }
  }

  /**
   * Update audit entry status
   */
  static async updateStatus(
    auditId: string,
    status: AuditLogStatus,
    additionalData?: {
      approvedBy?: string;
      errorMessage?: string;
      eventHash?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: Record<string, unknown> = { status };

      if (status === "signed" || status === "failed" || status === "rejected") {
        updateData.completed_at = new Date().toISOString();
      }

      if (additionalData?.errorMessage) {
        updateData.error_message = additionalData.errorMessage;
      }

      if (additionalData?.eventHash) {
        updateData.event_hash = additionalData.eventHash;
      }

      // Handle approval addition atomically using PostgreSQL array_append
      // This prevents race conditions when multiple approvers act concurrently
      if (additionalData?.approvedBy) {
        // Use raw SQL for atomic array append with uniqueness check
        // PostgreSQL: array_append only if value not already in array
        const { error: appendError } = await supabase.rpc(
          "append_audit_approver",
          {
            p_audit_id: auditId,
            p_approver: additionalData.approvedBy,
          }
        );

        if (appendError) {
          // Fallback: Try direct update if RPC doesn't exist
          // This is less safe but maintains backwards compatibility
          console.warn(
            "[SigningAuditService] RPC append_audit_approver not available, using fallback:",
            appendError.message
          );

          const { data: current } = await supabase
            .from("signing_audit_log")
            .select("approved_by")
            .eq("id", auditId)
            .single();

          const currentApprovers = (current?.approved_by as string[]) || [];
          if (!currentApprovers.includes(additionalData.approvedBy)) {
            updateData.approved_by = [
              ...currentApprovers,
              additionalData.approvedBy,
            ];
          }
        }
        // If RPC succeeded, approved_by is already updated atomically
      }

      const { error } = await supabase
        .from("signing_audit_log")
        .update(updateData)
        .eq("id", auditId);

      if (error) {
        return {
          success: false,
          error: `Failed to update audit status: ${error.message}`,
        };
      }

      return { success: true };
    } catch (error) {
      console.error("[SigningAuditService] updateStatus error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Status update failed",
      };
    }
  }

  /**
   * Get audit entries for a federation with filters
   */
  static async getAuditLog(params: {
    federationId: string;
    memberDuid?: string;
    eventType?: string;
    status?: AuditLogStatus;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{
    success: boolean;
    data?: SigningAuditLogEntry[];
    error?: string;
  }> {
    try {
      let query = supabase
        .from("signing_audit_log")
        .select("*")
        .eq("federation_id", params.federationId)
        .order("requested_at", { ascending: false });

      if (params.memberDuid) {
        query = query.eq("member_duid", params.memberDuid);
      }
      if (params.eventType) {
        query = query.eq("event_type", params.eventType);
      }
      if (params.status) {
        query = query.eq("status", params.status);
      }
      if (params.startDate) {
        query = query.gte("requested_at", params.startDate.toISOString());
      }
      if (params.endDate) {
        query = query.lte("requested_at", params.endDate.toISOString());
      }

      const limit = params.limit || 50;
      const offset = params.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        return {
          success: false,
          error: `Failed to query audit log: ${error.message}`,
        };
      }

      return {
        success: true,
        data: (data || []).map(mapDbAuditToInterface),
      };
    } catch (error) {
      console.error("[SigningAuditService] getAuditLog error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Query failed",
      };
    }
  }

  /**
   * Get pending approval requests that can be approved by the given role
   *
   * Filters audit log entries to only show those where:
   * 1. Status is 'pending' and approval_required is true
   * 2. The approver's role is in the permission's approved_by_roles array
   *
   * Uses a join with event_signing_permissions to enforce role-based access.
   */
  static async getPendingApprovals(params: {
    federationId: string;
    approverRole: FederationRole;
    limit?: number;
  }): Promise<{
    success: boolean;
    data?: SigningAuditLogEntry[];
    error?: string;
  }> {
    try {
      // Query pending entries and join with permissions to filter by approver role
      // The permission_id links audit entries to their permission configuration
      const { data, error } = await supabase
        .from("signing_audit_log")
        .select(
          `
          *,
          event_signing_permissions!inner(
            approved_by_roles
          )
        `
        )
        .eq("federation_id", params.federationId)
        .eq("status", "pending")
        .eq("approval_required", true)
        .contains("event_signing_permissions.approved_by_roles", [
          params.approverRole,
        ])
        .order("requested_at", { ascending: true })
        .limit(params.limit || 20);

      if (error) {
        // Fallback: If join fails (e.g., permission_id is null), query without filter
        // This handles entries created before permissions were configured
        console.warn(
          "[SigningAuditService] Role-filtered query failed, using fallback:",
          error.message
        );

        // For Guardian/Steward roles, show all pending approvals
        // Other roles should not see any pending approvals
        if (
          params.approverRole !== "guardian" &&
          params.approverRole !== "steward"
        ) {
          return { success: true, data: [] };
        }

        const { data: fallbackData, error: fallbackError } = await supabase
          .from("signing_audit_log")
          .select("*")
          .eq("federation_id", params.federationId)
          .eq("status", "pending")
          .eq("approval_required", true)
          .order("requested_at", { ascending: true })
          .limit(params.limit || 20);

        if (fallbackError) {
          return {
            success: false,
            error: `Failed to query pending approvals: ${fallbackError.message}`,
          };
        }

        return {
          success: true,
          data: (fallbackData || []).map(mapDbAuditToInterface),
        };
      }

      // Map results, stripping the joined permission data
      const mappedData = (data || []).map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { event_signing_permissions, ...auditRow } = row;
        return mapDbAuditToInterface(auditRow);
      });

      return {
        success: true,
        data: mappedData,
      };
    } catch (error) {
      console.error("[SigningAuditService] getPendingApprovals error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Query failed",
      };
    }
  }

  /**
   * Get a single audit entry by ID
   */
  static async getAuditEntry(auditId: string): Promise<{
    success: boolean;
    data?: SigningAuditLogEntry;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase
        .from("signing_audit_log")
        .select("*")
        .eq("id", auditId)
        .single();

      if (error) {
        return {
          success: false,
          error: `Failed to get audit entry: ${error.message}`,
        };
      }

      return {
        success: true,
        data: mapDbAuditToInterface(data),
      };
    } catch (error) {
      console.error("[SigningAuditService] getAuditEntry error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Query failed",
      };
    }
  }
}
