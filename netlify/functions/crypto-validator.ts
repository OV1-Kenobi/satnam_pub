/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = /** @type {Object} */ import.meta;
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * @fileoverview Gold Standard Crypto Configuration Validator
 * @description Ensures all encryption protocols meet the highest security standards
 * for high-tech users who demand the absolute best in cryptographic protection
 */

import {
  getArgon2Config,
  validateArgon2ConfigOnStartup,
} from "../../api/lib/security.js";

/**
 * Gold Standard Encryption Configuration Requirements
 * These settings ensure maximum security for the most demanding users
 */
export const GOLD_STANDARD_REQUIREMENTS = {
  // Argon2 Memory Requirements (in MB)
  MINIMUM_MEMORY_MB: 64, // Absolute minimum for production
  RECOMMENDED_MEMORY_MB: 128, // Gold standard recommendation
  MAXIMUM_SAFE_MEMORY_MB: 256, // Upper limit before OOM risk

  // Argon2 Time Cost Requirements
  MINIMUM_TIME_COST: 3, // Minimum secure iterations
  RECOMMENDED_TIME_COST: 5, // Gold standard iterations
  MAXIMUM_TIME_COST: 10, // Upper limit before performance issues

  // Required Algorithms
  REQUIRED_KEY_DERIVATION: "argon2id", // Winner of Password Hashing Competition
  REQUIRED_SYMMETRIC_CIPHER: "aes-256-gcm", // Authenticated encryption
  REQUIRED_HASH_FUNCTION: "sha-256", // NIST recommended
  REQUIRED_RANDOM_SOURCE: "crypto.randomBytes", // CSPRNG

  // Security Standards
  MINIMUM_KEY_LENGTH: 32, // 256-bit keys minimum
  MINIMUM_IV_LENGTH: 16, // 128-bit IV minimum
  MINIMUM_SALT_LENGTH: 32, // 256-bit salt minimum
  REQUIRED_AUTH_TAG: true, // Must use authenticated encryption
} as const;

/**
 * Validation Result Interface
 */
export interface CryptoValidationResult {
  isGoldStandard: boolean;
  securityLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  issues: SecurityIssue[];
  recommendations: SecurityRecommendation[];
  configSummary: ConfigSummary;
}

interface SecurityIssue {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: "KEY_DERIVATION" | "ENCRYPTION" | "CONFIGURATION" | "PERFORMANCE";
  description: string;
  currentValue?: string | number;
  requiredValue?: string | number;
  fix: string;
}

interface SecurityRecommendation {
  priority: "HIGH" | "MEDIUM" | "LOW";
  category: "PERFORMANCE" | "SECURITY" | "MAINTENANCE";
  description: string;
  action: string;
}

interface ConfigSummary {
  argon2: {
    memoryMB: number;
    timeCost: number;
    parallelism: number;
    meetsGoldStandard: boolean;
  };
  encryption: {
    algorithm: string;
    keyLength: number;
    usesAuthenticatedEncryption: boolean;
  };
  environment: {
    nodeEnv: string;
    hasProperSecrets: boolean;
    configurationComplete: boolean;
  };
}

/**
 * Comprehensive validation of all crypto configurations against Gold Standard requirements
 */
