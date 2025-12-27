/**
 * Admin Components Index
 * Exports all admin account control components
 * @module admin
 */

// Shared types (from centralized types file to avoid circular dependencies)
export type { RemovalLogEntry, RemovalStats } from "../../types/admin";

// Main Dashboard
export { AdminAccountControlDashboard } from "./AdminAccountControlDashboard";

// Auth Guard
export {
  AdminAuthContext,
  AdminAuthGuard,
  canManageFederationAccounts,
  hasPermission,
  useAdminContext,
  useRequiredAdminContext,
} from "./AdminAuthGuard";
export type {
  AdminAuthGuardProps,
  AdminContext,
  AdminRole,
} from "./AdminAuthGuard";

// Tab Components
export { AccountsTab } from "./AccountsTab";
export { AuditLogTab } from "./AuditLogTab";
export { OrphansTab } from "./OrphansTab";
export { OverviewTab } from "./OverviewTab";
export { PendingDeletionsTab } from "./PendingDeletionsTab";

// Modals
export { AccountRemovalModal } from "./AccountRemovalModal";
export { RollbackConfirmationModal } from "./RollbackConfirmationModal";

// Search Panel
export { AccountSearchPanel } from "./AccountSearchPanel";
export type { AccountSearchResult } from "./AccountSearchPanel";
