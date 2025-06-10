import * as secp256k1 from "@noble/secp256k1";
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
} from "crypto";
import {
  generatePrivateKey,
  getPublicKey,
  nip19,
  getEventHash,
  signEvent,
} from "nostr-tools";
import * as bip39 from "bip39";
import { HDKey } from "@scure/bip32";

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
 * Generate a secp256k1 key pair for Nostr
 * @param recoveryPhrase - Optional BIP39 mnemonic phrase to derive the key from
 * @param account - Optional account index when using a recovery phrase (default: 0)
 * @returns Nostr key pair with private key, public key, npub, and nsec
 */
export function generateNostrKeyPair(
  recoveryPhrase?: string,
  account: number = 0,
) {
  let privateKey: string;

  if (recoveryPhrase) {
    // Derive private key from recovery phrase using NIP-06 standard
    privateKey = privateKeyFromPhraseWithAccount(recoveryPhrase, account);
  } else {
    // Generate a random private key
    privateKey = generatePrivateKey();
  }

  const publicKey = getPublicKey(privateKey);

  return {
    privateKey,
    publicKey,
    npub: nip19.npubEncode(publicKey),
    nsec: nip19.nsecEncode(privateKey),
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
  account: number = 0,
): string {
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
 * Encrypt data with a password
 */
export function encryptData(data: string, password: string): string {
  const iv = randomBytes(16);
  const salt = randomBytes(16);

  // Use PBKDF2 for secure key derivation
  const key = pbkdf2Sync(password, salt, 100000, 32, "sha256");

  const cipher = createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");

  // Return iv:salt:encrypted
  return iv.toString("hex") + ":" + salt.toString("hex") + ":" + encrypted;
}

/**
 * Decrypt data with a password
 */
export function decryptData(encryptedData: string, password: string): string {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const iv = Buffer.from(parts[0], "hex");
  const salt = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];

  // Use PBKDF2 for secure key derivation (same as in encryption)
  const key = pbkdf2Sync(password, salt, 100000, 32, "sha256");

  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Generate a time-based one-time password (TOTP)
 */
export function generateTOTP(secret: string, window = 0): string {
  const counter = Math.floor(Date.now() / 30000) + window;
  return generateHOTP(secret, counter);
}

/**
 * Generate an HMAC-based one-time password (HOTP)
 * Implementation follows RFC 4226
 */
export function generateHOTP(secret: string, counter: number): string {
  // Convert counter to buffer
  const counterBuffer = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) {
    counterBuffer[7 - i] = counter & 0xff;
    counter = counter >> 8;
  }

  // Create HMAC using SHA-1 as specified in RFC 4226
  // Note: While SHA-1 is generally deprecated, it's still the standard for HOTP
  const hmac = createHash("sha1")
    .update(Buffer.from(secret, "utf-8"))
    .update(counterBuffer)
    .digest();

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
 * Sign a message with a Nostr private key
 * @param event - The Nostr event to sign
 * @param privateKey - The private key to sign with
 * @returns The signed Nostr event
 */
export function signNostrEvent(
  event: { kind: number; pubkey: string; created_at: number; tags: string[][]; content: string },
  privateKey: string
): { id: string; kind: number; pubkey: string; created_at: number; tags: string[][]; content: string; sig: string } {
  // Create a new object with the event properties
  const signedEvent = {
    ...event,
    id: getEventHash(event),
    sig: signEvent(event, privateKey)
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
  privateKey: string,
): { id: string; kind: number; pubkey: string; created_at: number; tags: string[][]; content: string; sig: string } {
  const publicKey = getPublicKey(privateKey);

  const event = {
    kind,
    pubkey: publicKey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };

  return signNostrEvent(event, privateKey);
}
