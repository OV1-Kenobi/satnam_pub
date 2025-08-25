/**
 * Family Federation Fedimint Wallet API - RBAC & FROST Multi-Signature
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Family federation role-based access control (steward/guardian for spending)
 * - FROST threshold signatures for all Fedimint spending operations
 * - Privacy-first architecture with family isolation
 * - JWT authentication with family membership validation
 * - Audit logging for all Fedimint wallet operations
 * - Rate limiting per family federation
 * - Integration with Fedimint guardian consensus
 */

import { createClient } from '@supabase/supabase-js';
import { CentralEventPublishingService } from '../../../lib/central_event_publishing_service.js';
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
 * @param {string} context - Context for logging (e.g., 'family_membership')
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
 * Validate family federation membership and role
 * @param {string} userHash - User's hashed UUID
 * @param {string} familyId - Family federation ID
 * @returns {Promise<{valid: boolean, role?: string, votingPower?: number, permissions?: object}>}
 */
async function validateFamilyMembership(userHash, familyId) {
  try {
    const { data, error } = await supabase
      .from('family_memberships')
      .select('member_role, voting_power, is_active, encrypted_permissions, permissions_encryption_salt, permissions_encryption_iv')
      .eq('member_hash', userHash)
      .eq('federation_hash', familyId)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return { valid: false };
    }

    return {
      valid: true,
      role: data.member_role,
      votingPower: data.voting_power,
      permissions: await parsePermissionsSafely(
        data.encrypted_permissions,
        data.permissions_encryption_salt,
        data.permissions_encryption_iv,
        'family_membership_fedimint'
      )
    };
  } catch (error) {
    console.error('Family membership validation error:', error);
    return { valid: false };
  }
}

/**
 * Check if user has spending permissions (steward/guardian only)
 * @param {string} role - User's role in family federation
 * @returns {boolean}
 */
function hasSpendingPermissions(role) {
  return ['steward', 'guardian'].includes(role);
}

/**
 * Check if user has balance viewing permissions (steward/guardian only)
 * @param {string} role - User's role in family federation
 * @returns {boolean}
 */
function hasBalanceViewPermissions(role) {
  return ['steward', 'guardian'].includes(role);
}

/**
 * Check if user has transaction history viewing permissions (all family members)
 * @param {string} role - User's role in family federation
 * @returns {boolean}
 */
function hasHistoryViewPermissions(role) {
  return ['offspring', 'adult', 'steward', 'guardian'].includes(role);
}

/**
 * Check if user has guardian consensus viewing permissions (steward/guardian only)
 * @param {string} role - User's role in family federation
 * @returns {boolean}
 */
function hasGuardianConsensusPermissions(role) {
  return ['steward', 'guardian'].includes(role);
}

/**
 * Get family Fedimint wallet data with role-based filtering
 * @param {string} familyId - Family federation ID
 * @param {string} userRole - User's role in family
 * @returns {Promise<object>} Wallet data filtered by role
 */
