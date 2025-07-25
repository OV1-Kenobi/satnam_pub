import { bytesToHex } from "@noble/hashes/utils";
import { getPublicKey, utils } from "@noble/secp256k1";

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
    const privateKey = bytesToHex(privateKeyBytes);
    const publicKeyBytes = getPublicKey(privateKeyBytes);
    const publicKeyHex = bytesToHex(publicKeyBytes);

    // Use proper NIP-19 bech32 encoding
    return {
      nsec: nip19.nsecEncode(privateKey),
      npub: nip19.npubEncode(publicKeyHex),
    };
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
