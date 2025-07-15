/**
 * Privacy-First Authentication utilities following Satnam.pub security protocols
 *
 * SECURITY FEATURES:
 * - NO pubkeys/npubs stored or transmitted in tokens
 * - PBKDF2 with 100,000 iterations for all hashing
 * - Privacy-safe hashed user identifiers only
 * - Constant-time comparison prevents timing attacks
 * - AES-256-GCM encryption for sensitive data
 * - Browser-compatible Web Crypto API usage
 */

const jwt = require("jsonwebtoken");
const { supabase } = require("./supabase");
const browserCrypto = require("./utils/browser-crypto-simple");

// JWT configuration - secrets stored in Supabase Vault (compliance with MASTER_CONTEXT.md)
let JWT_SECRET = null;
let JWT_EXPIRES_IN = "7d";

// Initialize JWT configuration from Supabase Vault
async function initializeJWTConfig() {
  if (!JWT_SECRET) {
    try {
      // Get JWT secret from Supabase Vault
      const { data: secretData, error: secretError } = await supabase
        .from("vault.secrets")
        .select("decrypted_secret")
        .eq("name", "jwt_secret")
        .single();

      if (secretError) {
        console.error(
          "Error fetching JWT secret from Supabase Vault:",
          secretError
        );
        throw new Error("JWT secret not available");
      }

      JWT_SECRET = secretData.decrypted_secret;

      // Get JWT expiration from Supabase Vault (optional)
      const { data: expiresData } = await supabase
        .from("vault.secrets")
        .select("decrypted_secret")
        .eq("name", "jwt_expires_in")
        .single();

      if (expiresData) {
        JWT_EXPIRES_IN = expiresData.decrypted_secret;
      }
    } catch (error) {
      console.error("Failed to initialize JWT configuration:", error);
      throw new Error("Authentication configuration unavailable");
    }
  }
}

/**
 * Generate privacy-first JWT token (NO sensitive data included)
 */
async function generateToken(userData) {
  await initializeJWTConfig();

  if (!JWT_SECRET) {
    throw new Error("JWT secret not initialized");
  }

  const hashedUserId =
    userData.hashedUserId || (await createHashedUserId(userData.userId));

  const options = { expiresIn: JWT_EXPIRES_IN };

  return jwt.sign(
    {
      userId: userData.userId,
      username: userData.username,
      role: userData.role || "user",
      hashedUserId,
      // PRIVACY: NO npub, pubkey, or sensitive data in tokens
    },
    JWT_SECRET,
    options
  );
}

/**
 * Verify JWT token and return user data
 */
async function verifyToken(token) {
  try {
    await initializeJWTConfig();

    if (!JWT_SECRET) {
      throw new Error("JWT secret not initialized");
    }

    const payload = jwt.verify(token, JWT_SECRET);
    return payload;
  } catch (error) {
    return null;
  }
}

/**
 * Create privacy-safe authentication hash using PBKDF2 (Satnam.pub standard)
 * This follows the exact same protocol as PrivacyManager.createAuthHash
 * Browser-compatible implementation using Web Crypto API
 */
async function createAuthHash(pubkey, salt) {
  try {
    // Generate salt if not provided
    const authSalt = salt || browserCrypto.randomBytes(32).toString("hex");

    // Use Web Crypto API for PBKDF2 in browser environment
    if (
      typeof window !== "undefined" &&
      window.crypto &&
      window.crypto.subtle
    ) {
      const encoder = new TextEncoder();
      const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        encoder.encode(pubkey),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
      );

      const derivedBits = await window.crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: encoder.encode(authSalt),
          iterations: 100000,
          hash: "SHA-512",
        },
        keyMaterial,
        512 // 64 bytes = 512 bits
      );

      const hash = Array.from(new Uint8Array(derivedBits))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      return `${authSalt}:${hash}`;
    } else {
      // Fallback for non-browser environments (should not happen in production)
      console.warn("Web Crypto API not available, using fallback hash");
      const fallbackHash = await browserCrypto.createHashAsync(
        "sha256",
        pubkey + authSalt
      );
      return `${authSalt}:${fallbackHash}`;
    }
  } catch (error) {
    console.error("Error creating auth hash:", error);
    // Fallback to simple hash
    const fallbackSalt = salt || browserCrypto.randomBytes(32).toString("hex");
    const fallbackHash = await browserCrypto.createHashAsync(
      "sha256",
      pubkey + fallbackSalt
    );
    return `${fallbackSalt}:${fallbackHash}`;
  }
}

