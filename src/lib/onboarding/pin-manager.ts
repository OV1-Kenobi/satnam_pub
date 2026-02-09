/**
 * PIN Management for High-Volume Onboarding
 *
 * Generates, hashes, and verifies 6-digit PINs for Boltcard and Tapsigner flows.
 * Uses Web Crypto API for browser-compatible cryptographic operations.
 *
 * @module pin-manager
 * @sensitive This module handles PIN material - never log PIN values
 */

import {
  ONBOARDING_PIN_LENGTH,
  ONBOARDING_PIN_PBKDF2_ITERATIONS,
} from "../../config/onboarding";

/** Salt length in bytes for PIN hashing */
const PIN_SALT_LENGTH = 32;

/**
 * Result of PIN generation
 */
export interface PINGenerationResult {
  /** The generated 6-digit PIN as a string (preserves leading zeros) */
  pin: string;
  /** Salt used for hashing (base64 encoded) */
  salt: string;
  /** Hash of the PIN (hex encoded) */
  hash: string;
}

/**
 * Result of PIN hashing
 */
export interface PINHashResult {
  /** Salt used for hashing (base64 encoded) */
  salt: string;
  /** Hash of the PIN (hex encoded) */
  hash: string;
}

/**
 * Generates a cryptographically secure 6-digit PIN.
 *
 * Uses Web Crypto API to ensure uniform distribution across 000000-999999.
 * Implements rejection sampling to eliminate modulo bias.
 *
 * @sensitive This function generates PIN material - never log the result
 * @returns 6-digit PIN as a string (preserves leading zeros)
 */
export function generateSecurePIN(): string {
  const maxPIN = 10 ** ONBOARDING_PIN_LENGTH; // 1,000,000
  const maxValidValue = Math.floor(2 ** 32 / maxPIN) * maxPIN;

  let randomValue: number;

  // Rejection sampling to eliminate modulo bias
  do {
    const randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);
    randomValue = randomArray[0];
  } while (randomValue >= maxValidValue);

  const pin = randomValue % maxPIN;

  // Pad to ensure 6 digits (preserves leading zeros)
  return pin.toString().padStart(ONBOARDING_PIN_LENGTH, "0");
}

/**
 * Generates a batch of unique PINs.
 *
 * Useful for pre-generating PINs for multiple participants.
 * Ensures no duplicates in the batch.
 *
 * @sensitive This function generates PIN material
 * @param count - Number of unique PINs to generate
 * @returns Array of unique 6-digit PINs
 */
export function generateUniquePINBatch(count: number): string[] {
  const pins = new Set<string>();

  while (pins.size < count) {
    pins.add(generateSecurePIN());
  }

  return Array.from(pins);
}

/**
 * Generates a cryptographically secure salt for PIN hashing.
 *
 * @returns 32-byte salt as base64 string
 */
export function generatePINSalt(): string {
  const salt = new Uint8Array(PIN_SALT_LENGTH);
  crypto.getRandomValues(salt);
  return btoa(String.fromCharCode(...salt));
}

/**
 * Hashes a PIN using PBKDF2/SHA-512.
 *
 * @sensitive This function processes PIN material
 * @param pin - The 6-digit PIN to hash
 * @param salt - Base64-encoded salt (if not provided, generates new salt)
 * @returns PINHashResult with salt and hash
 */
export async function hashPIN(
  pin: string,
  salt?: string,
): Promise<PINHashResult> {
  const pinSalt = salt ?? generatePINSalt();
  const encoder = new TextEncoder();

  // Import PIN as key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  // Derive bits using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(pinSalt),
      iterations: ONBOARDING_PIN_PBKDF2_ITERATIONS,
      hash: "SHA-512",
    },
    keyMaterial,
    512, // 64 bytes = 512 bits
  );

  // Convert to hex string
  const hashArray = new Uint8Array(derivedBits);
  const hash = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { salt: pinSalt, hash };
}

/**
 * Verifies a PIN against a stored hash using constant-time comparison.
 *
 * @sensitive This function verifies PIN material
 * @param pin - The PIN to verify
 * @param storedHash - The stored hash (hex encoded)
 * @param salt - The salt used for hashing (base64 encoded)
 * @returns True if PIN matches, false otherwise
 */
export async function verifyPIN(
  pin: string,
  storedHash: string,
  salt: string,
): Promise<boolean> {
  const { hash: computedHash } = await hashPIN(pin, salt);

  // Constant-time comparison to prevent timing attacks
  if (computedHash.length !== storedHash.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < computedHash.length; i++) {
    result |= computedHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }

  return result === 0;
}
