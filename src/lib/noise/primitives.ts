/**
 * Noise Protocol Cryptographic Primitives
 *
 * Phase 0 Foundation: Low-level cryptographic operations for Noise Protocol.
 * Uses @noble/curves for X25519 and @noble/ciphers for ChaCha20-Poly1305.
 *
 * Security: All operations use audited libraries from the @noble ecosystem.
 * No custom cryptography is implemented.
 *
 * @module src/lib/noise/primitives
 */

import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { chacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "@noble/ciphers/webcrypto";
import type { NoiseKeyPair, NoiseCipherState } from "./types";
import { NoiseProtocolError } from "./types";

// =============================================================================
// Constants
// =============================================================================

/** ChaCha20-Poly1305 nonce size in bytes */
const NONCE_SIZE = 12;

/** ChaCha20-Poly1305 key size in bytes */
const KEY_SIZE = 32;

/** X25519 private key size in bytes */
const X25519_PRIVATE_KEY_SIZE = 32;

/** HKDF info string prefix for Noise protocol */
const HKDF_INFO_PREFIX = "satnam-noise-v1";

// =============================================================================
// Key Generation
// =============================================================================

/**
 * Generate a new X25519 key pair for Noise protocol ECDH.
 *
 * @returns Promise resolving to a new key pair
 * @throws NoiseProtocolError if key generation fails
 */
export async function generateX25519KeyPair(): Promise<NoiseKeyPair> {
  try {
    // Generate 32 bytes of cryptographically secure random data
    const privateKey = randomBytes(X25519_PRIVATE_KEY_SIZE);

    // Derive public key from private key using X25519
    const publicKey = x25519.getPublicKey(privateKey);

    return {
      publicKey: new Uint8Array(publicKey),
      privateKey: new Uint8Array(privateKey),
    };
  } catch (error) {
    throw new NoiseProtocolError(
      "Failed to generate X25519 key pair",
      "KEY_GENERATION_FAILED",
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Generate a random 32-byte key for symmetric encryption.
 *
 * @returns Random 32-byte key
 */
export function generateSymmetricKey(): Uint8Array {
  return randomBytes(KEY_SIZE);
}

// =============================================================================
// Key Exchange (ECDH)
// =============================================================================

/**
 * Perform X25519 ECDH to compute a shared secret.
 *
 * @param localPrivateKey - Local private key (32 bytes)
 * @param remotePublicKey - Remote public key (32 bytes)
 * @returns 32-byte shared secret
 * @throws NoiseProtocolError if ECDH fails
 */
export function x25519ECDH(
  localPrivateKey: Uint8Array,
  remotePublicKey: Uint8Array
): Uint8Array {
  try {
    const sharedSecret = x25519.getSharedSecret(
      localPrivateKey,
      remotePublicKey
    );
    return new Uint8Array(sharedSecret);
  } catch (error) {
    throw new NoiseProtocolError(
      "X25519 ECDH failed",
      "ECDH_FAILED",
      error instanceof Error ? error : undefined
    );
  }
}

// =============================================================================
// Key Derivation (HKDF)
// =============================================================================

/**
 * Derive keys using HKDF-SHA256.
 *
 * @param inputKeyMaterial - Input key material (e.g., ECDH shared secret)
 * @param salt - Salt value (can be empty Uint8Array for initial derivation)
 * @param info - Context/application-specific info string
 * @param length - Desired output length in bytes
 * @returns Derived key material
 * @throws NoiseProtocolError if HKDF fails
 */
export function hkdfExpand(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  info: string,
  length: number
): Uint8Array {
  try {
    const infoBytes = new TextEncoder().encode(`${HKDF_INFO_PREFIX}:${info}`);
    return hkdf(sha256, inputKeyMaterial, salt, infoBytes, length);
  } catch (error) {
    throw new NoiseProtocolError(
      "HKDF key derivation failed",
      "HKDF_FAILED",
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Derive a cipher state (key + initial nonce) from input key material.
 *
 * @param inputKeyMaterial - Input key material
 * @param salt - Salt for HKDF
 * @param purpose - Purpose string (e.g., "send" or "receive")
 * @returns Cipher state with derived key and zero nonce
 */
export function deriveCipherState(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  purpose: string
): NoiseCipherState {
  const key = hkdfExpand(inputKeyMaterial, salt, `cipher-${purpose}`, KEY_SIZE);
  return {
    key,
    nonce: 0n,
  };
}

// =============================================================================
// Symmetric Encryption (ChaCha20-Poly1305)
// =============================================================================

/**
 * Convert a bigint nonce counter to a 12-byte Uint8Array.
 * The counter is placed in the last 8 bytes (big-endian).
 *
 * @param nonceCounter - Nonce counter as bigint
 * @returns 12-byte nonce array
 */
function nonceToBytes(nonceCounter: bigint): Uint8Array {
  const nonceBytes = new Uint8Array(NONCE_SIZE);
  const view = new DataView(nonceBytes.buffer);
  // Place the 64-bit counter in bytes 4-11 (big-endian)
  view.setBigUint64(4, nonceCounter, false);
  return nonceBytes;
}

/**
 * Encrypt plaintext using ChaCha20-Poly1305 AEAD.
 *
 * @param key - 32-byte encryption key
 * @param nonce - 12-byte nonce
 * @param plaintext - Data to encrypt
 * @param associatedData - Optional additional authenticated data (AAD)
 * @returns Ciphertext with 16-byte authentication tag appended
 * @throws NoiseProtocolError if encryption fails
 */
export async function chaCha20Poly1305Encrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  associatedData?: Uint8Array
): Promise<Uint8Array> {
  try {
    const cipher = chacha20poly1305(key, nonce, associatedData);
    return cipher.encrypt(plaintext);
  } catch (error) {
    throw new NoiseProtocolError(
      "ChaCha20-Poly1305 encryption failed",
      "ENCRYPTION_FAILED",
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Decrypt ciphertext using ChaCha20-Poly1305 AEAD.
 *
 * @param key - 32-byte encryption key
 * @param nonce - 12-byte nonce
 * @param ciphertext - Data to decrypt (includes 16-byte auth tag)
 * @param associatedData - Optional additional authenticated data (AAD)
 * @returns Decrypted plaintext
 * @throws NoiseProtocolError if decryption or authentication fails
 */
export async function chaCha20Poly1305Decrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  associatedData?: Uint8Array
): Promise<Uint8Array> {
  try {
    const cipher = chacha20poly1305(key, nonce, associatedData);
    return cipher.decrypt(ciphertext);
  } catch (error) {
    throw new NoiseProtocolError(
      "ChaCha20-Poly1305 decryption failed (authentication failed or invalid ciphertext)",
      "DECRYPTION_FAILED",
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Encrypt using a cipher state, automatically handling nonce.
 * This is a higher-level wrapper for session-based encryption.
 *
 * WARNING: Caller MUST update cipherState.nonce to nextNonce after each successful call.
 * Nonce reuse with the same key is catastrophic for security (keystream reuse attack).
 *
 * @param cipherState - Cipher state with key and nonce counter
 * @param plaintext - Data to encrypt
 * @param associatedData - Optional AAD
 * @returns Object containing ciphertext, the nonce used, and nextNonce for caller to update state
 */
export async function encryptWithCipherState(
  cipherState: NoiseCipherState,
  plaintext: Uint8Array,
  associatedData?: Uint8Array
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array; nextNonce: bigint }> {
  const nonce = nonceToBytes(cipherState.nonce);
  const ciphertext = await chaCha20Poly1305Encrypt(
    cipherState.key,
    nonce,
    plaintext,
    associatedData
  );
  return { ciphertext, nonce, nextNonce: cipherState.nonce + 1n };
}

/**
 * Decrypt using a cipher state.
 * This is a higher-level wrapper for session-based decryption.
 *
 * @param cipherState - Cipher state with key
 * @param ciphertext - Data to decrypt
 * @param nonce - The nonce that was used for encryption
 * @param associatedData - Optional AAD
 * @returns Decrypted plaintext
 */
export async function decryptWithCipherState(
  cipherState: NoiseCipherState,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  associatedData?: Uint8Array
): Promise<Uint8Array> {
  return chaCha20Poly1305Decrypt(
    cipherState.key,
    nonce,
    ciphertext,
    associatedData
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Securely zero out a Uint8Array to clear sensitive key material.
 * Note: JavaScript doesn't guarantee memory clearing, but this is best effort.
 *
 * @param buffer - Buffer to zero
 */
export function secureZero(buffer: Uint8Array): void {
  // Fill with zeros
  buffer.fill(0);
  // Overwrite with random data to help ensure the zeros aren't optimized away
  crypto.getRandomValues(buffer);
  // Fill with zeros again
  buffer.fill(0);
}

/**
 * Compare two Uint8Arrays in constant time to prevent timing attacks.
 *
 * @param a - First array
 * @param b - Second array
 * @returns true if arrays are equal, false otherwise
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Convert Uint8Array to hex string.
 *
 * @param bytes - Bytes to convert
 * @returns Hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert hex string to Uint8Array.
 *
 * @param hex - Hex string to convert
 * @returns Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Encode Uint8Array to base64 string.
 *
 * @param bytes - Bytes to encode
 * @returns Base64 string
 */
export function bytesToBase64(bytes: Uint8Array): string {
  // Use loop-based approach to avoid stack overflow with large arrays
  // (spread operator causes RangeError for arrays >65,536 bytes)
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decode base64 string to Uint8Array.
 *
 * @param base64 - Base64 string to decode
 * @returns Uint8Array
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
