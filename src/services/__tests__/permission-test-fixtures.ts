/**
 * Permission Test Fixtures
 *
 * Shared test data and mock factories for permission system testing.
 * MASTER CONTEXT COMPLIANCE: Role hierarchy testing support
 */

import type {
  EventSigningPermission,
  FederationRole,
  MemberSigningOverride,
  PermissionCategory,
  SigningAuditLogEntry,
} from "../../types/permissions";

// ============================================================================
// TEST CONSTANTS
// ============================================================================

export const TEST_FEDERATION_ID = "test-federation-00000000-0000-0000-0000-000000000001";
export const TEST_GUARDIAN_DUID = "test-guardian-00000000-0000-0000-0000-000000000001";
export const TEST_STEWARD_DUID = "test-steward-00000000-0000-0000-0000-000000000002";
export const TEST_ADULT_DUID = "test-adult-00000000-0000-0000-0000-000000000003";
export const TEST_OFFSPRING_DUID = "test-offspring-00000000-0000-0000-0000-000000000004";
export const TEST_PRIVATE_DUID = "test-private-00000000-0000-0000-0000-000000000005";

// ============================================================================
// MOCK FACTORIES
// ============================================================================

/**
 * Create a mock EventSigningPermission
 */
export function createMockPermission(
  overrides: Partial<EventSigningPermission> = {}
): EventSigningPermission {
  return {
    id: `perm-${Date.now()}`,
    federationId: TEST_FEDERATION_ID,
    role: "adult" as FederationRole,
    eventType: "social_post",
    nostrKind: 1,
    permissionCategory: "content_posting" as PermissionCategory,
    canSign: true,
    requiresApproval: false,
    approvalThreshold: 1,
    approvedByRoles: ["guardian", "steward"] as FederationRole[],
    maxDailyCount: undefined,
    contentRestrictions: [],
    allowedTags: [],
    canDelegate: false,
    delegatableToRoles: [],
    createdBy: TEST_GUARDIAN_DUID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock MemberSigningOverride
 */
export function createMockOverride(
  overrides: Partial<MemberSigningOverride> = {}
): MemberSigningOverride {
  return {
    id: `override-${Date.now()}`,
    federationId: TEST_FEDERATION_ID,
    memberDuid: TEST_OFFSPRING_DUID,
    eventType: "social_post",
    canSign: true,
    requiresApproval: true,
    maxDailyCount: 5,
    validFrom: new Date(),
    validUntil: undefined,
    grantedBy: TEST_GUARDIAN_DUID,
    grantReason: "Test override",
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock SigningAuditLogEntry
 */
export function createMockAuditEntry(
  overrides: Partial<SigningAuditLogEntry> = {}
): SigningAuditLogEntry {
  return {
    id: `audit-${Date.now()}`,
    federationId: TEST_FEDERATION_ID,
    memberDuid: TEST_ADULT_DUID,
    memberRole: "adult" as FederationRole,
    eventType: "social_post",
    nostrKind: 1,
    approvalRequired: false,
    approvedBy: [],
    status: "signed",
    requestedAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// ROLE HIERARCHY TEST DATA
// ============================================================================

export const ROLE_TEST_CASES: Array<{
  role: FederationRole;
  duid: string;
  canConfigureRoles: FederationRole[];
  cannotConfigureRoles: FederationRole[];
}> = [
  {
    role: "guardian",
    duid: TEST_GUARDIAN_DUID,
    canConfigureRoles: ["offspring", "adult", "steward", "guardian"],
    cannotConfigureRoles: [],
  },
  {
    role: "steward",
    duid: TEST_STEWARD_DUID,
    canConfigureRoles: ["offspring", "adult"],
    cannotConfigureRoles: ["steward", "guardian"],
  },
  {
    role: "adult",
    duid: TEST_ADULT_DUID,
    canConfigureRoles: [],
    cannotConfigureRoles: ["offspring", "adult", "steward", "guardian"],
  },
  {
    role: "offspring",
    duid: TEST_OFFSPRING_DUID,
    canConfigureRoles: [],
    cannotConfigureRoles: ["offspring", "adult", "steward", "guardian"],
  },
];

// ============================================================================
// EVENT TYPE TEST DATA
// ============================================================================

export const EVENT_TYPES = {
  financial: ["payment", "invoice", "treasury_access"],
  social: ["social_post", "media_post", "profile_update"],
  governance: ["member_invite", "role_change", "policy_update"],
};

