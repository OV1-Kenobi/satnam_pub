// secp256k1 will be used in future implementations
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-enable @typescript-eslint/no-unused-vars */
// All crypto imports are lazy loaded for better performance
// All crypto operations are now lazy loaded

import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, hexToBytes } from "@noble/curves/utils";

/**
 * Generate a random hex string of specified length
 */
export async function generateRandomHex(length: number): Promise<string> {
  const { generateRandomHex: lazyGenerateRandomHex } = await import(
    "./crypto-lazy"
  );
  return lazyGenerateRandomHex(length);
}

/**
 * Generate a secure token for session management
 */
export async function generateSecureToken(
  length: number = 64
): Promise<string> {
  const { generateSecureToken: lazyGenerateSecureToken } = await import(
    "./crypto-lazy"
  );
  return lazyGenerateSecureToken(length);
}

/**
 * Hash a string using SHA-256
 */
export async function sha256(data: string): Promise<string> {
  const { sha256: lazySha256 } = await import("./crypto-lazy");
  return lazySha256(data);
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param a First string to compare
 * @param b Second string to compare
 * @returns true if strings are equal, false otherwise
 */
export function constantTimeEquals(a: string, b: string): boolean {
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
 * Generate a secp256k1 key pair for Nostr
 * @param recoveryPhrase - Optional BIP39 mnemonic phrase to derive the key from
 * @param account - Optional account index when using a recovery phrase (default: 0)
 * @returns Nostr key pair with private key, public key, npub, and nsec
 */
export async function generateNostrKeyPair(
  recoveryPhrase?: string,
  account: number = 0
) {
  console.log(
    "🔍 UTILS/CRYPTO.TS generateNostrKeyPair called - REDIRECTING TO CRYPTO-FACTORY"
  );
  const { generateNostrKeyPair: factoryGenerateNostrKeyPair } = await import(
    "./crypto-factory"
  );
  return factoryGenerateNostrKeyPair(recoveryPhrase, account);
}

/**
 * Generate a recovery phrase (mnemonic) for a private key
 */
export async function generateRecoveryPhrase(): Promise<string> {
  const { generateRecoveryPhrase: lazyGenerateRecoveryPhrase } = await import(
    "./crypto-lazy"
  );
  return lazyGenerateRecoveryPhrase();
}

/**
 * Derive a private key from a recovery phrase following NIP-06 standard
 * Uses the derivation path m/44'/1237'/0'/0/0 as specified in NIP-06
 */
export async function privateKeyFromPhrase(phrase: string): Promise<string> {
  const { privateKeyFromPhrase: lazyPrivateKeyFromPhrase } = await import(
    "./crypto-lazy"
  );
  return lazyPrivateKeyFromPhrase(phrase);
}

/**
 * Derive a private key from a recovery phrase with a specific account index
 * Follows NIP-06 standard with customizable account
 * @param phrase - BIP39 mnemonic phrase
 * @param account - Account index (default: 0)
 * @returns Hex-encoded private key
 */
export async function privateKeyFromPhraseWithAccount(
  phrase: string,
  account: number = 0
): Promise<string> {
  const {
    privateKeyFromPhraseWithAccount: lazyPrivateKeyFromPhraseWithAccount,
  } = await import("./crypto-lazy");
  return lazyPrivateKeyFromPhraseWithAccount(phrase, account);
}

/**
 * Encrypt data with a password using PBKDF2 + AES-256-GCM
 * @deprecated Use encryptCredentials from lib/security.ts for secure PBKDF2 encryption
 */
export async function encryptData(
  data: string,
  password: string
): Promise<string> {
  console.warn(
    "⚠️  SECURITY WARNING: Using legacy encryptData(). Please use encryptCredentials() from lib/security.ts for secure PBKDF2 encryption"
  );

  const { CryptoLazy } = await import("./crypto-lazy");
  const crypto = CryptoLazy.getInstance();
  return crypto.encryptData(data, password);
}

/**
 * Decrypt data with a password (supports both legacy and improved formats)
 * @deprecated Use decryptCredentials from lib/security.ts for secure PBKDF2 decryption
 */
export async function decryptData(
  encryptedData: string,
  password: string
): Promise<string> {
  console.warn(
    "⚠️  SECURITY WARNING: Using legacy decryptData(). Please use decryptCredentials() from lib/security.ts for secure PBKDF2 decryption"
  );

  const { CryptoLazy } = await import("./crypto-lazy");
  const crypto = CryptoLazy.getInstance();
  return crypto.decryptData(encryptedData, password);
}

/**
 * Derive a cryptographic key from password and salt using PBKDF2
 * @param password - The password to derive from
 * @param salt - The salt (as hex string or Uint8Array)
 * @param iterations - Number of PBKDF2 iterations (default: 100000)
 * @param keyLength - Length of derived key in bytes (default: 32)
 * @returns Promise<Uint8Array> - The derived key
 */
export async function deriveKey(
  password: string,
  salt: string | Uint8Array,
  iterations: number = 100000,
  keyLength: number = 32
): Promise<Uint8Array> {
  const { deriveKey: lazyDeriveKey } = await import("./crypto-lazy");
  return lazyDeriveKey(password, salt, iterations, keyLength);
}

/**
 * Decode a Base32 string to a Uint8Array
 * This is used for TOTP/HOTP secrets which are commonly Base32-encoded
 */
export function decodeBase32(base32: string): Uint8Array {
  // Remove spaces and convert to uppercase
  const sanitized = base32.replace(/\s+/g, "").toUpperCase();

  // Base32 character set (RFC 4648)
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  // Prepare output array
  const length = Math.floor((sanitized.length * 5) / 8);
  const result = new Uint8Array(length);

  let bits = 0;
  let value = 0;
  let index = 0;

  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];
    if (char === "=") continue; // Skip padding

    const charValue = charset.indexOf(char);
    if (charValue === -1) {
      throw new Error(`Invalid Base32 character: ${char}`);
    }

    // Add 5 bits from each character
    value = (value << 5) | charValue;
    bits += 5;

    // When we have at least 8 bits, write a byte
    if (bits >= 8) {
      bits -= 8;
      result[index++] = (value >> bits) & 0xff;
    }
  }

  return result;
}

