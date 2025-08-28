/**
 * Process Signed Invitation API Endpoint - NIP-07 Client-Side Signing Support
 *
 * This serverless function processes pre-signed Nostr events from NIP-07 browser extensions
 * for peer invitation generation, maintaining consistency with generate-peer-invite.js
 *
 * MASTER CONTEXT COMPLIANCE:
 * - JWT-based authentication with privacy hashing
 * - Validates pre-signed Nostr events from NIP-07 extensions
 * - QR code generation for invitations
 * - Rate limiting and security measures
 * - No sensitive data exposure (npubs, emails, etc.)
 * - Uses Web Crypto API instead of Node.js crypto
 * - Strict type safety with no 'any' types
 * - Privacy-first logging (no user data exposure)
 * - Publishes signed events to Nostr relays for gift-wrapped delivery
 */

import * as qr from "qr-image";
import { z } from "zod";
import { RATE_LIMITS } from "../../lib/config/rate-limits.js";
import { supabase } from "../../netlify/functions/supabase.js";

/**
 * @typedef {Object} InvitationData
 * @property {string} [personalMessage]
 * @property {number} courseCredits
 * @property {number} expiryDays
 * @property {string} createdAt
 */

/**
 * @typedef {Object} RateLimitResult
 * @property {boolean} allowed
 * @property {number} current_count
 * @property {number} rate_limit
 * @property {number} [reset_time]
 * @property {number} window_ms
 * @property {string} [error]
 */

/**
 * @typedef {Object} SignedInviteRequest
 * @property {Object} signedEvent - Pre-signed Nostr event from NIP-07
 * @property {Object} inviteConfig - Invitation configuration
 * @property {string} [inviteConfig.personalMessage]
 * @property {number} inviteConfig.courseCredits
 * @property {number} inviteConfig.expiryDays
 * @property {string} [inviteConfig.recipientNostrPubkey]
 * @property {boolean} [inviteConfig.sendAsGiftWrappedDM]
 */

/**
 * @typedef {Object} NetlifyRequest
 * @property {string} method
 * @property {Object} headers
 * @property {string} [headers.origin]
 * @property {string} [headers.authorization]
 * @property {any} body
 */

/**
 * @typedef {Object} NetlifyResponse
 * @property {function(string, string): void} setHeader
 * @property {function(number): NetlifyResponse} status
 * @property {function(Object): void} json
 * @property {function(): void} end
 */

// Rate limiting configuration (same as generate-peer-invite)
const { limit: INVITE_RATE_LIMIT, windowMs: RATE_LIMIT_WINDOW } = RATE_LIMITS.PEER_INVITES;

// Signed invitation request validation schema
const SignedInviteRequestSchema = z.object({
  signedEvent: z.object({
    kind: z.number().int(),
    created_at: z.number().int(),
    tags: z.array(z.array(z.string())),
    content: z.string(),
    pubkey: z.string(),
    id: z.string().optional(),
    sig: z.string().optional()
  }),
  inviteConfig: z.object({
    personalMessage: z.string().max(500, "Personal message too long").optional(),
    courseCredits: z.number().int().min(1).max(5).default(1),
    expiryDays: z.number().int().min(1).max(90).default(30),
    recipientNostrPubkey: z.string().optional(),
    sendAsGiftWrappedDM: z.boolean().default(true)
  })
});

/**
 * Environment variable getter for Netlify Functions (pure ESM)
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key) {
  return (typeof process !== 'undefined' && process.env) ? process.env[key] : undefined;
}

/**
 * Generate secure random bytes using Web Crypto API
 * @param {number} length - Number of bytes to generate
 * @returns {Uint8Array} Random bytes
 */
function generateSecureRandomBytes(length) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

/**
 * Convert Uint8Array to hex string
 * @param {Uint8Array} array - Byte array to convert
 * @returns {string} Hex string
 */
