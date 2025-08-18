/**
 * Server-Side DUID Index Generator (ESM)
 * Implements Phase 2 of secure DUID architecture with secret-based indexing
 *
 * SECURITY ARCHITECTURE:
 * - Client: duid_public = SHA-256("DUIDv1" || npub) - stable, privacy-preserving
 * - Server: duid_index = HMAC-SHA-256(server_secret, duid_public) - secret indexing
 * - Prevents enumeration attacks while maintaining O(1) lookup performance
 *
 * @compliance Netlify Functions - Server-side only, never exposed to client
 */

import * as crypto from 'crypto';

function getServerSecret() {
  const secret = process.env.DUID_SERVER_SECRET;
  if (!secret) {
    throw new Error('DUID_SERVER_SECRET environment variable is required for secure indexing');
  }
  if (secret.length < 32) {
    throw new Error('DUID_SERVER_SECRET must be at least 32 characters for security');
  }
  return secret;
}

export function generateDUIDIndex(duid_public) {
  if (!duid_public || typeof duid_public !== 'string') {
    throw new Error('Valid public DUID is required for index generation');
  }
  if (!/^[a-f0-9]{64}$/.test(duid_public)) {
    throw new Error('Invalid public DUID format - must be 64-character hex string');
  }
  const serverSecret = getServerSecret();
  const hmac = crypto.createHmac('sha256', serverSecret);
  hmac.update(duid_public);
  const duid_index = hmac.digest('hex');
  console.log('🔐 Generated DUID index:', {
    publicDuidPrefix: duid_public.substring(0, 10) + '...',
    indexPrefix: duid_index.substring(0, 10) + '...',
    timestamp: new Date().toISOString(),
  });
  return duid_index;
}

export function validateDUIDIndex(duid_index) {
  if (!duid_index || typeof duid_index !== 'string') return false;
  return /^[a-f0-9]{64}$/.test(duid_index);
}

export function generateDUIDIndexFromNpub(npub) {
  if (!npub || !npub.startsWith('npub1')) {
    throw new Error('Valid npub is required for DUID index generation');
  }
  const deterministicInput = 'DUIDv1' + npub;
  const hash = crypto.createHash('sha256');
  hash.update(deterministicInput);
  const duid_public = hash.digest('hex');
  const duid_index = generateDUIDIndex(duid_public);
  console.log('🔑 Generated DUID index from npub:', {
    npubPrefix: npub.substring(0, 10) + '...',
    publicDuidPrefix: duid_public.substring(0, 10) + '...',
    indexPrefix: duid_index.substring(0, 10) + '...',
    timestamp: new Date().toISOString(),
  });
  return duid_index;
}

export function batchGenerateDUIDIndexes(public_duids) {
  const results = [];
  for (const duid_public of public_duids) {
    try {
      const duid_index = generateDUIDIndex(duid_public);
      results.push({ duid_public, duid_index });
    } catch (error) {
      console.error(`❌ Batch DUID index generation failed for ${duid_public}:`, error);
      results.push({ duid_public, duid_index: null, error: error.message });
    }
  }
  return results;
}

export function verifyDUIDIndex(duid_public, duid_index) {
  try {
    const expectedIndex = generateDUIDIndex(duid_public);
    return expectedIndex === duid_index;
  } catch (error) {
    console.error('❌ DUID index verification failed:', error);
    return false;
  }
}

export function auditDUIDOperation(operation, context = {}) {
  console.log(`🔍 DUID Security Audit: ${operation}`, {
    operation,
    timestamp: new Date().toISOString(),
    hasServerSecret: !!process.env.DUID_SERVER_SECRET,
    secretLength: process.env.DUID_SERVER_SECRET?.length || 0,
    ...context,
  });
}

export function initializeDUIDSecurity() {
  try {
    const secret = getServerSecret();
    auditDUIDOperation('INITIALIZATION', {
      secretConfigured: true,
      secretLength: secret.length,
      environment: process.env.NODE_ENV || 'development',
    });
    console.log('✅ DUID security system initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ DUID security system initialization failed:', error);
    auditDUIDOperation('INITIALIZATION_FAILED', {
      error: error.message,
      environment: process.env.NODE_ENV || 'development',
    });
    throw error;
  }
}

try {
  initializeDUIDSecurity();
} catch {}

