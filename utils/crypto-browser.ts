// utils/crypto-browser.ts
// Browser-compatible crypto utilities using Web Crypto API
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
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

/**
 * Generate a secure token for session management
 */
export function generateSecureToken(length: number = 64): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return btoa(String.fromCharCode(...bytes))
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
        ? new Uint8Array(Buffer.from(derivedKey, "hex"))
        : derivedKey;
  } else {
    // Generate a random private key
    privateKeyBytes = generateSecretKey();
  }

  const privateKey = Array.from(privateKeyBytes, (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
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

  return Array.from(nostrKey.privateKey, (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
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

  return Array.from(nostrKey.privateKey, (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Encrypt data with a password using Web Crypto API
 */
export async function encryptData(
  data: string,
  password: string
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyBuffer = new TextEncoder().encode(password);
  const importedKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
    importedKey,
    256
  );
  const key = await crypto.subtle.importKey(
    "raw",
    derivedBits,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dataBuffer = new TextEncoder().encode(data);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    dataBuffer
  );

  const ivHex = Array.from(iv, (b) => b.toString(16).padStart(2, "0")).join("");
  const saltHex = Array.from(salt, (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );
  const encryptedHex = Array.from(new Uint8Array(encrypted), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");

  return `${ivHex}:${saltHex}:${encryptedHex}`;
}

/**
 * Decrypt data with a password using Web Crypto API
 */
export async function decryptData(
  encryptedData: string,
  password: string
): Promise<string> {
  try {
    const [ivHex, saltHex, encryptedHex] = encryptedData.split(":");
    const iv = new Uint8Array(
      ivHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );
    const salt = new Uint8Array(
      saltHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );
    const encrypted = new Uint8Array(
      encryptedHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    const keyBuffer = new TextEncoder().encode(password);
    const importedKey = await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const derivedBits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
      importedKey,
      256
    );
    const key = await crypto.subtle.importKey(
      "raw",
      derivedBits,
      "AES-GCM",
      false,
      ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error(
      "Failed to decrypt data - invalid password or corrupted data"
    );
  }
}

/**
 * Sign a Nostr event with a private key
 */
export function signNostrEvent(event: any, privateKey: string) {
  const privateKeyBytes = new Uint8Array(
    privateKey.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );
  return finalizeEvent(event, privateKeyBytes);
}

/**
 * Validate a Nostr private key
 */
export function validateNostrPrivateKey(privateKey: string): boolean {
  try {
    if (privateKey.length !== 64) return false;
    const bytes = new Uint8Array(
      privateKey.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );
    if (bytes.length !== 32) return false;

    // Try to get public key to validate
    const publicKey = getPublicKey(bytes);
    return publicKey.length === 64;
  } catch {
    return false;
  }
}

/**
 * Validate a Nostr public key
 */
export function validateNostrPublicKey(publicKey: string): boolean {
  try {
    return publicKey.length === 64 && /^[0-9a-fA-F]+$/.test(publicKey);
  } catch {
    return false;
  }
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToUint8Array(hex: string): Uint8Array {
  return new Uint8Array(
    hex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );
}

/**
 * Convert Uint8Array to hex string
 */
export function uint8ArrayToHex(array: Uint8Array): string {
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}
