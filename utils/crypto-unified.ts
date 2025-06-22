// Unified crypto utilities that handle both static and dynamic imports properly
// This file resolves the Vite warning about mixed import types

// Type definitions
type CryptoModule = typeof import("crypto");

// Cache for the crypto module
let cryptoModule: CryptoModule | null = null;

/**
 * Get crypto module - handles both browser and Node.js environments
 */
async function getCrypto(): Promise<CryptoModule> {
  if (cryptoModule) {
    return cryptoModule;
  }

  if (typeof window !== "undefined") {
    // Browser environment - use crypto-browserify
    const crypto = await import("crypto-browserify");
    cryptoModule = crypto as any;
    return cryptoModule;
  } else {
    // Node.js environment
    const crypto = await import("crypto");
    cryptoModule = crypto;
    return cryptoModule;
  }
}

/**
 * Generate a random hex string of specified length
 */
export async function generateRandomHex(length: number): Promise<string> {
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    window.crypto.getRandomValues
  ) {
    // Use Web Crypto API in browser
    const bytes = new Uint8Array(Math.ceil(length / 2));
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, length);
  } else {
    // Use Node.js crypto
    const crypto = await getCrypto();
    return crypto
      .randomBytes(Math.ceil(length / 2))
      .toString("hex")
      .slice(0, length);
  }
}

/**
 * Generate a secure token for session management
 */
export async function generateSecureToken(
  length: number = 64
): Promise<string> {
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    window.crypto.getRandomValues
  ) {
    // Use Web Crypto API in browser
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  } else {
    // Use Node.js crypto
    const crypto = await getCrypto();
    return crypto.randomBytes(length).toString("base64url");
  }
}

/**
 * Hash a string using SHA-256
 */
export async function sha256(data: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    // Use Web Crypto API in browser
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } else {
    // Use Node.js crypto
    const crypto = await getCrypto();
    return crypto.createHash("sha256").update(data).digest("hex");
  }
}

/**
 * Create HMAC
 */
export async function createHmac(
  algorithm: string,
  key: string | Buffer
): Promise<any> {
  const crypto = await getCrypto();
  return crypto.createHmac(algorithm, key);
}

/**
 * Generate random bytes
 */
export async function randomBytes(size: number): Promise<Buffer> {
  const crypto = await getCrypto();
  return crypto.randomBytes(size);
}

/**
 * Create cipher
 */
export async function createCipher(
  algorithm: string,
  password: string
): Promise<any> {
  const crypto = await getCrypto();
  return crypto.createCipheriv(algorithm, password, null);
}

/**
 * Create decipher
 */
export async function createDecipher(
  algorithm: string,
  password: string
): Promise<any> {
  const crypto = await getCrypto();
  return crypto.createDecipheriv(algorithm, password, null);
}

/**
 * PBKDF2 key derivation
 */
export async function pbkdf2(
  password: string,
  salt: string,
  iterations: number,
  keylen: number,
  digest: string
): Promise<Buffer> {
  const crypto = await getCrypto();
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      iterations,
      keylen,
      digest,
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      }
    );
  });
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
