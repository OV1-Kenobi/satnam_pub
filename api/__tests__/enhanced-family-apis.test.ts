/**
 * ENHANCED FAMILY APIS INTEGRATION TESTS
 *
 * Real integration tests for all enhanced family banking API endpoints.
 * Requires real credentials to be provided via environment variables.
 */

import { createMocks } from "node-mocks-http";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  encryptSensitiveData,
  generateSecureUUID,
} from "../../lib/privacy/encryption";
import { supabase } from "../../lib/supabase";

// Import API handlers
import allowanceScheduleHandler from "../family/allowance-schedule";
import emergencyLiquidityHandler from "../family/emergency-liquidity";
import enhancedPaymentHandler from "../family/enhanced-payment";
import liquidityForecastHandler from "../family/liquidity-forecast";

// Test configuration
const TEST_CONFIG = {
  familyId: process.env.TEST_FAMILY_ID || generateSecureUUID(),
  parentMemberId: process.env.TEST_PARENT_MEMBER_ID || generateSecureUUID(),
  childMemberId: process.env.TEST_CHILD_MEMBER_ID || generateSecureUUID(),
  zeusLspEndpoint: process.env.ZEUS_LSP_ENDPOINT || "",
  zeusApiKey: process.env.ZEUS_API_KEY || "",
  voltageNodeId: process.env.VOLTAGE_NODE_ID || "",
  lnbitsAdminKey: process.env.LNBITS_ADMIN_KEY || "",
  realCredentials: Boolean(
    process.env.ZEUS_LSP_ENDPOINT &&
      process.env.ZEUS_API_KEY &&
      process.env.VOLTAGE_NODE_ID &&
      process.env.LNBITS_ADMIN_KEY,
  ),
};

