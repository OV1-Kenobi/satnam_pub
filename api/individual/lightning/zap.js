/**
 * Lightning Zap API Endpoint - Master Context Compliant
 * POST /api/individual/lightning/zap - Send Lightning zaps with sovereignty enforcement
 *
 * MASTER CONTEXT COMPLIANCE:
 * - JavaScript API route per browser-only serverless architecture
 * - Individual Wallet Sovereignty Principle enforcement with unlimited authority for sovereign roles
 * - Privacy-first architecture with zero-knowledge patterns and no sensitive data logging
 * - Standardized role hierarchy (greenfield - no legacy mappings)
 * - Lightning Network integration (Voltage, PhoenixD, Breez, NWC, Self-Hosted)
 * - Web Crypto API for browser compatibility
 * - Authentication integration with SecureSessionManager
 * - Lightning Network P2P payments and eCash bridge integration
 * - Lightning zap operations with node provider routing
 */

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
 * Validate Individual Wallet Sovereignty for Lightning zap operations
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {number} zapAmount - Zap amount
 * @returns {Object} Sovereignty validation result
 */
function validateLightningZapSovereignty(userRole, zapAmount) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited Lightning zap authority
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      authorized: true,
      spendingLimit: -1, // No limits for sovereign roles
      requiresApproval: false,
      message: 'Sovereign role with unlimited Lightning zap authority'
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Only offspring accounts have zap limits
  if (userRole === 'offspring') {
    const dailyLimit = 25000; // 25K sats daily limit for offspring zaps
    const requiresApproval = zapAmount > 5000; // 5K sats approval threshold

    return {
      authorized: zapAmount <= dailyLimit,
      spendingLimit: dailyLimit,
      requiresApproval,
      message: requiresApproval ? 'Lightning zap requires guardian approval' : 'Lightning zap authorized within limits'
    };
  }

  // Default to unauthorized for unknown roles
  return {
    authorized: false,
    spendingLimit: 0,
    requiresApproval: true,
    message: 'Unknown role - Lightning zap not authorized'
  };
}

/**
 * Generate privacy-preserving zap hash using Web Crypto API
 * @param {string} memberId - Member ID
 * @param {number} amount - Zap amount
 * @returns {Promise<string>} Privacy-preserving hash
 */
