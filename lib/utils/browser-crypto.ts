/**
 * Browser-compatible crypto utilities - SECURITY HARDENED
 *
 * CRITICAL SECURITY NOTICE:
 * This module has been hardened to fail safely when secure cryptographic operations are unavailable.
 * All functions now require the Web Crypto API and will throw errors rather than fall back to
 * insecure implementations.
 *
 * SECURITY IMPROVEMENTS:
 * - randomBytes: Requires Web Crypto API, no Math.random() fallback
 * - randomUUID: Requires Web Crypto API for secure random generation
 * - sha256/sha512: Requires Web Crypto API, no insecure hash fallback
 * - encrypt/decrypt: Uses AES-GCM with PBKDF2 key derivation
 * - createHashAsync: Requires Web Crypto API, supports multiple algorithms
 * - createHash: Throws error for synchronous secure hashing (use createHashAsync)
 * - createCipher/createDecipher: Disabled insecure implementations
 *
 * This ensures that cryptographic operations either use secure implementations or fail explicitly,
 * preventing silent security vulnerabilities.
 *
 * No Node.js dependencies - uses Web Crypto API exclusively
 */

// Browser-compatible crypto using Web Crypto API exclusively
export const browserCrypto = {
  /**
   * Generate random bytes using Web Crypto API
   */
  randomBytes(size: number): Uint8Array {
    const array = new Uint8Array(size);
    crypto.getRandomValues(array);
    return array;
  },

  /**
   * Generate random UUID using Web Crypto API
   */
  randomUUID(): string {
    return crypto.randomUUID();
  },

  /**
   * Create hash using Web Crypto API
   */
  async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  },

  /**
   * Create SHA-512 hash using Web Crypto API
   */
  async sha512(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-512", dataBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  },

  /**
   * Simple AES-GCM encryption using Web Crypto API
   */
  async encrypt(data: string, password: string): Promise<string> {
    const encoder = new TextEncoder();

    // Derive key from password
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encoder.encode(data)
    );

    // Combine salt, iv, and encrypted data
    const result = new Uint8Array(
      salt.length + iv.length + encryptedBuffer.byteLength
    );
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);

    return Array.from(result)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  },

  /**
   * Simple AES-GCM decryption using Web Crypto API
   */
  async decrypt(encryptedHex: string, password: string): Promise<string> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Convert hex to bytes
    const encryptedData = new Uint8Array(
      encryptedHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
    );

    // Extract salt, iv, and encrypted data
    const salt = encryptedData.slice(0, 16);
    const iv = encryptedData.slice(16, 28);
    const encrypted = encryptedData.slice(28);

    // Derive key from password
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encrypted
    );

    return decoder.decode(decryptedBuffer);
  },

  /**
   * Create hash using Web Crypto API with algorithm support
   */
  async createHashAsync(algorithm: string, data: string): Promise<string> {
    if (
      typeof window !== "undefined" &&
      window.crypto &&
      window.crypto.subtle
    ) {
      // Use Web Crypto API
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);

      let algoName: string;
      switch (algorithm.toLowerCase()) {
        case "sha256":
          algoName = "SHA-256";
          break;
        case "sha1":
          algoName = "SHA-1";
          break;
        case "sha512":
          algoName = "SHA-512";
          break;
        default:
          algoName = "SHA-256";
      }

      const hashBuffer = await window.crypto.subtle.digest(
        algoName,
        dataBuffer
      );
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } else {
      // CRITICAL SECURITY: No secure hashing available
      throw new Error(
        "Secure hashing not available. Web Crypto API required for cryptographic hash operations."
      );
    }
  },

  /**
   * Create hash (synchronous version) - SECURITY WARNING
   */
  createHash(algorithm: string) {
    // CRITICAL SECURITY: Check for Web Crypto API availability
    if (
      typeof window === "undefined" ||
      !window.crypto ||
      !window.crypto.subtle
    ) {
      throw new Error(
        "Secure hashing not available. Web Crypto API required for cryptographic hash operations."
      );
    }

    // Return an object that mimics crypto.Hash interface
    let data = "";

    return {
      update: function (chunk: string, encoding?: string) {
        data += chunk;
        return this;
      },
      digest: function (encoding: string = "hex") {
        // CRITICAL SECURITY: This synchronous function cannot use Web Crypto API (which is async)
        // For secure hashing, use createHashAsync instead
        throw new Error(
          "Synchronous secure hashing not available. Use createHashAsync for cryptographic operations."
        );
      },
    };
  },

  /**
   * Create cipher - SECURITY WARNING: Not cryptographically secure
   */
  createCipher(algorithm: string, password: string) {
    // CRITICAL SECURITY: XOR cipher is not cryptographically secure
    throw new Error(
      "Insecure cipher implementation. Use Web Crypto API with AES-GCM for secure encryption."
    );
  },

  /**
   * Create decipher - SECURITY WARNING: Not cryptographically secure
   */
  createDecipher(algorithm: string, password: string) {
    // CRITICAL SECURITY: XOR cipher is not cryptographically secure
    throw new Error(
      "Insecure cipher implementation. Use Web Crypto API with AES-GCM for secure decryption."
    );
  },
};

export default browserCrypto;
