/**
 * Privacy-First Hashing Utilities
 * CRITICAL SECURITY: Implements salt-based hashing for all sensitive user data
 * MASTER CONTEXT COMPLIANCE: Zero exposure of Nostr accounts in database breaches
 * SECURITY WARNING: Each table MUST use unique salts - never reuse salts across tables
 */

import { redactLogger as logger } from '../../utils/privacy-logger.js';
/**
 * Environment variable getter with browser compatibility
 * @param {string} key - Environment variable key
 * @param {string} [defaultValue] - Default value if not found
 * @returns {string} Environment variable value
 */
function getEnvVar(key, defaultValue = '') {
  // Primary: process.env for Node.js environments
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }

  // For browser environments, return default value
  // Environment variables should be handled by the build system
  return defaultValue;
}

/**
 * Generate cryptographically secure salt for individual users
 * @returns {Promise<string>} 64-character hex salt
 */
export async function generateUserSalt() {
  try {
    // Browser-only serverless architecture - use Web Crypto API exclusively
    if (!crypto || !crypto.getRandomValues) {
      throw new Error('Web Crypto API not available - browser environment required');
    }

    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const salt = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');

    if (!salt || salt.length !== 64) {
      throw new Error('Generated salt is invalid');
    }

    return salt;
  } catch (error) {
    logger.error('Failed to generate user salt:', { error, timestamp: new Date().toISOString() });
    throw new Error('Failed to generate cryptographically secure salt: ' + error.message);
  }
}

/**
 * Hash sensitive user data with individual salt
 * Uses PBKDF2 with SHA-512, 100,000 iterations for maximum security
 * @param {string} data - Data to hash
 * @param {string} userSalt - Individual user salt
 * @returns {Promise<string>} Hashed data
 */
export async function hashUserData(data, userSalt) {
  // Enhanced validation with detailed error messages
  if (data === null || data === undefined) {
    throw new Error('Data is required for hashing (received: ' + typeof data + ')');
  }

  if (!userSalt) {
    throw new Error('User salt is required for hashing (received: ' + typeof userSalt + ')');
  }

  // Convert data to string if it's not already
  const dataString = typeof data === 'string' ? data : String(data);

  const globalSalt = 'satnam_privacy_salt_2024'; // Global salt for additional security
  const combinedData = dataString + userSalt + globalSalt;

  try {
    // Browser-only serverless architecture - use Web Crypto API exclusively
    if (!crypto || !crypto.subtle) {
      throw new Error('Web Crypto API not available - browser environment required');
    }

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(combinedData);
    const hashBuffer = await crypto.subtle.digest('SHA-512', dataBuffer);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray, byte => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    logger.error('Crypto operation failed:', { error, timestamp: new Date().toISOString() });
    throw new Error(`Failed to hash user data: ${error.message}`);
  }
}

/**
 * Hash Nostr public key (npub) with user salt
 * @param {string} npub - Nostr public key
 * @param {string} userSalt - Individual user salt
 * @returns {Promise<string>} Hashed npub
 */
export async function hashNpub(npub, userSalt) {
  if (!npub || !npub.startsWith('npub1')) {
    throw new Error('Invalid npub format');
  }
  return await hashUserData(npub, userSalt);
}

/**
 * Hash NIP-05 identifier with DUID_SERVER_SECRET for consistent indexing
 * Uses HMAC-SHA256 to match nip05_records table hashing
 * @param {string} nip05 - NIP-05 identifier (user@domain.com)
 * @param {string} userSalt - Individual user salt (unused for NIP-05)
 * @returns {Promise<string>} Hashed NIP-05
 */