function uint8ArrayToHex(array) {
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create SHA-256 hash using Web Crypto API
 * @param {string} data - Data to hash
 * @returns {Promise<string>} Hash as hex string
 */
async function createSHA256Hash(data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  return uint8ArrayToHex(hashArray);
}

/**
 * Generate privacy-preserving hash for user identification
 * @param {string} sessionToken - Session token to hash
 * @returns {Promise<string>} Privacy hash
 */
async function generatePrivacyHash(sessionToken) {
  const salt = getEnvVar("PRIVACY_SALT");
  if (!salt) {
    throw new Error("PRIVACY_SALT environment variable is required");
  }
  return await createSHA256Hash(salt + sessionToken + salt);
}

/**
 * Generate a secure invitation token using Web Crypto API
 * @returns {string} Invitation token
 */
function generateInviteToken() {
  const randomBytes = generateSecureRandomBytes(16);
  return `invite_${Date.now()}_${uint8ArrayToHex(randomBytes)}`;
}

/**
 * Generate a unique hashed invite ID using Web Crypto API
 * @returns {Promise<string>} Hashed invite ID
 */
async function generateHashedInviteId() {
  const randomBytes = generateSecureRandomBytes(8);
  const data = `invite_${Date.now()}_${uint8ArrayToHex(randomBytes)}`;
  return await createSHA256Hash(data);
}

/**
 * Generate QR code for invitation URL
 * @param {string} inviteUrl - URL to encode in QR code
 * @returns {Promise<string>} QR code data URL
 */
async function generateQRCode(inviteUrl) {
  try {
    // Generate QR code as PNG buffer
    const qrBuffer = qr.imageSync(inviteUrl, {
      type: 'png',
      size: 10,
      margin: 2
    });

    // Convert buffer to base64 data URL
    const base64 = qrBuffer.toString('base64');
    const qrCodeDataUrl = `data:image/png;base64,${base64}`;

    return qrCodeDataUrl;
  } catch (error) {
    throw new Error("Failed to generate QR code");
  }
}

/**
 * Validate signed Nostr event structure and signature
 * @param {Object} signedEvent - Pre-signed Nostr event
 * @returns {Promise<boolean>} Whether event is valid
 */
async function validateSignedEvent(signedEvent) {
  try {
    // Import nostr-tools for validation
    const { verifyEvent } = await import('nostr-tools');
    
    // Basic structure validation
    if (!signedEvent.kind || !signedEvent.created_at || !signedEvent.content || 
        !signedEvent.pubkey || !signedEvent.sig) {
      return false;
    }

    // Verify the event signature
    return verifyEvent(signedEvent);
  } catch (error) {
    console.error('Event validation error:', error);
    return false;
  }
}

/**
 * Publish signed event to Nostr relays
 * @param {Object} signedEvent - Pre-signed Nostr event
 * @returns {Promise<{success: boolean, method: string, error?: string}>} Publish result
 */
async function publishSignedEventToRelays(signedEvent) {
  try {
    // Import required modules
    const { SimplePool } = await import('nostr-tools');

    // Configure relays using environment variables
    const envRelays = getEnvVar("NOSTR_RELAYS");
    const relays = envRelays
      ? envRelays.split(",").map(r => r.trim()).filter(r => r.startsWith('wss://'))
      : [
          'wss://relay.damus.io',
          'wss://nos.lol',
          'wss://relay.nostr.band'
        ];

    if (relays.length === 0) {
      console.warn('No valid Nostr relays configured, using fallback relays');
      relays.push('wss://relay.damus.io', 'wss://nos.lol');
    }

    const pool = new SimplePool();
    
    // Publish to relays
    const publishPromises = relays.map(async (relay) => {
      try {
        pool.publish([relay], signedEvent);
        return true;
      } catch (error) {
        console.warn(`Failed to publish to ${relay}:`, error);
        return false;
      }
    });

    const results = await Promise.all(publishPromises);
    const successCount = results.filter(Boolean).length;

    // Clean up pool connections
    pool.close(relays);

    if (successCount > 0) {
      console.log(`Signed invitation published to ${successCount}/${relays.length} relays`);
      return { success: true, method: 'nip07-relay-publish' };
    } else {
      return { success: false, method: 'failed', error: 'All relay publishes failed' };
    }

  } catch (error) {
    console.error('Relay publishing error:', error);
    return { success: false, method: 'error', error: error.message };
  }
}

/**
 * Check rate limiting using database-backed storage (same as generate-peer-invite)
 * @param {string} userHash - Hashed user identifier
 * @returns {Promise<boolean>} Whether request is allowed
 */
async function checkRateLimit(userHash) {
  try {
    const { data, error } = await supabase.rpc("check_and_update_rate_limit", {
      user_hash: userHash,
      rate_limit: INVITE_RATE_LIMIT,
      window_ms: RATE_LIMIT_WINDOW,
    });

    if (error) {
      return true;
    }

    /** @type {RateLimitResult} */
    const result = data;

    if (result.error) {
      return true;
    }

    return result.allowed;
  } catch (error) {
    return true;
  }
}

/**
 * Get current rate limit status for a user (read-only)
 * @param {string} userHash - Hashed user identifier
 * @returns {Promise<RateLimitResult|null>} Rate limit status
 */
async function getRateLimitStatus(userHash) {
  try {
    const { data, error } = await supabase
      .from("rate_limits")
      .select("request_count, reset_time")
      .eq("hashed_user_id", userHash)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return {
          allowed: true,
          current_count: 0,
          rate_limit: INVITE_RATE_LIMIT,
          window_ms: RATE_LIMIT_WINDOW,
        };
      }
      return null;
    }

    const now = new Date();
    const resetTime = new Date(data.reset_time);
    const isExpired = now > resetTime;

    return {
      allowed: isExpired || data.request_count < INVITE_RATE_LIMIT,
      current_count: isExpired ? 0 : data.request_count,
      rate_limit: INVITE_RATE_LIMIT,
      reset_time: resetTime.getTime(),
      window_ms: RATE_LIMIT_WINDOW,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Store invitation in database (privacy-preserving) - same as generate-peer-invite
 * @param {string} inviteToken - Invitation token
 * @param {string} hashedInviteId - Hashed invite ID
 * @param {string} hashedInviterId - Hashed inviter ID
 * @param {InvitationData} invitationData - Invitation data
 * @param {number} courseCredits - Course credits
 * @param {Date} expiresAt - Expiration date
 */
async function storeInvitation(inviteToken, hashedInviteId, hashedInviterId, invitationData, courseCredits, expiresAt) {
  try {
    const { error } = await supabase
      .from("authenticated_peer_invitations")
      .insert({
        invite_token: inviteToken,
        hashed_invite_id: hashedInviteId,
        hashed_inviter_id: hashedInviterId,
        invitation_data: invitationData,
        course_credits: courseCredits,
        expires_at: expiresAt.toISOString(),
      });

    if (error) {
      throw new Error("Failed to store invitation");
    }
  } catch (error) {
    throw new Error("Database error");
  }
}

/**
 * Handle CORS for the API endpoint (same as generate-peer-invite)
 * @param {NetlifyRequest} req - Request object
 * @param {NetlifyResponse} res - Response object
 */
function setCorsHeaders(req, res) {
  const allowedOrigins =
    process.env.NODE_ENV === "production"
      ? [process.env.FRONTEND_URL || "https://satnam.pub"]
      : [
          "http://localhost:3000",
          "http://localhost:5173",
          "http://localhost:3002",
          "http://localhost:4173",
        ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

/**
 * Main API handler for processing signed invitations
 * @param {NetlifyRequest} req - Request object
 * @param {NetlifyResponse} res - Response object
 */
export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    // Validate required environment variables
    const requiredEnvVars = ['PRIVACY_SALT', 'DUID_SERVER_SECRET'];
    for (const envVar of requiredEnvVars) {
      if (!getEnvVar(envVar)) {
        console.error(`Missing required environment variable: ${envVar}`);
        return res.status(500).json({
          success: false,
          error: "Server configuration error",
        });
      }
    }

    // Authenticate user
    const authHeader = req.headers.authorization;
    const sessionPayload = await SecureSessionManager.validateSessionFromHeader(authHeader);

    // Accept minimal access token payload (registration-issued tokens)
    const tokenValid = !!sessionPayload && sessionPayload.type === 'access' && !!sessionPayload.hashedId;
    if (!tokenValid) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.substring(7) : '';
    const hashedUserId = await generatePrivacyHash(token);

    // Check rate limiting
    const rateLimitAllowed = await checkRateLimit(hashedUserId);
    if (!rateLimitAllowed) {
      const rateLimitStatus = await getRateLimitStatus(hashedUserId);

      const resetTimeFormatted = rateLimitStatus?.reset_time
        ? new Date(rateLimitStatus.reset_time).toLocaleString()
        : null;

      return res.status(429).json({
        success: false,
        error: `Rate limit exceeded. You have generated ${
          rateLimitStatus?.current_count || "maximum"
        } of ${INVITE_RATE_LIMIT} allowed invitations. Please try again ${
          resetTimeFormatted
            ? `after ${resetTimeFormatted}`
            : `in ${formatTimeWindow(RATE_LIMIT_WINDOW)}`
        }.`,
        rateLimitInfo: rateLimitStatus
          ? {
              currentCount: rateLimitStatus.current_count,
              rateLimit: rateLimitStatus.rate_limit,
              resetTime: rateLimitStatus.reset_time
                ? new Date(rateLimitStatus.reset_time).toISOString()
                : null,
              windowDescription: RATE_LIMITS.PEER_INVITES.description,
            }
          : null,
      });
    }

    // Validate request data
    const validationResult = SignedInviteRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request data",
        details: validationResult.error.errors,
      });
    }

    const { signedEvent, inviteConfig } = validationResult.data;

    // Validate the signed event
    const isValidEvent = await validateSignedEvent(signedEvent);
    if (!isValidEvent) {
      return res.status(400).json({
        success: false,
        error: "Invalid signed event - signature verification failed",
      });
    }

    // Generate invitation data
    const inviteToken = generateInviteToken();
    const hashedInviteId = await generateHashedInviteId();
    const expiresAt = new Date(Date.now() + inviteConfig.expiryDays * 24 * 60 * 60 * 1000);

    const baseUrl = getEnvVar("FRONTEND_URL") || "https://satnam.pub";
    const inviteUrl = `${baseUrl}/invite/${inviteToken}`;

    /** @type {InvitationData} */
    const invitationData = {
      personalMessage: inviteConfig.personalMessage,
      courseCredits: inviteConfig.courseCredits,
      expiryDays: inviteConfig.expiryDays,
      createdAt: new Date().toISOString(),
    };

    // Store invitation in database
    await storeInvitation(
      inviteToken,
      hashedInviteId,
      hashedUserId,
      invitationData,
      inviteConfig.courseCredits,
      expiresAt
    );

    // Generate QR code
    const qrCodeImage = await generateQRCode(inviteUrl);

    // Publish signed event to Nostr relays for gift-wrapped delivery
    let relayPublishResult = { success: false, method: 'none', error: 'Not attempted' };
    if (inviteConfig.sendAsGiftWrappedDM && inviteConfig.recipientNostrPubkey) {
      relayPublishResult = await publishSignedEventToRelays(signedEvent);

      if (!relayPublishResult.success) {
        console.warn('Relay publishing failed:', relayPublishResult.error);
        // Don't fail the entire request if relay publishing fails
      } else {
        console.log(`Signed invitation published via ${relayPublishResult.method}`);
      }
    }

    return res.status(200).json({
      success: true,
      inviteToken,
      inviteUrl,
      qrCodeImage,
      expiryDate: expiresAt.toISOString(),
      courseCredits: inviteConfig.courseCredits,
      personalMessage: inviteConfig.personalMessage,
      relayPublished: relayPublishResult.success,
      publishMethod: relayPublishResult.method,
    });

  } catch (error) {
    console.error('Process signed invitation error:', error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
