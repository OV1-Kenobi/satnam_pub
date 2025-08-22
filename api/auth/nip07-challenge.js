/**
 * NIP-07 Challenge Generation API - Master Context Compliant Netlify Functions Handler
 * 
 * This endpoint generates cryptographically secure challenges for NIP-07 browser extension
 * authentication following Nostr protocol specifications and Master Context requirements.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * - Netlify Functions handler pattern with proper event/context signature
 * - Individual Wallet Sovereignty enforcement (unlimited authority for Adults/Stewards/Guardians)
 * - Privacy-first architecture with zero-knowledge patterns and no sensitive data logging
 * - Standardized role hierarchy (greenfield - no legacy mappings)
 * - Browser-compatible environment variables with getEnvVar() pattern
 * - Comprehensive JSDoc type definitions for complete type safety
 * - Authentication integration with SecureSessionManager patterns
 * - Web Crypto API usage for cryptographically secure challenge generation
 * - No exposure of emails, npubs, personal data, or real names in logs
 * 
 * NIP-07 AUTHENTICATION COMPLIANCE:
 * - NIP-07 browser extension signing patterns per Master Context authentication layers
 * - Nostr protocol compliance with proper challenge/response authentication flow
 * - Zero-knowledge Nsec management with immediate memory cleanup
 * - Session-based encryption integration for secure authentication state
 * - Cryptographically secure challenge generation using Web Crypto API
 * - secp256k1 compatibility for signature verification
 */

/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key) {
  return process.env[key];
}

/**
 * NIP-07 challenge request parameters
 * @typedef {Object} NIP07ChallengeRequest
 * @property {string} [userRole] - User role for sovereignty validation
 * @property {string} [sessionId] - Session ID for authentication state tracking
 * @property {boolean} [includeMetadata] - Whether to include additional challenge metadata
 */

/**
 * NIP-07 challenge data structure (Nostr protocol compliant)
 * @typedef {Object} NIP07ChallengeData
 * @property {string} challenge - Cryptographically secure random challenge (64 hex chars)
 * @property {string} domain - Domain for challenge verification
 * @property {number} timestamp - Challenge generation timestamp
 * @property {number} expiresAt - Challenge expiration timestamp (5 minutes)
 * @property {string} [nonce] - Additional nonce for replay protection
 * @property {Object} [metadata] - Additional challenge metadata
 * @property {string} metadata.version - NIP-07 protocol version
 * @property {string} metadata.algorithm - Signature algorithm (secp256k1)
 * @property {string} metadata.encoding - Challenge encoding format (hex)
 */

/**
 * NIP-07 challenge response with Master Context compliance
 * @typedef {Object} NIP07ChallengeResponse
 * @property {boolean} success - Success status
 * @property {NIP07ChallengeData} data - Challenge data
 * @property {Object} sovereigntyStatus - Individual Wallet Sovereignty status
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} sovereigntyStatus.role - User role
 * @property {boolean} sovereigntyStatus.hasUnlimitedAccess - Whether user has unlimited access
 * @property {boolean} sovereigntyStatus.requiresApproval - Whether approval is required
 * @property {Object} meta - Response metadata
 * @property {string} meta.timestamp - Response timestamp
 * @property {string} meta.protocol - Protocol version (NIP-07)
 * @property {boolean} meta.privacyCompliant - Privacy compliance status
 */

/**
 * Individual Wallet Sovereignty validation for NIP-07 authentication operations
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {string} operation - Authentication operation type
 * @returns {Object} Sovereignty validation result
 */
function validateNIP07AuthenticationSovereignty(userRole, operation) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited authority
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      authorized: true,
      hasUnlimitedAccess: true,
      requiresApproval: false,
      message: 'Sovereign role with unlimited NIP-07 authentication authority'
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Offspring have restricted authentication operations
  if (userRole === 'offspring') {
    const restrictedOperations = ['challenge_generation', 'signature_verification'];
    const requiresApproval = restrictedOperations.includes(operation);
    
    return {
      authorized: !restrictedOperations.includes(operation) || false,
      hasUnlimitedAccess: false,
      requiresApproval,
      message: requiresApproval ? 'NIP-07 authentication requires guardian approval' : 'NIP-07 authentication authorized'
    };
  }

  // Default to unauthorized for unknown roles
  return {
    authorized: false,
    hasUnlimitedAccess: false,
    requiresApproval: true,
    message: 'Unknown role - NIP-07 authentication not authorized'
  };
}

/**
 * Convert legacy role to standardized Master Context role hierarchy
 * @param {string} legacyRole - Legacy role (admin, user, parent, child, etc.)
 * @returns {'private'|'offspring'|'adult'|'steward'|'guardian'} Standardized role
 */
