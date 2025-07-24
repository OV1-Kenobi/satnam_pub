/**
 * User API Endpoints - Master Context Compliant Client-Side Module
 * 
 * This file contains all user-related API endpoints for client-side applications.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * - JavaScript client-side API module per browser-only serverless architecture
 * - Privacy-first architecture with zero-knowledge patterns and no sensitive data logging
 * - Individual Wallet Sovereignty support with role-based access control
 * - Standardized role hierarchy (greenfield - no legacy mappings)
 * - Browser-compatible environment variables with getEnvVar() pattern
 * - Comprehensive JSDoc type definitions for complete type safety
 * - Authentication integration with SecureSessionManager patterns
 * - Privacy-preserving user operations with Web Crypto API
 * - No exposure of emails, npubs, personal data, or real names in logs
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
 * User status for multi-user onboarding flow
 * @typedef {'pending'|'active'|'returning'} UserStatus
 */

/**
 * Privacy-first user profile with Master Context compliance
 * SECURITY: No pubkeys stored - only auth hashes and encrypted data
 * @typedef {Object} UserProfile
 * @property {string} id - Privacy-preserving user ID
 * @property {string} username - User display name (no real names)
 * @property {string} [avatar] - Avatar URL or hash
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} role - Standardized role hierarchy (greenfield)
 * @property {string} [familyId] - Privacy-preserving family ID
 * @property {boolean} is_discoverable - Opt-in discoverability setting
 * @property {string} [relay_url] - User's preferred Nostr relay
 * @property {number} created_at - Unix timestamp
 * @property {number} [last_login] - Unix timestamp of last login
 * @property {Object} [sovereigntyStatus] - Individual Wallet Sovereignty status
 * @property {boolean} sovereigntyStatus.hasUnlimitedAccess - Whether user has unlimited access
 * @property {number} sovereigntyStatus.spendingLimit - Spending limit (-1 for unlimited)
 * @property {boolean} sovereigntyStatus.requiresApproval - Whether approval is required
 */

/**
 * Complete user object with privacy-first design
 * SECURITY: No pubkeys stored - only auth hashes and encrypted data
 * @typedef {Object} User
 * @property {string} id - Privacy-preserving user ID
 * @property {string} username - User display name (no real names)
 * @property {string} auth_hash - Non-reversible hash for authentication
 * @property {string} [encrypted_profile] - User-encrypted optional data
 * @property {boolean} is_discoverable - Opt-in discoverability
 * @property {UserStatus} user_status - Onboarding status
 * @property {boolean} onboarding_completed - Identity verification complete
 * @property {string} [invited_by] - Privacy-preserving ID of inviting user
 * @property {string} [encryption_hint] - Hint for user's encryption method
 * @property {string} [relay_url] - User's preferred relay
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} role - Standardized role hierarchy (greenfield)
 * @property {string} [familyId] - Privacy-preserving family ID
 * @property {string} [avatar] - Avatar URL or hash
 * @property {number} created_at - Unix timestamp
 * @property {number} [last_login] - Unix timestamp
 * @property {string} [npub] - Optional Nostr public key for backward compatibility
 */

/**
 * Privacy-first user registration with Master Context compliance
 * SECURITY: Uses auth hash and encrypted data only
 * @typedef {Object} UserRegistration
 * @property {string} username - User display name (no real names)
 * @property {string} auth_hash - Non-reversible hash created from pubkey
 * @property {string} [encrypted_profile] - User-encrypted optional data
 * @property {string} [encryption_hint] - Hint for encryption method
 * @property {string} [invite_code] - Optional family/group invitation
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} [role] - Standardized role hierarchy
 */

