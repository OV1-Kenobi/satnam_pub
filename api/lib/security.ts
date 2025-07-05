// lib/security.ts
// All crypto imports are lazy loaded for better performance

// Type definitions for lazy-loaded modules
type Argon2Module = typeof import("argon2");

// Module cache for loaded modules
const moduleCache = new Map<string, any>();

/**
 * Lazy load crypto utilities for AES encryption
 */
async function createCipher(algorithm: string, key: Buffer, iv: Buffer) {
  if (typeof window !== "undefined") {
    throw new Error(
      "AES-GCM encryption not available in browser. Use Web Crypto API."
    );
  }

  const crypto = await import("crypto");
  return crypto.createCipheriv(algorithm, key, iv);
}

async function createDecipher(algorithm: string, key: Buffer, iv: Buffer) {
  if (typeof window !== "undefined") {
    throw new Error(
      "AES-GCM decryption not available in browser. Use Web Crypto API."
    );
  }

  const crypto = await import("crypto");
  return crypto.createDecipheriv(algorithm, key, iv);
}

async function randomBytes(size: number): Promise<Buffer> {
  if (typeof window !== "undefined") {
    // Browser environment - use Web Crypto API
    const array = new Uint8Array(size);
    window.crypto.getRandomValues(array);
    return Buffer.from(array);
  } else {
    // Node.js environment
    const crypto = await import("crypto");
    return crypto.randomBytes(size);
  }
}

/**
 * Lazy load argon2 module - only works in Node.js environment
 */
async function getArgon2(): Promise<Argon2Module> {
  if (moduleCache.has("argon2")) {
    return moduleCache.get("argon2") as Argon2Module;
  }

  if (typeof window !== "undefined") {
    throw new Error(
      "Argon2 is not available in browser environment. Use Web Crypto API alternatives."
    );
  }

  const argon2 = await import("argon2");
  moduleCache.set("argon2", argon2);
  return argon2;
}

// Constants for encryption
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

