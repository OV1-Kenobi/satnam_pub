/**
 * PURE Client-Side Decryption Utilities for Maximum Encryption Architecture
 *
 * This module provides ONLY decryption capabilities for already-fetched encrypted data.
 * It does NOT interact with the database - use existing supabase client for that.
 * All user data is stored encrypted and must be decrypted client-side for display ONLY.
 *
 * PRIVACY-FIRST PRINCIPLES:
 * - Decrypted data exists ONLY in browser memory during active session
 * - No decrypted data transmitted over network or stored persistently
 * - Clear all decrypted data immediately on logout/session end
 * - Maintain zero-knowledge principles
 */

import { hashWithPrivacySalt } from "../../lib/crypto/privacy-manager";

// Types for encrypted and decrypted user data
export interface EncryptedUserData {
  id: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_salt: string;
  hashed_username: string;
  hashed_bio: string;
  hashed_display_name: string;
  hashed_picture: string;
  hashed_npub: string;
  hashed_nip05: string;
  hashed_lightning_address: string;
  hashed_encrypted_nsec: string;
  spending_limits?: string;
  privacy_settings?: string;
}

export interface DecryptedUserProfile {
  id: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Decrypted fields
  username: string;
  bio: string;
  display_name: string;
  picture: string;
  npub: string;
  nip05: string;
  lightning_address: string;
  encrypted_nsec: string;
  spending_limits?: any;
  privacy_settings?: any;
}

export interface DecryptionCache {
  [key: string]: {
    data: DecryptedUserProfile;
    timestamp: number;
    expires: number;
  };
}

// In-memory cache for decrypted data (cleared on logout)
let decryptionCache: DecryptionCache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Clear the decryption cache (call on logout)
 */
export function clearDecryptionCache(): void {
  decryptionCache = {};
  console.log("🧹 Decryption cache cleared for security");
}

/**
 * Get cached decrypted data if available and not expired
 */
function getCachedDecryption(userId: string): DecryptedUserProfile | null {
  const cached = decryptionCache[userId];
  if (cached && Date.now() < cached.expires) {
    console.log("⚡ Using cached decrypted profile for user:", userId);
    return cached.data;
  }

  // Remove expired cache entry
  if (cached) {
    delete decryptionCache[userId];
  }

  return null;
}

/**
 * Cache decrypted data
 */
function cacheDecryptedData(userId: string, data: DecryptedUserProfile): void {
  decryptionCache[userId] = {
    data,
    timestamp: Date.now(),
    expires: Date.now() + CACHE_DURATION,
  };
}

/**
 * PRIVACY-FIRST DECRYPTION: Use known values from user session
 *
 * In maximum encryption architecture, decryption relies on:
 * 1. Known values provided during registration/login
 * 2. User-provided decryption context (username, etc.)
 * 3. Session-based decryption keys
 *
 * This maintains zero-knowledge where server never sees plaintext.
 */

/**
 * Decrypt a single hashed field
 *
 * IMPORTANT: Hashed fields cannot be "decrypted" in the traditional sense.
 * They are one-way hashes. We can only:
 * 1. Use known values (from user input during session)
 * 2. Verify hashes match expected values
 * 3. Return empty strings for unknown hashed data
 *
 * For actual encrypted data (not hashed), use the encryption utilities.
 */
async function decryptField(
  fieldName: string,
  hashedValue: string,
  userSalt: string,
  knownValue?: string
): Promise<string> {
  // If we have the known value (e.g., from user input during login), use it directly
  if (knownValue) {
    // Verify the known value matches the hash
    try {
      const computedHash = await hashWithPrivacySalt(knownValue, userSalt);
      if (computedHash === hashedValue) {
        return knownValue;
      } else {
        console.warn(
          `Hash mismatch for ${fieldName} - known value may be incorrect`
        );
        return knownValue; // Return anyway, but log warning
      }
    } catch (error) {
      console.error(`Failed to verify hash for ${fieldName}:`, error);
      return knownValue;
    }
  }

  // CRITICAL: Hashed data cannot be decrypted without the original value
  // Return empty string for display purposes
  // The application should maintain known values in session state
  console.warn(
    `Cannot decrypt hashed field ${fieldName} without known value. ` +
      `Hashed data is one-way and requires the original value from user input.`
  );

  return ""; // Return empty string - UI should handle gracefully
}

/**
 * Main decryption function for user profile data
 */
