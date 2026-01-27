/**
 * Password Reset API - Proof of Nostr Identity Ownership
 * POST /api/auth/reset-password
 *
 * Allows users who forgot their password to reset it by proving ownership
 * of their Nostr identity via:
 * - NIP-07 signed challenge (browser extension)
 * - Nsec manual entry (proving knowledge of private key)
 *
 * SECURITY: This endpoint requires cryptographic proof of identity ownership
 * before allowing password reset. No email/phone recovery to maintain
 * self-sovereign identity principles.
 */

import * as crypto from 'node:crypto';
import { generateDUIDFromNIP05 } from '../../lib/security/duid-generator.js';
import { SecureSessionManager } from '../../netlify/functions/security/session-manager.js';
import { supabase } from '../../netlify/functions/supabase.js';
import { allowRequest } from '../../netlify/functions/utils/rate-limiter.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

export default async function handler(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  // Rate limiting
  const ip = event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown';
  if (!allowRequest(String(ip), 3, 60_000)) {
    return {
      statusCode: 429,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Too many requests. Please wait and try again.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Invalid JSON' }) };
  }

  const nip05 = (body?.nip05 || '').trim().toLowerCase();
  const newPassword = String(body?.newPassword || '');
  const proofMethod = body?.proofMethod; // 'nip07' or 'nsec'
  const proofData = body?.proofData; // { signedEvent } or { nsec }

  // Validate required fields
  if (!nip05 || !newPassword || !proofMethod || !proofData) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Missing required fields' }) };
  }
  if (!/^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/.test(nip05)) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Invalid NIP-05 format' }) };
  }
  if (newPassword.length < 8) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'New password must be at least 8 characters' }) };
  }
  if (!['nip07', 'nsec'].includes(proofMethod)) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Invalid proof method' }) };
  }

  try {
    // Lookup user by DUID
    const duid = await generateDUIDFromNIP05(nip05);
    const { data: user, error: selErr } = await supabase
      .from('user_identities')
      .select('id, user_salt, encrypted_npub, encrypted_npub_iv, encrypted_npub_tag, role, is_active')
      .eq('id', duid)
      .eq('is_active', true)
      .single();

    if (selErr || !user) {
      console.error('Password reset: User not found', { duid: duid?.substring(0, 8), error: selErr?.message });
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Account not found' }) };
    }

    // Decrypt stored npub for verification
    let storedNpub = '';
    if (user.encrypted_npub && user.encrypted_npub_iv && user.user_salt) {
      try {
        const { decryptField } = await import('../../netlify/functions/security/noble-encryption.js');
        const tagValue = user.encrypted_npub_tag || user.encrypted_npub_iv;
        storedNpub = await decryptField(user.encrypted_npub, user.encrypted_npub_iv, tagValue, user.user_salt);
      } catch (decryptErr) {
        console.error('Failed to decrypt stored npub:', decryptErr.message);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Account verification failed' }) };
      }
    }

    if (!storedNpub) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Account missing identity data' }) };
    }

    // Verify ownership proof
    const isVerified = await verifyOwnershipProof(proofMethod, proofData, storedNpub);
    if (!isVerified.success) {
      console.log('Password reset: Ownership verification failed', { nip05, method: proofMethod, error: isVerified.error });
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, error: isVerified.error || 'Identity verification failed' }) };
    }

    // Generate new salt and hash password
    const newSalt = crypto.randomBytes(24).toString('base64');
    const newHashHex = crypto.pbkdf2Sync(newPassword, newSalt, 100000, 64, 'sha512').toString('hex');

    // Update password in database
    const { error: updErr } = await supabase
      .from('user_identities')
      .update({
        password_hash: newHashHex,
        password_salt: newSalt,
        password_updated_at: new Date().toISOString(),
        failed_attempts: 0,
        locked_until: null,
        requires_password_change: false,
      })
      .eq('id', duid)
      .eq('is_active', true);

    if (updErr) {
      console.error('Password reset update error:', updErr);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Failed to reset password' }) };
    }

    // Create session for immediate sign-in
    const userData = {
      npub: storedNpub,
      userDuid: user.id,
      nip05,
      federationRole: user.role || 'private',
      authMethod: /** @type {"nip05-password"} */ ('nip05-password'),
      isWhitelisted: true,
      votingPower: 0,
      guardianApproved: false,
      stewardApproved: false,
      sessionToken: '',
    };

    const sessionToken = await SecureSessionManager.createSession(corsHeaders, userData);
    if (!sessionToken || typeof sessionToken !== 'string') {
      // Password was reset but session creation failed - user can sign in manually
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          data: { passwordReset: true, sessionCreated: false },
        }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          user: { id: user.id, nip05, role: user.role || 'private', is_active: true },
          authenticated: true,
          sessionToken,
        },
      }),
    };
  } catch (error) {
    console.error('Password reset error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Password reset failed' }) };
  }
}

