/**
 * @fileoverview Shamir Secret Sharing Implementation for Nostr Keys
 * @description Implements SSS with flexible thresholds for family key management
 * Supports 2-of-2 to 5-of-7 configurations for different family sizes
 */

import { nip19 } from "../../../src/lib/nostr-browser";
import { PrivacyUtils } from "../privacy/encryption";

/**
 * Galois Field (GF(256)) operations for Shamir Secret Sharing
 */
class GaloisField {
  private static readonly FIELD_SIZE = 256;
  private static readonly PRIMITIVE_POLYNOMIAL = 0x11d; // x^8 + x^4 + x^3 + x^2 + 1

  // Precomputed log and antilog tables for faster computation
  private static logTable: number[] = [];
  private static antilogTable: number[] = [];

  static {
    this.initializeTables();
  }

  private static initializeTables(): void {
    this.logTable = new Array(this.FIELD_SIZE);
    this.antilogTable = new Array(this.FIELD_SIZE);

    let value = 1;
    for (let i = 0; i < this.FIELD_SIZE - 1; i++) {
      this.antilogTable[i] = value;
      this.logTable[value] = i;

      value = value << 1;
      if (value >= this.FIELD_SIZE) {
        value ^= this.PRIMITIVE_POLYNOMIAL;
      }
    }

    this.logTable[0] = -1; // log(0) is undefined
  }

  /**
   * Add two elements in GF(256)
   */
  static add(a: number, b: number): number {
    return a ^ b;
  }

  /**
   * Subtract two elements in GF(256) (same as addition in GF(2^n))
   */
  static subtract(a: number, b: number): number {
    return a ^ b;
  }

  /**
   * Multiply two elements in GF(256)
   */
  static multiply(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;

    const logA = this.logTable[a];
    const logB = this.logTable[b];
    const logProduct = (logA + logB) % (this.FIELD_SIZE - 1);

    return this.antilogTable[logProduct];
  }

  /**
   * Divide two elements in GF(256)
   */
  static divide(a: number, b: number): number {
    if (a === 0) return 0;
    if (b === 0) throw new Error("Division by zero in Galois Field");

    const logA = this.logTable[a];
    const logB = this.logTable[b];
    let logQuotient = logA - logB;

    if (logQuotient < 0) {
      logQuotient += this.FIELD_SIZE - 1;
    }

    return this.antilogTable[logQuotient];
  }

  /**
   * Evaluate polynomial at given x using Horner's method
   */
  static evaluatePolynomial(coefficients: number[], x: number): number {
    let result = 0;

    for (let i = coefficients.length - 1; i >= 0; i--) {
      result = this.add(this.multiply(result, x), coefficients[i]);
    }

    return result;
  }

  /**
   * Lagrange interpolation to reconstruct secret
   */
  static lagrangeInterpolation(
    points: Array<{ x: number; y: number }>,
  ): number {
    let result = 0;

    for (let i = 0; i < points.length; i++) {
      let numerator = 1;
      let denominator = 1;

      for (let j = 0; j < points.length; j++) {
        if (i !== j) {
          numerator = this.multiply(numerator, points[j].x);
          denominator = this.multiply(
            denominator,
            this.subtract(points[j].x, points[i].x),
          );
        }
      }

      const lagrangeCoeff = this.divide(numerator, denominator);
      result = this.add(result, this.multiply(points[i].y, lagrangeCoeff));
    }

    return result;
  }
}

/**
 * Individual share of a secret
 */
export interface SecretShare {
  shareId: string;
  shareIndex: number; // x-coordinate (1-based)
  shareValue: Uint8Array; // y-coordinate for each byte
  threshold: number;
  totalShares: number;
  createdAt: Date;
  expiresAt?: Date;
  metadata?: {
    familyId: string;
    keyId: string;
    shareType: "nsec" | "recovery";
  };
}

/**
 * Guardian information for key reconstruction
 */
export interface FamilyGuardian {
  guardianId: string;
  guardianUuid: string;
  familyId: string;
  role: "parent" | "trusted_adult" | "family_member" | "recovery_contact";
  publicKey: string; // For encrypting their share
  contactInfo?: {
    email?: string;
    nostrPubkey?: string;
    phone?: string;
  };
  shareIndices: number[]; // Which shares this guardian holds
  active: boolean;
  createdAt: Date;
  lastActivity?: Date;
  trustLevel: 1 | 2 | 3 | 4 | 5; // 5 = highest trust
}

/**
 * Family configuration for SSS thresholds
 */
export interface FamilySSLConfig {
  familyId: string;
  threshold: number; // Required signatures for reconstruction
  totalShares: number; // Total shares created
  shareDistribution: Array<{
    guardianId: string;
    shareIndices: number[];
  }>;
  emergencyRecovery: {
    enabled: boolean;
    emergencyThreshold?: number; // Lower threshold for emergency
    emergencyGuardians?: string[];
  };
  keyRotation: {
    enabled: boolean;
    rotationIntervalDays: number;
    lastRotation?: Date;
    nextRotation?: Date;
  };
  privacyLevel: 1 | 2 | 3;
}