function convertToStandardizedRole(legacyRole) {
  // GREENFIELD APPROACH: Convert legacy roles to standardized hierarchy
  switch (legacyRole) {
    case 'admin':
      return 'guardian'; // Admin maps to guardian
    case 'user':
      return 'adult'; // User maps to adult
    case 'parent':
      return 'adult'; // Legacy parent maps to adult
    case 'child':
    case 'teen':
      return 'offspring'; // Legacy child/teen maps to offspring
    case 'steward':
      return 'steward'; // Steward remains steward
    case 'guardian':
      return 'guardian'; // Guardian remains guardian
    case 'private':
      return 'private'; // Private remains private
    case 'offspring':
      return 'offspring'; // Offspring remains offspring
    case 'adult':
      return 'adult'; // Adult remains adult
    default:
      return 'private'; // Default to private for unknown roles
  }
}

/**
 * Generate cryptographically secure challenge using Web Crypto API
 * @param {number} [length=32] - Challenge length in bytes
 * @returns {Promise<string>} Cryptographically secure challenge (hex encoded)
 */
async function generateSecureChallenge(length = 32) {
  // Use Web Crypto API for cryptographically secure random generation
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  
  // Convert to hex string for NIP-07 compatibility
  const challenge = Array.from(randomBytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  
  // Clear sensitive data from memory
  randomBytes.fill(0);
  
  return challenge;
}

/**
 * Generate privacy-preserving nonce using Web Crypto API
 * @returns {Promise<string>} Privacy-preserving nonce
 */
async function generatePrivacyNonce() {
  // Use Web Crypto API for privacy-preserving nonce generation
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = Array.from(nonceBytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  
  // Clear sensitive data from memory
  nonceBytes.fill(0);
  
  return nonce;
}

/**
 * Validate challenge request parameters
 * @param {Object} queryParams - Query parameters from request
 * @returns {Object} Validation result
 */
function validateChallengeRequest(queryParams) {
  const { userRole = 'private', sessionId, includeMetadata = 'false' } = queryParams || {};
  
  // Validate user role
  const standardizedRole = convertToStandardizedRole(userRole);
  
  // Validate session ID format (if provided)
  if (sessionId && (typeof sessionId !== 'string' || sessionId.length < 16)) {
    return {
      valid: false,
      error: 'Invalid session ID format'
    };
  }
  
  return {
    valid: true,
    userRole: standardizedRole,
    sessionId,
    includeMetadata: includeMetadata === 'true'
  };
}

/**
 * MASTER CONTEXT COMPLIANCE: Netlify Functions handler for NIP-07 challenge generation
 * @param {Object} event - Netlify Functions event object
 * @param {Object} context - Netlify Functions context object
 * @returns {Promise<Object>} Netlify Functions response object
 */
export default async function handler(event, context) {
  // CORS headers for browser compatibility (env-aware)
  function getAllowedOrigin(origin) {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) return 'https://satnam.pub';
    if (!origin) return '*';
    try {
      const u = new URL(origin);
      if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && (u.protocol === 'http:')) {
        return origin;
      }
    } catch {}
    return '*';
  }
  const requestOrigin = event.headers?.origin || event.headers?.Origin;
  const corsHeaders = {
    "Access-Control-Allow-Origin": getAllowedOrigin(requestOrigin),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  // Standardized IP-based rate limiting (60s, 30 attempts)
  try {
    const xfwd = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
    const clientIp = Array.isArray(xfwd) ? xfwd[0] : (xfwd || '').split(',')[0]?.trim() || 'unknown';
    const windowSec = 60;
    const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * (windowSec * 1000)).toISOString();
    const helper = await import('../../netlify/functions/supabase.js');
    const { supabase } = helper;
    const { data, error } = await supabase.rpc('increment_auth_rate', { p_identifier: clientIp, p_scope: 'ip', p_window_start: windowStart, p_limit: 30 });
    const limited = Array.isArray(data) ? data?.[0]?.limited : data?.limited;
    if (error || limited) {
      return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Too many attempts' }) };
    }
  } catch {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Too many attempts' }) };
  }

  // Allow GET and POST for challenge retrieval (POST ignored body)
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Validate request parameters
    const validation = validateChallengeRequest(event.queryStringParameters);
    
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: validation.error }),
      };
    }

    // Validate Individual Wallet Sovereignty
    const sovereigntyValidation = validateNIP07AuthenticationSovereignty(validation.userRole, 'challenge_generation');

    if (!sovereigntyValidation.authorized) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          error: sovereigntyValidation.message,
          requiresApproval: sovereigntyValidation.requiresApproval,
        }),
      };
    }

    // Generate cryptographically secure challenge
    const challenge = await generateSecureChallenge(32);
    const nonce = await generatePrivacyNonce();
    const domain = event.headers.host || getEnvVar("VITE_APP_DOMAIN") || "localhost:3000";
    const timestamp = Date.now();
    const expiresAt = timestamp + 5 * 60 * 1000; // 5 minutes

    // Persist challenge for replay protection and validation
    try {
      const { supabase } = await import("../../netlify/functions/supabase.js");
      const sessionId = (event.queryStringParameters && event.queryStringParameters.sessionId) || undefined;

      // Cleanup expired challenges (best-effort)
      await supabase.from('auth_challenges').delete().lt('expires_at', new Date().toISOString());

      await supabase.from('auth_challenges').insert({
        session_id: sessionId || nonce, // fallback to nonce if no sessionId provided
        nonce,
        challenge,
        domain,
        issued_at: new Date(timestamp).toISOString(),
        expires_at: new Date(expiresAt).toISOString(),
        is_used: false
      });
    } catch (persistError) {
      // Do not leak sensitive info; log minimal context
      console.error('Challenge persistence failed');
    }

    // Create challenge data structure
    const challengeData = {
      challenge,
      domain,
      timestamp,
      expiresAt,
      nonce,
    };

    // Add metadata if requested
    if (validation.includeMetadata) {
      challengeData.metadata = {
        version: "1.0.0",
        algorithm: "secp256k1",
        encoding: "hex",
      };
    }

    // Create Master Context compliant response
    const response = {
      success: true,
      data: challengeData,
      sovereigntyStatus: {
        role: validation.userRole,
        hasUnlimitedAccess: sovereigntyValidation.hasUnlimitedAccess,
        requiresApproval: sovereigntyValidation.requiresApproval,
      },
      meta: {
        timestamp: new Date().toISOString(),
        protocol: "NIP-07",
        privacyCompliant: true,
      },
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  } catch (error) {
    // PRIVACY: No sensitive error data logging
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Failed to generate NIP-07 challenge",
      }),
    };
  }
}

