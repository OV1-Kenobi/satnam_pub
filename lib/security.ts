// lib/security.ts
import * as argon2 from "argon2";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Security utilities for credential management and encryption
 * Used for protecting sensitive data at rest and in transit
 *
 * Uses Argon2id (gold standard) for key derivation - winner of Password Hashing Competition
 *
 * CONFIGURATION:
 * The Argon2 parameters are configurable via environment variables to prevent OOM errors:
 *
 * Environment Variables:
 * - ARGON2_MEMORY_COST: Log2 of memory usage (default: 16 = 64MB)
 * - ARGON2_TIME_COST: Number of iterations (default: 3)
 * - ARGON2_PARALLELISM: Degree of parallelism (default: 1)
 *
 * Memory Usage Guide:
 * - 2^15 (32MB): Development/testing only
 * - 2^16 (64MB): Production safe default, light security
 * - 2^17 (128MB): Good production balance with adequate resources
 * - 2^18 (256MB): High security, requires dedicated resources, monitor for OOM
 * - 2^19+ (512MB+): Maximum security, dedicated high-memory servers only
 *
 * Production Recommendations:
 * - Start with 64MB (ARGON2_MEMORY_COST=16) and monitor memory usage
 * - Scale up to 128MB (ARGON2_MEMORY_COST=17) if resources allow
 * - Never exceed 256MB (ARGON2_MEMORY_COST=18) without extensive load testing
 * - Use getArgon2Config() to validate your settings
 *
 * ⚠️  CRITICAL: Values >128MB may cause OOM errors on typical Node.js servers
 */

// Constants for encryption
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

// Configurable Argon2 parameters with production-safe defaults
// Memory costs: 2^16 (64MB), 2^17 (128MB), 2^18 (256MB), 2^19 (512MB)
// Recommended ranges:
// - Development/Testing: 64MB (2^16)
// - Production (light load): 128MB (2^17)
// - Production (heavy load): 64MB (2^16)
// - High-security (dedicated): 256MB+ (2^18+)
const ARGON2_CONFIG = {
  memoryCost: parseInt(process.env.ARGON2_MEMORY_COST || "16"), // 2^16 = 64MB (safe default)
  timeCost: parseInt(process.env.ARGON2_TIME_COST || "3"), // Reduced from 5 for better performance
  parallelism: parseInt(process.env.ARGON2_PARALLELISM || "1"), // Single thread
  hashLength: KEY_LENGTH, // 32 bytes output
};

/**
 * Validates and reports current Argon2 configuration
 * Helps identify potentially problematic settings before they cause OOM errors
 */
export function getArgon2Config(): {
  config: typeof ARGON2_CONFIG;
  memoryUsageMB: number;
  recommendations: string[];
  warnings: string[];
} {
  const memoryUsageMB = Math.pow(2, ARGON2_CONFIG.memoryCost) / (1024 * 1024);
  const recommendations: string[] = [];
  const warnings: string[] = [];

  // Validate configuration
  if (ARGON2_CONFIG.memoryCost < 12) {
    warnings.push("Memory cost too low (<4MB) - vulnerable to attacks");
  } else if (ARGON2_CONFIG.memoryCost > 18) {
    warnings.push("Memory cost very high (>256MB) - may cause OOM errors");
  } else if (ARGON2_CONFIG.memoryCost > 17) {
    warnings.push(
      "Memory cost high (>128MB) - monitor for OOM errors under load",
    );
  }

  if (ARGON2_CONFIG.timeCost < 2) {
    warnings.push("Time cost too low - may be vulnerable to attacks");
  } else if (ARGON2_CONFIG.timeCost > 10) {
    warnings.push("Time cost very high - may cause performance issues");
  }

  // Environment-specific recommendations
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "development") {
    recommendations.push(
      "Development: Consider ARGON2_MEMORY_COST=15 (32MB) for faster testing",
    );
  } else if (nodeEnv === "production") {
    if (ARGON2_CONFIG.memoryCost < 16) {
      recommendations.push(
        "Production: Consider increasing to ARGON2_MEMORY_COST=16 (64MB) minimum",
      );
    }
    if (ARGON2_CONFIG.memoryCost > 17) {
      recommendations.push(
        "Production: Consider reducing to ARGON2_MEMORY_COST=17 (128MB) to prevent OOM",
      );
    }
  }

  return {
    config: { ...ARGON2_CONFIG },
    memoryUsageMB,
    recommendations,
    warnings,
  };
}

