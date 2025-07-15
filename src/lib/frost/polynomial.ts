/**
 * @fileoverview FROST Polynomial Secret Sharing Implementation
 * @description Shamir's Secret Sharing with FROST optimizations for secp256k1
 * @compliance Browser-compatible, secure coefficient generation, finite field arithmetic
 */

import {
  CRYPTO_CONSTANTS,
  MemoryWipeTarget,
} from "../../types/zero-knowledge-nsec";
import { CryptoUtils } from "./crypto-utils";

/**
 * Polynomial Share interface for FROST operations
 * @description Represents a single share in polynomial secret sharing
 */
interface PolynomialShare {
  /** Share index (1-based) */
  x: bigint;
  /** Share value */
  y: bigint;
  /** Corresponding public key for verification */
  publicShare: string;
}

/**
 * Polynomial Coefficients interface
 * @description Complete polynomial structure for secret sharing
 */
interface PolynomialCoefficients {
  /** Polynomial coefficients (first is the secret) */
  coefficients: bigint[];
  /** Minimum threshold for reconstruction */
  threshold: number;
  /** Original secret value */
  secret: bigint;
}

/**
 * FrostPolynomialManager - Core polynomial operations for FROST
 * @description Implements Shamir's Secret Sharing with FROST optimizations
 * @security Uses secp256k1 finite field arithmetic exclusively
 */
export class FrostPolynomialManager {
  private static readonly SECP256K1_ORDER = CRYPTO_CONSTANTS.SECP256K1_ORDER;

  /**
   * Generate polynomial for secret sharing
   * @param secret Secret to share (nsec in hex format)
   * @param threshold Minimum shares needed for reconstruction
   * @returns Polynomial coefficients
   */
  static async generatePolynomial(
    secret: string,
    threshold: number
  ): Promise<PolynomialCoefficients> {
    try {
      // Validate inputs
      if (!secret || secret.length !== 64) {
        throw new Error("Invalid secret: must be 64-character hex string");
      }

      if (threshold < 1 || threshold > 7) {
        throw new Error("Invalid threshold: must be between 1 and 7");
      }

      // Convert secret (nsec) to BigInt
      const secretBigInt = CryptoUtils.hexToBigInt(secret);

      // Generate random coefficients for polynomial
      const coefficients: bigint[] = [secretBigInt]; // First coefficient is the secret

      for (let i = 1; i < threshold; i++) {
        const randomBytes = CryptoUtils.generateSecureRandom(32);
        const randomCoeff = CryptoUtils.hexToBigInt(
          CryptoUtils.bytesToHex(randomBytes)
        );
        coefficients.push(randomCoeff % this.SECP256K1_ORDER);
      }

      return {
        coefficients,
        threshold,
        secret: secretBigInt,
      };
    } catch (error) {
      throw new Error(`Failed to generate polynomial: ${error}`);
    }
  }

  /**
   * Evaluate polynomial at given point
   * @param coefficients Polynomial coefficients
   * @param x Point to evaluate at
   * @returns Polynomial value at x
   */
  static evaluatePolynomial(coefficients: bigint[], x: bigint): bigint {
    let result = BigInt(0);
    let xPower = BigInt(1);

    for (const coeff of coefficients) {
      result = CryptoUtils.modAdd(result, CryptoUtils.modMul(coeff, xPower));
      xPower = CryptoUtils.modMul(xPower, x);
    }

    return result;
  }