/**
 * Check if a string is valid Base32
 */
export function isBase32(str: string): boolean {
  const sanitized = str.replace(/\s+/g, "").toUpperCase();
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  return sanitized.split("").every((char) => charset.includes(char));
}

/**
 * RFC 6238 TOTP Configuration
 * Following established codebase requirements: 120-second windows, HMAC-SHA-256, ±1 tolerance
 */
export const TOTP_CONFIG = {
  ALGORITHM: "SHA-256" as const,
  DIGITS: 6,
  PERIOD: 120, // 120-second time windows per requirements
  WINDOW_TOLERANCE: 1, // ±1 tolerance per requirements
  SECRET_LENGTH: 20, // 160-bit secrets (recommended minimum)
} as const;

/**
 * TOTP Validation Result
 */
export interface TOTPValidationResult {
  valid: boolean;
  timeWindow?: number;
  timeRemaining?: number;
  error?: string;
}

/**
 * Generate a RFC 6238 compliant TOTP token
 * SECURITY: Uses Web Crypto API with HMAC-SHA-256 for browser compatibility
 * @param secret Base32 encoded secret
 * @param timestamp Optional timestamp (defaults to current time)
 * @param window Time window offset (for validation tolerance)
 * @returns 6-digit TOTP code
 */
export async function generateTOTP(
  secret: string,
  timestamp?: number,
  window = 0
): Promise<string> {
  const currentTime = timestamp || Math.floor(Date.now() / 1000);
  const counter = Math.floor(currentTime / TOTP_CONFIG.PERIOD) + window;
  return generateHOTP(secret, counter);
}

/**
 * Generate a RFC 4226 compliant HOTP token
 * SECURITY: Production-ready implementation using Web Crypto API
 * @param secret Base32 encoded secret
 * @param counter Counter value
 * @returns 6-digit HOTP code
 */
