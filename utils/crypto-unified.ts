import * as CryptoJS from "crypto-js";
import { central_event_publishing_service as CEPS } from "../lib/central_event_publishing_service";

export class CryptoUnified {
  private static instance: CryptoUnified;

  static getInstance(): CryptoUnified {
    if (!CryptoUnified.instance) {
      CryptoUnified.instance = new CryptoUnified();
    }
    return CryptoUnified.instance;
  }

  async generateNostrKeys(): Promise<{ nsec: string; npub: string }> {
    // Generate 32 random bytes using Web Crypto API
    const sk = new Uint8Array(32);
    (typeof window !== "undefined" ? window.crypto : crypto).getRandomValues(
      sk
    );
    const skHex = Array.from(sk)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const pubHex = CEPS.getPublicKeyHex(skHex);
    return {
      nsec: CEPS.encodeNsec(sk),
      npub: CEPS.encodeNpub(pubHex),
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
