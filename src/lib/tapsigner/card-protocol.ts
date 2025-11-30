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
import { scanForCard, fetchCardPublicKey } from "./nfc-reader";
import type { CardData, ScanForCardResult } from "./nfc-reader";

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
 * Parse signature and public key from NDEF message
 * NOTE: This prepares for future Coinkite/Satnam signature record support.
 */
export function parseSignatureFromNDEF(message: any): {
  signature: string;
  publicKey: string;
} {
  try {
    if (!message || !message.records || !Array.isArray(message.records)) {
      throw new Error("Invalid NDEF message structure");
    }

    // Look for known signature record types
    const sigRecord = message.records.find(
      (record: any) =>
        record.recordType === "application/vnd.coinkite.signature" ||
        record.recordType === "application/vnd.satnam.signature"
    );

    if (!sigRecord || !sigRecord.data) {
      throw new Error("No signature record found in NDEF message");
    }

    const decoder = new TextDecoder();
    const rawData = decoder.decode(sigRecord.data).trim();

    let payload: any;
    try {
      payload = JSON.parse(rawData);
    } catch {
      throw new Error("Invalid signature record payload format");
    }

    const signature: string =
      typeof payload.signature === "string"
        ? payload.signature
        : typeof payload.sig === "string"
        ? payload.sig
        : "";

    const publicKey: string =
      typeof payload.publicKey === "string"
        ? payload.publicKey
        : typeof payload.pubkey === "string"
        ? payload.pubkey
        : "";

    if (!/^[a-fA-F0-9]{128}$/.test(signature)) {
      throw new Error("Invalid signature format in NDEF record");
    }

    if (!/^[a-fA-F0-9]{64}$/.test(publicKey)) {
      throw new Error("Invalid public key format in NDEF record");
    }

    return { signature, publicKey };
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : "Signature parsing failed";
    console.error("[Card Protocol] NDEF signature parsing error:", messageText);
    throw error;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim();
  if (!/^[a-fA-F0-9]*$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = parseInt(normalized.substring(i, i + 2), 16);
  }
  return bytes;
}

async function verifyEventSignature(
  eventHash: string,
  signature: string,
  publicKey: string
): Promise<boolean> {
  const { secp256k1 } = await import("@noble/curves/secp256k1");

  const messageBytes = hexToBytes(eventHash);
  const signatureBytes = hexToBytes(signature);
  const publicKeyBytes = hexToBytes(publicKey);

  // Tapsigner uses Schnorr signatures on secp256k1
  return secp256k1.schnorr.verify(signatureBytes, messageBytes, publicKeyBytes);
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
    const message =
      error instanceof Error ? error.message : "Challenge generation failed";
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
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return hashHex;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PIN hashing failed";
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
    const message =
      error instanceof Error ? error.message : "PIN verification failed";
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

    // Validate event hash format (64 hexadecimal characters)
    if (!/^[a-fA-F0-9]{64}$/.test(eventHash)) {
      throw new Error("Event hash must be exactly 64 hexadecimal characters");
    }

    const debugEnabled = getEnvVar("VITE_TAPSIGNER_DEBUG") === "true";

    if (debugEnabled) {
      console.log(
        "[Card Protocol] Generating signature for event:",
        eventHash.substring(0, 16) + "..."
      );
    }

    let cardPublicKey = "0".repeat(64);
    let nfcUsed = false;
    let signature: string | null = null;
    let rawMessage: unknown;

    // Only attempt NFC scan in browser environments with Web NFC available
    if (typeof window !== "undefined" && "NDEFReader" in window) {
      try {
        const result: CardData | ScanForCardResult = await scanForCard(
          10000,
          true
        );

        const { cardData, rawMessage: message } =
          "cardData" in result
            ? result
            : { cardData: result, rawMessage: undefined };

        rawMessage = message;

        if (cardData.cardId !== cardId) {
          throw new Error("Card ID mismatch - wrong card presented");
        }

        cardPublicKey = cardData.publicKey;
        nfcUsed = true;

        if (debugEnabled) {
          console.log("[Card Protocol] Card scanned successfully", {
            cardId: cardId.substring(0, 8) + "...",
          });
        }
      } catch (scanError) {
        const message =
          scanError instanceof Error ? scanError.message : "Card scan failed";
        console.error("[Card Protocol] NFC scan error:", message);
        throw scanError;
      }
    } else if (debugEnabled) {
      console.warn(
        "[Card Protocol] Web NFC not available in this environment; skipping card scan"
      );
    }

    // If we received a raw NDEF message, attempt to parse a hardware signature
    if (rawMessage) {
      try {
        const parsed = parseSignatureFromNDEF(rawMessage as any);
        signature = parsed.signature;
        cardPublicKey = parsed.publicKey;

        if (debugEnabled) {
          console.log(
            "[Card Protocol] Parsed hardware signature from NDEF message"
          );
        }
      } catch (parseError) {
        const message =
          parseError instanceof Error
            ? parseError.message
            : "Failed to parse hardware signature";
        console.error(
          "[Card Protocol] Hardware signature parsing error:",
          message
        );
        throw new Error(
          "Failed to parse hardware signature from Tapsigner response"
        );
      }
    }

    // If the NDEF records did not include a usable public key, try to
    // resolve it from the backend using the encrypted card config.
    if (cardPublicKey === "0".repeat(64)) {
      try {
        const backendKey = await fetchCardPublicKey(cardId);
        if (backendKey && /^[a-fA-F0-9]{64}$/.test(backendKey)) {
          cardPublicKey = backendKey;
          if (debugEnabled) {
            console.log(
              "[Card Protocol] Resolved public key from backend for card:",
              {
                cardId: cardId.substring(0, 8) + "...",
              }
            );
          }
        }
      } catch (lookupError) {
        const message =
          lookupError instanceof Error
            ? lookupError.message
            : "Public key lookup failed";
        console.error(
          "[Card Protocol] Backend public key lookup error:",
          message
        );
        // Continue with placeholder if lookup fails; callers must treat this
        // as non-production-safe.
      }
    }

    // At this point we expect a hardware-provided signature from the card.
    if (!signature) {
      throw new Error(
        "Tapsigner card did not return a signature in the NFC response"
      );
    }

    const publicKey = cardPublicKey;

    // Enforce verification before returning the hardware signature
    if (nfcUsed) {
      const isValid = await verifyEventSignature(
        eventHash,
        signature,
        publicKey
      );

      if (!isValid) {
        console.error(
          "[Card Protocol] Tapsigner signature verification failed - signature invalid"
        );
        throw new Error(
          "Tapsigner signature verification failed - signature invalid"
        );
      }
    }

    return {
      signature,
      publicKey,
      timestamp: Date.now(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Signature generation failed";
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
