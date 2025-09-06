/**
 * @fileoverview Noble V2 Encryption System
 * @description Unified encryption system using audited Noble cryptography libraries
 * @security Cure53 audited (Q3 2024), zero dependencies, browser-compatible
 */

import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/curves/utils';

/**
 * Noble V2 Encryption Configuration
 * Following NIST recommendations and Noble V2 best practices
 */
export const NOBLE_CONFIG = {
  // AES-256-GCM Configuration
  keyLength: 32, // 256-bit keys
  ivLength: 12,  // 96-bit IV for GCM
  tagLength: 16, // 128-bit authentication tag
  
  // PBKDF2 Configuration
  pbkdf2Iterations: 100000, // NIST recommended minimum
  saltLength: 32, // 256-bit salt
  
  // Encoding
  encoding: 'base64url' as const, // URL-safe base64
} as const;

/**
 * Encryption result format
 */
export interface NobleEncryptionResult {
  encrypted: string;    // base64url encoded ciphertext
  salt: string;        // base64url encoded salt
  iv: string;          // base64url encoded IV
  version: 'noble-v2'; // Format version for future compatibility
}

/**
 * Noble V2 Encryption Class
 * Provides secure, audited encryption using Noble cryptography
 */
export class NobleEncryption {
  /**
   * Encrypt data using AES-256-GCM with PBKDF2 key derivation
   * @param plaintext Data to encrypt
   * @param password Password for key derivation
   * @returns Encryption result with all necessary parameters
   */
  static async encrypt(
    plaintext: string,
    password: string
  ): Promise<NobleEncryptionResult> {
    try {
      // Generate cryptographic parameters
      const salt = randomBytes(NOBLE_CONFIG.saltLength);
      const iv = randomBytes(NOBLE_CONFIG.ivLength);
      
      // Derive key using PBKDF2
      const key = pbkdf2(sha256, password, salt, {
        c: NOBLE_CONFIG.pbkdf2Iterations,
        dkLen: NOBLE_CONFIG.keyLength
      });
      
      // Encrypt using AES-256-GCM
      const cipher = gcm(key, iv);
      const plainBytes = new TextEncoder().encode(plaintext);
      const encrypted = cipher.encrypt(plainBytes);
      
      return {
        encrypted: this.bytesToBase64Url(encrypted),
        salt: this.bytesToBase64Url(salt),
        iv: this.bytesToBase64Url(iv),
        version: 'noble-v2'
      };
    } catch (error) {
      throw new Error(`Noble V2 encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt data using AES-256-GCM with PBKDF2 key derivation
   * @param encryptionResult Result from encrypt() method
   * @param password Password for key derivation
   * @returns Decrypted plaintext
   */
  static async decrypt(
    encryptionResult: NobleEncryptionResult,
    password: string
  ): Promise<string> {
    try {
      // Decode parameters
      const salt = this.base64UrlToBytes(encryptionResult.salt);
      const iv = this.base64UrlToBytes(encryptionResult.iv);
      const encrypted = this.base64UrlToBytes(encryptionResult.encrypted);
      
      // Derive key using same parameters
      const key = pbkdf2(sha256, password, salt, {
        c: NOBLE_CONFIG.pbkdf2Iterations,
        dkLen: NOBLE_CONFIG.keyLength
      });
      
      // Decrypt using AES-256-GCM
      const cipher = gcm(key, iv);
      const decrypted = cipher.decrypt(encrypted);
      
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      throw new Error(`Noble V2 decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encrypt nsec using user's unique salt (zero-knowledge)
   * @param nsec Nostr private key (bech32 format)
   * @param userSalt User's unique salt
   * @returns Single base64url string for database storage
   */
  static async encryptNsec(nsec: string, userSalt: string): Promise<string> {
    try {
      // Validate nsec format
      if (!nsec.startsWith('nsec1')) {
        throw new Error('Invalid nsec format - must start with nsec1');
      }
      
      // Use userSalt directly as password for zero-knowledge encryption
      const result = await this.encrypt(nsec, userSalt);
      
      // Return compact format for database storage: version.salt.iv.encrypted
      return `${result.version}.${result.salt}.${result.iv}.${result.encrypted}`;
    } catch (error) {
      throw new Error(`Nsec encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt nsec using user's unique salt (zero-knowledge)
   * @param encryptedNsec Encrypted nsec from database
   * @param userSalt User's unique salt
   * @returns Decrypted nsec in bech32 format
   */
  static async decryptNsec(encryptedNsec: string, userSalt: string): Promise<string> {
    try {
      // Parse compact format: version.salt.iv.encrypted
      const parts = encryptedNsec.split('.');
      if (parts.length !== 4 || parts[0] !== 'noble-v2') {
        throw new Error('Invalid encrypted nsec format - expected noble-v2.salt.iv.encrypted');
      }
      
      const [version, salt, iv, encrypted] = parts;
      
      // Reconstruct encryption result
      const encryptionResult: NobleEncryptionResult = {
        encrypted,
        salt,
        iv,
        version: 'noble-v2'
      };
      
      // Decrypt using userSalt
      const decrypted = await this.decrypt(encryptionResult, userSalt);
      
      // Validate result
      if (!decrypted.startsWith('nsec1')) {
        throw new Error('Decrypted data is not a valid nsec');
      }
      
      return decrypted;
    } catch (error) {
      throw new Error(`Nsec decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate secure hash using SHA-256
   * @param data Data to hash
   * @param salt Optional salt
   * @returns Hex-encoded hash
   */
  static async hash(data: string, salt?: string): Promise<string> {
    const input = salt ? data + salt : data;
    const hash = sha256(new TextEncoder().encode(input));
    return bytesToHex(hash);
  }

  /**
   * Generate cryptographically secure random bytes
   * @param length Number of bytes to generate
   * @returns Random bytes
   */
  static generateRandomBytes(length: number): Uint8Array {
    return randomBytes(length);
  }

  /**
   * Generate secure random hex string
   * @param length Number of bytes (hex will be 2x this length)
   * @returns Hex string
   */
  static generateRandomHex(length: number): string {
    return bytesToHex(this.generateRandomBytes(length));
  }

  /**
   * Convert bytes to base64url (URL-safe base64)
   */
  private static bytesToBase64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Convert base64url to bytes
   */
  private static base64UrlToBytes(base64url: string): Uint8Array {
    // Add padding if needed
    const padding = '='.repeat((4 - base64url.length % 4) % 4);
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + padding;
    
    return new Uint8Array(
      atob(base64).split('').map(c => c.charCodeAt(0))
    );
  }

  /**
   * Secure memory cleanup (best effort)
   * @param sensitiveData Array of sensitive strings to clear
   */
  static secureWipe(sensitiveData: string[]): void {
    sensitiveData.forEach(data => {
      if (typeof data === 'string') {
        // Best effort to clear string from memory
        try {
          (data as any) = '\0'.repeat(data.length);
        } catch {
          // Ignore if string is immutable
        }
      }
    });
    
    // Force garbage collection if available
    if (typeof window !== 'undefined' && 'gc' in window) {
      try {
        (window as any).gc();
      } catch {
        // Ignore if GC not available
      }
    }
  }
}

/**
 * Export Noble V2 utilities
 */
export const NobleUtils = {
  encrypt: NobleEncryption.encrypt.bind(NobleEncryption),
  decrypt: NobleEncryption.decrypt.bind(NobleEncryption),
  encryptNsec: NobleEncryption.encryptNsec.bind(NobleEncryption),
  decryptNsec: NobleEncryption.decryptNsec.bind(NobleEncryption),
  hash: NobleEncryption.hash.bind(NobleEncryption),
  generateRandomBytes: NobleEncryption.generateRandomBytes.bind(NobleEncryption),
  generateRandomHex: NobleEncryption.generateRandomHex.bind(NobleEncryption),
  secureWipe: NobleEncryption.secureWipe.bind(NobleEncryption),
};
