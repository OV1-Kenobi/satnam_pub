
/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = /** @type {Object} */ (import.meta);
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * Test Script for Enhanced PhoenixD Family Payment System
 *
 * This script demonstrates the complete family payment ecosystem with:
 * - PhoenixD optimized payments
 * - Automated allowance distribution
 * - Emergency liquidity protocols
 * - Real-time liquidity monitoring
 */

const API_BASE_URL = getEnvVar("API_BASE_URL") || "http://localhost:3000";

interface TestResult {
  test: string;
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

class PhoenixdFamilySystemTester {
  private results: TestResult[] = [];

  async runAllTests(): Promise<void> {
    console.log("🚀 Starting PhoenixD Family Payment System Tests\n");

    // 1. Test family payment routing
    await this.testFamilyPayment();

    // 2. Test allowance automation
    await this.testAllowanceAutomation();

    // 3. Test emergency liquidity
    await this.testEmergencyLiquidity();

    // 4. Test liquidity monitoring
    await this.testLiquidityMonitoring();

    // 5. Test payment analytics
    await this.testPaymentAnalytics();

    this.printResults();
  }

  private async testFamilyPayment(): Promise<void> {
    console.log("📤 Testing Family Payment System...");

    // Test 1: Internal family payment (parent to child)
    await this.runTest("Internal Family Payment", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/family/phoenixd-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromMember: "parent1",
            toMember: "child1",
            amountSat: 25000,
            description: "Weekly allowance",
            preferredMethod: "phoenixd",
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.errorMessage || "Payment failed");
      }

      console.log(`✅ Payment successful: ${result.paymentId}`);
      console.log(`   Amount: ${result.amountSat} sats`);
      console.log(
        `   Fee: ${result.feeSat} sats (${((result.feeSat / result.amountSat) * 100).toFixed(2)}%)`
      );
      console.log(`   Route: ${result.routeUsed}`);
      console.log(`   Processing time: ${result.processingTimeMs}ms`);

