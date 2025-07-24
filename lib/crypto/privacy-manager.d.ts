/**
 * Type declarations for lib/crypto/privacy-manager.js
 * CRITICAL: Privacy Manager type definitions
 */

export class PrivacyManager {
  static createAuthHash(pubkey: string): string;
  static decryptUserData(encryptedData: string, userKey: string): Promise<any>;
  static generateAnonymousUsername(): string;
  static validateUsernameFormat(username: string): { valid: boolean; error?: string };
  static encryptUserData(data: any, key: string): Promise<string>;
  static encryptPrivateKey(privateKey: string, password: string): Promise<string>;
  static encryptServiceConfig(config: any, key: string): Promise<string>;
  static decryptPrivateKey(encryptedKey: string, password: string): Promise<string>;
}
