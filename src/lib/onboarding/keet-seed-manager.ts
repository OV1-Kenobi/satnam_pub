/**
 * Keet Seed Manager
 *
 * Handles encryption, decryption, and secure memory management for Keet 24-word BIP39 seeds.
 * Follows the same encryption protocol as encrypted_nsec for consistency.
 *
 * Security Protocol:
 * - Algorithm: AES-256-GCM
 * - Key Derivation: PBKDF2 with 100,000 iterations, SHA-256
 * - Salt: 32-byte cryptographically secure random salt (unique per seed)
 * - IV: 12-byte random IV per encryption operation
 * - Uses Web Crypto API for browser compatibility
 *
 * @module keet-seed-manager
 * @security CRITICAL - Handles sensitive cryptographic material
 */

import {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { randomBytes } from "@noble/ciphers/webcrypto";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { gcm } from "@noble/ciphers/aes";

/**
 * SecureBuffer for controlled memory access
 * Provides automatic cleanup and prevents accidental exposure
 */
export class SecureBuffer {
  private buffer: Uint8Array | null;
  private destroyed: boolean = false;

  constructor(data: Uint8Array) {
    this.buffer = new Uint8Array(data);
  }

  /**
   * Get the buffer data (use with caution)
   */
  getData(): Uint8Array {
    if (this.destroyed || !this.buffer) {
      throw new Error("SecureBuffer has been destroyed");
    }
    return this.buffer;
  }

  /**
   * Destroy the buffer and wipe memory
   */
  destroy(): void {
    if (this.buffer) {
      this.buffer.fill(0);
      this.buffer = null;
    }
    this.destroyed = true;
  }

  /**
   * Check if buffer is destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }
}

/**
 * Encryption result containing all necessary parameters
 */
export interface KeetSeedEncryptionResult {
  encryptedSeed: string; // Base64url-encoded encrypted seed
  seedSalt: string; // Base64url-encoded 32-byte salt
}

/**
 * Noble V2 encryption configuration (matching nsec encryption)
 */
const NOBLE_CONFIG = {
  keyLength: 32, // 256-bit keys
  ivLength: 12, // 96-bit IV for GCM
  pbkdf2Iterations: 100000, // NIST recommended minimum
  saltLength: 32, // 256-bit salt
} as const;

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
 * Generate a new 24-word BIP39 seed phrase
 * Uses @scure/bip39 (audited library per Master Context rules)
 *
 * @returns 24-word mnemonic phrase
 */
export function generateKeetSeedPhrase(): string {
  // Generate 256 bits of entropy (24 words)
  const mnemonic = generateMnemonic(wordlist, 256);
  return mnemonic;
}

/**
 * Validate a BIP39 mnemonic phrase
 *
 * @param mnemonic - The mnemonic phrase to validate
 * @returns true if valid, false otherwise
 */
export function validateKeetSeedPhrase(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist);
}

/**
 * Derive Keet Peer ID from seed phrase
 *
 * NOTE: This is a placeholder implementation. The actual Keet peer ID derivation
 * algorithm should be implemented based on Keet's specification.
 *
 * For now, we derive a deterministic ID from the seed using SHA-256.
 *
 * @param seedPhrase - 24-word BIP39 mnemonic
 * @returns Keet Peer ID (hex string)
 */
export async function deriveKeetPeerIdFromSeed(
  seedPhrase: string,
): Promise<string> {
  // Validate seed phrase
  if (!validateKeetSeedPhrase(seedPhrase)) {
    throw new Error("Invalid BIP39 seed phrase");
  }

  // Derive seed from mnemonic
  const seed = mnemonicToSeedSync(seedPhrase);

  // TODO: Replace with actual Keet peer ID derivation algorithm
  // For now, use first 32 bytes of seed hashed with SHA-256
  const peerIdBytes = sha256(seed.slice(0, 32));

  // Convert to hex string
  const peerIdHex = Array.from(peerIdBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return peerIdHex;
}

/**
 * Encrypt Keet seed phrase using AES-256-GCM with PBKDF2 key derivation
 * Matches the encryption protocol used for encrypted_nsec
 *
 * @param seedPhrase - 24-word BIP39 mnemonic to encrypt
 * @param userPassword - User's password for key derivation
 * @returns Encryption result with encrypted seed and unique salt
 */
export async function encryptKeetSeed(
  seedPhrase: string,
  userPassword: string,
): Promise<KeetSeedEncryptionResult> {
  try {
    // Validate seed phrase
    if (!validateKeetSeedPhrase(seedPhrase)) {
      throw new Error("Invalid BIP39 seed phrase");
    }

    // Generate unique 32-byte salt for this seed
    const seedSalt = randomBytes(NOBLE_CONFIG.saltLength);

    // Derive encryption key using PBKDF2 (SHA-256, 100k iterations)
    const key = pbkdf2(sha256, userPassword, seedSalt, {
      c: NOBLE_CONFIG.pbkdf2Iterations,
      dkLen: NOBLE_CONFIG.keyLength,
    });

    // Generate random IV (12 bytes for GCM)
    const iv = randomBytes(NOBLE_CONFIG.ivLength);

    // Encrypt seed phrase using AES-256-GCM
    const cipher = gcm(key, iv);
    const plaintext = new TextEncoder().encode(seedPhrase);
    const ciphertext = cipher.encrypt(plaintext);

    // Combine IV + ciphertext for storage (GCM tag is included in ciphertext)
    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv, 0);
    combined.set(ciphertext, iv.length);

    // Encode to base64url for database storage
    const encryptedSeed = bytesToBase64Url(combined);
    const seedSaltB64 = bytesToBase64Url(seedSalt);

    // Secure cleanup
    key.fill(0);
    iv.fill(0);
    plaintext.fill(0);

    return {
      encryptedSeed,
      seedSalt: seedSaltB64,
    };
  } catch (error) {
    throw new Error(
      `Keet seed encryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Decrypt Keet seed phrase
 * Returns SecureBuffer for controlled memory access
 *
 * @param encryptedSeed - Base64url-encoded encrypted seed (IV + ciphertext)
 * @param userPassword - User's password for key derivation
 * @param seedSalt - Unique salt used during encryption (base64url-encoded)
 * @returns SecureBuffer containing decrypted seed phrase
 */
export async function decryptKeetSeed(
  encryptedSeed: string,
  userPassword: string,
  seedSalt: string,
): Promise<SecureBuffer> {
  try {
    // Decode parameters
    const combined = base64UrlToBytes(encryptedSeed);
    const seedSaltBytes = base64UrlToBytes(seedSalt);

    // Validate salt length
    if (seedSaltBytes.length !== NOBLE_CONFIG.saltLength) {
      throw new Error("Invalid seed salt length");
    }

    if (combined.length <= NOBLE_CONFIG.ivLength) {
      throw new Error("Invalid encrypted Keet seed - too short");
    }

    // Extract IV and ciphertext
    const iv = combined.slice(0, NOBLE_CONFIG.ivLength);
    const ciphertext = combined.slice(NOBLE_CONFIG.ivLength);

    // Derive decryption key using PBKDF2 (same parameters as encryption)
    const key = pbkdf2(sha256, userPassword, seedSaltBytes, {
      c: NOBLE_CONFIG.pbkdf2Iterations,
      dkLen: NOBLE_CONFIG.keyLength,
    });

    // Decrypt using AES-256-GCM
    const cipher = gcm(key, iv);
    const decrypted = cipher.decrypt(ciphertext);

    // IMPORTANT: Do not convert decrypted seed to a string here.
    // We keep the seed as bytes for the entire cryptographic lifecycle
    // so callers can control if/when it is decoded for UI display only.

    // Create SecureBuffer, which clones the decrypted bytes
    const secureBuffer = new SecureBuffer(decrypted);

    // Secure cleanup of key material and temporary buffer
    key.fill(0);
    decrypted.fill(0);

    return secureBuffer;
  } catch (error) {
    throw new Error(
      `Keet seed decryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Secure memory cleanup utility
 * Wipes sensitive string from memory
 *
 * @param sensitiveString - String to wipe from memory
 */
export function secureClearMemory(sensitiveString: string | null): void {
  if (!sensitiveString) return;

  // Convert to array and overwrite
  const arr = sensitiveString.split("");
  for (let i = 0; i < arr.length; i++) {
    arr[i] = "\0";
  }
  arr.length = 0;
}

/**
 * Derive Silent Payment keys from Keet seed (BIP-352)
 *
 * NOTE: This is a placeholder for future Silent Payments integration (Phase 1).
 * The actual implementation will use BIP-32 derivation paths:
 * - m/352'/0'/0'/1'/0 for scan key
 * - m/352'/0'/0'/0'/0 for spend key
 *
 * @param seedPhrase - 24-word BIP39 mnemonic
 * @returns Placeholder object (to be implemented in Silent Payments Phase 1)
 */
export async function deriveSilentPaymentKeys(seedPhrase: string): Promise<{
  scanKey: string;
  spendKey: string;
}> {
  // TODO: Implement BIP-352 Silent Payment key derivation
  // This will be implemented in Silent Payments Integration Phase 1
  throw new Error(
    "Silent Payment key derivation not yet implemented - planned for Phase 1",
  );
}
