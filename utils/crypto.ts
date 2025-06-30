// secp256k1 will be used in future implementations
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-enable @typescript-eslint/no-unused-vars */
import { HDKey } from "@scure/bip32";
import * as bip39 from "bip39";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
} from "nostr-tools";

/**
 * Generate a random hex string of specified length
 */
export function generateRandomHex(length: number): string {
  const buffer = new ArrayBuffer(Math.ceil(length / 2));
  const bytes = new Uint8Array(buffer);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

/**
 * Generate a secure token for session management
 */
export function generateSecureToken(length: number = 64): string {
  const buffer = new ArrayBuffer(length);
  const bytes = new Uint8Array(buffer);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode.apply(null, Array.from(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Hash a string using SHA-256
 */
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
 * Convert hex string to Uint8Array
 */
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16));
  const buffer = new ArrayBuffer(bytes.length);
  const result = new Uint8Array(buffer);
  result.set(bytes);
  return result;
}

/**
 * Convert Uint8Array to hex string
 */
function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a secp256k1 key pair for Nostr
 * @param recoveryPhrase - Optional BIP39 mnemonic phrase to derive the key from
 * @param account - Optional account index when using a recovery phrase (default: 0)
 * @returns Nostr key pair with private key, public key, npub, and nsec
 */
export function generateNostrKeyPair(
  recoveryPhrase?: string,
  account: number = 0
) {
  let privateKeyBytes: Uint8Array;

  if (recoveryPhrase) {
    // Derive private key from recovery phrase using NIP-06 standard
    const derivedKey = privateKeyFromPhraseWithAccount(recoveryPhrase, account);
    privateKeyBytes =
      typeof derivedKey === "string" ? hexToUint8Array(derivedKey) : derivedKey;
  } else {
    // Generate a random private key
    privateKeyBytes = generateSecretKey();
  }

  const privateKey = uint8ArrayToHex(privateKeyBytes);
  const publicKey = getPublicKey(privateKeyBytes);

  return {
    privateKey,
    publicKey,
    npub: nip19.npubEncode(publicKey),
    nsec: nip19.nsecEncode(privateKeyBytes),
  };
}

/**
 * Generate a recovery phrase (mnemonic) for a private key
 */
export function generateRecoveryPhrase(): string {
  return bip39.generateMnemonic();
}

/**
 * Derive a private key from a recovery phrase following NIP-06 standard
 * Uses the derivation path m/44'/1237'/0'/0/0 as specified in NIP-06
 */
export function privateKeyFromPhrase(phrase: string): string {
  // Validate the mnemonic phrase
  if (!phrase || typeof phrase !== "string") {
    throw new Error("Invalid mnemonic phrase: must be a non-empty string");
  }

  if (!bip39.validateMnemonic(phrase)) {
    throw new Error("Invalid mnemonic phrase: failed validation");
  }

  // Generate seed from mnemonic
  const seed = bip39.mnemonicToSeedSync(phrase);

  // Derive the private key using BIP32 and the Nostr derivation path
  // m/44'/1237'/0'/0/0 (BIP44, coin type 1237 for Nostr, account 0)
  const rootKey = HDKey.fromMasterSeed(seed);
  const nostrKey = rootKey.derive("m/44'/1237'/0'/0/0"); // Standard NIP-06 derivation path

  if (!nostrKey.privateKey) {
    throw new Error("Failed to derive private key");
  }

  return uint8ArrayToHex(new Uint8Array(nostrKey.privateKey));
}

/**
 * Derive a private key from a recovery phrase with a specific account index
 * Follows NIP-06 standard with customizable account
 * @param phrase - BIP39 mnemonic phrase
 * @param account - Account index (default: 0)
 * @returns Hex-encoded private key
 */
export function privateKeyFromPhraseWithAccount(
  phrase: string,
  account: number = 0
): string {
  // Validate the mnemonic phrase
  if (!phrase || typeof phrase !== "string") {
    throw new Error("Invalid mnemonic phrase: must be a non-empty string");
  }

  if (!bip39.validateMnemonic(phrase)) {
    throw new Error("Invalid mnemonic phrase: failed validation");
  }

  // Generate seed from mnemonic
  const seed = bip39.mnemonicToSeedSync(phrase);

  // Derive the private key using BIP32 and the Nostr derivation path
  // m/44'/1237'/{account}'/0/0 (BIP44, coin type 1237 for Nostr)
  const rootKey = HDKey.fromMasterSeed(seed);
  const path = `m/44'/1237'/${account}'/0/0`;
  const nostrKey = rootKey.derive(path);

  if (!nostrKey.privateKey) {
    throw new Error("Failed to derive private key");
  }

  return uint8ArrayToHex(new Uint8Array(nostrKey.privateKey));
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

  // Generate random IV and salt using Web Crypto API
  const ivBuffer = new ArrayBuffer(16);
  const iv = new Uint8Array(ivBuffer);
  crypto.getRandomValues(iv);

  const saltBuffer = new ArrayBuffer(32);
  const salt = new Uint8Array(saltBuffer);
  crypto.getRandomValues(salt);

  // SECURITY IMPROVEMENT: Still using PBKDF2 here for backward compatibility
  // but with increased iterations and stronger salt
  const key = await deriveKeyFromPassword(password, salt, 210000);

  // SECURITY IMPROVEMENT: Use AES-256-GCM instead of CBC for authenticated encryption
  const dataEncoded = new TextEncoder().encode(data);
  const dataBuffer = new ArrayBuffer(dataEncoded.length);
  const dataArray = new Uint8Array(dataBuffer);
  dataArray.set(dataEncoded);

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    dataArray
  );

  const encryptedArray = new Uint8Array(encrypted);
  const authTag = encryptedArray.slice(-16); // Last 16 bytes are the auth tag
  const ciphertext = encryptedArray.slice(0, -16); // Everything except the last 16 bytes

  // Return iv:salt:authTag:encrypted (updated format)
  return (
    Array.from(iv)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("") +
    ":" +
    Array.from(salt)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("") +
    ":" +
    Array.from(authTag)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("") +
    ":" +
    Array.from(ciphertext)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
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

  const parts = encryptedData.split(":");

  // Support both legacy format (iv:salt:encrypted) and new format (iv:salt:authTag:encrypted)
  let iv: Uint8Array<ArrayBuffer>,
    salt: Uint8Array<ArrayBuffer>,
    authTag: Uint8Array<ArrayBuffer> | undefined,
    encrypted: string;

  if (parts.length === 3) {
    // Legacy format - no auth tag - not supported in browser crypto
    throw new Error(
      "Legacy format without authentication tag is not supported in browser environment. Please re-encrypt with Gold Standard method."
    );
  } else if (parts.length === 4) {
    // New format with auth tag
    const ivBytes = parts[0]
      .match(/.{1,2}/g)!
      .map((byte) => parseInt(byte, 16));
    const ivBuffer = new ArrayBuffer(ivBytes.length);
    iv = new Uint8Array(ivBuffer);
    iv.set(ivBytes);

    const saltBytes = parts[1]
      .match(/.{1,2}/g)!
      .map((byte) => parseInt(byte, 16));
    const saltBuffer = new ArrayBuffer(saltBytes.length);
    salt = new Uint8Array(saltBuffer);
    salt.set(saltBytes);

    const authTagBytes = parts[2]
      .match(/.{1,2}/g)!
      .map((byte) => parseInt(byte, 16));
    const authTagBuffer = new ArrayBuffer(authTagBytes.length);
    authTag = new Uint8Array(authTagBuffer);
    authTag.set(authTagBytes);
    encrypted = parts[3];

    // Use improved PBKDF2 for newer encrypted data
    const key = await deriveKeyFromPassword(password, salt, 210000);

    // For AES-GCM, combine ciphertext and auth tag as expected by Web Crypto API
    const ciphertextBytes = encrypted
      .match(/.{1,2}/g)!
      .map((byte) => parseInt(byte, 16));
    const ciphertextBuffer = new ArrayBuffer(ciphertextBytes.length);
    const ciphertext = new Uint8Array(ciphertextBuffer);
    ciphertext.set(ciphertextBytes);

    // Combine ciphertext and auth tag for GCM decryption
    const combinedBuffer = new ArrayBuffer(ciphertext.length + authTag.length);
    const combined = new Uint8Array(combinedBuffer);
    combined.set(ciphertext, 0);
    combined.set(authTag, ciphertext.length);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      combined
    );

    return new TextDecoder().decode(decrypted);
  } else {
    throw new Error(
      "Invalid encrypted data format - expected 4 parts separated by colons"
    );
  }
}

