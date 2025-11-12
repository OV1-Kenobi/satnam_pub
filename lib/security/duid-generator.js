/**
 * Canonical DUID Generator - NIP-05 Based Architecture
 * Single source of truth for all DUID generation across the codebase
 *
 * SECURITY ARCHITECTURE:
 * - Server-side only: DUID = HMAC-SHA-256(DUID_SERVER_SECRET, nip05)
 * - Enables username availability checking before key generation
 * - Consistent lookups across all authentication methods
 * - Privacy-first: No plaintext identifiers stored in database
 *
 * @compliance Master Context - Privacy-first, server-side secrets only
 */

/**
 * Generate DUID from NIP-05 identifier (server-side only)
 * This is the ONLY way to generate DUIDs for consistent lookups
 * Replaces all npub-based DUID generation methods
 * @param {string} nip05 - NIP-05 identifier (username@domain)
 * @returns {Promise<string>} DUID (64-character hex)
 * @throws {Error} If server secret not configured or invalid NIP-05 format
 */
export async function generateDUIDFromNIP05(nip05) {
  // SERVER-SIDE ONLY - No VITE_ prefixed variables
  const secret = process.env.DUID_SERVER_SECRET || process.env.DUID_SECRET_KEY;

  if (!secret) {
    throw new Error('DUID server secret not configured - server-side only');
  }

  // Validate NIP-05 format (username@domain)
  if (!nip05 || typeof nip05 !== 'string' || !nip05.includes('@')) {
    throw new Error('Invalid NIP-05 format: must be username@domain');
  }

  const identifier = nip05.trim().toLowerCase();

  // Use Node.js crypto for Netlify Functions compatibility
  // Falls back to Web Crypto API for browser environments
  try {
    // Try Node.js crypto first (Netlify Functions)
    const nodeCrypto = await import('node:crypto');
    const hmac = nodeCrypto.createHmac('sha256', secret);
    hmac.update(identifier);
    const duid = hmac.digest('hex');
    // FIX #3: Log successful Node.js crypto usage for debugging
    console.log(`[DUID] ✅ Generated DUID using Node.js crypto for NIP-05: ${identifier.split('@')[0]}@***`);
    return duid;
  } catch (nodeError) {
    // FIX #3: Log Node.js crypto failure before falling back
    console.warn(`[DUID] Node.js crypto failed (will try Web Crypto API):`, nodeError instanceof Error ? nodeError.message : nodeError);

    // Fallback to Web Crypto API for browser environments
    try {
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
      const duid = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      // FIX #3: Log successful Web Crypto API usage for debugging
      console.log(`[DUID] ✅ Generated DUID using Web Crypto API for NIP-05: ${identifier.split('@')[0]}@***`);
      return duid;
    } catch (webCryptoError) {
      // FIX #3: Log detailed error information for debugging
      console.error(`[DUID] ❌ Both crypto methods failed for NIP-05: ${identifier.split('@')[0]}@***`, {
        nodeError: nodeError instanceof Error ? nodeError.message : String(nodeError),
        webCryptoError: webCryptoError instanceof Error ? webCryptoError.message : String(webCryptoError),
      });
      throw new Error(`DUID generation failed: Node.js crypto unavailable and Web Crypto API failed: ${webCryptoError}`);
    }
  }
}

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

  // DUID should be a hex-encoded HMAC-SHA-256 hash (64 characters)
  const hexRegex = /^[a-f0-9]{64}$/;
  return hexRegex.test(duid);
}


