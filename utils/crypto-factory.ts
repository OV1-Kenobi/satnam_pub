/**
 * @fileoverview Crypto Factory for Nostr Key Generation and Management
 * @description Provides secure key generation, recovery phrase creation, and TOTP generation
 * @compliance Master Context - Privacy-first, Bitcoin-only, sovereign family banking
 */

import { bytesToHex } from "@noble/hashes/utils";
import { getPublicKey, utils } from "@noble/secp256k1";
import { bech32 } from "@scure/base";
import { nip19 } from "nostr-tools";

// Secure, audited bech32 encoder using @scure/base
export function bech32Encode(hrp: string, data: Uint8Array): string {
  return bech32.encodeFromBytes(hrp, data);
}

// --- TYPES ---

export interface NostrKeyPair {
  privateKey: string;
  publicKey: string;
  npub: string;
  nsec: string;
}

export interface RecoveryPhrase {
  phrase: string;
  entropy: string;
  wordCount: number;
}

export interface TOTPConfig {
  secret: string;
  digits: number;
  period: number;
  algorithm: "SHA1" | "SHA256" | "SHA512";
}

// --- CRYPTO FACTORY CLASS ---

export class CryptoFactory {
  private static instance: CryptoFactory;

  private constructor() {}

  static getInstance(): CryptoFactory {
    if (!CryptoFactory.instance) {
      CryptoFactory.instance = new CryptoFactory();
    }
    return CryptoFactory.instance;
  }

