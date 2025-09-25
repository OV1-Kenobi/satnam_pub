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
    const sk = new Uint8Array(32);
    (typeof window !== "undefined" ? window.crypto : crypto).getRandomValues(
      sk
    );
    const skHex = Array.from(sk)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { central_event_publishing_service: CEPS } = await import(
      "../lib/central_event_publishing_service"
    );
    const pubHex = CEPS.getPublicKeyHex(skHex);
    return {
      nsec: CEPS.encodeNsec(sk),
      npub: CEPS.encodeNpub(pubHex),
    };
  }

  // WebCrypto-based password hashing
  async hashPassword(password: string, salt?: string): Promise<string> {
    const result = await this.hashPasswordWithSalt(password, salt);
    return result.hash;
  }

  // WebCrypto-based password hashing that returns both hash and salt
  async hashPasswordWithSalt(
    password: string,
    salt?: string
  ): Promise<{ hash: string; salt: string }> {
    const encoder = new TextEncoder();

    // Generate or use provided salt
    let saltBytes: Uint8Array;
    let saltString: string;

    if (salt) {
      if (typeof salt === "string") {
        // If salt is a hex string, convert to bytes
        if (salt.match(/^[a-fA-F0-9]+$/)) {
          saltBytes = new Uint8Array(
            salt.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
          );
          saltString = salt;
        } else {
          // If salt is a regular string, encode it
          saltBytes = encoder.encode(salt);
          saltString = Array.from(saltBytes, (byte: number) =>
            byte.toString(16).padStart(2, "0")
          ).join("");
        }
      } else {
        saltBytes = salt;
        saltString = Array.from(salt, (byte: number) =>
          byte.toString(16).padStart(2, "0")
        ).join("");
      }
    } else {
      saltBytes = new Uint8Array(16); // 128 bits
      window.crypto.getRandomValues(saltBytes);
      saltString = Array.from(saltBytes, (byte: number) =>
        byte.toString(16).padStart(2, "0")
      ).join("");
    }

    // Use WebCrypto PBKDF2
    try {
      const keyBytes = await deriveKey(password, saltBytes, 100000, 32);
      const hash = Array.from(keyBytes, (byte: number) =>
        byte.toString(16).padStart(2, "0")
      ).join("");

      return { hash, salt: saltString };
    } catch (error) {
      throw new Error(
        `Password hashing failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Browser-compatible encryption using AES-GCM with PBKDF2-derived key
  async encryptData(data: string, key: string): Promise<string> {
    try {
      // Use WebCrypto AES-GCM with PBKDF2-derived key; returns v1.salt.iv.ct (base64url)
      return await encryptAesGcm(data, key);
    } catch (error) {
      throw new Error(
        `Encryption failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async decryptData(encryptedData: string, key: string): Promise<string> {
    try {
      // Use WebCrypto AES-GCM with PBKDF2-derived key
      return await decryptAesGcm(encryptedData, key);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Invalid token format")
      ) {
        throw new Error("Invalid encrypted data format");
      }
      if (error instanceof Error && error.name === "OperationError") {
        throw new Error("Decryption failed: Invalid key or corrupted data");
      }
      throw new Error(
        `Decryption failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}

// Browser-compatible random hex generator
export async function generateRandomHex(length: number): Promise<string> {
  const array = new Uint8Array(length / 2);
  window.crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

// Browser-compatible secure token generator
export async function generateSecureToken(
  length: number = 64
): Promise<string> {
  return generateRandomHex(length);
}

// Browser-compatible SHA-256 hash
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", dataBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Browser-compatible Nostr key pair generator
export async function generateNostrKeyPair(): Promise<{
  privateKey: string;
  publicKey: string;
  npub: string;
  nsec: string;
}> {
  console.log(
    "🔍 CRYPTO-LAZY generateNostrKeyPair called - using CEPS helpers"
  );

  const sk = new Uint8Array(32);
  (typeof window !== "undefined" ? window.crypto : crypto).getRandomValues(sk);
  const privateKey = Array.from(sk)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const { central_event_publishing_service: CEPS } = await import(
    "../lib/central_event_publishing_service"
  );
  const pubkeyHex = CEPS.getPublicKeyHex(privateKey);
  const npub = CEPS.encodeNpub(pubkeyHex);
  const nsec = CEPS.encodeNsec(sk);

  return {
    privateKey,
    publicKey: pubkeyHex,
    npub,
    nsec,
  };
}

// Browser-compatible recovery phrase generator (mock, not BIP39)
export async function generateRecoveryPhrase(): Promise<string> {
  // In production, use a BIP39 library
  return Array(12)
    .fill(0)
    .map(() => Math.random().toString(36).slice(2, 8))
    .join(" ");
}

// Browser-compatible private key from phrase (mock, not BIP39)
export async function privateKeyFromPhrase(phrase: string): Promise<string> {
  // In production, use a BIP39 library
  return await sha256(phrase);
}

export async function privateKeyFromPhraseWithAccount(
  phrase: string,
  account: number = 0
): Promise<string> {
  // In production, use a BIP39 library and account derivation
  return await sha256(phrase + ":" + account);
}

// Browser-compatible PBKDF2 key derivation
export async function deriveKey(
  password: string,
  salt: string | Uint8Array,
  iterations: number = 100000,
  keyLength: number = 32
): Promise<Uint8Array> {
  try {
    // Validate input
    if (!password || typeof password !== "string") {
      throw new Error("Invalid password: must be a non-empty string");
    }
    if (!salt) {
      throw new Error("Invalid salt: must be provided");
    }
    if (iterations <= 0 || !Number.isInteger(iterations)) {
      throw new Error("Invalid iterations: must be a positive integer");
    }
    if (keyLength <= 0 || !Number.isInteger(keyLength)) {
      throw new Error("Invalid keyLength: must be a positive integer");
    }

    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    const saltBuffer = typeof salt === "string" ? encoder.encode(salt) : salt;

    const key = await window.crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    const derivedBits = await window.crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new Uint8Array(saltBuffer),
        iterations,
        hash: "SHA-256",
      },
      key,
      keyLength * 8
    );

    return new Uint8Array(derivedBits as ArrayBuffer);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Key derivation failed: ${String(error)}`);
  }
}

// Helpers for AES-GCM with PBKDF2(SHA-256)
const te = new TextEncoder();
const td = new TextDecoder();

function toB64Url(u8: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...u8));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array {
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveAesGcmKey(
  pass: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  try {
    // Validate input
    if (!pass || typeof pass !== "string") {
      throw new Error("Invalid passphrase: must be a non-empty string");
    }
    if (!salt || !(salt instanceof Uint8Array) || salt.length === 0) {
      throw new Error("Invalid salt: must be a non-empty Uint8Array");
    }

    const baseKey = await window.crypto.subtle.importKey(
      "raw",
      te.encode(pass),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: new Uint8Array(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`AES-GCM key derivation failed: ${String(error)}`);
  }
}

export async function encryptAesGcm(
  plaintext: string,
  passphrase: string
): Promise<string> {
  try {
    // Validate input
    if (typeof plaintext !== "string") {
      throw new Error("Invalid plaintext: must be a string");
    }
    if (!passphrase || typeof passphrase !== "string") {
      throw new Error("Invalid passphrase: must be a non-empty string");
    }

    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const key = await deriveAesGcmKey(passphrase, salt);

    try {
      const ctBuf = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        te.encode(plaintext)
      );

      return `v1.${toB64Url(salt)}.${toB64Url(iv)}.${toB64Url(
        new Uint8Array(ctBuf)
      )}`;
    } catch (cryptoError) {
      throw new Error("Encryption operation failed");
    }
  } catch (error) {
    // Re-throw our custom errors, wrap unknown errors
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Encryption failed: ${String(error)}`);
  }
}

export async function decryptAesGcm(
  token: string,
  passphrase: string
): Promise<string> {
  try {
    // Validate input
    if (!token || typeof token !== "string") {
      throw new Error("Invalid token: must be a non-empty string");
    }
    if (!passphrase || typeof passphrase !== "string") {
      throw new Error("Invalid passphrase: must be a non-empty string");
    }

    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") {
      throw new Error("Invalid token format: expected v1.salt.iv.ciphertext");
    }

    const [, saltB64, ivB64, ctB64] = parts;

    // Validate base64url parts
    if (!saltB64 || !ivB64 || !ctB64) {
      throw new Error("Invalid token format: missing required components");
    }

    let salt: Uint8Array, iv: Uint8Array, ct: Uint8Array;

    try {
      salt = fromB64Url(saltB64);
      iv = fromB64Url(ivB64);
      ct = fromB64Url(ctB64);
    } catch (error) {
      throw new Error("Invalid token format: malformed base64url encoding");
    }

    // Validate component sizes
    if (salt.length !== 16) {
      throw new Error("Invalid token format: invalid salt size");
    }
    if (iv.length !== 12) {
      throw new Error("Invalid token format: invalid IV size");
    }
    if (ct.length === 0) {
      throw new Error("Invalid token format: empty ciphertext");
    }

    const key = await deriveAesGcmKey(passphrase, salt);

    try {
      const ptBuf = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv) },
        key,
        new Uint8Array(ct)
      );
      return td.decode(ptBuf);
    } catch (cryptoError) {
      // WebCrypto throws OperationError for authentication failures
      throw new Error("Decryption failed: Invalid key or tampered data");
    }
  } catch (error) {
    // Re-throw our custom errors, wrap unknown errors
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Decryption failed: ${String(error)}`);
  }
}
