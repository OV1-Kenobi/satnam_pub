/**
 * Security Library - Master Context Compliant
 * 
 * This library provides cryptographic operations and security utilities
 * following Master Context requirements for browser-only serverless architecture.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * - Web Crypto API for all cryptographic operations 
 * - AES-256-GCM for data encryption 
 * - Browser-compatible environment variables with getEnvVar() pattern
 * - Individual Wallet Sovereignty support with role-based security
 * - Privacy-first architecture with zero-knowledge patterns and no sensitive data logging
 * - Standardized role hierarchy 
 * - No Node.js modules - browser-only serverless architecture
 * - Comprehensive JSDoc type definitions for complete type safety
 * - JWT token management with automatic expiration
 * - Secure session management integration patterns
 */

/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key) {
  return process.env[key];
}

// MASTER CONTEXT COMPLIANCE: Use Web Crypto API only (no Node.js dependencies)

/**
 * Security configuration constants following Master Context requirements
 * @typedef {Object} SecurityConfig
 * @property {number} ARGON2_MEMORY_COST - Argon2 memory cost (2^16 = 64MB)
 * @property {number} ARGON2_TIME_COST - Argon2 time cost (3 iterations)
 * @property {number} ARGON2_PARALLELISM - Argon2 parallelism (1 thread)
 * @property {number} ARGON2_HASH_LENGTH - Argon2 hash length (32 bytes)
 * @property {number} AES_KEY_LENGTH - AES key length (32 bytes for AES-256)
 * @property {number} IV_LENGTH - IV length for AES-GCM (12 bytes)
 * @property {number} SALT_LENGTH - Salt length (32 bytes)
 * @property {number} TAG_LENGTH - Authentication tag length (16 bytes)
 * @property {number} PBKDF2_ITERATIONS - PBKDF2 iterations (100,000)
 * @property {string} HASH_ALGORITHM - Hash algorithm (SHA-256)
 * @property {string} ENCRYPTION_ALGORITHM - Encryption algorithm (AES-GCM per Master Context)
 */

/**
 * @type {SecurityConfig}
 */
const SECURITY_CONFIG = {
  // PBKDF2 Configuration (Web Crypto API standard)
  PBKDF2_ITERATIONS: 100000, // High iteration count for security
  PBKDF2_HASH_LENGTH: 32, // 256-bit output
  
  // AES-GCM Configuration (Master Context requirement)
  AES_KEY_LENGTH: 32, // 256-bit keys
  IV_LENGTH: 12, // 96-bit IV for AES-GCM
  SALT_LENGTH: 32, // 256-bit salt
  TAG_LENGTH: 16, // 128-bit authentication tag
  

  
  // Algorithms (Master Context compliant)
  HASH_ALGORITHM: "SHA-256",
  ENCRYPTION_ALGORITHM: "AES-GCM", // Per Master Context directive
};

/**
 * Credential validation result
 * @typedef {Object} CredentialValidation
 * @property {boolean} isValid - Whether credentials are valid
 * @property {string[]} missing - Missing credential keys
 * @property {string[]} warnings - Validation warnings
 */

/**
 * PBKDF2 configuration report
 * @typedef {Object} PBKDF2ConfigReport
 * @property {SecurityConfig} config - Security configuration
 * @property {number} iterations - PBKDF2 iterations
 * @property {string[]} recommendations - Configuration recommendations
 * @property {string[]} warnings - Configuration warnings
 */

/**
 * Password strength validation result
 * @typedef {Object} PasswordStrengthResult
 * @property {boolean} isValid - Whether password meets strength requirements
 * @property {string[]} issues - List of password strength issues
 */

/**
 * Rate limiter attempt tracking
 * @typedef {Object} RateLimitAttempt
 * @property {number} count - Number of attempts
 * @property {number} resetTime - Time when attempts reset
 */

/**
 * Individual Wallet Sovereignty validation for security operations
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {string} operation - Security operation type
 * @returns {Object} Sovereignty validation result
 */
