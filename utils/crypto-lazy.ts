// Lazy-loaded crypto utilities for bundle size optimization
// File: utils/crypto-lazy.ts

// Note: Node.js crypto functions are imported dynamically to avoid browser compatibility issues

// Type definitions for lazy-loaded modules
type NostrTools = typeof import("nostr-tools");
type Bip39 = typeof import("bip39");
type HDKey = typeof import("@scure/bip32").HDKey;

// Cache for loaded modules to avoid re-importing
const moduleCache = new Map<string, any>();

/**
 * Lazy load nostr-tools module
 */
async function loadNostrTools(): Promise<NostrTools> {
  if (moduleCache.has("nostr-tools")) {
    return moduleCache.get("nostr-tools");
  }

  const { loadNostrCrypto } = await import("./crypto-modules");
  const { nostrTools } = await loadNostrCrypto();
  moduleCache.set("nostr-tools", nostrTools);
  return nostrTools;
}

/**
 * Lazy load bip39 module
 */
async function loadBip39(): Promise<Bip39> {
  if (moduleCache.has("bip39")) {
    return moduleCache.get("bip39");
  }

  const { loadBipCrypto } = await import("./crypto-modules");
  const { bip39 } = await loadBipCrypto();
  moduleCache.set("bip39", bip39);
  return bip39;
}

/**
 * Lazy load HDKey from @scure/bip32
 */
async function loadHDKey(): Promise<{ HDKey: HDKey }> {
  if (moduleCache.has("hdkey")) {
    return moduleCache.get("hdkey");
  }

  const { loadBipCrypto } = await import("./crypto-modules");
  const { HDKey } = await loadBipCrypto();
  const hdkeyModule = { HDKey };
  moduleCache.set("hdkey", hdkeyModule);
  return hdkeyModule;
}

// Lightweight crypto utilities that don't require heavy dependencies
// These are always available without lazy loading

/**
 * Generate a random hex string of specified length
 */
export async function generateRandomHex(length: number): Promise<string> {
  // Use Web Crypto API in browser, Node.js crypto in server
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    window.crypto.getRandomValues
  ) {
    // Browser environment
    const bytes = new Uint8Array(Math.ceil(length / 2));
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, length);
  } else if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node
  ) {
    // Node.js environment - use dynamic import to avoid bundling issues
    try {
      const crypto = await import("crypto");
      return crypto
        .randomBytes(Math.ceil(length / 2))
        .toString("hex")
        .slice(0, length);
    } catch (_error) {
      throw new Error("Node.js crypto module not available");
    }
  } else {
    throw new Error("No secure random number generator available");
  }
}

/**
 * Generate a secure token for session management
 */
export async function generateSecureToken(
  length: number = 64
): Promise<string> {
  // Use Web Crypto API in browser, Node.js crypto in server
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    window.crypto.getRandomValues
  ) {
    // Browser environment
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);
    // Convert to base64url manually since btoa might not be available in all environments
    if (typeof btoa === "undefined") {
      // Manual base64 encoding for environments without btoa
      return Buffer.from(bytes)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
    }
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  } else if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node
  ) {
    // Node.js environment - use dynamic import to avoid bundling issues
    try {
      const crypto = await import("crypto");
      return crypto.randomBytes(length).toString("base64url");
    } catch (_error) {
      throw new Error("Node.js crypto module not available");
    }
  } else {
    throw new Error("No secure random number generator available");
  }
}

/**
 * Hash a string using SHA-256
 */
