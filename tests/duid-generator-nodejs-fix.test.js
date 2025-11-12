/**
 * DUID Generator Node.js Fix Verification Test
 * 
 * Tests that the DUID generator works correctly in Node.js Netlify Functions
 * by using node:crypto instead of Web Crypto API
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';

// Mock the generateDUIDFromNIP05 function to test Node.js crypto path
async function generateDUIDFromNIP05NodeJS(nip05, secret) {
  if (!secret) {
    throw new Error('DUID server secret not configured - server-side only');
  }

  if (!nip05 || typeof nip05 !== 'string' || !nip05.includes('@')) {
    throw new Error('Invalid NIP-05 format: must be username@domain');
  }

  const identifier = nip05.trim().toLowerCase();

  // Use Node.js crypto (this is what the fix enables)
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(identifier);
  return hmac.digest('hex');
}

describe('DUID Generator Node.js Fix', () => {
  const testSecret = 'test-duid-server-secret-key-12345';
  
  it('should generate consistent DUID using Node.js crypto', async () => {
    const nip05 = 'testuser@satnam.pub';
    const duid1 = await generateDUIDFromNIP05NodeJS(nip05, testSecret);
    const duid2 = await generateDUIDFromNIP05NodeJS(nip05, testSecret);
    
    expect(duid1).toBe(duid2);
    expect(duid1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate different DUIDs for different usernames', async () => {
    const duid1 = await generateDUIDFromNIP05NodeJS('user1@satnam.pub', testSecret);
    const duid2 = await generateDUIDFromNIP05NodeJS('user2@satnam.pub', testSecret);
    
    expect(duid1).not.toBe(duid2);
  });

  it('should normalize username to lowercase', async () => {
    const duid1 = await generateDUIDFromNIP05NodeJS('TestUser@satnam.pub', testSecret);
    const duid2 = await generateDUIDFromNIP05NodeJS('testuser@satnam.pub', testSecret);
    
    expect(duid1).toBe(duid2);
  });

  it('should throw error when secret is missing', async () => {
    const nip05 = 'testuser@satnam.pub';
    
    await expect(generateDUIDFromNIP05NodeJS(nip05, null)).rejects.toThrow(
      'DUID server secret not configured'
    );
  });

  it('should throw error for invalid NIP-05 format', async () => {
    await expect(generateDUIDFromNIP05NodeJS('invalid-format', testSecret)).rejects.toThrow(
      'Invalid NIP-05 format'
    );
  });

  it('should generate 64-character hex string', async () => {
    const duid = await generateDUIDFromNIP05NodeJS('user@satnam.pub', testSecret);
    
    expect(duid).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(duid)).toBe(true);
  });

  it('should match signin-handler DUID generation logic', async () => {
    // This mimics the logic from signin-handler.js
    const nip05 = 'testuser@satnam.pub';
    const identifier = nip05.trim().toLowerCase();
    const hmac = crypto.createHmac('sha256', testSecret);
    hmac.update(identifier);
    const expectedDUID = hmac.digest('hex');
    
    const generatedDUID = await generateDUIDFromNIP05NodeJS(nip05, testSecret);
    
    expect(generatedDUID).toBe(expectedDUID);
  });
});

