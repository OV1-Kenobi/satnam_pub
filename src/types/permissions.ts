/**
 * Permission Types for Granular Nostr Event Signing
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Role hierarchy: private < offspring < adult < steward < guardian
 * - Privacy-first permission checking
 * - Zero-knowledge audit trail
 *
 * These types align with the database schema in:
 * supabase/migrations/20251217_event_signing_permissions.sql
 */

// ============================================================================
// ENUMS AND CONSTANTS
// ============================================================================

/**
 * Federation member roles in hierarchy order (lowest to highest)
 */
export type FederationRole =
  | "private"
  | "offspring"
  | "adult"
  | "steward"
  | "guardian";

/**
 * Role hierarchy level for permission comparison
 */
export const ROLE_HIERARCHY: Record<FederationRole, number> = {
  private: 0,
  offspring: 1,
  adult: 2,
  steward: 3,
  guardian: 4,
};

/**
 * Permission categories for organizing event types
 */
export type PermissionCategory =
  | "content_posting"
  | "messaging"
  | "media_content"
  | "identity_management"
  | "contact_management"
  | "privacy_settings"
  | "content_moderation"
  | "key_management"
  | "financial_operations"
  | "member_management"
  | "governance"
  | "engagement";

/**
 * Time window types for scheduled/temporary permissions
 */
export type TimeWindowType = "scheduled" | "temporary_elevation" | "cooldown";

/**
 * Audit log status values
 */
export type AuditLogStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "signed"
  | "failed"
  | "expired"
  | "executed";

/**
 * Permission check status for FROST sessions
 */
export type PermissionCheckStatus = "pending" | "approved" | "denied";

// ============================================================================
// DATABASE ENTITY TYPES
// ============================================================================

/**
 * Event signing permission (role-based, per federation)
 * Maps to: event_signing_permissions table
 */
