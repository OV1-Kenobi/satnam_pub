/**
 * Type declarations for api/lib/security.js
 * CRITICAL: Security module type definitions
 */

export function deriveEncryptionKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey>;
export function generateSalt(): Uint8Array;
export function encryptData(data: string, key: CryptoKey): Promise<string>;
export function decryptData(
  encryptedData: string,
  key: CryptoKey
): Promise<string>;
export function hashPassword(password: string): Promise<string>;
export function verifyPassword(
  password: string,
  hash: string
): Promise<boolean>;
export function generateSecureToken(): string;
export function generateSecureToken(length: number): string;

// Additional exports for PBKDF2 Security
export function encryptCredentials(
  credentials: any,
  key: CryptoKey
): Promise<string>;
export function decryptCredentials(
  encryptedCredentials: string,
  key: CryptoKey
): Promise<any>;
export function hashPassphrase(passphrase: string): Promise<string>;
export function verifyPassphrase(
  passphrase: string,
  hash: string
): Promise<boolean>;
export function validatePBKDF2ConfigOnStartup(): Promise<boolean>;

export interface SecurityConfig {
  saltLength: number;
  keyDerivationIterations: number;
  encryptionAlgorithm: string;
}

export const defaultSecurityConfig: SecurityConfig;
