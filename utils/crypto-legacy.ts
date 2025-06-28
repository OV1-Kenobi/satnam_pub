import CryptoJS from "crypto-js";

export class CryptoLegacy {
  // Replace line 27 Node.js crypto import
  static legacyHash(data: string): string {
    return CryptoJS.MD5(data).toString();
  }

  // Replace line 70 Node.js crypto import
  static legacyEncrypt(data: string, password: string): string {
    return CryptoJS.DES.encrypt(data, password).toString();
  }

  static legacyDecrypt(encryptedData: string, password: string): string {
    const bytes = CryptoJS.DES.decrypt(encryptedData, password);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  // Browser-compatible random generation
  static legacyRandom(length: number): string {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }
}
