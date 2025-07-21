/**
 * CRITICAL SECURITY: User Educational Referrals API with Master Context Compliance
 * 
 * Implements user referral tracking with JWT authentication, privacy-first logging,
 * and Master Context role hierarchy. All operations logged locally for user transparency
 * with zero external data leakage. Handles detailed educational referral tracking,
 * invitation history, and course credit history for the educational referral dashboard.
 */

import { getUserFromRequest } from "../../lib/auth.js";
import { SecureSessionManager } from "../../netlify/functions/security/session-manager.js";
import { supabase } from "../../netlify/functions/supabase.js";

/**
 * CRITICAL SECURITY: Master Context environment variable access pattern
 * Ensures browser compatibility with import.meta.env while maintaining serverless support
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
 * CRITICAL SECURITY: Privacy-first operation logging for user transparency
 * All referral operations logged to user's localStorage with zero external leakage
 * @typedef {Object} ReferralOperation
 * @property {string} operation - Operation type
 * @property {Object} details - Operation details
 * @property {Date} timestamp - Operation timestamp
 */

/**
 * CRITICAL SECURITY: Privacy-first referral operation logging
 * @param {ReferralOperation} operation - Operation to log
 * @returns {Promise<void>}
 */
const logReferralOperation = async (operation) => {
  try {
    const logEntry = {
      id: crypto.randomUUID(),
      component: 'UserReferrals',
      operation: operation.operation,
      details: operation.details,
      timestamp: operation.timestamp.toISOString(),
    };

    const existingLogs = JSON.parse(localStorage.getItem('referralOperations') || '[]');
    const updatedLogs = [logEntry, ...existingLogs].slice(0, 1000); // Keep last 1000 entries
    localStorage.setItem('referralOperations', JSON.stringify(updatedLogs));
  } catch (error) {
    // Silent failure to prevent disrupting user experience
  }
};

/**
 * CRITICAL SECURITY: Generate encrypted UUID for privacy protection
 * Uses SHA-256 hashing with Web Crypto API to prevent correlation attacks
 * @param {string} identifier - Base identifier for hashing
 * @returns {Promise<string>} Encrypted UUID
 */
