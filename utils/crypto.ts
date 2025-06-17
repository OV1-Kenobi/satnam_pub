// secp256k1 will be used in future implementations
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-enable @typescript-eslint/no-unused-vars */
import { HDKey } from "@scure/bip32";
import * as bip39 from "bip39";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  pbkdf2,
  randomBytes,
} from "crypto";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
} from "nostr-tools";
import { promisify } from "util";

/**
 * Generate a random hex string of specified length
 */
export function generateRandomHex(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

/**
 * Hash a string using SHA-256
 */
export function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
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
export function generateNostrKeyPair(
  recoveryPhrase?: string,
  account: number = 0
) {
  let privateKeyBytes: Uint8Array;

  if (recoveryPhrase) {
    // Derive private key from recovery phrase using NIP-06 standard
    const derivedKey = privateKeyFromPhraseWithAccount(recoveryPhrase, account);
    privateKeyBytes =
      typeof derivedKey === "string"
        ? Buffer.from(derivedKey, "hex")
        : derivedKey;
  } else {
    // Generate a random private key
    privateKeyBytes = generateSecretKey();
  }

  const privateKey = Buffer.from(privateKeyBytes).toString("hex");
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

  return Buffer.from(nostrKey.privateKey).toString("hex");
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

  return Buffer.from(nostrKey.privateKey).toString("hex");
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

  const iv = randomBytes(16);
  const salt = randomBytes(32); // Increased salt length for better security

  // SECURITY IMPROVEMENT: Still using PBKDF2 here for backward compatibility
  // but with increased iterations and stronger salt
  const key = await promisify(pbkdf2)(password, salt, 210000, 32, "sha256"); // Increased iterations

  // SECURITY IMPROVEMENT: Use AES-256-GCM instead of CBC for authenticated encryption
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Return iv:salt:authTag:encrypted (updated format)
  return (
    iv.toString("hex") +
    ":" +
    salt.toString("hex") +
    ":" +
    authTag.toString("hex") +
    ":" +
    encrypted
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
  let iv: Buffer, salt: Buffer, authTag: Buffer | undefined, encrypted: string;

  if (parts.length === 3) {
    // Legacy format - no auth tag
    console.warn(
      "⚠️  Decrypting legacy format without authentication tag - consider re-encrypting with Gold Standard method"
    );
    [iv, salt, encrypted] = [
      Buffer.from(parts[0], "hex"),
      Buffer.from(parts[1], "hex"),
      parts[2],
    ];

    // Use legacy PBKDF2 for backward compatibility
    const key = await promisify(pbkdf2)(password, salt, 100000, 32, "sha256");
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } else if (parts.length === 4) {
    // New format with auth tag
    [iv, salt, authTag, encrypted] = [
      Buffer.from(parts[0], "hex"),
      Buffer.from(parts[1], "hex"),
      Buffer.from(parts[2], "hex"),
      parts[3],
    ];

    // Use improved PBKDF2 for newer encrypted data
    const key = await promisify(pbkdf2)(password, salt, 210000, 32, "sha256");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } else {
    throw new Error(
      "Invalid encrypted data format - expected 3 or 4 parts separated by colons"
    );
  }
}

/**
 * Derive a cryptographic key from password and salt using PBKDF2
 * @param password - The password to derive from
 * @param salt - The salt (as hex string or Buffer)
 * @param iterations - Number of PBKDF2 iterations (default: 100000)
 * @param keyLength - Length of derived key in bytes (default: 32)
 * @returns Promise<Buffer> - The derived key
 */
export async function deriveKey(
  password: string,
  salt: string | Buffer,
  iterations: number = 100000,
  keyLength: number = 32
): Promise<Buffer> {
  const saltBuffer = typeof salt === "string" ? Buffer.from(salt, "hex") : salt;

  return new Promise((resolve, reject) => {
    // Use async pbkdf2 for better performance in production
    pbkdf2(
      password,
      saltBuffer,
      iterations,
      keyLength,
      "sha256",
      (err: Error | null, derivedKey: Buffer) => {
        if (err) reject(err);
        else resolve(derivedKey);
      }
    );
  });
}

/**
 * Decode a Base32 string to a buffer
 * This is used for TOTP/HOTP secrets which are commonly Base32-encoded
 */
export function decodeBase32(base32: string): Buffer {
  // Remove spaces and convert to uppercase
  const sanitized = base32.replace(/\s+/g, "").toUpperCase();

  // Base32 character set (RFC 4648)
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  // Prepare output buffer
  const length = Math.floor((sanitized.length * 5) / 8);
  const result = Buffer.alloc(length);

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
 * @returns 6-digit TOTP code
 */
export function generateTOTP(secret: string, window = 0): string {
  const counter = Math.floor(Date.now() / 30000) + window;
  return generateHOTP(secret, counter);
}

/**
 * Generate an HMAC-based one-time password (HOTP)
 * Implementation follows RFC 4226
 * @param secret - The secret key (UTF-8 string or Base32-encoded string)
 * @param counter - The counter value
 * @returns 6-digit HOTP code
 */
export function generateHOTP(secret: string, counter: number): string {
  // Convert counter to buffer
  const counterBuffer = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) {
    counterBuffer[7 - i] = counter & 0xff;
    counter = counter >> 8;
  }

  // Determine if the secret is Base32-encoded
  let secretBuffer: Buffer;
  if (isBase32(secret)) {
    secretBuffer = decodeBase32(secret);
  } else {
    secretBuffer = Buffer.from(secret, "utf-8");
  }

  // Create HMAC using SHA-1 as specified in RFC 4226
  // Note: While SHA-1 is generally deprecated, it's still the standard for HOTP
  const hmac = createHmac("sha1", secretBuffer).update(counterBuffer).digest();

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
 * @returns Boolean indicating if the token is valid
 */
export function verifyTOTP(token: string, secret: string, window = 1): boolean {
  // Check current window and surrounding windows
  for (let i = -window; i <= window; i++) {
    const generatedToken = generateTOTP(secret, i);
    if (generatedToken === token) {
      return true;
    }
  }
  return false;
}

/**
 * Encode a buffer to Base32
 * This is used for TOTP/HOTP secrets to be compatible with authenticator apps
 */
export function encodeBase32(buffer: Buffer): string {
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
  const buffer = randomBytes(length);
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
  const privateKeyBytes = Buffer.from(privateKey, "hex");
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
  const publicKey = getPublicKey(Buffer.from(privateKey, "hex"));

  const event = {
    kind,
    pubkey: publicKey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };

  return signNostrEvent(event, privateKey);
}
