/**
 * Individual API Endpoints Index - Master Context Compliant
 *
 * This file provides a comprehensive index for all individual wallet API endpoints
 * with complete Master Context compliance and Individual Wallet Sovereignty enforcement.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Individual Wallet Sovereignty Principle enforcement (unlimited authority for Adults/Stewards/Guardians)
 * - Privacy-first architecture with zero-knowledge patterns (no sensitive data logging)
 * - Browser-compatible serverless environment with Web Crypto API usage
 * - JWT authentication with SecureSessionManager integration patterns
 * - Standardized role hierarchy ('private'|'offspring'|'adult'|'steward'|'guardian')
 * - Parent-offspring authorization relationship handling with appropriate limits
 * - Comprehensive JSDoc type definitions for complete type safety
 * - No 'any' types per Master Context directives
 * - Privacy-preserving user operations with operation hashing
 */

/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key) {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = /** @type {Object} */ (import.meta);
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * SOVEREIGNTY PRINCIPLE: Validate spending limits based on user role
 * Adults/Stewards/Guardians have unlimited individual wallet spending
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User's role (Master Context standardized)
 * @param {SpendingLimits} proposedLimits - Proposed spending limits
 * @returns {SpendingLimits} Validated spending limits respecting sovereignty
 */
function validateSpendingLimitsBySovereignty(userRole, proposedLimits) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited individual wallet spending
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      daily: -1, // No limits on individual wallet
      weekly: -1, // No limits on individual wallet
      requiresApproval: -1, // No approval required for individual wallet
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Only offspring accounts can have spending limits
  if (userRole === 'offspring') {
    return {
      daily: proposedLimits?.daily || 50000, // 50K sats default for offspring
      weekly: proposedLimits?.weekly || 200000, // 200K sats default for offspring
      requiresApproval: proposedLimits?.requiresApproval || 10000, // 10K sats default for offspring
    };
  }

  // Default to sovereignty (no limits)
  return {
    daily: -1,
    weekly: -1,
    requiresApproval: -1,
  };
}

/**
 * MASTER CONTEXT COMPLIANCE: Generate privacy-preserving user hash
 * Compatible with emergency recovery system UUID patterns
 * @param {string} memberId - Member identifier
 * @returns {Promise<string>} Hashed user identifier
 */