async function generateZapHash(memberId, amount) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(`lightning_zap_${memberId}_${amount}_${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Select optimal Lightning node provider for zap based on user role and recipient
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {string} recipient - Zap recipient
 * @returns {'voltage'|'phoenixd'|'breez'|'nwc'|'self-hosted'} Selected node provider
 */
function selectLightningNodeForZap(userRole, recipient) {
  // Lightning Node provider selection based on Master Context architecture

  // For Nostr pubkeys (npub), prefer NWC if available for sovereign roles
  if (recipient.startsWith('npub1') && (userRole === 'adult' || userRole === 'steward' || userRole === 'guardian')) {
    return /** @type {'nwc'} */ ('nwc');
  }

  // For family members (internal payments), prefer PhoenixD
  if (recipient.includes('@satnam.') || recipient.includes('@family.')) {
    return /** @type {'phoenixd'} */ ('phoenixd');
  }

  // For external Lightning addresses, use Voltage as default
  if (recipient.includes('@')) {
    return /** @type {'voltage'} */ ('voltage');
  }

  // Default to Voltage for all other cases
  return /** @type {'voltage'} */ ('voltage');
}

/**
 * Generate a mock payment hash for testing
 * @returns {string} Mock 64-character hex payment hash
 */
function generateMockPaymentHash() {
  // Generate a mock 64-character hex string (like a real payment hash)
  const chars = "0123456789abcdef";
  let hash = "";
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

/**
 * Process Lightning zap with sovereignty compliance and node provider routing
 * @param {Object} zapData - Zap data
 * @param {string} zapData.memberId - Member ID
 * @param {number} zapData.amount - Zap amount
 * @param {string} zapData.recipient - Zap recipient
 * @param {string} zapData.memo - Zap memo
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} zapData.userRole - User role
 * @param {'voltage'|'phoenixd'|'breez'|'nwc'|'self-hosted'} zapData.nodeProvider - Selected node provider
 * @returns {Promise<Object>} Zap processing result
 */
async function processLightningZap(zapData) {
  // Mock zap processing with sovereignty compliance - in real implementation this would:
  // 1. Validate user has sufficient balance
  // 2. Check spending limits (SOVEREIGNTY: unlimited for Adults/Stewards/Guardians)
  // 3. Route through selected Lightning node provider
  // 4. Process the Lightning payment/zap
  // 5. Update user balance
  // 6. Record transaction in database

  const { memberId, amount, recipient, memo, userRole, nodeProvider } = zapData;

  // Generate privacy-preserving zap hash
  const zapHash = await generateZapHash(memberId, amount);

  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Calculate sovereignty-compliant fees
  const baseFee = Math.ceil(amount * 0.001); // 0.1% base fee
  const sovereigntyFee = (userRole === 'adult' || userRole === 'steward' || userRole === 'guardian')
    ? Math.ceil(baseFee * 0.5) // 50% fee reduction for sovereign roles
    : baseFee;

  // Mock success response with sovereignty compliance
  const zapId = `zap_${zapHash}`;

  return {
    zapId,
    amount,
    recipient,
    memo,
    status: /** @type {'completed'} */ ("completed"),
    timestamp: new Date().toISOString(),
    fee: sovereigntyFee,
    paymentHash: generateMockPaymentHash(),
    nodeProvider,
    paymentType: recipient.includes('@satnam.') || recipient.includes('@family.')
      ? /** @type {'internal'} */ ('internal')
      : /** @type {'external'} */ ('external'),
  };
}

/**
 * Lightning Zap API Handler - Netlify Functions compatible
 * @param {Object} event - Netlify event object
 * @param {Object} context - Netlify context object
 * @returns {Promise<Object>} Netlify response object
 */
export default async function handler(event, context) {
  // Set CORS headers for Netlify Functions
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Method not allowed",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
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
          error: "Authentication required for Lightning zap operations",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { memberId, amount, recipient, memo, userRole } = body;

    // Validate required fields
    if (!memberId || !amount || !recipient) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Missing required fields: memberId, amount, and recipient are required",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    // Validate amount
    if (typeof amount !== "number" || amount <= 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Amount must be a positive number",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    // Validate recipient format (basic validation)
    if (typeof recipient !== "string" || recipient.length < 10) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Invalid recipient format",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
    const userRoleForValidation = userRole || sessionValidation.federationRole || 'private';
    const sovereigntyValidation = validateLightningZapSovereignty(userRoleForValidation, amount);

    if (!sovereigntyValidation.authorized) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: sovereigntyValidation.message || "Lightning zap amount exceeds spending limits",
          meta: {
            timestamp: new Date().toISOString(),
            spendingLimit: sovereigntyValidation.spendingLimit,
            requiresApproval: sovereigntyValidation.requiresApproval,
          },
        }),
      };
    }

    // Select optimal Lightning node provider for this zap
    const selectedNodeProvider = selectLightningNodeForZap(userRoleForValidation, recipient);

    // Process Lightning zap with sovereignty compliance
    const zapResult = await processLightningZap({
      memberId,
      amount,
      recipient,
      memo: memo || "",
      userRole: userRoleForValidation,
      nodeProvider: selectedNodeProvider,
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          ...zapResult,
          message: "Lightning zap processed successfully with sovereignty compliance",
          sovereigntyStatus: {
            role: userRoleForValidation,
            spendingLimit: sovereigntyValidation.spendingLimit,
            requiresApproval: sovereigntyValidation.requiresApproval,
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
        error: "Failed to process Lightning zap",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      }),
    };
  }
}

/**
 * Lightning zap request with Master Context compliance
 * @typedef {Object} LightningZapRequest
 * @property {string} memberId - Member ID
 * @property {number} amount - Amount in satoshis
 * @property {string} recipient - Recipient identifier (npub, Lightning address, etc.)
 * @property {string} [memo] - Optional zap memo
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} [userRole] - Standardized user role (greenfield - no legacy mappings)
 */

/**
 * Lightning zap response with sovereignty status
 * @typedef {Object} LightningZapResponse
 * @property {boolean} success - Success status
 * @property {Object} data - Zap data
 * @property {string} data.zapId - Privacy-preserving zap ID
 * @property {number} data.amount - Amount in satoshis
 * @property {string} data.recipient - Recipient identifier
 * @property {string} data.memo - Zap memo
 * @property {'completed'|'failed'|'pending'} data.status - Zap status
 * @property {string} data.timestamp - ISO timestamp
 * @property {number} data.fee - Fee in satoshis (reduced for sovereign roles)
 * @property {string} data.paymentHash - Lightning payment hash
 * @property {'voltage'|'phoenixd'|'breez'|'nwc'|'self-hosted'} data.nodeProvider - Lightning node provider used
 * @property {'internal'|'external'} data.paymentType - Payment type (internal family vs external)
 * @property {string} data.message - Success message
 * @property {Object} data.sovereigntyStatus - Individual Wallet Sovereignty status
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} data.sovereigntyStatus.role - User role
 * @property {number} data.sovereigntyStatus.spendingLimit - Spending limit (-1 for unlimited)
 * @property {boolean} data.sovereigntyStatus.requiresApproval - Approval requirement
 * @property {Object} meta - Response metadata
 * @property {string} meta.timestamp - Response timestamp
 * @property {boolean} meta.demo - Demo mode indicator
 */

/**
 * Individual Wallet Sovereignty validation result for Lightning zaps
 * @typedef {Object} LightningZapSovereigntyValidation
 * @property {boolean} authorized - Whether zap is authorized
 * @property {number} spendingLimit - Spending limit (-1 for unlimited)
 * @property {boolean} requiresApproval - Whether approval is required
 * @property {string} message - Validation message
 */
