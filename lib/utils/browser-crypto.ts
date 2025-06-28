/**
 * Browser-compatible crypto utilities
 * This module provides crypto functions that work in both Node.js and browser environments
 */

import { Buffer } from "buffer";
import * as cryptoBrowserify from "crypto-browserify";

// Polyfill for Node.js crypto module functionality in browser
export const browserCrypto = {
  /**
   * Generate random bytes
   */
  randomBytes(size: number): Buffer {
    if (
      typeof window !== "undefined" &&
      window.crypto &&
      window.crypto.getRandomValues
    ) {
      // Browser environment
      const array = new Uint8Array(size);
      window.crypto.getRandomValues(array);
      return Buffer.from(array);
    } else {
      // Node.js environment or fallback - use crypto-browserify
      return cryptoBrowserify.randomBytes(size);
    }
  },

  /**
   * Generate random UUID
   */
  randomUUID(): string {
    if (
      typeof window !== "undefined" &&
      window.crypto &&
      window.crypto.randomUUID
    ) {
      // Use native browser crypto.randomUUID if available
      return window.crypto.randomUUID();
    } else {
      // Fallback to manual UUID generation
      const bytes = this.randomBytes(16);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

      const hex = bytes.toString("hex");
      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
      ].join("-");
    }
  },

  /**
   * Create hash
   */
  createHash(algorithm: string) {
    return cryptoBrowserify.createHash(algorithm);
  },

  /**
   * Create cipher
   */
  createCipher(algorithm: string, password: string) {
    return cryptoBrowserify.createCipher(algorithm, password);
  },

  /**
   * Create decipher
   */
  createDecipher(algorithm: string, password: string) {
    return cryptoBrowserify.createDecipher(algorithm, password);
  },
};

export default browserCrypto;
