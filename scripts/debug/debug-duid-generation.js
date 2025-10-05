#!/usr/bin/env node

/**
 * Debug script to test DUID generation consistency
 * Compares Node.js crypto vs Web Crypto API implementations
 */

import crypto from 'node:crypto';

// Original Node.js implementation
function generateDUIDNodeJS(nip05, secret) {
  const identifier = nip05.trim().toLowerCase();
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(identifier);
  return hmac.digest('hex');
}

// New Web Crypto API implementation (simulated for Node.js)
async function generateDUIDWebCrypto(nip05, secret) {
  const identifier = nip05.trim().toLowerCase();
  
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(identifier);
  
  // Import the secret key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Generate HMAC-SHA-256
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Signin handler implementation (updated)
function generateDUIDSigninHandler(nip05Identifier, secret) {
  // CRITICAL: Must normalize exactly like canonical generator
  const identifier = nip05Identifier.trim().toLowerCase();

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(identifier);
  return hmac.digest('hex');
}

// Test function
async function testDUIDGeneration() {
  const testNip05 = 'testing1383@satnam.pub';
  const testSecret = process.env.DUID_SERVER_SECRET || 'test-secret-key';

  console.log('🔍 Testing DUID generation consistency');
  console.log('NIP-05:', testNip05);
  console.log('Secret prefix:', testSecret.substring(0, 8) + '...');
  console.log('');

  // Generate using all three methods
  const nodejsDUID = generateDUIDNodeJS(testNip05, testSecret);
  const webCryptoDUID = await generateDUIDWebCrypto(testNip05, testSecret);
  const signinHandlerDUID = generateDUIDSigninHandler(testNip05, testSecret);

  console.log('Node.js crypto result:    ', nodejsDUID);
  console.log('Web Crypto result:        ', webCryptoDUID);
  console.log('Signin handler result:    ', signinHandlerDUID);
  console.log('');

  // Check if they all match
  const allMatch = nodejsDUID === webCryptoDUID && webCryptoDUID === signinHandlerDUID;
  console.log('✅ All results match:', allMatch);

  if (!allMatch) {
    console.log('❌ CRITICAL: DUID generation methods produce different results!');
    console.log('This explains why authentication is failing.');
  } else {
    console.log('✅ DUID generation is consistent across all implementations.');
  }

  // Show first 8 characters for comparison with logs
  console.log('');
  console.log('DUID prefix (first 8 chars):', nodejsDUID.substring(0, 8));

  return { nodejsDUID, webCryptoDUID, signinHandlerDUID, allMatch };
}

// Run the test
testDUIDGeneration().catch(console.error);
