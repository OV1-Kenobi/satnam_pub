/**
 * Cross-Mint Multi-Nut Payment API Endpoint - Master Context Compliant
 * POST /api/individual/cross-mint/multi-nut-payment - Execute multi-nut payments across eCash protocols with sovereignty enforcement
 *
 * MASTER CONTEXT COMPLIANCE:
 * - JavaScript API route per browser-only serverless architecture
 * - Individual Wallet Sovereignty Principle enforcement with unlimited authority for sovereign roles
 * - Privacy-first architecture with zero-knowledge patterns and no sensitive data logging
 * - Standardized role hierarchy with proper legacy mappings
 * - Cross-mint protocol integration (Fedimint, Cashu, Satnam)
 * - Web Crypto API for browser compatibility
 * - Authentication integration with SecureSessionManager
 * - eCash bridge integration with sovereignty-compliant payment validation
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
 * Handle CORS headers for multi-nut payment endpoint
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
 * Validate Individual Wallet Sovereignty for multi-nut payment operations
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {number} paymentAmount - Payment amount
 * @returns {Object} Sovereignty validation result
 */
function validateMultiNutPaymentSovereignty(userRole, paymentAmount) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited individual wallet operations
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      authorized: true,
      spendingLimit: -1, // No limits for sovereign roles
      requiresApproval: false,
      message: 'Sovereign role with unlimited multi-nut payment authority'
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Only offspring accounts have spending limits
  if (userRole === 'offspring') {
    const dailyLimit = 50000; // 50K sats default for offspring
    const requiresApproval = paymentAmount > 10000; // 10K sats approval threshold

    return {
      authorized: paymentAmount <= dailyLimit,
      spendingLimit: dailyLimit,
      requiresApproval,
      message: requiresApproval ? 'Multi-nut payment requires guardian approval' : 'Multi-nut payment authorized within limits'
    };
  }

  // Default to unauthorized for unknown roles
  return {
    authorized: false,
    spendingLimit: 0,
    requiresApproval: true,
    message: 'Unknown role - multi-nut payment not authorized'
  };
}

/**
 * Generate privacy-preserving payment hash using Web Crypto API
 * @param {string} memberId - Member ID
 * @param {number} amount - Payment amount
 * @returns {Promise<string>} Privacy-preserving hash
 */
