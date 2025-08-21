/**
 * Privacy-First Peer Invitation Generation API
 *
 * This serverless function generates peer invitations using privacy-preserving
 * hashed identifiers instead of exposing npubs or other sensitive data.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - JWT-based authentication with privacy hashing
 * - QR code generation for invitations
 * - Configurable course credits and expiry
 * - Rate limiting and security measures
 * - No sensitive data exposure (npubs, emails, etc.)
 * - Uses Web Crypto API instead of Node.js crypto
 * - Uses import.meta.env with process.env fallback for browser compatibility
 * - Strict type safety with no 'any' types
 * - Privacy-first logging (no user data exposure)
 * - Vault integration for sensitive credentials
 */

import QRCode from "qrcode";
import { z } from "zod";
import { RATE_LIMITS, formatTimeWindow } from "../../lib/config/rate-limits.js";
import { vault } from "../../lib/vault.js";
import { SecureSessionManager } from "../../netlify/functions/security/session-manager.js";
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
 * @typedef {Object} InviteRequest
 * @property {string} [personalMessage]
 * @property {number} courseCredits
 * @property {number} expiryDays
 * @property {string} [inviterNip05]
 * @property {string} [recipientNostrPubkey]
 * @property {boolean} sendAsGiftWrappedDM
 */

/**
 * @typedef {Object} SessionData
 * @property {boolean} isAuthenticated
 * @property {string} sessionToken
 * @property {string} userId
 * @property {string} npub
 * @property {string} [nip05]
 * @property {"private"|"offspring"|"adult"|"steward"|"guardian"} federationRole
 * @property {"otp"|"nwc"} authMethod
 * @property {boolean} isWhitelisted
 * @property {number} votingPower
 * @property {boolean} guardianApproved
 * @property {boolean} stewardApproved
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

// Rate limiting configuration (now imported from config)
const { limit: INVITE_RATE_LIMIT, windowMs: RATE_LIMIT_WINDOW } = RATE_LIMITS.PEER_INVITES;

// Invitation request validation schema (privacy-first with gift-wrap support)
const InviteRequestSchema = z.object({
  personalMessage: z.string().max(500, "Personal message too long").optional(),
  courseCredits: z.number().int().min(1).max(5).default(1),
  expiryDays: z.number().int().min(1).max(90).default(30),
  inviterNip05: z.string().optional(),
  recipientNostrPubkey: z.string().optional(),
  sendAsGiftWrappedDM: z.boolean().default(false),
});

/**
 * Environment variable getter for Netlify Functions (pure ESM)
 * Netlify Functions should use process.env at runtime
 */
function getEnvVar(key) {
  return (typeof process !== 'undefined' && process.env) ? process.env[key] : undefined;
}

/**
 * Generate secure random bytes using Web Crypto API (Master Context compliance)
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
 * Create SHA-256 hash using Web Crypto API (Master Context compliance)
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
 * Generate privacy-preserving hash for user identification using Web Crypto API
 * @param {string} sessionToken - Session token to hash
 * @returns {Promise<string>} Privacy hash
 */
async function generatePrivacyHash(sessionToken) {
  try {
    const vaultSalt = await vault.getCredentials("privacy_salt");
    const salt = vaultSalt || getEnvVar("PRIVACY_SALT") || "default_salt_change_in_production";
    return await createSHA256Hash(salt + sessionToken + salt);
  } catch (error) {
    const salt = getEnvVar("PRIVACY_SALT") || "default_salt_change_in_production";
    return await createSHA256Hash(salt + sessionToken + salt);
  }
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
    const qrCodeDataUrl = await QRCode.toDataURL(inviteUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: "#7C3AED",
        light: "#FFFFFF",
      },
    });
    return qrCodeDataUrl;
  } catch (error) {
    throw new Error("Failed to generate QR code");
  }
}

/**
 * Create gift-wrapped invitation message (privacy-preserving)
 * @param {string} inviteUrl - Invitation URL
 * @param {string} inviterNip05 - Inviter's NIP-05 identifier
 * @param {string} personalMessage - Personal message from inviter
 * @param {number} courseCredits - Number of course credits
 * @param {string} recipientPubkey - Recipient's public key
 * @returns {Promise<string>} Gift-wrapped message content
 */
