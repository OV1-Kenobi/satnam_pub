// lib/security.ts
// Gold Standard Security with Argon2 and Web Crypto API
// Following master context: browser-only, no Node.js modules, privacy-first

import argon2 from 'argon2-browser';

// Security configuration constants - Gold Standard Settings
const SECURITY_CONFIG = {
  // Argon2 Configuration (Gold Standard)
  ARGON2_MEMORY_COST: 16, // 2^16 = 64MB (production safe)
  ARGON2_TIME_COST: 3, // 3 iterations (balanced security/performance)
  ARGON2_PARALLELISM: 1, // Single thread for serverless compatibility
  ARGON2_HASH_LENGTH: 32, // 256-bit output
  
  // AES-GCM Configuration
  AES_KEY_LENGTH: 32, // 256-bit keys
  IV_LENGTH: 12, // 96-bit IV for AES-GCM
  SALT_LENGTH: 32, // 256-bit salt
  TAG_LENGTH: 16, // 128-bit authentication tag
  
  // PBKDF2 Configuration (fallback)
  PBKDF2_ITERATIONS: 100000, // High iteration count
  
  // Algorithms
  HASH_ALGORITHM: "SHA-256" as const,
  ENCRYPTION_ALGORITHM: "AES-GCM" as const,
} as const;

/**
 * Generate cryptographically secure random bytes using Web Crypto API
 */
async function generateRandomBytes(size: number): Promise<Uint8Array> {
  const array = new Uint8Array(size);
  crypto.getRandomValues(array);
  return array;
}

/**
 * Convert Uint8Array to base64 string
 */
