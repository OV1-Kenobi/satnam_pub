/**
 * Rewards API Endpoint - Master Context Compliant
 * POST /api/rewards - Educational rewards with sovereignty enforcement
 *
 * MASTER CONTEXT COMPLIANCE:
 * - JavaScript API route per browser-only serverless architecture
 * - Individual Wallet Sovereignty Principle enforcement with unlimited authority for sovereign roles
 * - Privacy-first architecture with zero-knowledge patterns and no sensitive data logging
 * - Standardized role hierarchy (greenfield - no legacy mappings)
 * - Web Crypto API for browser compatibility
 * - Authentication integration with SecureSessionManager
 * - Educational rewards system with role-based authorization
 * - Bitcoin-only reward system for educational achievements
 */

// TODO: Convert session-manager.ts to JavaScript for proper imports
// import { SecureSessionManager } from "../netlify/functions/security/session-manager.js";

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
 * Validate Individual Wallet Sovereignty for rewards operations
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {number} rewardAmount - Reward amount
 * @returns {Object} Sovereignty validation result
 */
function validateRewardsSovereignty(userRole, rewardAmount) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited rewards authority
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      authorized: true,
      spendingLimit: -1, // No limits for sovereign roles
      hasUnlimitedAccess: true,
      requiresApproval: false,
      message: 'Sovereign role with unlimited rewards authority'
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Offspring have rewards spending thresholds
  if (userRole === 'offspring') {
    const dailyLimit = 50000; // 50K sats daily limit for offspring rewards
    const requiresApproval = rewardAmount > 10000; // 10K sats approval threshold
    
    return {
      authorized: rewardAmount <= dailyLimit,
      spendingLimit: dailyLimit,
      hasUnlimitedAccess: false,
      requiresApproval,
      message: requiresApproval ? 'Reward requires guardian approval' : 'Reward authorized within limits'
    };
  }

  // Default to unauthorized for unknown roles
  return {
    authorized: false,
    spendingLimit: 0,
    hasUnlimitedAccess: false,
    requiresApproval: true,
    message: 'Unknown role - reward not authorized'
  };
}

/**
 * Generate privacy-preserving reward hash using Web Crypto API
 * @param {string} studentId - Student ID
 * @param {string} rewardType - Reward type
 * @returns {Promise<string>} Privacy-preserving hash
 */