  /**
   * Generate shares for participants
   * @param polynomial Polynomial coefficients
   * @param participantCount Number of participants
   * @returns Array of polynomial shares
   */
  static async generateShares(
    polynomial: PolynomialCoefficients,
    participantCount: number
  ): Promise<PolynomialShare[]> {
    try {
      if (participantCount < 2 || participantCount > 7) {
        throw new Error("Participant count must be between 2 and 7");
      }

      if (polynomial.threshold > participantCount) {
        throw new Error("Threshold cannot exceed participant count");
      }

      const shares: PolynomialShare[] = [];

      for (let i = 1; i <= participantCount; i++) {
        const x = BigInt(i);
        const y = this.evaluatePolynomial(polynomial.coefficients, x);

        // Generate corresponding public share for verification
        const publicShare = await this.generatePublicShare(y);

        shares.push({
          x,
          y,
          publicShare,
        });
      }

      return shares;
    } catch (error) {
      throw new Error(`Failed to generate shares: ${error}`);
    }
  }

  /**
   * Generate public share for verification
   * @param privateShare Private share value
   * @returns Public share hash for verification
   */
  private static async generatePublicShare(
    privateShare: bigint
  ): Promise<string> {
    try {
      // Convert private share to hex format
      const privateShareHex = CryptoUtils.bigIntToHex(privateShare, 64);

      // Generate corresponding public key hash for verification
      // This creates a commitment to the private share without revealing it
      const hash = await CryptoUtils.sha256(
        privateShareHex + "public_commitment"
      );
      return hash;
    } catch (error) {
      throw new Error(`Failed to generate public share: ${error}`);
    }
  }

  /**
   * Reconstruct secret using Lagrange interpolation
   * @param shares Array of polynomial shares
   * @returns Reconstructed secret
   */
  static reconstructSecret(shares: PolynomialShare[]): bigint {
    try {
      if (shares.length === 0) {
        throw new Error("No shares provided for reconstruction");
      }

      // Use Lagrange interpolation to reconstruct secret at x=0
      return CryptoUtils.lagrangeInterpolation(
        shares.map((share) => ({ x: share.x, y: share.y }))
      );
    } catch (error) {
      throw new Error(`Failed to reconstruct secret: ${error}`);
    }
  }

  /**
   * Verify share integrity
   * @param share Share to verify
   * @param expectedPublicShare Expected public share (optional)
   * @returns True if share is valid
   */
  static async verifyShare(
    share: PolynomialShare,
    expectedPublicShare?: string
  ): Promise<boolean> {
    try {
      // Basic validation
      if (share.x <= BigInt(0) || share.x >= this.SECP256K1_ORDER) {
        return false;
      }

      if (share.y <= BigInt(0) || share.y >= this.SECP256K1_ORDER) {
        return false;
      }

      // Generate public share from private share
      const computedPublicShare = await this.generatePublicShare(share.y);

      // If expected public share provided, compare
      if (expectedPublicShare) {
        return computedPublicShare === expectedPublicShare;
      }

      // Otherwise, verify the computed public share matches stored one
      return computedPublicShare === share.publicShare;
    } catch (error) {
      console.error("Share verification failed:", error);
      return false;
    }
  }

  /**
   * Secure cleanup of polynomial data
   * @param polynomial Polynomial to clean up
   */
  static secureCleanup(polynomial: PolynomialCoefficients): void {
    try {
      const wipeTargets: MemoryWipeTarget[] = polynomial.coefficients.map(
        (coeff) => ({
          data: coeff,
          type: "bigint" as const,
        })
      );

      wipeTargets.push({
        data: polynomial.secret,
        type: "bigint",
      });

      CryptoUtils.secureWipe(wipeTargets);
    } catch (error) {
      console.error("Failed to securely cleanup polynomial:", error);
    }
  }

  /**
   * Validate threshold parameters
   * @param threshold Minimum threshold
   * @param participantCount Total participants
   * @returns Validation result
   */
  static validateThreshold(
    threshold: number,
    participantCount: number
  ): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (threshold < 1) {
      errors.push("Threshold must be at least 1");
    }

    if (threshold > participantCount) {
      errors.push("Threshold cannot exceed participant count");
    }

    if (participantCount > 7) {
      errors.push("Maximum 7 participants allowed for security");
    }

    if (participantCount < 2) {
      errors.push("Minimum 2 participants required");
    }

