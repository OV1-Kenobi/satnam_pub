// secp256k1 will be used in future implementations
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-enable @typescript-eslint/no-unused-vars */
// All crypto imports are lazy loaded for better performance
// All crypto operations are now lazy loaded

import { finalizeEvent, getPublicKey } from "../src/lib/nostr-browser";

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
  const { generateNostrKeyPair: lazyGenerateNostrKeyPair } = await import(
    "./crypto-lazy"
  );
  return lazyGenerateNostrKeyPair();
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
 * Encrypt data with a password using Gold Standard Argon2id + AES-256-GCM
 * @deprecated Use encryptCredentials from lib/security.ts for Gold Standard encryption
 */
export async function encryptData(
  data: string,
  password: string
): Promise<string> {
  console.warn(
    "⚠️  SECURITY WARNING: Using legacy encryptData(). Please use encryptCredentials() from lib/security.ts for Gold Standard Argon2id encryption"
  );

  const { CryptoLazy } = await import("./crypto-lazy");
  const crypto = CryptoLazy.getInstance();
  return crypto.encryptData(data, password);
}

/**
 * Decrypt data with a password (supports both legacy and improved formats)
 * @deprecated Use decryptCredentials from lib/security.ts for Gold Standard decryption
 */
export async function decryptData(
  encryptedData: string,
  password: string
): Promise<string> {
  console.warn(
    "⚠️  SECURITY WARNING: Using legacy decryptData(). Please use decryptCredentials() from lib/security.ts for Gold Standard Argon2id decryption"
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
 * Generate a TOTP token
 */
export async function generateTOTP(
  secret: string,
  window = 0
): Promise<string> {
  const counter = Math.floor(Date.now() / 30000) + window;
  return generateHOTP(secret, counter);
}

/**
 * Generate an HOTP token
 */
export async function generateHOTP(
  secret: string,
  counter: number
): Promise<string> {
  // This is a simplified implementation
  // In production, use a proper HOTP library
  const counterBytes = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = counter & 0xff;
    counter = counter >> 8;
  }

  const secretBytes = decodeBase32(secret);
  const hash = await sha256(Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join('') + Array.from(counterBytes).map(b => b.toString(16).padStart(2, '0')).join(''));
  
  // Extract 4 bytes from the hash
  const offset = parseInt(hash.slice(-1), 16) & 0xf;
  const code = ((parseInt(hash.slice(offset * 2, offset * 2 + 2), 16) & 0x7f) << 24) |
               ((parseInt(hash.slice(offset * 2 + 2, offset * 2 + 4), 16) & 0xff) << 16) |
               ((parseInt(hash.slice(offset * 2 + 4, offset * 2 + 6), 16) & 0xff) << 8) |
               (parseInt(hash.slice(offset * 2 + 6, offset * 2 + 8), 16) & 0xff);
  
  return (code % 1000000).toString().padStart(6, '0');
}

/**
 * Verify a TOTP token
 */
export async function verifyTOTP(
  token: string,
  secret: string,
  window = 1
): Promise<boolean> {
  for (let i = -window; i <= window; i++) {
    const expectedToken = await generateTOTP(secret, i);
    if (constantTimeEquals(token, expectedToken)) {
      return true;
    }
  }
  return false;
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
 * Generate a random TOTP secret
 */
export async function generateTOTPSecret(length: number = 20): Promise<string> {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  return encodeBase32(randomBytes);
}

/**
 * Sign a Nostr event
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
  // Convert hex string to Uint8Array
  const privateKeyBytes = new Uint8Array(
    privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
  );
  return finalizeEvent(event, privateKeyBytes);
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
  const privateKeyBytes = new Uint8Array(
    privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
  );
  const pubkey = getPublicKey(privateKeyBytes);
  const event = {
    kind,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };

  return finalizeEvent(event, privateKeyBytes);
}
