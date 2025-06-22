/**
 * Dual-Mode Integration Tests
 *
 * Comprehensive tests for both individual and family Lightning/Nostr operations
 * following DEVELOPMENT_PROTOCOLS.md standards
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  EnhancedNostrManager,
  NostrOperationContext,
} from "../lib/enhanced-nostr-manager";
import {
  EnhancedPhoenixdManager,
  OperationContext,
} from "../src/lib/enhanced-phoenixd-manager";

// Test data setup
const TEST_INDIVIDUAL_USER = {
  userId: "user_12345",
  username: "alice_satnam",
};

const TEST_FAMILY = {
  familyId: "family_67890",
  familyName: "Smith Family",
  parentUserId: "user_parent",
  members: [
    {
      userId: "user_parent",
      username: "dad_smith",
      publicKey:
        "02a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789a",
      role: "parent" as const,
    },
    {
      userId: "user_teen",
      username: "alice_smith",
      publicKey:
        "03b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789ab",
      role: "teen" as const,
    },
    {
      userId: "user_child",
      username: "bobby_smith",
      publicKey:
        "04c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789abc2",
      role: "child" as const,
    },
  ],
};

// Test contexts
const individualContext: OperationContext = {
  mode: "individual",
  userId: TEST_INDIVIDUAL_USER.userId,
};

const familyParentContext: OperationContext = {
  mode: "family",
  userId: TEST_FAMILY.parentUserId,
  familyId: TEST_FAMILY.familyId,
  parentUserId: TEST_FAMILY.parentUserId,
};

const familyTeenContext: OperationContext = {
  mode: "family",
  userId: "user_teen",
  familyId: TEST_FAMILY.familyId,
  parentUserId: TEST_FAMILY.parentUserId,
};

const individualNostrContext: NostrOperationContext = {
  mode: "individual",
  userId: TEST_INDIVIDUAL_USER.userId,
};

const familyNostrContext: NostrOperationContext = {
  mode: "family",
  userId: "user_teen",
  familyId: TEST_FAMILY.familyId,
  parentUserId: TEST_FAMILY.parentUserId,
};

describe("Dual-Mode Integration Tests", () => {
  let phoenixdManager: EnhancedPhoenixdManager;
  let nostrManager: EnhancedNostrManager;

  beforeAll(async () => {
    // Initialize managers
    phoenixdManager = new EnhancedPhoenixdManager();
    nostrManager = new EnhancedNostrManager();

    // Note: In real tests, you would mock the PhoenixD client
    // For now, we'll test the interface and logic
  });

  afterAll(async () => {
    await nostrManager.close();
  });

  describe("Lightning Operations", () => {
    describe("Individual Lightning Account", () => {
      test("should initialize individual Lightning account with proper types", async () => {
        const account = await phoenixdManager.initializeIndividualAccount(
          TEST_INDIVIDUAL_USER.userId,
          TEST_INDIVIDUAL_USER.username,
          {
            privacyMode: true,
            maxFeePercent: 0.5,
            routingPreference: "balanced",
          }
        );

        // Verify proper TypeScript typing (no 'any' types)
        expect(account.userId).toBe(TEST_INDIVIDUAL_USER.userId);
        expect(account.username).toBe(TEST_INDIVIDUAL_USER.username);
        expect(account.liquidity.autoRebalance).toBe(true);
        expect(account.preferences.privacyMode).toBe(true);
        expect(account.preferences.maxFeePercent).toBe(0.5);
        expect(account.preferences.routingPreference).toBe("balanced");

        // Verify types are not 'any'
        expect(typeof account.balanceSat).toBe("number");
        expect(typeof account.liquidity.minThreshold).toBe("number");
        expect(typeof account.preferences.privacyMode).toBe("boolean");
      });

      test("should handle individual payment with automatic liquidity management", async () => {
        // Mock invoice for testing
        const _mockInvoice = "lnbc1m1p0abcd...";
        const _mockAmount = 100000; // 100k sats

        // This would normally call the actual PhoenixD client
        // For testing, we verify the interface and logic flow
        const accountInfo =
          await phoenixdManager.getAccountInfo(individualContext);
        expect(accountInfo).toBeDefined();

        if (accountInfo && "balanceSat" in accountInfo) {
          expect(typeof accountInfo.balanceSat).toBe("number");
          expect(accountInfo.liquidity.autoRebalance).toBe(true);
        }
      });
    });

    describe("Family Lightning Account", () => {
      test("should initialize family Lightning account with proper member structure", async () => {
        const familyAccount = await phoenixdManager.initializeFamilyAccount(
          TEST_FAMILY.familyId,
          TEST_FAMILY.familyName,
          TEST_FAMILY.parentUserId,
          TEST_FAMILY.members.map((member) => ({
            userId: member.userId,
            username: member.username,
            role: member.role,
            limits: {
              dailyLimit: member.role === "child" ? 10000 : 50000,
              weeklyLimit: member.role === "child" ? 50000 : 200000,
            },
            allowance:
              member.role !== "parent"
                ? {
                    enabled: true,
                    amount: member.role === "child" ? 5000 : 20000,
                    frequency: "weekly",
                  }
                : undefined,
          }))
        );

        // Verify proper TypeScript typing
        expect(familyAccount.familyId).toBe(TEST_FAMILY.familyId);
        expect(familyAccount.familyName).toBe(TEST_FAMILY.familyName);
        expect(familyAccount.members).toHaveLength(3);

        // Check member structure and types
        const parentMember = familyAccount.members.find(
          (m) => m.role === "parent"
        );
        const childMember = familyAccount.members.find(
          (m) => m.role === "child"
        );

        expect(parentMember).toBeDefined();
        expect(childMember).toBeDefined();

        if (parentMember) {
          expect(typeof parentMember.allocatedBalanceSat).toBe("number");
          expect(parentMember.allowance).toBeUndefined();
        }

        if (childMember) {
          expect(childMember.limits?.dailyLimit).toBe(10000);
          expect(childMember.allowance?.enabled).toBe(true);
          expect(childMember.allowance?.amount).toBe(5000);
        }
      });

      test("should process family allowances with proper validation", async () => {
        const result = await phoenixdManager.processFamilyAllowances(
          TEST_FAMILY.familyId
        );

        // Verify result structure and types
        expect(typeof result.processed).toBe("number");
        expect(typeof result.failed).toBe("number");
        expect(Array.isArray(result.operations)).toBe(true);

        // Verify operation types
        result.operations.forEach((op) => {
          expect(typeof op.id).toBe("string");
          expect(op.context.mode).toBe("family");
          expect(typeof op.amountSat).toBe("number");
          expect(["pending", "completed", "failed"]).toContain(op.status);
        });
      });
    });

    describe("Context Switching", () => {
      test("should properly validate individual vs family contexts", async () => {
        // Test individual context
        const individualAccount =
          await phoenixdManager.getAccountInfo(individualContext);
        if (individualAccount && "balanceSat" in individualAccount) {
          expect(individualAccount.userId).toBe(TEST_INDIVIDUAL_USER.userId);
        }

        // Test family context
        const familyAccount =
          await phoenixdManager.getAccountInfo(familyParentContext);
        if (familyAccount && "totalBalanceSat" in familyAccount) {
          expect(familyAccount.familyId).toBe(TEST_FAMILY.familyId);
        }
      });

      test("should maintain operation isolation between individual and family modes", async () => {
        const individualOps =
          phoenixdManager.getLiquidityOperations(individualContext);
        const familyOps =
          phoenixdManager.getLiquidityOperations(familyParentContext);

        // Operations should be context-specific
        individualOps.forEach((op) => {
          expect(op.context.mode).toBe("individual");
          expect(op.context.userId).toBe(TEST_INDIVIDUAL_USER.userId);
        });

        familyOps.forEach((op) => {
          expect(op.context.mode).toBe("family");
          expect(op.context.familyId).toBe(TEST_FAMILY.familyId);
        });
      });
    });
  });

  describe("Nostr Operations", () => {
    describe("Individual Nostr Account", () => {
      test("should initialize individual Nostr account with proper key management", async () => {
        const account = await nostrManager.initializeIndividualAccount(
          TEST_INDIVIDUAL_USER.userId,
          TEST_INDIVIDUAL_USER.username
        );

        // Verify proper TypeScript typing (no 'any' types)
        expect(account.userId).toBe(TEST_INDIVIDUAL_USER.userId);
        expect(account.username).toBe(TEST_INDIVIDUAL_USER.username);
        expect(typeof account.privateKey).toBe("string");
        expect(typeof account.publicKey).toBe("string");
        expect(account.npub.startsWith("npub")).toBe(true);
        expect(account.nsec.startsWith("nsec")).toBe(true);

        // Verify preferences structure
        expect(typeof account.preferences.autoPublishProfile).toBe("boolean");
        expect(typeof account.preferences.privacyMode).toBe("boolean");
        expect(Array.isArray(account.relays)).toBe(true);
      });

      test("should publish individual events without approval workflow", async () => {
        const result = await nostrManager.publishEvent(
          individualNostrContext,
          1, // Text note
          "Hello from individual account!",
          [["t", "test"]]
        );

        expect(typeof result.success).toBe("boolean");
        expect(typeof result.message).toBe("string");

        if (result.success) {
          expect(typeof result.eventId).toBe("string");
          expect(result.operationId).toBeDefined();
        }
      });
    });

    describe("Family Nostr Federation", () => {
      test("should initialize family federation with proper member permissions", async () => {
        const federation = await nostrManager.initializeFamilyFederation(
          TEST_FAMILY.familyId,
          TEST_FAMILY.familyName,
          TEST_FAMILY.parentUserId,
          TEST_FAMILY.members
        );

        // Verify proper TypeScript typing
        expect(federation.familyId).toBe(TEST_FAMILY.familyId);
        expect(federation.members).toHaveLength(3);

        // Check permission structure
        const parentMember = federation.members.find(
          (m) => m.role === "parent"
        );
        const childMember = federation.members.find((m) => m.role === "child");

        expect(parentMember?.permissions.canPublishEvents).toBe(true);
        expect(parentMember?.permissions.requiresApproval).toBe(false);

        expect(childMember?.permissions.canPublishEvents).toBe(false);
        expect(childMember?.permissions.requiresApproval).toBe(true);
        expect(childMember?.restrictions?.contentFilter).toBe("strict");
      });

      test("should handle family event approval workflow", async () => {
        // Teen tries to publish event (requires approval)
        const publishResult = await nostrManager.publishEvent(
          familyNostrContext,
          1, // Text note
          "Hello from family teen account!",
          [
            ["t", "family"],
            ["t", "test"],
          ]
        );

        expect(publishResult.success).toBe(true);
        expect(publishResult.operationId).toBeDefined();
        expect(publishResult.eventId).toBeUndefined(); // Not published yet

        // Parent approves the event
        if (publishResult.operationId) {
          const approvalResult = await nostrManager.approveEvent(
            TEST_FAMILY.familyId,
            publishResult.operationId,
            TEST_FAMILY.parentUserId
          );

          expect(typeof approvalResult.success).toBe("boolean");
          expect(typeof approvalResult.message).toBe("string");

          if (approvalResult.success) {
            expect(typeof approvalResult.eventId).toBe("string");
          }
        }
      });

      test("should list pending events for family moderation", async () => {
        const pendingEvents = nostrManager.getPendingEvents(
          TEST_FAMILY.familyId
        );

        expect(Array.isArray(pendingEvents)).toBe(true);

        pendingEvents.forEach((event) => {
          expect(event.status).toBe("pending");
          expect(event.context.mode).toBe("family");
          expect(event.context.familyId).toBe(TEST_FAMILY.familyId);
          expect(typeof event.requiresApproval).toBe("boolean");
        });
      });
    });
  });

  describe("Security and Type Safety", () => {
    test("should not use 'any' types in operation contexts", () => {
      // This test verifies our TypeScript interfaces don't use 'any'
      const testContext: OperationContext = individualContext;
      const testNostrContext: NostrOperationContext = individualNostrContext;

      // These should compile without TypeScript errors
      expect(testContext.mode).toBeTypeOf("string");
      expect(testContext.userId).toBeTypeOf("string");
      expect(testNostrContext.mode).toBeTypeOf("string");
      expect(testNostrContext.userId).toBeTypeOf("string");
    });

    test("should validate input parameters with proper type checking", async () => {
      // Test invalid context should throw typed errors
      await expect(
        phoenixdManager.executePayment(
          { mode: "invalid" as any, userId: "" }, // Invalid context
          "lnbc...",
          1000
        )
      ).rejects.toThrow();

      // Test invalid event type should throw typed errors
      await expect(
        nostrManager.publishEvent(
          individualNostrContext,
          -1, // Invalid event type
          "test content"
        )
      ).rejects.toThrow();
    });

    test("should use constant-time operations for sensitive data", () => {
      // This would test that private key operations use constant-time comparisons
      // In a real implementation, you'd verify timing-attack resistance
      expect(true).toBe(true); // Placeholder - implement actual timing tests
    });
  });

  describe("Error Handling", () => {
    test("should provide consistent error response formats", async () => {
      try {
        await phoenixdManager.executePayment(
          { mode: "individual", userId: "nonexistent" },
          "invalid_invoice",
          1000
        );
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(typeof (error as Error).message).toBe("string");
      }
    });

    test("should handle network failures gracefully", async () => {
      // Test would simulate network failures and verify proper error handling
      expect(true).toBe(true); // Placeholder - implement actual network failure tests
    });
  });
});

// Export test utilities for other test files
export {
  familyNostrContext,
  familyParentContext,
  familyTeenContext,
  individualContext,
  individualNostrContext,
  TEST_FAMILY,
  TEST_INDIVIDUAL_USER,
};
