/**
 * Password Change API - NIP-05/Password users
 * POST /api/auth/change-password
 *
 * - Verifies current password (PBKDF2/SHA-512, 100k)
 * - Rotates password_salt (24 bytes, base64) and updates password_hash (hex)
 * - Re-encrypts encrypted_nsec and encrypted_keet_seed with new password
 * - Regenerates Password Recovery Keys (PRKs) for nsec and Keet seed
 * - Returns session + user payload similar to /api/auth/signin
 *
 * SECURITY: Zero-knowledge re-encryption workflow
 * - Decrypts secrets with old password
 * - Re-encrypts with new password
 * - Regenerates PRKs (encrypted password copies for recovery)
 * - Atomic database update (all or nothing)
 * - Immediate memory cleanup
 */

import * as crypto from "node:crypto";
import { generateDUIDFromNIP05 } from "../../lib/security/duid-generator.js";
import { SecureSessionManager } from "../../netlify/functions/security/session-manager.js";
import { supabase } from "../../netlify/functions/supabase.js";
import { allowRequest } from "../../netlify/functions/utils/rate-limiter.js";

/**
 * Decrypt nsec using Web Crypto API (matches frontend encryption)
 * Format: salt:iv:ciphertext (all hex)
 * Returns Buffer instead of string for secure memory clearing
 */
async function decryptNsec(encryptedNsec, password) {
  const parts = encryptedNsec.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted nsec format");
  }

  const [saltHex, ivHex, ciphertextHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  // Derive key using PBKDF2 (same as frontend)
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");

  // Decrypt using AES-256-GCM
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);

  // Extract auth tag (last 16 bytes of ciphertext)
  const authTag = ciphertext.slice(-16);
  const encryptedData = ciphertext.slice(0, -16);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted; // Returns Buffer (hex nsec as UTF-8 bytes)
}

/**
 * Encrypt nsec using Web Crypto API (matches frontend encryption)
 * Returns format: salt:iv:ciphertext (all hex)
 */
async function encryptNsec(nsecHex, password) {
  // Generate random salt and IV
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);

  // Derive key using PBKDF2
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");

  // Encrypt using AES-256-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(nsecHex, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Combine encrypted data and auth tag
  const combined = Buffer.concat([encrypted, authTag]);

  // Return as salt:iv:ciphertext (all hex)
  return `${salt.toString("hex")}:${iv.toString("hex")}:${combined.toString("hex")}`;
}

/**
 * Decrypt Keet seed using Noble ciphers (matches frontend encryption)
 * Format: base64url(iv + ciphertext), separate base64url salt
 * Returns Buffer instead of string for secure memory clearing
 */
async function decryptKeetSeed(encryptedSeed, password, seedSalt) {
  // Decode from base64url
  const combined = Buffer.from(
    encryptedSeed.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );
  const saltBytes = Buffer.from(
    seedSalt.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );

  // Extract IV (first 12 bytes) and ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  // Derive key using PBKDF2
  const key = crypto.pbkdf2Sync(password, saltBytes, 100000, 32, "sha256");

  // Decrypt using AES-256-GCM
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);

  // Extract auth tag (last 16 bytes)
  const authTag = ciphertext.slice(-16);
  const encryptedData = ciphertext.slice(0, -16);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted; // Returns Buffer (seed phrase as UTF-8 bytes)
}

/**
 * Encrypt Keet seed using Noble ciphers (matches frontend encryption)
 * Returns: { encryptedSeed: base64url, seedSalt: base64url }
 */
async function encryptKeetSeed(seedPhrase, password) {
  // Generate random salt and IV
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  // Derive key using PBKDF2
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");

  // Encrypt using AES-256-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(seedPhrase, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Combine IV + encrypted data + auth tag
  const combined = Buffer.concat([iv, encrypted, authTag]);

  // Return as base64url
  const encryptedSeed = combined
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  const seedSalt = salt
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return { encryptedSeed, seedSalt };
}

// ============================================================================
// Password Recovery Key (PRK) Functions
// ============================================================================

/**
 * Convert base64url to Buffer
 */
