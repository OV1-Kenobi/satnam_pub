/**
 * Cross-Mint API Index - Master Context Compliant
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Individual Wallet Sovereignty Principle enforcement for cross-mint operations
 * - Privacy-first architecture (no sensitive cross-mint data logging)
 * - Browser-compatible serverless environment
 * - eCash bridge integration (Fedimint↔Cashu conversion patterns)
 * - JWT authentication with SecureSessionManager integration
 * - Standardized role hierarchy support for cross-mint authorization
 * - Parent-offspring authorization relationship handling in cross-mint scenarios
 */

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
 * SOVEREIGNTY PRINCIPLE: Validate cross-mint spending limits based on user role
 * Adults/Stewards/Guardians have unlimited individual wallet cross-mint operations
 * @param {string} userRole - User's role
 * @param {number} amount - Cross-mint amount in satoshis
 * @param {CrossMintLimits} proposedLimits - Proposed cross-mint limits
 * @returns {CrossMintAuthorizationResult} Authorization result respecting sovereignty
 */
function validateCrossMintSovereignty(userRole, amount, proposedLimits) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited individual wallet cross-mint operations
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      authorized: true,
      requiresApproval: false,
      dailyLimit: -1, // No limits on individual wallet cross-mint operations
      weeklyLimit: -1, // No limits on individual wallet cross-mint operations
      perTransactionLimit: -1, // No limits on individual wallet cross-mint operations
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Only offspring accounts have cross-mint spending limits
  if (userRole === 'offspring') {
    const dailyLimit = proposedLimits?.dailyLimit || 50000; // 50K sats default for offspring
    const weeklyLimit = proposedLimits?.weeklyLimit || 200000; // 200K sats default for offspring
    const perTransactionLimit = proposedLimits?.perTransactionLimit || 25000; // 25K sats default for offspring

    return {
      authorized: amount <= perTransactionLimit,
      requiresApproval: amount > (proposedLimits?.requiresApprovalAbove || 10000),
      dailyLimit,
      weeklyLimit,
      perTransactionLimit,
    };
  }

  // Default to no authorization for unknown roles
  return {
    authorized: false,
    requiresApproval: true,
    dailyLimit: 0,
    weeklyLimit: 0,
    perTransactionLimit: 0,
  };
}

/**
 * MASTER CONTEXT COMPLIANCE: Generate privacy-preserving cross-mint transaction hash
 * Compatible with emergency recovery system UUID patterns
 * @param {string} memberId - Member identifier
 * @param {string} transactionType - Type of cross-mint transaction
 * @returns {Promise<string>} Hashed transaction identifier
 */