async function generateUserHash(memberId) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(`individual_${memberId}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * MASTER CONTEXT COMPLIANCE: Generate privacy-preserving operation hash
 * @param {string} userId - User ID
 * @param {string} operation - Operation type
 * @returns {Promise<string>} Privacy-preserving hash
 */
async function generateOperationHash(userId, operation) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(`individual_${userId}_${operation}_${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
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
 * Individual Wallet Sovereignty validation for wallet operations
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {number} amount - Operation amount
 * @param {string} operation - Operation type
 * @returns {Object} Sovereignty validation result
 */
function validateIndividualWalletSovereignty(userRole, amount, operation) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited authority
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      authorized: true,
      spendingLimit: -1, // No limits for sovereign roles
      hasUnlimitedAccess: true,
      requiresApproval: false,
      message: 'Sovereign role with unlimited individual wallet authority'
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Offspring have spending thresholds
  if (userRole === 'offspring') {
    const dailyLimit = 50000; // 50K sats daily limit for offspring
    const approvalThreshold = 10000; // 10K sats approval threshold

    return {
      authorized: amount <= dailyLimit,
      spendingLimit: dailyLimit,
      hasUnlimitedAccess: false,
      requiresApproval: amount > approvalThreshold,
      message: amount > approvalThreshold ? 'Operation requires guardian approval' : 'Operation authorized within limits'
    };
  }

  // Default to unauthorized for unknown roles
  return {
    authorized: false,
    spendingLimit: 0,
    hasUnlimitedAccess: false,
    requiresApproval: true,
    message: 'Unknown role - operation not authorized'
  };
}

// Import individual endpoint modules
export { default as cashuBearer } from "./cashu/bearer.js";
export { default as cashuWallet } from "./cashu/wallet.js";
export { default as lightningWallet } from "./lightning/wallet.js";
export { default as lightningZap } from "./lightning/zap.js";
export { default as wallet } from "./wallet.js";

// API route mappings for individual endpoints
export const individualRoutes = {
  // Main wallet endpoint (unified privacy-enhanced)
  "GET /api/individual/wallet": "./wallet.js",
  "POST /api/individual/wallet": "./wallet.js",

  // Lightning endpoints
  "GET /api/individual/lightning/wallet": "./lightning/wallet.js",
  "POST /api/individual/lightning/zap": "./lightning/zap.js",

  // Cashu endpoints
  "POST /api/individual/cashu/bearer": "./cashu/bearer.js",
  "GET /api/individual/cashu/wallet": "./cashu/wallet.js",
};

/**
 * Individual Wallet API configuration with Master Context compliance
 * @typedef {Object} IndividualAPIConfig
 * @property {string} baseUrl - Base API URL
 * @property {number} timeout - Request timeout in milliseconds
 * @property {Object} headers - Default headers
 * @property {boolean} enablePrivacy - Privacy-first mode enabled
 * @property {Object} sovereignty - Individual Wallet Sovereignty configuration
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} sovereignty.defaultRole - Default user role
 * @property {number} sovereignty.defaultSpendingLimit - Default spending limit (-1 for unlimited)
 * @property {boolean} sovereignty.requiresApproval - Whether approval is required by default
 * @property {Object} walletTypes - Supported wallet types
 * @property {boolean} walletTypes.lightning - Lightning wallet support
 * @property {boolean} walletTypes.cashu - Cashu wallet support
 * @property {boolean} walletTypes.unified - Unified wallet support
 */

/**
 * Default Individual Wallet API configuration with Master Context compliance
 * @type {IndividualAPIConfig}
 */
export const individualAPIConfig = {
  baseUrl: getEnvVar("VITE_API_BASE_URL") || getEnvVar("API_BASE_URL") || "/.netlify/functions",
  timeout: 30000, // 30 seconds
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  enablePrivacy: true, // Privacy-first architecture
  sovereignty: {
    defaultRole: 'private', // Greenfield role hierarchy
    defaultSpendingLimit: -1, // Unlimited by default (sovereignty principle)
    requiresApproval: false, // No approval required for sovereign roles
  },
  walletTypes: {
    lightning: true, // Lightning wallet support enabled
    cashu: true, // Cashu bearer instrument support enabled
    unified: true, // Unified wallet support enabled
  },
};

/**
 * Master Context compliant error handler for individual wallet operations
 * @param {Error} error - Error object
 * @param {string} operation - Operation that failed
 * @returns {Object} Standardized error response
 */
export function handleIndividualWalletError(error, operation) {
  // PRIVACY: No sensitive error data logging
  return {
    success: false,
    error: `Failed to ${operation}`,
    meta: {
      timestamp: new Date().toISOString(),
      operation,
      walletType: 'individual',
      // No sensitive error details exposed
    },
  };
}

/**
 * Master Context compliant success response formatter for individual wallet operations
 * @param {Object} data - Response data (no 'any' types per Master Context)
 * @param {string} message - Success message
 * @param {Object} [sovereigntyStatus] - Sovereignty status
 * @returns {Object} Standardized success response
 */
export function formatIndividualWalletResponse(data, message, sovereigntyStatus) {
  return {
    success: true,
    data,
    message,
    sovereigntyStatus,
    meta: {
      timestamp: new Date().toISOString(),
      walletType: 'individual',
      privacyCompliant: true,
    },
  };
}

// Export sovereignty validation functions and Master Context utilities
export {
  convertToStandardizedRole,
  generateOperationHash,
  generateUserHash,
  getEnvVar,
  validateIndividualWalletSovereignty,
  validateSpendingLimitsBySovereignty
};

/**
 * SOVEREIGNTY PRINCIPLE: Spending limits for individual wallets
 * @typedef {Object} SpendingLimits
 * @property {number} daily - Daily spending limit (-1 = no limit for sovereign roles)
 * @property {number} weekly - Weekly spending limit (-1 = no limit for sovereign roles)
 * @property {number} requiresApproval - Amount requiring approval (-1 = no approval for sovereign roles)
 */

/**
 * MASTER CONTEXT: Standardized user roles
 * @typedef {'private'|'offspring'|'adult'|'steward'|'guardian'} UserRole
 */

/**
 * SOVEREIGNTY PRINCIPLE: Individual wallet response with sovereignty-compliant spending limits
 * @typedef {Object} IndividualWalletResponse
 * @property {string} memberId - Member identifier
 * @property {string} username - Username
 * @property {string} lightningAddress - Lightning address
 * @property {number} lightningBalance - Lightning balance in satoshis
 * @property {number} ecashBalance - eCash balance in satoshis
 * @property {SpendingLimits} [spendingLimits] - Spending limits (sovereignty-compliant)
 * @property {TransactionData[]} recentTransactions - Recent transactions
 * @property {PrivacySettings} privacySettings - Privacy settings
 */

/**
 * @typedef {Object} TransactionData
 * @property {string} id - Transaction ID
 * @property {'sent'|'received'} type - Transaction type
 * @property {number} amount - Amount in satoshis
 * @property {Date} timestamp - Transaction timestamp
 * @property {string} status - Transaction status
 * @property {string} [memo] - Optional memo
 */

/**
 * @typedef {Object} PrivacySettings
 * @property {'lightning'|'ecash'} defaultRouting - Default routing preference
 * @property {boolean} lnproxyEnabled - LNProxy enabled status
 * @property {boolean} guardianProtected - Guardian protection status (Family Federation only)
 */

/**
 * Lightning wallet response with zap history and transactions
 * @typedef {Object} LightningWalletResponse
 * @property {ZapHistoryItem[]} zapHistory - Zap transaction history
 * @property {LightningTransaction[]} transactions - Lightning transactions
 */

/**
 * @typedef {Object} ZapHistoryItem
 * @property {string} id - Zap ID
 * @property {number} amount - Amount in satoshis
 * @property {string} recipient - Recipient identifier
 * @property {string} [memo] - Optional memo
 * @property {Date} timestamp - Timestamp
 * @property {'pending'|'completed'|'failed'} status - Zap status
 */

/**
 * @typedef {Object} LightningTransaction
 * @property {string} id - Transaction ID
 * @property {'zap'|'payment'|'invoice'} type - Transaction type
 * @property {number} amount - Amount in satoshis
 * @property {number} fee - Fee in satoshis
 * @property {string} [recipient] - Recipient identifier
 * @property {string} [sender] - Sender identifier
 * @property {string} [memo] - Optional memo
 * @property {Date} timestamp - Timestamp
 * @property {'pending'|'completed'|'failed'} status - Transaction status
 * @property {string} paymentHash - Payment hash
 */

/**
 * Cashu wallet response with bearer instruments and transactions
 * @typedef {Object} CashuWalletResponse
 * @property {BearerInstrument[]} bearerInstruments - Bearer instruments
 * @property {CashuTransaction[]} transactions - Cashu transactions
 */

/**
 * @typedef {Object} BearerInstrument
 * @property {string} id - Bearer instrument ID
 * @property {number} amount - Amount in satoshis
 * @property {'qr'|'nfc'|'dm'|'physical'} formFactor - Form factor
 * @property {Date} created - Creation timestamp
 * @property {boolean} redeemed - Redemption status
 * @property {string} token - Bearer token
 */

/**
 * @typedef {Object} CashuTransaction
 * @property {string} id - Transaction ID
 * @property {'mint'|'melt'|'send'|'receive'} type - Transaction type
 * @property {number} amount - Amount in satoshis
 * @property {number} fee - Fee in satoshis
 * @property {string} [recipient] - Recipient identifier
 * @property {string} [sender] - Sender identifier
 * @property {string} [memo] - Optional memo
 * @property {Date} timestamp - Timestamp
 * @property {'pending'|'completed'|'failed'} status - Transaction status
 * @property {string} tokenId - Token ID
 */

/**
 * Lightning zap request
 * @typedef {Object} ZapRequest
 * @property {string} memberId - Member ID
 * @property {number} amount - Amount in satoshis
 * @property {string} recipient - Recipient identifier
 * @property {string} [memo] - Optional memo
 */

/**
 * Lightning zap response
 * @typedef {Object} ZapResponse
 * @property {boolean} success - Success status
 * @property {string} zapId - Zap ID
 * @property {number} amount - Amount in satoshis
 * @property {string} recipient - Recipient identifier
 * @property {string} memo - Memo
 * @property {string} status - Status
 * @property {string} timestamp - Timestamp
 * @property {number} fee - Fee in satoshis
 * @property {string} paymentHash - Payment hash
 */

/**
 * Bearer instrument creation request
 * @typedef {Object} BearerRequest
 * @property {string} memberId - Member ID
 * @property {number} amount - Amount in satoshis
 * @property {'qr'|'nfc'|'dm'|'physical'} formFactor - Form factor
 * @property {string} [recipientNpub] - Recipient npub for DM delivery
 */

/**
 * Bearer instrument creation response
 * @typedef {Object} BearerResponse
 * @property {boolean} success - Success status
 * @property {string} bearerId - Bearer instrument ID
 * @property {number} amount - Amount in satoshis
 * @property {'qr'|'nfc'|'dm'|'physical'} formFactor - Form factor
 * @property {string} token - Bearer token
 * @property {string} created - Creation timestamp
 * @property {boolean} redeemed - Redemption status
 * @property {string} [qrCode] - QR code data
 * @property {Object} [nfcData] - NFC data
 * @property {DMStatus} [dmStatus] - DM delivery status
 */

/**
 * @typedef {Object} DMStatus
 * @property {string} recipientNpub - Recipient npub
 * @property {boolean} sent - Sent status
 * @property {string} messageId - Message ID
 */
