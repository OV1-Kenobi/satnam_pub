/**
 * Type declarations for lib/crypto-validator.js
 * CRITICAL: Crypto validator type definitions
 */

export interface CryptoValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CryptoConfig {
  algorithm: string;
  keyLength: number;
  iterations: number;
  saltLength: number;
}

export function validateCryptoConfig(config: CryptoConfig): CryptoValidationResult;
export function validatePrivateKey(privateKey: string): CryptoValidationResult;
export function validatePublicKey(publicKey: string): CryptoValidationResult;
export function validateSignature(signature: string, message: string, publicKey: string): Promise<CryptoValidationResult>;
export function validateEncryption(encryptedData: string, key: string): Promise<CryptoValidationResult>;
export function runSecurityAudit(): Promise<CryptoValidationResult>;