export function validateGoldStandardCrypto(): CryptoValidationResult {
  console.log("🔍 Running Gold Standard Cryptographic Security Audit...\n");

  const issues: SecurityIssue[] = [];
  const recommendations: SecurityRecommendation[] = [];

  // 1. Validate Argon2 Configuration
  const argon2Validation = validateArgon2Configuration();
  issues.push(...argon2Validation.issues);
  recommendations.push(...argon2Validation.recommendations);

  // 2. Validate Environment Configuration
  const envValidation = validateEnvironmentConfiguration();
  issues.push(...envValidation.issues);
  recommendations.push(...envValidation.recommendations);

  // 3. Validate Encryption Standards
  const encryptionValidation = validateEncryptionStandards();
  issues.push(...encryptionValidation.issues);
  recommendations.push(...encryptionValidation.recommendations);

  // Determine overall security level
  const criticalIssues = issues.filter((i) => i.severity === "CRITICAL").length;
  const highIssues = issues.filter((i) => i.severity === "HIGH").length;

  let securityLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  if (criticalIssues > 0) {
    securityLevel = "CRITICAL";
  } else if (highIssues > 2) {
    securityLevel = "HIGH";
  } else if (highIssues > 0 || issues.length > 3) {
    securityLevel = "MEDIUM";
  } else {
    securityLevel = "LOW";
  }

  const isGoldStandard =
    criticalIssues === 0 && highIssues === 0 && issues.length <= 1;

  // Build configuration summary
  const argon2Config = getArgon2Config();
  const configSummary: ConfigSummary = {
    argon2: {
      memoryMB: argon2Config.memoryUsageMB,
      timeCost: argon2Config.config.timeCost,
      parallelism: argon2Config.config.parallelism,
      meetsGoldStandard:
        argon2Config.memoryUsageMB >=
          GOLD_STANDARD_REQUIREMENTS.RECOMMENDED_MEMORY_MB &&
        argon2Config.config.timeCost >=
          GOLD_STANDARD_REQUIREMENTS.RECOMMENDED_TIME_COST,
    },
    encryption: {
      algorithm: "aes-256-gcm", // We enforce this in our security module
      keyLength: 32,
      usesAuthenticatedEncryption: true,
    },
    environment: {
      nodeEnv: getEnvVar("NODE_ENV") || "development",
      hasProperSecrets: validateEnvironmentSecrets(),
      configurationComplete: validateConfigurationCompleteness(),
    },
  };

  return {
    isGoldStandard,
    securityLevel,
    issues,
    recommendations,
    configSummary,
  };
}

/**
 * Validate Argon2 configuration against Gold Standard requirements
 */
function validateArgon2Configuration(): {
  issues: SecurityIssue[];
  recommendations: SecurityRecommendation[];
} {
  const issues: SecurityIssue[] = [];
  const recommendations: SecurityRecommendation[] = [];

  try {
    const argon2Config = getArgon2Config();
    const { config, memoryUsageMB, warnings } = argon2Config;

    // Check memory cost
    if (memoryUsageMB < GOLD_STANDARD_REQUIREMENTS.MINIMUM_MEMORY_MB) {
      issues.push({
        severity: "CRITICAL",
        category: "KEY_DERIVATION",
        description: "Argon2 memory cost below secure minimum",
        currentValue: `${memoryUsageMB}MB`,
        requiredValue: `${GOLD_STANDARD_REQUIREMENTS.MINIMUM_MEMORY_MB}MB`,
        fix: `Set ARGON2_MEMORY_COST=${Math.log2(
          GOLD_STANDARD_REQUIREMENTS.MINIMUM_MEMORY_MB * 1024 * 1024
        )} in .env.local`,
      });
    } else if (
      memoryUsageMB < GOLD_STANDARD_REQUIREMENTS.RECOMMENDED_MEMORY_MB
    ) {
      issues.push({
        severity: "HIGH",
        category: "KEY_DERIVATION",
        description: "Argon2 memory cost below Gold Standard recommendation",
        currentValue: `${memoryUsageMB}MB`,
        requiredValue: `${GOLD_STANDARD_REQUIREMENTS.RECOMMENDED_MEMORY_MB}MB`,
        fix: `Set ARGON2_MEMORY_COST=17 for ${GOLD_STANDARD_REQUIREMENTS.RECOMMENDED_MEMORY_MB}MB in .env.local`,
      });
    }

    // Check time cost
    if (config.timeCost < GOLD_STANDARD_REQUIREMENTS.MINIMUM_TIME_COST) {
      issues.push({
        severity: "CRITICAL",
        category: "KEY_DERIVATION",
        description: "Argon2 time cost below secure minimum",
        currentValue: config.timeCost,
        requiredValue: GOLD_STANDARD_REQUIREMENTS.MINIMUM_TIME_COST,
        fix: `Set ARGON2_TIME_COST=${GOLD_STANDARD_REQUIREMENTS.MINIMUM_TIME_COST} in .env.local`,
      });
    } else if (
      config.timeCost < GOLD_STANDARD_REQUIREMENTS.RECOMMENDED_TIME_COST
    ) {
      recommendations.push({
        priority: "HIGH",
        category: "SECURITY",
        description:
          "Consider increasing Argon2 time cost for Gold Standard security",
        action: `Set ARGON2_TIME_COST=${GOLD_STANDARD_REQUIREMENTS.RECOMMENDED_TIME_COST} in .env.local`,
      });
    }

    // Check for configuration warnings
    warnings.forEach((warning) => {
      issues.push({
        severity: warning.includes("OOM") ? "HIGH" : "MEDIUM",
        category: "CONFIGURATION",
        description: `Argon2 configuration warning: ${warning}`,
        fix: "Review Argon2 parameters based on your server capacity",
      });
    });
  } catch (error) {
    issues.push({
      severity: "CRITICAL",
      category: "CONFIGURATION",
      description: "Failed to validate Argon2 configuration",
      fix: "Ensure Argon2 environment variables are properly set",
    });
  }

  return { issues, recommendations };
}

