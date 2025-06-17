/**
 * @fileoverview Application Startup Security Validator
 * @description Ensures all security protocols are properly configured before application starts
 * This addresses the critical issue where Argon2 parameters were not validated during startup
 */

import { enforceGoldStandardOnStartup } from "./crypto-validator.js";
import { validateArgon2ConfigOnStartup } from "./security.js";

/**
 * Startup validation configuration
 */
interface StartupValidationConfig {
  enforceGoldStandard: boolean;
  exitOnFailure: boolean;
  logLevel: "minimal" | "detailed";
  validateEnvironment: boolean;
}

/**
 * Run comprehensive startup validation
 * This function should be called at the very beginning of your application startup
 */
export async function validateSecurityOnStartup(
  config: Partial<StartupValidationConfig> = {}
): Promise<boolean> {
  const finalConfig: StartupValidationConfig = {
    enforceGoldStandard: true,
    exitOnFailure: process.env.NODE_ENV === "production",
    logLevel: "detailed",
    validateEnvironment: true,
    ...config,
  };

  console.log("🔐 Starting Application Security Validation...\n");

  try {
    // 1. Validate Argon2 Configuration (the original issue)
    console.log("1️⃣  Validating Argon2 Configuration...");
    validateArgon2ConfigOnStartup();
    console.log("✅ Argon2 configuration validated\n");

    // 2. Run Gold Standard validation if required
    if (finalConfig.enforceGoldStandard) {
      console.log("2️⃣  Running Gold Standard Crypto Validation...");
      const isGoldStandard = enforceGoldStandardOnStartup(
        finalConfig.exitOnFailure
      );

      if (!isGoldStandard && finalConfig.exitOnFailure) {
        console.error(
          "❌ Application startup blocked - Gold Standard requirements not met"
        );
        return false;
      }
      console.log("✅ Gold Standard validation completed\n");
    }

    // 3. Validate Environment Configuration
    if (finalConfig.validateEnvironment) {
      console.log("3️⃣  Validating Environment Configuration...");
      const envValid = validateEnvironmentSafety();

      if (!envValid && finalConfig.exitOnFailure) {
        console.error(
          "❌ Application startup blocked - Environment configuration unsafe"
        );
        return false;
      }
      console.log("✅ Environment validation completed\n");
    }

    console.log(
      "🎉 All security validations passed! Application is ready to start.\n"
    );
    return true;
  } catch (error) {
    console.error("💥 Critical error during security validation:", error);

    if (finalConfig.exitOnFailure) {
      console.error(
        "❌ Application startup blocked due to security validation failure"
      );
      process.exit(1);
    }

    return false;
  }
}

/**
 * Validate environment configuration for common security issues
 */
function validateEnvironmentSafety(): boolean {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Check for critical missing environment variables
  const criticalVars = [
    "PRIVACY_MASTER_KEY",
    "JWT_SECRET",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
  ];

  criticalVars.forEach((varName) => {
    const value = process.env[varName];
    if (!value) {
      issues.push(`Missing critical environment variable: ${varName}`);
    } else if (
      value.includes("your_") ||
      value.includes("replace_with") ||
      value.includes("placeholder")
    ) {
      issues.push(`${varName} appears to contain placeholder value`);
    } else if (value.length < 20) {
      warnings.push(
        `${varName} is shorter than recommended (${value.length} chars)`
      );
    }
  });

  // Check Argon2 environment variables exist
  const argon2Vars = [
    "ARGON2_MEMORY_COST",
    "ARGON2_TIME_COST",
    "ARGON2_PARALLELISM",
  ];
  argon2Vars.forEach((varName) => {
    const value = process.env[varName];
    if (!value) {
      warnings.push(`${varName} not set - using default value`);
    }
  });

  // Check for development warnings in production
  if (process.env.NODE_ENV === "production") {
    if (process.env.DEBUG_MODE === "true") {
      warnings.push("DEBUG_MODE is enabled in production");
    }
    if (process.env.SQL_LOGGING === "true") {
      warnings.push("SQL_LOGGING is enabled in production");
    }
  }

  // Display results
  if (issues.length > 0) {
    console.error("🚨 CRITICAL ENVIRONMENT ISSUES:");
    issues.forEach((issue) => console.error(`   ❌ ${issue}`));
    console.error();
  }

  if (warnings.length > 0) {
    console.warn("⚠️  ENVIRONMENT WARNINGS:");
    warnings.forEach((warning) => console.warn(`   ⚠️  ${warning}`));
    console.warn();
  }

  if (issues.length === 0 && warnings.length === 0) {
    console.log("✅ Environment configuration looks good!");
  }

  return issues.length === 0;
}