export async function sha256(data: string): Promise<string> {
  // Use Web Crypto API in browser, Node.js crypto in server
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    // Browser environment
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } else if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node
  ) {
    // Node.js environment - use dynamic import to avoid bundling issues
    try {
      const crypto = await import("crypto");
      return crypto.createHash("sha256").update(data).digest("hex");
    } catch (_error) {
      throw new Error("Node.js crypto module not available");
    }
  } else {
    throw new Error("No crypto implementation available");
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
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

// Lazy-loaded crypto utilities
// These functions dynamically import heavy dependencies only when needed

/**
 * Generate a secp256k1 key pair for Nostr (lazy-loaded)
 * @param recoveryPhrase - Optional BIP39 mnemonic phrase to derive the key from
 * @param account - Optional account index when using a recovery phrase (default: 0)
 * @returns Promise<Nostr key pair with private key, public key, npub, and nsec>
 */
export async function generateNostrKeyPair(
  recoveryPhrase?: string,
  account: number = 0
) {
  const nostrTools = await loadNostrTools();

  let privateKeyBytes: Uint8Array;

  if (recoveryPhrase) {
    // Derive private key from recovery phrase using NIP-06 standard
    const derivedKey = await privateKeyFromPhraseWithAccount(
      recoveryPhrase,
      account
    );
    privateKeyBytes =
      typeof derivedKey === "string"
        ? Buffer.from(derivedKey, "hex")
        : derivedKey;
  } else {
    // Generate a random private key
    privateKeyBytes = nostrTools.generateSecretKey();
  }

  const privateKey = Buffer.from(privateKeyBytes).toString("hex");
  const publicKey = nostrTools.getPublicKey(privateKeyBytes);

  return {
    privateKey,
    publicKey,
    npub: nostrTools.nip19.npubEncode(publicKey),
    nsec: nostrTools.nip19.nsecEncode(privateKeyBytes),
  };
}

/**
 * Generate a recovery phrase (mnemonic) for a private key (lazy-loaded)
 */
export async function generateRecoveryPhrase(): Promise<string> {
  const bip39 = await loadBip39();
  return bip39.generateMnemonic();
}

/**
 * Derive a private key from a recovery phrase following NIP-06 standard (lazy-loaded)
 * Uses the derivation path m/44'/1237'/0'/0/0 as specified in NIP-06
 */
export async function privateKeyFromPhrase(phrase: string): Promise<string> {
  // Validate the mnemonic phrase
  if (!phrase || typeof phrase !== "string") {
    throw new Error("Invalid mnemonic phrase: must be a non-empty string");
  }

  const bip39 = await loadBip39();
  const { HDKey } = await loadHDKey();

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
 * Derive a private key from a recovery phrase with a specific account index (lazy-loaded)
 * Follows NIP-06 standard with customizable account
 * @param phrase - BIP39 mnemonic phrase
 * @param account - Account index (default: 0)
 * @returns Promise<Hex-encoded private key>
 */
export async function privateKeyFromPhraseWithAccount(
  phrase: string,
  account: number = 0
): Promise<string> {
  // Validate the mnemonic phrase
  if (!phrase || typeof phrase !== "string") {
    throw new Error("Invalid mnemonic phrase: must be a non-empty string");
  }

  const bip39 = await loadBip39();
  const { HDKey } = await loadHDKey();

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
 * Generate a time-based one-time password (TOTP) (lazy-loaded)
 * @param secret - The secret key (UTF-8 string or Base32-encoded string)
 * @param window - Time window offset (default: 0)
 * @returns Promise<6-digit TOTP code>
 */
export async function generateTOTP(
  secret: string,
  window = 0
): Promise<string> {
  const counter = Math.floor(Date.now() / 30000) + window;
  return generateHOTP(secret, counter);
}

/**
 * Generate an HMAC-based one-time password (HOTP)
 * Implementation follows RFC 4226
 * @param secret - The secret key (UTF-8 string or Base32-encoded string)
 * @param counter - The counter value
 * @returns Promise<6-digit HOTP code>
 */
export async function generateHOTP(
  secret: string,
  counter: number
): Promise<string> {
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
  let hmac: Buffer;

  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    // Browser environment - use Web Crypto API
    const key = await window.crypto.subtle.importKey(
      "raw",
      secretBuffer,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );
    const signature = await window.crypto.subtle.sign(
      "HMAC",
      key,
      counterBuffer
    );
    hmac = Buffer.from(signature);
  } else if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node
  ) {
    // Node.js environment - use dynamic import to avoid bundling issues
    try {
      const crypto = await import("crypto");
      hmac = crypto
        .createHmac("sha1", secretBuffer)
        .update(counterBuffer)
        .digest();
    } catch (_error) {
      throw new Error("Node.js crypto module not available");
    }
  } else {
    throw new Error("No HMAC implementation available");
  }

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

// Re-export legacy encryption functions with deprecation warnings
// These will be loaded from the original crypto.ts file when needed

/**
 * @deprecated Use encryptCredentials from lib/security.ts for Gold Standard encryption
 * Lazy-loaded legacy encryption function
 */
export async function encryptData(
  data: string,
  password: string
): Promise<string> {
  console.warn(
    "⚠️  SECURITY WARNING: Using legacy encryptData(). Please use encryptCredentials() from lib/security.ts for Gold Standard Argon2id encryption"
  );

  // Dynamically import the legacy function
  const { encryptData: legacyEncryptData } = await import("./crypto");
  return legacyEncryptData(data, password);
}

/**
 * @deprecated Use decryptCredentials from lib/security.ts for Gold Standard decryption
 * Lazy-loaded legacy decryption function
 */
export async function decryptData(
  encryptedData: string,
  password: string
): Promise<string> {
  console.warn(
    "⚠️  SECURITY WARNING: Using legacy decryptData(). Please use decryptCredentials() from lib/security.ts for Gold Standard Argon2id decryption"
  );

  // Dynamically import the legacy function
  const { decryptData: legacyDecryptData } = await import("./crypto");
  return legacyDecryptData(encryptedData, password);
}

/**
 * Lazy-loaded key derivation function
 */
export async function deriveKey(
  password: string,
  salt: string | Buffer,
  iterations: number = 100000,
  keyLength: number = 32
): Promise<Buffer> {
  // Dynamically import the legacy function
  const { deriveKey: legacyDeriveKey } = await import("./crypto");
  return legacyDeriveKey(password, salt, iterations, keyLength);
}

// Utility function to preload crypto modules for better UX
export async function preloadCryptoModules(): Promise<void> {
  try {
    // Preload crypto modules in parallel for better performance
    const { loadNostrCrypto, loadBipCrypto, loadHashCrypto } = await import(
      "./crypto-modules"
    );

    await Promise.all([loadNostrCrypto(), loadBipCrypto(), loadHashCrypto()]);

    console.log("✅ Crypto modules preloaded successfully");
  } catch (error) {
    console.warn("⚠️ Failed to preload some crypto modules:", error);
  }
}

// Export module loading functions for advanced use cases
export const cryptoModuleLoaders = {
  loadNostrTools,
  loadBip39,
  loadHDKey,
  preloadCryptoModules,
};
