/**
 * Password Recovery Key (PRK) System
 *
 * Enables password recovery using nsec or Keet seed without platform access.
 * The PRK is an encrypted copy of the password that can ONLY be decrypted
 * by someone with the nsec or Keet seed.
 *
 * Security Architecture:
 * - PRK from Nsec: AES-256-GCM(password, PBKDF2(nsecBytes, salt, 100k, SHA-256))
 * - PRK from Keet: AES-256-GCM(password, PBKDF2(seedBytes, salt, 100k, SHA-256))
 * - Platform has ZERO access to passwords (zero-knowledge)
 *
 * Keypear Forward Compatibility:
 * - All functions are exported for future KeypearAdapter integration
 * - Supports optional `source` parameter for recovery tracking
 *
 * @module password-recovery-key
 * @security CRITICAL - Handles password encryption/recovery
 */

import { randomBytes } from "@noble/ciphers/webcrypto";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { gcm } from "@noble/ciphers/aes";
import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { nip19 } from "nostr-tools";

/**
 * PRK encryption configuration (matches keet-seed-manager.ts)
 */
const PRK_CONFIG = {
  keyLength: 32, // 256-bit keys
  ivLength: 12, // 96-bit IV for GCM
  pbkdf2Iterations: 100000, // NIST recommended minimum
  saltLength: 32, // 256-bit salt
} as const;

/**
 * PRK encryption result
 */
export interface PRKEncryptionResult {
  encrypted: string; // Base64url-encoded encrypted password
  salt: string; // Base64url-encoded 32-byte salt
  iv: string; // Base64url-encoded 12-byte IV
}

/**
 * PRK creation result for both nsec and Keet paths
 */
export interface PRKCreationResult {
  nsecPRK?: PRKEncryptionResult;
  keetPRK?: PRKEncryptionResult;
  createdAt: string; // ISO timestamp
  version: number; // PRK schema version
}

/**
 * Recovery source for Keypear forward compatibility
 */
export type PRKRecoverySource = "local" | "keypear";

/**
 * Base64url encoding (URL-safe, no padding)
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Base64url decoding
 */
function base64UrlToBytes(str: string): Uint8Array {
  const pad = str.length % 4;
  const normalized = (pad ? str + "=".repeat(4 - pad) : str)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binary = atob(normalized);
  return new Uint8Array(binary.split("").map((c) => c.charCodeAt(0)));
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Decode nsec (bech32) to raw bytes
 */
function decodeNsecToBytes(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== "nsec") {
    throw new Error("Invalid nsec format");
  }
  return typeof decoded.data === "string"
    ? hexToBytes(decoded.data)
    : (decoded.data as Uint8Array);
}

/**
 * Create PRK from nsec
 * Encrypts password using key derived from nsec bytes
 *
 * @param password - User's password to encrypt
 * @param nsec - Nostr private key (bech32 nsec1... format)
 * @returns PRK encryption result
 * @exports For KeypearAdapter integration
 */