describe("Enhanced Family APIs Integration Tests", () => {
  let testDataCreated = false;
  let testScheduleId: string;

  beforeAll(async () => {
    console.log("🧪 Starting Enhanced Family APIs integration tests...");
    console.log(`Real credentials available: ${TEST_CONFIG.realCredentials}`);

    if (!TEST_CONFIG.realCredentials) {
      console.warn("⚠️  Using mock credentials - some tests will be skipped");
    }

    // Set environment variables for the API handlers using vitest.mockEnv
    if (TEST_CONFIG.realCredentials) {
      vi.stubEnv("VOLTAGE_NODE_ID", TEST_CONFIG.voltageNodeId);
      vi.stubEnv("LNBITS_ADMIN_KEY", TEST_CONFIG.lnbitsAdminKey);
      vi.stubEnv("ZEUS_LSP_ENDPOINT", TEST_CONFIG.zeusLspEndpoint);
      vi.stubEnv("ZEUS_API_KEY", TEST_CONFIG.zeusApiKey);
    }
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
            zeus_api_key_encrypted: TEST_CONFIG.zeusApiKey,
            emergency_protocols_enabled: true,
            liquidity_monitoring_enabled: true,
            real_time_alerts_enabled: true,
            websocket_enabled: false,
            websocket_port: 8080,
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

    // Restore environment variables
    vi.unstubAllEnvs();
  });

  describe("Enhanced Payment API", () => {
    test("should handle payment with intelligent routing", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping enhanced payment test - no credentials provided",
        );
        return;
      }

      const { req, res } = createMocks({
        method: "POST",
        body: {
          familyId: TEST_CONFIG.familyId,
          fromMemberId: TEST_CONFIG.parentMemberId,
          toDestination:
            "lnbc1500n1ps6j9w0dp2psk7e4jvdqxqmmcvdusxu7ppqvjhrdj9r7p5j",
          amount: 150000, // 150k sats
          memo: "Test enhanced payment",
          preferences: {
            maxFee: 1000,
            maxTime: 30000,
            privacy: "medium",
            layer: "auto",
            useJit: true,
          },
          urgency: "medium",
        },
      });

      await enhancedPaymentHandler(req, res);

      expect(res._getStatusCode()).toBeLessThan(500);

      const responseData = JSON.parse(res._getData());
      expect(responseData).toBeDefined();
      expect(responseData.success).toBeDefined();
      expect(responseData.paymentId).toBeDefined();
      expect(responseData.status).toBeDefined();
      expect([
        "completed",
        "pending_approval",
        "processing",
        "failed",
      ]).toContain(responseData.status);
      expect(responseData.metadata).toBeDefined();
      expect(responseData.metadata.coordinatorVersion).toBe("2.0");
      expect(responseData.metadata.zeusLspUsed).toBeDefined();

      if (responseData.success && responseData.status === "completed") {
        expect(responseData.route).toBeDefined();
        expect(responseData.execution).toBeDefined();
        expect(responseData.execution.actualFee).toBeGreaterThanOrEqual(0);
        expect(responseData.execution.executionTime).toBeGreaterThan(0);
      }

      if (responseData.intelligence) {
        expect(responseData.intelligence.riskScore).toBeGreaterThanOrEqual(0);
        expect(responseData.intelligence.riskScore).toBeLessThanOrEqual(1);
        expect(Array.isArray(responseData.intelligence.recommendations)).toBe(
          true,
        );
      }

      console.log("💸 Enhanced payment result:", {
        success: responseData.success,
        status: responseData.status,
        zeusLspUsed: responseData.metadata.zeusLspUsed,
        riskScore: responseData.intelligence?.riskScore,
      });
    }, 45000);

    test("should handle payment approval workflow", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          familyId: TEST_CONFIG.familyId,
          fromMemberId: TEST_CONFIG.childMemberId,
          toDestination:
            "lnbc5000000n1ps6j9w0dp2psk7e4jvdqxqmmcvdusxu7ppqvjhrdj9r7p5j",
          amount: 5000000, // 5M sats - should require approval
          memo: "Large test payment requiring approval",
          preferences: {
            maxFee: 5000,
            privacy: "high",
          },
          urgency: "high",
          approvalRequired: true,
          approvers: [TEST_CONFIG.parentMemberId],
        },
      });

      await enhancedPaymentHandler(req, res);

      const responseData = JSON.parse(res._getData());
      expect(responseData).toBeDefined();
      expect(responseData.status).toBe("pending_approval");
      expect(responseData.approval).toBeDefined();
      expect(responseData.approval.approvalId).toBeDefined();
      expect(responseData.approval.requiredApprovers).toContain(
        TEST_CONFIG.parentMemberId,
      );
      expect(responseData.approval.expiresAt).toBeDefined();
      expect(responseData.approval.urgency).toBe("high");

      console.log("📋 Payment approval workflow:", {
        approvalId: responseData.approval.approvalId,
        requiredApprovers: responseData.approval.requiredApprovers.length,
        urgency: responseData.approval.urgency,
      });
    });

    test("should validate payment parameters", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          familyId: TEST_CONFIG.familyId,
          fromMemberId: TEST_CONFIG.parentMemberId,
          toDestination: "invalid-destination",
          amount: -1000, // Invalid negative amount
        },
      });

      await enhancedPaymentHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBeDefined();
      expect(responseData.error).toContain("Amount must be between");
    });

    test("should handle unsupported HTTP methods", async () => {
      const { req, res } = createMocks({
        method: "GET",
      });

      await enhancedPaymentHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBe("Method not allowed");
    });
  });

  describe("Liquidity Forecast API", () => {
    test("should generate comprehensive liquidity forecast", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping liquidity forecast test - no credentials provided",
        );
        return;
      }

      const { req, res } = createMocks({
        method: "POST",
        body: {
          familyId: TEST_CONFIG.familyId,
          timeframe: "weekly",
          lookAhead: 4,
          includeOptimizations: true,
          includeZeusRecommendations: true,
          confidenceLevel: 0.8,
        },
      });

      await liquidityForecastHandler(req, res);

      expect(res._getStatusCode()).toBe(200);

      const responseData = JSON.parse(res._getData());
      expect(responseData).toBeDefined();
      expect(responseData.success).toBe(true);
      expect(responseData.forecast).toBeDefined();
      expect(responseData.forecast.familyId).toBe(TEST_CONFIG.familyId);
      expect(responseData.forecast.timeframe).toBe("weekly");
      expect(responseData.forecast.forecastHorizon).toBe(4);

      expect(responseData.forecast.predictions).toBeDefined();
      expect(
        responseData.forecast.predictions.expectedInflow,
      ).toBeGreaterThanOrEqual(0);
      expect(
        responseData.forecast.predictions.expectedOutflow,
      ).toBeGreaterThanOrEqual(0);
      expect(
        responseData.forecast.predictions.confidenceLevel,
      ).toBeGreaterThanOrEqual(0.8);

      expect(responseData.forecast.liquidityNeeds).toBeDefined();
      expect(
        responseData.forecast.liquidityNeeds.minimumRequired,
      ).toBeGreaterThan(0);
      expect(responseData.forecast.liquidityNeeds.optimalLevel).toBeGreaterThan(
        0,
      );

      expect(responseData.forecast.recommendations).toBeDefined();
      expect(
        Array.isArray(responseData.forecast.recommendations.channelAdjustments),
      ).toBe(true);
      expect(
        Array.isArray(
          responseData.forecast.recommendations.zeusLspOptimizations,
        ),
      ).toBe(true);

      expect(responseData.metrics).toBeDefined();
      expect(responseData.optimizationStrategies).toBeDefined();
      expect(Array.isArray(responseData.optimizationStrategies)).toBe(true);

      expect(responseData.metadata).toBeDefined();
      expect(responseData.metadata.intelligenceVersion).toBe("2.0");
      expect(responseData.metadata.zeusLspIntegrated).toBe(true);

      console.log("🔮 Liquidity forecast generated:", {
        timeframe: responseData.forecast.timeframe,
        netFlow: responseData.forecast.predictions.netFlow,
        confidence: responseData.forecast.predictions.confidenceLevel,
        optimizations: responseData.optimizationStrategies.length,
        zeusRecommendations:
          responseData.forecast.recommendations.zeusLspOptimizations.length,
      });
    }, 35000);

    test("should handle GET request with query parameters", async () => {
      const { req, res } = createMocks({
        method: "GET",
        query: {
          familyId: TEST_CONFIG.familyId,
          timeframe: "daily",
          lookAhead: "7",
          includeOptimizations: "true",
          confidenceLevel: "0.75",
        },
      });

      await liquidityForecastHandler(req, res);

      expect(res._getStatusCode()).toBeLessThan(500);

      const responseData = JSON.parse(res._getData());
      if (responseData.success) {
        expect(responseData.forecast.timeframe).toBe("daily");
        expect(responseData.forecast.forecastHorizon).toBe(7);
      }
    });

    test("should validate forecast parameters", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          familyId: TEST_CONFIG.familyId,
          timeframe: "invalid-timeframe",
          lookAhead: -1,
        },
      });

      await liquidityForecastHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(false);
      expect(responseData.error).toContain("Invalid timeframe");
    });
  });

  describe("Allowance Schedule API", () => {
    test("should create allowance schedule", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping allowance schedule creation test - no credentials provided",
        );
        return;
      }

      const { req, res } = createMocks({
        method: "POST",
        body: {
          action: "create",
          familyId: TEST_CONFIG.familyId,
          familyMemberId: TEST_CONFIG.childMemberId,
          schedule: {
            amount: 50000,
            frequency: "weekly",
            dayOfWeek: 1,
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
                cooldownPeriod: 300,
              },
            },
            autoApprovalLimit: 15000,
            parentApprovalRequired: false,
            preferredMethod: "auto",
            maxRetries: 3,
            retryDelay: 30,
            notificationSettings: {
              notifyOnDistribution: true,
              notifyOnFailure: true,
              notifyOnSuspiciousActivity: true,
              notificationMethods: ["email", "push"],
            },
          },
        },
      });

      await allowanceScheduleHandler(req, res);

      expect(res._getStatusCode()).toBe(200);

      const responseData = JSON.parse(res._getData());
      expect(responseData).toBeDefined();
      expect(responseData.success).toBe(true);
      expect(responseData.action).toBe("create");
      expect(responseData.data.schedule).toBeDefined();
      expect(responseData.data.schedule.id).toBeDefined();
      expect(responseData.data.schedule.amount).toBe(50000);
      expect(responseData.data.schedule.frequency).toBe("weekly");
      expect(responseData.data.schedule.enabled).toBe(true);

      expect(responseData.intelligence).toBeDefined();
      expect(Array.isArray(responseData.intelligence.recommendations)).toBe(
        true,
      );
      expect(Array.isArray(responseData.intelligence.optimizations)).toBe(true);
      expect(responseData.intelligence.riskAssessment).toBeDefined();

      expect(responseData.metadata).toBeDefined();
      expect(responseData.metadata.automationVersion).toBe("2.0");

      testScheduleId = responseData.data.schedule.id;
      console.log("📅 Allowance schedule created:", {
        scheduleId: testScheduleId,
        amount: responseData.data.schedule.amount,
        frequency: responseData.data.schedule.frequency,
        riskLevel: responseData.intelligence.riskAssessment.overall,
      });
    }, 20000);

    test("should list allowance schedules", async () => {
      const { req, res } = createMocks({
        method: "GET",
        query: {
          familyId: TEST_CONFIG.familyId,
        },
      });

      await allowanceScheduleHandler(req, res);

      expect(res._getStatusCode()).toBe(200);

      const responseData = JSON.parse(res._getData());
      expect(responseData).toBeDefined();
      expect(responseData.success).toBe(true);
      expect(responseData.action).toBe("list");
      expect(responseData.data.schedules).toBeDefined();
      expect(Array.isArray(responseData.data.schedules)).toBe(true);
      expect(responseData.data.statistics).toBeDefined();

      if (responseData.data.schedules.length > 0) {
        const schedule = responseData.data.schedules[0];
        expect(schedule.id).toBeDefined();
        expect(schedule.amount).toBeGreaterThan(0);
        expect(schedule.frequency).toBeDefined();
        expect(schedule.enabled).toBeDefined();
      }

      console.log("📋 Allowance schedules listed:", {
        count: responseData.data.schedules.length,
        totalSchedules: responseData.data.statistics.totalSchedules,
        activeSchedules: responseData.data.statistics.activeSchedules,
      });
    });

    test("should process pending allowances", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping allowance processing test - no credentials provided",
        );
        return;
      }

      const { req, res } = createMocks({
        method: "POST",
        body: {
          action: "process",
          familyId: TEST_CONFIG.familyId,
          processingOptions: {
            dryRun: false,
            maxConcurrent: 5,
            priorityOrder: "urgency",
          },
        },
      });

      await allowanceScheduleHandler(req, res);

      expect(res._getStatusCode()).toBe(200);

      const responseData = JSON.parse(res._getData());
      expect(responseData).toBeDefined();
      expect(responseData.success).toBe(true);
      expect(responseData.action).toBe("process");
      expect(responseData.data.processingResult).toBeDefined();

      const result = responseData.data.processingResult;
      expect(result.processed).toBeGreaterThanOrEqual(0);
      expect(result.successful).toBeGreaterThanOrEqual(0);
      expect(result.failed).toBeGreaterThanOrEqual(0);
      expect(result.pendingApproval).toBeGreaterThanOrEqual(0);
      expect(result.totalAmount).toBeGreaterThanOrEqual(0);
      expect(result.totalFees).toBeGreaterThanOrEqual(0);
      expect(result.processingTimeMs).toBeGreaterThan(0);
      expect(Array.isArray(result.details)).toBe(true);

      console.log("🤖 Allowance processing result:", {
        processed: result.processed,
        successful: result.successful,
        failed: result.failed,
        totalAmount: result.totalAmount,
        processingTime: result.processingTimeMs,
      });
    }, 30000);

    test("should validate schedule parameters", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          action: "create",
          familyId: TEST_CONFIG.familyId,
          familyMemberId: TEST_CONFIG.childMemberId,
          schedule: {
            amount: -1000, // Invalid negative amount
            frequency: "invalid-frequency",
            enabled: true,
          },
        },
      });

      await allowanceScheduleHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBeDefined();
    });
  });

  describe("Emergency Liquidity API", () => {
    test("should handle emergency liquidity request", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping emergency liquidity test - no credentials provided",
        );
        return;
      }

      const { req, res } = createMocks({
        method: "POST",
        body: {
          action: "request",
          familyId: TEST_CONFIG.familyId,
          memberId: TEST_CONFIG.childMemberId,
          requestDetails: {
            requiredAmount: 100000, // 100k sats
            urgency: "high",
            reason: "Emergency payment needed",
            maxAcceptableFee: 1000,
            maxWaitTime: 60000,
            preferredSource: "zeus_jit",
            allowPartialFulfillment: true,
          },
        },
      });

      await emergencyLiquidityHandler(req, res);

      expect(res._getStatusCode()).toBeLessThan(500);

      const responseData = JSON.parse(res._getData());
      expect(responseData).toBeDefined();
      expect(responseData.action).toBe("request");
      expect(responseData.data.request).toBeDefined();

      const request = responseData.data.request;
      expect(request.emergencyId).toBeDefined();
      expect(request.status).toBeDefined();
      expect([
        "pending",
        "processing",
        "fulfilled",
        "partial",
        "denied",
      ]).toContain(request.status);
      expect(request.providedAmount).toBeGreaterThanOrEqual(0);
      expect(request.source).toBeDefined();
      expect(request.eta).toBeGreaterThanOrEqual(0);
      expect(request.fee).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(request.executionTrace)).toBe(true);

      if (request.zeusJitDetails) {
        expect(request.zeusJitDetails.channelCapacity).toBeGreaterThan(0);
        expect(request.zeusJitDetails.pushAmount).toBeGreaterThanOrEqual(0);
      }

      expect(responseData.intelligence).toBeDefined();
      expect(responseData.intelligence.riskAssessment).toBeDefined();
      expect(
        responseData.intelligence.riskAssessment.currentRisk,
      ).toBeDefined();
      expect(["low", "medium", "high", "critical"]).toContain(
        responseData.intelligence.riskAssessment.currentRisk,
      );

      expect(responseData.metadata).toBeDefined();
      expect(responseData.metadata.emergencySystemVersion).toBe("2.0");
      expect(responseData.metadata.zeusLspConnected).toBe(true);

      console.log("🚨 Emergency liquidity result:", {
        emergencyId: request.emergencyId,
        status: request.status,
        providedAmount: request.providedAmount,
        source: request.source,
        riskLevel: responseData.intelligence.riskAssessment.currentRisk,
        zeusJitUsed: Boolean(request.zeusJitDetails),
      });
    }, 40000);

    test("should get emergency liquidity status", async () => {
      const { req, res } = createMocks({
        method: "GET",
        query: {
          action: "status",
          familyId: TEST_CONFIG.familyId,
        },
      });

      await emergencyLiquidityHandler(req, res);

      expect(res._getStatusCode()).toBe(200);

      const responseData = JSON.parse(res._getData());
      expect(responseData).toBeDefined();
      expect(responseData.success).toBe(true);
      expect(responseData.action).toBe("status");
      expect(responseData.data.liquidityStatus).toBeDefined();

      const status = responseData.data.liquidityStatus;
      expect(status.overall).toBeDefined();
      expect(status.overall.totalCapacity).toBeGreaterThanOrEqual(0);
      expect(status.overall.availableLiquidity).toBeGreaterThanOrEqual(0);
      expect(status.overall.emergencyReserve).toBeGreaterThanOrEqual(0);
      expect(status.overall.utilizationRatio).toBeGreaterThanOrEqual(0);

      expect(status.sources).toBeDefined();
      expect(status.sources.familyBalance).toBeGreaterThanOrEqual(0);
      expect(status.sources.zeusJitAvailable).toBeGreaterThanOrEqual(0);
      expect(status.sources.emergencyReserveAvailable).toBeGreaterThanOrEqual(
        0,
      );

      expect(status.projectedNeeds).toBeDefined();
      expect(status.projectedNeeds.next24Hours).toBeGreaterThanOrEqual(0);
      expect(status.projectedNeeds.nextWeek).toBeGreaterThanOrEqual(0);

      console.log("📊 Emergency liquidity status:", {
        totalCapacity: status.overall.totalCapacity,
        availableLiquidity: status.overall.availableLiquidity,
        utilizationRatio: status.overall.utilizationRatio,
        zeusJitAvailable: status.sources.zeusJitAvailable,
      });
    });

    test("should get emergency liquidity history", async () => {
      const { req, res } = createMocks({
        method: "GET",
        query: {
          action: "history",
          familyId: TEST_CONFIG.familyId,
          startDate: new Date(
            Date.now() - 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          endDate: new Date().toISOString(),
        },
      });

      await emergencyLiquidityHandler(req, res);

      expect(res._getStatusCode()).toBe(200);

      const responseData = JSON.parse(res._getData());
      expect(responseData).toBeDefined();
      expect(responseData.success).toBe(true);
      expect(responseData.action).toBe("history");
      expect(responseData.data.history).toBeDefined();
      expect(Array.isArray(responseData.data.history)).toBe(true);
      expect(responseData.data.statistics).toBeDefined();

      const stats = responseData.data.statistics;
      expect(stats.totalRequests).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeLessThanOrEqual(1);
      expect(stats.averageResponseTime).toBeGreaterThanOrEqual(0);
      expect(stats.totalCost).toBeGreaterThanOrEqual(0);
      expect(stats.zeusJitUsage).toBeGreaterThanOrEqual(0);
      expect(stats.costBreakdown).toBeDefined();

      console.log("📜 Emergency liquidity history:", {
        totalRequests: stats.totalRequests,
        successRate: stats.successRate,
        averageResponseTime: stats.averageResponseTime,
        zeusJitUsage: stats.zeusJitUsage,
      });
    });

    test("should validate emergency request parameters", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          action: "request",
          familyId: TEST_CONFIG.familyId,
          memberId: TEST_CONFIG.childMemberId,
          requestDetails: {
            requiredAmount: -1000, // Invalid negative amount
            urgency: "invalid-urgency",
          },
        },
      });

      await emergencyLiquidityHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBeDefined();
    });

    test("should handle protocol configuration", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          action: "configure",
          familyId: TEST_CONFIG.familyId,
          protocolConfig: {
            autoExecutionEnabled: true,
            zeusJitIntegration: true,
            maxAutoAmount: 1000000,
            triggerConditions: {
              utilizationThreshold: 0.85,
              liquidityBuffer: 500000,
              memberLimits: {},
            },
            escalationRules: {
              timeouts: [30, 60, 120],
              contacts: [TEST_CONFIG.parentMemberId],
              methods: ["email", "sms"],
            },
            responseActions: [
              {
                trigger: "high_utilization",
                action: "enable_zeus_jit",
                parameters: { amount: 2000000 },
                priority: 1,
              },
            ],
          },
        },
      });

      await emergencyLiquidityHandler(req, res);

      expect(res._getStatusCode()).toBe(200);

      const responseData = JSON.parse(res._getData());
      expect(responseData).toBeDefined();
      expect(responseData.success).toBe(true);
      expect(responseData.action).toBe("configure");
      expect(responseData.data.protocols).toBeDefined();

      const protocols = responseData.data.protocols;
      expect(protocols.protocolId).toBeDefined();
      expect(protocols.active).toBe(true);
      expect(protocols.autoExecutionEnabled).toBe(true);
      expect(protocols.zeusJitIntegration).toBe(true);
      expect(protocols.maxAutoAmount).toBe(1000000);

      console.log("⚙️  Emergency protocol configured:", {
        protocolId: protocols.protocolId,
        autoExecution: protocols.autoExecutionEnabled,
        zeusJit: protocols.zeusJitIntegration,
        maxAutoAmount: protocols.maxAutoAmount,
      });
    });
  });

  describe("API Error Handling", () => {
    test("should handle missing family ID", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          // Missing familyId
          fromMemberId: TEST_CONFIG.parentMemberId,
          toDestination: "test-destination",
          amount: 1000,
        },
      });

      await enhancedPaymentHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(false);
      expect(responseData.error).toContain("familyId");
    });

    test("should handle non-existent family", async () => {
      const { req, res } = createMocks({
        method: "GET",
        query: {
          familyId: "non-existent-family-id",
          timeframe: "daily",
        },
      });

      await liquidityForecastHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(false);
      expect(responseData.error).toContain("Family not found");
    });

    test("should handle server errors gracefully", async () => {
      // Temporarily corrupt the database connection
      const originalSupabase = process.env.SUPABASE_URL;
      process.env.SUPABASE_URL = "invalid-url";

      const { req, res } = createMocks({
        method: "POST",
        body: {
          familyId: TEST_CONFIG.familyId,
          timeframe: "daily",
        },
      });

      await liquidityForecastHandler(req, res);

      // Restore database connection
      process.env.SUPABASE_URL = originalSupabase;

      expect(res._getStatusCode()).toBe(500);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBeDefined();
    });
  });

  describe("API Performance", () => {
    test("should handle concurrent API requests", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping concurrent request test - no credentials provided",
        );
        return;
      }

      const requests = [
        liquidityForecastHandler,
        allowanceScheduleHandler,
        emergencyLiquidityHandler,
      ].map(async (handler, index) => {
        const { req, res } = createMocks({
          method: index === 0 ? "GET" : "POST",
          query:
            index === 0
              ? {
                  familyId: TEST_CONFIG.familyId,
                  timeframe: "daily",
                }
              : undefined,
          body:
            index === 0
              ? undefined
              : {
                  action: index === 1 ? "list" : "status",
                  familyId: TEST_CONFIG.familyId,
                },
        });

        const startTime = Date.now();
        await handler(req, res);
        const endTime = Date.now();

        return {
          handler: handler.name,
          statusCode: res._getStatusCode(),
          responseTime: endTime - startTime,
          success: res._getStatusCode() < 400,
        };
      });

      const results = await Promise.all(requests);

      results.forEach((result) => {
        expect(result.statusCode).toBeLessThan(500);
        expect(result.responseTime).toBeLessThan(30000); // 30 seconds max
      });

      const averageResponseTime =
        results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
      const successRate =
        results.filter((r) => r.success).length / results.length;

      console.log("🔀 Concurrent API test results:", {
        requests: results.length,
        averageResponseTime: Math.round(averageResponseTime),
        successRate: Math.round(successRate * 100) + "%",
        results: results.map((r) => ({
          handler: r.handler,
          responseTime: r.responseTime,
          success: r.success,
        })),
      });

      expect(successRate).toBeGreaterThan(0.8); // At least 80% success rate
    }, 45000);
  });
});
