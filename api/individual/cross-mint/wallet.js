/**
 * Cross-Mint Wallet API Endpoint - Master Context Compliant
 * GET /api/individual/cross-mint/wallet - Retrieve cross-mint wallet information with sovereignty enforcement
 *
 * MASTER CONTEXT COMPLIANCE:
 * - JavaScript API route per browser-only serverless architecture
 * - Individual Wallet Sovereignty Principle enforcement with unlimited authority for sovereign roles
 * - Privacy-first architecture with zero-knowledge patterns and no sensitive data logging
 * - Standardized role hierarchy (greenfield - no legacy mappings)
 * - Cross-mint protocol integration (Fedimint, Cashu, Satnam)
 * - Web Crypto API for browser compatibility
 * - Authentication integration with SecureSessionManager
 * - eCash bridge integration with sovereignty-compliant wallet access
 * - Cross-mint wallet operations with protocol balance information
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
 * Handle CORS headers for wallet endpoint
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
    "GET, OPTIONS"
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
 * Validate Individual Wallet Sovereignty for wallet access operations
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @returns {Object} Sovereignty validation result
 */
function validateWalletAccessSovereignty(userRole) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited wallet access
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      hasUnlimitedAccess: true,
      accessLevel: 'full',
      message: 'Sovereign role with unlimited wallet access authority'
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Offspring have limited wallet access
  if (userRole === 'offspring') {
    return {
      hasUnlimitedAccess: false,
      accessLevel: 'limited',
      message: 'Offspring role with limited wallet access'
    };
  }

  // Default to limited access for unknown roles
  return {
    hasUnlimitedAccess: false,
    accessLevel: 'basic',
    message: 'Unknown role - basic wallet access only'
  };
}

/**
 * Generate privacy-preserving wallet hash using Web Crypto API
 * @param {string} memberId - Member ID
 * @returns {Promise<string>} Privacy-preserving hash
 */
