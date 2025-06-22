/**
 * Security Monitoring Configurable Thresholds Example
 *
 * This example demonstrates how to use configurable attack detection thresholds
 * for different security postures and environments.
 */

import {
  createAttackThresholds,
  getAttackThresholds,
  monitorActiveAttacks,
  type AttackThresholds,
} from "../scripts/security-monitoring";

/**
 * Example 1: Using default thresholds from environment variables
 */
async function useDefaultThresholds() {
  console.log("=== Using Default Thresholds ===");

  // This will use thresholds from environment variables or built-in defaults
  await monitorActiveAttacks();
}

/**
 * Example 2: Using custom thresholds for high-security environment
 */
async function useHighSecurityThresholds() {
  console.log("\n=== Using High Security Thresholds ===");

  const highSecurityThresholds: AttackThresholds = createAttackThresholds({
    otpFailures: 10, // Lower threshold - more sensitive
    rateLimitViolations: 25, // Lower threshold - more sensitive
    suspiciousIpCount: 2, // Lower threshold - more sensitive
    targetedAttackAttempts: 5, // Lower threshold - more sensitive
  });

  await monitorActiveAttacks(highSecurityThresholds);
}

/**
 * Example 3: Using custom thresholds for development environment
 */
async function useDevelopmentThresholds() {
  console.log("\n=== Using Development Environment Thresholds ===");

  const devThresholds: AttackThresholds = createAttackThresholds({
    otpFailures: 200, // Higher threshold - less sensitive
    rateLimitViolations: 500, // Higher threshold - less sensitive
    suspiciousIpCount: 20, // Higher threshold - less sensitive
    targetedAttackAttempts: 100, // Higher threshold - less sensitive
  });

  await monitorActiveAttacks(devThresholds);
}

/**
 * Example 4: Using environment-specific configuration
 */
async function useEnvironmentSpecificThresholds() {
  console.log("\n=== Using Environment-Specific Thresholds ===");

  const environment = process.env.NODE_ENV || "development";
  let thresholds: AttackThresholds;

  switch (environment) {
    case "production":
      thresholds = createAttackThresholds({
        otpFailures: 30,
        rateLimitViolations: 75,
        suspiciousIpCount: 3,
        targetedAttackAttempts: 10,
      });
      break;

    case "staging":
      thresholds = createAttackThresholds({
        otpFailures: 100,
        rateLimitViolations: 200,
        suspiciousIpCount: 8,
        targetedAttackAttempts: 30,
      });
      break;

    default: // development
      thresholds = createAttackThresholds({
        otpFailures: 500,
        rateLimitViolations: 1000,
        suspiciousIpCount: 50,
        targetedAttackAttempts: 200,
      });
  }

  console.log(`Environment: ${environment}`);
  console.log(`Thresholds:`, thresholds);

  await monitorActiveAttacks(thresholds);
}

/**
 * Example 5: Getting current thresholds from environment
 */
function showCurrentThresholds() {
  console.log("\n=== Current Environment Thresholds ===");

  const currentThresholds = getAttackThresholds();
  console.log("Current thresholds from environment variables:");
  console.log(`  OTP Failures: ${currentThresholds.otpFailures}`);
  console.log(
    `  Rate Limit Violations: ${currentThresholds.rateLimitViolations}`
  );
  console.log(`  Suspicious IP Count: ${currentThresholds.suspiciousIpCount}`);
  console.log(
    `  Targeted Attack Attempts: ${currentThresholds.targetedAttackAttempts}`
  );

  console.log("\nEnvironment variables checked:");
  console.log(
    `  SECURITY_OTP_FAILURE_THRESHOLD: ${process.env.SECURITY_OTP_FAILURE_THRESHOLD || "not set (default: 50)"}`
  );
  console.log(
    `  SECURITY_RATE_LIMIT_VIOLATION_THRESHOLD: ${process.env.SECURITY_RATE_LIMIT_VIOLATION_THRESHOLD || "not set (default: 100)"}`
  );
  console.log(
    `  SECURITY_SUSPICIOUS_IP_THRESHOLD: ${process.env.SECURITY_SUSPICIOUS_IP_THRESHOLD || "not set (default: 5)"}`
  );
  console.log(
    `  SECURITY_TARGETED_ATTACK_THRESHOLD: ${process.env.SECURITY_TARGETED_ATTACK_THRESHOLD || "not set (default: 20)"}`
  );
}

/**
 * Run all examples
 */
async function runExamples() {
  try {
    // Show current configuration
    showCurrentThresholds();

    // Run different threshold examples
    await useDefaultThresholds();
    await useHighSecurityThresholds();
    await useDevelopmentThresholds();
    await useEnvironmentSpecificThresholds();
  } catch (error) {
    console.error("Error running security monitoring examples:", error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples();
}

export {
  showCurrentThresholds,
  useDefaultThresholds,
  useDevelopmentThresholds,
  useEnvironmentSpecificThresholds,
  useHighSecurityThresholds,
};
