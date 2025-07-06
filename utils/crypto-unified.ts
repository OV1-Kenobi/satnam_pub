import CryptoJS from "crypto-js";
import { generateSecretKey, getPublicKey } from "../src/lib/nostr-browser";

export class CryptoUnified {
  // Use Web Crypto API for modern browsers
  static async generateKeyPair(): Promise<{
    privateKey: string;
    publicKey: string;
  }> {
    const privateKeyBytes = generateSecretKey();
    const privateKey = Array.from(privateKeyBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const publicKey = getPublicKey(privateKeyBytes);

    return { privateKey, publicKey };
  }

  // Browser-compatible encryption using crypto-js
  static encrypt(data: string, password: string): string {
    return CryptoJS.AES.encrypt(data, password).toString();
  }

  static decrypt(encryptedData: string, password: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedData, password);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  // Browser-compatible hashing
  static hash(data: string): string {
    return CryptoJS.SHA256(data).toString();
  }

  // Browser-compatible random bytes
  static randomBytes(length: number): Uint8Array {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return array;
  }

  // HMAC using crypto-js
  static hmac(data: string, key: string): string {
    return CryptoJS.HmacSHA256(data, key).toString();
  }
}