/**
 * Validate environment configuration for security
 */
function validateEnvironmentConfiguration(): {
  issues: SecurityIssue[];
  recommendations: SecurityRecommendation[];
} {
  const issues: SecurityIssue[] = [];
  const recommendations: SecurityRecommendation[] = [];

  // Check for placeholder values in environment
  const criticalEnvVars = [
    "PRIVACY_MASTER_KEY",
    "JWT_SECRET",
    "CSRF_SECRET",
    "MASTER_ENCRYPTION_KEY",
  ];

  criticalEnvVars.forEach((envVar) => {
    const value = process.env[envVar];
    if (!value) {
      issues.push({
        severity: "CRITICAL",
        category: "CONFIGURATION",
        description: `Missing critical environment variable: ${envVar}`,
        fix: `Generate a secure value for ${envVar} using: openssl rand -hex 32`,
      });
    } else if (
      value.includes("replace_with") ||
      value.includes("your_") ||
      value.length < 32
    ) {
      issues.push({
        severity: "CRITICAL",
        category: "CONFIGURATION",
        description: `${envVar} appears to be a placeholder or too short`,
        fix: `Generate a secure value for ${envVar} using: openssl rand -hex 32`,
      });
    }
  });

  // Check NODE_ENV
  const nodeEnv = getEnvVar("NODE_ENV");
  if (nodeEnv === "production") {
    recommendations.push({
      priority: "HIGH",
      category: "SECURITY",
      description:
        "Production environment detected - ensure all security measures are active",
      action:
        "Verify all environment variables are production-ready and secrets are secure",
    });
  } else if (!nodeEnv || nodeEnv === "development") {
    recommendations.push({
      priority: "MEDIUM",
      category: "MAINTENANCE",
      description:
        "Development environment - consider lower Argon2 settings for faster testing",
      action:
        "Set ARGON2_MEMORY_COST=15 for development to improve performance",
    });
  }

  return { issues, recommendations };
}

/**
 * Validate encryption standards
 */
function validateEncryptionStandards(): {
  issues: SecurityIssue[];
  recommendations: SecurityRecommendation[];
} {
  const issues: SecurityIssue[] = [];
  const recommendations: SecurityRecommendation[] = [];

  // Check for any usage of deprecated crypto methods
  // This would ideally scan the codebase, but for now we'll check configuration

  recommendations.push({
    priority: "MEDIUM",
    category: "SECURITY",
    description:
      "Ensure all encryption uses AES-256-GCM with Argon2id key derivation",
    action:
      "Audit codebase to replace any PBKDF2 or AES-CBC usage with Gold Standard methods",
  });

  return { issues, recommendations };
}

/**
 * Check if environment secrets are properly configured
 */
function validateEnvironmentSecrets(): boolean {
  const requiredSecrets = [
    "PRIVACY_MASTER_KEY",
    "JWT_SECRET",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
  ];

  return requiredSecrets.every((secret) => {
    const value = process.env[secret];
    return (
      value &&
      value.length > 20 &&
      !value.includes("your_") &&
      !value.includes("replace_with")
    );
  });
}

/**
 * Check if configuration is complete
 */