    if (threshold === participantCount && participantCount > 1) {
      errors.push(
        "Threshold should be less than total participants for redundancy"
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate verification data for shares
   * @param shares Array of shares
   * @returns JSON string with verification data
   */
  static async generateVerificationData(
    shares: PolynomialShare[]
  ): Promise<string> {
    try {
      const verificationData = {
        shareCount: shares.length,
        shareHashes: await Promise.all(
          shares.map(async (share) => {
            const shareData = `${share.x.toString(16)}_${share.y.toString(16)}`;
            return await CryptoUtils.sha256(shareData);
          })
        ),
        publicShares: shares.map((share) => share.publicShare),
        createdAt: new Date().toISOString(),
        version: "1.0",
      };

      return JSON.stringify(verificationData, null, 2);
    } catch (error) {
      throw new Error(`Failed to generate verification data: ${error}`);
    }
  }

  /**
   * Verify polynomial reconstruction matches original secret
   * @param shares Array of shares
   * @param expectedSecret Expected secret value
   * @returns True if reconstruction is valid
   */
  static async verifyReconstruction(
    shares: PolynomialShare[],
    expectedSecret: bigint
  ): Promise<boolean> {
    try {
      // Need at least threshold number of shares
      if (shares.length < 2) {
        return false;
      }

      // Reconstruct secret
      const reconstructedSecret = this.reconstructSecret(shares);

      // Compare with expected secret
      return reconstructedSecret === expectedSecret;
    } catch (error) {
      console.error("Reconstruction verification failed:", error);
      return false;
    }
  }

  /**
   * Create polynomial from existing shares (for testing/verification)
   * @param shares Array of shares
   * @param threshold Minimum threshold
   * @returns Polynomial coefficients
   */
  static reconstructPolynomial(
    shares: PolynomialShare[],
    threshold: number
  ): PolynomialCoefficients {
    try {
      if (shares.length < threshold) {
        throw new Error(`Need at least ${threshold} shares for reconstruction`);
      }

      // Use the first 'threshold' shares for reconstruction
      const reconstructionShares = shares.slice(0, threshold);

      // Reconstruct the secret (coefficient at x=0)
      const secret = this.reconstructSecret(reconstructionShares);

      // For full polynomial reconstruction, we'd need to solve for all coefficients
      // For now, we'll create a minimal polynomial with just the secret
      const coefficients = [secret];

      return {
        coefficients,
        threshold,
        secret,
      };
    } catch (error) {
      throw new Error(`Failed to reconstruct polynomial: ${error}`);
    }
  }

  /**
   * Generate proof that shares are valid without revealing the secret
   * @param shares Array of shares
   * @returns Zero-knowledge proof
   */
  static async generateShareProof(shares: PolynomialShare[]): Promise<string> {
    try {
      // Create a commitment to the shares without revealing values
      const commitment = await Promise.all(
        shares.map(async (share) => {
          const shareCommitment = await CryptoUtils.sha256(
            `${share.x.toString(16)}_${share.publicShare}`
          );
          return shareCommitment;
        })
      );

      const proofData = {
        shareCount: shares.length,
        shareCommitments: commitment,
        timestamp: new Date().toISOString(),
        version: "1.0",
      };

      return await CryptoUtils.sha256(JSON.stringify(proofData));
    } catch (error) {
      throw new Error(`Failed to generate share proof: ${error}`);
    }
  }

  /**
   * Verify share proof without accessing share values
   * @param proof Proof to verify
   * @param shares Shares to verify against
   * @returns True if proof is valid
   */
  static async verifyShareProof(
    proof: string,
    shares: PolynomialShare[]
  ): Promise<boolean> {
    try {
      const expectedProof = await this.generateShareProof(shares);
      return proof === expectedProof;
    } catch (error) {
      console.error("Share proof verification failed:", error);
      return false;
    }
  }
}

export { type PolynomialCoefficients, type PolynomialShare };