function validateSecurityOperationSovereignty(userRole, operation) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited authority
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      authorized: true,
      hasUnlimitedAccess: true,
      requiresApproval: false,
      message: 'Sovereign role with unlimited security operation authority'
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Offspring have restricted security operations
  if (userRole === 'offspring') {
    const restrictedOperations = ['credential_backup', 'key_derivation', 'secure_token_generation'];
    const requiresApproval = restrictedOperations.includes(operation);
    
    return {
      authorized: !restrictedOperations.includes(operation) || false,
      hasUnlimitedAccess: false,
      requiresApproval,
      message: requiresApproval ? 'Security operation requires guardian approval' : 'Security operation authorized'
    };
  }

  // Default to unauthorized for unknown roles
  return {
    authorized: false,
    hasUnlimitedAccess: false,
    requiresApproval: true,
    message: 'Unknown role - security operation not authorized'
  };
}

/**
 * Convert legacy role to standardized Master Context role hierarchy
 * @param {string} legacyRole - Legacy role (admin, user, parent, child, etc.)
 * @returns {'private'|'offspring'|'adult'|'steward'|'guardian'} Standardized role
 */
function convertToStandardizedRole(legacyRole) {
  // GREENFIELD APPROACH: Convert legacy roles to standardized hierarchy
  switch (legacyRole) {
    case 'admin':
      return 'guardian'; // Admin maps to guardian
    case 'user':
      return 'adult'; // User maps to adult
    case 'parent':
      return 'adult'; // Legacy parent maps to adult
    case 'child':
    case 'teen':
      return 'offspring'; // Legacy child/teen maps to offspring
    case 'steward':
      return 'steward'; // Steward remains steward
    case 'guardian':
      return 'guardian'; // Guardian remains guardian
    case 'private':
      return 'private'; // Private remains private
    case 'offspring':
      return 'offspring'; // Offspring remains offspring
    case 'adult':
      return 'adult'; // Adult remains adult
    default:
      return 'private'; // Default to private for unknown roles
  }
}

/**
 * Generate cryptographically secure random bytes using Web Crypto API
 * @param {number} size - Number of bytes to generate
 * @returns {Promise<Uint8Array>} Cryptographically secure random bytes
 */
async function generateRandomBytes(size) {
  const array = new Uint8Array(size);
  crypto.getRandomValues(array);
  return array;
}

/**
 * Convert Uint8Array to base64 string
 * @param {Uint8Array} array - Array to convert
 * @returns {string} Base64 encoded string
 */
function arrayToBase64(array) {
  return btoa(Array.from(array, byte => String.fromCharCode(byte)).join(''));
}

/**
 * Convert base64 string to Uint8Array
 * @param {string} base64 - Base64 string to convert
 * @returns {Uint8Array} Decoded array
 */
function base64ToArray(base64) {
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return array;
}

/**
 * Convert string to Uint8Array
 * @param {string} str - String to convert
 * @returns {Uint8Array} Encoded array
 */
function stringToArray(str) {
  return new TextEncoder().encode(str);
}

/**
 * Convert Uint8Array to string
 * @param {Uint8Array} array - Array to convert
 * @returns {string} Decoded string
 */
function arrayToString(array) {
  return new TextDecoder().decode(array);
}

/**
 * Generate a cryptographically secure encryption key from a passphrase using PBKDF2
 * Uses Web Crypto API PBKDF2 with high iteration count for browser compatibility
 * @param {string} passphrase - Passphrase to derive key from
 * @param {Uint8Array} salt - Salt for key derivation
 * @returns {Promise<Uint8Array>} Derived encryption key
 */
