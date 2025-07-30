const CryptoJS = require("crypto-js");
import { bytesToHex } from "@noble/hashes/utils";
import { getPublicKey, utils } from "@noble/secp256k1";

// Import proper NIP-19 encoding functions from nostr-tools
import { bech32 } from "@scure/base";
import { nip19 } from "nostr-tools";

export class CryptoLazy {
  private static instance: CryptoLazy;

  static getInstance(): CryptoLazy {
    if (!CryptoLazy.instance) {
      CryptoLazy.instance = new CryptoLazy();
    }
    return CryptoLazy.instance;
  }

  // Replace line 294 Node.js crypto import
  async generateNostrKeys(): Promise<{ nsec: string; npub: string }> {
    const privateKeyBytes = utils.randomPrivateKey();
    const publicKey = getPublicKey(privateKeyBytes);
    const publicKeyHex = bytesToHex(publicKey);

    // Use proper NIP-19 bech32 encoding
    // npubEncode expects 64-char hex (without compression prefix), nsecEncode expects Uint8Array
    const publicKeyWithoutPrefix = publicKeyHex.slice(2); // Remove "02"/"03" compression prefix

    return {
      nsec: nip19.nsecEncode(privateKeyBytes as any),
      npub: nip19.npubEncode(publicKeyWithoutPrefix),
    };
  }

  // Browser-compatible password hashing
  async hashPassword(password: string, salt?: string): Promise<string> {
    const saltToUse = salt || CryptoJS.lib.WordArray.random(128 / 8).toString();
    return CryptoJS.PBKDF2(password, saltToUse, {
      keySize: 256 / 32,
      iterations: 10000,
    }).toString();
  }

  // Browser-compatible encryption
  async encryptData(data: string, key: string): Promise<string> {
    return CryptoJS.AES.encrypt(data, key).toString();
  }

  async decryptData(encryptedData: string, key: string): Promise<string> {
    const bytes = CryptoJS.AES.decrypt(encryptedData, key);
    return bytes.toString(CryptoJS.enc.Utf8);
  }
}

// Browser-compatible random hex generator
export async function generateRandomHex(length: number): Promise<string> {
  const array = new Uint8Array(length / 2);
  window.crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

// Browser-compatible secure token generator
export async function generateSecureToken(
  length: number = 64
): Promise<string> {
  return generateRandomHex(length);
}

// Browser-compatible SHA-256 hash
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", dataBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Browser-compatible Nostr key pair generator
export async function generateNostrKeyPair(): Promise<{
  privateKey: string;
  publicKey: string;
  npub: string;
  nsec: string;
}> {
  console.log(
    "🔍 CRYPTO-LAZY generateNostrKeyPair called - USING DIRECT BECH32!"
  );

  const privateKeyBytes = utils.randomPrivateKey();
  const privateKey = bytesToHex(privateKeyBytes);
  // Force compressed public key generation (33 bytes, starts with 0x02/0x03)
  const publicKeyBytes = (getPublicKey as any)(privateKeyBytes, true);
  const publicKeyHex = bytesToHex(publicKeyBytes);

  // Use direct bech32 encoding: extract x-coordinate (32 bytes)
  const publicKeyXCoordinate = publicKeyBytes.slice(1); // Remove compression prefix byte

  console.log("🔍 CRYPTO-LAZY direct bech32 encoding:", {
    originalHex: publicKeyHex,
    bytesLength: publicKeyBytes.length,
    xCoordinateLength: publicKeyXCoordinate.length,
    expectedXCoordinateLength: 32,
  });

  const npub = bech32.encodeFromBytes("npub", publicKeyXCoordinate);
  const nsec = nip19.nsecEncode(privateKeyBytes as any);

  console.log("🔍 CRYPTO-LAZY direct bech32 result:", {
    npubLength: npub.length,
    nsecLength: nsec.length,
    npubValid: npub.length === 63 && npub.startsWith("npub1"),
  });

  return {
    privateKey,
    publicKey: publicKeyHex,
    npub,
    nsec,
  };
}

// Browser-compatible recovery phrase generator (mock, not BIP39)
export async function generateRecoveryPhrase(): Promise<string> {
  // In production, use a BIP39 library
  return Array(12)
    .fill(0)
    .map(() => Math.random().toString(36).slice(2, 8))
    .join(" ");
}

// Browser-compatible private key from phrase (mock, not BIP39)
export async function privateKeyFromPhrase(phrase: string): Promise<string> {
  // In production, use a BIP39 library
  return await sha256(phrase);
}

export async function privateKeyFromPhraseWithAccount(
  phrase: string,
  account: number = 0
): Promise<string> {
  // In production, use a BIP39 library and account derivation
  return await sha256(phrase + ":" + account);
}

// Browser-compatible PBKDF2 key derivation
export async function deriveKey(
  password: string,
  salt: string | Uint8Array,
  iterations: number = 100000,
  keyLength: number = 32
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = typeof salt === "string" ? encoder.encode(salt) : salt;
  const key = await window.crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedBits = await window.crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuffer, iterations, hash: "SHA-256" },
    key,
    keyLength * 8
  );
  return new Uint8Array(derivedBits as ArrayBuffer);
}
