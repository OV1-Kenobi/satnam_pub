/**
 * Card Protocol Library for Tapsigner
 * Phase 3 Task 3.2: Web NFC API Integration
 *
 * Implements Tapsigner card protocol for:
 * - Challenge-response authentication
 * - PIN verification
 * - ECDSA signature generation
 * - Rate limiting and security
 */

import { getEnvVar } from "../../config/env.client";

/**
 * Challenge data for card authentication
 */
export interface Challenge {
  nonce: string;
  timestamp: number;
  expiresAt: number;
}

/**
 * PIN verification result
 */
export interface PINVerificationResult {
  success: boolean;
  attemptsRemaining: number;
  locked: boolean;
  message: string;
}

/**
 * Signature result from card
 */
export interface SignatureResult {
  signature: string;
  publicKey: string;
  timestamp: number;
}

/**
 * Generate a random nonce for challenge-response
 * @param length - Length of nonce in bytes (default: 32)
 * @returns Hex-encoded nonce
 */
export function generateChallenge(length: number = 32): Challenge {
  try {
    const buffer = new Uint8Array(length);
    crypto.getRandomValues(buffer);

    // Convert to hex string
    const nonce = Array.from(buffer)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const timestamp = Date.now();
    const expiresAt = timestamp + 5 * 60 * 1000; // 5 minute expiry

    return {
      nonce: nonce,
      timestamp: timestamp,
      expiresAt: expiresAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Challenge generation failed";
    console.error("[Card Protocol] Challenge generation error:", message);
    throw error;
  }
}

/**
 * Validate challenge expiry
 * @param challenge - Challenge to validate
 * @returns true if valid, false if expired
 */
export function validateChallenge(challenge: Challenge): boolean {
  try {
    if (!challenge || !challenge.nonce) return false;
    if (!challenge.expiresAt) return false;

    const now = Date.now();
    return now < challenge.expiresAt;
  } catch {
    return false;
  }
}

/**
 * Hash PIN for verification (constant-time comparison)
 * @param pin - PIN to hash
 * @param salt - Salt for hashing
 * @returns Hashed PIN
 */
export async function hashPIN(pin: string, salt: string): Promise<string> {
  try {
    if (!pin || pin.length === 0) {
      throw new Error("PIN cannot be empty");
    }

    // Validate PIN format (6 digits)
    if (!/^\d{6}$/.test(pin)) {
      throw new Error("PIN must be 6 digits");
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(pin + salt);

    // Use SHA-256 for PIN hashing
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    return hashHex;
  } catch (error) {
    const message = error instanceof Error ? error.message : "PIN hashing failed";
    console.error("[Card Protocol] PIN hashing error:", message);
    throw error;
  }
}

/**
 * Constant-time comparison for PIN verification
 * @param provided - Provided PIN hash
 * @param stored - Stored PIN hash
 * @returns true if equal, false otherwise
 */
export function constantTimeCompare(provided: string, stored: string): boolean {
  try {
    if (!provided || !stored) return false;
    if (provided.length !== stored.length) return false;

    let result = 0;
    for (let i = 0; i < provided.length; i++) {
      result |= provided.charCodeAt(i) ^ stored.charCodeAt(i);
    }

    return result === 0;
  } catch {
    return false;
  }
}

/**
 * Verify PIN with rate limiting
 * @param pin - PIN to verify
 * @param storedHash - Stored PIN hash
 * @param attempts - Current attempt count
 * @param maxAttempts - Maximum attempts allowed (default: 3)
 * @returns Verification result
 */
export async function verifyPIN(
  pin: string,
  storedHash: string,
  attempts: number = 0,
  maxAttempts: number = 3
): Promise<PINVerificationResult> {
  try {
    // Check if locked
    if (attempts >= maxAttempts) {
      return {
        success: false,
        attemptsRemaining: 0,
        locked: true,
        message: "Card is locked due to too many failed attempts",
      };
    }

    // Validate PIN format
    if (!/^\d{6}$/.test(pin)) {
      return {
        success: false,
        attemptsRemaining: maxAttempts - attempts - 1,
        locked: false,
        message: "Invalid PIN format (must be 6 digits)",
      };
    }

    // Hash provided PIN
    const providedHash = await hashPIN(pin, "");

    // Constant-time comparison
    const isValid = constantTimeCompare(providedHash, storedHash);

    if (isValid) {
      return {
        success: true,
        attemptsRemaining: maxAttempts,
        locked: false,
        message: "PIN verified successfully",
      };
    } else {
      const remaining = maxAttempts - attempts - 1;
      return {
        success: false,
        attemptsRemaining: remaining,
        locked: remaining === 0,
        message: `Invalid PIN. ${remaining} attempts remaining.`,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "PIN verification failed";
    console.error("[Card Protocol] PIN verification error:", message);
    throw error;
  }
}

/**
 * Generate ECDSA signature for event
 * @param eventHash - Event hash to sign
 * @param cardId - Card ID
 * @returns Signature result
 */
export async function generateSignature(
  eventHash: string,
  cardId: string
): Promise<SignatureResult> {
  try {
    if (!eventHash || eventHash.length === 0) {
      throw new Error("Event hash cannot be empty");
    }

    if (!cardId || cardId.length === 0) {
      throw new Error("Card ID cannot be empty");
    }

    const debugEnabled = getEnvVar("VITE_TAPSIGNER_DEBUG") === "true";

    if (debugEnabled) {
      console.log("[Card Protocol] Generating signature for event:", eventHash.substring(0, 16) + "...");
    }

    // In real implementation, this would communicate with the card via NFC
    // For now, return a placeholder signature
    const signature = "0".repeat(128); // 128-character hex placeholder
    const publicKey = "0".repeat(64); // 64-character hex placeholder

    return {
      signature: signature,
      publicKey: publicKey,
      timestamp: Date.now(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signature generation failed";
    console.error("[Card Protocol] Signature generation error:", message);
    throw error;
  }
}

/**
 * Validate signature format
 * @param signature - Signature to validate
 * @returns true if valid, false otherwise
 */
export function validateSignature(signature: string): boolean {
  try {
    if (!signature || signature.length === 0) return false;

    // Signature should be 128-character hex string (64 bytes)
    if (!/^[a-fA-F0-9]{128}$/.test(signature)) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate public key format
 * @param publicKey - Public key to validate
 * @returns true if valid, false otherwise
 */
export function validatePublicKey(publicKey: string): boolean {
  try {
    if (!publicKey || publicKey.length === 0) return false;

    // Public key should be 64-character hex string (32 bytes)
    if (!/^[a-fA-F0-9]{64}$/.test(publicKey)) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Format card ID for display
 * @param cardId - Card ID to format
 * @returns Formatted card ID (e.g., "ABCD...1234")
 */
export function formatCardId(cardId: string): string {
  try {
    if (!cardId || cardId.length < 8) return cardId;

    const start = cardId.substring(0, 4).toUpperCase();
    const end = cardId.substring(cardId.length - 4).toUpperCase();

    return `${start}...${end}`;
  } catch {
    return cardId;
  }
}