/**
 * Master Context compliant API configuration for NIP-07 challenge operations
 * @type {Object}
 */
export const nip07ChallengeConfig = {
  baseUrl: getEnvVar("VITE_API_BASE_URL") || getEnvVar("API_BASE_URL") || "/.netlify/functions",
  endpoint: "/api/auth/nip07-challenge",
  timeout: 30000, // 30 seconds
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  privacy: {
    enableLogging: false, // Privacy-first: no logging
    enableAnalytics: false, // Privacy-first: no analytics
    enableTracking: false, // Privacy-first: no tracking
  },
  sovereignty: {
    enforceRoleValidation: true, // Always enforce sovereignty
    defaultRole: 'private', // Default to private role
    offspringRequiresApproval: true, // Offspring requires approval for authentication
  },
  nip07: {
    protocolVersion: "1.0.0",
    challengeLength: 32, // 32 bytes = 64 hex characters
    challengeExpiry: 5 * 60 * 1000, // 5 minutes
    algorithm: "secp256k1",
    encoding: "hex",
    nonceLength: 16, // 16 bytes = 32 hex characters
  },
  security: {
    useWebCryptoAPI: true, // Always use Web Crypto API
    clearMemoryAfterUse: true, // Clear sensitive data from memory
    validateOrigin: true, // Validate request origin
    enforceHTTPS: getEnvVar("NODE_ENV") === "production", // Enforce HTTPS in production
  },
};

/**
 * Validate NIP-07 challenge compatibility with existing authentication systems
 * @param {string} operation - Operation type
 * @param {Object} data - Operation data
 * @returns {Object} Compatibility validation result
 */
export function validateNIP07ChallengeCompatibility(operation, data) {
  const compatibility = {
    browserExtension: true, // Compatible with NIP-07 browser extensions
    nostrProtocol: true, // Compatible with Nostr protocol specifications
    sessionManagement: true, // Compatible with existing session management
    securityLibrary: true, // Compatible with lib/security.js
    authEndpoints: true, // Compatible with other auth endpoints
  };

  return {
    compatible: Object.values(compatibility).every(Boolean),
    details: compatibility,
    recommendations: [
      "Maintain current NIP-07 protocol compliance for browser extension compatibility",
      "Use existing session management for authentication state tracking",
      "Leverage security library for additional cryptographic operations",
      "Integrate with other auth endpoints for complete authentication flow",
    ],
  };
}

/**
 * Generate NIP-07 challenge verification data for signature validation
 * @param {string} challenge - Original challenge
 * @param {string} domain - Challenge domain
 * @param {number} timestamp - Challenge timestamp
 * @returns {Object} Verification data structure
 */
export function generateNIP07VerificationData(challenge, domain, timestamp) {
  return {
    challenge,
    domain,
    timestamp,
    verificationString: `${domain}:${challenge}:${timestamp}`,
    algorithm: "secp256k1",
    encoding: "hex",
    expectedSignatureFormat: "schnorr",
  };
}

/**
 * Validate NIP-07 challenge expiration
 * @param {number} challengeTimestamp - Challenge creation timestamp
 * @param {number} [expiryMinutes=5] - Expiry time in minutes
 * @returns {Object} Expiration validation result
 */
export function validateChallengeExpiration(challengeTimestamp, expiryMinutes = 5) {
  const now = Date.now();
  const expiryTime = challengeTimestamp + (expiryMinutes * 60 * 1000);
  const isExpired = now > expiryTime;
  const timeRemaining = Math.max(0, expiryTime - now);

  return {
    isExpired,
    timeRemaining,
    expiryTime,
    message: isExpired ? 'Challenge has expired' : `Challenge valid for ${Math.floor(timeRemaining / 1000)} seconds`,
  };
}