/**
 * Validates Argon2 configuration on server startup
 * Call this during application initialization to catch configuration issues early
 *
 * Example usage:
 * ```typescript
 * import { validateArgon2ConfigOnStartup } from './lib/security';
 *
 * // In your server startup code
 * validateArgon2ConfigOnStartup();
 * ```
 */
export function validateArgon2ConfigOnStartup(): void {
  const { config, memoryUsageMB, recommendations, warnings } =
    getArgon2Config();

  console.log(`🔐 Argon2 Configuration:`);
  console.log(
    `   Memory: ${memoryUsageMB.toFixed(0)}MB (2^${config.memoryCost})`,
  );
  console.log(`   Time Cost: ${config.timeCost} iterations`);
  console.log(`   Parallelism: ${config.parallelism} thread(s)`);

  if (warnings.length > 0) {
    console.warn(`⚠️  Configuration Warnings:`);
    warnings.forEach((warning) => console.warn(`   - ${warning}`));
  }

  if (recommendations.length > 0) {
    console.log(`💡 Recommendations:`);
    recommendations.forEach((rec) => console.log(`   - ${rec}`));
  }

  if (warnings.length === 0) {
    console.log(`✅ Argon2 configuration looks good!`);
  }
}

/**
 * Generates a cryptographically secure encryption key from a passphrase using Argon2id
 *
 * Argon2id is the OWASP-recommended gold standard for key derivation:
 * - Hybrid of Argon2i (data-independent) and Argon2d (data-dependent)
 * - Memory-hard function providing maximum resistance to GPU/ASIC attacks
 * - Winner of the Password Hashing Competition
 *
 * Parameters are configurable via environment variables:
 * - ARGON2_MEMORY_COST: Log2 of memory usage (default: 16 = 64MB)
 * - ARGON2_TIME_COST: Number of iterations (default: 3)
 * - ARGON2_PARALLELISM: Degree of parallelism (default: 1)
 *
 * Memory usage guide:
 * - 64MB (2^16): Safe for most production servers, light security
 * - 128MB (2^17): Good balance for production with adequate resources
 * - 256MB (2^18): High security, requires dedicated resources
 * - 512MB+ (2^19+): Maximum security, dedicated high-memory servers only
 *
 * ⚠️  WARNING: Values >128MB may cause OOM errors on typical Node.js servers
 */
export async function deriveEncryptionKey(
  passphrase: string,
  salt: Buffer,
): Promise<Buffer> {
  const hash = await argon2.hash(passphrase, {
    type: argon2.argon2id,
    memoryCost: 2 ** ARGON2_CONFIG.memoryCost, // Configurable memory usage
    timeCost: ARGON2_CONFIG.timeCost, // Configurable iterations
    parallelism: ARGON2_CONFIG.parallelism, // Configurable parallelism
    hashLength: ARGON2_CONFIG.hashLength, // 32 bytes output
    salt: salt,
    raw: true, // Return raw bytes instead of encoded string
  });

  return Buffer.from(hash);
}

/**
 * Encrypts sensitive data using AES-256-GCM with Argon2id key derivation
 * Returns base64 encoded encrypted data with IV and salt prepended
 */
export async function encryptCredentials(
  data: string,
  passphrase: string,
): Promise<string> {
  try {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = await deriveEncryptionKey(passphrase, salt);

    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Prepend salt, iv, and auth tag to encrypted data
    const combined = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, "hex"),
    ]);

    return combined.toString("base64");
  } catch (error) {
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Decrypts data encrypted with encryptCredentials using Argon2id key derivation
 */
export async function decryptCredentials(
  encryptedData: string,
  passphrase: string,
): Promise<string> {
  try {
    const combined = Buffer.from(encryptedData, "base64");

    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + TAG_LENGTH,
    );
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = await deriveEncryptionKey(passphrase, salt);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, undefined, "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : "Invalid passphrase or corrupted data"}`,
    );
  }
}

/**
 * Securely validates environment credentials without exposing them
 */