function arrayToBase64(array: Uint8Array): string {
  return btoa(Array.from(array, byte => String.fromCharCode(byte)).join(''));
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToArray(base64: string): Uint8Array {
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return array;
}

/**
 * Convert string to Uint8Array
 */
function stringToArray(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convert Uint8Array to string
 */
function arrayToString(array: Uint8Array): string {
  return new TextDecoder().decode(array);
}

/**
 * Generate a cryptographically secure encryption key from a passphrase using Argon2id
 * Gold Standard: Uses Argon2id (winner of Password Hashing Competition)
 */
export async function deriveEncryptionKey(
  passphrase: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  try {
    const hash = await argon2.hash({
      pass: passphrase,
      salt: salt,
      type: 2, // Argon2id
      mem: 2 ** SECURITY_CONFIG.ARGON2_MEMORY_COST,
      time: SECURITY_CONFIG.ARGON2_TIME_COST,
      parallelism: SECURITY_CONFIG.ARGON2_PARALLELISM,
      hashLen: SECURITY_CONFIG.AES_KEY_LENGTH,
    });
    
    return hash.hash;
  } catch (error) {
    throw new Error(
      `Argon2 key derivation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Encrypts sensitive data using AES-256-GCM with Argon2id key derivation
 * Gold Standard: Authenticated encryption with Argon2id key derivation
 * Returns base64 encoded encrypted data with IV and salt prepended
 */
export async function encryptCredentials(
  data: string,
  passphrase: string
): Promise<string> {
  try {
    const salt = await generateRandomBytes(SECURITY_CONFIG.SALT_LENGTH);
    const iv = await generateRandomBytes(SECURITY_CONFIG.IV_LENGTH);
    const key = await deriveEncryptionKey(passphrase, salt);

    // Import key for Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    // Encrypt data
    const dataArray = stringToArray(data);
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      cryptoKey,
      dataArray
    );

    // Combine salt, iv, and encrypted data
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return arrayToBase64(combined);
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
    const combined = base64ToArray(encryptedData);

    // Extract components
    const salt = combined.subarray(0, SECURITY_CONFIG.SALT_LENGTH);
    const iv = combined.subarray(SECURITY_CONFIG.SALT_LENGTH, SECURITY_CONFIG.SALT_LENGTH + SECURITY_CONFIG.IV_LENGTH);
    const encrypted = combined.subarray(SECURITY_CONFIG.SALT_LENGTH + SECURITY_CONFIG.IV_LENGTH);

    const key = await deriveEncryptionKey(passphrase, salt);

    // Import key for Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // Decrypt data
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      cryptoKey,
      encrypted
    );

    return arrayToString(new Uint8Array(decrypted));
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : "Invalid passphrase or corrupted data"}`
    );
  }
}

/**
 * Validates and reports current Argon2 configuration
 * Helps identify potentially problematic settings before they cause OOM errors
 */
export function getArgon2Config(): {
  config: typeof SECURITY_CONFIG;
  memoryUsageMB: number;
  recommendations: string[];
  warnings: string[];
} {
  const memoryUsageMB = Math.pow(2, SECURITY_CONFIG.ARGON2_MEMORY_COST) / (1024 * 1024);
  const recommendations: string[] = [];
  const warnings: string[] = [];

  // Validate configuration
  if (SECURITY_CONFIG.ARGON2_MEMORY_COST < 12) {
    warnings.push("Memory cost too low (<4MB) - vulnerable to attacks");
  } else if (SECURITY_CONFIG.ARGON2_MEMORY_COST > 18) {
    warnings.push("Memory cost very high (>256MB) - may cause OOM errors");
  } else if (SECURITY_CONFIG.ARGON2_MEMORY_COST > 17) {
    warnings.push(
      "Memory cost high (>128MB) - monitor for OOM errors under load"
    );
  }

  if (SECURITY_CONFIG.ARGON2_TIME_COST < 2) {
    warnings.push("Time cost too low - may be vulnerable to attacks");
  } else if (SECURITY_CONFIG.ARGON2_TIME_COST > 10) {
    warnings.push("Time cost very high - may cause performance issues");
  }

  // Environment-specific recommendations
  if (typeof window !== "undefined") {
    recommendations.push("Browser environment: Argon2-browser provides optimal security");
  } else {
    recommendations.push("Serverless environment: Argon2-browser ensures compatibility");
  }

  return {
    config: { ...SECURITY_CONFIG },
    memoryUsageMB,
    recommendations,
    warnings,
  };
}

/**
 * Validates Argon2 configuration on startup
 * Call this during application initialization to catch configuration issues early
 */
export function validateArgon2ConfigOnStartup(): void {
  const { config, memoryUsageMB, recommendations, warnings } = getArgon2Config();

  console.log(`🔐 Gold Standard Argon2 Configuration:`);
  console.log(`   Memory: ${memoryUsageMB.toFixed(0)}MB (2^${config.ARGON2_MEMORY_COST})`);
  console.log(`   Time Cost: ${config.ARGON2_TIME_COST} iterations`);
  console.log(`   Parallelism: ${config.ARGON2_PARALLELISM} thread(s)`);
  console.log(`   Algorithm: Argon2id (Password Hashing Competition winner)`);

  if (warnings.length > 0) {
    console.warn(`⚠️  Configuration Warnings:`);
    warnings.forEach((warning: string) => console.warn(`   - ${warning}`));
  }

  if (recommendations.length > 0) {
    console.log(`💡 Recommendations:`);
    recommendations.forEach((rec: string) => console.log(`   - ${rec}`));
  }

  if (warnings.length === 0) {
    console.log(`✅ Argon2 configuration meets gold standard!`);
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

  // Note: In browser environment, we don't access process.env
  // This function is primarily for serverless validation
  const env: Record<string, string | undefined> = typeof process !== "undefined" && process.env ? process.env : {};

  for (const key of required) {
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
  const env: Record<string, string | undefined> = typeof process !== "undefined" && process.env ? process.env : {};

  const credentials = {
    supabaseUrl: env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    lightningDomain: env.LIGHTNING_DOMAIN,
    timestamp: new Date().toISOString(),
    version: "2.0.0", // Updated for Argon2-browser
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
    const result = await argon2.verify({
      pass: passphrase,
      encoded: hash,
      type: 2, // Argon2id
    });
    return Boolean(result);
  } catch (error) {
    // Always return false on error to prevent information leakage
    return false;
  }
}

/**
 * Generates a secure Argon2id hash for password storage
 * Gold Standard: Uses Argon2id with configurable parameters
 */
export async function hashPassphrase(passphrase: string): Promise<string> {
  const salt = await generateRandomBytes(SECURITY_CONFIG.SALT_LENGTH);
  
  const hash = await argon2.hash({
    pass: passphrase,
    salt: salt,
    type: 2, // Argon2id
    mem: 2 ** SECURITY_CONFIG.ARGON2_MEMORY_COST,
    time: SECURITY_CONFIG.ARGON2_TIME_COST,
    parallelism: SECURITY_CONFIG.ARGON2_PARALLELISM,
    hashLen: SECURITY_CONFIG.AES_KEY_LENGTH,
  });
  
  return hash.encoded;
}

/**
 * Securely clears sensitive data from memory
 * Use this after handling sensitive information
 */
export function clearSensitiveData(array: Uint8Array): void {
  if (array && array.length > 0) {
    array.fill(0);
  }
}

/**
 * Generates a secure random token for various security purposes
 * (session tokens, CSRF tokens, etc.)
 */
export async function generateSecureToken(
  length: number = 32
): Promise<string> {
  const bytes = await generateRandomBytes(length);
  const token = arrayToBase64(bytes);
  clearSensitiveData(bytes);
  return token;
}

/**
 * Timing-safe string comparison to prevent timing attacks
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
 * Security Rate Limiter for preventing brute force attacks
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
    const attempt = this.attempts.get(identifier);

    if (!attempt) {
      this.attempts.set(identifier, { count: 1, resetTime: now + this.windowMs });
      return true;
    }

    if (now > attempt.resetTime) {
      this.attempts.set(identifier, { count: 1, resetTime: now + this.windowMs });
      return true;
    }

    if (attempt.count >= this.maxAttempts) {
      return false;
    }

    attempt.count++;
    return true;
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.attempts.entries());
    for (const [identifier, attempt] of entries) {
      if (now > attempt.resetTime) {
        this.attempts.delete(identifier);
      }
    }
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

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

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      issues.push("Password must contain at least one special character");
    }

    // Check for common patterns
    const commonPatterns = [
      "password",
      "123456",
      "qwerty",
      "admin",
      "letmein",
      "welcome",
    ];

    const lowerPassword = password.toLowerCase();
    for (const pattern of commonPatterns) {
      if (lowerPassword.includes(pattern)) {
        issues.push("Password contains common patterns");
        break;
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  sanitizeInput(input: string): string {
    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, "") // Remove angle brackets
      .replace(/javascript:/gi, "") // Remove javascript: protocol
      .replace(/on\w+=/gi, "") // Remove event handlers
      .trim();
  }
}
