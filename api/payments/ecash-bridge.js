/**
 * eCash Bridge API Endpoint - Master Context Compliant
 * POST /api/payments/ecash-bridge - Bidirectional eCash conversions with sovereignty enforcement
 *
 * MASTER CONTEXT COMPLIANCE:
 * - JavaScript API route per browser-only serverless architecture
 * - Individual Wallet Sovereignty Principle enforcement with unlimited authority for sovereign roles
 * - Privacy-first architecture with zero-knowledge patterns and no sensitive data logging
 * - Standardized role hierarchy (greenfield - no legacy mappings)
 * - Cross-mint protocol integration (Fedimint, Cashu, Satnam)
 * - Web Crypto API for browser compatibility
 * - Authentication integration with SecureSessionManager
 * - eCash bridge operations with universal access for all user roles including 'private' users
 * - Bidirectional Fedimint↔Cashu conversion with no receiving limits for any role
 */

// PRODUCTION: Use real SecureSessionManager for authentication
import { SecureSessionManager } from "../../netlify/functions/security/session-manager.js";

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
 * Validate Individual Wallet Sovereignty for eCash bridge operations
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {number} amount - Bridge amount
 * @returns {Object} Sovereignty validation result
 */
function validateECashBridgeSovereignty(userRole, amount) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited eCash bridge authority
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      authorized: true,
      spendingLimit: -1, // No limits for sovereign roles
      hasUnlimitedAccess: true,
      message: 'Sovereign role with unlimited eCash bridge authority'
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Offspring have eCash bridge spending thresholds
  if (userRole === 'offspring') {
    const dailyLimit = 200000; // 200K sats daily limit for offspring eCash operations
    const requiresApproval = amount > 50000; // 50K sats approval threshold

    return {
      authorized: amount <= dailyLimit,
      spendingLimit: dailyLimit,
      hasUnlimitedAccess: false,
      requiresApproval,
      message: requiresApproval ? 'eCash bridge requires guardian approval' : 'eCash bridge authorized within limits'
    };
  }

  // Default to unauthorized for unknown roles
  return {
    authorized: false,
    spendingLimit: 0,
    hasUnlimitedAccess: false,
    requiresApproval: true,
    message: 'Unknown role - eCash bridge not authorized'
  };
}

/**
 * Determine mint protocol type from token or destination
 * @param {string} tokenOrDestination - Token or destination to analyze
 * @returns {'fedimint'|'cashu'|'satnam'} Protocol type
 */
function determineMintProtocol(tokenOrDestination) {
  // Type-safe protocol determination for eCash bridge operations
  if (tokenOrDestination.includes('fedimint') || tokenOrDestination.includes('federation')) {
    return /** @type {'fedimint'} */ ('fedimint');
  }

  if (tokenOrDestination.includes('cashu') || tokenOrDestination.includes('mint')) {
    return /** @type {'cashu'} */ ('cashu');
  }

  if (tokenOrDestination.includes('satnam') || tokenOrDestination.includes('family')) {
    return /** @type {'satnam'} */ ('satnam');
  }

  // Default to Cashu for external mints
  return /** @type {'cashu'} */ ('cashu');
}

/**
 * Generate privacy-preserving eCash bridge hash using Web Crypto API
 * @param {string} token - Token to hash
 * @returns {Promise<string>} Privacy-preserving hash
 */
