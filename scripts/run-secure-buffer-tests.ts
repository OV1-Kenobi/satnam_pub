#!/usr/bin/env tsx
/**
 * @fileoverview Comprehensive Test Runner for SecureBuffer Security Features
 * @description Runs all SecureBuffer and SecureStorage tests with detailed reporting
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import { join } from "path";

interface TestResult {
  suite: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

interface TestReport {
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  totalDuration: number;
  suites: TestResult[];
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
}

class SecureBufferTestRunner {
  private testSuites = [
    {
      name: "SecureBuffer Unit Tests",
      file: "lib/__tests__/secure-buffer.test.ts",
      description:
        "Creation, initialization, string conversion, clearing, and access after clearing",
    },
    {
      name: "SecureStorage Integration Tests",
      file: "lib/__tests__/secure-storage.test.ts",
      description: "Existing SecureStorage functionality",
    },
    {
      name: "SecureStorage Comprehensive Tests",
      file: "lib/__tests__/secure-storage.comprehensive.test.ts",
      description:
        "SecureBuffer usage in SecureStorage methods and memory management",
    },
    {
      name: "SecureStorage Integration Tests Extended",
      file: "lib/__tests__/secure-storage.integration.test.ts",
      description: "Extended integration scenarios and edge cases",
    },
    {
      name: "Concurrency and Atomicity Tests",
      file: "lib/__tests__/secure-storage.concurrency.test.ts",
      description: "Concurrent access, atomic operations, and data consistency",
    },
    {
      name: "Security and Performance Tests",
      file: "lib/__tests__/secure-storage.security.test.ts",
      description:
        "Security properties, memory leaks, timing attacks, and performance",
    },
    {
      name: "Documentation and Code Quality Tests",
      file: "lib/__tests__/secure-buffer.documentation.test.ts",
      description: "JSDoc documentation, usage examples, and best practices",
    },
  ];

  private results: TestResult[] = [];

  async runAllTests(): Promise<TestReport> {
    console.log("🔐 Starting Comprehensive SecureBuffer Security Test Suite");
    console.log("=".repeat(80));

    await this.checkTestEnvironment();

    const startTime = Date.now();

    // Run each test suite
    for (const suite of this.testSuites) {
      console.log(`\n📋 Running: ${suite.name}`);
      console.log(`📝 ${suite.description}`);
      console.log("-".repeat(60));

      const result = await this.runTestSuite(suite);
      this.results.push(result);

      if (result.failed > 0) {
        console.log(`❌ ${suite.name} - ${result.failed} test(s) failed`);
      } else {
        console.log(`✅ ${suite.name} - All tests passed`);
      }
    }

    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    // Generate comprehensive report
    const report = this.generateReport(totalDuration);
    await this.saveReport(report);
    await this.printSummary(report);

    return report;
  }

  private async checkTestEnvironment(): Promise<void> {
    console.log("🔍 Checking test environment...");

    // Check if test database is configured
    const envFile = join(process.cwd(), ".env.test");
    try {
      await fs.access(envFile);
      console.log("✅ Test environment file found");
    } catch {
      console.warn(
        "⚠️  .env.test file not found - some integration tests may fail"
      );
    }

    // Check if vitest is available
    try {
      await this.runCommand("npx", ["vitest", "--version"], { silent: true });
      console.log("✅ Vitest is available");
    } catch {
      throw new Error(
        "❌ Vitest is not available. Please install dependencies."
      );
    }

    console.log("");
  }

  private async runTestSuite(suite: {
    name: string;
    file: string;
    description: string;
  }): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const output = await this.runCommand("npx", [
        "vitest",
        "run",
        suite.file,
        "--reporter=json",
      ]);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Parse vitest JSON output
      const testResult = this.parseVitestOutput(output);

      return {
        suite: suite.name,
        passed: testResult.passed,
        failed: testResult.failed,
        skipped: testResult.skipped,
        duration,
      };
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.error(`❌ Error running ${suite.name}:`, error);

      return {
        suite: suite.name,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration,
      };
    }
  }

  private async runCommand(
    command: string,
    args: string[],
    options: { silent?: boolean } = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        shell: true,
        stdio: options.silent ? "pipe" : ["inherit", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      if (process.stdout) {
        process.stdout.on("data", (data) => {
          stdout += data.toString();
          if (!options.silent) {
            console.log(data.toString());
          }
        });
      }

      if (process.stderr) {
        process.stderr.on("data", (data) => {
          stderr += data.toString();
          if (!options.silent) {
            console.error(data.toString());
          }
        });
      }

      process.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      process.on("error", (error) => {
        reject(error);
      });
    });
  }

  private parseVitestOutput(output: string): {
    passed: number;
    failed: number;
    skipped: number;
  } {
    try {
      // Try to parse JSON output from vitest
      const lines = output.split("\n").filter((line) => line.trim());
      const jsonLine = lines.find(
        (line) => line.startsWith("{") && line.includes("testResults")
      );

      if (jsonLine) {
        const result = JSON.parse(jsonLine);
        return {
          passed: result.numPassedTests || 0,
          failed: result.numFailedTests || 0,
          skipped: result.numPendingTests || 0,
        };
      }
    } catch (error) {
      console.warn(
        "Could not parse vitest JSON output, using fallback parsing"
      );
    }

    // Fallback: parse text output for test counts
    const passedMatch = output.match(/(\d+)\s+passed/);
    const failedMatch = output.match(/(\d+)\s+failed/);
    const skippedMatch = output.match(/(\d+)\s+skipped/);

    return {
      passed: passedMatch ? parseInt(passedMatch[1]) : 0,
      failed: failedMatch ? parseInt(failedMatch[1]) : 0,
      skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
    };
  }

  private generateReport(totalDuration: number): TestReport {
    const totalPassed = this.results.reduce((sum, r) => sum + r.passed, 0);
    const totalFailed = this.results.reduce((sum, r) => sum + r.failed, 0);
    const totalSkipped = this.results.reduce((sum, r) => sum + r.skipped, 0);
    const totalTests = totalPassed + totalFailed + totalSkipped;

    return {
      totalTests,
      totalPassed,
      totalFailed,
      totalSkipped,
      totalDuration,
      suites: this.results,
    };
  }

  private async saveReport(report: TestReport): Promise<void> {
    const reportData = {
      ...report,
      timestamp: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };

    const reportPath = join(
      process.cwd(),
      "test-reports",
      "secure-buffer-test-report.json"
    );

    // Ensure reports directory exists
    await fs.mkdir(join(process.cwd(), "test-reports"), { recursive: true });

    await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
    console.log(`\n📊 Test report saved to: ${reportPath}`);
  }

  private async printSummary(report: TestReport): Promise<void> {
    console.log("\n" + "=".repeat(80));
    console.log("📈 COMPREHENSIVE SECUREBUFFER TEST SUMMARY");
    console.log("=".repeat(80));

    const successRate =
      report.totalTests > 0
        ? (report.totalPassed / report.totalTests) * 100
        : 0;

    console.log(`\n📊 Overall Results:`);
    console.log(`   Total Tests: ${report.totalTests}`);
    console.log(`   ✅ Passed: ${report.totalPassed}`);
    console.log(`   ❌ Failed: ${report.totalFailed}`);
    console.log(`   ⏭️  Skipped: ${report.totalSkipped}`);
    console.log(`   📈 Success Rate: ${successRate.toFixed(1)}%`);
    console.log(
      `   ⏱️  Total Duration: ${(report.totalDuration / 1000).toFixed(2)}s`
    );

    console.log(`\n📋 Test Suite Breakdown:`);
    report.suites.forEach((suite) => {
      const suiteSuccessRate =
        suite.passed + suite.failed > 0
          ? (suite.passed / (suite.passed + suite.failed)) * 100
          : 0;

      console.log(`   ${suite.suite}:`);
      console.log(
        `     ✅ ${suite.passed} passed, ❌ ${suite.failed} failed, ⏭️ ${suite.skipped} skipped`
      );
      console.log(`     📈 ${suiteSuccessRate.toFixed(1)}% success rate`);
      console.log(`     ⏱️  ${(suite.duration / 1000).toFixed(2)}s duration`);
    });

    if (report.totalFailed === 0) {
      console.log(
        `\n🎉 ALL TESTS PASSED! SecureBuffer implementation is ready for production.`
      );
      console.log(`\n🔐 Security Features Verified:`);
      console.log(`   ✅ Memory clearing and secure overwrite`);
      console.log(`   ✅ Access control after clearing`);
      console.log(`   ✅ Concurrent access handling`);
      console.log(`   ✅ Atomic operations`);
      console.log(`   ✅ Performance benchmarks met`);
      console.log(`   ✅ Memory leak prevention`);
      console.log(`   ✅ Documentation and examples`);
    } else {
      console.log(
        `\n⚠️  ${report.totalFailed} TEST(S) FAILED - Review results before production deployment`
      );

      // List failed suites
      const failedSuites = report.suites.filter((s) => s.failed > 0);
      if (failedSuites.length > 0) {
        console.log(`\n❌ Failed Test Suites:`);
        failedSuites.forEach((suite) => {
          console.log(`   - ${suite.suite}: ${suite.failed} failed test(s)`);
        });
      }
    }

    console.log("\n" + "=".repeat(80));
  }
}

// Run the test suite if this file is executed directly
if (require.main === module) {
  const runner = new SecureBufferTestRunner();

  runner
    .runAllTests()
    .then((report) => {
      process.exit(report.totalFailed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error("❌ Test runner failed:", error);
      process.exit(1);
    });
}

export { SecureBufferTestRunner };
