#!/usr/bin/env node

/**
 * Test script for database-backed rate limiting
 * This script tests the new checkRateLimitDB function to ensure it works correctly
 */

import { checkRateLimitDB, checkRateLimit } from "../utils/auth-crypto.js";
import { defaultLogger as logger } from "../utils/logger.js";

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  duration: number;
}

/**
 * Test the database-backed rate limiting function
 */
async function testDatabaseRateLimiting(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const testIP = "192.168.1.100"; // Test IP address
  const maxRequests = 3;
  const windowMs = 5000; // 5 seconds for quick testing

  // Test 1: First request should be allowed
  logger.info("🧪 Test 1: First request should be allowed");
  const start1 = Date.now();
  try {
    const result1 = await checkRateLimitDB(testIP, maxRequests, windowMs);
    const duration1 = Date.now() - start1;
    
    if (result1.allowed && result1.remainingRequests === maxRequests - 1) {
      results.push({
        testName: "First request allowed",
        passed: true,
        message: `✅ First request allowed with ${result1.remainingRequests} remaining`,
        duration: duration1,
      });
    } else {
      results.push({
        testName: "First request allowed",
        passed: false,
        message: `❌ Expected allowed=true, remainingRequests=${maxRequests - 1}, got allowed=${result1.allowed}, remainingRequests=${result1.remainingRequests}`,
        duration: duration1,
      });
    }
  } catch (error) {
    results.push({
      testName: "First request allowed",
      passed: false,
      message: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: Date.now() - start1,
    });
  }

  // Test 2: Second and third requests should be allowed
  logger.info("🧪 Test 2: Second and third requests should be allowed");
  for (let i = 2; i <= maxRequests; i++) {
    const start = Date.now();
    try {
      const result = await checkRateLimitDB(testIP, maxRequests, windowMs);
      const duration = Date.now() - start;
      
      if (result.allowed && result.remainingRequests === maxRequests - i) {
        results.push({
          testName: `Request ${i} allowed`,
          passed: true,
          message: `✅ Request ${i} allowed with ${result.remainingRequests} remaining`,
          duration,
        });
      } else {
        results.push({
          testName: `Request ${i} allowed`,
          passed: false,
          message: `❌ Expected allowed=true, remainingRequests=${maxRequests - i}, got allowed=${result.allowed}, remainingRequests=${result.remainingRequests}`,
          duration,
        });
      }
    } catch (error) {
      results.push({
        testName: `Request ${i} allowed`,
        passed: false,
        message: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - start,
      });
    }
  }

  // Test 3: Fourth request should be blocked
  logger.info("🧪 Test 3: Fourth request should be blocked");
  const start3 = Date.now();
  try {
    const result3 = await checkRateLimitDB(testIP, maxRequests, windowMs);
    const duration3 = Date.now() - start3;
    
    if (!result3.allowed && result3.remainingRequests === 0) {
      results.push({
        testName: "Fourth request blocked",
        passed: true,
        message: `✅ Fourth request correctly blocked with ${result3.remainingRequests} remaining`,
        duration: duration3,
      });
    } else {
      results.push({
        testName: "Fourth request blocked",
        passed: false,
        message: `❌ Expected allowed=false, remainingRequests=0, got allowed=${result3.allowed}, remainingRequests=${result3.remainingRequests}`,
        duration: duration3,
      });
    }
  } catch (error) {
    results.push({
      testName: "Fourth request blocked",
      passed: false,
      message: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: Date.now() - start3,
    });
  }

  // Test 4: Wait for window to reset and test again
  logger.info("🧪 Test 4: Waiting for rate limit window to reset...");
  await new Promise(resolve => setTimeout(resolve, windowMs + 1000)); // Wait for window + 1 second

  const start4 = Date.now();
  try {
    const result4 = await checkRateLimitDB(testIP, maxRequests, windowMs);
    const duration4 = Date.now() - start4;
    
    if (result4.allowed && result4.remainingRequests === maxRequests - 1) {
      results.push({
        testName: "Rate limit reset after window",
        passed: true,
        message: `✅ Rate limit correctly reset after window with ${result4.remainingRequests} remaining`,
        duration: duration4,
      });
    } else {
      results.push({
        testName: "Rate limit reset after window",
        passed: false,
        message: `❌ Expected allowed=true, remainingRequests=${maxRequests - 1}, got allowed=${result4.allowed}, remainingRequests=${result4.remainingRequests}`,
        duration: duration4,
      });
    }
  } catch (error) {
    results.push({
      testName: "Rate limit reset after window",
      passed: false,
      message: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: Date.now() - start4,
    });
  }

  return results;
}

/**
 * Test the deprecated in-memory rate limiting for comparison
 */
async function testInMemoryRateLimiting(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const testIP = "192.168.1.101"; // Different test IP
  const maxRequests = 3;
  const windowMs = 5000; // 5 seconds for quick testing

  logger.info("🧪 Testing deprecated in-memory rate limiting for comparison");

  // Test 1: First request should be allowed
  const start1 = Date.now();
  try {
    const result1 = checkRateLimit(testIP, maxRequests, windowMs);
    const duration1 = Date.now() - start1;
    
    if (result1.allowed && result1.remainingRequests === maxRequests - 1) {
      results.push({
        testName: "In-memory: First request allowed",
        passed: true,
        message: `✅ In-memory first request allowed with ${result1.remainingRequests} remaining`,
        duration: duration1,
      });
    } else {
      results.push({
        testName: "In-memory: First request allowed",
        passed: false,
        message: `❌ Expected allowed=true, remainingRequests=${maxRequests - 1}, got allowed=${result1.allowed}, remainingRequests=${result1.remainingRequests}`,
        duration: duration1,
      });
    }
  } catch (error) {
    results.push({
      testName: "In-memory: First request allowed",
      passed: false,
      message: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: Date.now() - start1,
    });
  }

  return results;
}

/**
 * Main test runner
 */
async function runTests(): Promise<void> {
  logger.info("🚀 Starting database-backed rate limiting tests...");
  
  try {
    // Test database-backed rate limiting
    const dbResults = await testDatabaseRateLimiting();
    
    // Test in-memory rate limiting for comparison
    const memoryResults = await testInMemoryRateLimiting();
    
    // Combine results
    const allResults = [...dbResults, ...memoryResults];
    
    // Print results
    logger.info("\n📊 Test Results:");
    logger.info("=" .repeat(80));
    
    let passedCount = 0;
    let totalDuration = 0;
    
    for (const result of allResults) {
      const status = result.passed ? "✅ PASS" : "❌ FAIL";
      logger.info(`${status} | ${result.testName} (${result.duration}ms)`);
      logger.info(`     ${result.message}`);
      
      if (result.passed) passedCount++;
      totalDuration += result.duration;
    }
    
    logger.info("=" .repeat(80));
    logger.info(`📈 Summary: ${passedCount}/${allResults.length} tests passed`);
    logger.info(`⏱️  Total duration: ${totalDuration}ms`);
    
    if (passedCount === allResults.length) {
      logger.info("🎉 All tests passed! Database-backed rate limiting is working correctly.");
      process.exit(0);
    } else {
      logger.error("❌ Some tests failed. Please check the database configuration and migration.");
      process.exit(1);
    }
    
  } catch (error) {
    logger.error("💥 Test runner failed:", error);
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((error) => {
    logger.error("💥 Unhandled error:", error);
    process.exit(1);
  });
}

export { runTests, testDatabaseRateLimiting, testInMemoryRateLimiting };