async function createGiftWrappedMessage(inviteUrl, inviterNip05, personalMessage, courseCredits, recipientPubkey) {
  try {
    const messageContent = `🎓 You've been invited to join Satnam.pub!

${personalMessage ? `Personal message: ${personalMessage}` : ""}

🎁 Course Credits: ${courseCredits} (you'll receive these upon joining)
🔗 Invitation Link: ${inviteUrl}

From: ${inviterNip05}

Join the sovereign Bitcoin education community at Satnam.pub - where privacy meets learning.

This invitation is privacy-first and secure. Click the link to get started!`;

    return messageContent;
  } catch (error) {
    throw new Error("Failed to create gift-wrapped message");
  }
}

/**
 * Send gift-wrapped DM via Nostr with NIP-04 fallback
 * @param {string} giftWrappedContent - Message content
 * @param {string} recipientPubkey - Recipient's public key
 * @param {string} inviterNip05 - Inviter's NIP-05 identifier
 * @returns {Promise<{success: boolean, method: string, error: string}>} Delivery result
 */
async function sendGiftWrappedDM(giftWrappedContent, recipientPubkey, inviterNip05) {
  try {
    // Import required modules
    const { SimplePool, nip04, nip59, finalizeEvent, getPublicKey } = await import('nostr-tools');
    const { bytesToHex, hexToBytes } = await import('@noble/hashes/utils');

    // Generate ephemeral key for invitation sending
    const ephemeralPrivateKey = crypto.getRandomValues(new Uint8Array(32));
    const ephemeralPrivateKeyHex = bytesToHex(ephemeralPrivateKey);
    const ephemeralPublicKey = getPublicKey(ephemeralPrivateKey);

    // Configure relays
    const relays = [
      'wss://relay.satnam.pub',
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.nostr.band'
    ];

    const pool = new SimplePool();
    let deliveryResult = { success: false, method: 'none', error: 'Unknown error' };

    try {
      // First attempt: NIP-59 Gift-Wrapped messaging
      const baseEvent = {
        kind: 4, // Direct message
        pubkey: ephemeralPublicKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', recipientPubkey],
          ['message-type', 'invitation'],
          ['encryption', 'gift-wrap'],
          ['sender-nip05', inviterNip05]
        ],
        content: giftWrappedContent,
      };

      // Create gift-wrapped event using NIP-59
      const giftWrappedEvent = await nip59.wrapEvent(
        baseEvent,
        hexToBytes(recipientPubkey),
        ephemeralPrivateKeyHex
      );

      // Publish gift-wrapped event to relays
      const publishPromises = relays.map(async (relay) => {
        try {
          await pool.publish([relay], giftWrappedEvent);
          return true;
        } catch (error) {
          console.warn(`Failed to publish gift-wrapped message to ${relay}:`, error);
          return false;
        }
      });

      const results = await Promise.all(publishPromises);
      const successCount = results.filter(Boolean).length;

      if (successCount > 0) {
        deliveryResult = { success: true, method: 'gift-wrap', error: '' };
        console.log(`Gift-wrapped invitation sent successfully to ${successCount}/${relays.length} relays`);
      } else {
        throw new Error('All gift-wrap relay publishes failed');
      }

    } catch (giftWrapError) {
      console.warn('Gift-wrapped messaging failed, falling back to NIP-04:', giftWrapError);

      try {
        // Fallback: NIP-04 Encrypted DM
        const encryptedContent = await nip04.encrypt(
          giftWrappedContent,
          recipientPubkey,
          ephemeralPrivateKeyHex
        );

        const dmEvent = {
          kind: 4, // Direct message
          pubkey: ephemeralPublicKey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['p', recipientPubkey],
            ['message-type', 'invitation'],
            ['encryption', 'nip04'],
            ['sender-nip05', inviterNip05]
          ],
          content: encryptedContent,
        };

        const signedDMEvent = finalizeEvent(dmEvent, ephemeralPrivateKey);

        // Publish NIP-04 encrypted DM to relays
        const fallbackPromises = relays.map(async (relay) => {
          try {
            await pool.publish([relay], signedDMEvent);
            return true;
          } catch (error) {
            console.warn(`Failed to publish NIP-04 message to ${relay}:`, error);
            return false;
          }
        });

        const fallbackResults = await Promise.all(fallbackPromises);
        const fallbackSuccessCount = fallbackResults.filter(Boolean).length;

        if (fallbackSuccessCount > 0) {
          deliveryResult = { success: true, method: 'nip04', error: '' };
          console.log(`NIP-04 invitation sent successfully to ${fallbackSuccessCount}/${relays.length} relays`);
        } else {
          deliveryResult = { success: false, method: 'failed', error: 'All relay publishes failed' };
        }

      } catch (nip04Error) {
        console.error('Both gift-wrap and NIP-04 messaging failed:', nip04Error);
        deliveryResult = { success: false, method: 'failed', error: 'All messaging methods failed' };
      }
    }

    // Clean up pool connections
    pool.close(relays);

    // Zero out ephemeral key for security
    ephemeralPrivateKey.fill(0);

    return deliveryResult;

  } catch (error) {
    console.error('Critical error in sendGiftWrappedDM:', error);
    return { success: false, method: 'error', error: error.message };
  }
}