const generateSecureReferralId = async (identifier) => {
  try {
    const fullIdentifier = `${identifier}:${crypto.randomUUID()}:${Date.now()}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(fullIdentifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const secureId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // CRITICAL SECURITY: Clear sensitive data from memory
    data.fill(0);
    
    return secureId;
  } catch (error) {
    // Fallback to regular UUID if crypto operations fail
    return crypto.randomUUID();
  }
};

/**
 * CRITICAL SECURITY: Validate Master Context role
 * @param {string} role - Role to validate
 * @returns {boolean} True if role is valid Master Context role
 */
const validateMasterContextRole = (role) => {
  const validRoles = ['private', 'offspring', 'adult', 'steward', 'guardian'];
  return validRoles.includes(role);
};



/**
 * CRITICAL SECURITY: Validate JWT session and extract user data
 * @param {Object} req - Request object
 * @returns {Promise<Object|null>} Session data or null if invalid
 */
const validateJWTSession = async (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const sessionData = await SecureSessionManager.validateSession(token);
    
    if (!sessionData || !sessionData.isAuthenticated) {
      return null;
    }

    return sessionData;
  } catch (error) {
    return null;
  }
};

/**
 * @typedef {Object} FormattedInvitation
 * @property {string} id - Invitation ID
 * @property {string} recipientInfo - Recipient information
 * @property {string} personalMessage - Personal message
 * @property {number} courseCredits - Course credits
 * @property {"pending"|"accepted"|"expired"} status - Invitation status
 * @property {string} createdAt - Creation timestamp
 * @property {string} expiresAt - Expiration timestamp
 * @property {string} inviteUrl - Invitation URL
 * @property {string} qrCodeUrl - QR code URL
 */

/**
 * @typedef {Object} FormattedCreditHistory
 * @property {string} id - Credit history ID
 * @property {string} type - Credit type
 * @property {number} amount - Credit amount
 * @property {string} description - Credit description
 * @property {string} referralId - Referral ID
 * @property {string} timestamp - Credit timestamp
 */

/**
 * @typedef {Object} ReferralData
 * @property {number} totalReferrals - Total referrals count
 * @property {number} completedReferrals - Completed referrals count
 * @property {number} pendingReferrals - Pending referrals count
 * @property {number} totalCreditsEarned - Total credits earned
 * @property {number} pendingCredits - Pending credits
 * @property {FormattedInvitation[]} recentInvitations - Recent invitations
 * @property {FormattedCreditHistory[]} creditHistory - Credit history
 */

/**
 * @typedef {Object} ErrorResponse
 * @property {boolean} success - Success status (false)
 * @property {string} error - Error message
 * @property {Object} meta - Response metadata
 * @property {string} meta.timestamp - Response timestamp
 */

/**
 * CRITICAL SECURITY: Main User Referrals handler with comprehensive error handling
 * @param {Object} req - Netlify request object
 * @param {Object} res - Netlify response object
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  const operationId = await generateSecureReferralId('user_referrals');
  
  try {
    // CORS headers
    const headers = {
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Set CORS headers
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }

    if (req.method !== "GET") {
      await logReferralOperation({
        operation: "method_not_allowed",
        details: {
          operationId,
          method: req.method,
          allowedMethods: ["GET"],
        },
        timestamp: new Date(),
      });

      res.status(405).json({
        success: false,
        error: "Method not allowed",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // CRITICAL SECURITY: Validate JWT session
    const sessionData = await validateJWTSession(req);
    if (!sessionData) {
      await logReferralOperation({
        operation: "referral_access_denied",
        details: {
          operationId,
          reason: "authentication_required",
          method: req.method,
        },
        timestamp: new Date(),
      });

      res.status(401).json({
        success: false,
        error: "Authentication required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // CRITICAL SECURITY: Log referral data request
    await logReferralOperation({
      operation: "referral_data_request",
      details: {
        operationId,
        userId: sessionData.userId,
        userRole: sessionData.role,
      },
      timestamp: new Date(),
    });

    // Get authenticated user details
    const user = await getUserFromRequest(req);
    if (!user) {
      await logReferralOperation({
        operation: "user_details_not_found",
        details: {
          operationId,
          userId: sessionData.userId,
        },
        timestamp: new Date(),
      });

      res.status(401).json({
        success: false,
        error: "User details not found",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate user object structure
    if (typeof user === "string" || !user.hashedUserId) {
      await logReferralOperation({
        operation: "invalid_user_token",
        details: {
          operationId,
          userId: sessionData.userId,
          userType: typeof user,
        },
        timestamp: new Date(),
      });

      res.status(401).json({
        success: false,
        error: "Invalid authentication token",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate user role directly with Master Context roles
    const userRole = user.role || 'private';
    const validRole = validateMasterContextRole(userRole)
      ? /** @type {"private"|"offspring"|"adult"|"steward"|"guardian"} */ (userRole)
      : "private";

    const hashedUserId = user.hashedUserId;

    // CRITICAL SECURITY: Get user's invitations with RLS compliance
    const { data: userInvitations, error: invitationsError } = await supabase
      .from('peer_invitations')
      .select('*')
      .eq('inviter_id', sessionData.userId)
      .order('created_at', { ascending: false });

    if (invitationsError) {
      await logReferralOperation({
        operation: "invitations_fetch_error",
        details: {
          operationId,
          error: invitationsError.message,
          userId: sessionData.userId,
        },
        timestamp: new Date(),
      });
    }

    // CRITICAL SECURITY: Get referral statistics with RLS compliance
    const { data: referralStats, error: statsError } = await supabase
      .from('referral_statistics')
      .select('*')
      .eq('user_id', sessionData.userId)
      .single();

    if (statsError && statsError.code !== 'PGRST116') { // PGRST116 = no rows returned
      await logReferralOperation({
        operation: "referral_stats_fetch_error",
        details: {
          operationId,
          error: statsError.message,
          userId: sessionData.userId,
        },
        timestamp: new Date(),
      });
    }

    // CRITICAL SECURITY: Get credit history with RLS compliance
    const { data: creditHistory, error: creditsError } = await supabase
      .from('credit_history')
      .select('*')
      .eq('user_id', sessionData.userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (creditsError) {
      await logReferralOperation({
        operation: "credit_history_fetch_error",
        details: {
          operationId,
          error: creditsError.message,
          userId: sessionData.userId,
        },
        timestamp: new Date(),
      });
    }

    // Ensure we have arrays to work with
    const invitationsArray = userInvitations || [];
    const creditsArray = creditHistory || [];

    // Format invitations data with privacy protection
    const recentInvitations = invitationsArray.map((invitation) => {
      const now = new Date();
      const expiryDate = invitation.expires_at
        ? new Date(invitation.expires_at)
        : new Date();

      let status = "pending";
      if (invitation.is_used) {
        status = "accepted";
      } else if (invitation.expires_at && now > expiryDate) {
        status = "expired";
      }

      // Generate invitation URLs with proper base URL
      const baseUrl = getEnvVar('SITE_URL') || 'https://satnam.pub';
      const inviteToken = invitation.invite_token || "";

      return {
        id: inviteToken,
        recipientInfo: invitation.invitation_data?.recipientInfo || "Friend",
        personalMessage: invitation.invitation_data?.personalMessage ||
          "Join me on Satnam.pub for Bitcoin education!",
        courseCredits: invitation.course_credits || 0,
        status: /** @type {"pending"|"accepted"|"expired"} */ (status),
        createdAt: invitation.created_at || new Date().toISOString(),
        expiresAt: invitation.expires_at || new Date().toISOString(),
        inviteUrl: `${baseUrl}/invite/${inviteToken}`,
        qrCodeUrl: `${baseUrl}/api/qr?data=${encodeURIComponent(`${baseUrl}/invite/${inviteToken}`)}`,
      };
    });

    // Format credit history with privacy protection
    const formattedCreditHistory = creditsArray.map((credit) => ({
      id: credit.id || crypto.randomUUID(),
      type: credit.activity_type || "unknown",
      amount: credit.credits_amount || 0,
      description: credit.description || "",
      referralId: credit.invite_token || "",
      timestamp: credit.created_at || new Date().toISOString(),
    }));

    // Calculate referral statistics
    const totalReferrals = referralStats?.total_referrals || invitationsArray.length;
    const completedReferrals = referralStats?.completed_referrals ||
      invitationsArray.filter(inv => inv.is_used).length;
    const pendingReferrals = referralStats?.pending_referrals ||
      invitationsArray.filter(inv => !inv.is_used && new Date(inv.expires_at || 0) > new Date()).length;
    const totalCreditsEarned = referralStats?.total_course_credits_earned ||
      creditsArray.reduce((sum, credit) => sum + (credit.credits_amount || 0), 0);
    const pendingCredits = referralStats?.pending_course_credits || 0;

    /** @type {ReferralData} */
    const referralData = {
      totalReferrals,
      completedReferrals,
      pendingReferrals,
      totalCreditsEarned,
      pendingCredits,
      recentInvitations: recentInvitations.slice(0, 10), // Limit to 10 recent
      creditHistory: formattedCreditHistory.slice(0, 20), // Limit to 20 recent
    };

    // CRITICAL SECURITY: Log successful referral data retrieval
    await logReferralOperation({
      operation: "referral_data_retrieved",
      details: {
        operationId,
        userId: sessionData.userId,
        userRole: validRole,
        totalReferrals,
        completedReferrals,
        pendingReferrals,
        totalCreditsEarned,
        invitationsCount: recentInvitations.length,
        creditsCount: formattedCreditHistory.length,
      },
      timestamp: new Date(),
    });

    res.status(200).json(referralData);
  } catch (error) {
    // CRITICAL SECURITY: Privacy-first error logging
    await logReferralOperation({
      operation: "referral_data_error",
      details: {
        operationId,
        error: error.message,
        userId: "unknown", // Use fallback since we don't have validated data in catch block
      },
      timestamp: new Date(),
    });

    res.status(500).json({
      success: false,
      error: "Internal server error during referral data retrieval",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}
