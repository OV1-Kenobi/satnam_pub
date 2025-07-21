/**
 * P2P Lightning Payment API Endpoint - Master Context Compliant
 * POST /api/payments/p2p-lightning - P2P Lightning payments with sovereignty enforcement
 *
 * MASTER CONTEXT COMPLIANCE:
 * - JavaScript API route per browser-only serverless architecture
 * - Individual Wallet Sovereignty Principle enforcement with unlimited authority for sovereign roles
 * - Privacy-first architecture with zero-knowledge patterns and no sensitive data logging
 * - Standardized role hierarchy (greenfield - no legacy mappings)
 * - Lightning Network integration (Voltage, PhoenixD, Breez, NWC, Self-Hosted)
 * - Web Crypto API for browser compatibility
 * - Authentication integration with SecureSessionManager
 * - Lightning Network P2P payments with PaymentType enum support
 * - P2P_INTERNAL_LIGHTNING (PhoenixD primary) and P2P_EXTERNAL_LIGHTNING (Breez primary)
 */

// TODO: Convert session-manager.ts to JavaScript for proper imports
// import { SecureSessionManager } from "../../netlify/functions/security/session-manager.js";

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
 * Validate Individual Wallet Sovereignty for P2P Lightning operations
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {number} amount - Payment amount
 * @returns {Object} Sovereignty validation result
 */
function validateP2PLightningSovereignty(userRole, amount) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited P2P Lightning authority
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      authorized: true,
      spendingLimit: -1, // No limits for sovereign roles
      hasUnlimitedAccess: true,
      message: 'Sovereign role with unlimited P2P Lightning authority'
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Offspring have P2P Lightning spending thresholds
  if (userRole === 'offspring') {
    const dailyLimit = 150000; // 150K sats daily limit for offspring P2P payments
    const requiresApproval = amount > 25000; // 25K sats approval threshold

    return {
      authorized: amount <= dailyLimit,
      spendingLimit: dailyLimit,
      hasUnlimitedAccess: false,
      requiresApproval,
      message: requiresApproval ? 'P2P Lightning payment requires guardian approval' : 'P2P Lightning payment authorized within limits'
    };
  }

  // Default to unauthorized for unknown roles
  return {
    authorized: false,
    spendingLimit: 0,
    hasUnlimitedAccess: false,
    requiresApproval: true,
    message: 'Unknown role - P2P Lightning payment not authorized'
  };
}

/**
 * Select optimal Lightning node provider for P2P payment based on payment type
 * @param {'P2P_INTERNAL_LIGHTNING'|'P2P_EXTERNAL_LIGHTNING'} paymentType - Payment type
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @returns {'voltage'|'phoenixd'|'breez'|'nwc'|'self-hosted'} Selected node provider
 */
function selectLightningNodeForP2P(paymentType, userRole) {
  // Lightning Node provider selection based on Master Context P2P architecture

  if (paymentType === 'P2P_INTERNAL_LIGHTNING') {
    // PhoenixD primary for internal family payments
    return /** @type {'phoenixd'} */ ('phoenixd');
  }

  if (paymentType === 'P2P_EXTERNAL_LIGHTNING') {
    // Breez primary for external payments, with NWC for sovereign roles
    if (userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
      return /** @type {'breez'} */ ('breez'); // Breez preferred for external payments
    }
    return /** @type {'breez'} */ ('breez'); // Breez for all external payments
  }

  // Default to Voltage
  return /** @type {'voltage'} */ ('voltage');
}

/**
 * Generate privacy-preserving P2P payment hash using Web Crypto API
 * @param {string} fromUser - From user ID
 * @param {string} toUser - To user identifier
 * @param {number} amount - Payment amount
 * @returns {Promise<string>} Privacy-preserving hash
 */
