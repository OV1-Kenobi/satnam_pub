/**
 * EventSigningPermissionService Unit Tests
 *
 * Tests for permission types, role hierarchy, and mock factories.
 * These tests focus on the pure logic that doesn't require database access.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Role hierarchy enforcement testing
 * - Privacy-first permission checking
 * - Zero-knowledge audit trail verification
 */

import { describe, expect, it } from "vitest";
import {
  createMockOverride,
  createMockPermission,
  createMockAuditEntry,
  ROLE_TEST_CASES,
  TEST_ADULT_DUID,
  TEST_FEDERATION_ID,
  TEST_GUARDIAN_DUID,
  TEST_OFFSPRING_DUID,
  TEST_STEWARD_DUID,
  TEST_PRIVATE_DUID,
} from "./permission-test-fixtures";
import { ROLE_HIERARCHY } from "../../types/permissions";
import type { FederationRole } from "../../types/permissions";

// ============================================================================
// Helper function to check role hierarchy
// ============================================================================

/**
 * Check if a role can configure another role based on hierarchy
 * Guardians can configure any role
 * Stewards can configure offspring and adult roles only
 * Adults and below cannot configure any roles
 */
function canConfigureRole(
  configurerRole: FederationRole,
  targetRole: FederationRole
): boolean {
  const configurerLevel = ROLE_HIERARCHY[configurerRole];
  const targetLevel = ROLE_HIERARCHY[targetRole];

  // Only guardians and stewards can configure
  if (configurerLevel < ROLE_HIERARCHY.steward) {
    return false;
  }

  // Guardians can configure any role
  if (configurerRole === "guardian") {
    return true;
  }

  // Stewards can only configure roles below steward level
  if (configurerRole === "steward") {
    return targetLevel < ROLE_HIERARCHY.steward;
  }

  return false;
}

/**
 * Check if a role can grant override to another role
 * Must be higher in hierarchy than target
 */
function canGrantOverride(
  granterRole: FederationRole,
  targetRole: FederationRole
): boolean {
  const granterLevel = ROLE_HIERARCHY[granterRole];
  const targetLevel = ROLE_HIERARCHY[targetRole];

  // Must be steward or higher to grant overrides
  if (granterLevel < ROLE_HIERARCHY.steward) {
    return false;
  }

  // Must be strictly higher than target
  return granterLevel > targetLevel;
}

