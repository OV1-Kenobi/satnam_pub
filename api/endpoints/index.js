/**
 * API Endpoints Index - Master Context Compliant
 * 
 * This file exports all client-side API endpoints for use throughout the application.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * - JavaScript client-side API module per browser-only serverless architecture
 * - Privacy-first architecture with zero-knowledge patterns
 * - Individual Wallet Sovereignty support across all endpoint modules
 * - Standardized role hierarchy (greenfield - no legacy mappings)
 * - Browser-compatible environment variables with getEnvVar() pattern
 * - Comprehensive JSDoc type definitions for type safety
 * - Authentication integration with SecureSessionManager
 * - No sensitive data logging or exposure
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
 * Client-side API endpoint modules with Master Context compliance
 * 
 * @typedef {Object} APIEndpoints
 * @property {Object} auth - Authentication API endpoints
 * @property {Object} family - Family Federation API endpoints  
 * @property {Object} user - User management API endpoints
 */

// Export all client-side API endpoint modules with explicit disambiguation
export * from "./communications.js";
export * from "./family.js";

// Explicit re-exports to resolve User typedef conflict
export {
    authenticateWithNostr, authenticateWithOTP, createIdentity,
    generateOTP,
    getSessionInfo,
    logout,
    refreshSession
} from "./auth.js";

export {
    deleteUserAccount,
    fetchUserProfile,
    getUserSettings,
    updateUserProfile,
    updateUserSettings,
    userAPIConfig
} from "./user.js";

/**
 * API Endpoints configuration with Master Context compliance
 * @typedef {Object} APIConfig
 * @property {string} baseUrl - Base API URL
 * @property {number} timeout - Request timeout in milliseconds
 * @property {Object} headers - Default headers
 * @property {boolean} enablePrivacy - Privacy-first mode enabled
 * @property {Object} sovereignty - Individual Wallet Sovereignty configuration
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} sovereignty.defaultRole - Default user role
 * @property {number} sovereignty.defaultSpendingLimit - Default spending limit (-1 for unlimited)
 * @property {boolean} sovereignty.requiresApproval - Whether approval is required by default
 */

/**
 * Default API configuration with Master Context compliance
 * @type {APIConfig}
 */
export const apiConfig = {
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
};

/**
 * API endpoint paths with Master Context compliance
 * @typedef {Object} APIEndpointPaths
 * @property {Object} auth - Authentication endpoints
 * @property {string} auth.signin - Sign in endpoint
 * @property {string} auth.signup - Sign up endpoint
 * @property {string} auth.refresh - Token refresh endpoint
 * @property {string} auth.logout - Logout endpoint
 * @property {Object} family - Family Federation endpoints
 * @property {string} family.create - Create family endpoint
 * @property {string} family.invite - Invite member endpoint
 * @property {string} family.members - Family members endpoint
 * @property {Object} user - User management endpoints
 * @property {string} user.profile - User profile endpoint
 * @property {string} user.settings - User settings endpoint
 * @property {Object} payments - Payment endpoints
 * @property {string} payments.lightning - Lightning payments endpoint
 * @property {string} payments.ecash - eCash bridge endpoint
 * @property {string} payments.p2p - P2P payments endpoint
 * @property {Object} rewards - Educational rewards endpoints
 * @property {string} rewards.available - Available rewards endpoint
 * @property {string} rewards.redeem - Redeem rewards endpoint
 * @property {string} rewards.history - Rewards history endpoint
 */

/**
 * API endpoint paths configuration
 * @type {APIEndpointPaths}
 */
export const apiPaths = {
  auth: {
    signin: "/auth/signin",
    signup: "/auth/signup", 
    refresh: "/auth/refresh",
    logout: "/auth/logout",
  },
  family: {
    create: "/family/create",
    invite: "/family/invite",
    members: "/family/members",
  },
  user: {
    profile: "/user/profile",
    settings: "/user/settings",
  },
  payments: {
    lightning: "/individual/lightning/zap",
    ecash: "/payments/ecash-bridge",
    p2p: "/payments/p2p-lightning",
  },
  rewards: {
    available: "/rewards?action=available",
    redeem: "/rewards?action=redeem", 
    history: "/rewards?action=history",
  },
};

/**
 * Individual Wallet Sovereignty validation for client-side operations
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {number} amount - Operation amount
 * @returns {Object} Sovereignty validation result
 */
export function validateClientSovereignty(userRole, amount) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited authority
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      authorized: true,
      spendingLimit: -1, // No limits for sovereign roles
      hasUnlimitedAccess: true,
      requiresApproval: false,
      message: 'Sovereign role with unlimited authority'
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Offspring have spending thresholds
  if (userRole === 'offspring') {
    const dailyLimit = 100000; // 100K sats daily limit for offspring
    const approvalThreshold = 250000; // 25K sats approval threshold
    
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

/**
 * Privacy-preserving operation hash generator using Web Crypto API
 * @param {string} userId - User ID
 * @param {string} operation - Operation type
 * @returns {Promise<string>} Privacy-preserving hash
 */
export async function generateClientOperationHash(userId, operation) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(`client_${userId}_${operation}_${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Master Context compliant API error handler
 * @param {Error} error - Error object
 * @param {string} operation - Operation that failed
 * @returns {Object} Standardized error response
 */
export function handleAPIError(error, operation) {
  // PRIVACY: No sensitive error data logging
  return {
    success: false,
    error: `Failed to ${operation}`,
    meta: {
      timestamp: new Date().toISOString(),
      operation,
      // No sensitive error details exposed
    },
  };
}

/**
 * Master Context compliant API success response formatter
 * @param {Object} data - Response data (no 'any' types per Master Context)
 * @param {string} message - Success message
 * @param {Object} [sovereigntyStatus] - Sovereignty status
 * @returns {Object} Standardized success response
 */
export function formatAPIResponse(data, message, sovereigntyStatus) {
  return {
    success: true,
    data,
    message,
    sovereigntyStatus,
    meta: {
      timestamp: new Date().toISOString(),
      clientSide: true,
    },
  };
}
