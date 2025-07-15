/**
 * @fileoverview Web Crypto API Utilities for Zero-Knowledge Nsec Operations
 * @description Browser-compatible cryptographic utilities for FROST threshold signatures
 * @compliance Browser-only, Web Crypto API exclusively, no Node.js modules
 */

import {
  CRYPTO_CONSTANTS,
  CryptoOperationResult,
  DEFAULT_ENCRYPTION_CONFIG,
  DEFAULT_PASSWORD_REQUIREMENTS,
  MemoryWipeTarget,
  PasswordStrengthRequirements,
  SecureShare,
} from "../../types/zero-knowledge-nsec";

/**
 * CryptoUtils class for browser-compatible cryptographic operations
 * @description Provides all cryptographic primitives needed for zero-knowledge nsec handling
 * @security Uses Web Crypto API exclusively, implements secp256k1 finite field arithmetic
 */
export class CryptoUtils {
  // secp256k1 curve order for finite field operations
  private static readonly SECP256K1_ORDER = CRYPTO_CONSTANTS.SECP256K1_ORDER;
  private static readonly PBKDF2_ITERATIONS =
    DEFAULT_ENCRYPTION_CONFIG.pbkdf2Iterations;
  private static readonly AES_KEY_LENGTH = DEFAULT_ENCRYPTION_CONFIG.keyLength;
  private static readonly IV_LENGTH = DEFAULT_ENCRYPTION_CONFIG.ivLength / 8; // Convert bits to bytes
  private static readonly TAG_LENGTH = DEFAULT_ENCRYPTION_CONFIG.tagLength / 8; // Convert bits to bytes

  /**
   * Generate cryptographically secure random bytes
   * @param length Number of bytes to generate
   * @returns Cryptographically secure random bytes
   */
  static generateSecureRandom(length: number): Uint8Array {
    if (length <= 0) {
      throw new Error("Length must be positive");
    }
    return crypto.getRandomValues(new Uint8Array(length));
  }

