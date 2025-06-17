/**
 * ALLOWANCE AUTOMATION SYSTEM INTEGRATION TESTS
 *
 * Real integration tests for automated allowance distribution with Lightning support.
 * Requires real credentials to be provided via environment variables.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import {
  encryptSensitiveData,
  generateSecureUUID,
} from "../../../lib/privacy/encryption";
import { supabase } from "../../../lib/supabase";
import { AllowanceAutomationSystem } from "../allowance-automation";

// Test configuration
const TEST_CONFIG = {
  familyId: process.env.TEST_FAMILY_ID || generateSecureUUID(),
  parentMemberId: process.env.TEST_PARENT_MEMBER_ID || generateSecureUUID(),
  childMemberId: process.env.TEST_CHILD_MEMBER_ID || generateSecureUUID(),
  zeusLspEndpoint: process.env.ZEUS_LSP_ENDPOINT || "",
  zeusApiKey: process.env.ZEUS_API_KEY || "",
  realCredentials: Boolean(
    process.env.ZEUS_LSP_ENDPOINT && process.env.ZEUS_API_KEY,
  ),
};

describe("Allowance Automation System Integration Tests", () => {
  let automationSystem: AllowanceAutomationSystem;
  let testScheduleId: string;
  let testDataCreated = false;

  beforeAll(async () => {
    console.log("🤖 Starting Allowance Automation System integration tests...");
    console.log(`Real credentials available: ${TEST_CONFIG.realCredentials}`);

    if (!TEST_CONFIG.realCredentials) {
      console.warn("⚠️  Using mock credentials - some tests will be skipped");
    }

    // Initialize automation system
    const lspConfig = TEST_CONFIG.realCredentials
      ? {
          endpoint: TEST_CONFIG.zeusLspEndpoint,
          apiKey: TEST_CONFIG.zeusApiKey,
        }
      : undefined;

    automationSystem = new AllowanceAutomationSystem(lspConfig);
  });

  beforeEach(async () => {
    // Create test data if using real credentials
    if (TEST_CONFIG.realCredentials && !testDataCreated) {
      try {
        // Create test family
        const { error: familyError } = await supabase
          .from("secure_families")
          .upsert({
            family_uuid: TEST_CONFIG.familyId,
            member_count: 2,
            privacy_level: 3,
            encryption_version: "1.0",
            allowance_automation_enabled: true,
            zeus_integration_enabled: true,
            zeus_lsp_endpoint: TEST_CONFIG.zeusLspEndpoint,
            emergency_protocols_enabled: true,
            liquidity_monitoring_enabled: true,
          });

        if (familyError) {
          console.warn("⚠️  Failed to create test family:", familyError);
          return;
        }

        // Create test family members
        const encryptedFamilyId = await encryptSensitiveData(
          TEST_CONFIG.familyId,
        );
        const encryptedParentName = await encryptSensitiveData("Test Parent");
        const encryptedChildName = await encryptSensitiveData("Test Child");

        await supabase.from("secure_family_members").upsert([
          {
            member_uuid: TEST_CONFIG.parentMemberId,
            encrypted_family_id: encryptedFamilyId.encrypted,
            family_salt: encryptedFamilyId.salt,
            family_iv: encryptedFamilyId.iv,
            family_tag: encryptedFamilyId.tag,
            encrypted_name: encryptedParentName.encrypted,
            name_salt: encryptedParentName.salt,
            name_iv: encryptedParentName.iv,
            name_tag: encryptedParentName.tag,
            role: "parent",
            age_group: "adult",
            permission_level: 5,
            active: true,
            privacy_consent_given: true,
          },
          {
            member_uuid: TEST_CONFIG.childMemberId,
            encrypted_family_id: encryptedFamilyId.encrypted,
            family_salt: encryptedFamilyId.salt,
            family_iv: encryptedFamilyId.iv,
            family_tag: encryptedFamilyId.tag,
            encrypted_name: encryptedChildName.encrypted,
            name_salt: encryptedChildName.salt,
            name_iv: encryptedChildName.iv,
            name_tag: encryptedChildName.tag,
            role: "child",
            age_group: "child",
            permission_level: 1,
            active: true,
            privacy_consent_given: true,
          },
        ]);

        testDataCreated = true;
        console.log("✅ Test family and members created successfully");
      } catch (error) {
        console.warn("⚠️  Failed to create test data:", error);
      }
    }
  });

  afterAll(async () => {
    // Cleanup test data
    if (testDataCreated) {
      try {
        await supabase
          .from("secure_family_members")
          .delete()
          .in("member_uuid", [
            TEST_CONFIG.parentMemberId,
            TEST_CONFIG.childMemberId,
          ]);
        await supabase
          .from("secure_families")
          .delete()
          .eq("family_uuid", TEST_CONFIG.familyId);

        if (testScheduleId) {
          await supabase
            .from("secure_allowance_schedules")
            .delete()
            .eq("schedule_uuid", testScheduleId);
        }

        console.log("🧹 Test data cleaned up");
      } catch (error) {
        console.warn("⚠️  Failed to cleanup test data:", error);
      }
    }
  });

  describe("System Initialization", () => {
    test("should initialize with Zeus LSP configuration", () => {
      expect(automationSystem).toBeDefined();
      expect(automationSystem.zeusLspEnabled).toBe(TEST_CONFIG.realCredentials);
    });

    test("should validate configuration parameters", () => {
      const validConfig = {
        endpoint: "https://test.zeusln.app",
        apiKey: "test-key",
      };

      expect(() => new AllowanceAutomationSystem(validConfig)).not.toThrow();
      expect(() => new AllowanceAutomationSystem(undefined)).not.toThrow();
    });
  });

  describe("Allowance Schedule Management", () => {
    test("should create allowance schedule with real data", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping schedule creation test - no credentials provided",
        );
        return;
      }

      const scheduleConfig = {
        amount: 50000, // 50k sats weekly
        frequency: "weekly" as const,
        dayOfWeek: 1, // Monday
        enabled: true,
        conditions: {
          maxDailySpend: 20000,
          maxTransactionSize: 10000,
          restrictedCategories: ["gambling", "adult"],
          requireApprovalAbove: 25000,
          pauseOnSuspiciousActivity: true,
          spendingVelocityLimits: {
            maxTransactionsPerHour: 5,
            maxTransactionsPerDay: 20,
            cooldownPeriod: 300, // 5 minutes
          },
        },
        autoApprovalLimit: 15000,
        parentApprovalRequired: false,
        preferredMethod: "auto" as const,
        maxRetries: 3,
        retryDelay: 30,
        notificationSettings: {
          notifyOnDistribution: true,
          notifyOnFailure: true,
          notifyOnSuspiciousActivity: true,
          notificationMethods: ["email" as const, "push" as const],
          escalationPolicy: {
            retryCount: 2,
            escalationDelay: 60,
            escalationContacts: [TEST_CONFIG.parentMemberId],
          },
        },
      };

      const createdSchedule = await automationSystem.createAllowanceSchedule(
        TEST_CONFIG.familyId,
        TEST_CONFIG.childMemberId,
        scheduleConfig,
      );

      expect(createdSchedule).toBeDefined();
      expect(createdSchedule.id).toBeDefined();
      expect(createdSchedule.familyId).toBe(TEST_CONFIG.familyId);
      expect(createdSchedule.familyMemberId).toBe(TEST_CONFIG.childMemberId);
      expect(createdSchedule.amount).toBe(scheduleConfig.amount);
      expect(createdSchedule.frequency).toBe(scheduleConfig.frequency);
      expect(createdSchedule.enabled).toBe(true);

      testScheduleId = createdSchedule.id;
      console.log("✅ Allowance schedule created:", testScheduleId);
    }, 15000);

    test("should validate schedule parameters", async () => {
      const invalidSchedule = {
        amount: -1000, // Invalid negative amount
        frequency: "invalid" as any,
        enabled: true,
        conditions: {},
        autoApprovalLimit: 0,
        parentApprovalRequired: false,
        preferredMethod: "auto" as const,
        maxRetries: 0,
        retryDelay: 5,
        notificationSettings: {
          notifyOnDistribution: true,
          notifyOnFailure: true,
          notifyOnSuspiciousActivity: true,
          notificationMethods: ["email" as const],
        },
      };

      await expect(
        automationSystem.createAllowanceSchedule(
          TEST_CONFIG.familyId,
          TEST_CONFIG.childMemberId,
          invalidSchedule,
        ),
      ).rejects.toThrow();
    });

    test("should update existing schedule", async () => {
      if (!TEST_CONFIG.realCredentials || !testScheduleId) {
        console.log(
          "⏭️  Skipping schedule update test - no credentials or schedule",
        );
        return;
      }

      const updateConfig = {
        amount: 75000, // Increase to 75k sats
        frequency: "weekly" as const,
        dayOfWeek: 1,
        enabled: true,
        conditions: {
          maxDailySpend: 30000, // Increased limit
          maxTransactionSize: 15000,
          requireApprovalAbove: 35000,
          pauseOnSuspiciousActivity: true,
        },
        autoApprovalLimit: 20000,
        parentApprovalRequired: false,
        preferredMethod: "zeus_jit" as const, // Changed to Zeus JIT
        maxRetries: 5,
        retryDelay: 45,
        notificationSettings: {
          notifyOnDistribution: true,
          notifyOnFailure: true,
          notifyOnSuspiciousActivity: true,
          notificationMethods: ["email" as const, "sms" as const],
        },
      };

      const updatedSchedule = await automationSystem.updateAllowanceSchedule(
        testScheduleId,
        updateConfig,
      );

      expect(updatedSchedule).toBeDefined();
      expect(updatedSchedule.amount).toBe(updateConfig.amount);
      expect(updatedSchedule.preferredMethod).toBe("zeus_jit");
      expect(updatedSchedule.maxRetries).toBe(5);

      console.log("✅ Allowance schedule updated successfully");
    }, 10000);
  });

  describe("Allowance Distribution Processing", () => {
    test("should process pending allowances", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping allowance processing test - no credentials provided",
        );
        return;
      }

      const processingResult =
        await automationSystem.processPendingAllowances();

      expect(processingResult).toBeDefined();
      expect(processingResult.processed).toBeGreaterThanOrEqual(0);
      expect(processingResult.successful).toBeGreaterThanOrEqual(0);
      expect(processingResult.failed).toBeGreaterThanOrEqual(0);
      expect(processingResult.pendingApproval).toBeGreaterThanOrEqual(0);
      expect(processingResult.totalAmount).toBeGreaterThanOrEqual(0);
      expect(processingResult.totalFees).toBeGreaterThanOrEqual(0);
      expect(processingResult.processingTimeMs).toBeGreaterThan(0);
      expect(Array.isArray(processingResult.details)).toBe(true);

      console.log("🔄 Processing result:", {
        processed: processingResult.processed,
        successful: processingResult.successful,
        failed: processingResult.failed,
        pendingApproval: processingResult.pendingApproval,
        totalAmount: processingResult.totalAmount,
        processingTime: processingResult.processingTimeMs,
      });
    }, 30000);

    test("should handle distribution with Zeus JIT fallback", async () => {
      if (!TEST_CONFIG.realCredentials || !testScheduleId) {
        console.log("⏭️  Skipping Zeus JIT test - no credentials or schedule");
        return;
      }

      // Create a distribution that might need Zeus JIT
      const distributionResult = await automationSystem.executeDistribution(
        testScheduleId,
        TEST_CONFIG.childMemberId,
        100000, // 100k sats
        {
          useZeusJit: true,
          maxWaitTime: 60000, // 1 minute
          fallbackMethod: "emergency_reserve",
        },
      );

      expect(distributionResult).toBeDefined();
      expect(distributionResult.success).toBeDefined();
      expect(distributionResult.distributionId).toBeDefined();
      expect(distributionResult.amount).toBe(100000);
      expect(distributionResult.method).toBeDefined();

      if (distributionResult.success) {
        expect(distributionResult.transactionId).toBeDefined();
        expect(distributionResult.fee).toBeGreaterThanOrEqual(0);
        expect(distributionResult.executionTime).toBeGreaterThan(0);
      }

      console.log("⚡ Zeus JIT distribution result:", {
        success: distributionResult.success,
        method: distributionResult.method,
        zeusJitUsed: distributionResult.zeusJitUsed,
        fee: distributionResult.fee,
      });
    }, 45000);
  });

  describe("Retry Logic and Error Handling", () => {
    test("should handle failed distributions with retry", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log("⏭️  Skipping retry logic test - no credentials provided");
        return;
      }

      // Create a distribution that's likely to fail (invalid destination)
      const retryResult = await automationSystem.retryFailedDistribution(
        "invalid-distribution-id",
        {
          maxRetries: 2,
          retryDelay: 5000, // 5 seconds
          exponentialBackoff: true,
          useZeusJitFallback: true,
        },
      );

      expect(retryResult).toBeDefined();
      expect(retryResult.success).toBeDefined();
      expect(retryResult.retryCount).toBeGreaterThanOrEqual(0);
      expect(retryResult.finalAttempt).toBeDefined();

      console.log("🔄 Retry result:", retryResult);
    }, 20000);

    test("should escalate on repeated failures", async () => {
      const escalationResult =
        await automationSystem.escalateFailedDistribution(
          "test-distribution-id",
          {
            failureCount: 3,
            lastError: "Payment timeout",
            escalationContacts: [TEST_CONFIG.parentMemberId],
            notificationMethods: ["email", "push"],
          },
        );

      expect(escalationResult).toBeDefined();
      expect(escalationResult.escalated).toBe(true);
      expect(escalationResult.escalationId).toBeDefined();
      expect(escalationResult.notificationsSent).toBeGreaterThan(0);

      console.log("🚨 Escalation result:", escalationResult);
    });
  });

  describe("Spending Controls and Limits", () => {
    test("should enforce spending limits", async () => {
      const spendingCheck = await automationSystem.checkSpendingLimits(
        TEST_CONFIG.childMemberId,
        {
          transactionAmount: 15000,
          dailySpent: 10000,
          limits: {
            maxDailySpend: 20000,
            maxTransactionSize: 10000,
            maxTransactionsPerDay: 20,
          },
        },
      );

      expect(spendingCheck).toBeDefined();
      expect(spendingCheck.allowed).toBeDefined();
      expect(spendingCheck.reason).toBeDefined();
      expect(spendingCheck.remainingLimit).toBeDefined();

      // This should fail due to transaction size limit
      expect(spendingCheck.allowed).toBe(false);
      expect(spendingCheck.reason).toContain("transaction size");

      console.log("🛡️  Spending limit check:", spendingCheck);
    });

    test("should detect suspicious activity patterns", async () => {
      const suspiciousTransactions = [
        { amount: 5000, timestamp: new Date(), merchant: "Test Merchant 1" },
        { amount: 5000, timestamp: new Date(), merchant: "Test Merchant 1" },
        { amount: 5000, timestamp: new Date(), merchant: "Test Merchant 1" },
        { amount: 5000, timestamp: new Date(), merchant: "Test Merchant 1" },
        { amount: 5000, timestamp: new Date(), merchant: "Test Merchant 1" },
      ];

      const suspiciousActivityCheck =
        await automationSystem.detectSuspiciousActivity(
          TEST_CONFIG.childMemberId,
          suspiciousTransactions,
        );

      expect(suspiciousActivityCheck).toBeDefined();
      expect(suspiciousActivityCheck.suspicious).toBeDefined();
      expect(suspiciousActivityCheck.riskScore).toBeGreaterThanOrEqual(0);
      expect(suspiciousActivityCheck.riskScore).toBeLessThanOrEqual(1);
      expect(Array.isArray(suspiciousActivityCheck.patterns)).toBe(true);

      // Repeated same-merchant transactions should be flagged
      expect(suspiciousActivityCheck.suspicious).toBe(true);
      expect(suspiciousActivityCheck.patterns).toContain("repeated_merchant");

      console.log("🔍 Suspicious activity check:", suspiciousActivityCheck);
    });
  });

  describe("Notification System", () => {
    test("should send distribution notifications", async () => {
      const notificationResult =
        await automationSystem.sendDistributionNotification(
          TEST_CONFIG.childMemberId,
          {
            type: "distribution_success",
            amount: 50000,
            distributionId: "test-distribution-id",
            method: "lightning",
            timestamp: new Date().toISOString(),
            nextDistribution: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
          ["email"],
        );

      expect(notificationResult).toBeDefined();
      expect(notificationResult.sent).toBe(true);
      expect(notificationResult.channels).toContain("email");
      expect(notificationResult.messageId).toBeDefined();

      console.log("📧 Notification result:", notificationResult);
    });

    test("should handle notification failures gracefully", async () => {
      const failedNotificationResult =
        await automationSystem.sendDistributionNotification(
          "invalid-member-id",
          {
            type: "distribution_failed",
            amount: 50000,
            distributionId: "test-distribution-id",
            error: "Test error",
            timestamp: new Date().toISOString(),
            retryAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          },
          ["invalid_method" as any],
        );

      expect(failedNotificationResult).toBeDefined();
      expect(failedNotificationResult.sent).toBe(false);
      expect(failedNotificationResult.error).toBeDefined();
    });
  });

  describe("Analytics and Reporting", () => {
    test("should generate distribution analytics", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log("⏭️  Skipping analytics test - no credentials provided");
        return;
      }

      const analytics = await automationSystem.getDistributionAnalytics(
        TEST_CONFIG.familyId,
        {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          endDate: new Date(),
          includeMemberBreakdown: true,
          includeMethodAnalysis: true,
        },
      );

      expect(analytics).toBeDefined();
      expect(analytics.totalDistributions).toBeGreaterThanOrEqual(0);
      expect(analytics.totalAmount).toBeGreaterThanOrEqual(0);
      expect(analytics.totalFees).toBeGreaterThanOrEqual(0);
      expect(analytics.successRate).toBeGreaterThanOrEqual(0);
      expect(analytics.successRate).toBeLessThanOrEqual(1);
      expect(analytics.averageDistributionTime).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(analytics.memberBreakdown)).toBe(true);
      expect(Array.isArray(analytics.methodAnalysis)).toBe(true);

      console.log("📊 Distribution analytics:", {
        totalDistributions: analytics.totalDistributions,
        totalAmount: analytics.totalAmount,
        successRate: analytics.successRate,
        averageTime: analytics.averageDistributionTime,
      });
    }, 15000);

    test("should provide system performance metrics", async () => {
      const performanceMetrics = await automationSystem.getPerformanceMetrics();

      expect(performanceMetrics).toBeDefined();
      expect(performanceMetrics.uptime).toBeGreaterThanOrEqual(0);
      expect(performanceMetrics.distributionsProcessed).toBeGreaterThanOrEqual(
        0,
      );
      expect(performanceMetrics.averageProcessingTime).toBeGreaterThanOrEqual(
        0,
      );
      expect(performanceMetrics.errorRate).toBeGreaterThanOrEqual(0);
      expect(performanceMetrics.zeusJitUsageRate).toBeGreaterThanOrEqual(0);
      expect(performanceMetrics.retryRate).toBeGreaterThanOrEqual(0);

      console.log("🚀 Performance metrics:", performanceMetrics);
    });
  });

  describe("System Integration", () => {
    test("should coordinate with family coordinator", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping coordinator integration test - no credentials provided",
        );
        return;
      }

      const coordinationResult =
        await automationSystem.coordinateWithFamilySystem(
          TEST_CONFIG.familyId,
          {
            checkLiquidity: true,
            validateMembers: true,
            syncSchedules: true,
          },
        );

      expect(coordinationResult).toBeDefined();
      expect(coordinationResult.liquidityStatus).toBeDefined();
      expect(coordinationResult.memberValidation).toBeDefined();
      expect(coordinationResult.scheduleSync).toBeDefined();

      console.log("🤝 Coordination result:", coordinationResult);
    }, 20000);

    test("should handle system maintenance mode", async () => {
      const maintenanceResult = await automationSystem.enterMaintenanceMode({
        pauseDistributions: true,
        pauseRetries: false,
        allowEmergencyOverride: true,
        notifyUsers: true,
      });

      expect(maintenanceResult).toBeDefined();
      expect(maintenanceResult.maintenanceMode).toBe(true);
      expect(maintenanceResult.pausedOperations).toContain("distributions");

      // Exit maintenance mode
      const exitResult = await automationSystem.exitMaintenanceMode();
      expect(exitResult.maintenanceMode).toBe(false);

      console.log("🔧 Maintenance mode result:", maintenanceResult);
    });
  });
});