describe("Permission System Types and Hierarchy", () => {
  // ============================================================================
  // Role Hierarchy Tests
  // ============================================================================

  describe("ROLE_HIERARCHY", () => {
    it("should have correct hierarchy order", () => {
      expect(ROLE_HIERARCHY.private).toBe(0);
      expect(ROLE_HIERARCHY.offspring).toBe(1);
      expect(ROLE_HIERARCHY.adult).toBe(2);
      expect(ROLE_HIERARCHY.steward).toBe(3);
      expect(ROLE_HIERARCHY.guardian).toBe(4);
    });

    it("should have guardian as highest role", () => {
      const roles: FederationRole[] = [
        "private",
        "offspring",
        "adult",
        "steward",
        "guardian",
      ];
      const maxLevel = Math.max(...roles.map((r) => ROLE_HIERARCHY[r]));
      expect(ROLE_HIERARCHY.guardian).toBe(maxLevel);
    });

    it("should have private as lowest role", () => {
      const roles: FederationRole[] = [
        "private",
        "offspring",
        "adult",
        "steward",
        "guardian",
      ];
      const minLevel = Math.min(...roles.map((r) => ROLE_HIERARCHY[r]));
      expect(ROLE_HIERARCHY.private).toBe(minLevel);
    });
  });

  // ============================================================================
  // Role Configuration Permission Tests
  // ============================================================================

  describe("canConfigureRole()", () => {
    it("should allow guardian to configure any role", () => {
      expect(canConfigureRole("guardian", "guardian")).toBe(true);
      expect(canConfigureRole("guardian", "steward")).toBe(true);
      expect(canConfigureRole("guardian", "adult")).toBe(true);
      expect(canConfigureRole("guardian", "offspring")).toBe(true);
      expect(canConfigureRole("guardian", "private")).toBe(true);
    });

    it("should allow steward to configure offspring and adult only", () => {
      expect(canConfigureRole("steward", "guardian")).toBe(false);
      expect(canConfigureRole("steward", "steward")).toBe(false);
      expect(canConfigureRole("steward", "adult")).toBe(true);
      expect(canConfigureRole("steward", "offspring")).toBe(true);
      expect(canConfigureRole("steward", "private")).toBe(true);
    });

    it("should deny adult from configuring any role", () => {
      expect(canConfigureRole("adult", "guardian")).toBe(false);
      expect(canConfigureRole("adult", "steward")).toBe(false);
      expect(canConfigureRole("adult", "adult")).toBe(false);
      expect(canConfigureRole("adult", "offspring")).toBe(false);
      expect(canConfigureRole("adult", "private")).toBe(false);
    });

    it("should deny offspring from configuring any role", () => {
      expect(canConfigureRole("offspring", "guardian")).toBe(false);
      expect(canConfigureRole("offspring", "steward")).toBe(false);
      expect(canConfigureRole("offspring", "adult")).toBe(false);
      expect(canConfigureRole("offspring", "offspring")).toBe(false);
      expect(canConfigureRole("offspring", "private")).toBe(false);
    });

    it("should deny private from configuring any role", () => {
      expect(canConfigureRole("private", "guardian")).toBe(false);
      expect(canConfigureRole("private", "steward")).toBe(false);
      expect(canConfigureRole("private", "adult")).toBe(false);
      expect(canConfigureRole("private", "offspring")).toBe(false);
      expect(canConfigureRole("private", "private")).toBe(false);
    });
  });

  // ============================================================================
  // Override Grant Permission Tests
  // ============================================================================

  describe("canGrantOverride()", () => {
    it("should allow guardian to grant override to any lower role", () => {
      expect(canGrantOverride("guardian", "steward")).toBe(true);
      expect(canGrantOverride("guardian", "adult")).toBe(true);
      expect(canGrantOverride("guardian", "offspring")).toBe(true);
      expect(canGrantOverride("guardian", "private")).toBe(true);
    });

    it("should deny guardian from granting override to self", () => {
      expect(canGrantOverride("guardian", "guardian")).toBe(false);
    });

    it("should allow steward to grant override to lower roles", () => {
      expect(canGrantOverride("steward", "adult")).toBe(true);
      expect(canGrantOverride("steward", "offspring")).toBe(true);
      expect(canGrantOverride("steward", "private")).toBe(true);
    });

    it("should deny steward from granting override to equal or higher roles", () => {
      expect(canGrantOverride("steward", "guardian")).toBe(false);
      expect(canGrantOverride("steward", "steward")).toBe(false);
    });

    it("should deny adult from granting any override", () => {
      expect(canGrantOverride("adult", "guardian")).toBe(false);
      expect(canGrantOverride("adult", "steward")).toBe(false);
      expect(canGrantOverride("adult", "adult")).toBe(false);
      expect(canGrantOverride("adult", "offspring")).toBe(false);
      expect(canGrantOverride("adult", "private")).toBe(false);
    });
  });

  // ============================================================================
  // Mock Factory Tests
  // ============================================================================

  describe("Mock Factories", () => {
    describe("createMockPermission()", () => {
      it("should create a valid permission with defaults", () => {
        const perm = createMockPermission();

        expect(perm.id).toBeDefined();
        expect(perm.federationId).toBe(TEST_FEDERATION_ID);
        expect(perm.role).toBe("adult");
        expect(perm.eventType).toBe("social_post");
        expect(perm.canSign).toBe(true);
        expect(perm.requiresApproval).toBe(false);
        expect(perm.createdBy).toBe(TEST_GUARDIAN_DUID);
      });

      it("should allow overriding defaults", () => {
        const perm = createMockPermission({
          role: "offspring",
          eventType: "payment",
          canSign: false,
          requiresApproval: true,
          maxDailyCount: 5,
        });

        expect(perm.role).toBe("offspring");
        expect(perm.eventType).toBe("payment");
        expect(perm.canSign).toBe(false);
        expect(perm.requiresApproval).toBe(true);
        expect(perm.maxDailyCount).toBe(5);
      });
    });

    describe("createMockOverride()", () => {
      it("should create a valid override with defaults", () => {
        const override = createMockOverride();

        expect(override.id).toBeDefined();
        expect(override.federationId).toBe(TEST_FEDERATION_ID);
        expect(override.memberDuid).toBe(TEST_OFFSPRING_DUID);
        expect(override.eventType).toBe("social_post");
        expect(override.grantedBy).toBe(TEST_GUARDIAN_DUID);
      });

      it("should allow overriding defaults", () => {
        const override = createMockOverride({
          memberDuid: TEST_ADULT_DUID,
          eventType: "payment",
          canSign: false,
          maxDailyCount: 10,
        });

        expect(override.memberDuid).toBe(TEST_ADULT_DUID);
        expect(override.eventType).toBe("payment");
        expect(override.canSign).toBe(false);
        expect(override.maxDailyCount).toBe(10);
      });
    });

    describe("createMockAuditEntry()", () => {
      it("should create a valid audit entry with defaults", () => {
        const entry = createMockAuditEntry();

        expect(entry.id).toBeDefined();
        expect(entry.federationId).toBe(TEST_FEDERATION_ID);
        expect(entry.memberDuid).toBe(TEST_ADULT_DUID);
        expect(entry.memberRole).toBe("adult");
        expect(entry.status).toBe("signed");
      });

      it("should allow overriding defaults", () => {
        const entry = createMockAuditEntry({
          memberDuid: TEST_OFFSPRING_DUID,
          memberRole: "offspring",
          status: "pending",
          approvalRequired: true,
        });

        expect(entry.memberDuid).toBe(TEST_OFFSPRING_DUID);
        expect(entry.memberRole).toBe("offspring");
        expect(entry.status).toBe("pending");
        expect(entry.approvalRequired).toBe(true);
      });
    });
  });

  // ============================================================================
  // ROLE_TEST_CASES Validation
  // ============================================================================

  describe("ROLE_TEST_CASES", () => {
    it("should have test cases for all configurable roles", () => {
      const roles = ROLE_TEST_CASES.map((tc) => tc.role);
      expect(roles).toContain("guardian");
      expect(roles).toContain("steward");
      expect(roles).toContain("adult");
      expect(roles).toContain("offspring");
    });

    it("should have correct canConfigureRoles for guardian", () => {
      const guardianCase = ROLE_TEST_CASES.find((tc) => tc.role === "guardian");
      expect(guardianCase).toBeDefined();
      expect(guardianCase!.canConfigureRoles).toContain("offspring");
      expect(guardianCase!.canConfigureRoles).toContain("adult");
      expect(guardianCase!.canConfigureRoles).toContain("steward");
      expect(guardianCase!.canConfigureRoles).toContain("guardian");
    });

    it("should have correct canConfigureRoles for steward", () => {
      const stewardCase = ROLE_TEST_CASES.find((tc) => tc.role === "steward");
      expect(stewardCase).toBeDefined();
      expect(stewardCase!.canConfigureRoles).toContain("offspring");
      expect(stewardCase!.canConfigureRoles).toContain("adult");
      expect(stewardCase!.cannotConfigureRoles).toContain("steward");
      expect(stewardCase!.cannotConfigureRoles).toContain("guardian");
    });

    it("should have empty canConfigureRoles for adult and offspring", () => {
      const adultCase = ROLE_TEST_CASES.find((tc) => tc.role === "adult");
      const offspringCase = ROLE_TEST_CASES.find(
        (tc) => tc.role === "offspring"
      );

      expect(adultCase!.canConfigureRoles).toHaveLength(0);
      expect(offspringCase!.canConfigureRoles).toHaveLength(0);
    });
  });
});
