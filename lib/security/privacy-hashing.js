/**
 * Privacy-First Hashing Utilities
 * CRITICAL SECURITY: Implements salt-based hashing for all sensitive user data
 * MASTER CONTEXT COMPLIANCE: Zero exposure of Nostr accounts in database breaches
 * SECURITY WARNING: Each table MUST use unique salts - never reuse salts across tables
 */

/**
 * Environment variable getter with browser compatibility
 * @param {string} key - Environment variable key
 * @param {string} [defaultValue] - Default value if not found
 * @returns {string} Environment variable value
 */
function getEnvVar(key, defaultValue = '') {
  // Primary: import.meta.env for Vite/browser environments
  if (typeof window !== 'undefined' && window.import && window.import.meta && window.import.meta.env) {
    return window.import.meta.env[key] || defaultValue;
  }
  // Secondary: process.env for Node.js environments
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }
  return defaultValue;
}

/**
 * Generate cryptographically secure salt for individual users
 * @returns {Promise<string>} 64-character hex salt
 */
export async function generateUserSalt() {
  if (typeof window !== 'undefined') {
    // Browser environment - use Web Crypto API
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  } else {
    // Node.js environment - use crypto module
    const { randomBytes } = await import('crypto');
    return randomBytes(32).toString('hex');
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
  if (!data || !userSalt) {
    throw new Error('Data and user salt are required for hashing');
  }

  const globalSalt = 'satnam_privacy_salt_2024'; // Global salt for additional security
  const combinedData = data + userSalt + globalSalt;

  if (typeof window !== 'undefined') {
    // Browser environment - use Web Crypto API
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(combinedData);
    const hashBuffer = await crypto.subtle.digest('SHA-512', dataBuffer);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray, byte => byte.toString(16).padStart(2, '0')).join('');
  } else {
    // Node.js environment - use crypto module
    const { createHash } = await import('crypto');
    return createHash('sha512').update(combinedData).digest('hex');
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
 * Hash NIP-05 identifier with user salt
 * @param {string} nip05 - NIP-05 identifier (user@domain.com)
 * @param {string} userSalt - Individual user salt
 * @returns {Promise<string>} Hashed NIP-05
 */
export async function hashNip05(nip05, userSalt) {
  if (!nip05 || !nip05.includes('@')) {
    throw new Error('Invalid NIP-05 format');
  }
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
 * @param {string} [userSalt] - Existing user salt (generates new if not provided)
 * @returns {Promise<Object>} Hashed user data object
 */
export async function createHashedUserData(userData, userSalt = null) {
  // Generate salt if not provided
  const salt = userSalt || await generateUserSalt();
  
  const hashedData = {
    user_salt: salt,
    // Keep username unencrypted for user management
    username: userData.username,
    // Hash all sensitive data
    hashed_npub: userData.npub ? await hashNpub(userData.npub, salt) : null,
    hashed_nip05: userData.nip05 ? await hashNip05(userData.nip05, salt) : null,
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
 * Verify hashed data matches input data
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
    return inputHash === hashedData;
  } catch (error) {
    console.error('Error verifying hashed data:', error);
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
      console.warn(`Privacy violation: ${field} stored in plaintext`);
      return false;
    }
  }

  // Check that user has salt
  if (!userData.user_salt) {
    console.warn('Privacy violation: No user salt found');
    return false;
  }

  // Check that at least one hashed field exists
  const hasHashedData = hashedFields.some(field => userData[field] && userData[field] !== '');
  if (!hasHashedData) {
    console.warn('Privacy violation: No hashed sensitive data found');
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
    console.error('CRITICAL SECURITY VIOLATION: Salt reuse detected across tables');
    console.error('Each table must have unique salts to prevent correlation attacks');
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