async function generateP2PPaymentHash(fromUser, toUser, amount) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(`p2p_lightning_${fromUser}_${toUser}_${amount}_${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * @typedef {Object} P2PPaymentRequest
 * @property {string} toUser - User UUID or Lightning address
 * @property {number} amount - Amount in satoshis
 * @property {string} [memo] - Optional payment memo
 * @property {'P2P_INTERNAL_LIGHTNING'|'P2P_EXTERNAL_LIGHTNING'} paymentType - Payment type
 * @property {boolean} [enablePrivacy] - Optional privacy protection for external payments
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} [userRole] - Standardized user role (greenfield - no legacy mappings)
 */

/**
 * P2P Lightning payment response with Master Context compliance
 * @typedef {Object} P2PPaymentResponse
 * @property {boolean} success - Success status
 * @property {Object} data - Payment data
 * @property {string} data.paymentId - Privacy-preserving payment ID
 * @property {string} data.paymentHash - Lightning payment hash
 * @property {number} data.amount - Payment amount in satoshis
 * @property {string} data.toUser - Recipient identifier
 * @property {string} [data.memo] - Payment memo
 * @property {'P2P_INTERNAL_LIGHTNING'|'P2P_EXTERNAL_LIGHTNING'} data.paymentType - Payment type
 * @property {number} data.fee - Payment fee in satoshis (reduced for sovereign roles)
 * @property {Object} data.routing - Node routing information
 * @property {'voltage'|'phoenixd'|'breez'|'nwc'|'self-hosted'} data.routing.preferredNode - Selected Lightning node
 * @property {string} data.routing.reason - Reason for node selection
 * @property {Object} [data.privacy] - Privacy protection information
 * @property {boolean} data.privacy.enabled - Whether privacy was enabled
 * @property {string} [data.privacy.serviceUrl] - Privacy service URL
 * @property {Object} data.security - Security validation information
 * @property {boolean} data.security.validated - Whether security validation passed
 * @property {string} data.security.environment - Environment (development/production)
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
 * Individual Wallet Sovereignty validation result for P2P Lightning payments
 * @typedef {Object} P2PLightningSovereigntyValidation
 * @property {boolean} authorized - Whether payment is authorized
 * @property {number} spendingLimit - Spending limit (-1 for unlimited)
 * @property {boolean} hasUnlimitedAccess - Whether user has unlimited access
 * @property {boolean} [requiresApproval] - Whether approval is required
 * @property {string} message - Validation message
 */

/**
 * Validate P2P payment request
 * @param {P2PPaymentRequest} req - Payment request to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
function validateP2PPaymentRequest(req) {
  if (!req.toUser || typeof req.toUser !== 'string') {
    return { valid: false, error: 'toUser is required and must be a string' };
  }

  if (!req.amount || typeof req.amount !== 'number' || req.amount <= 0) {
    return { valid: false, error: 'amount is required and must be a positive number' };
  }

  if (!req.paymentType || !['P2P_INTERNAL_LIGHTNING', 'P2P_EXTERNAL_LIGHTNING'].includes(req.paymentType)) {
    return { valid: false, error: 'paymentType must be P2P_INTERNAL_LIGHTNING or P2P_EXTERNAL_LIGHTNING' };
  }

  if (req.amount > 100000000) { // 1 BTC limit
    return { valid: false, error: 'amount exceeds maximum limit of 100,000,000 sats' };
  }

  return { valid: true };
}



/**
 * Mock P2P internal Lightning payment with sovereignty compliance
 * @param {string} fromUser - From user ID
 * @param {string} toUser - To user identifier
 * @param {number} amount - Payment amount
 * @param {string} memo - Payment memo
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {Object} sovereigntyValidation - Sovereignty validation result
 * @returns {Promise<Object>} Payment result
 */
async function mockP2PInternalPayment(fromUser, toUser, amount, memo, userRole, sovereigntyValidation) {
  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const paymentId = `p2p_internal_${Date.now()}`;
  const baseFee = 10; // 10 sats base fee for internal payments
  const sovereigntyFee = sovereigntyValidation.hasUnlimitedAccess ? Math.ceil(baseFee * 0.5) : baseFee;

  return {
    success: true,
    paymentId,
    paymentHash: `internal_${await generateP2PPaymentHash(fromUser, toUser, amount)}`,
    fee: sovereigntyFee,
    routing: {
      preferredNode: 'phoenixd',
      reason: 'Internal family payment routing'
    },
    privacy: {
      isPrivacyEnabled: true,
      privacyServiceUrl: 'https://privacy.satnam.pub'
    },
    security: {
      validated: true,
      environment: getEnvVar('NODE_ENV') || 'development'
    }
  };
}

/**
 * Mock P2P external Lightning payment with sovereignty compliance
 * @param {string} fromUser - From user ID
 * @param {string} toUser - To user identifier
 * @param {number} amount - Payment amount
 * @param {string} memo - Payment memo
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {Object} sovereigntyValidation - Sovereignty validation result
 * @param {boolean} enablePrivacy - Privacy enabled
 * @returns {Promise<Object>} Payment result
 */
async function mockP2PExternalPayment(fromUser, toUser, amount, memo, userRole, sovereigntyValidation, enablePrivacy) {
  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const paymentId = `p2p_external_${Date.now()}`;
  const baseFee = 50; // 50 sats base fee for external payments
  const sovereigntyFee = sovereigntyValidation.hasUnlimitedAccess ? Math.ceil(baseFee * 0.5) : baseFee;

  return {
    success: true,
    paymentId,
    paymentHash: `external_${await generateP2PPaymentHash(fromUser, toUser, amount)}`,
    fee: sovereigntyFee,
    routing: {
      preferredNode: 'breez',
      reason: 'External payment routing'
    },
    privacy: {
      isPrivacyEnabled: enablePrivacy,
      privacyServiceUrl: enablePrivacy ? 'https://privacy.satnam.pub' : undefined
    },
    security: {
      validated: true,
      environment: getEnvVar('NODE_ENV') || 'development'
    }
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
          error: "Authentication required for P2P Lightning operations",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || '{}');

    // Validate request body
    const validation = validateP2PPaymentRequest(body);
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

    /** @type {P2PPaymentRequest} */
    const paymentRequest = body;

    // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
    const userRoleForValidation = /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (
      paymentRequest.userRole || sessionValidation.federationRole || 'private'
    );

    const sovereigntyValidation = validateP2PLightningSovereignty(userRoleForValidation, paymentRequest.amount);

    if (!sovereigntyValidation.authorized) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: sovereigntyValidation.message || "P2P Lightning payment amount exceeds spending limits",
          meta: {
            timestamp: new Date().toISOString(),
            spendingLimit: sovereigntyValidation.spendingLimit,
            requiresApproval: sovereigntyValidation.requiresApproval,
          },
        }),
      };
    }

    // Select optimal Lightning node provider for this P2P payment
    const selectedNodeProvider = selectLightningNodeForP2P(paymentRequest.paymentType, userRoleForValidation);

    // Generate privacy-preserving payment hash
    const paymentHash = await generateP2PPaymentHash(
      sessionValidation.memberId,
      paymentRequest.toUser,
      paymentRequest.amount
    );

    // Execute P2P payment with sovereignty compliance
    let result;
    if (paymentRequest.paymentType === 'P2P_INTERNAL_LIGHTNING') {
      result = await mockP2PInternalPayment(
        sessionValidation.memberId,
        paymentRequest.toUser,
        paymentRequest.amount,
        paymentRequest.memo || '',
        userRoleForValidation,
        sovereigntyValidation
      );
    } else {
      result = await mockP2PExternalPayment(
        sessionValidation.memberId,
        paymentRequest.toUser,
        paymentRequest.amount,
        paymentRequest.memo || '',
        userRoleForValidation,
        sovereigntyValidation,
        paymentRequest.enablePrivacy || false
      );
    }

    // Store payment record in database (mock implementation)
    const paymentId = `p2p_${paymentHash}`;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          paymentId,
          paymentHash: result.paymentHash,
          amount: paymentRequest.amount,
          toUser: paymentRequest.toUser,
          memo: paymentRequest.memo,
          paymentType: paymentRequest.paymentType,
          fee: result.fee,
          routing: {
            preferredNode: result.routing.preferredNode,
            reason: result.routing.reason,
          },
          privacy: result.privacy ? {
            enabled: result.privacy.isPrivacyEnabled,
            serviceUrl: result.privacy.privacyServiceUrl,
          } : undefined,
          security: {
            validated: result.security ? result.security.validated : false,
            environment: result.security ? result.security.environment : 'development',
          },
          message: "P2P Lightning payment processed successfully with sovereignty compliance",
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
        error: "Failed to process P2P Lightning payment",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      }),
    };
  }
}

export default handler;
