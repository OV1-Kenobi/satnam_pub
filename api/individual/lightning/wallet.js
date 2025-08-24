/**
 * Lightning Wallet API Endpoint - Master Context Compliant
 * GET /api/individual/lightning/wallet - Retrieve Lightning wallet information with sovereignty enforcement
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
 * - Lightning wallet operations with node provider information
 */

// Import SecureSessionManager for proper authentication
import { SecureSessionManager } from "../../../netlify/functions/security/session-manager.js";

/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key) {
  return process.env[key];
}



/**
 * Validate Individual Wallet Sovereignty for Lightning wallet operations
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @returns {Object} Sovereignty validation result
 */
function validateLightningWalletSovereignty(userRole) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited Lightning wallet access
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      hasUnlimitedAccess: true,
      accessLevel: 'full',
      spendingLimit: -1, // No limits for sovereign roles
      message: 'Sovereign role with unlimited Lightning wallet authority'
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Offspring have limited Lightning wallet access
  if (userRole === 'offspring') {
    return {
      hasUnlimitedAccess: false,
      accessLevel: 'limited',
      spendingLimit: 100000, // 100K sats daily limit for offspring
      message: 'Offspring role with limited Lightning wallet access'
    };
  }

  // Default to limited access for unknown roles
  return {
    hasUnlimitedAccess: false,
    accessLevel: 'basic',
    spendingLimit: 10000, // 10K sats for basic access
    message: 'Unknown role - basic Lightning wallet access only'
  };
}

/**
 * Generate privacy-preserving Lightning wallet hash using Web Crypto API
 * @param {string} memberId - Member ID
 * @returns {Promise<string>} Privacy-preserving hash
 */