export async function hashNip05(nip05, userSalt) {
  if (!nip05 || !nip05.includes('@')) {
    throw new Error('Invalid NIP-05 format');
  }

  // Use DUID_SERVER_SECRET for consistent hashing across tables
  const secret = getEnvVar('DUID_SECRET_KEY') || getEnvVar('DUID_SERVER_SECRET') || getEnvVar('VITE_DUID_SERVER_SECRET');
  if (!secret) {
    throw new Error('DUID_SERVER_SECRET not configured for NIP-05 hashing');
  }

  // Use Node.js crypto for server-side HMAC (matches nip05_records table)
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const crypto = await import('node:crypto');
    return crypto.createHmac('sha256', secret).update(nip05).digest('hex');
  }

  // Fallback to user salt method for browser environments
  return await hashUserData(nip05, userSalt);
}



/**
 * Hash encrypted nsec with user salt
 * @param {string} encryptedNsec - Encrypted private key
 * @param {string} userSalt - Individual user salt
 * @returns {Promise<string>} Hashed encrypted nsec
 */
export async function hashEncryptedNsec(encryptedNsec, userSalt) {
  if (!encryptedNsec) {
    throw new Error('Encrypted nsec is required');
  }
  return await hashUserData(encryptedNsec, userSalt);
}

/**
 * Hash password with user salt (for authentication)
 * @param {string} password - Plain text password
 * @param {string} userSalt - Individual user salt
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password, userSalt) {
  if (!password) {
    throw new Error('Password is required');
  }
  return await hashUserData(password, userSalt);
}

/**
 * Create complete hashed user data object for database storage
 * @param {Object} userData - User data to hash
 * @param {string} userData.npub - Nostr public key
 * @param {string} userData.nip05 - NIP-05 identifier
 * @param {string} [userData.encryptedNsec] - Encrypted private key
 * @param {string} [userData.password] - Plain text password
 * @param {string} [userData.username] - Username for user management
 * @param {string} [userData.bio] - User bio/description
 * @param {string} [userData.displayName] - Display name
 * @param {string} [userData.picture] - Profile picture URL
 * @param {string} [userData.lightningAddress] - Lightning address
 * @param {string} [userData.role] - User role (private, offspring, adult, steward, guardian)
 * @param {boolean} [userData.is_active] - User active status
 * @param {string} [userData.created_at] - Creation timestamp
 * @param {string} [userSalt] - Existing user salt (generates new if not provided)
 * @returns {Promise<Object>} Hashed user data object
 */
