// Browser-compatible Shamir secret sharing using Web Crypto API
// NO Node.js dependencies - uses Web Crypto API for cryptographic operations

import { generateSecureToken } from '../privacy/encryption';

// Shamir secret sharing interface
export interface ShamirShare {
  x: number;
  y: string;
  index: number;
}

export interface ShamirConfig {
  threshold: number;
  totalShares: number;
  secret: string;
}

// Nostr Shamir secret sharing class
export class NostrShamirSecretSharing {
  private prime: bigint;
  private fieldSize: bigint;

  constructor() {
    // Use a large prime for the finite field
    this.prime = BigInt('0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47');
    this.fieldSize = this.prime;
  }

  /**
   * Generate Shamir secret shares
   */
  async generateShares(config: ShamirConfig): Promise<ShamirShare[]> {
    const { threshold, totalShares, secret } = config;
    
    if (threshold > totalShares) {
      throw new Error('Threshold cannot be greater than total shares');
    }

    // Convert secret to bigint
    const secretBigInt = this.stringToBigInt(secret);
    
    // Generate random coefficients for polynomial
    const coefficients: bigint[] = [secretBigInt];
    for (let i = 1; i < threshold; i++) {
      coefficients.push(this.generateRandomBigInt());
    }

    // Generate shares
    const shares: ShamirShare[] = [];
    for (let i = 1; i <= totalShares; i++) {
      const x = BigInt(i);
      const y = this.evaluatePolynomial(coefficients, x);
      
      shares.push({
        x: Number(x),
        y: this.bigIntToString(y),
        index: i
      });
    }

    return shares;
  }

  /**
   * Reconstruct secret from shares
   */
  async reconstructSecret(shares: ShamirShare[]): Promise<string> {
    if (shares.length < 2) {
      throw new Error('Need at least 2 shares to reconstruct secret');
    }

    // Convert shares to bigint coordinates
    const points: [bigint, bigint][] = shares.map(share => [
      BigInt(share.x),
      this.stringToBigInt(share.y)
    ]);

    // Use Lagrange interpolation to reconstruct the secret
    const secret = this.lagrangeInterpolate(points);
    return this.bigIntToString(secret);
  }

  /**
   * Evaluate polynomial at point x
   */
  private evaluatePolynomial(coefficients: bigint[], x: bigint): bigint {
    let result = BigInt(0);
    let power = BigInt(1);

    for (const coefficient of coefficients) {
      result = (result + (coefficient * power)) % this.fieldSize;
      power = (power * x) % this.fieldSize;
    }

    return result;
  }

  /**
   * Lagrange interpolation to reconstruct polynomial
   */
  private lagrangeInterpolate(points: [bigint, bigint][]): bigint {
    const n = points.length;
    let result = BigInt(0);

    for (let i = 0; i < n; i++) {
      let term = points[i][1];
      let denominator = BigInt(1);

      for (let j = 0; j < n; j++) {
        if (i !== j) {
          term = (term * (BigInt(0) - points[j][0])) % this.fieldSize;
          denominator = (denominator * (points[i][0] - points[j][0])) % this.fieldSize;
        }
      }

      // Calculate modular multiplicative inverse
      const inverse = this.modInverse(denominator, this.fieldSize);
      result = (result + (term * inverse)) % this.fieldSize;
    }

    return result;
  }

  /**
   * Calculate modular multiplicative inverse
   */
  private modInverse(a: bigint, m: bigint): bigint {
    let [old_r, r] = [a, m];
    let [old_s, s] = [BigInt(1), BigInt(0)];
    let [old_t, t] = [BigInt(0), BigInt(1)];

    while (r !== BigInt(0)) {
      const quotient = old_r / r;
      [old_r, r] = [r, old_r - quotient * r];
      [old_s, s] = [s, old_s - quotient * s];
      [old_t, t] = [t, old_t - quotient * t];
    }

    return (old_s % m + m) % m;
  }

  /**
   * Generate random bigint in field
   */
  private generateRandomBigInt(): bigint {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    
    let value = BigInt(0);
    for (let i = 0; i < 32; i++) {
      value = (value * BigInt(256) + BigInt(randomBytes[i])) % this.fieldSize;
    }
    
    return value;
  }

  /**
   * Convert string to bigint
   */
  private stringToBigInt(str: string): bigint {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    
    let value = BigInt(0);
    for (let i = 0; i < bytes.length; i++) {
      value = (value * BigInt(256) + BigInt(bytes[i])) % this.fieldSize;
    }
    
    return value;
  }

  /**
   * Convert bigint to string
   */
  private bigIntToString(value: bigint): string {
    const bytes: number[] = [];
    let temp = value;
    
    while (temp > BigInt(0)) {
      bytes.unshift(Number(temp % BigInt(256)));
      temp = temp / BigInt(256);
    }
    
    return new TextDecoder().decode(new Uint8Array(bytes));
  }

  /**
   * Validate share format
   */
  static validateShare(share: ShamirShare): boolean {
    return (
      typeof share.x === 'number' &&
      typeof share.y === 'string' &&
      typeof share.index === 'number' &&
      share.x > 0 &&
      share.index > 0
    );
  }

  /**
   * Generate recovery phrase from shares
   */
  async generateRecoveryPhrase(shares: ShamirShare[]): Promise<string> {
    const shareStrings = shares.map(share => 
      `${share.index}:${share.x}:${share.y}`
    );
    
    return shareStrings.join('|');
  }

  /**
   * Parse recovery phrase to shares
   */
  static parseRecoveryPhrase(phrase: string): ShamirShare[] {
    const shareStrings = phrase.split('|');
    
    return shareStrings.map(shareStr => {
      const [index, x, y] = shareStr.split(':');
      return {
        index: parseInt(index),
        x: parseInt(x),
        y: y
      };
    });
  }
}

// Export singleton instance
export const shamirSecretSharing = new NostrShamirSecretSharing();
export default shamirSecretSharing; 