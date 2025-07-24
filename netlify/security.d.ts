/**
 * Type declarations for netlify/security.js
 * CRITICAL: Netlify security utilities type definitions
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
export function generateSecureToken(length?: number): string;
export function encryptCredentials(
  data: string,
  password: string
): Promise<string>;
export function decryptCredentials(
  encryptedData: string,
  password: string
): Promise<string>;