async function generateLightningWalletHash(memberId) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(`lightning_wallet_${memberId}_${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Get Lightning node provider configuration based on user role and preferences
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @returns {Object} Lightning node configuration
 */
function getLightningNodeConfiguration(userRole) {
  // Lightning Node provider architecture based on Master Context requirements
  const nodeProviders = {
    voltage: {
      type: /** @type {'voltage'} */ ('voltage'),
      name: 'Voltage',
      description: 'Default operations and family-to-family payments',
      enabled: true,
      isDefault: true,
    },
    phoenixd: {
      type: /** @type {'phoenixd'} */ ('phoenixd'),
      name: 'PhoenixD',
      description: 'Internal family payments and eCash swaps',
      enabled: userRole !== 'private', // Available for family members
      isInternal: true,
    },
    breez: {
      type: /** @type {'breez'} */ ('breez'),
      name: 'Breez',
      description: 'Custodial external wallet (temporary before self-custody)',
      enabled: true,
      isCustodial: true,
    },
    nwc: {
      type: /** @type {'nwc'} */ ('nwc'),
      name: 'Nostr Wallet Connect',
      description: "User's established NWC Lightning wallet",
      enabled: userRole === 'adult' || userRole === 'steward' || userRole === 'guardian',
      isUserOwned: true,
    },
    selfHosted: {
      type: /** @type {'self-hosted'} */ ('self-hosted'),
      name: 'Self-Hosted Node',
      description: "User's own Lightning nodes",
      enabled: userRole === 'adult' || userRole === 'steward' || userRole === 'guardian',
      isUserOwned: true,
      isSelfCustody: true,
    },
  };

  return nodeProviders;
}

/**
 * Get Lightning wallet data for a member with sovereignty-compliant filtering
 * @param {string} memberId - Member identifier
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {Object} sovereigntyValidation - Sovereignty validation result
 * @returns {Promise<Object>} Lightning wallet data
 */
async function getLightningWalletData(memberId, userRole, sovereigntyValidation) {
  // Mock Lightning wallet data with sovereignty-compliant filtering - PRIVACY: No sensitive data logging

  // Base balance based on role and access level
  const baseBalance = sovereigntyValidation.hasUnlimitedAccess ? 500000 : 100000; // 500K/100K sats

  const allZapHistory = [
    {
      id: "zap_1",
      amount: sovereigntyValidation.hasUnlimitedAccess ? 1000 : 500,
      recipient: "npub1abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890",
      memo: "Great post! ⚡",
      timestamp: new Date(Date.now() - 3600000), // 1 hour ago
      status: "completed",
      nodeProvider: /** @type {'voltage'} */ ('voltage'),
    },
    {
      id: "zap_2",
      amount: sovereigntyValidation.hasUnlimitedAccess ? 500 : 250,
      recipient: "npub1xyz987wvu654tsr321qpo098nml765kji432hgf109edc876baz543",
      memo: "Thanks for sharing",
      timestamp: new Date(Date.now() - 7200000), // 2 hours ago
      status: "completed",
      nodeProvider: /** @type {'phoenixd'} */ ('phoenixd'),
    },
    {
      id: "zap_3",
      amount: sovereigntyValidation.hasUnlimitedAccess ? 2100 : 1000,
      recipient: "user456@lightning.pub",
      memo: "Zap for the content",
      timestamp: new Date(Date.now() - 86400000), // 1 day ago
      status: "failed",
      nodeProvider: /** @type {'breez'} */ ('breez'),
    },
  ];

  const allLightningTransactions = [
    {
      id: "ln_tx_1",
      type: /** @type {'payment'} */ ('payment'),
      amount: sovereigntyValidation.hasUnlimitedAccess ? 25000 : 10000,
      fee: sovereigntyValidation.hasUnlimitedAccess ? 10 : 5,
      recipient: "merchant@store.com",
      memo: "Online purchase",
      timestamp: new Date(Date.now() - 1800000), // 30 minutes ago
      status: "completed",
      paymentHash: "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
      nodeProvider: /** @type {'voltage'} */ ('voltage'),
      paymentType: /** @type {'external'} */ ('external'),
    },
    {
      id: "ln_tx_2",
      type: /** @type {'invoice'} */ ('invoice'),
      amount: sovereigntyValidation.hasUnlimitedAccess ? 50000 : 20000,
      fee: 0,
      sender: "client@business.com",
      memo: "Service payment",
      timestamp: new Date(Date.now() - 3600000), // 1 hour ago
      status: "completed",
      paymentHash: "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567",
      nodeProvider: /** @type {'phoenixd'} */ ('phoenixd'),
      paymentType: /** @type {'internal'} */ ('internal'),
    },
    {
      id: "ln_tx_3",
      type: /** @type {'zap'} */ ('zap'),
      amount: sovereigntyValidation.hasUnlimitedAccess ? 1000 : 500,
      fee: 1,
      recipient: "npub1abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890",
      memo: "Great content!",
      timestamp: new Date(Date.now() - 7200000), // 2 hours ago
      status: "completed",
      paymentHash: "c3d4e5f6789012345678901234567890abcdef12345678",
      nodeProvider: /** @type {'nwc'} */ ('nwc'),
      paymentType: /** @type {'external'} */ ('external'),
    },
  ];

  // Filter data based on access level
  const zapHistory = sovereigntyValidation.accessLevel === 'full'
    ? allZapHistory
    : allZapHistory.slice(0, sovereigntyValidation.accessLevel === 'limited' ? 2 : 1);

  const transactions = sovereigntyValidation.accessLevel === 'full'
    ? allLightningTransactions
    : allLightningTransactions.slice(0, sovereigntyValidation.accessLevel === 'limited' ? 2 : 1);

  return {
    balance: {
      total: baseBalance,
      available: baseBalance - 1000, // Mock 1K sats reserved
      pending: 1000,
      currency: 'sats',
    },
    zapHistory,
    transactions,
  };
}

/**
 * Lightning Wallet API Handler - Netlify Functions compatible
 * @param {Object} event - Netlify event object
 * @param {Object} context - Netlify context object
 * @returns {Promise<Object>} Netlify response object
 */
export default async function handler(event, context) {
  // Set CORS headers for Netlify Functions
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== "GET") {
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
    // Session validation is handled below with current-user resolution

    const { memberId: rawMemberId, userRole } = event.queryStringParameters || {};

    if (!rawMemberId || typeof rawMemberId !== "string") {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Member ID is required",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    // Get session data for user ID resolution
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const sessionData = await SecureSessionManager.validateSessionFromHeader(authHeader);

    if (!sessionData || !sessionData.isAuthenticated) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Authentication required",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    // Resolve "current-user" to actual user ID from session
    const memberId = rawMemberId === "current-user" ? sessionData.userId : rawMemberId;

    // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
    const userRoleForValidation = userRole || sessionData.federationRole || 'private';
    const sovereigntyValidation = validateLightningWalletSovereignty(userRoleForValidation);

    // Generate privacy-preserving wallet hash
    const walletHash = await generateLightningWalletHash(memberId);

    // Get Lightning node configuration based on user role
    const nodeConfiguration = getLightningNodeConfiguration(userRoleForValidation);

    // Fetch Lightning-specific wallet data with sovereignty filtering
    const lightningData = await getLightningWalletData(memberId, userRoleForValidation, sovereigntyValidation);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          walletId: `lightning_${walletHash}`,
          memberId,
          nodeProviders: nodeConfiguration,
          zapHistory: lightningData.zapHistory,
          transactions: lightningData.transactions,
          balance: lightningData.balance,
          message: "Lightning wallet data retrieved successfully with sovereignty compliance",
          sovereigntyStatus: {
            role: userRoleForValidation,
            hasUnlimitedAccess: sovereigntyValidation.hasUnlimitedAccess,
            accessLevel: sovereigntyValidation.accessLevel,
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
        error: "Failed to retrieve Lightning wallet data",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      }),
    };
  }
}

/**
 * Lightning wallet request with Master Context compliance
 * @typedef {Object} LightningWalletRequest
 * @property {string} memberId - Member ID
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} [userRole] - Standardized user role (greenfield - no legacy mappings)
 */

/**
 * Lightning wallet response with sovereignty status
 * @typedef {Object} LightningWalletResponse
 * @property {boolean} success - Success status
 * @property {Object} data - Lightning wallet data
 * @property {string} data.walletId - Privacy-preserving wallet ID
 * @property {string} data.memberId - Member ID
 * @property {Object} data.nodeProviders - Lightning node provider configuration
 * @property {LightningNodeProvider} data.nodeProviders.voltage - Voltage node provider
 * @property {LightningNodeProvider} data.nodeProviders.phoenixd - PhoenixD node provider
 * @property {LightningNodeProvider} data.nodeProviders.breez - Breez node provider
 * @property {LightningNodeProvider} data.nodeProviders.nwc - NWC node provider
 * @property {LightningNodeProvider} data.nodeProviders.selfHosted - Self-hosted node provider
 * @property {LightningBalance} data.balance - Lightning wallet balance
 * @property {ZapHistoryItem[]} data.zapHistory - Zap transaction history (filtered by access level)
 * @property {LightningTransaction[]} data.transactions - Lightning transaction history (filtered by access level)
 * @property {string} data.message - Success message
 * @property {Object} data.sovereigntyStatus - Individual Wallet Sovereignty status
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} data.sovereigntyStatus.role - User role
 * @property {boolean} data.sovereigntyStatus.hasUnlimitedAccess - Whether user has unlimited Lightning access
 * @property {'full'|'limited'|'basic'} data.sovereigntyStatus.accessLevel - Lightning access level
 * @property {number} data.sovereigntyStatus.spendingLimit - Lightning spending limit (-1 for unlimited)
 * @property {Object} meta - Response metadata
 * @property {string} meta.timestamp - Response timestamp
 * @property {boolean} meta.demo - Demo mode indicator
 */

/**
 * Lightning node provider configuration
 * @typedef {Object} LightningNodeProvider
 * @property {'voltage'|'phoenixd'|'breez'|'nwc'|'self-hosted'} type - Node provider type
 * @property {string} name - Provider name
 * @property {string} description - Provider description
 * @property {boolean} enabled - Whether provider is enabled for user role
 * @property {boolean} [isDefault] - Whether this is the default provider
 * @property {boolean} [isInternal] - Whether this is for internal family payments
 * @property {boolean} [isCustodial] - Whether this is a custodial service
 * @property {boolean} [isUserOwned] - Whether this is user-owned
 * @property {boolean} [isSelfCustody] - Whether this is self-custody
 */

/**
 * Lightning wallet balance with sovereignty-compliant filtering
 * @typedef {Object} LightningBalance
 * @property {number} total - Total balance in satoshis (filtered by access level)
 * @property {number} available - Available balance in satoshis
 * @property {number} pending - Pending balance in satoshis
 * @property {string} currency - Currency unit (sats)
 */

/**
 * Zap transaction with Lightning node provider information
 * @typedef {Object} ZapHistoryItem
 * @property {string} id - Zap ID
 * @property {number} amount - Amount in satoshis (filtered by access level)
 * @property {string} recipient - Recipient identifier
 * @property {string} memo - Zap memo
 * @property {Date} timestamp - Transaction timestamp
 * @property {'completed'|'failed'|'pending'} status - Zap status
 * @property {'voltage'|'phoenixd'|'breez'|'nwc'|'self-hosted'} nodeProvider - Lightning node provider used
 */

/**
 * Lightning transaction with node provider and payment type information
 * @typedef {Object} LightningTransaction
 * @property {string} id - Transaction ID
 * @property {'payment'|'invoice'|'zap'} type - Transaction type
 * @property {number} amount - Amount in satoshis (filtered by access level)
 * @property {number} fee - Fee in satoshis
 * @property {string} [recipient] - Recipient identifier (for payments/zaps)
 * @property {string} [sender] - Sender identifier (for invoices)
 * @property {string} memo - Transaction memo
 * @property {Date} timestamp - Transaction timestamp
 * @property {'completed'|'failed'|'pending'} status - Transaction status
 * @property {string} paymentHash - Lightning payment hash
 * @property {'voltage'|'phoenixd'|'breez'|'nwc'|'self-hosted'} nodeProvider - Lightning node provider used
 * @property {'internal'|'external'} paymentType - Payment type (internal family vs external)
 */

/**
 * Individual Wallet Sovereignty validation result for Lightning wallet access
 * @typedef {Object} LightningWalletSovereigntyValidation
 * @property {boolean} hasUnlimitedAccess - Whether user has unlimited Lightning access
 * @property {'full'|'limited'|'basic'} accessLevel - Lightning access level
 * @property {number} spendingLimit - Lightning spending limit (-1 for unlimited)
 * @property {string} message - Validation message
 */