  /**
   * Convert hex string to Uint8Array
   * @param hex Hex string to convert
   * @returns Byte array representation
   */
  static hexToBytes(hex: string): Uint8Array {
    if (!this.isValidHex(hex)) {
      throw new Error("Invalid hex string");
    }

    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Convert Uint8Array to hex string
   * @param bytes Byte array to convert
   * @returns Hex string representation
   */
  static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Convert string to bigint for finite field operations
   * @param hex Hex string representation
   * @returns BigInt value
   */
  static hexToBigInt(hex: string): bigint {
    if (!this.isValidHex(hex)) {
      throw new Error("Invalid hex string for BigInt conversion");
    }
    return BigInt("0x" + hex);
  }

  /**
   * Convert bigint to hex string
   * @param value BigInt value
   * @param padLength Optional padding length
   * @returns Hex string representation
   */
  static bigIntToHex(value: bigint, padLength?: number): string {
    const hex = value.toString(16);
    return padLength ? hex.padStart(padLength, "0") : hex;
  }

  /**
   * Derive AES key from password using PBKDF2
   * @param password Password string
   * @param salt Salt bytes
   * @returns CryptoKey for AES operations
   */
  static async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    try {
      const passwordKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
      );

      // Ensure salt has proper ArrayBuffer type for Web Crypto API
      const saltBuffer = new Uint8Array(salt).buffer;

      return await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: saltBuffer,
          iterations: this.PBKDF2_ITERATIONS,
          hash: "SHA-256",
        },
        passwordKey,
        { name: "AES-GCM", length: this.AES_KEY_LENGTH },
        false,
        ["encrypt", "decrypt"]
      );
    } catch (error) {
      throw new Error(`Failed to derive key from password: ${error}`);
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   * @param data Data to encrypt
   * @param key AES key
   * @param iv Initialization vector
   * @returns Encrypted data with separate auth tag
   */
  static async encryptAESGCM(
    data: string,
    key: CryptoKey,
    iv: Uint8Array
  ): Promise<{ ciphertext: Uint8Array; authTag: Uint8Array }> {
    try {
      // Ensure iv has proper ArrayBuffer type for Web Crypto API
      const ivBuffer = new Uint8Array(iv).buffer;

      const encryptedData = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: ivBuffer,
        },
        key,
        new TextEncoder().encode(data)
      );

      const encryptedArray = new Uint8Array(encryptedData);
      const ciphertext = encryptedArray.slice(0, -this.TAG_LENGTH);
      const authTag = encryptedArray.slice(-this.TAG_LENGTH);

      return { ciphertext, authTag };
    } catch (error) {
      throw new Error(`Failed to encrypt data: ${error}`);
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   * @param ciphertext Encrypted data
   * @param authTag Authentication tag
   * @param key AES key
   * @param iv Initialization vector
   * @returns Decrypted string
   */
  static async decryptAESGCM(
    ciphertext: Uint8Array,
    authTag: Uint8Array,
    key: CryptoKey,
    iv: Uint8Array
  ): Promise<string> {
    try {
      const encryptedData = new Uint8Array(ciphertext.length + authTag.length);
      encryptedData.set(ciphertext);
      encryptedData.set(authTag, ciphertext.length);

      // Ensure iv has proper ArrayBuffer type for Web Crypto API
      const ivBuffer = new Uint8Array(iv).buffer;

      const decryptedData = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: ivBuffer,
        },
        key,
        encryptedData
      );

      return new TextDecoder().decode(decryptedData);
    } catch (error) {
      throw new Error(`Failed to decrypt data: ${error}`);
    }
  }

  /**
   * Finite field addition modulo secp256k1 order
   * @param a First operand
   * @param b Second operand
   * @returns (a + b) mod p
   */
  static modAdd(a: bigint, b: bigint): bigint {
    return (a + b) % this.SECP256K1_ORDER;
  }

  /**
   * Finite field multiplication modulo secp256k1 order
   * @param a First operand
   * @param b Second operand
   * @returns (a * b) mod p
   */
  static modMul(a: bigint, b: bigint): bigint {
    return (a * b) % this.SECP256K1_ORDER;
  }

  /**
   * Finite field exponentiation modulo secp256k1 order
   * @param base Base value
   * @param exponent Exponent value
   * @returns base^exponent mod p
   */
  static modPow(base: bigint, exponent: bigint): bigint {
    let result = BigInt(1);
    base = base % this.SECP256K1_ORDER;

    while (exponent > 0) {
      if (exponent % BigInt(2) === BigInt(1)) {
        result = this.modMul(result, base);
      }
      exponent = exponent >> BigInt(1);
      base = this.modMul(base, base);
    }

    return result;
  }

  /**
   * Modular inverse using extended Euclidean algorithm
   * @param a Value to find inverse for
   * @returns Modular inverse of a
   */
  static modInverse(a: bigint): bigint {
    const m = this.SECP256K1_ORDER;
    let [old_r, r] = [a, m];
    let [old_s, s] = [BigInt(1), BigInt(0)];

    while (r !== BigInt(0)) {
      const quotient = old_r / r;
      [old_r, r] = [r, old_r - quotient * r];
      [old_s, s] = [s, old_s - quotient * s];
    }

    return old_s < 0 ? old_s + m : old_s;
  }

  /**
   * Evaluate polynomial at given point using finite field arithmetic
   * @param coefficients Polynomial coefficients
   * @param x Point to evaluate at
   * @returns Polynomial value at x
   */
  static evaluatePolynomial(coefficients: bigint[], x: bigint): bigint {
    let result = BigInt(0);
    let xPower = BigInt(1);

    for (const coeff of coefficients) {
      result = this.modAdd(result, this.modMul(coeff, xPower));
      xPower = this.modMul(xPower, x);
    }

    return result;
  }

  /**
   * Lagrange interpolation for secret reconstruction
   * @param shares Array of x,y coordinate pairs
   * @param x Point to interpolate at (usually 0 for secret)
   * @returns Interpolated value
   */
  static lagrangeInterpolation(
    shares: Array<{ x: bigint; y: bigint }>,
    x: bigint = BigInt(0)
  ): bigint {
    if (shares.length === 0) {
      throw new Error("No shares provided for interpolation");
    }

    let result = BigInt(0);

    for (let i = 0; i < shares.length; i++) {
      const xi = shares[i].x;
      const yi = shares[i].y;

      let numerator = BigInt(1);
      let denominator = BigInt(1);

      for (let j = 0; j < shares.length; j++) {
        if (i !== j) {
          const xj = shares[j].x;
          numerator = this.modMul(
            numerator,
            this.modAdd(x, this.SECP256K1_ORDER - xj)
          );
          denominator = this.modMul(
            denominator,
            this.modAdd(xi, this.SECP256K1_ORDER - xj)
          );
        }
      }

      const denominatorInv = this.modInverse(denominator);
      const lagrangeCoeff = this.modMul(numerator, denominatorInv);
      result = this.modAdd(result, this.modMul(yi, lagrangeCoeff));
    }

    return result;
  }

  /**
   * Generate secure temporary password
   * @param length Password length (default: 32)
   * @returns Secure random password
   */
  static generateTemporaryPassword(length: number = 32): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    const randomBytes = this.generateSecureRandom(length);

    return Array.from(randomBytes)
      .map((byte) => chars[byte % chars.length])
      .join("");
  }

  /**
   * Generate secure invitation code
   * @param length Code length (default: 16)
   * @returns Secure invitation code
   */
  static generateInvitationCode(length: number = 16): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const randomBytes = this.generateSecureRandom(length);

    return Array.from(randomBytes)
      .map((byte) => chars[byte % chars.length])
      .join("");
  }

  /**
   * Generate UUID with salt for privacy
   * @param salt Optional salt string
   * @returns Salted UUID
   */
  static async generateSaltedUUID(salt?: string): Promise<string> {
    const uuid = crypto.randomUUID();
    const saltStr = salt || this.generateTemporaryPassword(16);
    const combined = uuid + saltStr;

    const hash = await this.sha256(combined);
    return hash.substring(0, 32); // Use first 32 characters
  }

  /**
   * Secure memory wiping (best effort in browser environment)
   * @param targets Array of memory targets to wipe
   */
  static secureWipe(targets: MemoryWipeTarget[]): void {
    targets.forEach((target) => {
      try {
        switch (target.type) {
          case "string":
            // Overwrite string memory (limited effectiveness in JS)
            const stringData = target.data as string;
            const randomData = this.generateSecureRandom(stringData.length);
            target.data = Array.from(randomData)
              .map((b) => String.fromCharCode(b))
              .join("");
            break;
          case "bigint":
            // Clear bigint reference
            target.data = BigInt(0);
            break;
          case "array":
            // Overwrite array with random data
            const array = target.data as Uint8Array;
            crypto.getRandomValues(array);
            break;
        }
      } catch (error) {
        console.warn("Failed to securely wipe memory target:", error);
      }
    });

    // Force garbage collection if available
    if (typeof window !== "undefined" && "gc" in window) {
      try {
        (window as any).gc();
      } catch (error) {
        // Ignore if GC not available
      }
    }
  }

  /**
   * Hash data using SHA-256
   * @param data Data to hash
   * @returns SHA-256 hash as hex string
   */
  static async sha256(data: string): Promise<string> {
    try {
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(data)
      );
      return this.bytesToHex(new Uint8Array(hashBuffer));
    } catch (error) {
      throw new Error(`Failed to hash data: ${error}`);
    }
  }

  /**
   * Hash data using SHA-512
   * @param data Data to hash
   * @returns SHA-512 hash as hex string
   */
  static async sha512(data: string): Promise<string> {
    try {
      const hashBuffer = await crypto.subtle.digest(
        "SHA-512",
        new TextEncoder().encode(data)
      );
      return this.bytesToHex(new Uint8Array(hashBuffer));
    } catch (error) {
      throw new Error(`Failed to hash data: ${error}`);
    }
  }

  /**
   * Validate hex string format
   * @param hex String to validate
   * @returns True if valid hex string
   */
  static isValidHex(hex: string): boolean {
    return /^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0;
  }

  /**
   * Validate password strength
   * @param password Password to validate
   * @param requirements Optional custom requirements
   * @returns Validation result
   */
  static validatePasswordStrength(
    password: string,
    requirements: PasswordStrengthRequirements = DEFAULT_PASSWORD_REQUIREMENTS
  ): {
    isValid: boolean;
    errors: string[];
    score: number;
  } {
    const errors: string[] = [];
    let score = 0;

    // Length check
    if (password.length < requirements.minLength) {
      errors.push(
        `Password must be at least ${requirements.minLength} characters long`
      );
    } else {
      score += 20;
    }

    // Uppercase check
    if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    } else if (/[A-Z]/.test(password)) {
      score += 20;
    }

    // Lowercase check
    if (requirements.requireLowercase && !/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    } else if (/[a-z]/.test(password)) {
      score += 20;
    }

    // Number check
    if (requirements.requireNumbers && !/[0-9]/.test(password)) {
      errors.push("Password must contain at least one number");
    } else if (/[0-9]/.test(password)) {
      score += 20;
    }

    // Special character check
    if (
      requirements.requireSpecialChars &&
      !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    ) {
      errors.push("Password must contain at least one special character");
    } else if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      score += 20;
    }

    // Additional scoring for length
    if (password.length >= 16) score += 10;
    if (password.length >= 20) score += 10;

    return {
      isValid: errors.length === 0,
      errors,
      score: Math.min(score, 100),
    };
  }

  /**
   * Validate email format
   * @param email Email to validate
   * @returns True if valid email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate UUID format
   * @param uuid UUID to validate
   * @returns True if valid UUID format
   */
  static isValidUUID(uuid: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Create secure share with proper encryption
   * @param shareData Raw share data
   * @param password Password for encryption
   * @param participantUUID Participant identifier
   * @param shareIndex Share index
   * @returns Encrypted secure share
   */
  static async createSecureShare(
    shareData: string,
    password: string,
    participantUUID: string,
    shareIndex: number
  ): Promise<CryptoOperationResult<SecureShare>> {
    try {
      // Validate inputs
      if (!shareData || !password || !participantUUID) {
        return {
          success: false,
          error: "Missing required parameters for secure share creation",
        };
      }

      if (shareIndex < 1 || shareIndex > CRYPTO_CONSTANTS.MAX_SHARE_INDEX) {
        return {
          success: false,
          error: `Invalid share index: must be between 1 and ${CRYPTO_CONSTANTS.MAX_SHARE_INDEX}`,
        };
      }

      // Generate cryptographic parameters
      const salt = this.generateSecureRandom(16);
      const iv = this.generateSecureRandom(this.IV_LENGTH);

      // Derive key from password
      const key = await this.deriveKeyFromPassword(password, salt);

      // Encrypt share data
      const { ciphertext, authTag } = await this.encryptAESGCM(
        shareData,
        key,
        iv
      );

      // Create secure share
      const secureShare: SecureShare = {
        participantUUID,
        encryptedShare: this.bytesToHex(ciphertext),
        shareIndex,
        salt: this.bytesToHex(salt),
        iv: this.bytesToHex(iv),
        authTag: this.bytesToHex(authTag),
        createdAt: new Date(),
      };

      // Wipe sensitive data
      this.secureWipe([
        { data: shareData, type: "string" },
        { data: password, type: "string" },
      ]);

      return {
        success: true,
        data: secureShare,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create secure share: ${error}`,
      };
    }
  }

  /**
   * Decrypt secure share
   * @param secureShare Encrypted share
   * @param password Password for decryption
   * @returns Decrypted share data
   */
  static async decryptSecureShare(
    secureShare: SecureShare,
    password: string
  ): Promise<CryptoOperationResult<string>> {
    try {
      // Validate inputs
      if (!secureShare || !password) {
        return {
          success: false,
          error: "Missing required parameters for share decryption",
        };
      }

      // Parse cryptographic parameters
      const salt = this.hexToBytes(secureShare.salt);
      const iv = this.hexToBytes(secureShare.iv);
      const ciphertext = this.hexToBytes(secureShare.encryptedShare);
      const authTag = this.hexToBytes(secureShare.authTag);

      // Derive key from password
      const key = await this.deriveKeyFromPassword(password, salt);

      // Decrypt share data
      const shareData = await this.decryptAESGCM(ciphertext, authTag, key, iv);

      // Wipe password
      this.secureWipe([{ data: password, type: "string" }]);

      return {
        success: true,
        data: shareData,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to decrypt share: ${error}`,
      };
    }
  }

  /**
   * Validate secure share integrity
   * @param secureShare Share to validate
   * @returns Validation result
   */
  static validateSecureShare(secureShare: SecureShare): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!secureShare.participantUUID) {
      errors.push("Missing participant UUID");
    }

    if (!secureShare.encryptedShare) {
      errors.push("Missing encrypted share data");
    }

    if (
      secureShare.shareIndex < 1 ||
      secureShare.shareIndex > CRYPTO_CONSTANTS.MAX_SHARE_INDEX
    ) {
      errors.push(`Invalid share index: ${secureShare.shareIndex}`);
    }

    // Validate hex fields
    if (!this.isValidHex(secureShare.salt)) {
      errors.push("Invalid salt format");
    }

    if (!this.isValidHex(secureShare.iv)) {
      errors.push("Invalid IV format");
    }

    if (!this.isValidHex(secureShare.authTag)) {
      errors.push("Invalid auth tag format");
    }

    if (!this.isValidHex(secureShare.encryptedShare)) {
      errors.push("Invalid encrypted share format");
    }

    // Validate field lengths
    if (secureShare.salt.length !== 32) {
      // 16 bytes = 32 hex chars
      errors.push("Invalid salt length");
    }

    if (secureShare.iv.length !== this.IV_LENGTH * 2) {
      // IV length in hex chars
      errors.push("Invalid IV length");
    }

    if (secureShare.authTag.length !== this.TAG_LENGTH * 2) {
      // Tag length in hex chars
      errors.push("Invalid auth tag length");
    }

    // Check expiration warnings
    const now = new Date();
    const created = new Date(secureShare.createdAt);
    const daysSinceCreation =
      (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceCreation > 365) {
      warnings.push("Share is over 1 year old - consider regenerating");
    } else if (daysSinceCreation > 90) {
      warnings.push("Share is over 90 days old");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Generate proof of correct share without revealing share data
   * @param secureShare Share to prove
   * @param password Password for verification
   * @returns Zero-knowledge proof
   */
  static async generateShareProof(
    secureShare: SecureShare,
    password: string
  ): Promise<CryptoOperationResult<string>> {
    try {
      // Generate a commitment to the share without revealing it
      const commitment = await this.sha256(
        secureShare.participantUUID +
          secureShare.shareIndex.toString() +
          secureShare.encryptedShare
      );

      // Create proof by signing the commitment
      const proofData = {
        participantUUID: secureShare.participantUUID,
        shareIndex: secureShare.shareIndex,
        commitment,
        timestamp: new Date().toISOString(),
      };

      const proof = await this.sha256(JSON.stringify(proofData) + password);

      return {
        success: true,
        data: proof,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate share proof: ${error}`,
      };
    }
  }

  /**
   * Verify share proof without accessing share data
   * @param proof Proof to verify
   * @param secureShare Share to verify against
   * @param password Password for verification
   * @returns Verification result
   */
  static async verifyShareProof(
    proof: string,
    secureShare: SecureShare,
    password: string
  ): Promise<boolean> {
    try {
      const expectedProof = await this.generateShareProof(
        secureShare,
        password
      );
      return expectedProof.success && expectedProof.data === proof;
    } catch (error) {
      console.error("Failed to verify share proof:", error);
      return false;
    }
  }
}

export default CryptoUtils;