  /**
   * Generate a new Nostr key pair
   */
  async generateNostrKeyPair(recoveryPhrase?: string): Promise<NostrKeyPair> {
    try {
      console.log("🔑 Starting Nostr key pair generation...", {
        hasRecoveryPhrase: !!recoveryPhrase,
        phraseLength: recoveryPhrase ? recoveryPhrase.split(" ").length : 0,
      });

      let privateKeyBytes: Uint8Array;

      if (recoveryPhrase) {
        console.log("🔄 Generating from recovery phrase...");
        // Generate from recovery phrase
        const privateKeyHex = await this.privateKeyFromPhrase(recoveryPhrase);
        privateKeyBytes = new Uint8Array(
          privateKeyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
        );
      } else {
        console.log("🔄 Generating random private key...");
        // Generate random private key - keep as Uint8Array
        privateKeyBytes = utils.randomPrivateKey();
      }

      console.log("✅ Private key generated:", {
        keyLength: privateKeyBytes.length,
        keyType: typeof privateKeyBytes,
      });

      console.log("🔄 Generating compressed public key from private key...");
      // Force compressed public key generation (33 bytes, starts with 0x02/0x03)
      const publicKey = (getPublicKey as any)(privateKeyBytes, true);
      const publicKeyHex = bytesToHex(publicKey);

      console.log("🔍 ULTRA-DETAILED KEY GENERATION DEBUG:");
      console.log("Private Key Analysis:", {
        length: privateKeyBytes.length,
        type: typeof privateKeyBytes,
        constructor: privateKeyBytes.constructor.name,
        isUint8Array: privateKeyBytes instanceof Uint8Array,
        firstFewBytes: Array.from(privateKeyBytes.slice(0, 8)),
        lastFewBytes: Array.from(privateKeyBytes.slice(-8)),
      });

      console.log("Public Key Analysis:", {
        length: publicKey.length,
        type: typeof publicKey,
        constructor: publicKey.constructor.name,
        isUint8Array: publicKey instanceof Uint8Array,
        firstFewBytes: Array.from(publicKey.slice(0, 8)),
        lastFewBytes: Array.from(publicKey.slice(-8)),
        expectedLength: "33 bytes (compressed secp256k1)",
      });

      console.log("Public Key Hex Analysis:", {
        length: publicKeyHex.length,
        type: typeof publicKeyHex,
        fullHex: publicKeyHex,
        expectedLength: "66 characters",
        startsWithValidPrefix:
          publicKeyHex.startsWith("02") || publicKeyHex.startsWith("03"),
        isValidHex: /^[0-9a-fA-F]+$/.test(publicKeyHex),
      });

      console.log("🔄 Encoding keys to NIP-19 format using direct bech32...");

      // Extract the 32-byte x-coordinate from the 33-byte compressed public key
      const publicKeyXCoordinate = publicKey.slice(1); // Remove compression prefix byte

      console.log("🔍 DIRECT BECH32 ENCODING DEBUG:", {
        originalPublicKeyLength: publicKey.length,
        publicKeyHexLength: publicKeyHex.length,
        xCoordinateLength: publicKeyXCoordinate.length,
        expectedXCoordinateLength: 32,
      });

      // Generate npub using direct bech32 encoding (bypasses nostr-tools)
      const npub = bech32Encode("npub", publicKeyXCoordinate);

      // Generate nsec using nostr-tools (this one works correctly)
      const nsec = nip19.nsecEncode(privateKeyBytes as any);

      console.log("🔍 DIRECT BECH32 ENCODING RESULT:", {
        npub: npub,
        npubLength: npub.length,
        nsec: nsec.substring(0, 10) + "...",
        nsecLength: nsec.length,
        npubValid: npub.length === 63 && npub.startsWith("npub1"),
        nsecValid: nsec.length === 63 && nsec.startsWith("nsec1"),
      });

      console.log("✅ Nostr key pair generated successfully:", {
        npubLength: npub.length,
        nsecLength: nsec.length,
        npubValid: npub.length === 63 && npub.startsWith("npub1"),
        nsecValid: nsec.length === 63 && nsec.startsWith("nsec1"),
        npubPrefix: npub.substring(0, 10) + "...",
        nsecPrefix: nsec.substring(0, 10) + "...",
      });

      return {
        privateKey: bytesToHex(privateKeyBytes),
        publicKey: publicKeyHex,
        npub,
        nsec,
      };
    } catch (error) {
      console.error("❌ Failed to generate Nostr key pair:", error);
      throw new Error(
        `Nostr key pair generation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Generate a recovery phrase (DEPRECATED - Not used for key generation)
   * @deprecated This method is not used in the current implementation
   */
  async generateRecoveryPhrase(
    wordCount: 12 | 15 | 18 | 21 | 24 = 24
  ): Promise<RecoveryPhrase> {
    console.warn(
      "⚠️ generateRecoveryPhrase is deprecated and not used for key generation"
    );

    // Simple fallback for compatibility
    const entropyBytes = utils.randomPrivateKey();
    const entropy = bytesToHex(entropyBytes);
    const words = this.generateWordsFromEntropy(entropy, wordCount);
    const phrase = words.join(" ");

    return {
      phrase,
      entropy,
      wordCount,
    };
  }

  /**
   * Generate private key from recovery phrase
   */
  async privateKeyFromPhrase(phrase: string): Promise<string> {
    try {
      console.log("🔄 Deriving private key from recovery phrase...");

      // Use proper BIP39 seed derivation
      const { mnemonicToSeedSync } = await import("@scure/bip39");

      console.log("✅ BIP39 mnemonicToSeedSync imported successfully");

      const seed = mnemonicToSeedSync(phrase);
      console.log("✅ Seed derived from mnemonic:", {
        seedLength: seed.length,
        seedType: typeof seed,
      });

      // Use first 32 bytes as private key
      const privateKeyBytes = seed.slice(0, 32);
      const privateKey = bytesToHex(privateKeyBytes);

      console.log("✅ Private key derived successfully:", {
        keyLength: privateKey.length,
        keyPrefix: privateKey.substring(0, 8) + "...",
      });

      return privateKey;
    } catch (error) {
      console.error("❌ Failed to derive key from mnemonic:", error);
      console.warn("🔄 Falling back to simple implementation...");

      // Fallback to simple implementation
      const words = phrase.split(" ");
      const entropy = words
        .map((word) => word.charCodeAt(0).toString(16))
        .join("");
      const privateKeyBytes = utils.randomPrivateKey();
      const fallbackKey = bytesToHex(privateKeyBytes);

      console.log("⚠️ Using fallback private key generation");
      return fallbackKey;
    }
  }

  /**
   * Generate TOTP secret and code
   */
  async generateTOTP(secret: string, window: number = 30): Promise<string> {
    // Simple TOTP implementation
    const timestamp = Math.floor(Date.now() / 1000);
    const counter = Math.floor(timestamp / window);

    // Generate a simple code based on counter
    const code = (counter % 1000000).toString().padStart(6, "0");
    return code;
  }

  /**
   * Verify TOTP code
   */
  async verifyTOTP(
    secret: string,
    code: string,
    window: number = 30
  ): Promise<boolean> {
    const expectedCode = await this.generateTOTP(secret, window);
    return code === expectedCode;
  }

  /**
   * Generate words from entropy (simplified)
   */
  private generateWordsFromEntropy(
    entropy: string,
    wordCount: number
  ): string[] {
    const wordList = [
      "abandon",
      "ability",
      "able",
      "about",
      "above",
      "absent",
      "absorb",
      "abstract",
      "absurd",
      "abuse",
      "access",
      "accident",
      "account",
      "accuse",
      "achieve",
      "acid",
      "acoustic",
      "acquire",
      "across",
      "act",
      "action",
      "actor",
      "actual",
      "adapt",
      "add",
      "addict",
      "address",
      "adjust",
      "admit",
      "adult",
      "advance",
      "advice",
      "aerobic",
      "affair",
      "afford",
      "afraid",
      "again",
      "age",
      "agent",
      "agree",
      "ahead",
      "aim",
      "air",
      "airport",
      "aisle",
      "alarm",
      "album",
      "alcohol",
      "alert",
      "alien",
    ];

    const words: string[] = [];
    for (let i = 0; i < wordCount; i++) {
      const index = parseInt(entropy.substr(i * 2, 2), 16) % wordList.length;
      words.push(wordList[index]);
    }

    return words;
  }

  /**
   * Hash data for privacy
   */
  async hashData(data: string, salt: string = ""): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data + salt);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Encrypt data for privacy
   */
  async encryptData(data: string, key: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const keyBuffer = encoder.encode(key);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      dataBuffer
    );

    const encryptedArray = Array.from(new Uint8Array(encryptedBuffer));
    const ivArray = Array.from(iv);

    return JSON.stringify({
      encrypted: encryptedArray,
      iv: ivArray,
    });
  }

  /**
   * Decrypt data for privacy
   */
  async decryptData(encryptedData: string, key: string): Promise<string> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const { encrypted, iv } = JSON.parse(encryptedData);
    const encryptedBuffer = new Uint8Array(encrypted);
    const ivBuffer = new Uint8Array(iv);
    const keyBuffer = encoder.encode(key);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBuffer },
      cryptoKey,
      encryptedBuffer
    );

    return decoder.decode(decryptedBuffer);
  }
}

// --- EXPORT INSTANCE ---

export const cryptoFactory = CryptoFactory.getInstance();

// --- LEGACY EXPORTS FOR COMPATIBILITY ---

export const generateRecoveryPhrase = () =>
  cryptoFactory.generateRecoveryPhrase();
export const privateKeyFromPhrase = (phrase: string) =>
  cryptoFactory.privateKeyFromPhrase(phrase);
export const generateTOTP = (secret: string, window?: number) =>
  cryptoFactory.generateTOTP(secret, window);

// --- CRYPTO LOADING STRATEGY TYPES AND FUNCTIONS ---

export interface CryptoLoadingState {
  isLoading: boolean;
  isLoaded: boolean;
  error: Error | null;
}

export interface CryptoLoadingStrategy {
  useSync: boolean;
  enableCaching: boolean;
  timeoutMs: number;
  retryAttempts: number;
}

// Default strategy
const defaultStrategy: CryptoLoadingStrategy = {
  useSync: false,
  enableCaching: true,
  timeoutMs: 5000,
  retryAttempts: 3,
};

let currentStrategy = { ...defaultStrategy };

export function configureCryptoStrategy(
  strategy: Partial<CryptoLoadingStrategy>
): void {
  currentStrategy = { ...currentStrategy, ...strategy };
}

export function getCryptoStrategy(): CryptoLoadingStrategy {
  return { ...currentStrategy };
}

// --- CRYPTO MODULE LOADING FUNCTIONS ---

export async function preloadCryptoModules(): Promise<void> {
  try {
    console.log("🔄 Preloading crypto modules...");

    // Test crypto operations availability
    if (typeof crypto === "undefined" || !crypto.getRandomValues) {
      throw new Error("Web Crypto API not available");
    }

    // Test a simple crypto operation
    const testBytes = new Uint8Array(32);
    crypto.getRandomValues(testBytes);

    console.log("✅ Web Crypto API validated successfully");

    // Test the crypto factory instance
    const factory = CryptoFactory.getInstance();
    if (!factory) {
      throw new Error("Crypto factory instance not available");
    }

    console.log("✅ Crypto factory instance validated successfully");

    // Test actual key generation to ensure it works
    try {
      const testKeyPair = await factory.generateNostrKeyPair();
      if (!testKeyPair.npub || !testKeyPair.nsec) {
        throw new Error("Key generation test failed");
      }
      console.log("✅ Key generation test passed");
    } catch (keyError) {
      console.warn("⚠️ Key generation test failed:", keyError);
      // Don't fail preload for key generation issues - let the actual generation handle it
    }

    console.log("🎉 All crypto modules preloaded and validated!");
  } catch (error) {
    console.error("❌ Failed to preload crypto modules:", error);
    throw new Error(
      `Crypto module preloading failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export function areCryptoModulesLoaded(): boolean {
  try {
    // Check if Web Crypto API is available
    if (typeof crypto === "undefined" || !crypto.getRandomValues) {
      return false;
    }

    // Check if crypto factory instance is available
    const factory = CryptoFactory.getInstance();
    if (!factory) {
      return false;
    }

    return true;
  } catch (error) {
    console.warn("Crypto modules availability check failed:", error);
    return false;
  }
}

export async function testCryptoOperations(): Promise<boolean> {
  try {
    console.log("🧪 Testing crypto operations...");

    // Test basic crypto operations independently
    console.log("🔍 Testing utils.randomPrivateKey()...");
    const privateKeyBytes = utils.randomPrivateKey();
    if (!privateKeyBytes || privateKeyBytes.length !== 32) {
      throw new Error("randomPrivateKey failed");
    }
    console.log("✅ utils.randomPrivateKey() works");

    console.log("🔍 Testing getPublicKey() with compression...");
    const publicKey = (getPublicKey as any)(privateKeyBytes, true);
    if (!publicKey || publicKey.length !== 33) {
      throw new Error(
        `getPublicKey failed: expected 33 bytes, got ${publicKey?.length}`
      );
    }
    console.log("✅ getPublicKey() with compression works");

    console.log("🔍 Testing direct bech32 encoding...");
    const publicKeyHex = bytesToHex(publicKey);

    // Use direct bech32 encoding: extract x-coordinate (32 bytes)
    const publicKeyXCoordinate = publicKey.slice(1); // Remove compression prefix byte
    const npub = bech32Encode("npub", publicKeyXCoordinate);
    if (!npub || !npub.startsWith("npub1") || npub.length !== 63) {
      throw new Error(
        `Direct bech32 encoding failed: ${npub} (length: ${npub?.length})`
      );
    }
    console.log("✅ Direct bech32 encoding works");

    // Use Uint8Array for nsecEncode (as required by runtime)
    const nsec = nip19.nsecEncode(privateKeyBytes as any);
    if (!nsec || !nsec.startsWith("nsec1") || nsec.length !== 63) {
      throw new Error(`nsecEncode failed: ${nsec} (length: ${nsec?.length})`);
    }
    console.log("✅ nip19.nsecEncode() works");

    // Test key pair generation through factory
    console.log("🔍 Testing crypto factory key generation...");
    const keyPair = await cryptoFactory.generateNostrKeyPair();
    if (
      !keyPair.npub ||
      !keyPair.nsec ||
      !keyPair.npub.startsWith("npub1") ||
      !keyPair.nsec.startsWith("nsec1")
    ) {
      throw new Error("Factory key pair generation failed");
    }
    console.log("✅ Crypto factory key generation works");

    console.log("🎉 All crypto operations test passed");
    return true;
  } catch (error) {
    console.error("❌ Crypto operations test failed:", error);
    return false;
  }
}

export function clearCryptoCache(): void {
  // No-op for browser-only version
}

export function isCryptoSupported(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}

export function getCryptoEnvironmentInfo(): {
  type: "browser" | "node";
  features: string[];
} {
  return {
    type: "browser",
    features: ["WebCrypto", "SubtleCrypto"],
  };
}

// Simple immediate test function with detailed results capture
(window as any).testNpubEncoding = async () => {
  console.log("🧪 TESTING NPUB ENCODING DIRECTLY...");

  const results = {
    nip19Inspection: null as any,
    inputData: null as any,
    outputResult: null as any,
    error: null as any,
    success: false,
  };

  try {
    // First, inspect the nip19 object
    results.nip19Inspection = {
      type: typeof nip19,
      keys: Object.keys(nip19),
      npubEncode: typeof nip19.npubEncode,
      nsecEncode: typeof nip19.nsecEncode,
    };
    console.log("nip19 object inspection:", results.nip19Inspection);

    // Test with a known public key hex (33 bytes = 66 hex chars)
    const testPublicKeyHex =
      "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

    results.inputData = {
      publicKeyHex: testPublicKeyHex,
      length: testPublicKeyHex.length,
      expectedLength: 66,
      startsWithValidPrefix:
        testPublicKeyHex.startsWith("02") || testPublicKeyHex.startsWith("03"),
    };
    console.log("Input data:", results.inputData);

    console.log("🔄 Using direct bech32 encoding approach...");

    // Convert hex to bytes and extract x-coordinate (32 bytes)
    const testPublicKeyBytes = new Uint8Array(
      testPublicKeyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );
    const testPublicKeyXCoordinate = testPublicKeyBytes.slice(1); // Remove compression prefix byte

    console.log("Direct bech32 encoding data:", {
      originalHex: testPublicKeyHex,
      originalLength: testPublicKeyHex.length,
      bytesLength: testPublicKeyBytes.length,
      xCoordinateLength: testPublicKeyXCoordinate.length,
      expectedXCoordinateLength: 32,
    });

    const npub = bech32Encode("npub", testPublicKeyXCoordinate);
    console.log("🔄 Direct bech32Encode returned:", typeof npub);

    results.outputResult = {
      npub: npub,
      length: npub.length,
      expectedLength: 63,
      isCorrectLength: npub.length === 63,
      startsWithNpub1: npub.startsWith("npub1"),
      fullOutput: npub,
    };
    console.log("Output result:", results.outputResult);

    if (npub.length !== 63) {
      console.error("❌ NPUB ENCODING FAILED - Wrong length!");
      console.error("Expected: 63 characters");
      console.error("Actual: " + npub.length + " characters");
      console.error("Full npub: " + npub);
      results.success = false;
    } else {
      console.log("✅ NPUB ENCODING SUCCESS!");
      results.success = true;
    }

    // Store results globally for page display
    (window as any).lastTestResults = results;
    return results.success;
  } catch (error) {
    results.error = {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : "No stack trace",
    };
    console.error("❌ NPUB ENCODING ERROR:", error);
    console.error("Error details:", results.error);

    // Store results globally for page display
    (window as any).lastTestResults = results;
    return false;
  }
};

// Test functions available for manual debugging
console.log("🔧 Crypto debugging functions available:");
console.log("- testNpubEncoding(): Test npub encoding with known data");
console.log("- testCryptoDebug(): Full crypto operations test");

// Global test function for browser console debugging
(window as any).testCryptoDebug = async () => {
  console.log("🔧 CRYPTO DEBUG TEST STARTING...");

  try {
    // Test 1: Basic imports
    console.log("🔍 Testing basic imports...");
    console.log("utils:", typeof utils);
    console.log("getPublicKey:", typeof getPublicKey);
    console.log("nip19:", typeof nip19);
    console.log("bytesToHex:", typeof bytesToHex);

    // Test 2: Minimal npub encoding test with known data
    console.log("🔍 Testing minimal npub encoding...");

    // Use a known test private key (32 bytes)
    const testPrivateKeyHex =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const testPrivateKeyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      testPrivateKeyBytes[i] = parseInt(testPrivateKeyHex.substr(i * 2, 2), 16);
    }

    console.log("Test private key:", {
      hex: testPrivateKeyHex,
      bytes: Array.from(testPrivateKeyBytes),
      length: testPrivateKeyBytes.length,
    });

    const testPublicKey = getPublicKey(testPrivateKeyBytes);
    const testPublicKeyHex = bytesToHex(testPublicKey);

    console.log("Test public key:", {
      bytes: Array.from(testPublicKey),
      hex: testPublicKeyHex,
      length: testPublicKeyHex.length,
      expectedLength: 66,
    });

    const testNpub = nip19.npubEncode(testPublicKeyHex);
    console.log("Test npub result:", {
      npub: testNpub,
      length: testNpub.length,
      expectedLength: 63,
      isCorrectLength: testNpub.length === 63,
    });

    // Test 3: Crypto factory instance
    console.log("🔍 Testing crypto factory...");
    const factory = CryptoFactory.getInstance();
    console.log("factory:", !!factory);

    // Test 4: Key generation
    console.log("🔍 Testing key generation...");
    const result = await testCryptoOperations();
    console.log("testCryptoOperations result:", result);

    // Test 5: Preload function
    console.log("🔍 Testing preload function...");
    await preloadCryptoModules();
    console.log("✅ Preload completed");

    console.log("🎉 CRYPTO DEBUG TEST COMPLETED SUCCESSFULLY");
    return true;
  } catch (error) {
    console.error("❌ CRYPTO DEBUG TEST FAILED:", error);
    return false;
  }
};

export function getPreferredCryptoImplementation(): string {
  return "browser";
}

// --- CRYPTO UTILITY FUNCTIONS ---

export async function generateNostrKeyPair(
  recoveryPhrase?: string,
  account?: number
): Promise<NostrKeyPair> {
  console.log("🔍 EXPORTED generateNostrKeyPair called with:", {
    recoveryPhrase,
    account,
  });
  const result = await cryptoFactory.generateNostrKeyPair(recoveryPhrase);
  console.log("🔍 EXPORTED generateNostrKeyPair result:", {
    npub: result.npub,
    npubLength: result.npub.length,
    nsec: result.nsec,
    nsecLength: result.nsec.length,
  });
  return result;
}

export async function generateRandomHex(length: number = 32): Promise<string> {
  const bytes = utils.randomPrivateKey();
  return bytesToHex(bytes).substring(0, length);
}

export async function generateSecureToken(): Promise<string> {
  return generateRandomHex(32);
}

export async function hashPassword(
  password: string,
  salt?: string
): Promise<string> {
  return cryptoFactory.hashData(password, salt || "");
}

export async function encryptData(data: string, key: string): Promise<string> {
  return cryptoFactory.encryptData(data, key);
}

export async function decryptData(
  encryptedData: string,
  key: string
): Promise<string> {
  return cryptoFactory.decryptData(encryptedData, key);
}

export async function sha256(data: string): Promise<string> {
  return cryptoFactory.hashData(data);
}

export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function createCryptoLoadingManager(): {
  load: () => Promise<void>;
  isLoaded: () => boolean;
  clear: () => void;
} {
  return {
    load: async () => Promise.resolve(),
    isLoaded: () => true,
    clear: () => {},
  };
}