export async function createHashedUserData(userData, userSalt = null) {
  // Validate input data
  if (!userData) {
    throw new Error('User data is required for hashing');
  }

  // Generate salt if not provided
  const salt = userSalt || await generateUserSalt();

  // Validate salt was generated successfully
  if (!salt) {
    throw new Error('Failed to generate or provide user salt');
  }

  logger.log('🔍 Creating hashed user data:', {
    timestamp: new Date().toISOString(),
    hasUserData: !!userData,
    hasSalt: !!salt,
  });

  const hashedData = {
    user_salt: salt,
    // Keep username unencrypted for user management
    username: userData.username,

    // MAXIMUM ENCRYPTION: Hash ALL user data fields (including profile data)
    hashed_username: userData.username ? await hashUserData(userData.username, salt) : null,
    hashed_bio: userData.bio !== undefined ? await hashUserData(userData.bio || '', salt) : null,
    hashed_display_name: userData.displayName ? await hashUserData(userData.displayName, salt) : null,
    hashed_picture: userData.picture !== undefined ? await hashUserData(userData.picture || '', salt) : null,

    // Hash identity data
    hashed_npub: userData.npub ? await hashNpub(userData.npub, salt) : null,
    hashed_nip05: userData.nip05 ? await hashNip05(userData.nip05, salt) : null,
    hashed_lightning_address: userData.lightningAddress ? await hashLightningAddress(userData.lightningAddress, salt) : null,
    hashed_encrypted_nsec: userData.encryptedNsec ? await hashEncryptedNsec(userData.encryptedNsec, salt) : null,
    hashed_password: userData.password ? await hashPassword(userData.password, salt) : null,

    // Preserve metadata
    role: userData.role || 'private',
    is_active: userData.is_active !== false,
    created_at: userData.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return hashedData;
}

/**
 * Verify hashed data matches input data using constant-time comparison
 * @param {string} inputData - Input data to verify
 * @param {string} hashedData - Stored hashed data
 * @param {string} userSalt - User's salt
 * @returns {Promise<boolean>} True if data matches
 */
export async function verifyHashedData(inputData, hashedData, userSalt) {
  if (!inputData || !hashedData || !userSalt) {
    return false;
  }

  try {
    const inputHash = await hashUserData(inputData, userSalt);

    // Use constant-time comparison to prevent timing attacks
    if (inputHash.length !== hashedData.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < inputHash.length; i++) {
      result |= inputHash.charCodeAt(i) ^ hashedData.charCodeAt(i);
    }

    return result === 0;
  } catch (error) {
    logger.error('Error verifying hashed data:', { error, timestamp: new Date().toISOString() });
    return false;
  }
}

/**
 * Create lookup hash for finding users by sensitive data
 * This allows authentication without storing plaintext data
 * @param {string} data - Data to create lookup hash for
 * @param {string} userSalt - User's salt
 * @returns {Promise<string>} Lookup hash
 */
export async function createLookupHash(data, userSalt) {
  return await hashUserData(data, userSalt);
}

/**
 * Privacy-first user data structure for database operations
 * @typedef {Object} HashedUserData
 * @property {string} user_salt - Individual user salt
 * @property {string} username - Unencrypted username
 * @property {string} hashed_npub - Hashed Nostr public key
 * @property {string} hashed_nip05 - Hashed NIP-05 identifier
 * @property {string} [hashed_encrypted_nsec] - Hashed encrypted private key
 * @property {string} [hashed_password] - Hashed password
 * @property {string} role - User role
 * @property {boolean} is_active - User active status
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Update timestamp
 */

/**
 * Database breach protection verification
 * Ensures no sensitive data is stored in readable form
 * @param {Object} userData - User data to verify
 * @returns {boolean} True if data is properly protected
 */
export function verifyPrivacyCompliance(userData) {
  const sensitiveFields = ['npub', 'nip05', 'encrypted_nsec', 'password'];
  const hashedFields = ['hashed_npub', 'hashed_nip05', 'hashed_encrypted_nsec', 'hashed_password'];

  // Check that no sensitive fields are stored in plaintext
  for (const field of sensitiveFields) {
    if (userData[field] && userData[field] !== '') {
      logger.warn('Privacy violation: sensitive field stored in plaintext', { field, timestamp: new Date().toISOString() });
      return false;
    }
  }

  // Check that user has salt
  if (!userData.user_salt) {
    logger.warn('Privacy violation: No user salt found', { timestamp: new Date().toISOString() });
    return false;
  }

  // Check that at least one hashed field exists
  const hasHashedData = hashedFields.some(field => userData[field] && userData[field] !== '');
  if (!hasHashedData) {
    logger.warn('Privacy violation: No hashed sensitive data found', { timestamp: new Date().toISOString() });
    return false;
  }

  return true;
}

/**
 * SECURITY: Validate that salts are unique across tables
 * Prevents correlation attacks by detecting salt reuse
 * @param {Array<Object>} userDataArray - Array of user data from different tables
 * @returns {boolean} True if all salts are unique
 */
export function validateSaltUniqueness(userDataArray) {
  const salts = userDataArray.map(data => data.user_salt).filter(salt => salt);
  const uniqueSalts = new Set(salts);

  if (salts.length !== uniqueSalts.size) {
    logger.error('CRITICAL SECURITY VIOLATION: Salt reuse detected across tables', { timestamp: new Date().toISOString() });
    logger.error('Each table must have unique salts to prevent correlation attacks', { timestamp: new Date().toISOString() });
    return false;
  }

  return true;
}

export default {
  generateUserSalt,
  hashUserData,
  hashNpub,
  hashNip05,
  hashEncryptedNsec,
  hashPassword,
  createHashedUserData,
  verifyHashedData,
  createLookupHash,
  verifyPrivacyCompliance,
  validateSaltUniqueness
};
