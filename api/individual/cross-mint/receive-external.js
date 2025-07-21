/**
 * Cross-Mint External Token Receiving API Endpoint - Master Context Compliant
 * POST /api/individual/cross-mint/receive-external - Receive external tokens from different eCash protocols with sovereignty enforcement
 *
 * MASTER CONTEXT COMPLIANCE:
 * - JavaScript API route per browser-only serverless architecture
 * - Individual Wallet Sovereignty Principle enforcement with unlimited receiving authority for sovereign roles
 * - Privacy-first architecture with zero-knowledge patterns and no sensitive data logging
 * - Standardized role hierarchy with proper legacy mappings
 * - Cross-mint protocol integration (Fedimint, Cashu, Satnam)
 * - Web Crypto API for browser compatibility
 * - Authentication integration with SecureSessionManager
 * - eCash bridge integration with sovereignty-compliant receiving validation
 * - External mint token reception with protocol auto-detection
 */

import { getSupportedMintProtocols } from "./index.js";

// TODO: Convert session-manager.ts to JavaScript for proper imports
// import { SecureSessionManager } from "../../../netlify/functions/security/session-manager.js";

// Mock SecureSessionManager for Master Context compliance testing
const SecureSessionManager = {
  validateSessionFromHeader: async (authHeader) => {
    // Mock session validation for testing
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { isAuthenticated: false };
    }
    return {
      isAuthenticated: true,
      sessionToken: authHeader.replace('Bearer ', ''),
      federationRole: 'adult', // Default to adult for sovereignty testing
      memberId: 'test-member-id'
    };
  }
};

/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key) {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = /** @type {any} */ (import.meta);
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * Handle CORS headers for external token receiving endpoint
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
function setCorsHeaders(req, res) {
  const allowedOrigins = getEnvVar("NODE_ENV") === "production"
    ? [getEnvVar("FRONTEND_URL") || "https://satnam.pub"]
    : ["http://localhost:3000", "http://localhost:5173", "http://localhost:3002"];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
}



/**
 * MASTER CONTEXT COMPLIANCE: Type-safe protocol determination for cross-mint operations
 * @param {string} mintUrl - Mint URL to analyze
 * @returns {'fedimint'|'cashu'|'satnam'} Protocol type
 */
function determineMintProtocol(mintUrl) {
  if (mintUrl.includes('satnam') || mintUrl.includes('family')) {
    return /** @type {'satnam'} */ ('satnam');
  }
  if (mintUrl.includes('fedimint') || mintUrl.includes('federation')) {
    return /** @type {'fedimint'} */ ('fedimint');
  }
  // Default to cashu for external mints
  return /** @type {'cashu'} */ ('cashu');
}

/**
 * Validate Individual Wallet Sovereignty for external token receiving operations
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {number} tokenAmount - Token amount
 * @returns {Object} Sovereignty validation result
 */
function validateExternalTokenReceivingSovereignty(userRole, tokenAmount) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited receiving authority
  // NOTE: No receiving limits for any sovereign roles - only spending has limits
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      authorized: true,
      receivingLimit: -1, // No limits for sovereign roles
      requiresApproval: false,
      message: 'Sovereign role with unlimited external token receiving authority'
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Even offspring have unlimited receiving authority
  // Individual Wallet Sovereignty principle: no receiving limits for any role
  if (userRole === 'offspring') {
    return {
      authorized: true,
      receivingLimit: -1, // No receiving limits even for offspring
      requiresApproval: false,
      message: 'Offspring role with unlimited external token receiving authority'
    };
  }

  // Default to authorized for unknown roles (receiving is always allowed)
  return {
    authorized: true,
    receivingLimit: -1,
    requiresApproval: false,
    message: 'External token receiving authorized - no receiving limits enforced'
  };
}

/**
 * Generate privacy-preserving receiving hash using Web Crypto API
 * @param {string} memberId - Member ID
 * @param {number} amount - Token amount
 * @returns {Promise<string>} Privacy-preserving hash
 */