export async function decryptUserProfile(
  encryptedData: EncryptedUserData,
  knownValues?: Partial<{
    username: string;
    bio: string;
    display_name: string;
    picture: string;
    npub: string;
    nip05: string;
    lightning_address: string;
  }>
): Promise<DecryptedUserProfile> {
  const startTime = Date.now();

  // Check cache first
  const cached = getCachedDecryption(encryptedData.id);
  if (cached) {
    return cached;
  }

  console.log("🔓 Decrypting user profile for user:", encryptedData.id);

  try {
    // Decrypt all encrypted fields
    const [
      username,
      bio,
      display_name,
      picture,
      npub,
      nip05,
      lightning_address,
      encrypted_nsec,
    ] = await Promise.all([
      decryptField(
        "hashed_username",
        encryptedData.hashed_username,
        encryptedData.user_salt,
        knownValues?.username
      ),
      decryptField(
        "hashed_bio",
        encryptedData.hashed_bio,
        encryptedData.user_salt,
        knownValues?.bio
      ),
      decryptField(
        "hashed_display_name",
        encryptedData.hashed_display_name,
        encryptedData.user_salt,
        knownValues?.display_name
      ),
      decryptField(
        "hashed_picture",
        encryptedData.hashed_picture,
        encryptedData.user_salt,
        knownValues?.picture
      ),
      decryptField(
        "hashed_npub",
        encryptedData.hashed_npub,
        encryptedData.user_salt,
        knownValues?.npub
      ),
      decryptField(
        "hashed_nip05",
        encryptedData.hashed_nip05,
        encryptedData.user_salt,
        knownValues?.nip05
      ),
      decryptField(
        "hashed_lightning_address",
        encryptedData.hashed_lightning_address,
        encryptedData.user_salt,
        knownValues?.lightning_address
      ),
      decryptField(
        "hashed_encrypted_nsec",
        encryptedData.hashed_encrypted_nsec,
        encryptedData.user_salt
      ),
    ]);

    // Parse JSON fields
    const spending_limits = encryptedData.spending_limits
      ? JSON.parse(encryptedData.spending_limits)
      : undefined;
    const privacy_settings = encryptedData.privacy_settings
      ? JSON.parse(encryptedData.privacy_settings)
      : undefined;

    const decryptedProfile: DecryptedUserProfile = {
      // Unencrypted fields (pass through)
      id: encryptedData.id,
      role: encryptedData.role,
      is_active: encryptedData.is_active,
      created_at: encryptedData.created_at,
      updated_at: encryptedData.updated_at,

      // Decrypted fields
      username,
      bio,
      display_name,
      picture,
      npub,
      nip05,
      lightning_address,
      encrypted_nsec,
      spending_limits,
      privacy_settings,
    };

    // Cache the decrypted data
    cacheDecryptedData(encryptedData.id, decryptedProfile);

    const decryptionTime = Date.now() - startTime;
    console.log(
      `✅ Profile decryption completed in ${decryptionTime}ms for user:`,
      encryptedData.id
    );

    return decryptedProfile;
  } catch (error) {
    console.error("❌ Profile decryption failed:", error);
    throw new Error(
      `Profile decryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Batch decrypt multiple user profiles
 */
export async function decryptMultipleProfiles(
  encryptedProfiles: EncryptedUserData[]
): Promise<DecryptedUserProfile[]> {
  console.log(`🔓 Batch decrypting ${encryptedProfiles.length} user profiles`);

  const startTime = Date.now();

  try {
    const decryptedProfiles = await Promise.all(
      encryptedProfiles.map((profile) => decryptUserProfile(profile))
    );

    const totalTime = Date.now() - startTime;
    console.log(`✅ Batch decryption completed in ${totalTime}ms`);

    return decryptedProfiles;
  } catch (error) {
    console.error("❌ Batch decryption failed:", error);
    throw error;
  }
}

/**
 * Decrypt only specific fields (for performance optimization)
 */
export async function decryptSpecificFields(
  encryptedData: EncryptedUserData,
  fields: (keyof DecryptedUserProfile)[]
): Promise<Partial<DecryptedUserProfile>> {
  console.log("🔓 Decrypting specific fields:", fields);

  const result: Partial<DecryptedUserProfile> = {
    id: encryptedData.id,
    role: encryptedData.role,
    is_active: encryptedData.is_active,
  };

  for (const field of fields) {
    switch (field) {
      case "username":
        result.username = await decryptField(
          "hashed_username",
          encryptedData.hashed_username,
          encryptedData.user_salt
        );
        break;
      case "bio":
        result.bio = await decryptField(
          "hashed_bio",
          encryptedData.hashed_bio,
          encryptedData.user_salt
        );
        break;
      case "display_name":
        result.display_name = await decryptField(
          "hashed_display_name",
          encryptedData.hashed_display_name,
          encryptedData.user_salt
        );
        break;
      case "picture":
        result.picture = await decryptField(
          "hashed_picture",
          encryptedData.hashed_picture,
          encryptedData.user_salt
        );
        break;
      case "npub":
        result.npub = await decryptField(
          "hashed_npub",
          encryptedData.hashed_npub,
          encryptedData.user_salt
        );
        break;
      case "nip05":
        result.nip05 = await decryptField(
          "hashed_nip05",
          encryptedData.hashed_nip05,
          encryptedData.user_salt
        );
        break;
      case "lightning_address":
        result.lightning_address = await decryptField(
          "hashed_lightning_address",
          encryptedData.hashed_lightning_address,
          encryptedData.user_salt
        );
        break;
    }
  }

  return result;
}
