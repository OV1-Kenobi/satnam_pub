/**
 * Individual Fedimint Wallet API - Adult & Offspring Roles
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Individual wallet sovereignty for adult/offspring roles
 * - Role-based spending limits and approval requirements
 * - Privacy-first architecture with individual isolation
 * - JWT authentication with role validation
 * - Adult oversight for offspring wallets (view-only + spending limits)
 * - Audit logging for all individual Fedimint operations
 */

import { createClient } from '@supabase/supabase-js';
import { decryptSensitiveData } from '../../../netlify/functions/privacy/encryption.js';
import { SecureSessionManager } from '../../../netlify/functions/security/session-manager.js';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase configuration');
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * SECURITY FIX: Safely decrypt and parse permissions field with proper validation
 * Handles encrypted permissions data with salt and IV
 * @param {string|null} encryptedPermissions - Encrypted permissions data from database
 * @param {string|null} salt - Encryption salt
 * @param {string|null} iv - Encryption IV
 * @param {string} context - Context for logging (e.g., 'individual_fedimint')
 * @returns {Promise<Object>} Parsed permissions object or empty object on failure
 */
async function parsePermissionsSafely(encryptedPermissions, salt, iv, context = 'unknown') {
  if (!encryptedPermissions) {
    return {};
  }

  try {
    // SECURITY: Validate input before processing
    if (typeof encryptedPermissions !== 'string') {
      console.warn(`Invalid permissions data type in ${context}: expected string, got ${typeof encryptedPermissions}`);
      return {};
    }

    let permissionsJson;

    // Check if we have encryption metadata (salt and IV)
    if (salt && iv) {
      try {
        // SECURITY FIX: Properly decrypt the permissions data
        console.log(`🔓 Decrypting permissions for ${context}`);

        const decryptedData = await decryptSensitiveData({
          encrypted: encryptedPermissions,
          salt: salt,
          iv: iv,
          tag: '' // GCM tag is included in encrypted data for this implementation
        });

        permissionsJson = decryptedData;
        console.log(`✅ Successfully decrypted permissions for ${context}`);

      } catch (decryptionError) {
        console.error(`❌ Failed to decrypt permissions in ${context}:`, decryptionError.message);
        return {};
      }
    } else {
      // Handle legacy plain JSON data (should be migrated to encrypted)
      console.warn(`⚠️ Plain text permissions detected in ${context} - should be encrypted`);
      permissionsJson = encryptedPermissions;
    }

    // Validate JSON structure before parsing
    if (permissionsJson.length > 2048) { // 2KB limit for permissions
      console.error(`Permissions data too large in ${context}: ${permissionsJson.length} bytes`);
      return {};
    }

    // Basic JSON structure validation
    if (!permissionsJson.trim().startsWith('{') || !permissionsJson.trim().endsWith('}')) {
      console.error(`Invalid JSON structure in permissions field for ${context}: must be an object`);
      return {};
    }

    const parsed = JSON.parse(permissionsJson);

    // Additional security validation on parsed object
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn(`Invalid permissions structure in ${context}: must be an object`);
      return {};
    }

    // Sanitize the permissions object to prevent prototype pollution
    const sanitized = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        console.warn(`Blocked dangerous property in permissions: ${key}`);
        continue;
      }
      sanitized[key] = value;
    }

    return sanitized;

  } catch (error) {
    console.error(`Failed to parse permissions in ${context}:`, error.message);
    return {};
  }
}

/**
 * Validate user role and family membership
 * @param {string} userHash - User's hashed UUID
 * @returns {Promise<{valid: boolean, role?: string, familyId?: string, controllingAdult?: string}>}
 */
async function validateUserRole(userHash) {
  try {
    // Check user's role in privacy_users table
    const { data: userData, error: userError } = await supabase
      .from('privacy_users')
      .select('federation_role')
      .eq('hashed_uuid', userHash)
      .single();

    if (userError || !userData) {
      return { valid: false };
    }

    // Check if user is in a family federation
    const { data: membershipData, error: membershipError } = await supabase
      .from('family_memberships')
      .select('federation_hash, member_role, encrypted_permissions, permissions_encryption_salt, permissions_encryption_iv')
      .eq('member_hash', userHash)
      .eq('is_active', true)
      .single();

    let familyId = null;
    let controllingAdult = null;

    if (!membershipError && membershipData) {
      familyId = membershipData.federation_hash;

      // If offspring, find controlling adult
      if (membershipData.member_role === 'offspring') {
        const permissions = await parsePermissionsSafely(
          membershipData.encrypted_permissions,
          membershipData.permissions_encryption_salt,
          membershipData.permissions_encryption_iv,
          'individual_fedimint_user_validation'
        );
        controllingAdult = permissions.controlling_adult_hash;
      }
    }

    return {
      valid: true,
      role: userData.federation_role,
      familyId,
      controllingAdult
    };
  } catch (error) {
    console.error('User role validation error:', error);
    return { valid: false };
  }
}

/**
 * Check if user can access another user's wallet (adult accessing offspring)
 * @param {string} accessorHash - Hash of user trying to access
 * @param {string} targetHash - Hash of target user's wallet
 * @param {string} accessorRole - Role of accessor
 * @returns {Promise<boolean>}
 */