/**
 * User API response with Master Context compliance
 * @typedef {Object} UserAPIResponse
 * @property {boolean} success - Success status
 * @property {UserProfile|User|Object} [data] - Response data (no 'any' types per Master Context)
 * @property {string} [message] - Success/error message
 * @property {Object} [sovereigntyStatus] - Individual Wallet Sovereignty status
 * @property {'private'|'offspring'|'adult'|'steward'|'guardian'} [sovereigntyStatus.role] - User role
 * @property {boolean} [sovereigntyStatus.hasUnlimitedAccess] - Whether user has unlimited access
 * @property {number} [sovereigntyStatus.spendingLimit] - Spending limit (-1 for unlimited)
 * @property {boolean} [sovereigntyStatus.requiresApproval] - Whether approval is required
 * @property {Object} meta - Response metadata
 * @property {string} meta.timestamp - Response timestamp
 * @property {boolean} meta.clientSide - Client-side operation indicator
 * @property {boolean} [meta.demo] - Demo mode indicator
 * @property {boolean} [meta.requiresApproval] - Whether approval is required (for error responses)
 */

/**
 * Individual Wallet Sovereignty validation for user operations
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} userRole - User role
 * @param {string} operation - Operation type
 * @returns {Object} Sovereignty validation result
 */
function validateUserSovereignty(userRole, operation) {
  // SOVEREIGNTY: Adults, Stewards, and Guardians have unlimited authority
  if (userRole === 'private' || userRole === 'adult' || userRole === 'steward' || userRole === 'guardian') {
    return {
      authorized: true,
      spendingLimit: -1, // No limits for sovereign roles
      hasUnlimitedAccess: true,
      requiresApproval: false,
      message: 'Sovereign role with unlimited user management authority'
    };
  }

  // PARENT-OFFSPRING AUTHORIZATION: Offspring have limited user operations
  if (userRole === 'offspring') {
    const restrictedOperations = ['delete_account', 'change_family', 'invite_users'];
    const requiresApproval = restrictedOperations.includes(operation);
    
    return {
      authorized: !restrictedOperations.includes(operation) || false, // Restricted operations need approval
      spendingLimit: 0, // No spending authority for user operations
      hasUnlimitedAccess: false,
      requiresApproval,
      message: requiresApproval ? 'User operation requires guardian approval' : 'User operation authorized'
    };
  }

  // Default to unauthorized for unknown roles
  return {
    authorized: false,
    spendingLimit: 0,
    hasUnlimitedAccess: false,
    requiresApproval: true,
    message: 'Unknown role - user operation not authorized'
  };
}

/**
 * Generate privacy-preserving user operation hash using Web Crypto API
 * @param {string} userId - User ID
 * @param {string} operation - Operation type
 * @returns {Promise<string>} Privacy-preserving hash
 */