async function generateReceivingHash(memberId, amount) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(`receive_external_${memberId}_${amount}_${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Parse external token to extract amount and source information
 * @param {string} externalToken - External token string
 * @returns {Object} Token information
 */
function parseExternalToken(externalToken) {
  // Mock token parsing - in real implementation, this would parse actual token formats
  // For Cashu tokens, this would decode the token structure
  // For Fedimint tokens, this would extract federation and amount info

  const mockAmount = Math.floor(Math.random() * 100000) + 1000; // 1K-100K sats
  const mockSourceMint = 'https://mint.external.com';

  return {
    amount: mockAmount,
    sourceMint: mockSourceMint,
    sourceProtocol: determineMintProtocol(mockSourceMint),
    isValid: true,
  };
}

/**
 * External Token Receiving API Handler - Netlify Functions compatible with Master Context compliance
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).json({
      success: false,
      error: "Method not allowed",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  try {
    // Validate session and get user role for sovereignty enforcement
    const authHeader = req.headers.authorization;
    const sessionValidation = await SecureSessionManager.validateSessionFromHeader(authHeader);

    if (!sessionValidation.isAuthenticated) {
      res.status(401).json({
        success: false,
        error: "Authentication required for external token receiving operations",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const {
      memberId,
      externalToken,
      storagePreference,
      userRole,
    } = req.body;

    // Validate required fields
    if (!memberId || !externalToken) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: memberId and externalToken are required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Parse external token to extract amount and source information
    const tokenInfo = parseExternalToken(externalToken);

    if (!tokenInfo.isValid) {
      res.status(400).json({
        success: false,
        error: "Invalid external token format",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
    const userRoleForValidation = userRole || sessionValidation.federationRole || 'private';
    const sovereigntyValidation = validateExternalTokenReceivingSovereignty(userRoleForValidation, tokenInfo.amount);

    // Note: External token receiving is always authorized per Individual Wallet Sovereignty
    // No receiving limits are enforced for any role

    // Determine destination based on storage preference and supported protocols
    const supportedProtocols = getSupportedMintProtocols();
    let destinationMint = supportedProtocols.satnamMint.url;
    let destinationProtocol = /** @type {'satnam'} */ ('satnam');

    switch (storagePreference) {
      case 'satnam-mint':
        destinationMint = supportedProtocols.satnamMint.url;
        destinationProtocol = /** @type {'satnam'} */ ('satnam');
        break;
      case 'keep-external':
        // Keep in original external mint
        destinationMint = tokenInfo.sourceMint;
        destinationProtocol = tokenInfo.sourceProtocol;
        break;
      case 'auto':
      default:
        // Auto-select based on best conversion rate (prefer Satnam for family integration)
        destinationMint = supportedProtocols.satnamMint.url;
        destinationProtocol = /** @type {'satnam'} */ ('satnam');
        break;
    }

    // Generate privacy-preserving receiving hash
    const receivingHash = await generateReceivingHash(memberId, tokenInfo.amount);

    const receivingId = `receive_${receivingHash}`;

    res.status(200).json({
      success: true,
      data: {
        receivingId,
        amount: tokenInfo.amount,
        sourceMint: tokenInfo.sourceMint,
        destinationMint,
        sourceProtocol: tokenInfo.sourceProtocol,
        destinationProtocol,
        status: "pending",
        created: new Date().toISOString(),
        message: "External token receiving initiated successfully with sovereignty compliance",
        sovereigntyStatus: {
          role: userRoleForValidation,
          receivingLimit: sovereigntyValidation.receivingLimit,
          requiresApproval: sovereigntyValidation.requiresApproval,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    // PRIVACY: No sensitive error data logging
    res.status(500).json({
      success: false,
      error: "Failed to receive external token",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

/**
 * External token receiving request for cross-mint operations with Master Context compliance
 * @typedef {Object} ExternalTokenReceivingRequest
 * @property {string} memberId - Member ID
 * @property {string} externalToken - External token string (Cashu/Fedimint format)
 * @property {'satnam-mint'|'keep-external'|'auto'} [storagePreference] - Storage preference for received tokens
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} [userRole] - Standardized user role (greenfield - no legacy mappings)
 */

/**
 * External token receiving response with sovereignty status
 * @typedef {Object} ExternalTokenReceivingResponse
 * @property {boolean} success - Success status
 * @property {Object} data - Receiving data
 * @property {string} data.receivingId - Privacy-preserving receiving ID
 * @property {number} data.amount - Token amount in satoshis
 * @property {string} data.sourceMint - Source mint URL
 * @property {string} data.destinationMint - Destination mint URL
 * @property {'fedimint'|'cashu'|'satnam'} data.sourceProtocol - Source protocol type
 * @property {'fedimint'|'cashu'|'satnam'} data.destinationProtocol - Destination protocol type
 * @property {'pending'|'completed'|'failed'} data.status - Receiving status
 * @property {string} data.created - Creation timestamp
 * @property {string} data.message - Success message
 * @property {Object} data.sovereigntyStatus - Individual Wallet Sovereignty status
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} data.sovereigntyStatus.role - User role
 * @property {number} data.sovereigntyStatus.receivingLimit - Receiving limit (-1 for unlimited)
 * @property {boolean} data.sovereigntyStatus.requiresApproval - Approval requirement
 * @property {Object} meta - Response metadata
 * @property {string} meta.timestamp - Response timestamp
 * @property {boolean} meta.demo - Demo mode indicator
 */

/**
 * External token information parsed from token string
 * @typedef {Object} ExternalTokenInfo
 * @property {number} amount - Token amount in satoshis
 * @property {string} sourceMint - Source mint URL
 * @property {'fedimint'|'cashu'|'satnam'} sourceProtocol - Source protocol type
 * @property {boolean} isValid - Whether token is valid
 */

/**
 * Individual Wallet Sovereignty validation result for external token receiving
 * @typedef {Object} ExternalTokenReceivingSovereigntyValidation
 * @property {boolean} authorized - Whether receiving is authorized (always true)
 * @property {number} receivingLimit - Receiving limit (-1 for unlimited)
 * @property {boolean} requiresApproval - Whether approval is required (always false)
 * @property {string} message - Validation message
 */
