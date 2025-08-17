/**
 * Server-Side DUID Index Generator
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

/**
 * Get server secret for DUID indexing
 * This secret must never be exposed to client-side code
 * @returns {string} Server secret for HMAC operations
 */
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

/**
 * Generate server-side DUID index from public DUID
 * This creates the actual database key used for storage and lookup
 * 
 * @param {string} duid_public - Public DUID from client (SHA-256 of "DUIDv1" + npub)
 * @returns {string} DUID index for database operations
 */
function generateDUIDIndex(duid_public) {
  if (!duid_public || typeof duid_public !== 'string') {
    throw new Error('Valid public DUID is required for index generation');
  }
  
  // Validate public DUID format (64-character hex string)
  if (!/^[a-f0-9]{64}$/.test(duid_public)) {
    throw new Error('Invalid public DUID format - must be 64-character hex string');
  }
  
  try {
    const serverSecret = getServerSecret();
    
    // Generate HMAC-SHA-256 index using server secret
    const hmac = crypto.createHmac('sha256', serverSecret);
    hmac.update(duid_public);
    const duid_index = hmac.digest('hex');
    
    console.log('🔐 Generated DUID index:', {
      publicDuidPrefix: duid_public.substring(0, 10) + '...',
      indexPrefix: duid_index.substring(0, 10) + '...',
      timestamp: new Date().toISOString()
    });
    
    return duid_index;
    
  } catch (error) {
    console.error('❌ DUID index generation failed:', error);
    throw new Error(`Failed to generate DUID index: ${error.message}`);
  }
}

/**
 * Validate DUID index format
 * Ensures the index meets expected format requirements
 * 
 * @param {string} duid_index - DUID index to validate
 * @returns {boolean} True if valid DUID index format
 */
function validateDUIDIndex(duid_index) {
  if (!duid_index || typeof duid_index !== 'string') {
    return false;
  }
  
  // DUID index should be a hex-encoded HMAC-SHA-256 hash (64 characters)
  const hexRegex = /^[a-f0-9]{64}$/;
  return hexRegex.test(duid_index);
}

/**
 * Generate DUID index from npub (convenience function)
 * Combines client-side DUID generation logic with server-side indexing
 * 
 * @param {string} npub - User's Nostr public key (npub1...)
 * @returns {string} DUID index for database operations
 */
function generateDUIDIndexFromNpub(npub) {
  if (!npub || !npub.startsWith('npub1')) {
    throw new Error('Valid npub is required for DUID index generation');
  }
  
  try {
    // Step 1: Generate public DUID (same as client-side)
    const deterministicInput = "DUIDv1" + npub;
    const hash = crypto.createHash('sha256');
    hash.update(deterministicInput);
    const duid_public = hash.digest('hex');
    
    // Step 2: Generate server-side index
    const duid_index = generateDUIDIndex(duid_public);
    
    console.log('🔑 Generated DUID index from npub:', {
      npubPrefix: npub.substring(0, 10) + '...',
      publicDuidPrefix: duid_public.substring(0, 10) + '...',
      indexPrefix: duid_index.substring(0, 10) + '...',
      timestamp: new Date().toISOString()
    });
    
    return duid_index;
    
  } catch (error) {
    console.error('❌ DUID index generation from npub failed:', error);
    throw new Error(`Failed to generate DUID index from npub: ${error.message}`);
  }
}

/**
 * Batch generate DUID indexes for multiple public DUIDs
 * Useful for migration scenarios or bulk operations
 * 
 * @param {Array<string>} public_duids - Array of public DUIDs
 * @returns {Array<{duid_public: string, duid_index: string}>} Array of DUID mappings
 */
function batchGenerateDUIDIndexes(public_duids) {
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

/**
 * Verify DUID index matches public DUID
 * Used for validation and security checks
 * 
 * @param {string} duid_public - Public DUID from client
 * @param {string} duid_index - DUID index from database
 * @returns {boolean} True if index matches public DUID
 */
function verifyDUIDIndex(duid_public, duid_index) {
  try {
    const expectedIndex = generateDUIDIndex(duid_public);
    return expectedIndex === duid_index;
  } catch (error) {
    console.error('❌ DUID index verification failed:', error);
    return false;
  }
}

/**
 * Security audit function for DUID operations
 * Logs security-relevant events for monitoring
 * 
 * @param {string} operation - Operation being performed
 * @param {Object} context - Context information
 */
function auditDUIDOperation(operation, context = {}) {
  console.log(`🔍 DUID Security Audit: ${operation}`, {
    operation,
    timestamp: new Date().toISOString(),
    hasServerSecret: !!process.env.DUID_SERVER_SECRET,
    secretLength: process.env.DUID_SERVER_SECRET?.length || 0,
    ...context
  });
}

/**
 * Initialize DUID security system
 * Validates server configuration and security requirements
 */
function initializeDUIDSecurity() {
  try {
    // Validate server secret exists and meets requirements
    const secret = getServerSecret();
    
    auditDUIDOperation('INITIALIZATION', {
      secretConfigured: true,
      secretLength: secret.length,
      environment: process.env.NODE_ENV || 'development'
    });
    
    console.log('✅ DUID security system initialized successfully');
    return true;
    
  } catch (error) {
    console.error('❌ DUID security system initialization failed:', error);
    auditDUIDOperation('INITIALIZATION_FAILED', {
      error: error.message,
      environment: process.env.NODE_ENV || 'development'
    });
    throw error;
  }
}

// Initialize on module load for Netlify Functions
try {
  initializeDUIDSecurity();
} catch (error) {
  // avoid noisy logs in production; caller logs details
}

export {
    auditDUIDOperation, batchGenerateDUIDIndexes, generateDUIDIndex, generateDUIDIndexFromNpub, initializeDUIDSecurity, validateDUIDIndex, verifyDUIDIndex
};