function base64urlToBuffer(str) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Convert Buffer to base64url
 */
function bufferToBase64url(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Create PRK from nsec (bech32 format)
 * Encrypts password using key derived from nsec bytes
 */
async function createPRKFromNsec(password, nsec) {
  // Decode nsec from bech32 to get raw bytes
  const decoded = decodeNsecToBytes(nsec);

  // Generate random salt and IV
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  // Derive key from nsec bytes using PBKDF2
  const key = crypto.pbkdf2Sync(decoded, salt, 100000, 32, "sha256");

  // Encrypt password using AES-256-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(password, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([encrypted, authTag]);

  return {
    encrypted: bufferToBase64url(combined),
    salt: bufferToBase64url(salt),
    iv: bufferToBase64url(iv),
  };
}

/**
 * Create PRK from Keet seed phrase
 * Encrypts password using key derived from seed bytes
 */
async function createPRKFromKeetSeed(password, seedPhrase) {
  // Convert mnemonic to seed bytes (first 32 bytes)
  const seedBytes = mnemonicToSeedBytes(seedPhrase);

  // Generate random salt and IV
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  // Derive key from seed bytes using PBKDF2
  const key = crypto.pbkdf2Sync(seedBytes, salt, 100000, 32, "sha256");

  // Encrypt password using AES-256-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(password, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([encrypted, authTag]);

  return {
    encrypted: bufferToBase64url(combined),
    salt: bufferToBase64url(salt),
    iv: bufferToBase64url(iv),
  };
}

/**
 * Decode nsec (bech32) to raw bytes
 * Simple implementation for Node.js
 */
function decodeNsecToBytes(nsec) {
  // nsec is bech32 encoded, we need to decode it
  // Format: nsec1<data>
  if (!nsec.startsWith("nsec1")) {
    throw new Error("Invalid nsec format");
  }

  // Use nostr-tools for proper bech32 decoding
  const { nip19 } = require("nostr-tools");
  const decoded = /** @type {any} */ (nip19.decode(nsec));
  if (decoded.type !== "nsec") {
    throw new Error("Invalid nsec type");
  }
  // Handle both Uint8Array and string (hex) formats
  const data = /** @type {Uint8Array | string} */ (decoded.data);
  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  } else if (typeof data === "string") {
    return Buffer.from(data, "hex");
  }
  throw new Error("Invalid decoded nsec data format");
}

/**
 * Convert hex private key to bech32 nsec format
 * Needed because decryptNsec returns hex, but PRK creation needs bech32
 */
function hexToNsec(hexPrivateKey) {
  const { nip19 } = require("nostr-tools");
  const bytes = Buffer.from(hexPrivateKey, "hex");
  return nip19.nsecEncode(bytes);
}

/**
 * Convert mnemonic to seed bytes (first 32 bytes)
 */
function mnemonicToSeedBytes(mnemonic) {
  // Use @scure/bip39 library for proper seed derivation
  const { mnemonicToSeedSync } = require("@scure/bip39");
  const seedBuffer = mnemonicToSeedSync(mnemonic);
  return seedBuffer.slice(0, 32);
}