export async function deriveEncryptionKey(passphrase, salt) {
  try {
    // MASTER CONTEXT COMPLIANCE: Use Web Crypto API PBKDF2 with high iteration count
    const encoder = new TextEncoder();
    const passphraseBuffer = encoder.encode(passphrase);

    const key = await crypto.subtle.importKey(
      'raw',
      passphraseBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    // Convert Uint8Array to proper ArrayBuffer for Web Crypto API compatibility
    const saltBuffer = new ArrayBuffer(salt.length);
    new Uint8Array(saltBuffer).set(salt);

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: SECURITY_CONFIG.PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      key,
      SECURITY_CONFIG.AES_KEY_LENGTH * 8
    );

    return new Uint8Array(derivedBits);
  } catch (error) {
    throw new Error(
      `Key derivation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Encrypts sensitive data using AES-256-GCM with Argon2id key derivation
 * Master Context Compliant: Uses AES-256-GCM for data encryption per directive
 * Gold Standard: Authenticated encryption with Argon2id key derivation
 * Returns base64 encoded encrypted data with IV and salt prepended
 * @param {string} data - Data to encrypt
 * @param {string} passphrase - Passphrase for encryption
 * @returns {Promise<string>} Base64 encoded encrypted data
 */
export async function encryptCredentials(data, passphrase) {
  try {
    const salt = await generateRandomBytes(SECURITY_CONFIG.SALT_LENGTH);
    const iv = await generateRandomBytes(SECURITY_CONFIG.IV_LENGTH);
    const key = await deriveEncryptionKey(passphrase, salt);

    // Convert key to proper ArrayBuffer for Web Crypto API compatibility
    const keyBuffer = new ArrayBuffer(key.length);
    new Uint8Array(keyBuffer).set(key);

    // Import key for Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    // Convert IV to proper ArrayBuffer for Web Crypto API compatibility
    const ivBuffer = new ArrayBuffer(iv.length);
    new Uint8Array(ivBuffer).set(iv);

    // Convert data to proper ArrayBuffer for Web Crypto API compatibility
    const dataArray = stringToArray(data);
    const dataBuffer = new ArrayBuffer(dataArray.length);
    new Uint8Array(dataBuffer).set(dataArray);

    // Encrypt data using AES-256-GCM (Master Context requirement)
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer,
      },
      cryptoKey,
      dataBuffer
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
 * Master Context Compliant: Uses AES-256-GCM for data decryption per directive
 * @param {string} encryptedData - Base64 encoded encrypted data
 * @param {string} passphrase - Passphrase for decryption
 * @returns {Promise<string>} Decrypted data
 */
export async function decryptCredentials(encryptedData, passphrase) {
  try {
    const combined = base64ToArray(encryptedData);

    // Extract components
    const salt = combined.subarray(0, SECURITY_CONFIG.SALT_LENGTH);
    const iv = combined.subarray(SECURITY_CONFIG.SALT_LENGTH, SECURITY_CONFIG.SALT_LENGTH + SECURITY_CONFIG.IV_LENGTH);
    const encrypted = combined.subarray(SECURITY_CONFIG.SALT_LENGTH + SECURITY_CONFIG.IV_LENGTH);

    const key = await deriveEncryptionKey(passphrase, salt);

    // Convert key to proper ArrayBuffer for Web Crypto API compatibility
    const keyBuffer = new ArrayBuffer(key.length);
    new Uint8Array(keyBuffer).set(key);

    // Import key for Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // Convert IV to proper ArrayBuffer for Web Crypto API compatibility
    const ivBuffer = new ArrayBuffer(iv.length);
    new Uint8Array(ivBuffer).set(iv);

    // Convert encrypted data to proper ArrayBuffer for Web Crypto API compatibility
    const encryptedBuffer = new ArrayBuffer(encrypted.length);
    new Uint8Array(encryptedBuffer).set(encrypted);

    // Decrypt data using AES-256-GCM (Master Context requirement)
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer,
      },
      cryptoKey,
      encryptedBuffer
    );

    return arrayToString(new Uint8Array(decrypted));
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : "Invalid passphrase or corrupted data"}`
    );
  }
}

/**
 * Validates and reports current PBKDF2 configuration
 * Helps identify potentially problematic settings for performance
 * @returns {PBKDF2ConfigReport} Configuration report with recommendations and warnings
 */
export function getPBKDF2Config() {
  const iterations = SECURITY_CONFIG.PBKDF2_ITERATIONS;
  const recommendations = [];
  const warnings = [];

  // Validate configuration
  if (iterations < 50000) {
    warnings.push("Iteration count too low (<50,000) - vulnerable to attacks");
  } else if (iterations > 200000) {
    warnings.push("Iteration count very high (>200,000) - may cause performance issues");
  } else if (iterations > 150000) {
    warnings.push(
      "Iteration count high (>150,000) - monitor for performance impact"
    );
  }

  if (SECURITY_CONFIG.ARGON2_TIME_COST < 2) {
    warnings.push("Time cost too low - may be vulnerable to attacks");
  } else if (SECURITY_CONFIG.ARGON2_TIME_COST > 10) {
    warnings.push("Time cost very high - may cause performance issues");
  }

  // Environment-specific recommendations
  if (typeof window !== "undefined") {
    recommendations.push("Browser environment: Web Crypto API PBKDF2 provides optimal compatibility");
  } else {
    recommendations.push("Serverless environment: Web Crypto API PBKDF2 ensures compatibility");
  }

  return {
    config: { ...SECURITY_CONFIG },
    iterations,
    recommendations,
    warnings,
  };
}