async function canAccessWallet(accessorHash, targetHash, accessorRole) {
  // Users can always access their own wallet
  if (accessorHash === targetHash) {
    return true;
  }

  // Only adults can access other wallets (offspring only)
  if (accessorRole !== 'adult') {
    return false;
  }

  // Check if target is an offspring under this adult's control
  const { data: targetMembership, error } = await supabase
    .from('family_memberships')
    .select('member_role, encrypted_permissions, permissions_encryption_salt, permissions_encryption_iv')
    .eq('member_hash', targetHash)
    .eq('is_active', true)
    .single();

  if (error || !targetMembership || targetMembership.member_role !== 'offspring') {
    return false;
  }

  const permissions = await parsePermissionsSafely(
    targetMembership.encrypted_permissions,
    targetMembership.permissions_encryption_salt,
    targetMembership.permissions_encryption_iv,
    'individual_fedimint_access_control'
  );

  return permissions.controlling_adult_hash === accessorHash;
}

/**
 * Get individual Fedimint wallet data
 * @param {string} userHash - User's hashed UUID
 * @param {string} role - User's role
 * @param {boolean} isOwnWallet - Whether accessing own wallet
 * @returns {Promise<object>} Wallet data
 */
async function getIndividualFedimintWallet(userHash, role, isOwnWallet) {
  try {
    // Mock individual Fedimint wallet data - replace with actual Fedimint queries
    const baseWalletData = {
      user_hash: userHash,
      federation_id: `individual_fed_${userHash.slice(0, 8)}`,
      ecash_balance: 150000,
      available_balance: 140000,
      pending_notes: 10000,
      transaction_history: [
        {
          id: 'ind_fed_tx_001',
          type: 'receive',
          amount: 25000,
          status: 'completed',
          note_denomination: [10000, 10000, 5000],
          created_at: new Date(Date.now() - 86400000).toISOString(),
          description: 'Weekly allowance'
        },
        {
          id: 'ind_fed_tx_002',
          type: 'spend',
          amount: 8000,
          status: 'completed',
          note_denomination: [5000, 3000],
          created_at: new Date(Date.now() - 43200000).toISOString(),
          description: 'Coffee purchase'
        }
      ],
      spending_limits: role === 'offspring' ? {
        daily_limit: 20000,
        weekly_limit: 100000,
        requires_approval: 50000,
        controlling_adult_approval: true
      } : {
        daily_limit: -1, // Unlimited for adults
        weekly_limit: -1,
        requires_approval: -1,
        controlling_adult_approval: false
      },
      fedimint_config: {
        federation_name: 'Individual Fedimint',
        guardian_count: 3,
        consensus_threshold: 2,
        privacy_level: 'maximum'
      }
    };

    // If adult accessing offspring wallet, add oversight information
    if (!isOwnWallet && role === 'adult') {
      baseWalletData.oversight_info = {
        is_oversight_access: true,
        can_spend: false, // Adults cannot spend from offspring wallets
        can_set_limits: true,
        can_view_history: true,
        last_oversight_check: new Date().toISOString()
      };
    }

    return baseWalletData;
  } catch (error) {
    console.error('Error fetching individual Fedimint wallet:', error);
    throw new Error('Failed to fetch individual Fedimint wallet data');
  }
}

/**
 * Process individual Fedimint transaction
 * @param {string} userHash - User's hashed UUID
 * @param {object} transactionData - Transaction details
 * @param {string} role - User's role
 * @returns {Promise<object>} Transaction result
 */
async function processIndividualFedimintTransaction(userHash, transactionData, role) {
  try {
    // SECURITY FIX: Generate cryptographically secure transaction ID
    const crypto = await import('crypto');
    const transactionId = `ind_fed_tx_${Date.now()}_${crypto.randomUUID()}`;
    
    // Check spending limits for offspring
    if (role === 'offspring') {
      const dailyLimit = 20000;
      const requiresApproval = 50000;
      
      if (transactionData.amount > dailyLimit) {
        return {
          success: false,
          error: 'Transaction exceeds daily spending limit',
          requires_approval: true,
          daily_limit: dailyLimit
        };
      }
      
      if (transactionData.amount > requiresApproval) {
        return {
          success: false,
          error: 'Transaction requires adult approval',
          requires_approval: true,
          approval_threshold: requiresApproval
        };
      }
    }

    // Mock transaction processing
    const transaction = {
      transaction_id: transactionId,
      user_hash: userHash,
      type: transactionData.type,
      amount: transactionData.amount,
      recipient: transactionData.recipient,
      description: transactionData.description,
      status: 'completed',
      note_denominations: transactionData.note_denominations || [transactionData.amount],
      created_at: new Date().toISOString(),
      fedimint_specific: {
        federation_fee: Math.floor(transactionData.amount * 0.001),
        privacy_level: 'maximum',
        note_reissuance: true
      }
    };

    console.log('Individual Fedimint transaction processed:', transaction);

    return {
      success: true,
      transaction_id: transactionId,
      status: 'completed',
      amount: transactionData.amount,
      federation_fee: transaction.fedimint_specific.federation_fee,
      privacy_level: transaction.fedimint_specific.privacy_level
    };
  } catch (error) {
    console.error('Individual Fedimint transaction processing error:', error);
    throw new Error('Failed to process individual Fedimint transaction');
  }
}