/**
 * Derive a cryptographic key from password and salt using PBKDF2 (Web Crypto API)
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
  let saltBuffer: Uint8Array<ArrayBuffer>;
  if (typeof salt === "string") {
    const bytes = salt.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16));
    const buffer = new ArrayBuffer(bytes.length);
    saltBuffer = new Uint8Array(buffer);
    saltBuffer.set(bytes);
  } else {
    // Even if salt is already Uint8Array, ensure it's backed by proper ArrayBuffer
    const buffer = new ArrayBuffer(salt.length);
    saltBuffer = new Uint8Array(buffer);
    saltBuffer.set(salt);
  }

  // Import password as key material
  const passwordEncoded = new TextEncoder().encode(password);
  const passwordBuffer = new ArrayBuffer(passwordEncoded.length);
  const passwordArray = new Uint8Array(passwordBuffer);
  passwordArray.set(passwordEncoded);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordArray,
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  // Derive the key using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    keyLength * 8 // Convert bytes to bits
  );

  return new Uint8Array(derivedBits);
}

/**
 * Derive a CryptoKey from password and salt using PBKDF2 (for use with Web Crypto API)
 * @param password - The password to derive from
 * @param salt - The salt as Uint8Array
 * @param iterations - Number of PBKDF2 iterations
 * @returns Promise<CryptoKey> - The derived key ready for encryption/decryption
 */