async function generateWalletHash(memberId) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(`wallet_${memberId}_${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Generate sovereignty-compliant wallet data based on user role
 * @param {string} memberId - Member ID
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {Object} supportedProtocols - Supported protocols
 * @param {Object} sovereigntyValidation - Sovereignty validation result
 * @returns {Promise<Object>} Wallet data
 */
async function generateSovereigntyCompliantWalletData(memberId, userRole, supportedProtocols, sovereigntyValidation) {
  // Mock balances based on role and access level
  const baseBalances = {
    fedimint: sovereigntyValidation.hasUnlimitedAccess ? 150000 : 50000, // 150K/50K sats
    cashu: sovereigntyValidation.hasUnlimitedAccess ? 75000 : 25000, // 75K/25K sats
    satnam: sovereigntyValidation.hasUnlimitedAccess ? 250000 : 100000, // 250K/100K sats
  };

  // Sovereignty-compliant limits
  const crossMintLimits = userRole === 'offspring' ? {
    daily: 50000, // 50K sats for offspring
    weekly: 200000, // 200K sats for offspring
    perTransaction: 10000, // 10K sats for offspring
  } : {
    daily: -1, // Unlimited for sovereign roles
    weekly: -1, // Unlimited for sovereign roles
    perTransaction: -1, // Unlimited for sovereign roles
  };

  // Recent transactions (filtered by access level)
  const allTransactions = [
    {
      id: "tx_001",
      type: "swap",
      fromProtocol: "cashu",
      toProtocol: "fedimint",
      amount: sovereigntyValidation.hasUnlimitedAccess ? 10000 : 5000,
      status: "completed",
      timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    },
    {
      id: "tx_002",
      type: "payment",
      protocol: "satnam",
      amount: sovereigntyValidation.hasUnlimitedAccess ? 5000 : 2500,
      status: "completed",
      timestamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    },
  ];

  const recentTransactions = sovereigntyValidation.accessLevel === 'full'
    ? allTransactions
    : allTransactions.slice(0, 1); // Limited access shows fewer transactions

  return {
    supportedProtocols: {
      fedimint: {
        enabled: supportedProtocols.fedimint.enabled,
        balance: supportedProtocols.fedimint.enabled ? baseBalances.fedimint : 0,
        protocol: /** @type {'fedimint'} */ ('fedimint'),
      },
      cashu: {
        enabled: supportedProtocols.cashu.enabled,
        balance: supportedProtocols.cashu.enabled ? baseBalances.cashu : 0,
        availableMints: supportedProtocols.cashu.mintUrls || [],
        protocol: /** @type {'cashu'} */ ('cashu'),
      },
      satnamMint: {
        enabled: supportedProtocols.satnamMint.enabled,
        balance: baseBalances.satnam,
        url: supportedProtocols.satnamMint.url,
        protocol: /** @type {'satnam'} */ ('satnam'),
      },
    },
    crossMintLimits,
    recentTransactions,
  };
}

/**
 * Cross-Mint Wallet API Handler - Netlify Functions compatible with Master Context compliance
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

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
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
        error: "Authentication required for wallet operations",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const { memberId, userRole } = req.query;

    // Validate required fields
    if (!memberId) {
      res.status(400).json({
        success: false,
        error: "Missing required parameter: memberId",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
    const userRoleForValidation = userRole || sessionValidation.federationRole || 'private';
    const sovereigntyValidation = validateWalletAccessSovereignty(userRoleForValidation);

    // Get supported protocols for cross-mint operations
    const supportedProtocols = getSupportedMintProtocols();

    // Generate privacy-preserving wallet hash
    const walletHash = await generateWalletHash(memberId);

    // Mock cross-mint wallet data with sovereignty-compliant access
    const walletData = await generateSovereigntyCompliantWalletData(
      memberId,
      userRoleForValidation,
      supportedProtocols,
      sovereigntyValidation
    );

    res.status(200).json({
      success: true,
      data: {
        walletId: `wallet_${walletHash}`,
        memberId,
        supportedProtocols: walletData.supportedProtocols,
        crossMintLimits: walletData.crossMintLimits,
        recentTransactions: walletData.recentTransactions,
        message: "Cross-mint wallet data retrieved successfully with sovereignty compliance",
        sovereigntyStatus: {
          role: userRoleForValidation,
          hasUnlimitedAccess: sovereigntyValidation.hasUnlimitedAccess,
          walletAccessLevel: sovereigntyValidation.accessLevel,
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
      error: "Failed to retrieve cross-mint wallet data",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

/**
 * Cross-mint wallet request with Master Context compliance
 * @typedef {Object} CrossMintWalletRequest
 * @property {string} memberId - Member ID
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} [userRole] - Standardized user role (greenfield - no legacy mappings)
 */

/**
 * Cross-mint wallet response with sovereignty status
 * @typedef {Object} CrossMintWalletResponse
 * @property {boolean} success - Success status
 * @property {Object} data - Wallet data
 * @property {string} data.walletId - Privacy-preserving wallet ID
 * @property {string} data.memberId - Member ID
 * @property {Object} data.supportedProtocols - Supported protocol information
 * @property {ProtocolInfo} data.supportedProtocols.fedimint - Fedimint protocol info
 * @property {ProtocolInfo} data.supportedProtocols.cashu - Cashu protocol info
 * @property {ProtocolInfo} data.supportedProtocols.satnamMint - Satnam protocol info
 * @property {CrossMintLimits} data.crossMintLimits - Cross-mint spending limits
 * @property {WalletTransaction[]} data.recentTransactions - Recent transactions (filtered by access level)
 * @property {string} data.message - Success message
 * @property {Object} data.sovereigntyStatus - Individual Wallet Sovereignty status
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} data.sovereigntyStatus.role - User role
 * @property {boolean} data.sovereigntyStatus.hasUnlimitedAccess - Whether user has unlimited wallet access
 * @property {'full'|'limited'|'basic'} data.sovereigntyStatus.walletAccessLevel - Wallet access level
 * @property {Object} meta - Response metadata
 * @property {string} meta.timestamp - Response timestamp
 * @property {boolean} meta.demo - Demo mode indicator
 */

/**
 * Protocol information with sovereignty-compliant balances
 * @typedef {Object} ProtocolInfo
 * @property {boolean} enabled - Whether protocol is enabled
 * @property {number} balance - Protocol balance in satoshis (filtered by access level)
 * @property {'fedimint'|'cashu'|'satnam'} protocol - Protocol type
 * @property {string[]} [availableMints] - Available mint URLs (Cashu only)
 * @property {string} [url] - Mint URL (Satnam only)
 */

/**
 * Cross-mint spending limits with sovereignty compliance
 * @typedef {Object} CrossMintLimits
 * @property {number} daily - Daily spending limit (-1 for unlimited)
 * @property {number} weekly - Weekly spending limit (-1 for unlimited)
 * @property {number} perTransaction - Per-transaction limit (-1 for unlimited)
 */

/**
 * Wallet transaction with privacy-first filtering
 * @typedef {Object} WalletTransaction
 * @property {string} id - Transaction ID
 * @property {'swap'|'payment'|'receive'} type - Transaction type
 * @property {'fedimint'|'cashu'|'satnam'} [protocol] - Protocol (for single-protocol transactions)
 * @property {'fedimint'|'cashu'|'satnam'} [fromProtocol] - Source protocol (for swaps)
 * @property {'fedimint'|'cashu'|'satnam'} [toProtocol] - Destination protocol (for swaps)
 * @property {number} amount - Transaction amount in satoshis (filtered by access level)
 * @property {'pending'|'completed'|'failed'} status - Transaction status
 * @property {string} timestamp - Transaction timestamp
 */

/**
 * Individual Wallet Sovereignty validation result for wallet access
 * @typedef {Object} WalletAccessSovereigntyValidation
 * @property {boolean} hasUnlimitedAccess - Whether user has unlimited wallet access
 * @property {'full'|'limited'|'basic'} accessLevel - Wallet access level
 * @property {string} message - Validation message
 */