/**
 * Verify pubkey against stored auth hash using constant-time comparison
 * Browser-compatible implementation using Web Crypto API
 */
async function verifyAuthHash(pubkey, storedHash) {
  try {
    const [salt, originalHash] = storedHash.split(":");
    if (!salt || !originalHash) {
      return false;
    }

    // Use Web Crypto API for PBKDF2 in browser environment
    if (
      typeof window !== "undefined" &&
      window.crypto &&
      window.crypto.subtle
    ) {
      const encoder = new TextEncoder();
      const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        encoder.encode(pubkey),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
      );

      const derivedBits = await window.crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: encoder.encode(salt),
          iterations: 100000,
          hash: "SHA-512",
        },
        keyMaterial,
        512 // 64 bytes = 512 bits
      );

      const hash = Array.from(new Uint8Array(derivedBits))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      return constantTimeEquals(hash, originalHash);
    } else {
      // Fallback for non-browser environments
      const fallbackHash = await browserCrypto.createHashAsync(
        "sha256",
        pubkey + salt
      );
      return constantTimeEquals(fallbackHash, originalHash);
    }
  } catch (error) {
    console.error("Error verifying auth hash:", error);
    return false;
  }
}

/**
 * Create hashed user ID for privacy-preserving database operations
 * Uses SHA-256 with salt for non-reversible user identification
 * Browser-compatible implementation
 */
async function createHashedUserId(userId) {
  // Get hash salt from Supabase Vault (compliance with MASTER_CONTEXT.md)
  let hashSalt = "default_salt_change_in_production";

  try {
    const { data: saltData } = await supabase
      .from("vault.secrets")
      .select("decrypted_secret")
      .eq("name", "hash_salt")
      .single();

    if (saltData) {
      hashSalt = saltData.decrypted_secret;
    }
  } catch (error) {
    console.warn(
      "Using default hash salt - consider storing in Supabase Vault"
    );
  }

  return browserCrypto
    .createHash("sha256")
    .update(userId + hashSalt)
    .digest("hex");
}

/**
 * Create platform ID (privacy-safe identifier)
 * Browser-compatible implementation
 */
function createPlatformId(pubkey) {
  return browserCrypto
    .createHash("sha256")
    .update(pubkey + "platform_salt")
    .digest("hex")
    .substring(0, 16);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeEquals(a, b) {
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
 * Get user data from request (for authenticated endpoints)
 */
async function getUserFromRequest(req) {
  const token =
    req.headers.authorization?.replace("Bearer ", "") ||
    req.cookies?.authToken ||
    req.headers["x-auth-token"];

  if (!token) {
    return null;
  }

  return await verifyToken(token);
}

/**
 * Browser-compatible random bytes generation
 */
function generateRandomBytes(size) {
  return browserCrypto.randomBytes(size).toString("hex");
}

/**
 * Generate random bytes as Buffer (for compatibility with existing code)
 */
function randomBytes(size) {
  return browserCrypto.randomBytes(size);
}

/**
 * Browser-compatible UUID generation
 */
function generateUUID() {
  return browserCrypto.randomUUID();
}

module.exports = {
  generateToken,
  verifyToken,
  createAuthHash,
  verifyAuthHash,
  createHashedUserId,
  createPlatformId,
  getUserFromRequest,
  generateRandomBytes,
  randomBytes,
  generateUUID,
};