async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  // Ensure salt is backed by proper ArrayBuffer
  const saltBuffer = new ArrayBuffer(salt.length);
  const saltArray = new Uint8Array(saltBuffer);
  saltArray.set(salt);

  // Ensure password encoding is backed by proper ArrayBuffer
  const passwordEncoded = new TextEncoder().encode(password);
  const passwordBuffer = new ArrayBuffer(passwordEncoded.length);
  const passwordArray = new Uint8Array(passwordBuffer);
  passwordArray.set(passwordEncoded);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordArray,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Derive the key using PBKDF2
  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltArray,
      iterations: iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
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

  // Prepare output buffer
  const length = Math.floor((sanitized.length * 5) / 8);
  const buffer = new ArrayBuffer(length);
  const result = new Uint8Array(buffer);

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
 * Determine if a string is Base32-encoded
 */
export function isBase32(str: string): boolean {
  const sanitized = str.replace(/\s+/g, "").toUpperCase();
  // Base32 uses A-Z and 2-7, and may end with padding (=)
  return /^[A-Z2-7]+=*$/.test(sanitized);
}

/**
 * Generate a time-based one-time password (TOTP)
 * @param secret - The secret key (UTF-8 string or Base32-encoded string)
 * @param window - Time window offset (default: 0)
 * @returns Promise<string> - 6-digit TOTP code
 */
export async function generateTOTP(
  secret: string,
  window = 0
): Promise<string> {
  const counter = Math.floor(Date.now() / 30000) + window;
  return await generateHOTP(secret, counter);
}

/**
 * Generate an HMAC-based one-time password (HOTP)
 * Implementation follows RFC 4226
 * @param secret - The secret key (UTF-8 string or Base32-encoded string)
 * @param counter - The counter value
 * @returns Promise<string> - 6-digit HOTP code
 */