// Configurable Argon2 parameters with production-safe defaults
const ARGON2_CONFIG = {
  memoryCost:
    typeof process !== "undefined" && process.env
      ? parseInt(process.env.ARGON2_MEMORY_COST || "16")
      : 16, // 2^16 = 64MB (safe default)
  timeCost:
    typeof process !== "undefined" && process.env
      ? parseInt(process.env.ARGON2_TIME_COST || "3")
      : 3, // Reduced from 5 for better performance
  parallelism:
    typeof process !== "undefined" && process.env
      ? parseInt(process.env.ARGON2_PARALLELISM || "1")
      : 1, // Single thread
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
      "Memory cost high (>128MB) - monitor for OOM errors under load"
    );
  }

  if (ARGON2_CONFIG.timeCost < 2) {
    warnings.push("Time cost too low - may be vulnerable to attacks");
  } else if (ARGON2_CONFIG.timeCost > 10) {
    warnings.push("Time cost very high - may cause performance issues");
  }

  // Environment-specific recommendations
  const nodeEnv =
    typeof process !== "undefined" && process.env
      ? process.env.NODE_ENV
      : undefined;

  if (nodeEnv === "development") {
    recommendations.push(
      "Development: Consider ARGON2_MEMORY_COST=15 (32MB) for faster testing"
    );
  } else if (nodeEnv === "production") {
    if (ARGON2_CONFIG.memoryCost < 16) {
      recommendations.push(
        "Production: Consider increasing to ARGON2_MEMORY_COST=16 (64MB) minimum"
      );
    }
    if (ARGON2_CONFIG.memoryCost > 17) {
      recommendations.push(
        "Production: Consider reducing to ARGON2_MEMORY_COST=17 (128MB) to prevent OOM"
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
 */
export function validateArgon2ConfigOnStartup(): void {
  const { config, memoryUsageMB, recommendations, warnings } =
    getArgon2Config();

  console.log(`🔐 Argon2 Configuration:`);
  console.log(
    `   Memory: ${memoryUsageMB.toFixed(0)}MB (2^${config.memoryCost})`
  );
  console.log(`   Time Cost: ${config.timeCost} iterations`);
  console.log(`   Parallelism: ${config.parallelism} thread(s)`);

  if (warnings.length > 0) {
    console.warn(`⚠️  Configuration Warnings:`);
    warnings.forEach((warning: string) => console.warn(`   - ${warning}`));
  }

  if (recommendations.length > 0) {
    console.log(`💡 Recommendations:`);
    recommendations.forEach((rec: string) => console.log(`   - ${rec}`));
  }

  if (warnings.length === 0) {
    console.log(`✅ Argon2 configuration looks good!`);
  }
}

/**
 * Generates a cryptographically secure encryption key from a passphrase using Argon2id
 */
export async function deriveEncryptionKey(
  passphrase: string,
  salt: Buffer
): Promise<Buffer> {
  const argon2 = await getArgon2();
  const hash = await argon2.hash(passphrase, {
    type: argon2.argon2id,
    memoryCost: 2 ** ARGON2_CONFIG.memoryCost,
    timeCost: ARGON2_CONFIG.timeCost,
    parallelism: ARGON2_CONFIG.parallelism,
    hashLength: ARGON2_CONFIG.hashLength,
    salt: salt,
    raw: true,
  });

  return Buffer.from(hash);
}

/**
 * Encrypts sensitive data using AES-256-GCM with Argon2id key derivation
 * Returns base64 encoded encrypted data with IV and salt prepended
 */
export async function encryptCredentials(
  data: string,
  passphrase: string
): Promise<string> {
  try {
    const salt = await randomBytes(SALT_LENGTH);
    const iv = await randomBytes(IV_LENGTH);
    const key = await deriveEncryptionKey(passphrase, salt);

    const cipher = await createCipher(ALGORITHM, key, iv);

    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = (cipher as any).getAuthTag();

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
      `Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Decrypts data encrypted with encryptCredentials using Argon2id key derivation
 */
export async function decryptCredentials(
  encryptedData: string,
  passphrase: string
): Promise<string> {
  try {
    const combined = Buffer.from(encryptedData, "base64");

    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + TAG_LENGTH
    );
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = await deriveEncryptionKey(passphrase, salt);

    const decipher = await createDecipher(ALGORITHM, key, iv);
    (decipher as any).setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, undefined, "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : "Invalid passphrase or corrupted data"}`
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
    const env =
      typeof process !== "undefined" && process.env ? process.env : {};
    const value = env[key] || env[`NEXT_PUBLIC_${key}`];

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
  passphrase: string
): Promise<string> {
  const env = typeof process !== "undefined" && process.env ? process.env : {};

  const credentials = {
    supabaseUrl: env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    lightningDomain: env.LIGHTNING_DOMAIN,
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
  passphrase: string
): Promise<Record<string, any>> {
  const decryptedData = await decryptCredentials(encryptedBackup, passphrase);
  return JSON.parse(decryptedData);
}

/**
 * Timing-safe password verification using Argon2id
 * Prevents timing attacks that could leak information about password correctness
 */
export async function verifyPassphrase(
  passphrase: string,
  hash: string
): Promise<boolean> {
  try {
    const argon2 = await getArgon2();
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
  const argon2 = await getArgon2();
  return await argon2.hash(passphrase, {
    type: argon2.argon2id,
    memoryCost: 2 ** ARGON2_CONFIG.memoryCost,
    timeCost: ARGON2_CONFIG.timeCost,
    parallelism: ARGON2_CONFIG.parallelism,
    hashLength: ARGON2_CONFIG.hashLength,
  });
}

/**
 * Securely clears sensitive data from memory
 * Use this after handling sensitive information
 */
export function clearSensitiveData(buffer: Buffer): void {
  if (buffer && buffer.length > 0) {
    buffer.fill(0);
  }
}

/**
 * Generates a secure random token for various security purposes
 * (session tokens, CSRF tokens, etc.)
 */
export async function generateSecureToken(
  length: number = 32
): Promise<string> {
  const bytes = await randomBytes(length);
  const token = bytes.toString("base64url");
  clearSensitiveData(bytes);
  return token;
}

/**
 * Constant-time string comparison to prevent timing attacks
 * Use this when comparing sensitive values like tokens or hashes
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Rate limiting helper for security-sensitive operations
 * Simple in-memory rate limiter (for production, use Redis or similar)
 */
export class SecurityRateLimiter {
  private attempts = new Map<string, { count: number; resetTime: number }>();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (!record || now > record.resetTime) {
      this.attempts.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return true;
    }

    if (record.count >= this.maxAttempts) {
      return false;
    }

    record.count++;
    return true;
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of Array.from(this.attempts.entries())) {
      if (now > record.resetTime) {
        this.attempts.delete(key);
      }
    }
  }
}

/**
 * Input validation helpers for security
 */
export const SecurityValidators = {
  /**
   * Validates email format with security considerations
   */
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  },

  /**
   * Validates password strength based on OWASP recommendations
   */
  isStrongPassword(password: string): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (password.length < 12) {
      issues.push("Password must be at least 12 characters long");
    }

    if (!/[a-z]/.test(password)) {
      issues.push("Password must contain at least one lowercase letter");
    }

    if (!/[A-Z]/.test(password)) {
      issues.push("Password must contain at least one uppercase letter");
    }

    if (!/\d/.test(password)) {
      issues.push("Password must contain at least one number");
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>?]/.test(password)) {
      issues.push("Password must contain at least one special character");
    }

    // Check for common patterns
    if (/(.)\1{2,}/.test(password)) {
      issues.push("Password should not contain repeated characters");
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  },

  /**
   * Sanitizes input to prevent injection attacks
   */
  sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, "") // Remove angle brackets
      .replace(/['"]/g, "") // Remove quotes
      .replace(/[;&|`$]/g, "") // Remove command injection chars
      .trim()
      .substring(0, 1000); // Limit length
  },
};
