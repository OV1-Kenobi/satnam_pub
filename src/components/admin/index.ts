/**
 * Admin Components Index
 * Exports all admin account control components
 * @module admin
 */

// Main Dashboard
export { AdminAccountControlDashboard } from "./AdminAccountControlDashboard";
export type {
  RemovalStats,
  RemovalLogEntry,
} from "./AdminAccountControlDashboard";

// Auth Guard
export {
  AdminAuthGuard,
  AdminAuthContext,
  useAdminContext,
  useRequiredAdminContext,
  hasPermission,
  canManageFederationAccounts,
} from "./AdminAuthGuard";
export type {
  AdminRole,
  AdminContext,
  AdminAuthGuardProps,
} from "./AdminAuthGuard";

// Tab Components
export { AccountsTab } from "./AccountsTab";
export { OverviewTab } from "./OverviewTab";
export { OrphansTab } from "./OrphansTab";
export { AuditLogTab } from "./AuditLogTab";
export { PendingDeletionsTab } from "./PendingDeletionsTab";

// Modals
export { AccountRemovalModal } from "./AccountRemovalModal";
export { RollbackConfirmationModal } from "./RollbackConfirmationModal";

// Search Panel
export { AccountSearchPanel } from "./AccountSearchPanel";
export type { AccountSearchResult } from "./AccountSearchPanel";