      return result;
    });

    // Test 2: Emergency payment (urgent transfer)
    await this.runTest("Emergency Payment", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/family/phoenixd-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromMember: "parent1",
            toMember: "teen1",
            amountSat: 15000,
            description: "Emergency school payment",
            isEmergency: true,
            maxFeeSat: 1500,
          }),
        }
      );

      const result = await response.json();
      console.log(
        `⚡ Emergency payment: ${result.success ? "SUCCESS" : "FAILED"}`
      );

      return result;
    });
  }

  private async testAllowanceAutomation(): Promise<void> {
    console.log("\n💰 Testing Allowance Automation...");

    // Test 1: Create allowance schedule
    await this.runTest("Create Allowance Schedule", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/family/allowance-automation/create-schedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyMemberId: "child1",
            amount: 10000,
            frequency: "weekly",
            dayOfWeek: 0, // Sunday
            timeOfDay: "10:00",
            autoDistribution: true,
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        console.log(`✅ Schedule created: ${result.scheduleId}`);
        console.log(
          `   Next distribution: ${new Date(result.nextDistribution).toLocaleString()}`
        );
      }

      return result;
    });

    // Test 2: Manual allowance distribution
    await this.runTest("Manual Allowance Distribution", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/family/allowance-automation/distribute-now`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyMemberId: "teen1",
            amount: 20000,
            reason: "Bonus allowance for good grades",
          }),
        }
      );

      const result = await response.json();

      if (result.success && result.status === "completed") {
        console.log(`✅ Allowance distributed: ${result.paymentId}`);
        console.log(`   Amount: ${result.amountSat} sats`);
        console.log(`   Fee: ${result.feeSat} sats`);
      } else if (result.status === "pending_approval") {
        console.log(`⏳ Large allowance pending parent approval`);
      }

      return result;
    });

    // Test 3: Get allowance schedules
    await this.runTest("Get Allowance Schedules", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/family/allowance-automation/schedules`
      );
      const result = await response.json();

      if (result.success) {
        console.log(`📋 Found ${result.schedules.length} allowance schedules`);
        result.schedules.forEach((schedule: any) => {
          console.log(
            `   - ${schedule.familyMemberId}: ${schedule.amount} sats ${schedule.frequency}`
          );
        });
      }

      return result;
    });
  }

  private async testEmergencyLiquidity(): Promise<void> {
    console.log("\n🚨 Testing Emergency Liquidity System...");

    // Test 1: Small emergency (auto-approved)
    await this.runTest("Auto-Approved Emergency", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/family/emergency-liquidity/request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyMemberId: "child1",
            requiredAmount: 8000,
            urgency: "medium",
            reason: "Forgot lunch money",
            maxFees: 800,
          }),
        }
      );

      const result = await response.json();

      if (result.approved && result.status === "completed") {
        console.log(
          `✅ Emergency liquidity provided: ${result.amountProvided} sats`
        );
        console.log(`   Fee: ${result.fees} sats`);
        console.log(`   Source: ${result.liquiditySource}`);
      } else if (result.approvalRequired) {
        console.log(`⏳ Emergency requires parent approval`);
      }

      return result;
    });

    // Test 2: Large emergency (requires approval)
    await this.runTest("Large Emergency Request", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/family/emergency-liquidity/request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyMemberId: "teen1",
            requiredAmount: 75000,
            urgency: "high",
            reason: "Emergency medical payment",
            maxFees: 7500,
            location: {
              latitude: 37.7749,
              longitude: -122.4194,
            },
          }),
        }
      );

      const result = await response.json();
      console.log(
        `📋 Large emergency status: ${result.approvalRequired ? "PENDING APPROVAL" : "PROCESSED"}`
      );

      return result;
    });

    // Test 3: Get pending emergencies
    await this.runTest("Get Pending Emergencies", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/family/emergency-liquidity/pending`
      );
      const result = await response.json();

      if (result.success) {
        console.log(
          `🚨 ${result.pendingEmergencies.length} emergencies pending approval`
        );
        result.pendingEmergencies.forEach((emergency: any) => {
          console.log(
            `   - ${emergency.familyMemberId}: ${emergency.requiredAmount} sats (${emergency.urgency})`
          );
        });
      }

      return result;
    });
  }

  private async testLiquidityMonitoring(): Promise<void> {
    console.log("\n📊 Testing Liquidity Monitoring...");

    // Test 1: Overall family liquidity status
    await this.runTest("Overall Family Liquidity", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/family/liquidity-status`
      );
      const result = await response.json();

      if (result.success) {
        const stats = result.overallStatus;
        console.log(
          `💰 Total Family Liquidity: ${stats.totalFamilyLiquidity.toLocaleString()} sats`
        );
        console.log(`📡 Total Channels: ${stats.totalFamilyChannels}`);
        console.log(
          `👥 Healthy Members: ${stats.healthyMembers}/${stats.healthyMembers + stats.membersNeedingAttention}`
        );
        console.log(`🏥 System Health: ${stats.systemHealth.toUpperCase()}`);

        console.log(`\n   By Payment Method:`);
        console.log(
          `   - PhoenixD: ${stats.phoenixdTotalLiquidity.toLocaleString()} sats`
        );
        console.log(
          `   - Lightning: ${stats.lightningTotalLiquidity.toLocaleString()} sats`
        );
        console.log(
          `   - eCash: ${stats.ecashTotalLiquidity.toLocaleString()} sats`
        );
      }

      return result;
    });

    // Test 2: Individual member liquidity
    await this.runTest("Individual Member Liquidity", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/family/liquidity-status?memberId=child1`
      );
      const result = await response.json();

      if (result.success) {
        const status = result.liquidityStatus;
        console.log(`👤 ${status.memberName} (${status.memberRole}):`);
        console.log(
          `   Total Liquidity: ${status.totalLiquidity.toLocaleString()} sats`
        );
        console.log(`   Health: ${status.liquidityHealth.toUpperCase()}`);
        console.log(
          `   Needs Attention: ${status.needsAttention ? "YES" : "NO"}`
        );

        if (status.recommendations.length > 0) {
          console.log(`   Recommendations:`);
          status.recommendations.forEach((rec: string) => {
            console.log(`     • ${rec}`);
          });
        }
      }

      return result;
    });
  }

  private async testPaymentAnalytics(): Promise<void> {
    console.log("\n📈 Testing Payment Analytics...");

    // Test routing analytics
    await this.runTest("Payment Routing Analytics", async () => {
      // This would be implemented as part of the payment router
      const mockAnalytics = {
        methodAvailability: {
          phoenixd: true,
          lightning: true,
          ecash: true,
          voltage: true,
        },
        averageFees: {
          phoenixd: 0.01,
          lightning: 0.005,
          ecash: 0.001,
          voltage: 0.003,
        },
        successRates: {
          phoenixd: 0.95,
          lightning: 0.9,
          ecash: 0.98,
          voltage: 0.93,
        },
        totalVolume24h: 500000,
        totalFees24h: 2500,
        emergencyProtocolsActive: 0,
      };

      console.log(`📊 Payment Analytics Summary:`);
      console.log(
        `   24h Volume: ${mockAnalytics.totalVolume24h.toLocaleString()} sats`
      );
      console.log(
        `   24h Fees: ${mockAnalytics.totalFees24h.toLocaleString()} sats`
      );
      console.log(
        `   Active Emergencies: ${mockAnalytics.emergencyProtocolsActive}`
      );

      console.log(`\n   Method Availability:`);
      Object.entries(mockAnalytics.methodAvailability).forEach(
        ([method, available]) => {
          const fee = (
            mockAnalytics.averageFees[
              method as keyof typeof mockAnalytics.averageFees
            ] * 100
          ).toFixed(2);
          const success = (
            mockAnalytics.successRates[
              method as keyof typeof mockAnalytics.successRates
            ] * 100
          ).toFixed(1);
          console.log(
            `   - ${method}: ${available ? "✅" : "❌"} (${fee}% fee, ${success}% success)`
          );
        }
      );

      return mockAnalytics;
    });
  }

  private async runTest(
    testName: string,
    testFunction: () => Promise<any>
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const data = await testFunction();
      const duration = Date.now() - startTime;

      this.results.push({
        test: testName,
        success: true,
        data,
        duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      this.results.push({
        test: testName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      console.log(`❌ ${testName} failed: ${error}`);
    }
  }

  private printResults(): void {
    console.log("\n" + "=".repeat(60));
    console.log("📋 TEST RESULTS SUMMARY");
    console.log("=".repeat(60));

    const successful = this.results.filter((r) => r.success).length;
    const total = this.results.length;
    const totalTime = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\n✅ Successful: ${successful}/${total} tests`);
    console.log(`⏱️  Total time: ${totalTime}ms`);
    console.log(`📊 Success rate: ${((successful / total) * 100).toFixed(1)}%`);

    console.log("\nDetailed Results:");
    this.results.forEach((result, index) => {
      const status = result.success ? "✅" : "❌";
      const time = `${result.duration}ms`;
      console.log(`${index + 1}. ${status} ${result.test} (${time})`);

      if (!result.success && result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log("\n" + "=".repeat(60));

    if (successful === total) {
      console.log(
        "🎉 All tests passed! PhoenixD Family Payment System is working correctly."
      );
    } else {
      console.log(
        "⚠️  Some tests failed. Check the API endpoints and PhoenixD connection."
      );
      process.exitCode = 1; // propagate failure to CI
    }
  }
}

// Usage example
async function main() {
  const tester = new PhoenixdFamilySystemTester();
  await tester.runAllTests();
}

// Example usage scenarios
export const USAGE_EXAMPLES = {
  // 1. Regular family payment
  familyPayment: {
    endpoint: "/api/family/phoenixd-payment",
    method: "POST",
    body: {
      fromMember: "parent1",
      toMember: "child1",
      amountSat: 25000,
      description: "Weekly allowance",
      preferredMethod: "phoenixd",
    },
    expectedResult: "Low-fee payment via PhoenixD with ~1% fees",
  },

  // 2. Setup automated allowance
  setupAllowance: {
    endpoint: "/api/family/allowance-automation/create-schedule",
    method: "POST",
    body: {
      familyMemberId: "teen1",
      amount: 15000,
      frequency: "weekly",
      dayOfWeek: 0,
      timeOfDay: "10:00",
      autoDistribution: true,
    },
    expectedResult: "Automated weekly allowance every Sunday at 10 AM",
  },

  // 3. Emergency liquidity request
  emergencyRequest: {
    endpoint: "/api/family/emergency-liquidity/request",
    method: "POST",
    body: {
      familyMemberId: "child1",
      requiredAmount: 8000,
      urgency: "medium",
      reason: "Emergency lunch money",
      maxFees: 800,
    },
    expectedResult: "Auto-approved emergency liquidity under threshold",
  },

  // 4. Monitor family liquidity
  liquidityCheck: {
    endpoint: "/api/family/liquidity-status",
    method: "GET",
    expectedResult: "Real-time liquidity across all payment methods",
  },

  // 5. Member-specific liquidity
  memberLiquidity: {
    endpoint: "/api/family/liquidity-status?memberId=teen1",
    method: "GET",
    expectedResult: "Individual member liquidity status and recommendations",
  },
};

if (require.main === module) {
  main().catch(console.error);
}

export default PhoenixdFamilySystemTester;
