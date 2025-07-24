/**
 * Identity API endpoints
 * MASTER CONTEXT COMPLIANCE: Browser-only serverless architecture with privacy-first principles
 * Converted from TypeScript to JavaScript with comprehensive JSDoc
 */

import { nip19 } from "../../src/lib/nostr-browser.js";
import CitadelDatabase, { supabase } from "../supabase.js";

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
 * @typedef {Object} APIResponse
 * @template T
 * @property {boolean} success - Whether the operation was successful
 * @property {T} [data] - Response data if successful
 * @property {string} [error] - Error message if failed
 * @property {string} [message] - Additional message
 */

/**
 * @typedef {Object} RegistrationData
 * @property {string} username - Username for registration
 * @property {string} password - Password for registration
 * @property {string} [email] - Optional email
 * @property {string} [nip05] - Optional NIP-05 identifier
 */

/**
 * @typedef {Object} IdentityData
 * @property {string} id - Identity ID
 * @property {string} username - Username
 * @property {string} npub - Public key in npub format
 * @property {string} [nip05] - NIP-05 identifier
 * @property {string} created_at - Creation timestamp
 */

/**
 * Helper function to safely extract error message
 * @param {unknown} error - Error to extract message from
 * @returns {string} Error message
 */
function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unknown error occurred";
}

/**
 * Generate a privacy-preserving hash using Web Crypto API
 * @param {string} data - Data to hash
 * @param {string} [salt] - Optional salt
 * @returns {Promise<string>} Hashed data
 */
async function generatePrivacyHash(data, salt = '') {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const dataToHash = encoder.encode(data + salt);
    const hash = await crypto.subtle.digest('SHA-256', dataToHash);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Fallback for environments without Web Crypto API
    let hash = 0;
    const str = data + salt;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Identity API class for managing user identities
 * MASTER CONTEXT COMPLIANCE: Privacy-first architecture with encrypted data
 */
export class IdentityAPI {
  /**
   * POST /api/identity/register
   * Create a new Nostr identity with encrypted nsec backup
   * @param {RegistrationData} registrationData - Registration data
   * @returns {Promise<APIResponse<IdentityData>>} Registration result
   */
  static async registerNewAccount(registrationData) {
    try {
      const { username, password, email, nip05 } = registrationData;

      // Validate required fields
      if (!username || !password) {
        return {
          success: false,
          error: "Username and password are required"
        };
      }

      // Check if username already exists
      const { data: existingUser, error: checkError } = await supabase
        .from("user_identities")
        .select("username")
        .eq("username", username)
        .single();

      if (existingUser) {
        return {
          success: false,
          error: "Username already exists"
        };
      }

      // Generate Nostr keypair
      const privateKey = crypto.getRandomValues(new Uint8Array(32));
      const privateKeyHex = Array.from(privateKey).map(b => b.toString(16).padStart(2, '0')).join('');
      
      // For now, we'll use a simplified public key generation
      // In production, this should use proper secp256k1 key generation
      const publicKeyHash = await generatePrivacyHash(privateKeyHex);
      const npub = nip19.npubEncode(publicKeyHash);

      // Encrypt the private key with user password
      const encryptedNsec = await this.encryptPrivateKey(privateKeyHex, password);

      // Create hashed user ID for privacy
      const hashedUserId = await generatePrivacyHash(username + Date.now());

      // Store in database
      const { data: newIdentity, error: insertError } = await supabase
        .from("user_identities")
        .insert([{
          hashed_user_id: hashedUserId,
          username,
          npub,
          encrypted_nsec: encryptedNsec,
          nip05: nip05 || null,
          email: email || null,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (insertError) {
        console.error("Error creating identity:", insertError);
        return {
          success: false,
          error: "Failed to create identity"
        };
      }

      return {
        success: true,
        data: {
          id: newIdentity.hashed_user_id,
          username: newIdentity.username,
          npub: newIdentity.npub,
          nip05: newIdentity.nip05,
          created_at: newIdentity.created_at
        }
      };

    } catch (error) {
      console.error("Error in registerNewAccount:", error);
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * GET /api/identity/profile/:npub
   * Get user profile by npub
   * @param {string} npub - User's npub
   * @returns {Promise<APIResponse<IdentityData>>} Profile data
   */
  static async getUserProfile(npub) {
    try {
      if (!npub) {
        return {
          success: false,
          error: "npub is required"
        };
      }

      const { data: profile, error } = await supabase
        .from("user_identities")
        .select("username, npub, nip05, created_at")
        .eq("npub", npub)
        .single();

      if (error || !profile) {
        return {
          success: false,
          error: "Profile not found"
        };
      }

      return {
        success: true,
        data: {
          username: profile.username,
          npub: profile.npub,
          nip05: profile.nip05,
          created_at: profile.created_at
        }
      };

    } catch (error) {
      console.error("Error in getUserProfile:", error);
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * PUT /api/identity/profile
   * Update user profile
   * @param {string} npub - User's npub
   * @param {Object} updates - Profile updates
   * @returns {Promise<APIResponse<IdentityData>>} Update result
   */
  static async updateUserProfile(npub, updates) {
    try {
      if (!npub) {
        return {
          success: false,
          error: "npub is required"
        };
      }

      // Only allow certain fields to be updated
      const allowedFields = ['nip05', 'email'];
      const filteredUpdates = {};
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          filteredUpdates[key] = value;
        }
      }

      if (Object.keys(filteredUpdates).length === 0) {
        return {
          success: false,
          error: "No valid fields to update"
        };
      }

      const { data: updatedProfile, error } = await supabase
        .from("user_identities")
        .update(filteredUpdates)
        .eq("npub", npub)
        .select("username, npub, nip05, created_at")
        .single();

      if (error) {
        console.error("Error updating profile:", error);
        return {
          success: false,
          error: "Failed to update profile"
        };
      }

      return {
        success: true,
        data: updatedProfile
      };

    } catch (error) {
      console.error("Error in updateUserProfile:", error);
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * Encrypt private key with user password using Web Crypto API
   * @private
   * @param {string} privateKey - Private key to encrypt
   * @param {string} password - User password
   * @returns {Promise<string>} Encrypted private key
   */
  static async encryptPrivateKey(privateKey, password) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      );

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        encoder.encode(privateKey)
      );

      // Combine salt, iv, and encrypted data
      const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
      combined.set(salt);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encrypted), salt.length + iv.length);

      return btoa(String.fromCharCode(...combined));
    } else {
      // Fallback: simple base64 encoding (not secure, for development only)
      return btoa(privateKey + ':' + password);
    }
  }
}

// Export helper functions
export { getErrorMessage, generatePrivacyHash };