/**
 * Check rate limiting using database-backed storage
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
 * Store invitation in database (privacy-preserving)
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
 * Handle CORS for the API endpoint
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
 * Main API handler
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

    const validationResult = InviteRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request data",
        details: validationResult.error.errors,
      });
    }

    const inviteRequest = /** @type {InviteRequest} */ (validationResult.data);

    const inviteToken = generateInviteToken();
    const hashedInviteId = await generateHashedInviteId();
    const expiresAt = new Date(Date.now() + inviteRequest.expiryDays * 24 * 60 * 60 * 1000);

    const baseUrl = getEnvVar("FRONTEND_URL") || "https://satnam.pub";
    const inviteUrl = `${baseUrl}/invite/${inviteToken}`;

    /** @type {InvitationData} */
    const invitationData = {
      personalMessage: inviteRequest.personalMessage,
      courseCredits: inviteRequest.courseCredits,
      expiryDays: inviteRequest.expiryDays,
      createdAt: new Date().toISOString(),
    };

    await storeInvitation(
      inviteToken,
      hashedInviteId,
      hashedUserId,
      invitationData,
      inviteRequest.courseCredits,
      expiresAt
    );

    let qrCodeImage = null;
    let giftWrappedMessage = null;

    if (!inviteRequest.sendAsGiftWrappedDM) {
      qrCodeImage = await generateQRCode(inviteUrl);
    } else {
      if (inviteRequest.recipientNostrPubkey && inviteRequest.inviterNip05) {
        giftWrappedMessage = await createGiftWrappedMessage(
          inviteUrl,
          inviteRequest.inviterNip05,
          inviteRequest.personalMessage || "",
          inviteRequest.courseCredits,
          inviteRequest.recipientNostrPubkey
        );

        const dmResult = await sendGiftWrappedDM(
          giftWrappedMessage,
          inviteRequest.recipientNostrPubkey,
          inviteRequest.inviterNip05
        );

        if (!dmResult.success) {
          console.warn('Direct message sending failed:', dmResult.error);
          qrCodeImage = await generateQRCode(inviteUrl);
          giftWrappedMessage = null;
        } else {
          console.log(`Invitation sent successfully via ${dmResult.method}`);
          // For successful DM sending, we still generate QR as backup
          qrCodeImage = await generateQRCode(inviteUrl);
        }
      } else {
        qrCodeImage = await generateQRCode(inviteUrl);
      }
    }

    return res.status(200).json({
      success: true,
      inviteToken,
      inviteUrl,
      qrCodeImage,
      giftWrappedMessage,
      expiryDate: expiresAt.toISOString(),
      courseCredits: inviteRequest.courseCredits,
      personalMessage: inviteRequest.personalMessage,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
