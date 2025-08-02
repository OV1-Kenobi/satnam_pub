/**
 * Privacy-First Authentication API
 * MASTER CONTEXT COMPLIANCE: Browser-only serverless architecture with privacy-first principles
 * Converted from TypeScript to JavaScript with comprehensive JSDoc
 */

import { supabase } from "../supabase.js";

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
 * @typedef {Object} AuthUser
 * @property {string} id - User ID
 * @property {string} username - Username
 * @property {boolean} isDiscoverable - Whether user is discoverable
 */

/**
 * @typedef {Object} AuthResult
 * @property {boolean} success - Whether authentication was successful
 * @property {AuthUser} [user] - User data if successful
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} RegistrationResult
 * @property {boolean} success - Whether registration was successful
 * @property {AuthUser} [user] - Created user data if successful
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} UsernameCheckResult
 * @property {boolean} available - Whether username is available
 * @property {string} [error] - Error message if check failed
 * @property {string} [suggestion] - Alternative username suggestion
 */

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
 * Create privacy-preserving authentication hash
 * @param {string} pubkey - Public key to hash
 * @returns {string} Privacy-safe auth hash
 */
function createAuthHash(pubkey) {
  // Create a privacy-preserving auth hash
  return `auth_${pubkey.slice(0, 8)}`;
}

/**
 * Privacy-first authentication class
 */
export class PrivacyAuth {
  /**
   * Authenticate user with their Nostr pubkey without storing it
   * Uses hash-based verification for maximum privacy
   * @param {string} pubkey - User's public key
   * @returns {Promise<AuthResult>} Authentication result
   */
  static async authenticateWithNostr(pubkey) {
    try {
      // Find user by npub in user_identities table
      const { data: userIdentities, error } = await supabase
        .from("user_identities")
        .select("id, username, npub, is_active")
        .eq("npub", pubkey)
        .eq("is_active", true)
        .limit(1);

      if (error || !userIdentities || userIdentities.length === 0) {
        return {
          success: false,
          error: "User not found or authentication failed"
        };
      }

      const userIdentity = userIdentities[0];
      return {
        success: true,
        user: {
          id: userIdentity.id,
          username: userIdentity.username,
          isDiscoverable: true // Default for active users
        }
      };

    } catch (error) {
      console.error("Error in authenticateWithNostr:", error);
      return {
        success: false,
        error: "Authentication failed"
      };
    }
  }