async function generateECashBridgeHash(token) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(`ecash_bridge_${token}_${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * @typedef {Object} ECashBridgeRequest
 * @property {string} sourceToken - Source eCash token (Fedimint or Cashu)
 * @property {string} targetDestination - Target mint URL or federation
 * @property {'ECASH_FEDIMINT_TO_CASHU'|'ECASH_CASHU_TO_FEDIMINT'|'ECASH_FEDIMINT_TO_FEDIMINT'|'ECASH_CASHU_EXTERNAL_SWAP'} operationType - Operation type
 * @property {boolean} [isMultiNut] - For external Cashu swaps
 * @property {boolean} [enablePrivacy] - Optional privacy protection
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} [userRole] - Standardized user role (greenfield - no legacy mappings)
 */

/**
 * eCash bridge response with Master Context compliance
 * @typedef {Object} ECashBridgeResponse
 * @property {boolean} success - Success status
 * @property {Object} data - Bridge operation data
 * @property {string} data.operationId - Privacy-preserving operation ID
 * @property {string} data.conversionId - Conversion/swap ID
 * @property {string} [data.resultTokenHash] - Hashed result token for privacy
 * @property {number} data.conversionFee - Conversion fee in satoshis (reduced for sovereign roles)
 * @property {'fedimint'|'cashu'|'satnam'} data.sourceProtocol - Source protocol type
 * @property {'fedimint'|'cashu'|'satnam'} data.targetProtocol - Target protocol type
 * @property {Object} [data.routing] - Node routing information
 * @property {string} data.routing.preferredNode - Selected Lightning node
 * @property {string} data.routing.reason - Reason for node selection
 * @property {Object} [data.privacy] - Privacy protection information
 * @property {boolean} data.privacy.enabled - Whether privacy was enabled
 * @property {string} [data.privacy.serviceUrl] - Privacy service URL
 * @property {string} [data.expiresAt] - Operation expiration timestamp
 * @property {string} data.message - Success message
 * @property {Object} data.sovereigntyStatus - Individual Wallet Sovereignty status
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} data.sovereigntyStatus.role - User role
 * @property {boolean} data.sovereigntyStatus.hasUnlimitedAccess - Whether user has unlimited access
 * @property {number} data.sovereigntyStatus.spendingLimit - Spending limit (-1 for unlimited)
 * @property {Object} meta - Response metadata
 * @property {string} meta.timestamp - Response timestamp
 * @property {boolean} meta.demo - Demo mode indicator
 */

/**
 * Individual Wallet Sovereignty validation result for eCash bridge operations
 * @typedef {Object} ECashBridgeSovereigntyValidation
 * @property {boolean} authorized - Whether bridge operation is authorized
 * @property {number} spendingLimit - Spending limit (-1 for unlimited)
 * @property {boolean} hasUnlimitedAccess - Whether user has unlimited access
 * @property {boolean} [requiresApproval] - Whether approval is required
 * @property {string} message - Validation message
 */

/**
 * @typedef {Object} CashuConversionResponse
 * @property {boolean} success - Operation success status
 * @property {string} [conversionId] - Conversion operation ID
 * @property {string} [cashuToken] - Resulting Cashu token
 * @property {number} [conversionFee] - Conversion fee amount
 * @property {Object} [routing] - Routing information
 * @property {string} [routing.preferredNode] - Preferred routing node
 * @property {string} [routing.reason] - Routing reason
 * @property {Object} [privacy] - Privacy settings
 * @property {boolean} [privacy.isPrivacyEnabled] - Privacy enabled status
 * @property {string} [privacy.privacyServiceUrl] - Privacy service URL
 * @property {Date} [expiresAt] - Token expiration date
 */

/**
 * @typedef {Object} FedimintConversionResponse
 * @property {boolean} success - Operation success status
 * @property {string} [conversionId] - Conversion operation ID
 * @property {string} [fedimintToken] - Resulting Fedimint token
 * @property {number} [conversionFee] - Conversion fee amount
 * @property {Object} [routing] - Routing information
 * @property {string} [routing.preferredNode] - Preferred routing node
 * @property {string} [routing.reason] - Routing reason
 * @property {Object} [privacy] - Privacy settings
 * @property {boolean} [privacy.isPrivacyEnabled] - Privacy enabled status
 * @property {string} [privacy.privacyServiceUrl] - Privacy service URL
 * @property {Date} [expiresAt] - Token expiration date
 */

/**
 * @typedef {Object} ExternalCashuSwapResponse
 * @property {boolean} success - Operation success status
 * @property {string} [swapId] - Swap operation ID
 * @property {string} [swappedToken] - Resulting swapped token
 * @property {number} [swapFee] - Swap fee amount
 * @property {number} [fee] - Alternative fee property
 * @property {Object} [routing] - Routing information
 * @property {string} [routing.preferredNode] - Preferred routing node
 * @property {string} [routing.reason] - Routing reason
 * @property {Object} [privacy] - Privacy settings
 * @property {boolean} [privacy.isPrivacyEnabled] - Privacy enabled status
 * @property {string} [privacy.privacyServiceUrl] - Privacy service URL
 * @property {Date} [expiresAt] - Token expiration date
 */

/**
 * @typedef {CashuConversionResponse | FedimintConversionResponse | ExternalCashuSwapResponse} ECashBridgeOperationResult
 */

/**
 * Validate eCash bridge request
 * @param {ECashBridgeRequest} req - Bridge request to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
function validateECashBridgeRequest(req) {
  if (!req.sourceToken || typeof req.sourceToken !== 'string') {
    return { valid: false, error: 'sourceToken is required and must be a string' };
  }

  if (!req.targetDestination || typeof req.targetDestination !== 'string') {
    return { valid: false, error: 'targetDestination is required and must be a string' };
  }

  const validOperationTypes = [
    'ECASH_FEDIMINT_TO_CASHU',
    'ECASH_CASHU_TO_FEDIMINT', 
    'ECASH_FEDIMINT_TO_FEDIMINT',
    'ECASH_CASHU_EXTERNAL_SWAP'
  ];

  if (!req.operationType || !validOperationTypes.includes(req.operationType)) {
    return { valid: false, error: 'operationType must be one of: ' + validOperationTypes.join(', ') };
  }

  if (req.sourceToken.length < 10) {
    return { valid: false, error: 'sourceToken appears to be invalid (too short)' };
  }

  return { valid: true };
}



/**
 * Create privacy-compliant hash of token using Web Crypto API
 * @param {string} token - Token to hash
 * @returns {Promise<string>} SHA-256 hash
 */
async function hashToken(token) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Mock Fedimint to Cashu conversion with sovereignty compliance
 * @param {string} sourceToken - Source Fedimint token
 * @param {string} targetDestination - Target Cashu mint
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {Object} sovereigntyValidation - Sovereignty validation result
 * @returns {Promise<Object>} Conversion result
 */
async function mockFedimintToCashuConversion(sourceToken, targetDestination, userRole, sovereigntyValidation) {
  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const conversionId = `fedimint_to_cashu_${Date.now()}`;
  const baseFee = 100; // 100 sats base fee
  const sovereigntyFee = sovereigntyValidation.hasUnlimitedAccess ? Math.ceil(baseFee * 0.5) : baseFee;

  return {
    success: true,
    conversionId,
    cashuToken: `cashu_token_${await generateECashBridgeHash(sourceToken)}`,
    conversionFee: sovereigntyFee,
    routing: {
      preferredNode: 'phoenixd',
      reason: 'Internal family payment routing'
    },
    privacy: {
      isPrivacyEnabled: true,
      privacyServiceUrl: 'https://privacy.satnam.pub'
    },
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  };
}

/**
 * Mock Cashu to Fedimint conversion with sovereignty compliance
 * @param {string} sourceToken - Source Cashu token
 * @param {string} targetDestination - Target Fedimint federation
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {Object} sovereigntyValidation - Sovereignty validation result
 * @returns {Promise<Object>} Conversion result
 */
async function mockCashuToFedimintConversion(sourceToken, targetDestination, userRole, sovereigntyValidation) {
  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const conversionId = `cashu_to_fedimint_${Date.now()}`;
  const baseFee = 150; // 150 sats base fee
  const sovereigntyFee = sovereigntyValidation.hasUnlimitedAccess ? Math.ceil(baseFee * 0.5) : baseFee;

  return {
    success: true,
    conversionId,
    fedimintToken: `fedimint_token_${await generateECashBridgeHash(sourceToken)}`,
    conversionFee: sovereigntyFee,
    routing: {
      preferredNode: 'voltage',
      reason: 'External federation routing'
    },
    privacy: {
      isPrivacyEnabled: true,
      privacyServiceUrl: 'https://privacy.satnam.pub'
    },
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  };
}

/**
 * Mock Fedimint to Fedimint conversion with sovereignty compliance
 * @param {string} sourceToken - Source Fedimint token
 * @param {string} targetDestination - Target Fedimint federation
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {Object} sovereigntyValidation - Sovereignty validation result
 * @returns {Promise<Object>} Conversion result
 */
async function mockFedimintToFedimintConversion(sourceToken, targetDestination, userRole, sovereigntyValidation) {
  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const conversionId = `fedimint_to_fedimint_${Date.now()}`;
  const baseFee = 50; // 50 sats base fee for same protocol
  const sovereigntyFee = sovereigntyValidation.hasUnlimitedAccess ? Math.ceil(baseFee * 0.5) : baseFee;

  return {
    success: true,
    conversionId,
    fedimintToken: `fedimint_token_${await generateECashBridgeHash(sourceToken)}`,
    conversionFee: sovereigntyFee,
    routing: {
      preferredNode: 'phoenixd',
      reason: 'Federation-to-federation routing'
    },
    privacy: {
      isPrivacyEnabled: true,
      privacyServiceUrl: 'https://privacy.satnam.pub'
    },
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  };
}

/**
 * Mock external Cashu swap with sovereignty compliance
 * @param {string} sourceToken - Source Cashu token
 * @param {string} targetDestination - Target external mint
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {Object} sovereigntyValidation - Sovereignty validation result
 * @param {boolean} isMultiNut - Multi-nut operation
 * @param {boolean} enablePrivacy - Privacy enabled
 * @returns {Promise<Object>} Swap result
 */
async function mockExternalCashuSwap(sourceToken, targetDestination, userRole, sovereigntyValidation, isMultiNut, enablePrivacy) {
  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const swapId = `external_cashu_swap_${Date.now()}`;
  const baseFee = 200; // 200 sats base fee for external swaps
  const sovereigntyFee = sovereigntyValidation.hasUnlimitedAccess ? Math.ceil(baseFee * 0.5) : baseFee;

  return {
    success: true,
    swapId,
    swappedToken: `external_cashu_token_${await generateECashBridgeHash(sourceToken)}`,
    swapFee: sovereigntyFee,
    routing: {
      preferredNode: 'voltage',
      reason: 'External mint routing'
    },
    privacy: {
      isPrivacyEnabled: enablePrivacy,
      privacyServiceUrl: enablePrivacy ? 'https://privacy.satnam.pub' : undefined
    },
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  };
}

/**
 * Main API handler function
 * @param {Object} event - Netlify event object
 * @param {Object} context - Netlify context object
 * @returns {Promise<Object>} Netlify response object
 */
async function handler(event, context) {
  // Set CORS headers for Netlify Functions
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Validate session and get user role for sovereignty enforcement
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const sessionValidation = await SecureSessionManager.validateSessionFromHeader(authHeader);

    if (!sessionValidation.isAuthenticated) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Authentication required for eCash bridge operations",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || '{}');

    // Validate request body
    const validation = validateECashBridgeRequest(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: validation.error,
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    /** @type {ECashBridgeRequest} */
    const bridgeRequest = body;

    // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
    const userRoleForValidation = /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (
      bridgeRequest.userRole || sessionValidation.federationRole || 'private'
    );

    // Estimate amount from token for sovereignty validation (mock implementation)
    const estimatedAmount = bridgeRequest.sourceToken.length * 100; // Mock estimation
    const sovereigntyValidation = validateECashBridgeSovereignty(userRoleForValidation, estimatedAmount);

    if (!sovereigntyValidation.authorized) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: sovereigntyValidation.message || "eCash bridge amount exceeds spending limits",
          meta: {
            timestamp: new Date().toISOString(),
            spendingLimit: sovereigntyValidation.spendingLimit,
            requiresApproval: sovereigntyValidation.requiresApproval,
          },
        }),
      };
    }

    // Determine source and target protocols
    const sourceProtocol = determineMintProtocol(bridgeRequest.sourceToken);
    const targetProtocol = determineMintProtocol(bridgeRequest.targetDestination);

    // Generate privacy-preserving bridge hash
    const bridgeHash = await generateECashBridgeHash(bridgeRequest.sourceToken);

    // Mock eCash bridge operation with sovereignty compliance
    let result;
    switch (bridgeRequest.operationType) {
      case 'ECASH_FEDIMINT_TO_CASHU':
        result = await mockFedimintToCashuConversion(
          bridgeRequest.sourceToken,
          bridgeRequest.targetDestination,
          userRoleForValidation,
          sovereigntyValidation
        );
        break;

      case 'ECASH_CASHU_TO_FEDIMINT':
        result = await mockCashuToFedimintConversion(
          bridgeRequest.sourceToken,
          bridgeRequest.targetDestination,
          userRoleForValidation,
          sovereigntyValidation
        );
        break;

      case 'ECASH_FEDIMINT_TO_FEDIMINT':
        result = await mockFedimintToFedimintConversion(
          bridgeRequest.sourceToken,
          bridgeRequest.targetDestination,
          userRoleForValidation,
          sovereigntyValidation
        );
        break;

      case 'ECASH_CASHU_EXTERNAL_SWAP':
        result = await mockExternalCashuSwap(
          bridgeRequest.sourceToken,
          bridgeRequest.targetDestination,
          userRoleForValidation,
          sovereigntyValidation,
          bridgeRequest.isMultiNut || false,
          bridgeRequest.enablePrivacy || false
        );
        break;

      default:
        throw new Error('Unsupported operation type');
    }

    // Store operation record in database (mock implementation)
    const operationId = `bridge_${bridgeHash}`;

    // Safely extract conversion/swap ID
    const conversionId = result.conversionId || result.swapId || 'unknown';

    // Safely extract result token hash for privacy
    const resultTokenHash = result.cashuToken ? await hashToken(result.cashuToken) :
                           result.fedimintToken ? await hashToken(result.fedimintToken) :
                           result.swappedToken ? await hashToken(result.swappedToken) :
                           undefined;

    // Safely extract fee
    const conversionFee = result.conversionFee || result.swapFee || 0;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          operationId,
          conversionId,
          resultTokenHash,
          conversionFee,
          sourceProtocol,
          targetProtocol,
          routing: result.routing ? {
            preferredNode: result.routing.preferredNode,
            reason: result.routing.reason,
          } : undefined,
          privacy: result.privacy ? {
            enabled: result.privacy.isPrivacyEnabled,
            serviceUrl: result.privacy.privacyServiceUrl,
          } : undefined,
          expiresAt: result.expiresAt ? result.expiresAt.toISOString() : undefined,
          message: "eCash bridge operation completed successfully with sovereignty compliance",
          sovereigntyStatus: {
            role: userRoleForValidation,
            hasUnlimitedAccess: sovereigntyValidation.hasUnlimitedAccess,
            spendingLimit: sovereigntyValidation.spendingLimit,
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      }),
    };

  } catch (error) {
    // PRIVACY: No sensitive error data logging
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Failed to process eCash bridge operation",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      }),
    };
  }
}

export default handler;
