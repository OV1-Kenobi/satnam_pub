import CryptoJS from "crypto-js";
import { generateSecretKey, getPublicKey } from "nostr-tools";

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
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);

    return {
      nsec: `nsec${privateKey}`,
      npub: `npub${publicKey}`,
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
