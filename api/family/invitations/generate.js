/**
 * Family Federation Invitation Generation API
 * POST /api/family/invitations/generate
 * 
 * Generates invitation tokens for family federation members.
 * Supports role-specific invitations with optional NIP-17 DM targeting.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * ✅ JavaScript API route per browser-only serverless architecture
 * ✅ JWT authentication via SecureSessionManager
 * ✅ Privacy-first with zero-knowledge patterns
 * ✅ 7-day default expiration per approved architectural decisions
 */

import { supabaseAdmin } from '../../../netlify/functions/supabase.js';

/**
 * Generate URL-safe invitation token
 * @returns {string} Secure invitation token
 */
function generateInvitationToken() {
  // Generate 16 random bytes and convert to URL-safe base64
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const base64 = btoa(String.fromCharCode(...bytes));
  // Make URL-safe: replace +/= with URL-safe alternatives
  return 'inv_' + base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Validate invited role against Master Context hierarchy
 * @param {string} role - Role to validate
 * @returns {boolean} True if valid
 */
function isValidRole(role) {
  return ['guardian', 'steward', 'adult', 'offspring'].includes(role);
}

/**
 * Get role-specific guide URL
 * @param {string} role - Invited role
 * @returns {string} Guide URL
 */
function getRoleGuideUrl(role) {
  const guides = {
    guardian: '/docs/guardian-onboarding-guide',
    steward: '/docs/steward-onboarding-guide',
    adult: '/docs/adult-onboarding-guide',
    offspring: '/docs/offspring-onboarding-guide'
  };
  return guides[role] || '/docs/member-onboarding-guide';
}

/**
 * Encrypt invitee npub for privacy-first storage
 * Uses SHA-256 hash of npub (one-way, for verification only)
 * PRIVACY-FIRST: Never store cleartext npub in database
 * @param {string} npub - Nostr public key (npub1...)
 * @returns {Promise<string>} Hex-encoded hash of npub
 */
async function encryptInviteeNpub(npub) {
  const encoder = new TextEncoder();
  const data = encoder.encode(npub);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate safeword hash using SHA-256 with salt
 * Uses Web Crypto API for browser-compatible cryptography
 * @param {string} safeword - Plain text safeword
 * @returns {Promise<{hash: string, salt: string}>} Hex-encoded hash and salt
 */
async function hashSafeword(safeword) {
  // Generate 32-byte random salt
  const saltBytes = new Uint8Array(32);
  crypto.getRandomValues(saltBytes);
  const salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  // Compute SHA-256(salt || safeword)
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + safeword);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return { hash, salt };
}

/**
 * Main handler
 */
export default async function handler(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Allow': 'POST' },
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    const requestData = JSON.parse(event.body || '{}');

    // Authenticate via JWT
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Authentication required' })
      };
    }

    let userId;
    try {
      const { SecureSessionManager } = await import('../../../netlify/functions/security/session-manager.js');
      const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
      if (!session?.userId) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, error: 'Invalid or expired token' })
        };
      }
      userId = session.userId;
    } catch {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Authentication failed' })
      };
    }

    // Validate required fields
    const {
      federation_duid,
      invited_role,
      personal_message,
      invitee_npub,       // Optional: will be encrypted before storage
      invitee_nip05,
      safeword,           // Optional safeword for verbal out-of-band verification
      requireSafeword     // Boolean flag, defaults to true for new invitations
    } = requestData;

    if (!federation_duid) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'federation_duid is required' })
      };
    }

    if (!invited_role || !isValidRole(invited_role)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'invited_role must be one of: guardian, steward, adult, offspring'
        })
      };
    }

    // Safeword validation: if requireSafeword is not explicitly false, safeword is required
    const isSafewordRequired = requireSafeword !== false;
    if (isSafewordRequired && (!safeword || typeof safeword !== 'string' || safeword.length < 8)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Safeword is required and must be at least 8 characters. Set requireSafeword: false to disable.'
        })
      };
    }

    // Verify federation exists and user is the founder
    const { data: federation, error: fedError } = await supabaseAdmin
      .from('family_federations')
      .select('id, federation_duid, federation_name, founder_user_duid')
      .eq('federation_duid', federation_duid)
      .single();

    if (fedError || !federation) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Federation not found' })
      };
    }

    if (federation.founder_user_duid !== userId) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Only federation founders can generate invitations' })
      };
    }

    // Generate invitation token
    const token = generateInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Hash safeword if provided (never log plaintext safeword)
    let safewordHash = null;
    let safewordSalt = null;
    if (isSafewordRequired && safeword) {
      const { hash, salt } = await hashSafeword(safeword);
      safewordHash = hash;
      safewordSalt = salt;
    }

    // PRIVACY-FIRST: Encrypt invitee npub before storage (if provided)
    // Never store cleartext npub in database
    let encryptedInviteeNpub = null;
    if (invitee_npub) {
      encryptedInviteeNpub = await encryptInviteeNpub(invitee_npub);
    }

    const { data: invitation, error: insertError } = await supabaseAdmin
      .from('family_federation_invitations')
      .insert({
        federation_id: federation.id,
        federation_duid: federation_duid,
        invitation_token: token,
        inviter_user_duid: userId,
        invited_role: invited_role,
        personal_message: personal_message || null,
        encrypted_invitee_npub: encryptedInviteeNpub,
        invitee_nip05: invitee_nip05 || null,
        expires_at: expiresAt.toISOString(),
        // Safeword security fields
        safeword_hash: safewordHash,
        safeword_salt: safewordSalt,
        require_safeword: isSafewordRequired,
        safeword_attempts: 0,
        safeword_locked_until: null,
        metadata: {
          federation_name: federation.federation_name,
          role_guide_url: getRoleGuideUrl(invited_role),
          created_by_role: 'guardian'
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('Invitation insert error:', insertError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Failed to create invitation' })
      };
    }

    // Build invitation URL
    const baseUrl = process.env.VITE_APP_DOMAIN || 'https://satnam.pub';
    const invitationUrl = `${baseUrl}/invite/${token}`;

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        invitation: {
          id: invitation.id,
          token: token,
          url: invitationUrl,
          expires_at: expiresAt.toISOString(),
          role: invited_role,
          federation_name: federation.federation_name,
          role_guide_url: getRoleGuideUrl(invited_role),
          targeted: !!invitee_npub,
          require_safeword: isSafewordRequired
        },
        // Include safeword reminder for founder (so they can share it verbally)
        // Note: We return the safeword here ONCE so the founder can note it down
        // It is NOT stored anywhere after this response - zero-knowledge pattern
        safeword_reminder: isSafewordRequired ? {
          message: 'Share this passphrase with your invitee through a separate secure channel (phone call, in-person)',
          safeword: safeword
        } : null
      })
    };

  } catch (error) {
    console.error('Invitation generation error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        meta: { timestamp: new Date().toISOString() }
      })
    };
  }
}