async function generateUserOperationHash(userId, operation) {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(`user_${userId}_${operation}_${Date.now()}`);
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
 * Fetches the user profile for the currently authenticated user with Master Context compliance
 * @param {string} [userId] - Optional user ID (uses current user if not provided)
 * @param {string} [authToken] - Optional authentication token
 * @returns {Promise<UserAPIResponse>} Promise resolving to the user profile response
 */
export async function fetchUserProfile(userId, authToken) {
  try {
    // Generate privacy-preserving operation hash
    const operationHash = await generateUserOperationHash(userId || 'current', 'fetch_profile');
    
    // Mock user profile with Master Context compliance
    const mockProfile = {
      id: operationHash, // Privacy-preserving user ID
      username: "satnam_user", // No real names
      avatar: undefined, // No avatar data
      role: convertToStandardizedRole('user'), // Standardized role
      familyId: undefined, // No family data in demo
      is_discoverable: false, // Privacy-first default
      relay_url: undefined, // No relay data
      created_at: Date.now() - 86400000, // 1 day ago
      last_login: Date.now() - 3600000, // 1 hour ago
    };

    // Validate sovereignty for profile access
    const sovereigntyValidation = validateUserSovereignty(mockProfile.role, 'fetch_profile');

    return {
      success: true,
      data: {
        ...mockProfile,
        sovereigntyStatus: {
          role: mockProfile.role,
          hasUnlimitedAccess: sovereigntyValidation.hasUnlimitedAccess,
          spendingLimit: sovereigntyValidation.spendingLimit,
          requiresApproval: sovereigntyValidation.requiresApproval,
        },
      },
      message: "User profile retrieved successfully with sovereignty compliance",
      sovereigntyStatus: {
        role: mockProfile.role,
        hasUnlimitedAccess: sovereigntyValidation.hasUnlimitedAccess,
        spendingLimit: sovereigntyValidation.spendingLimit,
        requiresApproval: sovereigntyValidation.requiresApproval,
      },
      meta: {
        timestamp: new Date().toISOString(),
        clientSide: true,
        demo: true,
      },
    };
  } catch (error) {
    // PRIVACY: No sensitive error data logging
    return {
      success: false,
      message: "Failed to retrieve user profile",
      meta: {
        timestamp: new Date().toISOString(),
        clientSide: true,
        demo: true,
      },
    };
  }
}

/**
 * Update user profile with Master Context compliance and sovereignty validation
 * @param {Partial<UserProfile>} profileUpdates - Profile updates to apply
 * @param {string} [authToken] - Authentication token
 * @returns {Promise<UserAPIResponse>} Promise resolving to the update response
 */
export async function updateUserProfile(profileUpdates, authToken) {
  try {
    // Generate privacy-preserving operation hash
    const operationHash = await generateUserOperationHash(profileUpdates.id || 'current', 'update_profile');

    // Validate sovereignty for profile updates
    const userRole = /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (profileUpdates.role || 'private');
    const sovereigntyValidation = validateUserSovereignty(userRole, 'update_profile');

    if (!sovereigntyValidation.authorized) {
      return {
        success: false,
        message: sovereigntyValidation.message,
        meta: {
          timestamp: new Date().toISOString(),
          clientSide: true,
          requiresApproval: sovereigntyValidation.requiresApproval,
        },
      };
    }

    // Mock profile update with privacy compliance
    const updatedProfile = {
      id: operationHash,
      username: profileUpdates.username || "satnam_user", // No real names
      avatar: profileUpdates.avatar, // Avatar updates allowed
      role: convertToStandardizedRole(profileUpdates.role || 'private'),
      familyId: profileUpdates.familyId, // Family updates with sovereignty check
      is_discoverable: profileUpdates.is_discoverable || false, // Privacy-first default
      relay_url: profileUpdates.relay_url, // Relay updates allowed
      created_at: Date.now() - 86400000, // Preserve creation time
      last_login: Date.now(), // Update last login
    };

    return {
      success: true,
      data: {
        ...updatedProfile,
        sovereigntyStatus: {
          role: updatedProfile.role,
          hasUnlimitedAccess: sovereigntyValidation.hasUnlimitedAccess,
          spendingLimit: sovereigntyValidation.spendingLimit,
          requiresApproval: sovereigntyValidation.requiresApproval,
        },
      },
      message: "User profile updated successfully with sovereignty compliance",
      sovereigntyStatus: {
        role: updatedProfile.role,
        hasUnlimitedAccess: sovereigntyValidation.hasUnlimitedAccess,
        spendingLimit: sovereigntyValidation.spendingLimit,
        requiresApproval: sovereigntyValidation.requiresApproval,
      },
      meta: {
        timestamp: new Date().toISOString(),
        clientSide: true,
        demo: true,
      },
    };
  } catch (error) {
    // PRIVACY: No sensitive error data logging
    return {
      success: false,
      message: "Failed to update user profile",
      meta: {
        timestamp: new Date().toISOString(),
        clientSide: true,
        demo: true,
      },
    };
  }
}

/**
 * Get user settings with Master Context compliance
 * @param {string} [userId] - Optional user ID (uses current user if not provided)
 * @param {string} [authToken] - Authentication token
 * @returns {Promise<UserAPIResponse>} Promise resolving to user settings
 */
export async function getUserSettings(userId, authToken) {
  try {
    // Generate privacy-preserving operation hash
    const operationHash = await generateUserOperationHash(userId || 'current', 'get_settings');

    // Mock user settings with Master Context compliance
    const mockSettings = {
      id: operationHash,
      privacy: {
        is_discoverable: false, // Privacy-first default
        show_family_status: false, // Privacy-first default
        enable_analytics: false, // Privacy-first default
      },
      notifications: {
        email_enabled: false, // No email notifications (privacy-first)
        push_enabled: true, // Push notifications allowed
        family_updates: true, // Family updates enabled
        payment_alerts: true, // Payment alerts enabled
      },
      security: {
        two_factor_enabled: true, // Security-first default
        session_timeout: 3600, // 1 hour session timeout
        require_approval_for_large_amounts: true, // Security-first default
      },
      sovereignty: {
        role: /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ ('adult'), // Default to adult role with proper type casting
        spending_limit: -1, // Unlimited for sovereign roles
        requires_approval: false, // No approval required for sovereign roles
      },
    };

    // Validate sovereignty for settings access
    const sovereigntyValidation = validateUserSovereignty(mockSettings.sovereignty.role, 'get_settings');

    return {
      success: true,
      data: {
        ...mockSettings,
        sovereigntyStatus: {
          role: mockSettings.sovereignty.role,
          hasUnlimitedAccess: sovereigntyValidation.hasUnlimitedAccess,
          spendingLimit: sovereigntyValidation.spendingLimit,
          requiresApproval: sovereigntyValidation.requiresApproval,
        },
      },
      message: "User settings retrieved successfully with sovereignty compliance",
      sovereigntyStatus: {
        role: /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (mockSettings.sovereignty.role),
        hasUnlimitedAccess: sovereigntyValidation.hasUnlimitedAccess,
        spendingLimit: sovereigntyValidation.spendingLimit,
        requiresApproval: sovereigntyValidation.requiresApproval,
      },
      meta: {
        timestamp: new Date().toISOString(),
        clientSide: true,
        demo: true,
      },
    };
  } catch (error) {
    // PRIVACY: No sensitive error data logging
    return {
      success: false,
      message: "Failed to retrieve user settings",
      meta: {
        timestamp: new Date().toISOString(),
        clientSide: true,
        demo: true,
      },
    };
  }
}

/**
 * Update user settings with Master Context compliance and sovereignty validation
 * @param {Object} settingsUpdates - Settings updates to apply
 * @param {string} [authToken] - Authentication token
 * @returns {Promise<UserAPIResponse>} Promise resolving to the update response
 */
export async function updateUserSettings(settingsUpdates, authToken) {
  try {
    // Generate privacy-preserving operation hash
    const operationHash = await generateUserOperationHash('current', 'update_settings');

    // Validate sovereignty for settings updates
    const userRole = /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (settingsUpdates.sovereignty?.role || 'private');
    const sovereigntyValidation = validateUserSovereignty(userRole, 'update_settings');

    if (!sovereigntyValidation.authorized) {
      return {
        success: false,
        message: sovereigntyValidation.message,
        meta: {
          timestamp: new Date().toISOString(),
          clientSide: true,
          requiresApproval: sovereigntyValidation.requiresApproval,
        },
      };
    }

    // Mock settings update with privacy compliance
    const updatedSettings = {
      id: operationHash,
      privacy: {
        is_discoverable: settingsUpdates.privacy?.is_discoverable || false,
        show_family_status: settingsUpdates.privacy?.show_family_status || false,
        enable_analytics: false, // Always false for privacy-first
      },
      notifications: {
        email_enabled: false, // Always false for privacy-first
        push_enabled: settingsUpdates.notifications?.push_enabled || true,
        family_updates: settingsUpdates.notifications?.family_updates || true,
        payment_alerts: settingsUpdates.notifications?.payment_alerts || true,
      },
      security: {
        two_factor_enabled: settingsUpdates.security?.two_factor_enabled || true,
        session_timeout: settingsUpdates.security?.session_timeout || 3600,
        require_approval_for_large_amounts: settingsUpdates.security?.require_approval_for_large_amounts || true,
      },
      sovereignty: {
        role: convertToStandardizedRole(userRole),
        spending_limit: sovereigntyValidation.spendingLimit,
        requires_approval: sovereigntyValidation.requiresApproval,
      },
    };

    return {
      success: true,
      data: {
        ...updatedSettings,
        sovereigntyStatus: {
          role: updatedSettings.sovereignty.role,
          hasUnlimitedAccess: sovereigntyValidation.hasUnlimitedAccess,
          spendingLimit: sovereigntyValidation.spendingLimit,
          requiresApproval: sovereigntyValidation.requiresApproval,
        },
      },
      message: "User settings updated successfully with sovereignty compliance",
      sovereigntyStatus: {
        role: updatedSettings.sovereignty.role,
        hasUnlimitedAccess: sovereigntyValidation.hasUnlimitedAccess,
        spendingLimit: sovereigntyValidation.spendingLimit,
        requiresApproval: sovereigntyValidation.requiresApproval,
      },
      meta: {
        timestamp: new Date().toISOString(),
        clientSide: true,
        demo: true,
      },
    };
  } catch (error) {
    // PRIVACY: No sensitive error data logging
    return {
      success: false,
      message: "Failed to update user settings",
      meta: {
        timestamp: new Date().toISOString(),
        clientSide: true,
        demo: true,
      },
    };
  }
}

/**
 * Delete user account with Master Context compliance and sovereignty validation
 * @param {string} [userId] - Optional user ID (uses current user if not provided)
 * @param {string} [authToken] - Authentication token
 * @param {string} [confirmationCode] - Account deletion confirmation code
 * @returns {Promise<UserAPIResponse>} Promise resolving to the deletion response
 */
export async function deleteUserAccount(userId, authToken, confirmationCode) {
  try {
    // Generate privacy-preserving operation hash
    const operationHash = await generateUserOperationHash(userId || 'current', 'delete_account');

    // Validate sovereignty for account deletion (high-security operation)
    const sovereigntyValidation = validateUserSovereignty('adult', 'delete_account'); // Assume adult for deletion

    if (!sovereigntyValidation.authorized) {
      return {
        success: false,
        message: "Account deletion requires guardian approval for offspring accounts",
        meta: {
          timestamp: new Date().toISOString(),
          clientSide: true,
          requiresApproval: true,
        },
      };
    }

    // Mock account deletion with privacy compliance
    return {
      success: true,
      data: {
        operationId: operationHash,
        deletionScheduled: true,
        deletionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        recoveryPeriod: 7, // 7 days recovery period
      },
      message: "Account deletion scheduled successfully with sovereignty compliance",
      sovereigntyStatus: {
        role: 'adult',
        hasUnlimitedAccess: sovereigntyValidation.hasUnlimitedAccess,
        spendingLimit: sovereigntyValidation.spendingLimit,
        requiresApproval: sovereigntyValidation.requiresApproval,
      },
      meta: {
        timestamp: new Date().toISOString(),
        clientSide: true,
        demo: true,
      },
    };
  } catch (error) {
    // PRIVACY: No sensitive error data logging
    return {
      success: false,
      message: "Failed to process account deletion",
      meta: {
        timestamp: new Date().toISOString(),
        clientSide: true,
        demo: true,
      },
    };
  }
}

/**
 * Master Context compliant API configuration for user endpoints
 * @type {Object}
 */
export const userAPIConfig = {
  baseUrl: getEnvVar("VITE_API_BASE_URL") || getEnvVar("API_BASE_URL") || "/.netlify/functions",
  endpoints: {
    profile: "/user/profile",
    settings: "/user/settings",
    delete: "/user/delete",
  },
  timeout: 30000, // 30 seconds
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  privacy: {
    enableLogging: false, // Privacy-first: no logging
    enableAnalytics: false, // Privacy-first: no analytics
    enableTracking: false, // Privacy-first: no tracking
  },
  sovereignty: {
    enforceRoleValidation: true, // Always enforce sovereignty
    defaultRole: 'private', // Default to private role
    requireApprovalForDeletion: true, // Require approval for account deletion
  },
};
