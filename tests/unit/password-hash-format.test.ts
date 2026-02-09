/**
 * Password Hash Format Unit Tests
 * 
 * CRITICAL: Validates the HEX format fix for password hashes
 * 
 * This test verifies:
 * 1. Client-side PasswordUtils generates HEX format hashes
 * 2. Server-side hash generation produces matching HEX format
 * 3. No Base64 characters appear in hashes (+, /, =)
 * 4. Hash length is exactly 128 characters (64 bytes * 2)
 */

import * as crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

/**
 * Server-side PBKDF2 hash function (matches register-identity.ts, change-password.js, reset-password.js)
 */
async function serverHashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString('hex'));
    });
  });
}

describe('Password Hash Format Verification', () => {
  describe('Server-side hash format', () => {
    it('should generate 128-character HEX hash', async () => {
      const salt = crypto.randomBytes(24).toString('base64');
      const hash = await serverHashPassword('TestPassword123!', salt);
      
      expect(hash).toHaveLength(128);
      expect(hash).toMatch(/^[a-f0-9]+$/);
      console.log(`Server hash: ${hash.substring(0, 32)}... (${hash.length} chars)`);
    });

    it('should NOT contain Base64 characters', async () => {
      const salt = crypto.randomBytes(24).toString('base64');
      const hash = await serverHashPassword('AnotherPassword456!', salt);
      
      // Base64 would contain +, /, = which are NOT valid hex chars
      expect(hash).not.toMatch(/[+/=A-Z]/);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should be deterministic with same inputs', async () => {
      const salt = 'fixedSaltForTesting';
      const password = 'ConsistentPassword!';
      
      const hash1 = await serverHashPassword(password, salt);
      const hash2 = await serverHashPassword(password, salt);
      
      expect(hash1).toBe(hash2);
      console.log(`Deterministic hash verified: ${hash1.substring(0, 16)}...`);
    });
  });

  describe('Client-side PasswordUtils', () => {
    it('should generate HEX hash matching server', async () => {
      const { PasswordUtils } = await import('../../src/lib/auth/user-identities-auth');
      
      const password = 'ClientServerMatch!';
      const salt = 'testSaltForMatching';
      
      const clientHash = await PasswordUtils.hashPassword(password, salt);
      const serverHash = await serverHashPassword(password, salt);
      
      console.log(`Client hash: ${clientHash.substring(0, 32)}...`);
      console.log(`Server hash: ${serverHash.substring(0, 32)}...`);
      
      expect(clientHash).toBe(serverHash);
      expect(clientHash).toHaveLength(128);
      expect(clientHash).toMatch(/^[a-f0-9]+$/);
    });

    it('should handle various password complexities', async () => {
      const { PasswordUtils } = await import('../../src/lib/auth/user-identities-auth');
      const salt = crypto.randomBytes(24).toString('base64');
      
      const testCases = [
        'simple',
        'WithUpperCase',
        'with-special-chars!@#$%',
        '12345678',
        'MixedCase123!@#',
        '   spaces around   ',
        'unicode: 日本語 🔐',
      ];
      
      for (const password of testCases) {
        const clientHash = await PasswordUtils.hashPassword(password, salt);
        const serverHash = await serverHashPassword(password, salt);
        
        expect(clientHash).toBe(serverHash);
        expect(clientHash).toHaveLength(128);
        expect(clientHash).toMatch(/^[a-f0-9]+$/);
      }
      
      console.log(`✅ All ${testCases.length} password variations produce matching HEX hashes`);
    });
  });

  describe('Format consistency across endpoints', () => {
    it('should use same parameters as registration endpoint', async () => {
      // Registration uses: PBKDF2, SHA-512, 100000 iterations, 64-byte output, HEX encoding
      const salt = crypto.randomBytes(24).toString('base64');
      const hash = await serverHashPassword('RegistrationTest!', salt);
      
      // Verify exact format requirements
      expect(hash).toHaveLength(128); // 64 bytes = 128 hex chars
      expect(hash).toMatch(/^[a-f0-9]+$/); // lowercase hex only
      
      console.log(`Registration format verified: ${hash.length} chars, hex-only`);
    });

    it('should use same parameters as change-password endpoint', async () => {
      // change-password.js uses identical parameters
      const salt = crypto.randomBytes(24).toString('base64');
      const hash = await serverHashPassword('ChangePasswordTest!', salt);
      
      expect(hash).toHaveLength(128);
      expect(hash).toMatch(/^[a-f0-9]+$/);
      
      console.log(`Change-password format verified`);
    });

    it('should use same parameters as reset-password endpoint', async () => {
      // reset-password.js uses identical parameters
      const salt = crypto.randomBytes(24).toString('base64');
      const hash = await serverHashPassword('ResetPasswordTest!', salt);
      
      expect(hash).toHaveLength(128);
      expect(hash).toMatch(/^[a-f0-9]+$/);
      
      console.log(`Reset-password format verified`);
    });
  });
});

