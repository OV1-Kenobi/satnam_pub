/**
 * Type declarations for lib/crypto/privacy-manager.ts
 * CRITICAL: Privacy Manager type definitions with timing-safe operations
 */

export class PrivacyManager {
  static createAuthHash(pubkey: string): string;

  /**
   * Timing-safe equality check to prevent timing attacks.
   *
   * Compares two values in constant time, preventing information leakage through
   * timing differences. Prefer comparing fixed-length digests (e.g., HMACs, SHA-256 hashes).
   *
   * Accepts canonical strings (hex/base64/utf-8) or raw bytes (Uint8Array/Buffer).
   * Length differences are included in the comparison accumulator to prevent early exits.
   *
   * @param a - First value to compare (string or Uint8Array)
   * @param b - Second value to compare (string or Uint8Array)
   * @returns true if values are equal, false otherwise
   *
   * @example
   * // Compare hex-encoded hashes
   * const hash1 = "abc123def456";
   * const hash2 = "abc123def456";
   * const isEqual = PrivacyManager.constantTimeCompare(hash1, hash2); // true
   *
   * @example
   * // Compare raw bytes
   * const bytes1 = new Uint8Array([1, 2, 3, 4]);
   * const bytes2 = new Uint8Array([1, 2, 3, 4]);
   * const isEqual = PrivacyManager.constantTimeCompare(bytes1, bytes2); // true
   *
   * @security
   * - No early returns on length mismatch (length diff folded into accumulator)
   * - XOR-based comparison prevents branch prediction attacks
   * - Suitable for comparing authentication tokens, signatures, and password hashes
   * - NOT suitable for comparing plaintext passwords (use PBKDF2 + constantTimeCompare instead)
   */
  static constantTimeCompare(
    a: string | Uint8Array,
    b: string | Uint8Array
  ): boolean;

  static decryptUserData(encryptedData: string, userKey: string): Promise<any>;
  static generateAnonymousUsername(): string;
  static validateUsernameFormat(username: string): {
    valid: boolean;
    error?: string;
  };
  static encryptUserData(data: any, key: string): Promise<string>;
  static encryptPrivateKey(
    privateKey: string,
    password: string
  ): Promise<string>;
  static encryptServiceConfig(config: any, key: string): Promise<string>;
  static decryptPrivateKey(
    encryptedKey: string,
    password: string
  ): Promise<string>;
}
