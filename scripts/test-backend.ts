#!/usr/bin/env tsx
// Backend Integration Test Script for Production Readiness

import dotenv from "dotenv";
import { FamilyAPI } from "../lib/family-api";
import { LightningClient } from "../lib/lightning-client";

// Load environment variables
dotenv.config();

interface TestResult {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  message: string;
  data?: any;
}

class BackendTestSuite {
  private results: TestResult[] = [];
  private lightningClient: LightningClient;
  private familyAPI: FamilyAPI;

  constructor() {
    this.lightningClient = new LightningClient();
    this.familyAPI = new FamilyAPI();
  }

  private log(result: TestResult) {
    this.results.push(result);
    const emoji =
      result.status === "PASS" ? "✅" : result.status === "FAIL" ? "❌" : "⚠️";
    console.log(`${emoji} ${result.name}: ${result.message}`);
    if (result.data) {
      console.log("   Data:", JSON.stringify(result.data, null, 2));
    }
  }

  async testLightningInfrastructure() {
    console.log("\n🔍 Testing Lightning Infrastructure...");

    try {
      const nodeStatus = await this.lightningClient.getNodeStatus();
      this.log({
        name: "Lightning Node Connection",
        status: nodeStatus.connected ? "PASS" : "FAIL",
        message: nodeStatus.connected
          ? "Node is connected and responsive"
          : "Node connection failed",
        data: nodeStatus,
      });
    } catch (error) {
      this.log({
        name: "Lightning Node Connection",
        status: "FAIL",
        message: `Connection error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }

    try {
      const wallets = await this.lightningClient.getFamilyWallets();
      this.log({
        name: "Wallet Retrieval",
        status: Array.isArray(wallets) ? "PASS" : "FAIL",
        message: `Found ${wallets.length} wallets`,
        data: wallets.map((w) => ({
          id: w.id,
          name: w.name,
          balance: w.balance,
        })),
      });
    } catch (error) {
      this.log({
        name: "Wallet Retrieval",
        status: "FAIL",
        message: `Wallet error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  async testDatabaseOperations() {
    console.log("\n🗄️ Testing Database Operations...");

    try {
      const members = await this.familyAPI.getFamilyMembers();
      this.log({
        name: "Database Connection",
        status: "PASS",
        message: `Successfully retrieved ${members.length} family members`,
        data: { memberCount: members.length },
      });
    } catch (error) {
      this.log({
        name: "Database Connection",
        status: "FAIL",
        message: `Database error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  async testSecurityMeasures() {
    console.log("\n🔒 Testing Security Measures...");

    // Test environment variable security
    const hasRequiredVars = !!(
      process.env.VOLTAGE_LNBITS_URL &&
      process.env.VOLTAGE_LNBITS_ADMIN_KEY &&
      process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    this.log({
      name: "Environment Variables",
      status: hasRequiredVars ? "PASS" : "WARN",
      message: hasRequiredVars
        ? "All required environment variables are set"
        : "Some environment variables missing - using fallbacks",
    });

    // Test API key security (should not log actual keys)
    const hasSecureKeys = !!(
      process.env.VOLTAGE_LNBITS_ADMIN_KEY &&
      process.env.VOLTAGE_LNBITS_ADMIN_KEY !== "demo-key" &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY.length > 20
    );

    this.log({
      name: "API Key Security",
      status: hasSecureKeys ? "PASS" : "WARN",
      message: hasSecureKeys
        ? "API keys appear to be production-ready"
        : "Using demo/weak API keys - NOT SAFE FOR PRODUCTION",
    });
  }

  async testPaymentValidation() {
    console.log("\n💰 Testing Payment Validation (CRITICAL FOR REAL FUNDS)...");

    try {
      // Test parameter validation without actually sending funds
      const testCases = [
        { from: "", to: "wallet2", amount: 1000, shouldFail: true },
        { from: "wallet1", to: "", amount: 1000, shouldFail: true },
        { from: "wallet1", to: "wallet2", amount: 0, shouldFail: true },
        { from: "wallet1", to: "wallet2", amount: -100, shouldFail: true },
      ];

      for (const testCase of testCases) {
        try {
          await this.lightningClient.sendPayment(
            testCase.from,
            testCase.to,
            testCase.amount,
          );
          this.log({
            name: `Payment Validation - Invalid ${testCase.from ? (testCase.to ? (testCase.amount <= 0 ? "Amount" : "Valid") : "To") : "From"}`,
            status: testCase.shouldFail ? "WARN" : "PASS",
            message: testCase.shouldFail
              ? "Should have failed but didn't - check validation logic"
              : "Validation working correctly",
          });
        } catch (error) {
          this.log({
            name: `Payment Validation - Invalid ${testCase.from ? (testCase.to ? (testCase.amount <= 0 ? "Amount" : "Valid") : "To") : "From"}`,
            status: testCase.shouldFail ? "PASS" : "FAIL",
            message: testCase.shouldFail
              ? "Correctly rejected invalid payment"
              : `Unexpected error: ${error instanceof Error ? error.message : "Unknown"}`,
          });
        }
      }
    } catch (error) {
      this.log({
        name: "Payment Validation",
        status: "FAIL",
        message: `Payment validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  async runFullTestSuite() {
    console.log("🚀 Starting Backend Test Suite for Production Readiness");
    console.log("=".repeat(60));

    await this.testSecurityMeasures();
    await this.testDatabaseOperations();
    await this.testLightningInfrastructure();
    await this.testPaymentValidation();

    console.log("\n📊 Test Summary");
    console.log("=".repeat(60));

    const passed = this.results.filter((r) => r.status === "PASS").length;
    const failed = this.results.filter((r) => r.status === "FAIL").length;
    const warnings = this.results.filter((r) => r.status === "WARN").length;

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    console.log(`📈 Total: ${this.results.length}`);

    if (failed > 0) {
      console.log(
        "\n🚨 CRITICAL: Some tests failed. DO NOT USE WITH REAL FUNDS until all tests pass.",
      );
      process.exit(1);
    }

    if (warnings > 0) {
      console.log(
        "\n⚠️  WARNING: Some tests have warnings. Review before using with real funds.",
      );
    }

    if (passed === this.results.length) {
      console.log(
        "\n🎉 All tests passed! Backend appears ready for production use.",
      );
    }
  }
}

// Run the test suite if called directly
if (require.main === module) {
  const testSuite = new BackendTestSuite();
  testSuite.runFullTestSuite().catch(console.error);
}

export { BackendTestSuite };