export async function generateHOTP(
  secret: string,
  counter: number
): Promise<string> {
  try {
    // Decode base32 secret
    const secretBytes = decodeBase32(secret);

    // Convert counter to 8-byte big-endian array
    const counterBytes = new Uint8Array(8);
    for (let i = 7; i >= 0; i--) {
      counterBytes[i] = counter & 0xff;
      counter = counter >>> 8;
    }

    // Import secret as HMAC key using Web Crypto API
    // Create a new Uint8Array with proper ArrayBuffer
    const secretBuffer = new Uint8Array(secretBytes);
    const key = await crypto.subtle.importKey(
      "raw",
      secretBuffer,
      { name: "HMAC", hash: TOTP_CONFIG.ALGORITHM },
      false,
      ["sign"]
    );

    // Generate HMAC-SHA-256 signature
    const signature = await crypto.subtle.sign("HMAC", key, counterBytes);
    const hash = new Uint8Array(signature);

    // Dynamic truncation (RFC 4226 Section 5.4)
    const offset = hash[hash.length - 1] & 0x0f;
    const code =
      (((hash[offset] & 0x7f) << 24) |
        ((hash[offset + 1] & 0xff) << 16) |
        ((hash[offset + 2] & 0xff) << 8) |
        (hash[offset + 3] & 0xff)) %
      Math.pow(10, TOTP_CONFIG.DIGITS);

    return code.toString().padStart(TOTP_CONFIG.DIGITS, "0");
  } catch (error) {
    throw new Error(
      `HOTP generation failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Verify a TOTP token with time window tolerance
 * SECURITY: Uses constant-time comparison to prevent timing attacks
 * @param token User-provided TOTP token
 * @param secret Base32 encoded secret
 * @param timestamp Optional timestamp (defaults to current time)
 * @param windowTolerance Time window tolerance (defaults to ±1)
 * @returns Validation result with security details
 */
export async function verifyTOTP(
  token: string,
  secret: string,
  timestamp?: number,
  windowTolerance = TOTP_CONFIG.WINDOW_TOLERANCE
): Promise<TOTPValidationResult> {
  try {
    // Input validation
    if (!token || token.length !== TOTP_CONFIG.DIGITS) {
      return { valid: false, error: "Invalid token format" };
    }

    if (!secret) {
      return { valid: false, error: "Secret is required" };
    }

    const currentTime = timestamp || Math.floor(Date.now() / 1000);
    const currentWindow = Math.floor(currentTime / TOTP_CONFIG.PERIOD);

    // Check token against time windows with tolerance
    for (let i = -windowTolerance; i <= windowTolerance; i++) {
      const expectedToken = await generateTOTP(secret, currentTime, i);

      // Use constant-time comparison to prevent timing attacks
      if (constantTimeEquals(token, expectedToken)) {
        const timeRemaining =
          TOTP_CONFIG.PERIOD - (currentTime % TOTP_CONFIG.PERIOD);
        return {
          valid: true,
          timeWindow: currentWindow + i,
          timeRemaining,
        };
      }
    }

    return { valid: false, error: "Invalid token" };
  } catch (error) {
    return {
      valid: false,
      error: `TOTP verification failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

/**
 * Encode a Uint8Array to Base32 string
 */
export function encodeBase32(buffer: Uint8Array): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let result = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      result += charset[(value >> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += charset[(value << (5 - bits)) & 0x1f];
  }

  // Add padding
  while (result.length % 8 !== 0) {
    result += "=";
  }

  return result;
}

/**
 * Generate a cryptographically secure TOTP secret
 * SECURITY: Uses Web Crypto API for secure random generation
 * @param length Secret length in bytes (default: 20 bytes = 160 bits)
 * @returns Base32 encoded secret
 */
export async function generateTOTPSecret(
  length: number = TOTP_CONFIG.SECRET_LENGTH
): Promise<string> {
  if (length < 16) {
    throw new Error(
      "TOTP secret must be at least 16 bytes (128 bits) for security"
    );
  }

  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  return encodeBase32(randomBytes);
}

/**
 * Validate TOTP secret format and strength
 * @param secret Base32 encoded secret
 * @returns Validation result
 */
export function validateTOTPSecret(secret: string): {
  valid: boolean;
  error?: string;
} {
  if (!secret) {
    return { valid: false, error: "Secret is required" };
  }

  if (!isBase32(secret)) {
    return {
      valid: false,
      error: "Secret must be valid Base32 encoded string",
    };
  }

  try {
    const decoded = decodeBase32(secret);
    if (decoded.length < 16) {
      return {
        valid: false,
        error: "Secret must be at least 16 bytes (128 bits) for security",
      };
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, error: "Invalid Base32 secret format" };
  }
}

/**
 * Enhanced TOTP verification with replay protection
 * SECURITY: Prevents replay attacks by tracking used tokens
 * @param token User-provided TOTP token
 * @param secret Base32 encoded secret
 * @param usedTokens Set of recently used tokens (for replay protection)
 * @param timestamp Optional timestamp (defaults to current time)
 * @param windowTolerance Time window tolerance (defaults to ±1)
 * @returns Validation result with security details
 */
export async function verifyTOTPWithReplayProtection(
  token: string,
  secret: string,
  usedTokens: Set<string>,
  timestamp?: number,
  windowTolerance = TOTP_CONFIG.WINDOW_TOLERANCE
): Promise<TOTPValidationResult & { replayAttack?: boolean }> {
  // Check for replay attack
  if (usedTokens.has(token)) {
    return {
      valid: false,
      replayAttack: true,
      error: "Token already used (replay attack detected)",
    };
  }

  const result = await verifyTOTP(token, secret, timestamp, windowTolerance);

  if (result.valid) {
    // Add token to used tokens set for replay protection
    usedTokens.add(token);

    // Clean up old tokens (keep only tokens from current and adjacent windows)
    const currentTime = timestamp || Math.floor(Date.now() / 1000);
    const currentWindow = Math.floor(currentTime / TOTP_CONFIG.PERIOD);

    // Generate tokens for cleanup comparison
    const tokensToKeep = new Set<string>();
    for (let i = -windowTolerance - 1; i <= windowTolerance + 1; i++) {
      try {
        const windowToken = await generateTOTP(secret, currentTime, i);
        tokensToKeep.add(windowToken);
      } catch (error) {
        // Continue cleanup even if token generation fails
      }
    }

    // Remove old tokens not in current window range
    for (const usedToken of usedTokens) {
      if (!tokensToKeep.has(usedToken)) {
        usedTokens.delete(usedToken);
      }
    }
  }

  return result;
}

/**
 * Generate TOTP URI for QR code generation (RFC 6238)
 * @param secret Base32 encoded secret
 * @param label Account label (e.g., "user@example.com")
 * @param issuer Service name (e.g., "Satnam.pub")
 * @param algorithm Hash algorithm (default: SHA256)
 * @param digits Number of digits (default: 6)
 * @param period Time period in seconds (default: 120)
 * @returns TOTP URI string
 */
export function generateTOTPUri(
  secret: string,
  label: string,
  issuer: string = "Satnam.pub",
  algorithm: string = "SHA256",
  digits: number = TOTP_CONFIG.DIGITS,
  period: number = TOTP_CONFIG.PERIOD
): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm,
    digits: digits.toString(),
    period: period.toString(),
  });

  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(
    label
  )}?${params.toString()}`;
}

/**
 * Sign a Nostr event with enhanced security
 * SECURITY: Uses secure hex parsing, input validation, and memory cleanup
 */
export async function signNostrEvent(
  event: {
    kind: number;
    pubkey: string;
    created_at: number;
    tags: string[][];
    content: string;
  },
  privateKey: string
): Promise<{
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
  sig: string;
}> {
  // Input validation
  if (!event || !privateKey) {
    throw new Error("Missing required parameters for Nostr event signing");
  }

  if (privateKey.length !== 64) {
    throw new Error(
      "Invalid private key format - expected exactly 64 hex characters"
    );
  }

  if (!event.pubkey || event.pubkey.length !== 64) {
    throw new Error(
      "Invalid public key format - expected exactly 64 hex characters"
    );
  }

  try {
    // Secure hex conversion with validation
    const privateKeyBytes = secureHexToBytes(privateKey);
    if (!privateKeyBytes || privateKeyBytes.length !== 32) {
      throw new Error("Invalid private key hex format");
    }

    // Create a new Uint8Array with proper ArrayBuffer for finalizeEvent compatibility
    const privateKeyBuffer = new Uint8Array(privateKeyBytes);

    const signedEvent = finalizeEvent(event, privateKeyBuffer);

    // Secure memory cleanup
    privateKeyBytes.fill(0);
    await secureCleanup([privateKey]);

    return signedEvent;
  } catch (error) {
    console.error("Nostr event signing failed:", error);
    throw new Error("Failed to sign Nostr event");
  }
}

/**
 * Secure hex string to bytes conversion with validation
 * SECURITY: Prevents malformed hex from causing issues
 */
function secureHexToBytes(hex: string): Uint8Array | null {
  try {
    // Validate hex string format
    if (!hex || hex.length % 2 !== 0) {
      return null;
    }

    // Validate hex characters
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      return null;
    }

    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      const byte = parseInt(hex.substring(i, i + 2), 16);
      if (isNaN(byte)) {
        return null;
      }
      bytes[i / 2] = byte;
    }
    return bytes;
  } catch (error) {
    return null;
  }
}

/**
 * Secure memory cleanup for sensitive signature data
 * SECURITY: Clears sensitive data from memory after use
 */
async function secureCleanup(sensitiveData: string[]): Promise<void> {
  try {
    const sensitiveTargets = sensitiveData.map((data) => ({
      data,
      type: "string" as const,
    }));

    // Import secure memory clearing if available
    try {
      const { secureClearMemory } = await import(
        "../src/lib/privacy/encryption.js"
      );
      secureClearMemory(sensitiveTargets);
    } catch (importError) {
      // Fallback to basic clearing if import fails
      console.warn("Could not import secure memory clearing");
    }
  } catch (cleanupError) {
    console.warn("Memory cleanup failed:", cleanupError);
  }
}

/**
 * Create and sign a Nostr event
 */
export async function createNostrEvent(
  kind: number,
  content: string,
  tags: string[][] = [],
  privateKey: string
): Promise<{
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
  sig: string;
}> {
  // Convert hex string to Uint8Array
  const privateKeyBytes = hexToBytes(privateKey);
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
  const pubkey = bytesToHex(publicKeyBytes);
  const event = {
    kind,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };

  return finalizeEvent(event, privateKeyBytes);
}
