/**
 * Secure Deterministic User ID (DUID) Generator
 * Implements secure DUID architecture with client-side public generation
 * and server-side secret indexing for privacy and performance
 *
 * SECURITY ARCHITECTURE:
 * - Client: duid_public = SHA-256("DUIDv1" || npub) - stable, privacy-preserving
 * - Server: duid_index = HMAC-SHA-256(server_secret, duid_public) - secret indexing
 * - No client-side secrets required, survives password changes
 * - Prevents enumeration attacks while maintaining O(1) lookup performance
 *
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import { redactLogger as logger } from '../../utils/privacy-logger.js';

/**
 * Generate secure public DUID from npub only (client-side)
 * This creates a stable identifier that survives password changes
 *
 * @param {string} npub - User's Nostr public key (npub1...)
 * @returns {Promise<string>} Public DUID (duid_public)
 */
export async function generateDUID(npub) {
  // Validation
  if (!npub || !npub.startsWith('npub1')) {
    throw new Error('Valid npub is required for DUID generation');
  }

  logger.log('🔑 Generating secure public DUID:', {
    timestamp: new Date().toISOString()
  });

  try {
    // Browser-only serverless architecture - use Web Crypto API exclusively
    if (!crypto || !crypto.subtle) {
      throw new Error('Web Crypto API not available - browser environment required');
    }

    // Create deterministic input with version prefix for future compatibility
    const deterministicInput = "DUIDv1" + npub;

    // Generate public DUID using SHA-256 (no secrets required)
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(deterministicInput);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

    // Convert to hex string for consistent format
    const hashArray = new Uint8Array(hashBuffer);
    const duid_public = Array.from(hashArray, byte =>
      byte.toString(16).padStart(2, '0')
    ).join('');

    logger.log('🔑 Secure public DUID generated:', {
      timestamp: new Date().toISOString()
    });

    return duid_public;

  } catch (error) {
    logger.error('DUID generation failed:', { error, timestamp: new Date().toISOString() });
    throw new Error(`Failed to generate DUID: ${error.message}`);
  }
}

/**
 * Resolve NIP-05 identifier to npub using .well-known/nostr.json
 * This enables DUID generation from NIP-05 + password authentication
 * 
 * @param {string} nip05 - NIP-05 identifier (username@domain.com)
 * @returns {Promise<string|null>} Resolved npub or null if resolution fails
 */
export async function resolveNIP05ToNpub(nip05) {
  try {
    // Validate NIP-05 format
    if (!nip05 || !nip05.includes('@')) {
      throw new Error('Invalid NIP-05 format');
    }
    
    const [name, domain] = nip05.split('@');
    if (!name || !domain) {
      throw new Error('Invalid NIP-05 format: missing name or domain');
    }

    // Validate domain to prevent SSRF attacks
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
    if (!domainRegex.test(domain)) {
      throw new Error('Invalid domain format');
    }

    // Block internal/private IP ranges
    const blockedDomains = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
    if (blockedDomains.includes(domain.toLowerCase()) || domain.match(/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/)) {
      throw new Error('Access to internal domains is not allowed');
    }

    logger.log('🔍 Resolving NIP-05:', {
      timestamp: new Date().toISOString()
    });
    
    // First try with name query parameter (many implementations expect this)
    const wellKnownUrlWithName = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
    
    // Fetch with timeout
    let controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    let response = await fetch(wellKnownUrlWithName, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    let data = await response.json();
    
    if (!data.names || typeof data.names !== 'object') {
      throw new Error('Invalid .well-known/nostr.json response: missing names object');
    }
    
    let npub = data.names[name];
    
    // Fallback: if not found in filtered response, try fetching full mapping
    if (!npub) {
      logger.log('� Name not found in filtered response, trying full mapping fallback:', {
        timestamp: new Date().toISOString()
      });
      
      const wellKnownUrl = `https://${domain}/.well-known/nostr.json`;
      
      // Reset timeout for fallback request
      controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 10000);
      
      response = await fetch(wellKnownUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      data = await response.json();
      
      if (!data.names || typeof data.names !== 'object') {
        throw new Error('Invalid .well-known/nostr.json response: missing names object');
      }
      
      npub = data.names[name];
    }
    
    if (!npub) {
      throw new Error(`NIP-05 identifier '${name}' not found on domain '${domain}'`);
    }
    
    if (!npub.startsWith('npub1')) {
      throw new Error(`Invalid npub format returned: ${npub}`);
    }
    
    logger.log('✅ NIP-05 Resolution Success:', {
      timestamp: new Date().toISOString()
    });
    
    return npub;
    
  } catch (error) {
    logger.error('NIP-05 resolution failed:', { error, timestamp: new Date().toISOString() });
    return null;
  }
}

/**
 * Generate DUID from NIP-05 and password (convenience function)
 * Combines NIP-05 resolution with DUID generation
 *
 * @param {string} nip05 - NIP-05 identifier
 * @param {string} password - User's password
 * @returns {Promise<string>} DUID - throws error if generation fails
 */
export async function generateDUIDFromNIP05(nip05) {
  try {
    // First resolve NIP-05 to npub
    const npub = await resolveNIP05ToNpub(nip05);
    if (!npub) {
      throw new Error(`Failed to resolve NIP-05 identifier: ${nip05}`);
    }

    // Then generate secure DUID from npub only
    return await generateDUID(npub);

  } catch (error) {
    logger.error('DUID generation from NIP-05 failed:', { error, timestamp: new Date().toISOString() });
    throw new Error(`Failed to generate DUID from NIP-05: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// REMOVED: regenerateDUID() function - DUIDs are stable across password changes
// Use generateDUID(npub) directly instead

/**
 * Validate DUID format
 * Ensures DUID meets the expected format requirements
 *
 * @param {string} duid - DUID to validate
 * @returns {boolean} True if valid DUID format
 */
export function validateDUID(duid) {
  if (!duid || typeof duid !== 'string') {
    return false;
  }

  // DUID should be a hex-encoded SHA-256 hash (64 characters)
  const hexRegex = /^[a-f0-9]{64}$/;
  return hexRegex.test(duid);
}

/**
 * Generate DUID for NIP-07 browser extension authentication
 * Uses npub from browser extension + a derived password equivalent
 * 
 * @param {string} npub - User's npub from NIP-07 extension
 * @param {string} signature - Signature from NIP-07 extension (used as password equivalent)
 * @returns {Promise<string>} DUID for NIP-07 authentication
 */
export async function generateDUIDForNIP07(npub) {
  try {
    logger.log('🔐 Generating NIP-07 DUID:', {
      timestamp: new Date().toISOString()
    });

    // Generate stable DUID using npub only (same as regular DUID)
    const duid = await generateDUID(npub);

    logger.log('✅ NIP-07 DUID Generated:', {
      timestamp: new Date().toISOString()
    });

    return duid;

  } catch (error) {
    logger.error('NIP-07 DUID generation failed:', { error, timestamp: new Date().toISOString() });
    throw new Error(`Failed to generate NIP-07 DUID: ${error.message}`);
  }
}
