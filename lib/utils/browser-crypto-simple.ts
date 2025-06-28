/**
 * Browser-compatible crypto utilities
 * This module provides crypto functions that work in both Node.js and browser environments
 */

import { Buffer } from "buffer";

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
      // Browser environment - use Web Crypto API
      const array = new Uint8Array(size);
      window.crypto.getRandomValues(array);
      return Buffer.from(array);
    } else {
      // Fallback - manual random generation
      const array = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return Buffer.from(array);
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
   * Create hash using Web Crypto API or fallback
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
      // Basic fallback hash
      let hash = 0;
      for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash).toString(16).padStart(8, "0");
    }
  },

  /**
   * Create hash (synchronous version)
   */
  createHash(algorithm: string) {
    // Return an object that mimics crypto.Hash interface
    let data = "";

    return {
      update: function (chunk: string, encoding?: string) {
        data += chunk;
        return this;
      },
      digest: function (encoding: string = "hex") {
        // Simple fallback hash for browser compatibility
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
          const char = data.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash = hash & hash; // Convert to 32-bit integer
        }

        if (encoding === "hex") {
          return Math.abs(hash).toString(16).padStart(8, "0");
        }
        return hash.toString();
      },
    };
  },

  /**
   * Create cipher - simplified version
   */
  createCipher(algorithm: string, password: string) {
    // Simple XOR cipher for basic compatibility
    return {
      update: function (
        data: string,
        inputEncoding: string,
        outputEncoding: string
      ) {
        let result = "";
        for (let i = 0; i < data.length; i++) {
          const charCode =
            data.charCodeAt(i) ^ password.charCodeAt(i % password.length);
          result += String.fromCharCode(charCode);
        }
        return outputEncoding === "hex"
          ? Buffer.from(result).toString("hex")
          : result;
      },
      final: function (outputEncoding: string) {
        return "";
      },
    };
  },

  /**
   * Create decipher - simplified version
   */
  createDecipher(algorithm: string, password: string) {
    // Simple XOR decipher for basic compatibility
    return {
      update: function (
        data: string,
        inputEncoding: string,
        outputEncoding: string
      ) {
        const input =
          inputEncoding === "hex" ? Buffer.from(data, "hex").toString() : data;
        let result = "";
        for (let i = 0; i < input.length; i++) {
          const charCode =
            input.charCodeAt(i) ^ password.charCodeAt(i % password.length);
          result += String.fromCharCode(charCode);
        }
        return result;
      },
      final: function (outputEncoding: string) {
        return "";
      },
    };
  },
};

export default browserCrypto;