export async function createPRKFromNsec(
  password: string,
  nsec: string,
): Promise<PRKEncryptionResult> {
  try {
    // Decode nsec to raw bytes (32 bytes)
    const nsecBytes = decodeNsecToBytes(nsec);

    // Generate unique salt
    const salt = randomBytes(PRK_CONFIG.saltLength);

    // Derive key from nsec bytes using PBKDF2
    const key = pbkdf2(sha256, nsecBytes, salt, {
      c: PRK_CONFIG.pbkdf2Iterations,
      dkLen: PRK_CONFIG.keyLength,
    });

    // Generate random IV
    const iv = randomBytes(PRK_CONFIG.ivLength);

    // Encrypt password using AES-256-GCM
    const cipher = gcm(key, iv);
    const plaintext = new TextEncoder().encode(password);
    const ciphertext = cipher.encrypt(plaintext);

    // Secure cleanup
    nsecBytes.fill(0);
    key.fill(0);
    plaintext.fill(0);

    return {
      encrypted: bytesToBase64Url(ciphertext),
      salt: bytesToBase64Url(salt),
      iv: bytesToBase64Url(iv),
    };
  } catch (error) {
    throw new Error(
      `PRK creation from nsec failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Create PRK from Keet seed
 * Encrypts password using key derived from seed bytes
 *
 * @param password - User's password to encrypt
 * @param seedPhrase - 24-word BIP39 mnemonic
 * @returns PRK encryption result
 * @exports For KeypearAdapter integration
 */
export async function createPRKFromKeetSeed(
  password: string,
  seedPhrase: string,
): Promise<PRKEncryptionResult> {
  try {
    // Validate seed phrase
    if (!validateMnemonic(seedPhrase, wordlist)) {
      throw new Error("Invalid BIP39 seed phrase");
    }

    // Derive seed bytes from mnemonic (first 32 bytes)
    const fullSeed = mnemonicToSeedSync(seedPhrase);
    const seedBytes = fullSeed.slice(0, 32);

    // Generate unique salt
    const salt = randomBytes(PRK_CONFIG.saltLength);

    // Derive key from seed bytes using PBKDF2
    const key = pbkdf2(sha256, seedBytes, salt, {
      c: PRK_CONFIG.pbkdf2Iterations,
      dkLen: PRK_CONFIG.keyLength,
    });

    // Generate random IV
    const iv = randomBytes(PRK_CONFIG.ivLength);

    // Encrypt password using AES-256-GCM
    const cipher = gcm(key, iv);
    const plaintext = new TextEncoder().encode(password);
    const ciphertext = cipher.encrypt(plaintext);

    // Secure cleanup
    seedBytes.fill(0);
    fullSeed.fill(0);
    key.fill(0);
    plaintext.fill(0);

    return {
      encrypted: bytesToBase64Url(ciphertext),
      salt: bytesToBase64Url(salt),
      iv: bytesToBase64Url(iv),
    };
  } catch (error) {
    throw new Error(
      `PRK creation from Keet seed failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Recover password from nsec PRK
 *
 * @param prk - PRK encryption result (encrypted, salt, iv)
 * @param nsec - Nostr private key (bech32 nsec1... format)
 * @returns Recovered password
 * @exports For KeypearAdapter integration
 */
export async function recoverPasswordFromNsec(
  prk: PRKEncryptionResult,
  nsec: string,
): Promise<string> {
  try {
    // Decode nsec to raw bytes
    const nsecBytes = decodeNsecToBytes(nsec);

    // Decode PRK components
    const salt = base64UrlToBytes(prk.salt);
    const iv = base64UrlToBytes(prk.iv);
    const ciphertext = base64UrlToBytes(prk.encrypted);

    // Derive key from nsec bytes using PBKDF2
    const key = pbkdf2(sha256, nsecBytes, salt, {
      c: PRK_CONFIG.pbkdf2Iterations,
      dkLen: PRK_CONFIG.keyLength,
    });

    // Decrypt using AES-256-GCM
    const cipher = gcm(key, iv);
    const decrypted = cipher.decrypt(ciphertext);

    // Convert to string
    const password = new TextDecoder().decode(decrypted);

    // Secure cleanup
    nsecBytes.fill(0);
    key.fill(0);
    decrypted.fill(0);

    return password;
  } catch (error) {
    throw new Error(
      `Password recovery from nsec failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Recover password from Keet seed PRK
 *
 * @param prk - PRK encryption result (encrypted, salt, iv)
 * @param seedPhrase - 24-word BIP39 mnemonic
 * @returns Recovered password
 * @exports For KeypearAdapter integration
 */
export async function recoverPasswordFromKeetSeed(
  prk: PRKEncryptionResult,
  seedPhrase: string,
): Promise<string> {
  try {
    // Validate seed phrase
    if (!validateMnemonic(seedPhrase, wordlist)) {
      throw new Error("Invalid BIP39 seed phrase");
    }

    // Derive seed bytes from mnemonic (first 32 bytes)
    const fullSeed = mnemonicToSeedSync(seedPhrase);
    const seedBytes = fullSeed.slice(0, 32);

    // Decode PRK components
    const salt = base64UrlToBytes(prk.salt);
    const iv = base64UrlToBytes(prk.iv);
    const ciphertext = base64UrlToBytes(prk.encrypted);

    // Derive key from seed bytes using PBKDF2
    const key = pbkdf2(sha256, seedBytes, salt, {
      c: PRK_CONFIG.pbkdf2Iterations,
      dkLen: PRK_CONFIG.keyLength,
    });

    // Decrypt using AES-256-GCM
    const cipher = gcm(key, iv);
    const decrypted = cipher.decrypt(ciphertext);

    // Convert to string
    const password = new TextDecoder().decode(decrypted);

    // Secure cleanup
    seedBytes.fill(0);
    fullSeed.fill(0);
    key.fill(0);
    decrypted.fill(0);

    return password;
  } catch (error) {
    throw new Error(
      `Password recovery from Keet seed failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Create PRKs from both nsec and Keet seed (if available)
 * Main entry point for onboarding and password change flows
 *
 * @param password - User's password to encrypt
 * @param nsec - Optional nsec (bech32 format)
 * @param seedPhrase - Optional 24-word BIP39 mnemonic
 * @returns PRK creation result with both paths if available
 * @exports For KeypearAdapter integration
 */
export async function createPRKs(
  password: string,
  nsec?: string,
  seedPhrase?: string,
): Promise<PRKCreationResult> {
  const result: PRKCreationResult = {
    createdAt: new Date().toISOString(),
    version: 1,
  };

  // Create PRK from nsec if provided
  if (nsec) {
    result.nsecPRK = await createPRKFromNsec(password, nsec);
  }

  // Create PRK from Keet seed if provided
  if (seedPhrase) {
    result.keetPRK = await createPRKFromKeetSeed(password, seedPhrase);
  }

  if (!result.nsecPRK && !result.keetPRK) {
    throw new Error("At least one of nsec or seedPhrase must be provided");
  }

  return result;
}

/**
 * Verify PRK integrity by checking if recovery produces valid password
 * Used for testing and validation
 *
 * @param prk - PRK encryption result
 * @param secret - Either nsec or seedPhrase
 * @param secretType - Type of secret ('nsec' or 'keet')
 * @param expectedPassword - Expected password for verification
 * @returns true if recovered password matches expected
 */
export async function verifyPRK(
  prk: PRKEncryptionResult,
  secret: string,
  secretType: "nsec" | "keet",
  expectedPassword: string,
): Promise<boolean> {
  try {
    let recoveredPassword: string;

    if (secretType === "nsec") {
      recoveredPassword = await recoverPasswordFromNsec(prk, secret);
    } else {
      recoveredPassword = await recoverPasswordFromKeetSeed(prk, secret);
    }

    // Constant-time comparison
    if (recoveredPassword.length !== expectedPassword.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < recoveredPassword.length; i++) {
      result |=
        recoveredPassword.charCodeAt(i) ^ expectedPassword.charCodeAt(i);
    }

    return result === 0;
  } catch {
    return false;
  }
}

/**
 * Check if PRKs are available for a user
 * Used to determine recovery options
 *
 * @param prkNsec - PRK encrypted with nsec
 * @param prkKeet - PRK encrypted with Keet seed
 * @returns Object indicating which recovery paths are available
 */
export function getPRKAvailability(
  prkNsec?: PRKEncryptionResult | null,
  prkKeet?: PRKEncryptionResult | null,
): { nsecRecovery: boolean; keetRecovery: boolean } {
  return {
    nsecRecovery: Boolean(prkNsec?.encrypted && prkNsec?.salt && prkNsec?.iv),
    keetRecovery: Boolean(prkKeet?.encrypted && prkKeet?.salt && prkKeet?.iv),
  };
}

/**
 * PRK database fields for user_identities table
 * Used for consistent field mapping across API endpoints
 */
export interface PRKDatabaseFields {
  encrypted_prk_nsec: string | null;
  prk_salt_nsec: string | null;
  prk_iv_nsec: string | null;
  encrypted_prk_keet: string | null;
  prk_salt_keet: string | null;
  prk_iv_keet: string | null;
  prk_created_at: string | null;
  prk_updated_at: string | null;
  prk_version: number;
}

/**
 * Convert PRKCreationResult to database fields
 *
 * @param result - PRK creation result
 * @returns Database fields object for user_identities update
 */
export function prkResultToDatabaseFields(
  result: PRKCreationResult,
): PRKDatabaseFields {
  return {
    encrypted_prk_nsec: result.nsecPRK?.encrypted ?? null,
    prk_salt_nsec: result.nsecPRK?.salt ?? null,
    prk_iv_nsec: result.nsecPRK?.iv ?? null,
    encrypted_prk_keet: result.keetPRK?.encrypted ?? null,
    prk_salt_keet: result.keetPRK?.salt ?? null,
    prk_iv_keet: result.keetPRK?.iv ?? null,
    prk_created_at: result.createdAt,
    prk_updated_at: result.createdAt,
    prk_version: result.version,
  };
}

/**
 * Convert database fields to PRKEncryptionResult
 *
 * @param fields - Database fields from user_identities
 * @param type - 'nsec' or 'keet'
 * @returns PRKEncryptionResult or null if not available
 */
export function databaseFieldsToPRK(
  fields: Partial<PRKDatabaseFields>,
  type: "nsec" | "keet",
): PRKEncryptionResult | null {
  if (type === "nsec") {
    if (
      fields.encrypted_prk_nsec &&
      fields.prk_salt_nsec &&
      fields.prk_iv_nsec
    ) {
      return {
        encrypted: fields.encrypted_prk_nsec,
        salt: fields.prk_salt_nsec,
        iv: fields.prk_iv_nsec,
      };
    }
  } else {
    if (
      fields.encrypted_prk_keet &&
      fields.prk_salt_keet &&
      fields.prk_iv_keet
    ) {
      return {
        encrypted: fields.encrypted_prk_keet,
        salt: fields.prk_salt_keet,
        iv: fields.prk_iv_keet,
      };
    }
  }
  return null;
}
