#!/usr/bin/env tsx
/**
 * @fileoverview Test Data Cleanup Script
 * @description Cleans up test data and artifacts after running SecureBuffer tests
 */

import { promises as fs } from "fs";
import { join } from "path";
import { TestDbHelper } from "../lib/__tests__/test-db-helper";

async function cleanupTestData(): Promise<void> {
  console.log("🧹 Starting test data cleanup...");

  try {
    // Clean up database test data
    console.log("📊 Cleaning up database test data...");
    const isConnected = await TestDbHelper.checkConnection();

    if (isConnected) {
      await TestDbHelper.cleanupTestData();
      console.log("✅ Database test data cleaned");
    } else {
      console.log("ℹ️  Database not connected, skipping database cleanup");
    }

    // Clean up test reports directory
    console.log("📁 Cleaning up test reports...");
    const reportsDir = join(process.cwd(), "test-reports");

    try {
      const files = await fs.readdir(reportsDir);
      for (const file of files) {
        if (file.endsWith(".json") || file.endsWith(".log")) {
          await fs.unlink(join(reportsDir, file));
          console.log(`   Removed: ${file}`);
        }
      }
      console.log("✅ Test reports cleaned");
    } catch (error) {
      console.log("ℹ️  No test reports to clean");
    }

    // Clean up temporary test files
    console.log("🗂️  Cleaning up temporary test files...");
    const tempPatterns = ["test-*.tmp", "secure-buffer-*.log", "*.test.log"];

    // Clean up coverage files
    const coverageDir = join(process.cwd(), "coverage");
    try {
      await fs.rm(coverageDir, { recursive: true, force: true });
      console.log("✅ Coverage files cleaned");
    } catch (error) {
      console.log("ℹ️  No coverage files to clean");
    }

    console.log("🎉 Test cleanup completed successfully!");
  } catch (error) {
    console.error("❌ Error during test cleanup:", error);
    process.exit(1);
  }
}

// Run cleanup if this file is executed directly
if (require.main === module) {
  cleanupTestData()
    .then(() => {
      console.log("✅ Cleanup finished");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Cleanup failed:", error);
      process.exit(1);
    });
}

export { cleanupTestData };