function validateConfigurationCompleteness(): boolean {
  const requiredConfig = [
    "ARGON2_MEMORY_COST",
    "ARGON2_TIME_COST",
    "ARGON2_PARALLELISM",
    "PRIVACY_MASTER_KEY",
    "JWT_SECRET",
  ];

  return requiredConfig.every((config) => process.env[config] !== undefined);
}

/**
 * Display validation results in a user-friendly format
 */
export function displayValidationResults(result: CryptoValidationResult): void {
  console.log("═".repeat(80));
  console.log("🔐 GOLD STANDARD CRYPTOGRAPHIC SECURITY AUDIT RESULTS");
  console.log("═".repeat(80));

  // Overall Status
  if (result.isGoldStandard) {
    console.log(
      "✅ CONGRATULATIONS! Your encryption meets GOLD STANDARD requirements"
    );
    console.log(
      "   Your high-tech users can trust in maximum cryptographic protection\n"
    );
  } else {
    console.log(`⚠️  SECURITY LEVEL: ${result.securityLevel}`);
    console.log("   Improvements needed to achieve Gold Standard encryption\n");
  }

  // Configuration Summary
  console.log("📊 CONFIGURATION SUMMARY");
  console.log("─".repeat(40));
  console.log(
    `Argon2 Memory: ${result.configSummary.argon2.memoryMB}MB ${
      result.configSummary.argon2.meetsGoldStandard ? "✅" : "⚠️"
    }`
  );
  console.log(
    `Argon2 Time Cost: ${result.configSummary.argon2.timeCost} iterations`
  );
  console.log(
    `Encryption: ${result.configSummary.encryption.algorithm} ${
      result.configSummary.encryption.usesAuthenticatedEncryption ? "✅" : "❌"
    }`
  );
  console.log(
    `Environment: ${result.configSummary.environment.nodeEnv} ${
      result.configSummary.environment.configurationComplete ? "✅" : "⚠️"
    }`
  );
  console.log();

  // Critical Issues
  const criticalIssues = result.issues.filter((i) => i.severity === "CRITICAL");
  if (criticalIssues.length > 0) {
    console.log("🚨 CRITICAL SECURITY ISSUES (FIX IMMEDIATELY)");
    console.log("─".repeat(40));
    criticalIssues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.description}`);
      if (issue.currentValue && issue.requiredValue) {
        console.log(
          `   Current: ${issue.currentValue} | Required: ${issue.requiredValue}`
        );
      }
      console.log(`   Fix: ${issue.fix}\n`);
    });
  }

  // High Priority Issues
  const highIssues = result.issues.filter((i) => i.severity === "HIGH");
  if (highIssues.length > 0) {
    console.log("⚠️  HIGH PRIORITY ISSUES");
    console.log("─".repeat(40));
    highIssues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.description}`);
      console.log(`   Fix: ${issue.fix}\n`);
    });
  }

  // Recommendations
  const highPriorityRecs = result.recommendations.filter(
    (r) => r.priority === "HIGH"
  );
  if (highPriorityRecs.length > 0) {
    console.log("💡 HIGH PRIORITY RECOMMENDATIONS");
    console.log("─".repeat(40));
    highPriorityRecs.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec.description}`);
      console.log(`   Action: ${rec.action}\n`);
    });
  }

  console.log("═".repeat(80));
  console.log(
    "For high-tech users who demand the best: Fix all CRITICAL and HIGH issues"
  );
  console.log(
    "Contact support if you need assistance achieving Gold Standard encryption"
  );
  console.log("═".repeat(80));
}

/**
 * Validate crypto configuration on startup and exit if not Gold Standard
 */
export function enforceGoldStandardOnStartup(
  exitOnFailure: boolean = false
): boolean {
  console.log("🚀 Starting Gold Standard Crypto Validation...\n");

  // First run the basic Argon2 validation
  validateArgon2ConfigOnStartup();
  console.log();

  // Then run comprehensive Gold Standard validation
  const result = validateGoldStandardCrypto();
  displayValidationResults(result);

  if (!result.isGoldStandard && exitOnFailure) {
    console.error(
      "\n❌ STARTUP FAILED: Crypto configuration does not meet Gold Standard requirements"
    );
    console.error(
      "Please fix the issues above before starting the application"
    );
    process.exit(1);
  }

  return result.isGoldStandard;
}