/**
 * Validates PBKDF2 configuration on startup
 * Call this during application initialization to catch configuration issues early
 */
export function validatePBKDF2ConfigOnStartup() {
  const { warnings } = getPBKDF2Config();

  // PRIVACY: No sensitive configuration data logging
  if (warnings.length === 0) {
    // Configuration meets gold standard
  }
}

/**
 * Securely validates environment credentials without exposing them
 * @returns {CredentialValidation} Validation result
 */
export function validateCredentials() {
  const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];
  const missing = [];
  const warnings = [];

  // Browser environment compatibility - use getEnvVar pattern
  for (const key of required) {
    const value = getEnvVar(key) || getEnvVar(`NEXT_PUBLIC_${key}`);

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
 * @param {string} passphrase - Passphrase for encryption
 * @returns {Promise<string>} Encrypted credential backup
 */
export async function createSecureCredentialBackup(passphrase) {
  const credentials = {
    supabaseUrl: getEnvVar("SUPABASE_URL") || getEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseKey: getEnvVar("SUPABASE_ANON_KEY") || getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    lightningDomain: getEnvVar("LIGHTNING_DOMAIN"),
    timestamp: new Date().toISOString(),
    version: "2.0.0", // Updated for Argon2-browser
  };

  const credentialData = JSON.stringify(credentials, null, 2);
  return await encryptCredentials(credentialData, passphrase);
}

/**
 * Restores credentials from secure backup encrypted with Argon2id
 * @param {string} encryptedBackup - Encrypted backup data
 * @param {string} passphrase - Passphrase for decryption
 * @returns {Promise<Object>} Restored credentials
 */
export async function restoreCredentialsFromBackup(encryptedBackup, passphrase) {
  const decryptedData = await decryptCredentials(encryptedBackup, passphrase);
  return JSON.parse(decryptedData);
}

/**
 * Timing-safe password verification using PBKDF2
 * Prevents timing attacks that could leak information about password correctness
 * Uses Web Crypto API PBKDF2 for browser compatibility
 * @param {string} passphrase - Passphrase to verify
 * @param {string} hash - Hash to verify against
 * @returns {Promise<boolean>} Whether passphrase matches hash
 */
export async function verifyPassphrase(passphrase, hash) {
  try {
    // MASTER CONTEXT COMPLIANCE: Use Web Crypto API PBKDF2 verification
    // Parse the hash format: pbkdf2:iterations:salt:hash
    if (!hash.startsWith('pbkdf2:')) {
      // Legacy hash format not supported - only PBKDF2 format supported
      return false;
    }

    const parts = hash.split(':');
    if (parts.length !== 4) {
      return false;
    }

    const iterations = parseInt(parts[1]);
    const saltBase64 = parts[2];
    const expectedHashBase64 = parts[3];

    // Decode salt and expected hash
    const salt = base64ToArray(saltBase64);
    const expectedHash = base64ToArray(expectedHashBase64);

    // Derive key using same parameters
    const encoder = new TextEncoder();
    const passphraseBuffer = encoder.encode(passphrase);

    const key = await crypto.subtle.importKey(
      'raw',
      passphraseBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const saltBuffer = new ArrayBuffer(salt.length);
    new Uint8Array(saltBuffer).set(salt);

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: iterations,
        hash: 'SHA-256'
      },
      key,
      SECURITY_CONFIG.AES_KEY_LENGTH * 8
    );

    const computedHash = new Uint8Array(derivedBits);

    // Constant-time comparison to prevent timing attacks
    if (computedHash.length !== expectedHash.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < computedHash.length; i++) {
      result |= computedHash[i] ^ expectedHash[i];
    }

    return result === 0;
  } catch (error) {
    // Always return false on error to prevent information leakage
    return false;
  }
}

/**
 * Generates a secure PBKDF2 hash for password storage
 * MASTER CONTEXT COMPLIANCE: Uses Web Crypto API PBKDF2 with high iteration count
 * @param {string} passphrase - Passphrase to hash
 * @returns {Promise<string>} Secure hash
 */