export interface EventSigningPermission {
  id: string;
  federationId: string;
  role: FederationRole;
  targetRole?: FederationRole; // Alias for role (UI compatibility)
  eventType: string;
  nostrKind?: number;
  permissionCategory: PermissionCategory;
  canSign: boolean;
  allowed?: boolean; // Alias for canSign (UI compatibility)
  requiresApproval: boolean;
  approvalThreshold: number;
  approvedByRoles: FederationRole[];
  maxDailyCount?: number;
  dailyLimit?: number; // Alias for maxDailyCount (UI compatibility)
  contentRestrictions: ContentRestriction[];
  allowedTags: string[];
  canDelegate: boolean;
  delegatableToRoles: FederationRole[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Content restriction for permission validation
 */
export interface ContentRestriction {
  type: "regex" | "keyword_block" | "max_length" | "required_tag";
  value: string;
  errorMessage?: string;
}

/**
 * Member-specific permission override
 * Maps to: member_signing_overrides table
 */
export interface MemberSigningOverride {
  id: string;
  federationId: string;
  memberDuid: string;
  eventType: string;
  canSign?: boolean;
  allowed?: boolean; // Alias for canSign (UI compatibility)
  requiresApproval?: boolean;
  maxDailyCount?: number;
  customApprovedByRoles?: FederationRole[];
  validFrom: Date;
  validUntil?: Date;
  expiresAt?: Date; // Alias for validUntil (UI compatibility)
  grantedBy: string;
  grantReason?: string;
  reason?: string; // Alias for grantReason (UI compatibility)
  revokedBy?: string;
  revokedAt?: Date;
  revokeReason?: string;
  createdAt: Date;
}

/**
 * Signing audit log entry
 * Maps to: signing_audit_log table
 */
export interface SigningAuditLogEntry {
  id: string;
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
  approvedBy: string[];
  delegationId?: string;
  status: AuditLogStatus;
  errorMessage?: string;
  requestedAt: Date;
  completedAt?: Date;
  // UI-specific fields (derived from other fields or set by hooks)
  eventId?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectionReason?: string;
  executedAt?: Date;
}

/**
 * Permission time window configuration
 * Maps to: permission_time_windows table
 */
export interface PermissionTimeWindow {
  id: string;
  permissionId?: string;
  overrideId?: string;
  windowType: TimeWindowType;
  daysOfWeek: number[]; // 0=Sunday, 1=Monday, etc.
  startTime?: string; // HH:MM:SS format
  endTime?: string; // HH:MM:SS format
  timezone: string;
  elevationStart?: Date;
  elevationEnd?: Date;
  elevatedPermissions?: Partial<EventSigningPermission>;
  cooldownMinutes?: number;
  lastUsedAt?: Date;
  description?: string;
  createdBy: string;
  createdAt: Date;
}

/**
 * Cross-federation permission delegation
 * Maps to: federation_permission_delegations table
 */
export interface FederationPermissionDelegation {
  id: string;
  sourceFederationId: string;
  sourceRole: "steward" | "guardian";
  targetFederationId?: string;
  targetMemberDuid?: string;
  delegatedEventTypes: string[];
  canSubDelegate: boolean;
  maxDailyUses?: number;
  currentDailyUses: number;
  usesResetAt: Date;
  requiresSourceApproval: boolean;
  validFrom: Date;
  validUntil?: Date;
  revokedAt?: Date;
  revokeReason?: string;
  createdBy: string;
  createdAt: Date;
}

/**
 * Federation alliance for permission sharing
 * Maps to: federation_alliances table
 */
export interface FederationAlliance {
  id: string;
  allianceName: string;
  allianceDescription?: string;
  memberFederations: string[];
  sharedCategories: PermissionCategory[];
  requiresUnanimousApproval: boolean;
  minimumApprovalCount: number;
  inheritsPermissionsFrom?: string;
  inheritanceDepth: number;
  status: "pending" | "active" | "suspended" | "dissolved";
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// SERVICE RESULT TYPES
// ============================================================================

/**
 * Generic service result wrapper
 */
export interface ServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  approvalThreshold?: number;
  approvedByRoles?: FederationRole[];
  reason?: string;
  permissionId?: string;
  overrideId?: string;
  dailyUsageRemaining?: number;
}

/**
 * Effective permission combining role permission with member overrides
 */
export interface EffectivePermission {
  eventType: string;
  nostrKind?: number;
  permissionCategory: PermissionCategory;
  canSign: boolean;
  requiresApproval: boolean;
  approvalThreshold: number;
  approvedByRoles: FederationRole[];
  maxDailyCount?: number;
  dailyUsageCount: number;
  source: "role" | "override" | "delegation" | "alliance";
  sourceId: string;
  timeWindows?: PermissionTimeWindow[];
}

/**
 * Time window check result
 */
export interface TimeWindowCheckResult {
  allowed: boolean;
  reason?: string;
  nextWindowStart?: Date;
  cooldownRemaining?: number; // seconds
  currentWindow?: PermissionTimeWindow;
}

/**
 * Delegation check result
 */
export interface DelegationCheckResult {
  allowed: boolean;
  delegationId?: string;
  requiresSourceApproval: boolean;
  remainingDailyUses?: number;
  validUntil?: Date;
}

/**
 * Alliance permissions result
 */
export interface AlliancePermissionsResult {
  alliances: Array<{
    allianceId: string;
    allianceName: string;
    sharedCategories: PermissionCategory[];
    memberFederations: string[];
  }>;
  inheritedPermissions: EventSigningPermission[];
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to configure role permissions
 */
export interface ConfigureRolePermissionsRequest {
  federationId: string;
  targetRole: FederationRole;
  permissions: Array<{
    eventType: string;
    nostrKind?: number;
    permissionCategory?: PermissionCategory;
    canSign?: boolean;
    requiresApproval?: boolean;
    approvalThreshold?: number;
    approvedByRoles?: FederationRole[];
    maxDailyCount?: number;
    canDelegate?: boolean;
  }>;
}

/**
 * Request to set member override
 */
export interface SetMemberOverrideRequest {
  federationId: string;
  memberDuid: string;
  eventType: string;
  canSign?: boolean;
  requiresApproval?: boolean;
  maxDailyCount?: number;
  validUntil?: Date;
  grantReason?: string;
}

/**
 * Request to create time window
 */
export interface SetTimeWindowRequest {
  federationId: string;
  permissionId?: string;
  overrideId?: string;
  windowType: TimeWindowType;
  daysOfWeek?: number[];
  startTime?: string;
  endTime?: string;
  timezone?: string;
  elevationStart?: Date;
  elevationEnd?: Date;
  elevatedPermissions?: Partial<EventSigningPermission>;
  cooldownMinutes?: number;
  description?: string;
}

/**
 * Request to create cross-federation delegation
 */
export interface CreateDelegationRequest {
  targetFederationId?: string;
  targetMemberDuid?: string;
  delegatedEventTypes: string[];
  canSubDelegate?: boolean;
  maxDailyUses?: number;
  requiresSourceApproval?: boolean;
  validUntil?: Date;
}

/**
 * Pending approval queue item
 */
export interface PendingApprovalItem {
  auditLogId: string;
  sessionId: string;
  federationId: string;
  requesterDuid: string;
  requesterRole: FederationRole;
  eventType: string;
  nostrKind?: number;
  eventContentPreview?: string;
  requiredApprovals: number;
  currentApprovals: number;
  approvedBy: string[];
  requestedAt: Date;
  expiresAt: Date;
}

/**
 * Extended FROST session params with permission context
 */
export interface CreateSessionWithPermissionParams {
  familyId: string;
  messageHash: string;
  eventTemplate?: string;
  eventType: string;
  participants: string[];
  threshold: number;
  createdBy: string;
  expirationSeconds?: number;
  requiredPermissions?: string[];
  crossFederationContext?: {
    sourceFederationId: string;
    delegationId?: string;
  };
}

/**
 * Session creation result with permission info
 *
 * Status values:
 * - "created": Session was successfully created and is ready for use
 * - "approved": Approval threshold met, but session creation deferred to caller
 * - "pending_approval": Awaiting additional approvals before session can be created
 * - "denied": Permission denied or request rejected
 */
export interface SessionWithPermissionResult {
  success: boolean;
  sessionId?: string;
  status?: "created" | "approved" | "pending_approval" | "denied";
  error?: string;
  permissionCheck?: PermissionCheckResult;
  timeWindowCheck?: TimeWindowCheckResult;
  approvalRequired?: boolean;
  approvalQueueId?: string;
  nextWindowStart?: Date;
  cooldownRemaining?: number;
}