/**
 * Shamir Secret Sharing for Nostr Keys
 */
export class NostrShamirSecretSharing {
  /**
   * Split a Nostr private key into shares using Shamir Secret Sharing
   */
  static async splitNsecIntoShares(
    nsec: string,
    threshold: number,
    totalShares: number,
    familyId: string,
    options?: {
      expiresInDays?: number;
      keyId?: string;
    },
  ): Promise<SecretShare[]> {
    try {
      // Validate inputs
      if (threshold < 2 || threshold > 7) {
        throw new Error("Threshold must be between 2 and 7");
      }

      if (totalShares < threshold || totalShares > 7) {
        throw new Error("Total shares must be between threshold and 7");
      }

      if (!nsec.startsWith("nsec")) {
        throw new Error("Invalid nsec format");
      }

      // Decode nsec to get the private key bytes
      const decoded = nip19.decode(nsec);
      const privateKeyHex = decoded.data as string;
      const privateKeyBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);

      if (privateKeyBytes.length !== 32) {
        throw new Error("Invalid private key length");
      }

      // Create shares for each byte of the private key
      const shares: SecretShare[] = [];
      const shareValues: Uint8Array[] = Array(totalShares)
        .fill(null)
        .map(() => new Uint8Array(32));

      // Process each byte of the private key
      for (let byteIndex = 0; byteIndex < 32; byteIndex++) {
        const secret = privateKeyBytes[byteIndex];

        // Generate random coefficients for polynomial
        const coefficients = [secret]; // a0 = secret
        for (let i = 1; i < threshold; i++) {
          // Use Web Crypto API for random number generation
          const randomBytes = crypto.getRandomValues(new Uint8Array(1));
          coefficients.push(randomBytes[0] % 256); // a1, a2, ..., a(threshold-1)
        }

        // Evaluate polynomial at x = 1, 2, ..., totalShares
        for (let shareIndex = 0; shareIndex < totalShares; shareIndex++) {
          const x = shareIndex + 1; // 1-based indexing
          const y = GaloisField.evaluatePolynomial(coefficients, x);
          shareValues[shareIndex][byteIndex] = y;
        }
      }

      // Create share objects
      const keyId = options?.keyId || PrivacyUtils.generateSecureUUID();
      const expiresAt = options?.expiresInDays
        ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
        : undefined;

      for (let i = 0; i < totalShares; i++) {
        shares.push({
          shareId: PrivacyUtils.generateSecureUUID(),
          shareIndex: i + 1,
          shareValue: shareValues[i],
          threshold,
          totalShares,
          createdAt: new Date(),
          expiresAt,
          metadata: {
            familyId,
            keyId,
            shareType: "nsec",
          },
        });
      }

      // Clear the private key from memory
      PrivacyUtils.secureClearMemory(nsec);
      privateKeyBytes.fill(0);

      return shares;
    } catch (error) {
      throw new Error(
        `Failed to split nsec into shares: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Reconstruct Nostr private key from shares
   */
  static async reconstructNsecFromShares(
    shares: SecretShare[],
  ): Promise<string> {
    try {
      if (shares.length === 0) {
        throw new Error("No shares provided");
      }

      const threshold = shares[0].threshold;

      if (shares.length < threshold) {
        throw new Error(
          `Insufficient shares: need ${threshold}, got ${shares.length}`,
        );
      }

      // Validate all shares are from the same secret
      const firstKeyId = shares[0].metadata?.keyId;
      const firstThreshold = shares[0].threshold;

      for (const share of shares) {
        if (share.metadata?.keyId !== firstKeyId) {
          throw new Error("Shares are from different secrets");
        }
        if (share.threshold !== firstThreshold) {
          throw new Error("Shares have different thresholds");
        }
      }

      // Check for duplicates
      const shareIndices = new Set(shares.map((s) => s.shareIndex));
      if (shareIndices.size !== shares.length) {
        throw new Error("Duplicate shares detected");
      }

      // Take only the required number of shares (threshold)
      const requiredShares = shares.slice(0, threshold);

      // Reconstruct each byte of the private key
      const reconstructedKey = new Uint8Array(32);

      for (let byteIndex = 0; byteIndex < 32; byteIndex++) {
        const points = requiredShares.map((share) => ({
          x: share.shareIndex,
          y: share.shareValue[byteIndex],
        }));

        // Use Lagrange interpolation to find the secret (value at x=0)
        // But we need to evaluate at x=0, so we adjust the calculation
        let result = 0;

        for (let i = 0; i < points.length; i++) {
          let numerator = 1;
          let denominator = 1;

          for (let j = 0; j < points.length; j++) {
            if (i !== j) {
              numerator = GaloisField.multiply(
                numerator,
                GaloisField.subtract(0, points[j].x),
              ); // 0 - x_j
              denominator = GaloisField.multiply(
                denominator,
                GaloisField.subtract(points[i].x, points[j].x),
              ); // x_i - x_j
            }
          }

          const lagrangeCoeff = GaloisField.divide(numerator, denominator);
          result = GaloisField.add(
            result,
            GaloisField.multiply(points[i].y, lagrangeCoeff),
          );
        }

        reconstructedKey[byteIndex] = result;
      }

      // Encode back to nsec format
      const hexKey = Array.from(reconstructedKey).map(b => b.toString(16).padStart(2, '0')).join('');
      const nsec = nip19.nsecEncode(hexKey);

      // Clear reconstructed key from memory
      reconstructedKey.fill(0);

      return nsec;
    } catch (error) {
      throw new Error(
        `Failed to reconstruct nsec from shares: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Validate a set of shares
   */
  static validateShares(shares: SecretShare[]): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (shares.length === 0) {
      errors.push("No shares provided");
      return { valid: false, errors, warnings };
    }

    // Check threshold consistency
    const threshold = shares[0].threshold;
    const totalShares = shares[0].totalShares;
    const keyId = shares[0].metadata?.keyId;

    for (const share of shares) {
      if (share.threshold !== threshold) {
        errors.push(
          `Inconsistent threshold: expected ${threshold}, got ${share.threshold}`,
        );
      }
      if (share.totalShares !== totalShares) {
        errors.push(
          `Inconsistent total shares: expected ${totalShares}, got ${share.totalShares}`,
        );
      }
      if (share.metadata?.keyId !== keyId) {
        errors.push("Shares are from different secrets");
      }
    }

    // Check for sufficient shares
    if (shares.length < threshold) {
      errors.push(
        `Insufficient shares: need ${threshold}, got ${shares.length}`,
      );
    }

    // Check for duplicates
    const shareIndices = new Set(shares.map((s) => s.shareIndex));
    if (shareIndices.size !== shares.length) {
      errors.push("Duplicate shares detected");
    }

    // Check expiration
    const now = new Date();
    for (const share of shares) {
      if (share.expiresAt && share.expiresAt < now) {
        warnings.push(`Share ${share.shareIndex} has expired`);
      }
    }

    // Check share value lengths
    for (const share of shares) {
      if (share.shareValue.length !== 32) {
        errors.push(`Invalid share value length for share ${share.shareIndex}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Generate recommended share distribution for family size
   */
  static recommendShareDistribution(familySize: number): {
    threshold: number;
    totalShares: number;
    distribution: string;
    description: string;
  } {
    if (familySize <= 2) {
      return {
        threshold: 2,
        totalShares: 2,
        distribution: "2-of-2",
        description:
          "Both adults required for key reconstruction. Suitable for couples with backup/inheritance needs.",
      };
    } else if (familySize <= 3) {
      return {
        threshold: 2,
        totalShares: 3,
        distribution: "2-of-3",
        description:
          "Any 2 of 3 family members can reconstruct the key. Provides redundancy if one member is unavailable.",
      };
    } else if (familySize <= 4) {
      return {
        threshold: 3,
        totalShares: 4,
        distribution: "3-of-4",
        description:
          "Majority (3 of 4) required for reconstruction. Good balance of security and availability.",
      };
    } else if (familySize <= 5) {
      return {
        threshold: 3,
        totalShares: 5,
        distribution: "3-of-5",
        description:
          "Majority (3 of 5) required. Allows for 2 members to be unavailable while maintaining security.",
      };
    } else if (familySize <= 7) {
      return {
        threshold: 4,
        totalShares: 7,
        distribution: "4-of-7",
        description:
          "Super-majority (4 of 7) required. High security for larger families with multiple trusted members.",
      };
    } else {
      return {
        threshold: 5,
        totalShares: 7,
        distribution: "5-of-7",
        description:
          "High-security threshold for very large families. Requires strong consensus for key reconstruction.",
      };
    }
  }

  /**
   * Create emergency recovery configuration
   */
  static createEmergencyConfig(
    primaryThreshold: number,
    emergencyGuardians: string[],
  ): {
    emergencyThreshold: number;
    emergencyShares: number;
    description: string;
  } {
    // Emergency threshold is typically 1 less than primary, but minimum 2
    const emergencyThreshold = Math.max(2, primaryThreshold - 1);
    const emergencyShares = Math.min(
      emergencyGuardians.length,
      primaryThreshold,
    );

    return {
      emergencyThreshold,
      emergencyShares,
      description: `Emergency recovery requires ${emergencyThreshold} of ${emergencyShares} designated emergency guardians.`,
    };
  }
}