async function getFamilyFedimintWallet(familyId, userRole) {
  try {
    // Mock family Fedimint wallet data - replace with actual Fedimint federation queries
    const walletData = {
      family_id: familyId,
      federation_id: `fed_${familyId}`,
      ecash_balance: hasBalanceViewPermissions(userRole) ? 750000 : null, // Only stewards/guardians see balance
      available_balance: hasBalanceViewPermissions(userRole) ? 720000 : null,
      pending_notes: hasBalanceViewPermissions(userRole) ? 30000 : null,
      guardian_status: hasGuardianConsensusPermissions(userRole) ? {
        total_guardians: 5,
        online_guardians: 4,
        consensus_threshold: 3,
        last_consensus: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
        federation_health: 'healthy'
      } : null,
      pending_transactions: hasHistoryViewPermissions(userRole) ? [
        {
          id: 'fed_tx_001',
          type: 'mint',
          amount: 20000,
          status: 'pending_signatures',
          required_signatures: 2,
          current_signatures: 1,
          note_denomination: [10000, 5000, 5000],
          created_at: new Date().toISOString(),
          description: 'Family eCash minting'
        }
      ] : [],
      transaction_history: hasHistoryViewPermissions(userRole) ? [
        {
          id: 'fed_tx_002',
          type: 'spend',
          amount: 15000,
          status: 'completed',
          signatures_required: 2,
          signatures_received: 2,
          note_denomination: [10000, 5000],
          created_at: new Date(Date.now() - 86400000).toISOString(),
          description: 'Family eCash spending'
        }
      ] : [],
      spending_limits: {
        daily_limit: 200000,
        weekly_limit: 1000000,
        requires_threshold_approval: 100000
      },
      frost_config: {
        threshold: 2,
        total_guardians: 3,
        active_guardians: 3
      },
      fedimint_config: hasGuardianConsensusPermissions(userRole) ? {
        federation_name: 'Family Federation',
        guardian_nodes: [
          { id: 'guardian_1', status: 'online', last_seen: new Date().toISOString() },
          { id: 'guardian_2', status: 'online', last_seen: new Date().toISOString() },
          { id: 'guardian_3', status: 'online', last_seen: new Date().toISOString() },
          { id: 'guardian_4', status: 'online', last_seen: new Date().toISOString() },
          { id: 'guardian_5', status: 'offline', last_seen: new Date(Date.now() - 3600000).toISOString() }
        ],
        consensus_version: '0.3.0',
        api_endpoints: ['https://guardian1.family.fed', 'https://guardian2.family.fed']
      } : null
    };

    return walletData;
  } catch (error) {
    console.error('Error fetching family Fedimint wallet:', error);
    throw new Error('Failed to fetch family Fedimint wallet data');
  }
}

/**
 * Initiate FROST multi-signature Fedimint transaction
 * @param {string} familyId - Family federation ID
 * @param {object} transactionData - Fedimint transaction details
 * @param {string} initiatorHash - Hash of user initiating transaction
 * @returns {Promise<object>} Transaction initiation result
 */
async function initiateFrostFedimintTransaction(familyId, transactionData, initiatorHash) {
  try {
    // SECURITY FIX: Generate cryptographically secure transaction ID
    const crypto = await import('crypto');
    const transactionId = `frost_fed_${Date.now()}_${crypto.randomUUID()}`;
    
    // Mock FROST Fedimint transaction initiation
    const frostTransaction = {
      transaction_id: transactionId,
      family_id: familyId,
      federation_id: `fed_${familyId}`,
      initiator_hash: initiatorHash,
      type: transactionData.type, // 'mint', 'spend', 'reissue'
      amount: transactionData.amount,
      recipient: transactionData.recipient,
      description: transactionData.description,
      status: 'awaiting_signatures',
      required_signatures: 2, // Based on family FROST config
      current_signatures: 1, // Initiator's signature
      signature_deadline: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      created_at: new Date().toISOString(),
      fedimint_specific: {
        note_denominations: transactionData.note_denominations || [transactionData.amount],
        guardian_consensus_required: transactionData.type === 'mint',
        federation_fee: Math.floor(transactionData.amount * 0.001), // 0.1% fee
        privacy_level: 'maximum' // Fedimint provides maximum privacy
      }
    };

    // Store in database (mock)
    console.log('FROST Fedimint transaction initiated:', frostTransaction);

    // Send Nostr gift-wrapped messages to other guardians/stewards
    await notifyFamilyMembersForFedimintSigning(familyId, frostTransaction);

    return {
      success: true,
      transaction_id: transactionId,
      status: 'awaiting_signatures',
      required_signatures: 2,
      current_signatures: 1,
      signature_deadline: frostTransaction.signature_deadline,
      fedimint_info: {
        federation_id: frostTransaction.federation_id,
        note_denominations: frostTransaction.fedimint_specific.note_denominations,
        federation_fee: frostTransaction.fedimint_specific.federation_fee,
        guardian_consensus_required: frostTransaction.fedimint_specific.guardian_consensus_required
      }
    };
  } catch (error) {
    console.error('FROST Fedimint transaction initiation error:', error);
    throw new Error('Failed to initiate FROST Fedimint transaction');
  }
}

/**
 * Send gift-wrapped Nostr messages to family members for Fedimint transaction signing
 * @param {string} familyId - Family federation ID
 * @param {object} transaction - Fedimint transaction requiring signatures
 */
