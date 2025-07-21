/**
 * CRITICAL SECURITY: Create Educational Invitation API with Master Context Compliance
 * 
 * Implements peer invitation creation with JWT authentication, privacy-first logging,
 * and Master Context role hierarchy. All operations logged locally for user transparency
 * with zero external data leakage. Follows Satnam.pub privacy protocols.
 */

import { z } from "zod";
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
 * All invitation creation operations logged to user's localStorage with zero external leakage
 * @typedef {Object} InvitationOperation
 * @property {string} operation - Operation type
 * @property {Object} details - Operation details
 * @property {Date} timestamp - Operation timestamp
 */

/**
 * CRITICAL SECURITY: Privacy-first invitation operation logging
 * @param {InvitationOperation} operation - Operation to log
 * @returns {Promise<void>}
 */
const logInvitationOperation = async (operation) => {
  try {
    const logEntry = {
      id: crypto.randomUUID(),
      component: 'CreateInvitation',
      operation: operation.operation,
      details: operation.details,
      timestamp: operation.timestamp.toISOString(),
    };

    const existingLogs = JSON.parse(localStorage.getItem('invitationOperations') || '[]');
    const updatedLogs = [logEntry, ...existingLogs].slice(0, 1000); // Keep last 1000 entries
    localStorage.setItem('invitationOperations', JSON.stringify(updatedLogs));
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
const generateSecureInvitationId = async (identifier) => {
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
 * CRITICAL SECURITY: Browser-compatible secure token generation using Web Crypto API
 * @returns {Promise<string>} Secure invitation token
 */
const generateSecureToken = async () => {
  try {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const token = `inv_${Array.from(array, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")}`;
    
    // CRITICAL SECURITY: Clear sensitive data from memory
    array.fill(0);
    
    return token;
  } catch (error) {
    // Fallback to UUID-based token if crypto operations fail
    return `inv_${crypto.randomUUID().replace(/-/g, '')}`;
  }
};

/**
 * @typedef {Object} CreateInvitationRequest
 * @property {string} [personalMessage] - Personal message for invitation
 * @property {number} [courseCredits] - Course credits to award (1-5)
 * @property {string} [recipientInfo] - Recipient information
 * @property {number} [expirationDays] - Expiration days (1-30)
 */

/**
 * @typedef {Object} InvitationData
 * @property {string} personalMessage - Personal message
 * @property {string} recipientInfo - Recipient information
 * @property {string} inviterName - Inviter username
 * @property {string} createdAt - Creation timestamp
 */

/**
 * @typedef {Object} InvitationResponse
 * @property {boolean} success - Success status
 * @property {Object} invitation - Invitation details
 * @property {string} invitation.id - Invitation ID
 * @property {string} invitation.inviteToken - Invitation token
 * @property {string} invitation.invitationUrl - Invitation URL
 * @property {string} invitation.qrCodeUrl - QR code URL
 * @property {string} invitation.personalMessage - Personal message
 * @property {number} invitation.courseCredits - Course credits
 * @property {string} invitation.expiresAt - Expiration timestamp
 * @property {string} invitation.recipientInfo - Recipient information
 */

/**
 * @typedef {Object} ErrorResponse
 * @property {boolean} success - Success status (false)
 * @property {string} error - Error message
 * @property {Object} meta - Response metadata
 * @property {string} meta.timestamp - Response timestamp
 */

/**
 * CRITICAL SECURITY: Main Create Invitation handler with comprehensive error handling
 * @param {Object} req - Netlify request object
 * @param {Object} res - Netlify response object
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  const operationId = await generateSecureInvitationId('create_invitation');
  
  try {
    // CORS headers
    const headers = {
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    if (req.method !== "POST") {
      await logInvitationOperation({
        operation: "method_not_allowed",
        details: {
          operationId,
          method: req.method,
          allowedMethods: ["POST"],
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
      await logInvitationOperation({
        operation: "invitation_access_denied",
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

    // CRITICAL SECURITY: Validate request schema
    const requestSchema = z.object({
      personalMessage: z.string().max(500).optional(),
      courseCredits: z.number().min(1).max(5).optional(),
      recipientInfo: z.string().max(200).optional(),
      expirationDays: z.number().min(1).max(30).optional(),
    });

    const validationResult = requestSchema.safeParse(req.body);

    if (!validationResult.success) {
      await logInvitationOperation({
        operation: "invitation_validation_failed",
        details: {
          operationId,
          errors: validationResult.error.errors,
          userId: sessionData.userId,
        },
        timestamp: new Date(),
      });

      res.status(400).json({
        success: false,
        error: "Invalid invitation request data",
        details: validationResult.error.errors,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const {
      personalMessage = "Join me on Satnam.pub for Bitcoin education and sovereign identity!",
      courseCredits = 1,
      recipientInfo = "",
      expirationDays = 7,
    } = validationResult.data;

    // CRITICAL SECURITY: Log invitation creation attempt
    await logInvitationOperation({
      operation: "invitation_creation_started",
      details: {
        operationId,
        userId: sessionData.userId,
        userRole: sessionData.role,
        courseCredits,
        expirationDays,
        hasPersonalMessage: !!personalMessage,
        hasRecipientInfo: !!recipientInfo,
      },
      timestamp: new Date(),
    });

    // Get authenticated user details
    const user = await getUserFromRequest(req);
    if (!user) {
      await logInvitationOperation({
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

    // Validate user role directly with Master Context roles
    const userRole = user.role || 'private';
    const validRole = validateMasterContextRole(userRole)
      ? /** @type {"private"|"offspring"|"adult"|"steward"|"guardian"} */ (userRole)
      : "private";

    // Generate secure invitation token and ID
    const inviteToken = await generateSecureToken();
    const invitationId = await generateSecureInvitationId('invitation');

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    // Create invitation data with privacy protection
    const invitationData = {
      personalMessage,
      recipientInfo,
      inviterName: user.username || user.hashedUserId || user.userId,
      createdAt: new Date().toISOString(),
    };

    // CRITICAL SECURITY: Store invitation in database with RLS compliance
    const { data: invitation, error: insertError } = await supabase
      .from('peer_invitations')
      .insert({
        id: invitationId,
        invite_token: inviteToken,
        inviter_id: sessionData.userId,
        invitation_data: invitationData,
        course_credits: courseCredits,
        expires_at: expiresAt.toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      await logInvitationOperation({
        operation: "invitation_database_error",
        details: {
          operationId,
          error: insertError.message,
          userId: sessionData.userId,
        },
        timestamp: new Date(),
      });

      res.status(500).json({
        success: false,
        error: "Failed to create invitation",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Generate invitation URL and QR code URL
    const baseUrl = getEnvVar('SITE_URL') || 'https://satnam.pub';
    const invitationUrl = `${baseUrl}/invite/${inviteToken}`;
    const qrCodeUrl = `${baseUrl}/api/qr?data=${encodeURIComponent(invitationUrl)}`;

    const response = {
      success: true,
      invitation: {
        id: invitationId,
        inviteToken,
        invitationUrl,
        qrCodeUrl,
        personalMessage,
        courseCredits,
        expiresAt: expiresAt.toISOString(),
        recipientInfo,
      },
    };

    // CRITICAL SECURITY: Log successful invitation creation
    await logInvitationOperation({
      operation: "invitation_created",
      details: {
        operationId,
        invitationId,
        userId: sessionData.userId,
        userRole: validRole,
        courseCredits,
        expirationDays,
        hasPersonalMessage: !!personalMessage,
        hasRecipientInfo: !!recipientInfo,
      },
      timestamp: new Date(),
    });

    res.status(201).json(response);
  } catch (error) {
    // CRITICAL SECURITY: Privacy-first error logging
    await logInvitationOperation({
      operation: "invitation_creation_error",
      details: {
        operationId,
        error: error.message,
        userId: "unknown", // Use fallback since we don't have validated data in catch block
      },
      timestamp: new Date(),
    });

    res.status(500).json({
      success: false,
      error: "Internal server error during invitation creation",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}
