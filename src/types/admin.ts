/**
 * Admin Types
 *
 * Shared types for admin components. Extracted to avoid circular
 * dependencies between AdminAccountControlDashboard and child components
 * like OverviewTab.
 */

/**
 * Statistics for account removal operations
 */
export interface RemovalStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  rolledBack: number;
  rollbackAvailable: number;
  totalRecordsDeleted: number;
}

/**
 * Log entry for an account removal operation
 */
export interface RemovalLogEntry {
  id: string;
  admin_user_duid: string;
  admin_type: "platform" | "federation";
  target_user_duid: string;
  target_nip05_duid: string;
  target_account_type: string;
  removal_reason: string;
  status: string;
  rollback_expires_at: string | null;
  rollback_executed: boolean;
  records_deleted: number;
  requested_at: string;
  completed_at: string | null;
}