/**
 * Rate limiting check for individual Fedimint operations
 */
const individualFedimintRateLimitMap = new Map();
const INDIVIDUAL_FEDIMINT_RATE_LIMIT_WINDOW = 60000; // 1 minute
const INDIVIDUAL_FEDIMINT_RATE_LIMIT_MAX_REQUESTS = 25; // 25 requests per minute per user

function checkIndividualFedimintRateLimit(userHash) {
  const now = Date.now();

  // SECURITY FIX: Enhanced memory leak prevention with size threshold
  if (Math.random() < 0.01 || individualFedimintRateLimitMap.size > 1000) { // 1% chance or size threshold
    let cleanedCount = 0;
    for (const [key, value] of individualFedimintRateLimitMap.entries()) {
      if (now > value.resetTime) {
        individualFedimintRateLimitMap.delete(key);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned ${cleanedCount} expired rate limit entries for Individual Fedimint wallet`);
    }

    // Emergency cleanup if map is still too large
    if (individualFedimintRateLimitMap.size > 2000) {
      console.warn(`⚠️ Emergency cleanup: Individual Fedimint rate limit map size exceeded 2000 entries (${individualFedimintRateLimitMap.size})`);
      individualFedimintRateLimitMap.clear();
    }
  }

  if (!individualFedimintRateLimitMap.has(userHash)) {
    individualFedimintRateLimitMap.set(userHash, { count: 1, resetTime: now + INDIVIDUAL_FEDIMINT_RATE_LIMIT_WINDOW });
    return true;
  }

  const userData = individualFedimintRateLimitMap.get(userHash);

  if (now > userData.resetTime) {
    individualFedimintRateLimitMap.set(userHash, { count: 1, resetTime: now + INDIVIDUAL_FEDIMINT_RATE_LIMIT_WINDOW });
    return true;
  }

  if (userData.count >= INDIVIDUAL_FEDIMINT_RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  userData.count++;
  return true;
}

/**
 * Main handler function
 * @param {Object} event - Netlify event object
 * @param {Object} context - Netlify context object
 * @returns {Promise<Object>} Netlify response object
 */
export default async function handler(event, context) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.VITE_APP_DOMAIN || 'https://www.satnam.pub',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    // CRITICAL SECURITY: Validate JWT token and extract authenticated user data
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Missing authorization token'
        })
      };
    }

    const token = authHeader.substring(7);
    const sessionValidation = await SecureSessionManager.validateSession(token);
    if (!sessionValidation || !sessionValidation.isAuthenticated) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Invalid or expired token'
        })
      };
    }

    const { userId: authenticatedUserHash, federationRole } = sessionValidation;

    // Parse request data
    let requestData = {};
    if (event.body) {
      try {
        requestData = JSON.parse(event.body);
      } catch (parseError) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body'
          })
        };
      }
    }

    const { targetUserHash } = requestData;
    const targetHash = targetUserHash || authenticatedUserHash; // Default to own wallet

    // Rate limiting using authenticated user
    if (!checkIndividualFedimintRateLimit(authenticatedUserHash)) {
      return {
        statusCode: 429,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Rate limit exceeded for individual Fedimint operations'
        })
      };
    }

    // Validate user role using authenticated user
    const userValidation = await validateUserRole(authenticatedUserHash);
    if (!userValidation.valid) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Access denied: Invalid user or role'
        })
      };
    }

    // Check if authenticated user can access the target wallet
    const canAccess = await canAccessWallet(authenticatedUserHash, targetHash, userValidation.role);
    if (!canAccess) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Access denied: Cannot access this wallet'
        })
      };
    }

    const isOwnWallet = authenticatedUserHash === targetHash;

    // Handle different operations based on HTTP method
    if (event.httpMethod === 'GET') {
      // Get individual Fedimint wallet data
      const walletData = await getIndividualFedimintWallet(targetHash, userValidation.role, isOwnWallet);
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          data: walletData,
          user_role: userValidation.role,
          is_own_wallet: isOwnWallet,
          permissions: {
            can_spend: isOwnWallet, // Can only spend from own wallet
            can_view_history: true,
            can_set_limits: !isOwnWallet && userValidation.role === 'adult' // Adults can set limits for offspring
          }
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const { operation } = requestData;

      if (operation === 'process_transaction') {
        // Can only spend from own wallet
        if (!isOwnWallet) {
          return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: 'Access denied: Cannot spend from another user\'s wallet'
            })
          };
        }

        const transactionResult = await processIndividualFedimintTransaction(
          authenticatedUserHash,
          requestData.transaction,
          userValidation.role
        );

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: transactionResult
          })
        };
      }

      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Unknown operation'
        })
      };
    }

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Method not allowed'
      })
    };

  } catch (error) {
    console.error('Individual Fedimint wallet API error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error'
      })
    };
  }
}