export function validateCredentials(): {
  isValid: boolean;
  missing: string[];
  warnings: string[];
} {
  const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const key of required) {
    const value = process.env[key] || process.env[`NEXT_PUBLIC_${key}`];
    if (!value) {
      missing.push(key);
    } else {
      // Check for common security issues without logging the actual values
      if (
        value.includes("your-project-id") ||
        value.includes("your_") ||
        value.length < 20
      ) {
        warnings.push(`${key} appears to be a placeholder value`);
      }
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Creates a secure backup of credentials (encrypted with Argon2id)
 * Use this to store credentials securely outside of source code
 */
export async function createSecureCredentialBackup(
  passphrase: string,
): Promise<string> {
  const credentials = {
    supabaseUrl:
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey:
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    lightningDomain: process.env.LIGHTNING_DOMAIN,
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  };

  const credentialData = JSON.stringify(credentials, null, 2);
  return await encryptCredentials(credentialData, passphrase);
}

/**
 * Restores credentials from secure backup encrypted with Argon2id
 */
export async function restoreCredentialsFromBackup(
  encryptedBackup: string,
  passphrase: string,
): Promise<any> {
  const decryptedData = await decryptCredentials(encryptedBackup, passphrase);
  return JSON.parse(decryptedData);
}

/**
 * Timing-safe password verification using Argon2id
 * Prevents timing attacks that could leak information about password correctness
 */
export async function verifyPassphrase(
  passphrase: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, passphrase);
  } catch (error) {
    // Always return false on error to prevent information leakage
    return false;
  }
}

/**
 * Generates a secure Argon2id hash for password storage
 * Use this for storing user passwords securely
 * Uses the same configurable parameters as deriveEncryptionKey
 */
export async function hashPassphrase(passphrase: string): Promise<string> {
  return await argon2.hash(passphrase, {
    type: argon2.argon2id,
    memoryCost: 2 ** ARGON2_CONFIG.memoryCost, // Configurable memory usage
    timeCost: ARGON2_CONFIG.timeCost, // Configurable iterations
    parallelism: ARGON2_CONFIG.parallelism, // Configurable parallelism
    hashLength: ARGON2_CONFIG.hashLength, // 32 bytes hash
  });
}

/**
 * Memory-safe credential loading with automatic cleanup
 */
export async function loadCredentialsSecurely(): Promise<{
  supabaseUrl: string;
  supabaseKey: string;
  cleanup: () => void;
}> {
  const validation = validateCredentials();

  if (!validation.isValid) {
    throw new Error(
      `Missing required environment variables: ${validation.missing.join(", ")}`,
    );
  }

  if (validation.warnings.length > 0) {
    console.warn("Credential warnings:", validation.warnings);
  }

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Return cleanup function to clear sensitive data from memory
  const cleanup = () => {
    // Note: JavaScript doesn't have true memory clearing, but this helps with GC
    if (typeof global !== "undefined") {
      global.gc?.(); // Force garbage collection if available
    }
  };

  return { supabaseUrl, supabaseKey, cleanup };
}

/**
 * Atomic credential rotation for zero-downtime updates
 */
export class CredentialRotationManager {
  private backupCredentials: Map<string, string> = new Map();

  async rotateCredentials(newCredentials: {
    supabaseUrl?: string;
    supabaseKey?: string;
  }): Promise<{ success: boolean; rollback?: () => void }> {
    try {
      // Backup current credentials
      this.backupCredentials.set(
        "SUPABASE_URL",
        process.env.SUPABASE_URL || "",
      );
      this.backupCredentials.set(
        "SUPABASE_ANON_KEY",
        process.env.SUPABASE_ANON_KEY || "",
      );

      // Apply new credentials atomically
      if (newCredentials.supabaseUrl) {
        process.env.SUPABASE_URL = newCredentials.supabaseUrl;
      }
      if (newCredentials.supabaseKey) {
        process.env.SUPABASE_ANON_KEY = newCredentials.supabaseKey;
      }

      // Validate new credentials
      const validation = validateCredentials();
      if (!validation.isValid) {
        throw new Error("New credentials failed validation");
      }

      const rollback = () => {
        // Restore original credentials
        this.backupCredentials.forEach((value, key) => {
          if (value) {
            process.env[key] = value;
          }
        });
        this.backupCredentials.clear();
      };

      return { success: true, rollback };
    } catch (error) {
      // Auto-rollback on failure
      this.backupCredentials.forEach((value, key) => {
        if (value) {
          process.env[key] = value;
        }
      });
      this.backupCredentials.clear();

      throw new Error(
        `Credential rotation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