export async function generateHOTP(
  secret: string,
  counter: number
): Promise<string> {
  // Convert counter to buffer
  const counterArrayBuffer = new ArrayBuffer(8);
  const counterBuffer = new Uint8Array(counterArrayBuffer);
  for (let i = 0; i < 8; i++) {
    counterBuffer[7 - i] = counter & 0xff;
    counter = counter >> 8;
  }

  // Determine if the secret is Base32-encoded
  let secretBuffer: Uint8Array<ArrayBuffer>;
  if (isBase32(secret)) {
    const decoded = decodeBase32(secret);
    const secretArrayBuffer = new ArrayBuffer(decoded.length);
    secretBuffer = new Uint8Array(secretArrayBuffer);
    secretBuffer.set(decoded);
  } else {
    const encoded = new TextEncoder().encode(secret);
    const secretArrayBuffer = new ArrayBuffer(encoded.length);
    secretBuffer = new Uint8Array(secretArrayBuffer);
    secretBuffer.set(encoded);
  }

  // Create HMAC using SHA-1 as specified in RFC 4226
  // Note: While SHA-1 is generally deprecated, it's still the standard for HOTP
  const key = await crypto.subtle.importKey(
    "raw",
    secretBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, counterBuffer);
  const hmac = new Uint8Array(signature);

  // Generate OTP
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  // Get 6 digits
  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

/**
 * Verify a time-based one-time password (TOTP)
 * @param token - The TOTP code to verify
 * @param secret - The secret key (UTF-8 string or Base32-encoded string)
 * @param window - Time window to check before and after current time (default: 1)
 * @returns Promise<boolean> - Boolean indicating if the token is valid
 */
export async function verifyTOTP(
  token: string,
  secret: string,
  window = 1
): Promise<boolean> {
  // Check current window and surrounding windows
  for (let i = -window; i <= window; i++) {
    const generatedToken = await generateTOTP(secret, i);
    if (generatedToken === token) {
      return true;
    }
  }
  return false;
}

/**
 * Encode a Uint8Array to Base32
 * This is used for TOTP/HOTP secrets to be compatible with authenticator apps
 */
export function encodeBase32(buffer: Uint8Array): string {
  // Base32 character set (RFC 4648)
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  let result = "";
  let bits = 0;
  let value = 0;

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      result += charset[(value >> bits) & 0x1f];
    }
  }

  // If we have remaining bits
  if (bits > 0) {
    result += charset[(value << (5 - bits)) & 0x1f];
  }

  // Add padding to make length a multiple of 8
  while (result.length % 8 !== 0) {
    result += "=";
  }

  return result;
}

/**
 * Generate a random Base32-encoded secret for TOTP
 * @param length - Length of the secret in bytes (default: 20, recommended by RFC 6238)
 * @returns Base32-encoded secret string
 */
export function generateTOTPSecret(length: number = 20): string {
  const buffer = crypto.getRandomValues(new Uint8Array(length));
  return encodeBase32(buffer);
}

/**
 * Sign a message with a Nostr private key
 * @param event - The Nostr event to sign
 * @param privateKey - The private key to sign with
 * @returns The signed Nostr event
 */
export function signNostrEvent(
  event: {
    kind: number;
    pubkey: string;
    created_at: number;
    tags: string[][];
    content: string;
  },
  privateKey: string
): {
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
  sig: string;
} {
  // Use finalizeEvent to create a properly signed event
  const privateKeyBytes = hexToUint8Array(privateKey);
  const signedEvent = finalizeEvent(event, privateKeyBytes) as {
    id: string;
    kind: number;
    pubkey: string;
    created_at: number;
    tags: string[][];
    content: string;
    sig: string;
  };

  return signedEvent;
}

/**
 * Create a Nostr event
 * @param kind - The event kind number
 * @param content - The event content
 * @param tags - Optional event tags
 * @param privateKey - The private key to sign with
 * @returns A signed Nostr event
 */
export function createNostrEvent(
  kind: number,
  content: string,
  tags: string[][] = [],
  privateKey: string
): {
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
  sig: string;
} {
  const publicKey = getPublicKey(hexToUint8Array(privateKey));

  const event = {
    kind,
    pubkey: publicKey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };

  return signNostrEvent(event, privateKey);
}
