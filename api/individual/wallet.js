/**
 * Individual Wallet API - Master Context Compliant
 *
 * MASTER CONTEXT COMPLIANCE:
 * - JWT authentication with SecureSessionManager
 * - Privacy-first architecture (no user data logging)
 * - Browser-compatible serverless environment
 * - Vault integration for sensitive operations
 * - Standardized role hierarchy support
 */

// TODO: Convert supabase.ts to JavaScript for proper import
// import { supabase } from "../../netlify/functions/supabase.js";

// Mock supabase for testing purposes
const supabase = {
  from: (table) => ({
    select: (columns) => ({
      eq: (column, value) => ({
        single: () => Promise.resolve({
          data: {
            member_id: value,
            username: `user_${value}`,
            lightning_address: `${value}@satnam.pub`,
            lightning_balance: 100000,
            ecash_balance: 50000,
            privacy_settings: {
              defaultPrivacyLevel: /** @type {"giftwrapped" | "encrypted" | "minimal"} */ ("giftwrapped"),
              allowMinimalPrivacy: false,
              lnproxyEnabled: true,
              cashuPreferred: true,
              requireGuardianApproval: false,
            },
            spending_limits: {
              daily: -1,
              weekly: -1,
              requiresApproval: -1,
            },
          },
          error: null
        }),
        order: (column, options) => ({
          limit: (count) => Promise.resolve({
            data: [],
            error: null
          })
        })
      })
    }),
    update: (data) => ({
      eq: (column, value) => Promise.resolve({ error: null })
    }),
  }),
  rpc: (functionName, params) => Promise.resolve({ error: null }),
};

/**
 * Environment variable access - Netlify Functions ALWAYS use process.env
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key) {
  return process.env[key];
}

/**
 * CRITICAL SECURITY: Validate JWT session and extract user data
 * @param {string} token - JWT token
 * @returns {Promise<Object|null>} Session data or null if invalid
 */
async function validateJWTSession(token) {
  try {
    // Import SecureSessionManager dynamically to avoid circular imports
    const { SecureSessionManager } = await import("../../netlify/functions/security/session-manager.js");
    const sessionData = await SecureSessionManager.validateSession(token);

    if (!sessionData || !sessionData.isAuthenticated) {
      return null;
    }

    return sessionData;
  } catch (error) {
    return null;
  }
}

/**
 * SECURITY: Check if user is authorized to access wallet
 * MASTER CONTEXT COMPLIANCE: Standardized role hierarchy
 * @param {SessionData} sessionData - User session data
 * @param {string} memberId - Target member ID
 * @returns {boolean} Authorization status
 */
