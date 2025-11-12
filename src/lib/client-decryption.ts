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

// Types for encrypted and decrypted user data
export interface EncryptedUserData {
  id: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_salt: string;

  // ENCRYPTED PROFILE COLUMNS: Displayable user data encrypted with Noble V2
  encrypted_username: string | null;
  encrypted_username_iv: string | null;
  encrypted_username_tag: string | null;

  encrypted_bio: string | null;
  encrypted_bio_iv: string | null;
  encrypted_bio_tag: string | null;

  encrypted_display_name: string | null;
  encrypted_display_name_iv: string | null;
  encrypted_display_name_tag: string | null;

  encrypted_picture: string | null;
  encrypted_picture_iv: string | null;
  encrypted_picture_tag: string | null;

  encrypted_nip05: string | null;
  encrypted_nip05_iv: string | null;
  encrypted_nip05_tag: string | null;

  encrypted_lightning_address: string | null;
  encrypted_lightning_address_iv: string | null;
  encrypted_lightning_address_tag: string | null;

  // Encrypted nsec (already properly encrypted with Noble V2)
  encrypted_nsec?: string;

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
 * Browser-compatible PBKDF2 key derivation using Web Crypto API
 * Matches the backend implementation for consistent encryption/decryption
 */
async function deriveKeyPBKDF2(
  userSalt: string,
  randomSaltB64: string
): Promise<CryptoKey> {
  try {
    // Decode the random salt from base64url
    const randomSalt = base64urlToBytes(randomSaltB64);

    // Import user salt as key material
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(userSalt),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    // Derive key using PBKDF2-SHA256 (100k iterations, 256-bit key)
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        // Use underlying ArrayBuffer to satisfy BufferSource typing in strict DOM libs
        salt: randomSalt.buffer as ArrayBuffer,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    return key;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`PBKDF2 key derivation failed: ${msg}`);
  }
}

/**
 * Base64url decode helper
 * Returns Uint8Array with strict ArrayBuffer (not SharedArrayBuffer)
 */
function base64urlToBytes(str: string): Uint8Array {
  try {
    // Add padding if needed
    const pad = str.length % 4;
    const normalized = (pad ? str + "=".repeat(4 - pad) : str)
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const binaryString = atob(normalized);
    // Create a new ArrayBuffer to ensure it's not a SharedArrayBuffer
    const buffer = new ArrayBuffer(binaryString.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Base64url decode failed: ${msg}`);
  }
}

/**
 * Decrypt a single encrypted field using Noble V2 AES-256-GCM
 *
 * IMPORTANT: This function performs actual decryption (reversible).
 * It requires all three components: cipher, iv, and tag (random salt).
 *
 * @param fieldName - Name of the field being decrypted (for logging)
 * @param cipher - Base64url encoded ciphertext
 * @param iv - Base64url encoded initialization vector
 * @param tag - Base64url encoded random salt (used for key derivation)
 * @param userSalt - User's unique salt for key derivation
 * @returns Decrypted plaintext string
 */
async function decryptField(
  fieldName: string,
  cipher: string | null,
  iv: string | null,
  tag: string | null,
  userSalt: string
): Promise<string> {
  // Return empty string for null/missing encrypted data
  if (!cipher || !iv || !tag) {
    console.log(`⚠️ Skipping decryption for ${fieldName} - no encrypted data`);
    return "";
  }

  try {
    // Derive key using PBKDF2
    const key = await deriveKeyPBKDF2(userSalt, tag);

    // Decode cipher and IV from base64url
    const cipherBytes = base64urlToBytes(cipher);
    const ivBytes = base64urlToBytes(iv);

    // Decrypt using AES-256-GCM
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes as BufferSource },
      key,
      cipherBytes as BufferSource
    );

    // Convert decrypted bytes to string
    const plaintext = new TextDecoder().decode(decrypted);
    console.log(`✅ Successfully decrypted ${fieldName}`);
    return plaintext;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Decryption failed for ${fieldName}: ${msg}`);
    throw new Error(`Failed to decrypt ${fieldName}: ${msg}`);
  }
}

/**
 * Main decryption function for user profile data
 *
 * Decrypts all encrypted profile fields using Noble V2 AES-256-GCM
 * No longer requires knownValues parameter - all data is encrypted and reversible
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
    // Decrypt all encrypted fields using Noble V2
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
        "username",
        encryptedData.encrypted_username,
        encryptedData.encrypted_username_iv,
        encryptedData.encrypted_username_tag,
        encryptedData.user_salt
      ),
      decryptField(
        "bio",
        encryptedData.encrypted_bio,
        encryptedData.encrypted_bio_iv,
        encryptedData.encrypted_bio_tag,
        encryptedData.user_salt
      ),
      decryptField(
        "display_name",
        encryptedData.encrypted_display_name,
        encryptedData.encrypted_display_name_iv,
        encryptedData.encrypted_display_name_tag,
        encryptedData.user_salt
      ),
      decryptField(
        "picture",
        encryptedData.encrypted_picture,
        encryptedData.encrypted_picture_iv,
        encryptedData.encrypted_picture_tag,
        encryptedData.user_salt
      ),
      decryptField(
        "nip05",
        encryptedData.encrypted_nip05,
        encryptedData.encrypted_nip05_iv,
        encryptedData.encrypted_nip05_tag,
        encryptedData.user_salt
      ),
      decryptField(
        "lightning_address",
        encryptedData.encrypted_lightning_address,
        encryptedData.encrypted_lightning_address_iv,
        encryptedData.encrypted_lightning_address_tag,
        encryptedData.user_salt
      ),
      // Note: npub and nip05 are hashed for authentication, not encrypted for display
      // For now, return empty strings (these are typically not displayed)
      Promise.resolve(""),
      // Use encrypted_nsec directly (already properly encrypted with Noble V2)
      Promise.resolve(encryptedData.encrypted_nsec || ""),
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
          "username",
          encryptedData.encrypted_username,
          encryptedData.encrypted_username_iv,
          encryptedData.encrypted_username_tag,
          encryptedData.user_salt
        );
        break;
      case "bio":
        result.bio = await decryptField(
          "bio",
          encryptedData.encrypted_bio,
          encryptedData.encrypted_bio_iv,
          encryptedData.encrypted_bio_tag,
          encryptedData.user_salt
        );
        break;
      case "display_name":
        result.display_name = await decryptField(
          "display_name",
          encryptedData.encrypted_display_name,
          encryptedData.encrypted_display_name_iv,
          encryptedData.encrypted_display_name_tag,
          encryptedData.user_salt
        );
        break;
      case "picture":
        result.picture = await decryptField(
          "picture",
          encryptedData.encrypted_picture,
          encryptedData.encrypted_picture_iv,
          encryptedData.encrypted_picture_tag,
          encryptedData.user_salt
        );
        break;
      case "nip05":
        result.nip05 = await decryptField(
          "nip05",
          encryptedData.encrypted_nip05,
          encryptedData.encrypted_nip05_iv,
          encryptedData.encrypted_nip05_tag,
          encryptedData.user_salt
        );
        break;
      case "lightning_address":
        result.lightning_address = await decryptField(
          "lightning_address",
          encryptedData.encrypted_lightning_address,
          encryptedData.encrypted_lightning_address_iv,
          encryptedData.encrypted_lightning_address_tag,
          encryptedData.user_salt
        );
        break;
      case "npub":
        // npub is hashed for authentication, not encrypted for display
        result.npub = "";
        break;
    }
  }

  return result;
}
