import { bytesToHex } from "@noble/hashes/utils";
import { getPublicKey, utils } from "@noble/secp256k1";
import * as CryptoJS from "crypto-js";

// Import proper NIP-19 encoding functions from nostr-tools
import { nip19 } from "nostr-tools";

export class CryptoUnified {
  private static instance: CryptoUnified;

  static getInstance(): CryptoUnified {
    if (!CryptoUnified.instance) {
      CryptoUnified.instance = new CryptoUnified();
    }
    return CryptoUnified.instance;
  }

  async generateNostrKeys(): Promise<{ nsec: string; npub: string }> {
    const privateKeyBytes = utils.randomPrivateKey();
    // Force compressed public key generation (33 bytes, starts with 0x02/0x03)
    const publicKeyBytes = (getPublicKey as any)(privateKeyBytes, true);
    const publicKeyHex = bytesToHex(publicKeyBytes);

    // Use proper NIP-19 bech32 encoding
    // npubEncode expects 64-char hex (without compression prefix), nsecEncode expects Uint8Array
    const publicKeyWithoutPrefix = publicKeyHex.slice(2); // Remove "02"/"03" compression prefix

    return {
      nsec: nip19.nsecEncode(privateKeyBytes as any),
      npub: nip19.npubEncode(publicKeyWithoutPrefix),
    };
  }

  // Browser-compatible encryption using crypto-js
  static encrypt(data: string, password: string): string {
    return CryptoJS.AES.encrypt(data, password).toString();
  }

  static decrypt(encryptedData: string, password: string): string {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedData, password);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      if (!decrypted) {
        throw new Error(
          "Decryption failed - invalid password or corrupted data"
        );
      }
      return decrypted;
    } catch (error) {
      throw new Error(
        `Decryption failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Browser-compatible hashing
  static hash(data: string): string {
    return CryptoJS.SHA256(data).toString();
  }

  // Browser-compatible random bytes
  static randomBytes(length: number): Uint8Array {
    const array = new Uint8Array(length);
    if (typeof window !== "undefined" && window.crypto) {
      window.crypto.getRandomValues(array);
    } else if (typeof globalThis !== "undefined" && globalThis.crypto) {
      globalThis.crypto.getRandomValues(array);
    } else {
      throw new Error("Crypto API not available in this environment");
    }
    return array;
  }

  // HMAC using crypto-js
  static hmac(data: string, key: string): string {
    return CryptoJS.HmacSHA256(data, key).toString();
  }
}