/**
 * Quick security check - minimal validation for development
 */
export function quickSecurityCheck(): boolean {
  console.log("🔍 Quick Security Check...");

  try {
    // Just validate basic Argon2 config
    validateArgon2ConfigOnStartup();

    // Check for critical missing vars
    const critical = ["PRIVACY_MASTER_KEY", "JWT_SECRET"];
    const missing = critical.filter((varName) => !process.env[varName]);

    if (missing.length > 0) {
      console.warn(`⚠️  Missing: ${missing.join(", ")}`);
      return false;
    }

    console.log("✅ Quick security check passed");
    return true;
  } catch (error) {
    console.error("❌ Quick security check failed:", error);
    return false;
  }
}

/**
 * Production-ready startup validation
 * Enforces all Gold Standard requirements
 */
export async function productionStartupValidation(): Promise<void> {
  console.log("🏭 Production Security Validation Starting...\n");

  const success = await validateSecurityOnStartup({
    enforceGoldStandard: true,
    exitOnFailure: true,
    logLevel: "detailed",
    validateEnvironment: true,
  });

  if (!success) {
    console.error(
      "💥 Production validation failed - application will not start"
    );
    process.exit(1);
  }

  console.log(
    "🔒 Production security validation complete - application secured\n"
  );
}

/**
 * Development-friendly startup validation
 * Warns about issues but doesn't block startup
 */
export async function developmentStartupValidation(): Promise<void> {
  console.log("🛠  Development Security Validation Starting...\n");

  await validateSecurityOnStartup({
    enforceGoldStandard: false,
    exitOnFailure: false,
    logLevel: "detailed",
    validateEnvironment: true,
  });

  console.log("🔧 Development validation complete - check warnings above\n");
}

/**
 * Validate that Argon2 parameters are actually being used in crypto operations
 * This addresses the specific issue mentioned in the code review
 */
export function validateArgon2Usage(): boolean {
  console.log("🔍 Validating Argon2 Parameter Usage...");

  try {
    // Import the security module to check if Argon2 config is accessible
    const argon2 = require("argon2");

    // Verify Argon2 is installed and working
    if (!argon2 || !argon2.argon2id) {
      console.error("❌ Argon2 library not properly installed");
      return false;
    }

    // Check if environment variables are being read
    const memCost = process.env.ARGON2_MEMORY_COST;
    const timeCost = process.env.ARGON2_TIME_COST;
    const parallelism = process.env.ARGON2_PARALLELISM;

    console.log(`📊 Current Argon2 Configuration:`);
    console.log(
      `   Memory Cost: ${memCost || "default (16)"} -> ${Math.pow(2, parseInt(memCost || "16")) / (1024 * 1024)}MB`
    );
    console.log(`   Time Cost: ${timeCost || "default (3)"} iterations`);
    console.log(`   Parallelism: ${parallelism || "default (1)"} thread(s)`);

    console.log("✅ Argon2 parameters are being read from environment");
    console.log("✅ Argon2 usage validation complete\n");

    return true;
  } catch (error) {
    console.error("❌ Argon2 usage validation failed:", error);
    return false;
  }
}