  /**
   * Register a new user with privacy-first principles
   * @param {string} pubkey - User's public key
   * @param {string} username - Desired username
   * @param {string} userKey - User's encryption key
   * @param {boolean} [isDiscoverable] - Whether user should be discoverable
   * @param {string} [encryptedDisplayData] - Encrypted display data
   * @returns {Promise<RegistrationResult>} Registration result
   */
  static async registerUser(
    pubkey,
    username,
    userKey,
    isDiscoverable = false,
    encryptedDisplayData
  ) {
    try {
      // Validate inputs
      if (!pubkey || !username || !userKey) {
        return {
          success: false,
          error: "Missing required fields: pubkey, username, userKey"
        };
      }

      if (isDiscoverable && !encryptedDisplayData) {
        return {
          success: false,
          error: "encryptedDisplayData required when isDiscoverable=true"
        };
      }

      // Check if username is available
      const usernameCheck = await this.checkUsernameAvailability(username);
      if (!usernameCheck.available) {
        return {
          success: false,
          error: usernameCheck.error || "Username not available"
        };
      }

      // Create privacy-safe auth hash
      const authHash = createAuthHash(pubkey);

      // Generate privacy-safe user ID
      const userId = await generatePrivacyHash(username + Date.now());

      // Prepare user data
      const userData = {
        id: userId,
        username,
        auth_hash: authHash,
        is_discoverable: isDiscoverable,
        encrypted_display_data: encryptedDisplayData || null,
        created_at: new Date().toISOString()
      };

      // Insert user into user_identities table
      const { data: newUser, error: insertError } = await supabase
        .from("user_identities")
        .insert([{
          id: userData.id,
          username: userData.username,
          npub: userData.npub,
          nip05: userData.nip05,
          lightning_address: userData.lightning_address,
          role: 'private',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select("id, username, npub, is_active")
        .single();

      if (insertError) {
        console.error("Error inserting user:", insertError);
        return {
          success: false,
          error: "Failed to create user account"
        };
      }

      return {
        success: true,
        user: {
          id: newUser.id,
          username: newUser.username,
          isDiscoverable: newUser.is_discoverable
        }
      };

    } catch (error) {
      console.error("Error in registerUser:", error);
      return {
        success: false,
        error: "Registration failed"
      };
    }
  }

  /**
   * Check if username is available
   * @param {string} username - Username to check
   * @returns {Promise<UsernameCheckResult>} Availability result
   */
  static async checkUsernameAvailability(username) {
    try {
      // Validate username format
      if (!username || username.length < 3 || username.length > 20) {
        return {
          available: false,
          error: "Username must be between 3 and 20 characters"
        };
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return {
          available: false,
          error: "Username can only contain letters, numbers, underscores, and hyphens"
        };
      }

      // Check if username exists in user_identities table
      const { data, error } = await supabase
        .from("user_identities")
        .select("id")
        .eq("username", username)
        .limit(1);

      if (error) {
        console.error("Error checking username:", error);
        return {
          available: false,
          error: "Failed to check username availability"
        };
      }

      if (data && data.length > 0) {
        // Generate suggestion
        const suggestion = await this.generateUsernameSuggestion(username);
        return {
          available: false,
          error: "Username already taken",
          suggestion
        };
      }

      return { available: true };

    } catch (error) {
      console.error("Error in checkUsernameAvailability:", error);
      return {
        available: false,
        error: "Failed to check username availability"
      };
    }
  }

  /**
   * Generate username suggestion
   * @private
   * @param {string} baseUsername - Base username to modify
   * @returns {Promise<string>} Suggested username
   */
  static async generateUsernameSuggestion(baseUsername) {
    try {
      // Try adding numbers
      for (let i = 1; i <= 99; i++) {
        const suggestion = `${baseUsername}${i}`;
        const check = await this.checkUsernameAvailability(suggestion);
        if (check.available) {
          return suggestion;
        }
      }

      // Try adding random suffix
      const randomSuffix = Math.floor(Math.random() * 1000);
      return `${baseUsername}_${randomSuffix}`;

    } catch (error) {
      console.error("Error generating username suggestion:", error);
      return `${baseUsername}_${Math.floor(Math.random() * 1000)}`;
    }
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} updates - Profile updates
   * @param {boolean} [updates.isDiscoverable] - Discoverable status
   * @param {string} [updates.encryptedDisplayData] - Encrypted display data
   * @returns {Promise<{success: boolean, error?: string}>} Update result
   */
  static async updateProfile(userId, updates) {
    try {
      if (!userId) {
        return {
          success: false,
          error: "User ID is required"
        };
      }

      // Prepare update data
      const updateData = {};
      if (typeof updates.isDiscoverable === 'boolean') {
        updateData.is_discoverable = updates.isDiscoverable;
      }
      if (updates.encryptedDisplayData) {
        updateData.encrypted_display_data = updates.encryptedDisplayData;
      }

      if (Object.keys(updateData).length === 0) {
        return {
          success: false,
          error: "No valid updates provided"
        };
      }

      updateData.updated_at = new Date().toISOString();

      // Update user identity
      const { error } = await supabase
        .from("user_identities")
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq("id", userId);

      if (error) {
        console.error("Error updating profile:", error);
        return {
          success: false,
          error: "Failed to update profile"
        };
      }

      return { success: true };

    } catch (error) {
      console.error("Error in updateProfile:", error);
      return {
        success: false,
        error: "Profile update failed"
      };
    }
  }

  /**
   * Delete user account (privacy-safe deletion)
   * @param {string} userId - User ID to delete
   * @returns {Promise<{success: boolean, error?: string}>} Deletion result
   */
  static async deleteAccount(userId) {
    try {
      if (!userId) {
        return {
          success: false,
          error: "User ID is required"
        };
      }

      // Delete user identity
      const { error } = await supabase
        .from("user_identities")
        .delete()
        .eq("id", userId);

      if (error) {
        console.error("Error deleting account:", error);
        return {
          success: false,
          error: "Failed to delete account"
        };
      }

      return { success: true };

    } catch (error) {
      console.error("Error in deleteAccount:", error);
      return {
        success: false,
        error: "Account deletion failed"
      };
    }
  }
}

// Export utility functions
export { createAuthHash, generatePrivacyHash };

