const CryptoJS = require("crypto-js");
import { utils, getPublicKey } from "@noble/secp256k1";
import { bytesToHex } from "@noble/hashes/utils";

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
    const privateKey = bytesToHex(privateKeyBytes);
    const publicKey = getPublicKey(privateKeyBytes);
    const publicKeyHex = bytesToHex(publicKey);

    return {
      nsec: `nsec${privateKey}`,
      npub: `npub${publicKeyHex}`,
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
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Browser-compatible secure token generator
export async function generateSecureToken(length: number = 64): Promise<string> {
  return generateRandomHex(length);
}

// Browser-compatible SHA-256 hash
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", dataBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

  // Browser-compatible Nostr key pair generator
  export async function generateNostrKeyPair(): Promise<{ privateKey: string; publicKey: string; npub: string; nsec: string }> {
    const privateKeyBytes = utils.randomPrivateKey();
    const privateKey = bytesToHex(privateKeyBytes);
    const publicKeyBytes = getPublicKey(privateKeyBytes);
    const publicKeyHex = bytesToHex(publicKeyBytes);
    return {
      privateKey,
      publicKey: publicKeyHex,
      npub: `npub${publicKeyHex}`,
      nsec: `nsec${privateKey}`,
    };
  }

// Browser-compatible recovery phrase generator (mock, not BIP39)
export async function generateRecoveryPhrase(): Promise<string> {
  // In production, use a BIP39 library
  return Array(12).fill(0).map(() => Math.random().toString(36).slice(2, 8)).join(' ');
}

// Browser-compatible private key from phrase (mock, not BIP39)
export async function privateKeyFromPhrase(phrase: string): Promise<string> {
  // In production, use a BIP39 library
  return await sha256(phrase);
}

export async function privateKeyFromPhraseWithAccount(phrase: string, account: number = 0): Promise<string> {
  // In production, use a BIP39 library and account derivation
  return await sha256(phrase + ':' + account);
}

// Browser-compatible PBKDF2 key derivation
export async function deriveKey(password: string, salt: string | Uint8Array, iterations: number = 100000, keyLength: number = 32): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = typeof salt === 'string' ? encoder.encode(salt) : salt;
  const key = await window.crypto.subtle.importKey('raw', passwordBuffer, { name: 'PBKDF2' }, false, ['deriveBits']);
  const derivedBits = await window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBuffer, iterations, hash: 'SHA-256' }, key, keyLength * 8);
  return new Uint8Array(derivedBits);
}
