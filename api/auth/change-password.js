/**
 * Password Change API - NIP-05/Password users
 * POST /api/auth/change-password
 *
 * - Verifies current password (PBKDF2/SHA-512, 100k)
 * - Rotates password_salt (24 bytes, base64) and updates password_hash (hex)
 * - Preserves encrypted_nsec (independent of password; uses user_salt)
 * - Returns session + user payload similar to /api/auth/signin
 */

import * as crypto from 'node:crypto';
import { generateDUIDFromNIP05 } from '../../lib/security/duid-generator.js';
import { SecureSessionManager } from '../../netlify/functions/security/session-manager.js';
import { supabase } from '../../netlify/functions/supabase.js';
import { allowRequest } from '../../netlify/functions/utils/rate-limiter.js';

export default async function handler(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

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

  // Basic rate limiting per IP
  const ip = event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || event.headers['client-ip'] || 'unknown';
  if (!allowRequest(String(ip), 5, 60_000)) {
    return {
      statusCode: 429,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Too many requests. Please wait and try again.' }),
    };
  }

  // Parse body
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Invalid JSON' }) };
  }

  const nip05 = (body?.nip05 || '').trim().toLowerCase();
  const currentPassword = String(body?.currentPassword || '');
  const newPassword = String(body?.newPassword || '');

  if (!nip05 || !currentPassword || !newPassword) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Missing required fields' }) };
  }
  if (!/^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/.test(nip05)) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Invalid NIP-05 format' }) };
  }
  if (newPassword.length < 8) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'New password must be at least 8 characters' }) };
  }

  try {
    // Locate user by DUID
    const duid = await generateDUIDFromNIP05(nip05);
    const { data: users, error: selErr } = await supabase
      .from('user_identities')
      .select('*')
      .eq('id', duid)
      .eq('is_active', true)
      .limit(1);

    if (selErr || !users || users.length === 0) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Invalid credentials' }) };
    }

    const user = users[0];

    // Verify current password using same parameters as signin
    const verifyBuf = crypto.pbkdf2Sync(currentPassword, user.password_salt, 100000, 64, 'sha512');
    const verifyHex = verifyBuf.toString('hex');
    const verifyB64 = verifyBuf.toString('base64');
    if (user.password_hash !== verifyHex && user.password_hash !== verifyB64) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Current password is incorrect' }) };
    }

    // Rotate salt and compute new hash
    const newSalt = crypto.randomBytes(24).toString('base64');
    const newHashHex = crypto.pbkdf2Sync(newPassword, newSalt, 100000, 64, 'sha512').toString('hex');

    // Update in DB (store hex hash and base64 salt)
    const { error: updErr } = await supabase
      .from('user_identities')
      .update({ password_hash: newHashHex, password_salt: newSalt, password_updated_at: new Date().toISOString() })
      .eq('id', duid)
      .eq('is_active', true);

    if (updErr) {
      console.error('Password update error:', updErr);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Failed to update password' }) };
    }

    // Auto sign-in: create session like /api/auth/signin
    const userData = {
      npub: user.npub || '',
      nip05,
      federationRole: user.role || 'private',
      authMethod: /** @type {"nip05-password"} */ ('nip05-password'),
      isWhitelisted: true,
      votingPower: user.voting_power || 0,
      guardianApproved: false,
      stewardApproved: false,
      sessionToken: '',
    };

    const sessionToken = await SecureSessionManager.createSession(corsHeaders, userData);
    if (!sessionToken || typeof sessionToken !== 'string') {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Failed to create session' }) };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          user: {
            id: user.id,
            nip05,
            role: user.role || 'private',
            is_active: true,
            user_salt: user.user_salt || null,
            encrypted_nsec: user.encrypted_nsec || null,
            encrypted_nsec_iv: user.encrypted_nsec_iv || null,
          },
          authenticated: true,
          sessionToken,
        },
      }),
    };
  } catch (error) {
    console.error('Change-password error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Password change failed' }) };
  }
}