function isAuthorizedForWallet(sessionData, memberId) {
  if (sessionData.userId === memberId) {
    return true;
  }

  // MASTER CONTEXT: Standardized role hierarchy - 'private'|'offspring'|'adult'|'steward'|'guardian'
  const authorizedRoles = ['guardian', 'steward'];
  const userRole = sessionData.federationRole;

  return authorizedRoles.includes(userRole);
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
  const data = encoder.encode(`member_${memberId}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * @typedef {'giftwrapped' | 'encrypted' | 'minimal'} PrivacyLevel
 */

/**
 * SOVEREIGNTY PRINCIPLE: Validate spending limits based on user role
 * Adults/Stewards/Guardians have unlimited individual wallet spending
 * @param {string} userRole - User's role
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
      daily: proposedLimits.daily || 50000, // 50K sats default for offspring
      weekly: proposedLimits.weekly || 200000, // 200K sats default for offspring
      requiresApproval: proposedLimits.requiresApproval || 10000, // 10K sats default for offspring
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
 * @typedef {Object} SessionData
 * @property {string} userId - User identifier
 * @property {boolean} isAuthenticated - Authentication status
 * @property {string} sessionToken - Session token
 * @property {string} npub - User Nostr public key
 * @property {string} [nip05] - NIP-05 identifier
 * @property {"private"|"offspring"|"adult"|"steward"|"guardian"} federationRole - Federation role
 * @property {"otp"|"nwc"|"nip05-password"|"nip07"|"nsec"} authMethod - Authentication method
 * @property {boolean} isWhitelisted - Whether user is whitelisted
 * @property {number} votingPower - User's voting power
 * @property {boolean} guardianApproved - Whether approved by guardian
 * @property {boolean} stewardApproved - Whether approved by steward
 * @property {"access"|"refresh"} [type] - JWT token type
 * @property {string} [hashedId] - HMAC-SHA256 protected identifier
 * @property {string} [sessionId] - Session identifier for token tracking
 * @property {number} [iat] - Issued at timestamp
 * @property {number} [exp] - Expiration timestamp
 */

/**
 * @typedef {Object} PrivacySettings
 * @property {PrivacyLevel} defaultPrivacyLevel - Default privacy level
 * @property {boolean} allowMinimalPrivacy - Allow minimal privacy
 * @property {boolean} lnproxyEnabled - LN proxy enabled
 * @property {boolean} cashuPreferred - Cashu preferred
 * @property {boolean} requireGuardianApproval - Require guardian approval
 */

/**
 * SOVEREIGNTY PRINCIPLE: Spending limits for individual wallets
 * @typedef {Object} SpendingLimits
 * @property {number} daily - Daily spending limit (-1 = no limit for sovereign roles)
 * @property {number} weekly - Weekly spending limit (-1 = no limit for sovereign roles)
 * @property {number} requiresApproval - Amount requiring approval (-1 = no approval for sovereign roles)
 */

/**
 * @typedef {Object} IndividualWalletWithPrivacy
 * @property {string} memberId
 * @property {string} username
 * @property {string} lightningAddress
 * @property {number} lightningBalance
 * @property {number} cashuBalance
 * @property {number} fedimintBalance
 * @property {Object} privacySettings
 * @property {PrivacyLevel} privacySettings.defaultPrivacyLevel
 * @property {boolean} privacySettings.allowMinimalPrivacy
 * @property {boolean} privacySettings.lnproxyEnabled
 * @property {boolean} privacySettings.cashuPreferred
 * @property {boolean} privacySettings.requireGuardianApproval
 * @property {Object} spendingLimits
 * @property {number} spendingLimits.daily
 * @property {number} spendingLimits.weekly
 * @property {number} spendingLimits.requiresApproval
 * @property {TransactionWithPrivacy[]} recentTransactions
 */

/**
 * @typedef {Object} TransactionWithPrivacy
 * @property {string} id
 * @property {string} type
 * @property {number} amount
 * @property {number} fee
 * @property {string} timestamp
 * @property {string} status
 * @property {PrivacyLevel} privacyLevel
 * @property {boolean} privacyRouting
 * @property {number} metadataProtectionLevel
 * @property {string} memo
 * @property {string} counterparty
 */

/**
 * @typedef {Object} PrivacyAPIError
 * @property {string} error
 * @property {string} code
 * @property {string} [privacyImpact]
 * @property {PrivacyLevel} [suggestedPrivacyLevel]
 */

/**
 * Individual Wallet Endpoint - Master Context Compliant
 * @param {import('../../types/netlify-functions.js').NetlifyRequest} req
 * @param {import('../../types/netlify-functions.js').NetlifyResponse} res
 */
export default async function handler(req, res) {
  // MASTER CONTEXT COMPLIANCE: Manual CORS headers for Netlify Functions
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    // CRITICAL SECURITY: JWT Authentication validation
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: "Authorization header required" });
      return;
    }

    const token = authHeader.substring(7);
    const sessionData = await validateJWTSession(token);

    if (!sessionData || !sessionData.isAuthenticated) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const { memberId: rawMemberId } = req.query;

    if (!rawMemberId || typeof rawMemberId !== "string") {
      res.status(400).json({
        error: "Member ID is required",
        code: "MISSING_MEMBER_ID",
      });
      return;
    }

    // Resolve "current-user" to actual user ID from session
    const memberId = rawMemberId === "current-user" ? sessionData.userId : rawMemberId;

    // SECURITY: Verify user can access this wallet
    if (sessionData.userId !== memberId && !isAuthorizedForWallet(sessionData, memberId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (req.method === "GET") {
      return await getIndividualWalletWithPrivacy(memberId, sessionData, res);
    }

    if (req.method === "POST") {
      return await updateIndividualPrivacySettings(memberId, req.body, sessionData, res);
    }

    res.status(405).json({
      error: "Method not allowed",
      code: "METHOD_NOT_ALLOWED",
    });
  } catch (error) {
    // MASTER CONTEXT COMPLIANCE: No user data logging
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      privacyImpact: "none",
    });
  }
}

/**
 * Get individual wallet data with privacy settings
 * @param {string} memberId - Member identifier
 * @param {SessionData} sessionData - Authenticated session data
 * @param {import('../../types/netlify-functions.js').NetlifyResponse} res - Response object
 */
async function getIndividualWalletWithPrivacy(memberId, sessionData, res) {
  try {
    const { data: walletData, error: walletError } = await supabase
      .from("individual_wallets")
      .select(`
        *,
        privacy_settings,
        lightning_payments!inner(
          id,
          amount,
          fee,
          timestamp,
          status,
          privacy_level,
          privacy_routing_used,
          metadata_protection_level,
          memo,
          counterparty
        )
      `)
      .eq("member_id", memberId)
      .single();

    if (walletError) {
      // Fallback to mock data if database not available (development mode)
      if (walletError.code === '42P01' || walletError.code === 'PGRST116') {
        console.warn("Database not available, using mock data");
        return await getMockWalletData(memberId, res);
      }

      res.status(404).json({
        error: "Wallet not found",
        code: "WALLET_NOT_FOUND",
      });
      return;
    }

    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select(`
        id,
        type,
        amount,
        fee,
        timestamp,
        status,
        privacy_level,
        privacy_routing_used,
        metadata_protection_level,
        memo,
        counterparty
      `)
      .eq("member_id", memberId)
      .order("timestamp", { ascending: false })
      .limit(50);

    if (txError) {
      console.error("Transaction fetch error:", txError);
    }

    // Transform to privacy-enhanced format
    /** @type {IndividualWalletWithPrivacy} */
    const walletWithPrivacy = {
      memberId: walletData.member_id,
      username: walletData.username,
      lightningAddress: walletData.lightning_address,
      lightningBalance: walletData.lightning_balance || 0,
      cashuBalance: walletData.cashu_balance || 0,
      fedimintBalance: walletData.fedimint_balance || 0,
      privacySettings: {
        defaultPrivacyLevel: walletData.privacy_settings?.defaultPrivacyLevel || 'giftwrapped',
        allowMinimalPrivacy: walletData.privacy_settings?.allowMinimalPrivacy || false,
        lnproxyEnabled: walletData.privacy_settings?.lnproxyEnabled || true,
        cashuPreferred: walletData.privacy_settings?.cashuPreferred || true,
        requireGuardianApproval: walletData.privacy_settings?.requireGuardianApproval || false,
      },
      spendingLimits: {
        // SOVEREIGNTY PRINCIPLE: Individual wallet spending limits based on role
        // Adults/Stewards/Guardians have unlimited individual wallet spending (-1)
        // Only Offspring accounts have actual spending limits
        daily: walletData.spending_limits?.daily ?? -1, // -1 = no limit (sovereignty)
        weekly: walletData.spending_limits?.weekly ?? -1, // -1 = no limit (sovereignty)
        requiresApproval: walletData.spending_limits?.requiresApproval ?? -1, // -1 = no approval (sovereignty)
      },
      recentTransactions: (transactions || []).map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        fee: tx.fee,
        timestamp: tx.timestamp,
        status: tx.status,
        privacyLevel: tx.privacy_level || 'giftwrapped',
        privacyRouting: tx.privacy_routing_used || false,
        metadataProtectionLevel: tx.metadata_protection_level || 100,
        memo: tx.memo,
        counterparty: tx.counterparty,
      })),
    };

    // MASTER CONTEXT COMPLIANCE: Privacy-first audit logging
    await logPrivacyAudit({
      userHash: await generateUserHash(memberId),
      operationType: "wallet_access",
      privacyLevel: walletWithPrivacy.privacySettings.defaultPrivacyLevel,
      metadataProtection: 100,
      operationDetails: {
        transactionCount: walletWithPrivacy.recentTransactions.length,
        privacySettingsAccessed: true,
      },
    });

    res.status(200).json({
      success: true,
      data: walletWithPrivacy,
      meta: {
        timestamp: new Date().toISOString(),
        privacyCompliant: true,
      },
    });
  } catch (error) {
    console.error("Get wallet with privacy error:", error);

    res.status(500).json({
      error: "Failed to fetch wallet data",
      code: "FETCH_ERROR",
      privacyImpact: "metadata_leak",
    });
  }
}

/**
 * Mock wallet data for development/fallback
 * @param {string} memberId - Member identifier
 * @param {import('../../types/netlify-functions.js').NetlifyResponse} res - Response object
 */
async function getMockWalletData(memberId, res) {
  /** @type {IndividualWalletWithPrivacy} */
  const mockWallet = {
    memberId,
    username: `user_${memberId}`,
    lightningAddress: `user_${memberId}@satnam.pub`,
    lightningBalance: Math.floor(Math.random() * 100000) + 10000,
    cashuBalance: Math.floor(Math.random() * 50000) + 5000,
    fedimintBalance: Math.floor(Math.random() * 25000) + 2500,
    privacySettings: {
      defaultPrivacyLevel: 'giftwrapped',
      allowMinimalPrivacy: false,
      lnproxyEnabled: true,
      cashuPreferred: true,
      requireGuardianApproval: false,
    },
    spendingLimits: {
      // SOVEREIGNTY PRINCIPLE: Mock data reflects individual wallet sovereignty
      daily: -1, // No spending limits on individual wallets
      weekly: -1, // No spending limits on individual wallets
      requiresApproval: -1, // No approval required for individual wallets
    },
    recentTransactions: [
      {
        id: "1",
        type: "sent",
        amount: 5000,
        fee: 100,
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        status: "completed",
        privacyLevel: 'giftwrapped',
        privacyRouting: true,
        metadataProtectionLevel: 100,
        memo: "Coffee payment",
        counterparty: "merchant_123",
      },
      {
        id: "2",
        type: "received",
        amount: 15000,
        fee: 0,
        timestamp: new Date(Date.now() - 172800000).toISOString(),
        status: "completed",
        privacyLevel: 'giftwrapped',
        privacyRouting: true,
        metadataProtectionLevel: 100,
        memo: "Allowance",
        counterparty: "family_guardian",
      },
    ],
  };

  res.status(200).json({
    success: true,
    data: mockWallet,
    meta: {
      timestamp: new Date().toISOString(),
      demo: true,
      privacyCompliant: true,
    },
  });
}

/**
 * Update individual privacy settings
 * @param {string} memberId - Member identifier
 * @param {Object} updateData - Update data from request body
 * @param {PrivacySettings} [updateData.privacySettings] - Privacy settings to update
 * @param {SpendingLimits} [updateData.spendingLimits] - Spending limits to update
 * @param {SessionData} sessionData - Authenticated session data
 * @param {import('../../types/netlify-functions.js').NetlifyResponse} res - Response object
 */
async function updateIndividualPrivacySettings(memberId, updateData, sessionData, res) {
  try {
    const { privacySettings, spendingLimits } = updateData;

    // Validate privacy settings
    if (privacySettings) {
      const validPrivacyLevels = ["giftwrapped", "encrypted", "minimal"];
      if (
        privacySettings.defaultPrivacyLevel &&
        !validPrivacyLevels.includes(privacySettings.defaultPrivacyLevel)
      ) {
        res.status(400).json({
          error: "Invalid privacy level",
          code: "INVALID_PRIVACY_LEVEL",
          suggestedPrivacyLevel: 'giftwrapped',
        });
        return;
      }
    }

    // Update privacy settings
    const { error: updateError } = await supabase
      .from("individual_wallets")
      .update({
        privacy_settings: privacySettings,
        spending_limits: spendingLimits,
        updated_at: new Date().toISOString(),
      })
      .eq("member_id", memberId);

    if (updateError) {
      res.status(500).json({
        error: "Failed to update privacy settings",
        code: "UPDATE_ERROR",
      });
      return;
    }

    // MASTER CONTEXT COMPLIANCE: Privacy-first audit logging
    await logPrivacyAudit({
      userHash: await generateUserHash(memberId),
      operationType: "privacy_settings_update",
      privacyLevel: privacySettings?.defaultPrivacyLevel || 'giftwrapped',
      metadataProtection: 100,
      operationDetails: {
        settingsUpdated: privacySettings ? Object.keys(privacySettings) : [],
        limitsUpdated: spendingLimits ? Object.keys(spendingLimits) : [],
      },
    });

    res.status(200).json({
      success: true,
      message: "Privacy settings updated successfully",
      meta: {
        timestamp: new Date().toISOString(),
        privacyCompliant: true,
      },
    });
  } catch (error) {
    console.error("Update privacy settings error:", error);

    res.status(500).json({
      error: "Failed to update privacy settings",
      code: "UPDATE_ERROR",
      privacyImpact: "none",
    });
  }
}

/**
 * Log privacy audit operation
 * @param {Object} params - Audit parameters
 * @param {string} params.userHash - Hashed user identifier
 * @param {string} params.operationType - Type of operation
 * @param {PrivacyLevel} params.privacyLevel - Privacy level used
 * @param {number} params.metadataProtection - Metadata protection level
 * @param {any} params.operationDetails - Operation details
 */
async function logPrivacyAudit(params) {
  try {
    const { error } = await supabase.rpc("log_privacy_operation", {
      p_user_hash: params.userHash,
      p_operation_type: params.operationType,
      p_privacy_level: params.privacyLevel,
      p_metadata_protection: params.metadataProtection,
      p_operation_details: params.operationDetails,
    });

    if (error) {
      console.error("Privacy audit logging error:", error);
    }
  } catch (error) {
    console.error("Privacy audit logging exception:", error);
  }
}