async function notifyFamilyMembersForFedimintSigning(familyId, transaction) {
  try {
    // Get family members with signing permissions
    const { data: members, error } = await supabase
      .from('family_memberships')
      .select('member_hash, member_role, encrypted_npub')
      .eq('federation_hash', familyId)
      .eq('is_active', true)
      .in('member_role', ['steward', 'guardian']);

    if (error || !members) {
      console.warn('Could not fetch family members for Fedimint signing notification');
      return;
    }

    // Initialize central event publishing service for gift-wrapped messaging
    const eventPublisher = new CentralEventPublishingService();

    // Track successful and failed deliveries for audit logging
    const deliveryResults = [];

    // Send NIP-59 gift-wrapped messages to family members
    for (const member of members) {
      if (member.member_hash !== transaction.initiator_hash) {
        try {
          // Create Fedimint FROST signature request message content
          const messageContent = {
            type: 'frost_signature_request',
            wallet_type: 'fedimint',
            transaction_id: transaction.transaction_id,
            family_id: transaction.family_id,
            amount: transaction.amount,
            recipient: transaction.recipient,
            description: transaction.description,
            required_signatures: transaction.required_signatures,
            current_signatures: transaction.current_signatures,
            deadline: transaction.signature_deadline,
            protocol: transaction.protocol || 'FROST-secp256k1',
            version: transaction.version || '1.0',
            // Fedimint-specific metadata
            federation_id: transaction.federation_id,
            fedimint_specific: {
              note_denominations: transaction.fedimint_specific?.note_denominations || [],
              federation_fee: transaction.fedimint_specific?.federation_fee || 0,
              guardian_consensus_required: transaction.fedimint_specific?.guardian_consensus_required || true,
              mint_url: transaction.fedimint_specific?.mint_url,
              federation_name: transaction.fedimint_specific?.federation_name
            },
            // Privacy-first metadata
            timestamp: new Date().toISOString(),
            message_type: 'family_federation_fedimint_frost_request',
            encryption_level: 'gift-wrap',
            sender_role: 'family_member',
            urgency: 'high' // Fedimint transactions require guardian consensus
          };

          // Create privacy contact object for the member with proper TypeScript types
          const memberContact = {
            sessionId: `fedimint_frost_notify_${Date.now()}_${member.member_hash.substring(0, 8)}`,
            encryptedNpub: member.encrypted_npub || member.member_hash, // Use member_hash as fallback if npub not stored
            displayNameHash: member.member_hash,
            familyRole: member.member_role,
            trustLevel: /** @type {"family" | "trusted" | "known" | "unverified"} */ ('family'), // Explicit type cast for enum
            supportsGiftWrap: true,
            preferredEncryption: /** @type {"gift-wrap" | "nip04" | "auto"} */ ('gift-wrap'), // Explicit type cast for enum
            tagsHash: ['frost', 'signature_request', 'family_federation', 'fedimint'],
            addedAt: new Date(),
            addedByHash: transaction.initiator_hash
          };

          // Send gift-wrapped direct message using NIP-59
          const messageId = await eventPublisher.sendGiftWrappedDirectMessage(
            memberContact,
            messageContent
          );

          deliveryResults.push({
            member_hash: member.member_hash,
            member_role: member.member_role,
            success: true,
            message_id: messageId,
            delivery_method: 'gift-wrap',
            wallet_type: 'fedimint',
            timestamp: new Date().toISOString()
          });

          console.log(`✅ Fedimint FROST signature request sent via gift-wrap to ${member.member_role} (${member.member_hash.substring(0, 8)}...)`);

        } catch (memberError) {
          // Log individual member delivery failure but continue with others
          console.error(`❌ Failed to send Fedimint FROST signature request to ${member.member_hash}:`, memberError);

          deliveryResults.push({
            member_hash: member.member_hash,
            member_role: member.member_role,
            success: false,
            error: memberError.message,
            delivery_method: 'gift-wrap',
            wallet_type: 'fedimint',
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Log delivery summary for audit trail
    const successCount = deliveryResults.filter(r => r.success).length;
    const totalCount = deliveryResults.length;

    console.log(`📊 Fedimint FROST signature request delivery summary: ${successCount}/${totalCount} successful`);

    // Store delivery results in database for audit purposes (optional)
    // This could be implemented later for compliance and monitoring

    return {
      success: successCount > 0,
      total_recipients: totalCount,
      successful_deliveries: successCount,
      failed_deliveries: totalCount - successCount,
      delivery_results: deliveryResults,
      wallet_type: 'fedimint'
    };

  } catch (error) {
    console.error('❌ Critical error in Fedimint FROST signature notification system:', error);
    throw new Error(`Failed to notify family members for Fedimint FROST signing: ${error.message}`);
  }
}

/**
 * Rate limiting check for family Fedimint operations
 */
const familyFedimintRateLimitMap = new Map();
const FAMILY_FEDIMINT_RATE_LIMIT_WINDOW = 60000; // 1 minute
const FAMILY_FEDIMINT_RATE_LIMIT_MAX_REQUESTS = 15; // 15 requests per minute per family (lower for Fedimint)

function checkFamilyFedimintRateLimit(familyId) {
  const now = Date.now();

  // SECURITY FIX: Enhanced memory leak prevention with size threshold
  if (Math.random() < 0.01 || familyFedimintRateLimitMap.size > 1000) { // 1% chance or size threshold
    let cleanedCount = 0;
    for (const [key, value] of familyFedimintRateLimitMap.entries()) {
      if (now > value.resetTime) {
        familyFedimintRateLimitMap.delete(key);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned ${cleanedCount} expired rate limit entries for Fedimint wallet`);
    }

    // Emergency cleanup if map is still too large
    if (familyFedimintRateLimitMap.size > 2000) {
      console.warn(`⚠️ Emergency cleanup: Fedimint rate limit map size exceeded 2000 entries (${familyFedimintRateLimitMap.size})`);
      familyFedimintRateLimitMap.clear();
    }
  }

  if (!familyFedimintRateLimitMap.has(familyId)) {
    familyFedimintRateLimitMap.set(familyId, { count: 1, resetTime: now + FAMILY_FEDIMINT_RATE_LIMIT_WINDOW });
    return true;
  }

  const familyData = familyFedimintRateLimitMap.get(familyId);

  if (now > familyData.resetTime) {
    familyFedimintRateLimitMap.set(familyId, { count: 1, resetTime: now + FAMILY_FEDIMINT_RATE_LIMIT_WINDOW });
    return true;
  }

  if (familyData.count >= FAMILY_FEDIMINT_RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  familyData.count++;
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

    const { familyId } = requestData;

    if (!familyId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Missing required parameter: familyId'
        })
      };
    }

    // Rate limiting
    if (!checkFamilyFedimintRateLimit(familyId)) {
      return {
        statusCode: 429,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Rate limit exceeded for family Fedimint operations'
        })
      };
    }

    // Validate family membership using authenticated user
    const membership = await validateFamilyMembership(authenticatedUserHash, familyId);
    if (!membership.valid) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Access denied: Not a member of this family federation'
        })
      };
    }

    // Handle different operations based on HTTP method and request data
    if (event.httpMethod === 'GET') {
      // Get family Fedimint wallet data
      const walletData = await getFamilyFedimintWallet(familyId, membership.role);
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          data: walletData,
          user_role: membership.role,
          permissions: {
            can_view_balance: hasBalanceViewPermissions(membership.role),
            can_spend: hasSpendingPermissions(membership.role),
            can_view_history: hasHistoryViewPermissions(membership.role),
            can_view_guardian_consensus: hasGuardianConsensusPermissions(membership.role)
          }
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const { operation } = requestData;

      if (operation === 'initiate_fedimint_transaction') {
        // Check spending permissions
        if (!hasSpendingPermissions(membership.role)) {
          return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: 'Access denied: Insufficient permissions for Fedimint spending operations'
            })
          };
        }

        const transactionResult = await initiateFrostFedimintTransaction(
          familyId,
          requestData.transaction,
          authenticatedUserHash
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
    console.error('Family Fedimint wallet API error:', error);
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