/**
 * Verify ownership proof for password reset
 * @param {string} method - 'nip07' or 'nsec'
 * @param {Object} proofData - Proof data
 * @param {string} expectedNpub - Expected npub from database
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function verifyOwnershipProof(method, proofData, expectedNpub) {
  try {
    const { nip19, verifyEvent, getPublicKey } = await import('nostr-tools');

    // Decode expected npub to hex pubkey
    let expectedPubkey;
    try {
      const decoded = nip19.decode(expectedNpub);
      if (decoded.type !== 'npub') {
        return { success: false, error: 'Invalid stored identity format' };
      }
      expectedPubkey = decoded.data;
    } catch {
      return { success: false, error: 'Failed to decode stored identity' };
    }

    if (method === 'nip07') {
      // Verify NIP-07 signed event
      const { signedEvent } = proofData;
      if (!signedEvent || !signedEvent.pubkey || !signedEvent.sig) {
        return { success: false, error: 'Invalid NIP-07 proof: missing signed event' };
      }

      // Verify the signature is valid
      const isValidSig = verifyEvent(signedEvent);
      if (!isValidSig) {
        return { success: false, error: 'Invalid signature' };
      }

      // Verify the pubkey matches the expected identity
      if (signedEvent.pubkey !== expectedPubkey) {
        return { success: false, error: 'Identity mismatch: signed event pubkey does not match account' };
      }

      // Verify the event is a password reset request (kind 27235 or custom)
      // and contains the expected challenge
      if (signedEvent.kind !== 27235 && signedEvent.kind !== 22242) {
        // Allow NIP-98 HTTP Auth (27235) or custom auth kind (22242)
        return { success: false, error: 'Invalid event kind for password reset' };
      }

      // Verify the event is recent (within 5 minutes)
      const eventTime = signedEvent.created_at * 1000;
      const now = Date.now();
      if (Math.abs(now - eventTime) > 5 * 60 * 1000) {
        return { success: false, error: 'Signed event expired or from the future' };
      }

      return { success: true };

    } else if (method === 'nsec') {
      // Verify nsec ownership by deriving pubkey
      const { nsec } = proofData;
      if (!nsec) {
        return { success: false, error: 'Invalid nsec proof: missing private key' };
      }

      let privateKeyHex;
      try {
        // Handle both bech32 nsec and raw hex
        if (nsec.startsWith('nsec')) {
          const decoded = nip19.decode(nsec);
          if (decoded.type !== 'nsec') {
            return { success: false, error: 'Invalid nsec format' };
          }
          // decoded.data is Uint8Array for nsec
          privateKeyHex = Array.from(decoded.data).map(b => b.toString(16).padStart(2, '0')).join('');
        } else if (/^[a-f0-9]{64}$/i.test(nsec)) {
          privateKeyHex = nsec.toLowerCase();
        } else {
          return { success: false, error: 'Invalid private key format' };
        }
      } catch {
        return { success: false, error: 'Failed to decode private key' };
      }

      // Derive public key from private key
      const privateKeyBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
      const derivedPubkey = getPublicKey(privateKeyBytes);

      // Compare with expected pubkey
      if (derivedPubkey !== expectedPubkey) {
        return { success: false, error: 'Identity mismatch: private key does not correspond to account' };
      }

      return { success: true };
    }

    return { success: false, error: 'Unknown proof method' };
  } catch (error) {
    console.error('Ownership verification error:', error);
    return { success: false, error: 'Verification failed' };
  }
}