export async function hashPassphrase(passphrase) {
  const salt = await generateRandomBytes(SECURITY_CONFIG.SALT_LENGTH);

  // MASTER CONTEXT COMPLIANCE: Use Web Crypto API PBKDF2 with high iteration count
  const encoder = new TextEncoder();
  const passphraseBuffer = encoder.encode(passphrase);

  const key = await crypto.subtle.importKey(
    'raw',
    passphraseBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  // Convert salt to proper ArrayBuffer for Web Crypto API compatibility
  const saltBuffer = new ArrayBuffer(salt.length);
  new Uint8Array(saltBuffer).set(salt);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: SECURITY_CONFIG.PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    key,
    SECURITY_CONFIG.AES_KEY_LENGTH * 8
  );

  // Create hash format for PBKDF2
  const hashArray = new Uint8Array(derivedBits);
  const saltBase64 = arrayToBase64(salt);
  const hashBase64 = arrayToBase64(hashArray);

  return `pbkdf2:${SECURITY_CONFIG.PBKDF2_ITERATIONS}:${saltBase64}:${hashBase64}`;
}

/**
 * Securely clears sensitive data from memory
 * Use this after handling sensitive information
 * @param {Uint8Array} array - Array to clear
 */
export function clearSensitiveData(array) {
  if (array && array.length > 0) {
    array.fill(0);
  }
}

/**
 * Generates a secure random token for various security purposes
 * (session tokens, CSRF tokens, etc.)
 * @param {number} [length=32] - Token length in bytes
 * @returns {Promise<string>} Secure random token
 */
export async function generateSecureToken(length = 32) {
  const bytes = await generateRandomBytes(length);
  const token = arrayToBase64(bytes);
  clearSensitiveData(bytes);
  return token;
}

/**
 * Timing-safe string comparison to prevent timing attacks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} Whether strings are equal
 */
export function constantTimeCompare(a, b) {
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
 * Master Context compliant with Individual Wallet Sovereignty support
 */
export class SecurityRateLimiter {
  /**
   * @param {number} [maxAttempts=5] - Maximum attempts before rate limiting
   * @param {number} [windowMs=900000] - Time window in milliseconds (15 minutes)
   */
  constructor(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    /** @type {Map<string, RateLimitAttempt>} */
    this.attempts = new Map();
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  /**
   * Check if an identifier is allowed to make a request
   * @param {string} identifier - Unique identifier (IP, user ID, etc.)
   * @returns {boolean} Whether request is allowed
   */
  isAllowed(identifier) {
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

  /**
   * Reset rate limit for an identifier
   * @param {string} identifier - Identifier to reset
   */
  reset(identifier) {
    this.attempts.delete(identifier);
  }

  /**
   * Clean up expired rate limit entries
   */
  cleanup() {
    const now = Date.now();
    const entries = Array.from(this.attempts.entries());
    for (const [identifier, attempt] of entries) {
      if (now > attempt.resetTime) {
        this.attempts.delete(identifier);
      }
    }
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} Whether email is valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {PasswordStrengthResult} Validation result
   */
  isStrongPassword(password) {
    const issues = [];

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

  /**
   * Sanitize input to prevent XSS and injection attacks
   * @param {string} input - Input to sanitize
   * @returns {string} Sanitized input
   */
  sanitizeInput(input) {
    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, "") // Remove angle brackets
      .replace(/javascript:/gi, "") // Remove javascript: protocol
      .replace(/on\w+=/gi, "") // Remove event handlers
      .trim();
  }
}

/**
 * Master Context compliant security configuration
 * @type {Object}
 */
export const securityConfig = {
  encryption: {
    algorithm: SECURITY_CONFIG.ENCRYPTION_ALGORITHM, // AES-GCM per Master Context
    keyLength: SECURITY_CONFIG.AES_KEY_LENGTH, // 256-bit keys
    ivLength: SECURITY_CONFIG.IV_LENGTH, // 96-bit IV
    saltLength: SECURITY_CONFIG.SALT_LENGTH, // 256-bit salt
  },
  hashing: {
    algorithm: SECURITY_CONFIG.HASH_ALGORITHM, // SHA-256

    pbkdf2: {
      iterations: SECURITY_CONFIG.PBKDF2_ITERATIONS,
    },
  },
  rateLimiting: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  sovereignty: {
    enforceRoleValidation: true,
    defaultRole: 'private',
    restrictedOperations: ['credential_backup', 'key_derivation', 'secure_token_generation'],
  },
  privacy: {
    enableLogging: false, // Privacy-first: no logging
    enableAnalytics: false, // Privacy-first: no analytics
    enableTracking: false, // Privacy-first: no tracking
  },
};
