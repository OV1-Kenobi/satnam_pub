/**
 * ENHANCED FAMILY COORDINATOR INTEGRATION TESTS
 *
 * Real integration tests with actual Zeus LSP and Lightning Network connections.
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
import { generateSecureUUID } from "../../../lib/privacy/encryption";
import { supabase } from "../../../lib/supabase";
import { EnhancedFamilyCoordinator } from "../enhanced-family-coordinator";

// Test configuration
const TEST_CONFIG = {
  familyId: process.env.TEST_FAMILY_ID || generateSecureUUID(),
  voltageNodeId: process.env.VOLTAGE_NODE_ID || "",
  lnbitsAdminKey: process.env.LNBITS_ADMIN_KEY || "",
  zeusLspEndpoint: process.env.ZEUS_LSP_ENDPOINT || "",
  zeusApiKey: process.env.ZEUS_API_KEY || "",
  testMemberId: process.env.TEST_MEMBER_ID || generateSecureUUID(),
  realCredentials: Boolean(
    process.env.VOLTAGE_NODE_ID && process.env.LNBITS_ADMIN_KEY,
  ),
};

describe("Enhanced Family Coordinator Integration Tests", () => {
  let coordinator: EnhancedFamilyCoordinator;
  let testFamilyCreated = false;

  beforeAll(async () => {
    console.log("🧪 Starting Enhanced Family Coordinator integration tests...");
    console.log(`Real credentials available: ${TEST_CONFIG.realCredentials}`);

    if (!TEST_CONFIG.realCredentials) {
      console.warn("⚠️  Using mock credentials - some tests will be skipped");
    }

    // Initialize coordinator with test configuration
    coordinator = new EnhancedFamilyCoordinator({
      familyId: TEST_CONFIG.familyId,
      voltageNodeId: TEST_CONFIG.voltageNodeId,
      lnbitsAdminKey: TEST_CONFIG.lnbitsAdminKey,
      lnproxyEnabled: true,
      zeusLspEnabled: Boolean(TEST_CONFIG.zeusLspEndpoint),
      zeusLspEndpoint: TEST_CONFIG.zeusLspEndpoint,
      zeusApiKey: TEST_CONFIG.zeusApiKey,
      liquidityThreshold: 5000000, // 5M sats
      emergencyReserve: 1000000, // 1M sats
      allowanceAutomation: true,
      intelligentRouting: true,
      cronSchedules: {
        allowanceDistribution: "0 9 * * *",
        liquidityRebalancing: "0 */6 * * *",
        healthChecks: "*/15 * * * *",
      },
      websocketEnabled: false, // Disable for tests
      websocketPort: 8080,
    });
  });

  beforeEach(async () => {
    // Create test family if using real credentials
    if (TEST_CONFIG.realCredentials && !testFamilyCreated) {
      try {
        const { error } = await supabase.from("secure_families").upsert({
          family_uuid: TEST_CONFIG.familyId,
          member_count: 1,
          privacy_level: 3,
          encryption_version: "1.0",
          allowance_automation_enabled: true,
          zeus_integration_enabled: Boolean(TEST_CONFIG.zeusLspEndpoint),
          zeus_lsp_endpoint: TEST_CONFIG.zeusLspEndpoint,
          emergency_protocols_enabled: true,
          liquidity_monitoring_enabled: true,
          real_time_alerts_enabled: true,
          websocket_enabled: false,
          websocket_port: 8080,
        });

        if (!error) {
          testFamilyCreated = true;
          console.log("✅ Test family created successfully");
        }
      } catch (error) {
        console.warn("⚠️  Failed to create test family:", error);
      }
    }
  });

  afterAll(async () => {
    // Cleanup test data
    if (testFamilyCreated) {
      try {
        await supabase
          .from("secure_families")
          .delete()
          .eq("family_uuid", TEST_CONFIG.familyId);
        console.log("🧹 Test family cleaned up");
      } catch (error) {
        console.warn("⚠️  Failed to cleanup test family:", error);
      }
    }

    // Stop coordinator services
    if (coordinator) {
      await coordinator.stop();
    }
  });

  describe("Initialization", () => {
    test("should initialize coordinator with valid configuration", async () => {
      expect(coordinator).toBeDefined();
      expect(coordinator.familyId).toBe(TEST_CONFIG.familyId);
    });

    test("should successfully initialize with real credentials", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping real credential test - no credentials provided",
        );
        return;
      }

      const initResult = await coordinator.initialize();
      expect(initResult).toBeDefined();
      expect(initResult.success).toBe(true);

      console.log("✅ Coordinator initialized successfully");
    }, 30000); // 30 second timeout for initialization

    test("should handle initialization with invalid credentials gracefully", async () => {
      const invalidCoordinator = new EnhancedFamilyCoordinator({
        familyId: "test-family",
        voltageNodeId: "invalid-node-id",
        lnbitsAdminKey: "invalid-key",
        lnproxyEnabled: false,
        zeusLspEnabled: false,
        liquidityThreshold: 1000000,
        emergencyReserve: 100000,
        allowanceAutomation: false,
        intelligentRouting: false,
        cronSchedules: {
          allowanceDistribution: "0 9 * * *",
          liquidityRebalancing: "0 */6 * * *",
          healthChecks: "*/15 * * * *",
        },
        websocketEnabled: false,
      });

      const initResult = await invalidCoordinator.initialize();
      expect(initResult.success).toBe(false);
      expect(initResult.error).toBeDefined();
    });
  });

  describe("Liquidity Management", () => {
    test("should get family liquidity status", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping liquidity status test - no credentials provided",
        );
        return;
      }

      await coordinator.initialize();

      const liquidityStatus = await coordinator.getFamilyLiquidityStatus();

      expect(liquidityStatus).toBeDefined();
      expect(liquidityStatus.overall).toBeDefined();
      expect(liquidityStatus.overall.totalCapacity).toBeGreaterThanOrEqual(0);
      expect(liquidityStatus.overall.availableLiquidity).toBeGreaterThanOrEqual(
        0,
      );
      expect(liquidityStatus.layers).toBeDefined();

      console.log("📊 Liquidity status retrieved:", {
        totalCapacity: liquidityStatus.overall.totalCapacity,
        availableLiquidity: liquidityStatus.overall.availableLiquidity,
        utilizationRatio: liquidityStatus.overall.utilizationRatio,
      });
    }, 15000);

    test("should handle liquidity monitoring", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping liquidity monitoring test - no credentials provided",
        );
        return;
      }

      await coordinator.initialize();

      const monitoringResult = await coordinator.startLiquidityMonitoring();
      expect(monitoringResult.success).toBe(true);

      // Wait a moment for monitoring to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const stopResult = await coordinator.stopLiquidityMonitoring();
      expect(stopResult.success).toBe(true);

      console.log("✅ Liquidity monitoring started and stopped successfully");
    }, 10000);
  });

  describe("Payment Routing", () => {
    test("should generate payment routes", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping payment routing test - no credentials provided",
        );
        return;
      }

      await coordinator.initialize();

      const testDestination = "lnbc1500n1..."; // Mock Lightning invoice
      const testAmount = 150000; // 150k sats

      const routes = await coordinator.routePayment(
        TEST_CONFIG.testMemberId,
        testDestination,
        testAmount,
        { layer: "auto", privacy: "medium" },
      );

      expect(routes).toBeDefined();
      expect(Array.isArray(routes)).toBe(true);

      if (routes.length > 0) {
        const route = routes[0];
        expect(route.type).toBeDefined();
        expect(route.estimatedFee).toBeGreaterThanOrEqual(0);
        expect(route.estimatedTime).toBeGreaterThan(0);
        expect(route.privacy).toBeDefined();
      }

      console.log(`🛣️  Generated ${routes.length} payment routes`);
    }, 20000);

    test("should handle route optimization", async () => {
      const mockRoutes = [
        {
          type: "external" as const,
          path: [{ layer: "lightning" as const, nodeId: "node1", fee: 100 }],
          estimatedFee: 100,
          estimatedTime: 5000,
          successProbability: 0.95,
          privacy: "medium" as const,
          zeusJitRequired: false,
        },
        {
          type: "external" as const,
          path: [{ layer: "zeus_lsp" as const, nodeId: "zeus1", fee: 200 }],
          estimatedFee: 200,
          estimatedTime: 3000,
          successProbability: 0.99,
          privacy: "high" as const,
          zeusJitRequired: true,
        },
      ];

      const optimizedRoutes = coordinator.optimizeRoutes(mockRoutes, {
        maxFee: 150,
        maxTime: 10000,
        privacy: "medium",
      });

      expect(optimizedRoutes).toBeDefined();
      expect(optimizedRoutes.length).toBeGreaterThan(0);
      expect(optimizedRoutes[0].estimatedFee).toBeLessThanOrEqual(150);
    });
  });

  describe("Emergency Liquidity", () => {
    test("should handle emergency liquidity requests", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping emergency liquidity test - no credentials provided",
        );
        return;
      }

      await coordinator.initialize();

      const emergencyAmount = 50000; // 50k sats
      const urgency = "medium";

      const emergencyResult = await coordinator.handleEmergencyLiquidity(
        TEST_CONFIG.testMemberId,
        emergencyAmount,
        urgency,
      );

      expect(emergencyResult).toBeDefined();
      expect(emergencyResult.success).toBeDefined();
      expect(emergencyResult.providedAmount).toBeGreaterThanOrEqual(0);
      expect(emergencyResult.source).toBeDefined();
      expect(emergencyResult.eta).toBeGreaterThan(0);

      console.log("🚨 Emergency liquidity result:", {
        success: emergencyResult.success,
        providedAmount: emergencyResult.providedAmount,
        source: emergencyResult.source,
        eta: emergencyResult.eta,
      });
    }, 25000);

    test("should validate emergency request parameters", async () => {
      const invalidAmount = -1000;
      const validMemberId = TEST_CONFIG.testMemberId;
      const validUrgency = "high";

      await expect(
        coordinator.handleEmergencyLiquidity(
          validMemberId,
          invalidAmount,
          validUrgency,
        ),
      ).rejects.toThrow();
    });
  });

  describe("Zeus LSP Integration", () => {
    test("should connect to Zeus LSP when enabled", async () => {
      if (!TEST_CONFIG.zeusLspEndpoint || !TEST_CONFIG.zeusApiKey) {
        console.log(
          "⏭️  Skipping Zeus LSP test - no Zeus credentials provided",
        );
        return;
      }

      await coordinator.initialize();

      const zeusStatus = await coordinator.getZeusLspStatus();

      expect(zeusStatus).toBeDefined();
      expect(zeusStatus.connected).toBeDefined();
      expect(zeusStatus.jitLiquidity).toBeDefined();

      console.log("⚡ Zeus LSP status:", zeusStatus);
    }, 15000);

    test("should handle Zeus JIT liquidity requests", async () => {
      if (!TEST_CONFIG.zeusLspEndpoint || !TEST_CONFIG.zeusApiKey) {
        console.log(
          "⏭️  Skipping Zeus JIT test - no Zeus credentials provided",
        );
        return;
      }

      await coordinator.initialize();

      const jitAmount = 1000000; // 1M sats
      const memberId = TEST_CONFIG.testMemberId;

      const jitResult = await coordinator.requestZeusJitLiquidity(
        memberId,
        jitAmount,
      );

      expect(jitResult).toBeDefined();
      expect(jitResult.success).toBeDefined();

      if (jitResult.success) {
        expect(jitResult.channelId).toBeDefined();
        expect(jitResult.capacity).toBeGreaterThan(0);
        expect(jitResult.pushAmount).toBeGreaterThanOrEqual(0);
      }

      console.log("⚡ Zeus JIT result:", jitResult);
    }, 30000);
  });

  describe("Automation and Scheduling", () => {
    test("should register cron jobs", async () => {
      const cronJobs = coordinator.getCronJobs();

      expect(cronJobs).toBeDefined();
      expect(cronJobs.allowanceDistribution).toBeDefined();
      expect(cronJobs.liquidityRebalancing).toBeDefined();
      expect(cronJobs.healthChecks).toBeDefined();

      console.log("⏰ Registered cron jobs:", Object.keys(cronJobs));
    });

    test("should handle health checks", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log("⏭️  Skipping health check test - no credentials provided");
        return;
      }

      await coordinator.initialize();

      const healthResult = await coordinator.performHealthCheck();

      expect(healthResult).toBeDefined();
      expect(healthResult.timestamp).toBeDefined();
      expect(healthResult.services).toBeDefined();
      expect(healthResult.overallHealth).toBeDefined();

      console.log("🏥 Health check result:", {
        overallHealth: healthResult.overallHealth,
        servicesChecked: Object.keys(healthResult.services).length,
      });
    }, 20000);
  });

  describe("Error Handling and Recovery", () => {
    test("should handle network errors gracefully", async () => {
      const invalidCoordinator = new EnhancedFamilyCoordinator({
        familyId: "test-family",
        voltageNodeId: "invalid-endpoint",
        lnbitsAdminKey: "invalid-key",
        lnproxyEnabled: false,
        zeusLspEnabled: false,
        liquidityThreshold: 1000000,
        emergencyReserve: 100000,
        allowanceAutomation: false,
        intelligentRouting: false,
        cronSchedules: {
          allowanceDistribution: "0 9 * * *",
          liquidityRebalancing: "0 */6 * * *",
          healthChecks: "*/15 * * * *",
        },
        websocketEnabled: false,
      });

      const liquidityStatus =
        await invalidCoordinator.getFamilyLiquidityStatus();

      expect(liquidityStatus).toBeDefined();
      expect(liquidityStatus.error).toBeDefined();
    });

    test("should recover from connection failures", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log("⏭️  Skipping recovery test - no credentials provided");
        return;
      }

      await coordinator.initialize();

      // Simulate connection recovery
      const recoveryResult = await coordinator.reconnectServices();

      expect(recoveryResult).toBeDefined();
      expect(recoveryResult.lightning).toBeDefined();
      expect(recoveryResult.zeus).toBeDefined();

      console.log("🔄 Recovery result:", recoveryResult);
    }, 15000);
  });

  describe("Privacy and Encryption", () => {
    test("should encrypt sensitive transaction data", async () => {
      const mockTransaction = {
        familyId: TEST_CONFIG.familyId,
        fromMemberId: TEST_CONFIG.testMemberId,
        toDestination: "lnbc1500n1...",
        amount: 150000,
        memo: "Test transaction",
      };

      const encryptedData =
        await coordinator.encryptTransactionData(mockTransaction);

      expect(encryptedData).toBeDefined();
      expect(encryptedData.encrypted).toBeDefined();
      expect(encryptedData.salt).toBeDefined();
      expect(encryptedData.iv).toBeDefined();
      expect(encryptedData.tag).toBeDefined();

      // Verify encryption is working (encrypted data should be different from original)
      expect(encryptedData.encrypted).not.toBe(JSON.stringify(mockTransaction));
    });

    test("should handle privacy audit logging", async () => {
      const auditResult = await coordinator.logPrivacyAudit({
        action: "access",
        dataType: "family_data",
        familyId: TEST_CONFIG.familyId,
        success: true,
      });

      expect(auditResult).toBeDefined();
      expect(auditResult.success).toBe(true);
    });
  });

  describe("Performance and Metrics", () => {
    test("should provide performance metrics", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping performance metrics test - no credentials provided",
        );
        return;
      }

      await coordinator.initialize();

      const metrics = await coordinator.getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
      expect(metrics.requestsProcessed).toBeGreaterThanOrEqual(0);
      expect(metrics.averageResponseTime).toBeGreaterThanOrEqual(0);
      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);

      console.log("📈 Performance metrics:", metrics);
    });

    test("should handle concurrent operations", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log("⏭️  Skipping concurrency test - no credentials provided");
        return;
      }

      await coordinator.initialize();

      // Run multiple operations concurrently
      const operations = [
        coordinator.getFamilyLiquidityStatus(),
        coordinator.performHealthCheck(),
        coordinator.getPerformanceMetrics(),
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toBeDefined();
      });

      console.log("🔄 Concurrent operations completed successfully");
    }, 30000);
  });
});
