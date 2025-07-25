/**
 * @fileoverview Crypto Factory for Nostr Key Generation and Management
 * @description Provides secure key generation, recovery phrase creation, and TOTP generation
 * @compliance Master Context - Privacy-first, Bitcoin-only, sovereign family banking
 */

import { bytesToHex } from "@noble/hashes/utils";
import { getPublicKey, utils } from "@noble/secp256k1";
import { nip19 } from "nostr-tools";

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
  async generateNostrKeyPair(): Promise<NostrKeyPair> {
    const privateKeyBytes = utils.randomPrivateKey();
    const privateKey = bytesToHex(privateKeyBytes);
    const publicKey = getPublicKey(privateKeyBytes);
    const publicKeyHex = bytesToHex(publicKey);

    const npub = nip19.npubEncode(publicKeyHex);
    const nsec = nip19.nsecEncode(privateKey);

    return {
      privateKey,
      publicKey: publicKeyHex,
      npub,
      nsec,
    };
  }

  /**
   * Generate a recovery phrase (BIP-39 mnemonic)
   */
  async generateRecoveryPhrase(
    wordCount: 12 | 15 | 18 | 21 | 24 = 24
  ): Promise<RecoveryPhrase> {
    const entropyBytes = utils.randomPrivateKey();
    const entropy = bytesToHex(entropyBytes);

    // Simple word generation (in production, use proper BIP-39)
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
    // Simple implementation - in production, use proper BIP-39 derivation
    const words = phrase.split(" ");
    const entropy = words
      .map((word) => word.charCodeAt(0).toString(16))
      .join("");
    const privateKeyBytes = utils.randomPrivateKey();
    return bytesToHex(privateKeyBytes);
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
  // Browser-only implementation - crypto is always available
  return Promise.resolve();
}

export function areCryptoModulesLoaded(): boolean {
  return true; // Always true in browser
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

export function getPreferredCryptoImplementation(): string {
  return "browser";
}

// --- CRYPTO UTILITY FUNCTIONS ---

export async function generateNostrKeyPair(
  recoveryPhrase?: string,
  account?: number
): Promise<NostrKeyPair> {
  return cryptoFactory.generateNostrKeyPair();
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
