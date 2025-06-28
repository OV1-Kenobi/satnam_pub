// secp256k1 will be used in future implementations
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-enable @typescript-eslint/no-unused-vars */
// All crypto imports are lazy loaded for better performance
// All crypto operations are now lazy loaded

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
  return lazyGenerateNostrKeyPair(recoveryPhrase, account);
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

  const { encryptData: lazyEncryptData } = await import("./crypto-legacy");
  return lazyEncryptData(data, password);
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

  const { decryptData: lazyDecryptData } = await import("./crypto-legacy");
  return lazyDecryptData(encryptedData, password);
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
  const { deriveKey: lazyDeriveKey } = await import("./crypto-lazy");
  return lazyDeriveKey(password, salt, iterations, keyLength);
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
export async function generateTOTP(
  secret: string,
  window = 0
): Promise<string> {
  const { generateTOTP: lazyGenerateTOTP } = await import("./crypto-lazy");
  return lazyGenerateTOTP(secret, window);
}

/**
 * Generate an HMAC-based one-time password (HOTP)
 * Implementation follows RFC 4226
 * @param secret - The secret key (UTF-8 string or Base32-encoded string)
 * @param counter - The counter value
 * @returns 6-digit HOTP code
 */
export async function generateHOTP(
  secret: string,
  counter: number
): Promise<string> {
  const { generateHOTP: lazyGenerateHOTP } = await import("./crypto-lazy");
  return lazyGenerateHOTP(secret, counter);
}

/**
 * Verify a time-based one-time password (TOTP)
 * @param token - The TOTP code to verify
 * @param secret - The secret key (UTF-8 string or Base32-encoded string)
 * @param window - Time window to check before and after current time (default: 1)
 * @returns Boolean indicating if the token is valid
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
export async function generateTOTPSecret(length: number = 20): Promise<string> {
  const randomHex = await generateRandomHex(length * 2);
  const buffer = Buffer.from(randomHex, "hex");
  return encodeBase32(buffer);
}

/**
 * Sign a message with a Nostr private key
 * @param event - The Nostr event to sign
 * @param privateKey - The private key to sign with
 * @returns The signed Nostr event
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
  const nostrTools = await import("nostr-tools");
  const privateKeyBytes = Buffer.from(privateKey, "hex");
  const signedEvent = nostrTools.finalizeEvent(event, privateKeyBytes) as {
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
  const nostrTools = await import("nostr-tools");
  const publicKey = nostrTools.getPublicKey(Buffer.from(privateKey, "hex"));

  const event = {
    kind,
    pubkey: publicKey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };

  return signNostrEvent(event, privateKey);
}