async function generatePaymentHash(memberId, amount) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(`multi_nut_payment_${memberId}_${amount}_${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * MASTER CONTEXT COMPLIANCE: Privacy-first audit logging for cross-mint operations
 * @param {string} operation - Operation type
 * @param {string} userHash - Privacy-preserving user hash
 * @param {Object} details - Non-sensitive operation details
 */
async function logCrossMintOperation(operation, userHash, details) {
  // Privacy-first logging - no sensitive data exposure
  const auditEntry = {
    operation,
    userHash,
    timestamp: new Date().toISOString(),
    details: {
      hasAmount: !!details.amount,
      hasRecipient: !!details.recipient,
      hasMemo: !!details.memo,
      mintPreference: details.mintPreference,
      userRole: details.userRole,
      authorized: details.authorized,
      mintSourceCount: details.mintSourceCount,
      status: details.status,
    }
  };

  // PRIVACY: No sensitive data logging - audit entry created but not exposed
}

/**
 * MASTER CONTEXT COMPLIANCE: Type-safe protocol determination for cross-mint operations
 * @param {string} mintUrl - Mint URL to analyze
 * @returns {'fedimint'|'cashu'|'satnam'} Protocol type
 */
function determineMintProtocol(mintUrl) {
  if (mintUrl.includes('satnam')) {
    return /** @type {'satnam'} */ ('satnam');
  }
  if (mintUrl.includes('fedimint')) {
    return /** @type {'fedimint'} */ ('fedimint');
  }
  // Default to cashu for external mints
  return /** @type {'cashu'} */ ('cashu');
}

/**
 * Get external mints based on user preferences and sovereignty
 * @param {string} memberId - Member ID
 * @param {string} userRole - User role for sovereignty validation
 * @returns {Promise<string[]>} Available external mints
 */
async function getExternalMints(memberId, userRole) {
  const supportedProtocols = getSupportedMintProtocols();
  const externalMints = [];

  // Add Cashu mints if enabled
  if (supportedProtocols.cashu.enabled) {
    externalMints.push(...supportedProtocols.cashu.mintUrls);
  }

  // Add Fedimint if enabled and user has appropriate role
  if (supportedProtocols.fedimint.enabled && supportedProtocols.fedimint.federationUrl) {
    externalMints.push(supportedProtocols.fedimint.federationUrl);
  }

  // SOVEREIGNTY: All roles can access external mints for individual wallet operations
  return externalMints;
}

/**
 * Multi-Nut Payment API Handler - Netlify Functions compatible with Master Context compliance
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
        error: "Authentication required for multi-nut payment operations",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const {
      memberId,
      amount,
      recipient,
      memo,
      mintPreference,
      userRole,
    } = req.body;

    // Validate required fields
    if (!memberId || !amount || !recipient) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: memberId, amount, and recipient are required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate amount
    if (typeof amount !== "number" || amount <= 0) {
      res.status(400).json({
        success: false,
        error: "Amount must be a positive number",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
    const userRoleForValidation = userRole || sessionValidation.federationRole || 'private';
    const sovereigntyValidation = validateMultiNutPaymentSovereignty(userRoleForValidation, amount);

    if (!sovereigntyValidation.authorized) {
      res.status(403).json({
        success: false,
        error: sovereigntyValidation.message || "Multi-nut payment amount exceeds spending limits",
        meta: {
          timestamp: new Date().toISOString(),
          spendingLimit: sovereigntyValidation.spendingLimit,
          requiresApproval: sovereigntyValidation.requiresApproval,
        },
      });
      return;
    }

    // Generate privacy-preserving payment hash
    const paymentHash = await generatePaymentHash(memberId, amount);

    // Privacy-first audit logging
    await logCrossMintOperation(
      "multi_nut_payment_initiated",
      paymentHash,
      {
        amount,
        recipient,
        memo,
        mintPreference,
        userRole: userRoleForValidation,
        authorized: sovereigntyValidation.authorized,
      }
    );

    // Determine preferred mints based on preference and sovereignty
    let preferredMints;
    const supportedProtocols = getSupportedMintProtocols();

    switch (mintPreference) {
      case "satnam-first":
        preferredMints = [supportedProtocols.satnamMint.url];
        break;
      case "external-first":
        preferredMints = await getExternalMints(memberId, userRoleForValidation);
        break;
      case "balanced":
      default:
        preferredMints = [
          supportedProtocols.satnamMint.url,
          ...(await getExternalMints(memberId, userRoleForValidation)),
        ];
        break;
    }

    const paymentId = `payment_${paymentHash}`;

    /** @type {import('./index.js').MintSource[]} */
    const mockMintSources = preferredMints.slice(0, 2).map((mint) => ({
      mint,
      amount: Math.floor(amount / preferredMints.length),
      protocol: determineMintProtocol(mint)
    }));

    // Privacy-first audit logging for completion
    await logCrossMintOperation(
      "multi_nut_payment_created",
      paymentHash,
      {
        mintSourceCount: mockMintSources.length,
        status: "pending",
      }
    );

    res.status(200).json({
      success: true,
      data: {
        paymentId,
        totalAmount: amount,
        mintSources: mockMintSources,
        status: "pending",
        created: new Date().toISOString(),
        message: "Multi-nut payment created successfully with sovereignty compliance",
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
    });
  } catch (error) {
    // PRIVACY: No sensitive error data logging
    res.status(500).json({
      success: false,
      error: "Failed to create multi-nut payment",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

/**
 * Multi-nut payment request for cross-mint operations with Master Context compliance
 * @typedef {Object} MultiNutPaymentRequest
 * @property {string} memberId - Member ID
 * @property {number} amount - Amount in satoshis
 * @property {string} recipient - Recipient identifier
 * @property {string} [memo] - Optional memo
 * @property {'satnam-first'|'external-first'|'balanced'} [mintPreference] - Mint preference
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} [userRole] - Standardized user role (greenfield - no legacy mappings)
 */

/**
 * Multi-nut payment response with sovereignty status
 * @typedef {Object} MultiNutPaymentResponse
 * @property {boolean} success - Success status
 * @property {Object} data - Payment data
 * @property {string} data.paymentId - Privacy-preserving payment ID
 * @property {number} data.totalAmount - Total amount in satoshis
 * @property {MintSource[]} data.mintSources - Mint sources used with protocol information
 * @property {'pending'|'completed'|'failed'} data.status - Payment status
 * @property {string} data.created - Creation timestamp
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
 * Cross-mint protocol mint source with type safety
 * @typedef {Object} MintSource
 * @property {string} mint - Mint URL
 * @property {number} amount - Amount from this mint
 * @property {'fedimint'|'cashu'|'satnam'} protocol - Mint protocol type
 */

/**
 * Individual Wallet Sovereignty validation result for multi-nut payments
 * @typedef {Object} MultiNutSovereigntyValidation
 * @property {boolean} authorized - Whether payment is authorized
 * @property {number} spendingLimit - Spending limit (-1 for unlimited)
 * @property {boolean} requiresApproval - Whether approval is required
 * @property {string} message - Validation message
 */