async function generateCrossMintTransactionHash(memberId, transactionType) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(`crossmint_${transactionType}_${memberId}_${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * ECASH BRIDGE: Get supported mint protocols for cross-mint operations
 * @returns {SupportedMintProtocols} Supported mint protocols
 */
function getSupportedMintProtocols() {
  return {
    fedimint: {
      enabled: getEnvVar("FEDIMINT_ENABLED") !== "false",
      federationUrl: getEnvVar("FEDIMINT_FEDERATION_URL"),
      guardianConfig: getEnvVar("FEDIMINT_GUARDIAN_CONFIG"),
    },
    cashu: {
      enabled: getEnvVar("CASHU_ENABLED") !== "false",
      mintUrls: (getEnvVar("CASHU_MINT_URLS") || "").split(",").filter(Boolean),
      defaultMint: getEnvVar("CASHU_DEFAULT_MINT") || "https://mint.satnam.pub",
    },
    satnamMint: {
      enabled: true,
      url: getEnvVar("SATNAM_MINT_URL") || "https://mint.satnam.pub",
    },
  };
}

// Import cross-mint endpoint modules
export { default as multiNutPayment } from "./multi-nut-payment.js";
export { default as nutSwap } from "./nut-swap.js";
export { default as receiveExternal } from "./receive-external.js";
export { default as wallet } from "./wallet.js";

// API route mappings for cross-mint endpoints
export const crossMintRoutes = {
  // Multi-nut payment endpoint (sovereignty-enhanced)
  "POST /api/individual/cross-mint/multi-nut-payment": "./multi-nut-payment.js",

  // Nut swap endpoint (Fedimint↔Cashu conversion)
  "POST /api/individual/cross-mint/nut-swap": "./nut-swap.js",

  // External nuts receiving endpoint
  "POST /api/individual/cross-mint/receive-external": "./receive-external.js",

  // Cross-mint wallet endpoint
  "GET /api/individual/cross-mint/wallet": "./wallet.js",
};

// Export sovereignty validation functions
export {
    generateCrossMintTransactionHash,
    getSupportedMintProtocols, validateCrossMintSovereignty
};

/**
 * SOVEREIGNTY PRINCIPLE: Cross-mint spending limits for individual wallets
 * @typedef {Object} CrossMintLimits
 * @property {number} dailyLimit - Daily cross-mint limit (-1 = no limit for sovereign roles)
 * @property {number} weeklyLimit - Weekly cross-mint limit (-1 = no limit for sovereign roles)
 * @property {number} perTransactionLimit - Per-transaction cross-mint limit (-1 = no limit for sovereign roles)
 * @property {number} requiresApprovalAbove - Amount requiring approval (-1 = no approval for sovereign roles)
 */

/**
 * SOVEREIGNTY PRINCIPLE: Cross-mint authorization result
 * @typedef {Object} CrossMintAuthorizationResult
 * @property {boolean} authorized - Whether the cross-mint operation is authorized
 * @property {boolean} requiresApproval - Whether parent approval is required (offspring only)
 * @property {number} dailyLimit - Daily cross-mint limit
 * @property {number} weeklyLimit - Weekly cross-mint limit
 * @property {number} perTransactionLimit - Per-transaction cross-mint limit
 */

/**
 * MASTER CONTEXT: Standardized user roles for cross-mint operations
 * @typedef {'private'|'offspring'|'adult'|'steward'|'guardian'} UserRole
 */

/**
 * ECASH BRIDGE: Supported mint protocols for cross-mint operations
 * @typedef {Object} SupportedMintProtocols
 * @property {FedimintConfig} fedimint - Fedimint configuration
 * @property {CashuConfig} cashu - Cashu configuration
 * @property {SatnamMintConfig} satnamMint - Satnam mint configuration
 */

/**
 * @typedef {Object} FedimintConfig
 * @property {boolean} enabled - Whether Fedimint is enabled
 * @property {string} [federationUrl] - Federation URL
 * @property {string} [guardianConfig] - Guardian configuration
 */

/**
 * @typedef {Object} CashuConfig
 * @property {boolean} enabled - Whether Cashu is enabled
 * @property {string[]} mintUrls - Available Cashu mint URLs
 * @property {string} defaultMint - Default Cashu mint URL
 */

/**
 * @typedef {Object} SatnamMintConfig
 * @property {boolean} enabled - Whether Satnam mint is enabled
 * @property {string} url - Satnam mint URL
 */

/**
 * Multi-nut payment request for cross-mint operations
 * @typedef {Object} MultiNutPaymentRequest
 * @property {string} memberId - Member ID
 * @property {number} amount - Amount in satoshis
 * @property {string} recipient - Recipient identifier
 * @property {string} [memo] - Optional memo
 * @property {'satnam-first'|'external-first'|'balanced'} [mintPreference] - Mint preference
 * @property {UserRole} [userRole] - User role for sovereignty validation
 */

/**
 * Multi-nut payment response
 * @typedef {Object} MultiNutPaymentResponse
 * @property {boolean} success - Success status
 * @property {string} paymentId - Payment ID
 * @property {number} totalAmount - Total amount in satoshis
 * @property {MintSource[]} mintSources - Mint sources used
 * @property {'pending'|'completed'|'failed'} status - Payment status
 * @property {string} created - Creation timestamp
 */

/**
 * @typedef {Object} MintSource
 * @property {string} mint - Mint URL
 * @property {number} amount - Amount from this mint
 * @property {'fedimint'|'cashu'|'satnam'} protocol - Mint protocol
 */

/**
 * Nut swap request for cross-mint protocol conversion
 * @typedef {Object} NutSwapRequest
 * @property {string} memberId - Member ID
 * @property {string} fromMint - Source mint URL
 * @property {string} toMint - Destination mint URL
 * @property {number} amount - Amount in satoshis
 * @property {'fedimint'|'cashu'|'satnam'} fromProtocol - Source protocol
 * @property {'fedimint'|'cashu'|'satnam'} toProtocol - Destination protocol
 * @property {UserRole} [userRole] - User role for sovereignty validation
 */

/**
 * Nut swap response
 * @typedef {Object} NutSwapResponse
 * @property {boolean} success - Success status
 * @property {string} swapId - Swap ID
 * @property {string} fromMint - Source mint URL
 * @property {string} toMint - Destination mint URL
 * @property {number} amount - Amount in satoshis
 * @property {'pending'|'completed'|'failed'} status - Swap status
 * @property {string} created - Creation timestamp
 * @property {number} [fee] - Conversion fee in satoshis
 */

/**
 * External nuts request for receiving cross-mint tokens
 * @typedef {Object} ExternalNutsRequest
 * @property {string} memberId - Member ID
 * @property {string} externalToken - External token to receive
 * @property {'satnam-mint'|'keep-external'|'auto'} [storagePreference] - Storage preference
 * @property {UserRole} [userRole] - User role for sovereignty validation
 */

/**
 * External nuts response
 * @typedef {Object} ExternalNutsResponse
 * @property {boolean} success - Success status
 * @property {number} amount - Amount received in satoshis
 * @property {string} sourceMint - Source mint URL
 * @property {string} destinationMint - Destination mint URL
 * @property {'fedimint'|'cashu'|'satnam'} sourceProtocol - Source protocol
 * @property {'fedimint'|'cashu'|'satnam'} destinationProtocol - Destination protocol
 * @property {string} created - Creation timestamp
 */