export default async function handler(event, context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: "Method not allowed" }),
    };
  }

  // Basic rate limiting per IP
  const ip =
    event.headers["x-forwarded-for"] ||
    event.headers["x-real-ip"] ||
    event.headers["client-ip"] ||
    "unknown";
  if (!allowRequest(String(ip), 5, 60_000)) {
    return {
      statusCode: 429,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Too many requests. Please wait and try again.",
      }),
    };
  }

  // Parse body
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: "Invalid JSON" }),
    };
  }

  const nip05 = (body?.nip05 || "").trim().toLowerCase();
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");

  if (!nip05 || !currentPassword || !newPassword) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Missing required fields",
      }),
    };
  }
  if (!/^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/.test(nip05)) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: "Invalid NIP-05 format" }),
    };
  }
  if (newPassword.length < 8) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "New password must be at least 8 characters",
      }),
    };
  }

  try {
    // Locate user by DUID
    const duid = await generateDUIDFromNIP05(nip05);
    const { data: users, error: selErr } = await supabase
      .from("user_identities")
      .select("*")
      .eq("id", duid)
      .eq("is_active", true)
      .limit(1);

    if (selErr || !users || users.length === 0) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "Invalid credentials" }),
      };
    }

    const user = users[0];

    // Verify current password using same parameters as signin
    const verifyBuf = crypto.pbkdf2Sync(
      currentPassword,
      user.password_salt,
      100000,
      64,
      "sha512",
    );
    const verifyHex = verifyBuf.toString("hex");
    const verifyB64 = verifyBuf.toString("base64");

    // Use timing-safe comparison to prevent timing attacks
    const storedHashBuf = Buffer.from(user.password_hash, "utf8");
    const verifyHexBuf = Buffer.from(verifyHex, "utf8");
    const verifyB64Buf = Buffer.from(verifyB64, "utf8");

    // Pad buffers to same length for timing-safe comparison
    const maxLen = Math.max(
      storedHashBuf.length,
      verifyHexBuf.length,
      verifyB64Buf.length,
    );
    const padBuffer = (buf) => {
      if (buf.length === maxLen) return buf;
      const padded = Buffer.alloc(maxLen);
      buf.copy(padded);
      return padded;
    };

    const paddedStored = padBuffer(storedHashBuf);
    const hexMatch = crypto.timingSafeEqual(
      paddedStored,
      padBuffer(verifyHexBuf),
    );
    const b64Match = crypto.timingSafeEqual(
      paddedStored,
      padBuffer(verifyB64Buf),
    );

    if (!hexMatch && !b64Match) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Current password is incorrect",
        }),
      };
    }

    // Rotate salt and compute new hash
    const newSalt = crypto.randomBytes(24).toString("base64");
    const newHashHex = crypto
      .pbkdf2Sync(newPassword, newSalt, 100000, 64, "sha512")
      .toString("hex");

    // Re-encrypt secrets with new password (zero-knowledge workflow)
    let newEncryptedNsec = user.encrypted_nsec;
    let newEncryptedKeetSeed = user.encrypted_keet_seed;
    let newKeetSeedSalt = user.keet_seed_salt;

    // Store decrypted secrets temporarily for PRK regeneration
    // Use Buffers for secrets that need to be cleared from memory
    let decryptedNsecBuffer = null;
    let decryptedKeetSeedBuffer = null;

    try {
      // Re-encrypt nsec if it exists
      if (user.encrypted_nsec) {
        decryptedNsecBuffer = await decryptNsec(
          user.encrypted_nsec,
          currentPassword,
        );
        newEncryptedNsec = await encryptNsec(
          decryptedNsecBuffer.toString("utf8"),
          newPassword,
        );
      }

      // Re-encrypt Keet seed if it exists
      if (user.encrypted_keet_seed && user.keet_seed_salt) {
        decryptedKeetSeedBuffer = await decryptKeetSeed(
          user.encrypted_keet_seed,
          currentPassword,
          user.keet_seed_salt,
        );
        const keetResult = await encryptKeetSeed(
          decryptedKeetSeedBuffer.toString("utf8"),
          newPassword,
        );
        newEncryptedKeetSeed = keetResult.encryptedSeed;
        newKeetSeedSalt = keetResult.seedSalt;
      }
    } catch (reencryptErr) {
      console.error("Re-encryption error:", reencryptErr);
      // Clear any decrypted secrets from memory (Buffers can be zeroed)
      if (decryptedNsecBuffer) {
        decryptedNsecBuffer.fill(0);
      }
      if (decryptedKeetSeedBuffer) {
        decryptedKeetSeedBuffer.fill(0);
      }
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error:
            "Failed to re-encrypt secrets. Please verify your current password is correct.",
        }),
      };
    }

    // Regenerate Password Recovery Keys (PRKs) with new password
    let newPRKNsec = null;
    let newPRKKeet = null;
    let prkRegenerationFailed = false;

    try {
      // Regenerate nsec PRK if nsec exists
      if (decryptedNsecBuffer) {
        const nsecBech32 = hexToNsec(decryptedNsecBuffer.toString("utf8"));
        newPRKNsec = await createPRKFromNsec(newPassword, nsecBech32);
      }

      // Regenerate Keet PRK if Keet seed exists
      if (decryptedKeetSeedBuffer) {
        newPRKKeet = await createPRKFromKeetSeed(
          newPassword,
          decryptedKeetSeedBuffer.toString("utf8"),
        );
      }
    } catch (prkErr) {
      console.error("PRK regeneration error:", prkErr);
      prkRegenerationFailed = true;

      // CRITICAL: PRK regeneration failure leaves system in inconsistent state
      // Old PRKs are encrypted with old password, new password is different
      // This makes recovery keys unusable without user notification

      // Clear decrypted secrets from memory before returning error
      if (decryptedNsecBuffer) {
        decryptedNsecBuffer.fill(0);
      }
      if (decryptedKeetSeedBuffer) {
        decryptedKeetSeedBuffer.fill(0);
      }

      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error:
            "Failed to regenerate recovery keys. Password change aborted to prevent inconsistent state.",
          details: "Please try again or contact support if the issue persists.",
        }),
      };
    }

    // Clear decrypted secrets from memory (Buffers can be zeroed)
    if (decryptedNsecBuffer) {
      decryptedNsecBuffer.fill(0);
    }
    if (decryptedKeetSeedBuffer) {
      decryptedKeetSeedBuffer.fill(0);
    }

    // Atomic database update (all fields together)
    const updateData = {
      password_hash: newHashHex,
      password_salt: newSalt,
      password_updated_at: new Date().toISOString(),
    };

    // Only update encrypted fields if they were re-encrypted
    if (newEncryptedNsec !== user.encrypted_nsec) {
      updateData.encrypted_nsec = newEncryptedNsec;
    }
    if (newEncryptedKeetSeed !== user.encrypted_keet_seed) {
      updateData.encrypted_keet_seed = newEncryptedKeetSeed;
      updateData.keet_seed_salt = newKeetSeedSalt;
    }

    // Add PRK fields if regenerated
    if (newPRKNsec) {
      updateData.encrypted_prk_nsec = newPRKNsec.encrypted;
      updateData.prk_salt_nsec = newPRKNsec.salt;
      updateData.prk_iv_nsec = newPRKNsec.iv;
      updateData.prk_updated_at = new Date().toISOString();
    }
    if (newPRKKeet) {
      updateData.encrypted_prk_keet = newPRKKeet.encrypted;
      updateData.prk_salt_keet = newPRKKeet.salt;
      updateData.prk_iv_keet = newPRKKeet.iv;
      updateData.prk_updated_at = new Date().toISOString();
    }

    const { error: updErr } = await supabase
      .from("user_identities")
      .update(updateData)
      .eq("id", duid)
      .eq("is_active", true);

    if (updErr) {
      console.error("Password update error:", updErr);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Failed to update password",
        }),
      };
    }

    // Auto sign-in: create session like /api/auth/signin
    const userData = {
      npub: user.npub || "",
      // Use DUID (user.id) for backend session semantics
      userDuid: user.id,
      nip05,
      federationRole: user.role || "private",
      authMethod: /** @type {"nip05-password"} */ ("nip05-password"),
      isWhitelisted: true,
      votingPower: user.voting_power || 0,
      guardianApproved: false,
      stewardApproved: false,
      sessionToken: "",
    };

    const sessionToken = await SecureSessionManager.createSession(
      corsHeaders,
      userData,
    );
    if (!sessionToken || typeof sessionToken !== "string") {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Failed to create session",
        }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          user: {
            id: user.id,
            nip05,
            role: user.role || "private",
            is_active: true,
            user_salt: user.user_salt || null,
            encrypted_nsec: user.encrypted_nsec || null,
            encrypted_nsec_iv: user.encrypted_nsec_iv || null,
          },
          authenticated: true,
          sessionToken,
        },
      }),
    };
  } catch (error) {
    console.error("Change-password error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: "Password change failed" }),
    };
  }
}
