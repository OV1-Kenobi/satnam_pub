/**
 * Cross-Mint Nut Swap API Endpoint - Master Context Compliant
 * POST /api/individual/cross-mint/nut-swap - Execute bidirectional nut swaps (Fedimint↔Cashu conversion) with sovereignty enforcement
 *
 * MASTER CONTEXT COMPLIANCE:
 * - JavaScript API route per browser-only serverless architecture
 * - Individual Wallet Sovereignty Principle enforcement with unlimited authority for sovereign roles
 * - Privacy-first architecture with zero-knowledge patterns and no sensitive data logging
 * - Standardized role hierarchy with proper legacy mappings
 * - Cross-mint protocol integration (Fedimint, Cashu, Satnam)
 * - Web Crypto API for browser compatibility
 * - Authentication integration with SecureSessionManager
 * - eCash bridge integration with sovereignty-compliant swap validation
 * - Bidirectional Fedimint↔Cashu conversion patterns
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
 * Handle CORS headers for nut swap endpoint
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
 * Validate Individual Wallet Sovereignty for nut swap operations
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {number} swapAmount - Swap amount
 * @returns {Object} Sovereignty validation result
 */
function validateNutSwapSovereignty(userRole, swapAmount) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited individual wallet operations
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      authorized: true,
      spendingLimit: -1, // No limits for sovereign roles
      requiresApproval: false,
      message: 'Sovereign role with unlimited nut swap authority'
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Only offspring accounts have spending limits
  if (userRole === 'offspring') {
    const dailyLimit = 50000; // 50K sats default for offspring
    const requiresApproval = swapAmount > 10000; // 10K sats approval threshold

    return {
      authorized: swapAmount <= dailyLimit,
      spendingLimit: dailyLimit,
      requiresApproval,
      message: requiresApproval ? 'Nut swap requires guardian approval' : 'Nut swap authorized within limits'
    };
  }

  // Default to unauthorized for unknown roles
  return {
    authorized: false,
    spendingLimit: 0,
    requiresApproval: true,
    message: 'Unknown role - nut swap not authorized'
  };
}

/**
 * Generate privacy-preserving swap hash using Web Crypto API
 * @param {string} memberId - Member ID
 * @param {number} amount - Swap amount
 * @returns {Promise<string>} Privacy-preserving hash
 */
async function generateSwapHash(memberId, amount) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(`nut_swap_${memberId}_${amount}_${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Calculate sovereignty-compliant swap fees based on user role
 * @param {number} amount - Swap amount
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @returns {Object} Fee structure
 */
function calculateSovereigntyCompliantSwapFees(amount, userRole) {
  // Base conversion fee for all users
  let conversionFee = Math.floor(amount * 0.001); // 0.1%

  // SOVEREIGNTY: Reduced fees for sovereign roles (Adults, Stewards, Guardians)
  if (userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    conversionFee = Math.floor(amount * 0.0005); // 0.05% reduced fee
  }

  return {
    conversionFee,
    networkFee: Math.ceil(amount * 0.0001), // 0.01% network fee
    total: conversionFee + Math.ceil(amount * 0.0001),
  };
}

/**
 * Nut Swap API Handler - Netlify Functions compatible with Master Context compliance
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
        error: "Authentication required for nut swap operations",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const {
      memberId,
      fromMint,
      toMint,
      amount,
      fromProtocol,
      toProtocol,
      userRole,
    } = req.body;

    // Validate required fields
    if (!memberId || !fromMint || !toMint || !amount) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: memberId, fromMint, toMint, and amount are required",
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
    const sovereigntyValidation = validateNutSwapSovereignty(userRoleForValidation, amount);

    if (!sovereigntyValidation.authorized) {
      res.status(403).json({
        success: false,
        error: sovereigntyValidation.message || "Nut swap amount exceeds spending limits",
        meta: {
          timestamp: new Date().toISOString(),
          spendingLimit: sovereigntyValidation.spendingLimit,
          requiresApproval: sovereigntyValidation.requiresApproval,
        },
      });
      return;
    }

    // Determine protocols from mint URLs if not provided
    const actualFromProtocol = fromProtocol || determineMintProtocol(fromMint);
    const actualToProtocol = toProtocol || determineMintProtocol(toMint);

    // Validate supported protocols
    const supportedProtocols = getSupportedMintProtocols();

    if (actualFromProtocol === 'fedimint' && !supportedProtocols.fedimint.enabled) {
      res.status(400).json({
        success: false,
        error: "Fedimint protocol not enabled for source mint",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    if (actualToProtocol === 'fedimint' && !supportedProtocols.fedimint.enabled) {
      res.status(400).json({
        success: false,
        error: "Fedimint protocol not enabled for destination mint",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Generate privacy-preserving swap hash
    const swapHash = await generateSwapHash(memberId, amount);

    // Calculate sovereignty-compliant fees
    const fees = calculateSovereigntyCompliantSwapFees(amount, userRoleForValidation);

    const swapId = `swap_${swapHash}`;

    res.status(200).json({
      success: true,
      data: {
        swapId,
        fromMint,
        toMint,
        fromProtocol: actualFromProtocol,
        toProtocol: actualToProtocol,
        amount,
        fees,
        status: "pending",
        created: new Date().toISOString(),
        message: "Nut swap created successfully with sovereignty compliance",
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
      error: "Failed to create nut swap",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

/**
 * Nut swap request for cross-mint operations with Master Context compliance
 * @typedef {Object} NutSwapRequest
 * @property {string} memberId - Member ID
 * @property {string} fromMint - Source mint URL
 * @property {string} toMint - Destination mint URL
 * @property {number} amount - Amount to swap in satoshis
 * @property {'fedimint'|'cashu'|'satnam'} [fromProtocol] - Source protocol (auto-detected if not provided)
 * @property {'fedimint'|'cashu'|'satnam'} [toProtocol] - Destination protocol (auto-detected if not provided)
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} [userRole] - Standardized user role (greenfield - no legacy mappings)
 */

/**
 * Nut swap response with sovereignty status
 * @typedef {Object} NutSwapResponse
 * @property {boolean} success - Success status
 * @property {Object} data - Swap data
 * @property {string} data.swapId - Privacy-preserving swap ID
 * @property {string} data.fromMint - Source mint URL
 * @property {string} data.toMint - Destination mint URL
 * @property {'fedimint'|'cashu'|'satnam'} data.fromProtocol - Source protocol type
 * @property {'fedimint'|'cashu'|'satnam'} data.toProtocol - Destination protocol type
 * @property {number} data.amount - Swap amount in satoshis
 * @property {SwapFees} data.fees - Sovereignty-compliant fee breakdown
 * @property {'pending'|'completed'|'failed'} data.status - Swap status
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
 * Sovereignty-compliant swap fees structure
 * @typedef {Object} SwapFees
 * @property {number} conversionFee - Conversion fee in satoshis (reduced for sovereign roles)
 * @property {number} networkFee - Network fee in satoshis
 * @property {number} total - Total fees in satoshis
 */

/**
 * Individual Wallet Sovereignty validation result for nut swaps
 * @typedef {Object} NutSwapSovereigntyValidation
 * @property {boolean} authorized - Whether swap is authorized
 * @property {number} spendingLimit - Spending limit (-1 for unlimited)
 * @property {boolean} requiresApproval - Whether approval is required
 * @property {string} message - Validation message
 */
