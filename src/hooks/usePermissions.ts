/**
 * Permission Management Hooks
 *
 * Custom React hooks for managing event signing permissions,
 * approval queues, and audit logs.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Role-based permission checking
 * - Reactive permission state management
 * - Integration with permission APIs
 */

import { useCallback, useEffect, useState } from "react";
import type {
  AuditLogStatus,
  EffectivePermission,
  EventSigningPermission,
  FederationRole,
  MemberSigningOverride,
  SigningAuditLogEntry,
} from "../types/permissions";

// Use Netlify Functions endpoint for signing permissions
const PERMISSIONS_API = "/.netlify/functions/signing-permissions";

/**
 * Hook for fetching and managing federation permissions
 */
export function usePermissions(federationId: string | undefined) {
  const [permissions, setPermissions] = useState<EventSigningPermission[]>([]);
  const [overrides, setOverrides] = useState<MemberSigningOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    if (!federationId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(PERMISSIONS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "list",
          federationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        setPermissions(data.data.rolePermissions || []);
        setOverrides(data.data.memberOverrides || []);
      } else {
        setError(data.error || "Failed to fetch permissions");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [federationId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  return {
    permissions,
    overrides,
    loading,
    error,
    refresh: fetchPermissions,
  };
}

/**
 * Hook for fetching effective permissions for a specific member
 */
export function useMemberPermissions(
  federationId: string | undefined,
  memberDuid: string | undefined,
  memberRole: FederationRole = "adult"
) {
  const [effectivePermissions, setEffectivePermissions] = useState<
    EffectivePermission[] | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMemberPermissions = useCallback(async () => {
    if (!federationId || !memberDuid) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(PERMISSIONS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check",
          federationId,
          memberDuid,
          memberRole,
          eventType: "*", // Check all event types
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        // Transform check result to effective permissions format
        setEffectivePermissions(data.data ? [data.data] : null);
      } else {
        setError(data.error || "Failed to fetch member permissions");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [federationId, memberDuid, memberRole]);

  useEffect(() => {
    fetchMemberPermissions();
  }, [fetchMemberPermissions]);

  return {
    effectivePermissions,
    loading,
    error,
    refresh: fetchMemberPermissions,
  };
}

/**
 * Hook for managing the signing approval queue
 */
export function useApprovalQueue(
  federationId: string | undefined,
  approverRole?: FederationRole
) {
  const [pendingApprovals, setPendingApprovals] = useState<
    SigningAuditLogEntry[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    if (!federationId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(PERMISSIONS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pending",
          federationId,
          limit: 50,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        // Transform PendingApprovalItem[] to SigningAuditLogEntry[]
        const approvals = (data.data?.pendingApprovals || []).map(
          (item: {
            auditLogId: string;
            federationId: string;
            requesterDuid: string;
            requesterRole: FederationRole;
            eventType: string;
            nostrKind?: number;
            eventContentPreview?: string;
            requiredApprovals: number;
            currentApprovals: number;
            approvedBy: string[];
            requestedAt: string | Date;
          }) => ({
            id: item.auditLogId,
            federationId: item.federationId,
            memberDuid: item.requesterDuid,
            memberRole: item.requesterRole,
            eventType: item.eventType,
            nostrKind: item.nostrKind,
            eventContentPreview: item.eventContentPreview,
            approvalRequired: true,
            approvedBy: item.approvedBy,
            status: "pending" as const,
            requestedAt: new Date(item.requestedAt),
          })
        );
        setPendingApprovals(approvals);
      } else {
        setError(data.error || "Failed to fetch approval queue");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [federationId]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const approveRequest = useCallback(
    async (auditId: string, approvedBy: string) => {
      try {
        const response = await fetch(PERMISSIONS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve",
            auditLogId: auditId,
            approverId: approvedBy,
            approverRole: approverRole || "guardian",
          }),
        });

        if (!response.ok) {
          return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        const data = await response.json();

        if (data.success) {
          await fetchApprovals();
          return { success: true };
        }
        return { success: false, error: data.error };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Approval failed",
        };
      }
    },
    [fetchApprovals, approverRole]
  );

  const rejectRequest = useCallback(
    async (auditId: string, rejectedBy: string, reason?: string) => {
      try {
        const response = await fetch(PERMISSIONS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reject",
            auditLogId: auditId,
            rejecterId: rejectedBy,
            reason,
          }),
        });

        if (!response.ok) {
          return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        const data = await response.json();

        if (data.success) {
          await fetchApprovals();
          return { success: true };
        }
        return { success: false, error: data.error };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Rejection failed",
        };
      }
    },
    [fetchApprovals]
  );

  return {
    pendingApprovals,
    loading,
    error,
    refresh: fetchApprovals,
    approveRequest,
    rejectRequest,
    count: pendingApprovals.length,
  };
}

/**
 * Hook for querying the signing audit log
 */
export function useAuditLog(
  federationId: string | undefined,
  filters?: {
    memberDuid?: string;
    eventType?: string;
    status?: AuditLogStatus;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }
) {
  // Extract primitive values from filters to use in dependency array
  const memberDuid = filters?.memberDuid;
  const eventType = filters?.eventType;
  const status = filters?.status;
  const startDateStr = filters?.startDate?.toISOString();
  const endDateStr = filters?.endDate?.toISOString();
  const limit = filters?.limit ?? 100;
  const offset = filters?.offset ?? 0;

  const [auditLog, setAuditLog] = useState<SigningAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAuditLog = useCallback(async () => {
    if (!federationId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(PERMISSIONS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "audit",
          federationId,
          memberDuid,
          eventType,
          status,
          startDate: startDateStr,
          endDate: endDateStr,
          limit,
          offset,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setAuditLog(data.data?.auditLog || []);
      } else {
        setError(data.error || "Failed to fetch audit log");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [
    federationId,
    memberDuid,
    eventType,
    status,
    startDateStr,
    endDateStr,
    limit,
    offset,
  ]);

  useEffect(() => {
    fetchAuditLog();
  }, [fetchAuditLog]);

  return {
    auditLog,
    loading,
    error,
    refresh: fetchAuditLog,
  };
}