async function generateRewardHash(studentId, rewardType) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(`reward_${studentId}_${rewardType}_${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Main handler for rewards endpoint - Netlify Functions pattern
 * @param {Object} event - Netlify event object
 * @param {Object} context - Netlify context object
 */
async function handler(event, context) {
  // Set CORS headers for Netlify Functions
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
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
          error: "Authentication required for rewards operations",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    // Route based on HTTP method
    switch (event.httpMethod) {
      case "GET":
        return await handleGetRewards(event, sessionValidation, corsHeaders);
      case "POST":
        return await handlePostRewards(event, sessionValidation, corsHeaders);
      case "PUT":
        return await handlePutRewards(event, sessionValidation, corsHeaders);
      default:
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
  } catch (error) {
    // PRIVACY: No sensitive error data logging
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Failed to process rewards operation",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      }),
    };
  }
}

/**
 * Handle GET requests - Query rewards and redemptions
 * @param {Object} event - Netlify event object
 * @param {Object} sessionValidation - Session validation result
 * @param {Object} corsHeaders - CORS headers
 */
async function handleGetRewards(event, sessionValidation, corsHeaders) {
  const { action } = event.queryStringParameters || {};

  switch (action) {
    case "available":
      return await getAvailableRewards(event, sessionValidation, corsHeaders);
    case "history":
      return await getRedemptionHistory(event, sessionValidation, corsHeaders);
    case "configs":
      return await getRewardConfigs(event, sessionValidation, corsHeaders);
    case "status":
      return await getRedemptionStatus(event, sessionValidation, corsHeaders);
    default:
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Invalid action parameter",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
  }
}

/**
 * Handle POST requests - Redeem rewards
 * @param {Object} event - Netlify event object
 * @param {Object} sessionValidation - Session validation result
 * @param {Object} corsHeaders - CORS headers
 */
async function handlePostRewards(event, sessionValidation, corsHeaders) {
  const { action } = event.queryStringParameters || {};

  switch (action) {
    case "redeem":
      return await redeemReward(event, sessionValidation, corsHeaders);
    case "request-approval":
      return await requestGuardianApproval(event, sessionValidation, corsHeaders);
    default:
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Invalid action parameter",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
  }
}

/**
 * Handle PUT requests - Update reward configurations
 * @param {Object} event - Netlify event object
 * @param {Object} sessionValidation - Session validation result
 * @param {Object} corsHeaders - CORS headers
 */
async function handlePutRewards(event, sessionValidation, corsHeaders) {
  const { action } = event.queryStringParameters || {};

  switch (action) {
    case "update-config":
      return await updateRewardConfig(event, sessionValidation, corsHeaders);
    case "approve":
      return await approveRedemption(event, sessionValidation, corsHeaders);
    default:
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Invalid action parameter",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
  }
}

/**
 * Get available rewards for a student with sovereignty compliance
 * @param {Object} event - Netlify event object
 * @param {Object} sessionValidation - Session validation result
 * @param {Object} corsHeaders - CORS headers
 */
async function getAvailableRewards(event, sessionValidation, corsHeaders) {
  const { studentPubkey, userRole } = event.queryStringParameters || {};

  // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
  const userRoleForValidation = /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (
    userRole || sessionValidation.federationRole || 'private'
  );

  const studentId = studentPubkey || sessionValidation.memberId;

  if (!studentId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Student identifier required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  try {
    // Generate privacy-preserving student hash
    const studentHash = await generateRewardHash(studentId, 'student_query');

    // Mock available rewards with sovereignty compliance
    const mockRewards = [
      {
        id: `reward_${studentHash}_1`,
        name: 'Module Completion',
        description: 'Complete a Bitcoin education module',
        amount: userRoleForValidation === 'offspring' ? 5000 : 10000, // Reduced for offspring
        currency: 'sats',
        requirements: ['Complete module', 'Pass quiz'],
        maxRedemptions: userRoleForValidation === 'offspring' ? 3 : -1, // Limited for offspring
        requiresApproval: userRoleForValidation === 'offspring',
        expiresAfter: 30,
      },
      {
        id: `reward_${studentHash}_2`,
        name: 'Course Achievement',
        description: 'Complete an entire Bitcoin course',
        amount: userRoleForValidation === 'offspring' ? 15000 : 25000, // Reduced for offspring
        currency: 'sats',
        requirements: ['Complete course', 'Final assessment'],
        maxRedemptions: userRoleForValidation === 'offspring' ? 1 : -1, // Limited for offspring
        requiresApproval: userRoleForValidation === 'offspring',
        expiresAfter: 60,
      },
    ];

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          rewards: mockRewards,
          studentId: studentHash,
          message: "Available rewards retrieved successfully with sovereignty compliance",
          sovereigntyStatus: {
            role: userRoleForValidation,
            hasUnlimitedAccess: userRoleForValidation !== 'offspring',
            spendingLimit: userRoleForValidation === 'offspring' ? 50000 : -1,
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
        error: "Failed to retrieve available rewards",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      }),
    };
  }
}

/**
 * Get redemption history with sovereignty compliance
 * @param {Object} event - Netlify event object
 * @param {Object} sessionValidation - Session validation result
 * @param {Object} corsHeaders - CORS headers
 */
async function getRedemptionHistory(event, sessionValidation, corsHeaders) {
  const { studentPubkey, userRole } = event.queryStringParameters || {};

  // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
  const userRoleForValidation = /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (
    userRole || sessionValidation.federationRole || 'private'
  );

  const studentId = studentPubkey || sessionValidation.memberId;

  if (!studentId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Student identifier required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  try {
    // Generate privacy-preserving student hash
    const studentHash = await generateRewardHash(studentId, 'history_query');

    // Mock redemption history with sovereignty-compliant filtering
    const allRedemptions = [
      {
        id: `redemption_${studentHash}_1`,
        rewardType: 'Module Completion',
        amount: userRoleForValidation === 'offspring' ? 5000 : 10000,
        currency: 'sats',
        status: 'completed',
        redemptionProof: `lnbc${userRoleForValidation === 'offspring' ? 5000 : 10000}1p...`,
        createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        processedAt: new Date(Date.now() - 86000000).toISOString(),
      },
      {
        id: `redemption_${studentHash}_2`,
        rewardType: 'Course Achievement',
        amount: userRoleForValidation === 'offspring' ? 15000 : 25000,
        currency: 'sats',
        status: userRoleForValidation === 'offspring' ? 'pending_approval' : 'completed',
        createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        processedAt: userRoleForValidation !== 'offspring' ? new Date(Date.now() - 3000000).toISOString() : undefined,
      },
    ];

    // Filter history based on access level
    const redemptions = userRoleForValidation === 'offspring'
      ? allRedemptions.slice(0, 1) // Limited history for offspring
      : allRedemptions;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          redemptions,
          studentId: studentHash,
          message: "Redemption history retrieved successfully with sovereignty compliance",
          sovereigntyStatus: {
            role: userRoleForValidation,
            hasUnlimitedAccess: userRoleForValidation !== 'offspring',
            accessLevel: userRoleForValidation === 'offspring' ? 'limited' : 'full',
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
        error: "Failed to retrieve redemption history",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      }),
    };
  }
}

/**
 * Redeem a reward with sovereignty compliance
 * @param {Object} event - Netlify event object
 * @param {Object} sessionValidation - Session validation result
 * @param {Object} corsHeaders - CORS headers
 */
async function redeemReward(event, sessionValidation, corsHeaders) {
  const body = JSON.parse(event.body || '{}');
  const { rewardType, amount, userRole } = body;

  // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
  const userRoleForValidation = /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (
    userRole || sessionValidation.federationRole || 'private'
  );

  const studentId = sessionValidation.memberId;

  if (!studentId || !rewardType || !amount) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Student ID, reward type, and amount required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  try {
    // Validate sovereignty for reward redemption
    const sovereigntyValidation = validateRewardsSovereignty(userRoleForValidation, amount);

    if (!sovereigntyValidation.authorized) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: sovereigntyValidation.message || "Reward amount exceeds spending limits",
          meta: {
            timestamp: new Date().toISOString(),
            spendingLimit: sovereigntyValidation.spendingLimit,
            requiresApproval: sovereigntyValidation.requiresApproval,
          },
        }),
      };
    }

    // Generate privacy-preserving redemption hash
    const redemptionHash = await generateRewardHash(studentId, rewardType);

    // Mock reward redemption with sovereignty compliance
    const redemption = {
      id: `redemption_${redemptionHash}`,
      studentId: redemptionHash,
      rewardType,
      amount,
      currency: 'sats',
      status: sovereigntyValidation.requiresApproval ? 'pending_approval' : 'completed',
      redemptionProof: sovereigntyValidation.requiresApproval ? undefined : `lnbc${amount}1p...`,
      createdAt: new Date().toISOString(),
      processedAt: sovereigntyValidation.requiresApproval ? undefined : new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          ...redemption,
          message: sovereigntyValidation.requiresApproval
            ? "Reward redemption created, awaiting guardian approval"
            : "Reward redeemed successfully with sovereignty compliance",
          sovereigntyStatus: {
            role: userRoleForValidation,
            hasUnlimitedAccess: sovereigntyValidation.hasUnlimitedAccess,
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
        error: "Failed to process reward redemption",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      }),
    };
  }
}

/**
 * Get reward configurations with sovereignty compliance
 * @param {Object} event - Netlify event object
 * @param {Object} sessionValidation - Session validation result
 * @param {Object} corsHeaders - CORS headers
 */
async function getRewardConfigs(event, sessionValidation, corsHeaders) {
  const { rewardType, userRole } = event.queryStringParameters || {};

  // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
  const userRoleForValidation = /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (
    userRole || sessionValidation.federationRole || 'private'
  );

  try {
    // Mock reward configurations with sovereignty compliance
    const mockConfigs = [
      {
        id: 'module_completion',
        name: 'Module Completion',
        description: 'Complete a Bitcoin education module',
        amount: userRoleForValidation === 'offspring' ? 5000 : 10000,
        currency: 'sats',
        requiresApproval: userRoleForValidation === 'offspring',
        maxRedemptions: userRoleForValidation === 'offspring' ? 3 : -1,
        expiresAfter: 30,
      },
      {
        id: 'course_achievement',
        name: 'Course Achievement',
        description: 'Complete an entire Bitcoin course',
        amount: userRoleForValidation === 'offspring' ? 15000 : 25000,
        currency: 'sats',
        requiresApproval: userRoleForValidation === 'offspring',
        maxRedemptions: userRoleForValidation === 'offspring' ? 1 : -1,
        expiresAfter: 60,
      },
    ];

    const configs = rewardType
      ? mockConfigs.filter(config => config.id === rewardType)
      : mockConfigs;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          configs,
          message: "Reward configurations retrieved successfully with sovereignty compliance",
          sovereigntyStatus: {
            role: userRoleForValidation,
            hasUnlimitedAccess: userRoleForValidation !== 'offspring',
            configAccess: userRoleForValidation === 'offspring' ? 'limited' : 'full',
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
        error: "Failed to retrieve reward configurations",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      }),
    };
  }
}

/**
 * Get redemption status with sovereignty compliance
 * @param {Object} event - Netlify event object
 * @param {Object} sessionValidation - Session validation result
 * @param {Object} corsHeaders - CORS headers
 */
async function getRedemptionStatus(event, sessionValidation, corsHeaders) {
  const { redemptionId, userRole } = event.queryStringParameters || {};

  // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
  const userRoleForValidation = /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (
    userRole || sessionValidation.federationRole || 'private'
  );

  if (!redemptionId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Redemption ID required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  try {
    // Mock redemption status with sovereignty compliance
    const mockRedemption = {
      id: redemptionId,
      rewardType: 'Module Completion',
      status: userRoleForValidation === 'offspring' ? 'pending_approval' : 'completed',
      amount: userRoleForValidation === 'offspring' ? 5000 : 10000,
      currency: 'sats',
      redemptionProof: userRoleForValidation !== 'offspring' ? `lnbc${userRoleForValidation === 'offspring' ? 5000 : 10000}1p...` : undefined,
      createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      processedAt: userRoleForValidation !== 'offspring' ? new Date(Date.now() - 3000000).toISOString() : undefined,
      expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days from now
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          ...mockRedemption,
          message: "Redemption status retrieved successfully with sovereignty compliance",
          sovereigntyStatus: {
            role: userRoleForValidation,
            hasUnlimitedAccess: userRoleForValidation !== 'offspring',
            statusAccess: userRoleForValidation === 'offspring' ? 'limited' : 'full',
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
        error: "Failed to retrieve redemption status",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      }),
    };
  }
}

/**
 * Request guardian approval for a reward with sovereignty compliance
 * @param {Object} event - Netlify event object
 * @param {Object} sessionValidation - Session validation result
 * @param {Object} corsHeaders - CORS headers
 */
async function requestGuardianApproval(event, sessionValidation, corsHeaders) {
  const body = JSON.parse(event.body || '{}');
  const { rewardType, guardianPubkey, message, userRole } = body;

  // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
  const userRoleForValidation = /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (
    userRole || sessionValidation.federationRole || 'private'
  );

  const studentId = sessionValidation.memberId;

  if (!studentId || !rewardType || !guardianPubkey) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Student ID, reward type, and guardian pubkey required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  try {
    // Generate privacy-preserving approval request hash
    const approvalHash = await generateRewardHash(studentId, `approval_${rewardType}`);

    // Mock guardian approval request with sovereignty compliance
    const approvalRequest = {
      id: `approval_${approvalHash}`,
      studentId: approvalHash,
      guardianPubkey: await generateRewardHash(guardianPubkey, 'guardian'), // Privacy-preserving guardian hash
      rewardType,
      message: message || `Requesting approval for ${rewardType} reward`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          ...approvalRequest,
          message: "Approval request sent to guardian successfully",
          sovereigntyStatus: {
            role: userRoleForValidation,
            hasUnlimitedAccess: userRoleForValidation !== 'offspring',
            approvalRequired: userRoleForValidation === 'offspring',
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
        error: "Failed to send approval request",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      }),
    };
  }
}

/**
 * Update reward configuration with sovereignty compliance (admin/guardian only)
 * @param {Object} event - Netlify event object
 * @param {Object} sessionValidation - Session validation result
 * @param {Object} corsHeaders - CORS headers
 */
async function updateRewardConfig(event, sessionValidation, corsHeaders) {
  const body = JSON.parse(event.body || '{}');
  const { rewardType, updates, userRole } = body;

  // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
  const userRoleForValidation = /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (
    userRole || sessionValidation.federationRole || 'private'
  );

  // Only guardians and stewards can update configurations
  if (userRoleForValidation !== 'guardian' && userRoleForValidation !== 'steward') {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Guardian or steward privileges required for configuration updates",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  if (!rewardType || !updates) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Reward type and updates required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  try {
    // Generate privacy-preserving config update hash
    const configHash = await generateRewardHash(rewardType, 'config_update');

    // Mock configuration update with sovereignty compliance
    const configUpdate = {
      id: `config_${configHash}`,
      rewardType,
      updates,
      updatedBy: await generateRewardHash(sessionValidation.memberId, 'updater'), // Privacy-preserving updater hash
      updatedAt: new Date().toISOString(),
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          ...configUpdate,
          message: "Reward configuration updated successfully",
          sovereigntyStatus: {
            role: userRoleForValidation,
            hasUnlimitedAccess: true,
            configurationAccess: 'full',
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
        error: "Failed to update reward configuration",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      }),
    };
  }
}

/**
 * Approve a redemption with sovereignty compliance (guardian only)
 * @param {Object} event - Netlify event object
 * @param {Object} sessionValidation - Session validation result
 * @param {Object} corsHeaders - CORS headers
 */
async function approveRedemption(event, sessionValidation, corsHeaders) {
  const body = JSON.parse(event.body || '{}');
  const { redemptionId, approval, userRole } = body;

  // Validate role and sovereignty (greenfield code - no legacy role mapping needed)
  const userRoleForValidation = /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (
    userRole || sessionValidation.federationRole || 'private'
  );

  // Only guardians and stewards can approve redemptions
  if (userRoleForValidation !== 'guardian' && userRoleForValidation !== 'steward') {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Guardian or steward privileges required for redemption approval",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  if (!redemptionId || approval === undefined) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Redemption ID and approval status required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  try {
    // Generate privacy-preserving approval hash
    const approvalHash = await generateRewardHash(redemptionId, 'approval');

    // Mock redemption approval with sovereignty compliance
    const redemptionApproval = {
      id: redemptionId,
      status: approval ? 'approved' : 'rejected',
      approvedBy: await generateRewardHash(sessionValidation.memberId, 'approver'), // Privacy-preserving approver hash
      approvedAt: new Date().toISOString(),
      redemptionProof: approval ? `lnbc10000p...` : undefined,
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          ...redemptionApproval,
          message: approval ? "Redemption approved successfully" : "Redemption rejected",
          sovereigntyStatus: {
            role: userRoleForValidation,
            hasUnlimitedAccess: true,
            approvalAuthority: 'full',
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
        error: "Failed to process redemption approval",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      }),
    };
  }
}

/**
 * Rewards request with Master Context compliance
 * @typedef {Object} RewardsRequest
 * @property {string} [action] - Action to perform (available, history, configs, status, redeem, request-approval, update-config, approve)
 * @property {string} [studentPubkey] - Student public key
 * @property {string} [rewardType] - Type of reward
 * @property {number} [amount] - Reward amount in satoshis
 * @property {string} [guardianPubkey] - Guardian public key for approval requests
 * @property {string} [message] - Message for approval requests
 * @property {string} [redemptionId] - Redemption ID for status/approval
 * @property {boolean} [approval] - Approval status for redemption approval
 * @property {Object} [updates] - Configuration updates
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} [userRole] - Standardized user role (greenfield - no legacy mappings)
 */

/**
 * Rewards response with Master Context compliance
 * @typedef {Object} RewardsResponse
 * @property {boolean} success - Success status
 * @property {Object} data - Rewards data
 * @property {string} [data.studentId] - Privacy-preserving student ID
 * @property {Array} [data.rewards] - Available rewards (filtered by access level)
 * @property {Array} [data.redemptions] - Redemption history (filtered by access level)
 * @property {Array} [data.configs] - Reward configurations (filtered by access level)
 * @property {string} [data.id] - Privacy-preserving operation ID
 * @property {string} [data.rewardType] - Reward type
 * @property {number} [data.amount] - Reward amount in satoshis (filtered by role)
 * @property {string} [data.currency] - Currency type (sats, ecash, fedimint)
 * @property {string} [data.status] - Operation status
 * @property {string} [data.redemptionProof] - Redemption proof (Lightning invoice, etc.)
 * @property {string} [data.createdAt] - Creation timestamp
 * @property {string} [data.processedAt] - Processing timestamp
 * @property {string} [data.expiresAt] - Expiration timestamp
 * @property {string} data.message - Success message
 * @property {Object} data.sovereigntyStatus - Individual Wallet Sovereignty status
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} data.sovereigntyStatus.role - User role
 * @property {boolean} data.sovereigntyStatus.hasUnlimitedAccess - Whether user has unlimited access
 * @property {number} [data.sovereigntyStatus.spendingLimit] - Spending limit (-1 for unlimited)
 * @property {boolean} [data.sovereigntyStatus.requiresApproval] - Whether approval is required
 * @property {'full'|'limited'|'basic'} [data.sovereigntyStatus.accessLevel] - Access level
 * @property {Object} meta - Response metadata
 * @property {string} meta.timestamp - Response timestamp
 * @property {boolean} meta.demo - Demo mode indicator
 */

/**
 * Individual Wallet Sovereignty validation result for rewards operations
 * @typedef {Object} RewardsSovereigntyValidation
 * @property {boolean} authorized - Whether reward operation is authorized
 * @property {number} spendingLimit - Spending limit (-1 for unlimited)
 * @property {boolean} hasUnlimitedAccess - Whether user has unlimited access
 * @property {boolean} requiresApproval - Whether approval is required
 * @property {string} message - Validation message
 */

/**
 * Reward type with sovereignty compliance
 * @typedef {Object} RewardType
 * @property {string} id - Privacy-preserving reward ID
 * @property {string} name - Reward name
 * @property {string} description - Reward description
 * @property {number} amount - Amount in satoshis (filtered by role)
 * @property {'sats'|'ecash'|'fedimint'|'course_credits'} currency - Currency type
 * @property {string[]} requirements - Reward requirements
 * @property {number} maxRedemptions - Maximum redemptions (-1 for unlimited, limited for offspring)
 * @property {boolean} requiresApproval - Whether approval is required (true for offspring)
 * @property {number} expiresAfter - Expiration period in days
 */

/**
 * Reward redemption with sovereignty compliance
 * @typedef {Object} RewardRedemption
 * @property {string} id - Privacy-preserving redemption ID
 * @property {string} studentId - Privacy-preserving student ID
 * @property {string} rewardType - Reward type
 * @property {number} amount - Amount in satoshis (filtered by role)
 * @property {'sats'|'ecash'|'fedimint'} currency - Currency type
 * @property {'pending'|'approved'|'rejected'|'processed'|'expired'|'pending_approval'|'completed'} status - Redemption status
 * @property {string} [redemptionProof] - Redemption proof (Lightning invoice, etc.)
 * @property {string} createdAt - Creation timestamp
 * @property {string} [processedAt] - Processing timestamp
 * @property {string} expiresAt - Expiration timestamp
 */

/**
 * Guardian approval request with sovereignty compliance
 * @typedef {Object} GuardianApprovalRequest
 * @property {string} id - Privacy-preserving approval request ID
 * @property {string} studentId - Privacy-preserving student ID
 * @property {string} guardianPubkey - Privacy-preserving guardian pubkey hash
 * @property {string} rewardType - Reward type
 * @property {string} message - Approval request message
 * @property {'pending'|'approved'|'rejected'} status - Approval status
 * @property {string} createdAt - Creation timestamp
 * @property {string} [respondedAt] - Response timestamp
 */

export default handler;
