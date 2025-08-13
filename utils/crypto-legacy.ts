// Browser-compatible crypto using Web Crypto API (secure alternative to CryptoJS)
export class CryptoLegacy {
  // Environment check helper
  private static checkBrowserCrypto(): void {
    if (
      typeof window === "undefined" ||
      !window.crypto ||
      !window.crypto.subtle
    ) {
      throw new Error(
        "CryptoLegacy requires a browser environment with Web Crypto API support"
      );
    }
  }

  // Secure SHA-256 hash (replaces insecure MD5)
  static async legacyHash(data: string): Promise<string> {
    CryptoLegacy.checkBrowserCrypto();
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // Secure AES-256-GCM encryption (replaces insecure DES)
  static async legacyEncrypt(data: string, password: string): Promise<string> {
    CryptoLegacy.checkBrowserCrypto();
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    // Derive key from password using PBKDF2
    const passwordBuffer = encoder.encode(password);
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    // Generate IV for AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // Encrypt data
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      dataBuffer
    );

    // Combine salt + iv + encrypted data
    const combined = new Uint8Array(
      salt.length + iv.length + encryptedBuffer.byteLength
    );
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);

    // Return as base64 string
    return btoa(String.fromCharCode(...combined));
  }

  static async legacyDecrypt(
    encryptedData: string,
    password: string
  ): Promise<string> {
    CryptoLegacy.checkBrowserCrypto();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Decode base64
    const combined = new Uint8Array(
      atob(encryptedData)
        .split("")
        .map((char) => char.charCodeAt(0))
    );

    // Extract salt, iv, and encrypted data
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);

    // Derive key from password
    const passwordBuffer = encoder.encode(password);
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    // Decrypt data
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );

    return decoder.decode(decryptedBuffer);
  }

  // Cryptographically secure random generation
  static legacyRandom(length: number): string {
    if (typeof window === "undefined" || !window.crypto) {
      throw new Error(
        "legacyRandom requires a browser environment with crypto.getRandomValues support"
      );
    }
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }
}

// Secure AES-256-GCM encryption using Web Crypto API

// Secure AES-256-GCM decryption using Web Crypto API
export async function decryptData(
  encryptedData: string,
  password: string
): Promise<string> {
  return CryptoLegacy.legacyDecrypt(encryptedData, password);
}
