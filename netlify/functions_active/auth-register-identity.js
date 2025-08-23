// Consolidated Netlify Function: /api/auth/register-identity
// Self-contained registration handler with privacy-first hashing and DUID enforcement

import * as crypto from 'node:crypto';
import { promisify } from 'node:util';

function buildCors(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigin = isProd ? (process.env.FRONTEND_URL || 'https://www.satnam.pub') : (origin || '*');
  const allowCreds = allowedOrigin !== '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': String(allowCreds),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };
}

function validateRole(role) {
  const valid = ['private','offspring','adult','steward','guardian'];
  return /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (valid.includes(role) ? role : 'private');
}

async function hashPasswordPBKDF2(password, saltB64) {
  const pbkdf2 = promisify(crypto.pbkdf2);
  const hash = await pbkdf2(password, saltB64, 100000, 64, 'sha512');
  return hash.toString('base64');
}

function generatePasswordSalt() { return crypto.randomBytes(24).toString('base64'); }
function generateRandomHex(bytes = 32) { return crypto.randomBytes(bytes).toString('hex'); }

async function checkUsernameAvailability(username, supabase) {
  try {
    const domain = 'satnam.pub';
    const local = (username || '').trim().toLowerCase();
    if (!local) return false;
    const secret = process.env.DUID_SECRET_KEY || process.env.DUID_SERVER_SECRET || process.env.VITE_DUID_SERVER_SECRET;
    if (!secret) { console.warn('DUID server secret not configured; availability check may be inaccurate'); return false; }
    const identifier = `${local}@${domain}`;
    const hmac = crypto.createHmac('sha256', secret).update(identifier).digest('hex');
    const { data, error } = await supabase
      .from('nip05_records')
      .select('id')
      .eq('domain', domain)
      .eq('hashed_nip05', hmac)
      .eq('is_active', true)
      .limit(1);
    if (error) { console.error('Username availability check failed:', error); return false; }
    return !data || data.length === 0;
  } catch (e) {
    console.error('Username availability check error:', e);
    return false;
  }
}

function validateRegistrationData(userData) {
  const errors = [];
  if (!userData || typeof userData !== 'object') { errors.push({ field: 'body', message: 'Request body must be an object' }); return { success:false, errors }; }
  if (!userData.username || typeof userData.username !== 'string' || userData.username.trim().length < 3) {
    errors.push({ field: 'username', message: 'Username must be at least 3 characters long' });
  }
  if (!userData.password || typeof userData.password !== 'string' || userData.password.length < 8) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters long' });
  }
  if (userData.password !== userData.confirmPassword) {
    errors.push({ field: 'confirmPassword', message: 'Passwords do not match' });
  }
  if (!userData.npub || typeof userData.npub !== 'string' || !userData.npub.startsWith('npub1')) {
    errors.push({ field: 'npub', message: 'Valid npub is required' });
  }
  if (!userData.encryptedNsec || typeof userData.encryptedNsec !== 'string') {
    errors.push({ field: 'encryptedNsec', message: 'Encrypted private key is required' });
  }
  if (userData.nip05 && userData.nip05 !== `${userData.username}@satnam.pub`) {
    errors.push({ field: 'nip05', message: 'NIP-05 must match username@satnam.pub format' });
  }
  if (errors.length > 0) return { success:false, errors };
  return {
    success:true,
    data: {
      username: userData.username.trim().toLowerCase(),
      password: userData.password,
      npub: userData.npub.trim(),
      encryptedNsec: userData.encryptedNsec,
      nip05: userData.nip05 || `${userData.username.trim().toLowerCase()}@satnam.pub`,
      lightningAddress: userData.lightningAddress,
      role: userData.role || 'private',
      displayName: userData.displayName?.trim(),
      bio: userData.bio?.trim(),
      generateInviteToken: !!userData.generateInviteToken,
      invitationToken: userData.invitationToken || null,
      isImportedAccount: !!userData.isImportedAccount,
      detectedProfile: userData.detectedProfile || null,
      deterministicUserId: userData.deterministicUserId || null
    }
  };
}

export const handler = async function(event) {
  const cors = buildCors(event);
  if ((event.httpMethod || 'GET').toUpperCase() === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if ((event.httpMethod || 'GET').toUpperCase() !== 'POST') return { statusCode: 405, headers: { ...cors, 'Allow':'POST' }, body: JSON.stringify({ success:false, error:'Method not allowed' }) };

  try {
    let userData; try { userData = typeof event.body === 'string' ? JSON.parse(event.body) : event.body; } catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ success:false, error:'Invalid JSON in request body' }) }; }

    // Lazy load heavy deps to reduce bundling memory
    const [{ supabase }, { SecureSessionManager }, { generateUserSalt, createHashedUserData }, { vault }] = await Promise.all([
      import('../functions/supabase.js'),
      import('../functions/security/session-manager.js'),
      import('../../lib/security/privacy-hashing.js'),
      import('../../lib/vault.ts'),
    ]);

    // Rate limit (60s window, 5 attempts per IP)
    try {
      const xfwd = event.headers?.['x-forwarded-for'] || event.headers?.['X-Forwarded-For'];
      const clientIp = Array.isArray(xfwd) ? xfwd[0] : (xfwd || '').split(',')[0]?.trim() || 'unknown';
      const windowSec = 60;
      const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * (windowSec * 1000)).toISOString();
      const { data, error } = await supabase.rpc('increment_auth_rate', { p_identifier: clientIp, p_scope: 'ip', p_window_start: windowStart, p_limit: 5 });
      const limited = Array.isArray(data) ? data?.[0]?.limited : data?.limited;
      if (error || limited) return { statusCode: 429, headers: cors, body: JSON.stringify({ success:false, error:'Too many registration attempts' }) };
    } catch { return { statusCode: 429, headers: cors, body: JSON.stringify({ success:false, error:'Too many registration attempts' }) }; }

    const validation = validateRegistrationData(userData);
    if (!validation.success) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success:false, error:'Invalid registration data', details: validation.errors }) };
    }
    const v = validation.data;

    // Username availability (hashed NIP-05)
    const available = await checkUsernameAvailability(v.username, supabase);
    if (!available) return { statusCode: 409, headers: cors, body: JSON.stringify({ success:false, error:'Username is already taken', field:'username' }) };

    // DUID FAIL-SAFE (exact requirement)
    if (!v.deterministicUserId) {
      console.error('❌ DUID generation failed: No pre-generated DUID provided by Identity Forge');
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({
          success: false,
          error: "DUID generation failed",
          details: "Deterministic User ID must be generated during Identity Forge process. Please retry account creation.",
          code: "DUID_GENERATION_FAILED",
          meta: { timestamp: new Date().toISOString(), requiresRetry: true }
        })
      };
    }

    const role = validateRole(v.role);
    const spendingLimits = role === 'offspring' ? { daily: 50000, weekly: 200000, requiresApproval: 100000 } : { daily: -1, weekly: -1, requiresApproval: -1 };

    // Hashing (privacy-first)
    const userSalt = await generateUserSalt();
    const hashedUserData = await createHashedUserData({
      username: v.username,
      npub: v.npub,
      nip05: v.nip05,
      encryptedNsec: v.encryptedNsec,
      lightningAddress: v.lightningAddress,
      password: v.password,
      displayName: v.displayName,
      bio: v.bio
    }, userSalt);

    const passwordSalt = generatePasswordSalt();
    const passwordHash = await hashPasswordPBKDF2(v.password, passwordSalt);

    const profileData = {
      id: v.deterministicUserId,
      user_salt: hashedUserData.user_salt,
      hashed_username: hashedUserData.hashed_username,
      hashed_npub: hashedUserData.hashed_npub,
      hashed_encrypted_nsec: hashedUserData.hashed_encrypted_nsec,
      hashed_nip05: hashedUserData.hashed_nip05,
      hashed_lightning_address: hashedUserData.hashed_lightning_address,
      role,
      spending_limits: spendingLimits,
      privacy_settings: {
        privacy_level: 'maximum',
        zero_knowledge_enabled: true,
        over_encryption: true,
        is_imported_account: v.isImportedAccount || false,
        detected_profile_data: v.detectedProfile || null
      },
      password_hash: passwordHash,
      password_salt: passwordSalt,
      password_created_at: new Date().toISOString(),
      password_updated_at: new Date().toISOString(),
      failed_attempts: 0,
      requires_password_change: false,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error: insertErr } = await supabase.from('user_identities').insert([profileData]);
    if (insertErr) { console.error('User identity creation failed:', insertErr); return { statusCode: 500, headers: cors, body: JSON.stringify({ success:false, error:'Failed to create user identity' }) }; }

    // Create NIP-05 record using DUID_SERVER_SECRET for indexing
    const secret = process.env.DUID_SECRET_KEY || process.env.DUID_SERVER_SECRET || process.env.VITE_DUID_SERVER_SECRET;
    if (secret) {
      const nip05Identifier = `${v.username}@satnam.pub`;
      const hashedNip05 = crypto.createHmac('sha256', secret).update(nip05Identifier).digest('hex');

      const nip05Record = {
        domain: 'satnam.pub',
        local_part: v.username,
        hashed_nip05: hashedNip05,
        user_id: v.deterministicUserId,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error: nip05Err } = await supabase.from('nip05_records').insert([nip05Record]);
      if (nip05Err) { console.error('NIP-05 record creation failed:', nip05Err); }
    } else {
      console.error('DUID_SERVER_SECRET not configured - NIP-05 record not created');
    }

    // Session creation
    const hashedIdentifier = (await crypto.webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(`registration_${v.username}_${Date.now()}`)));
    const hex = Array.from(new Uint8Array(hashedIdentifier)).map(b=>b.toString(16).padStart(2,'0')).join('');
    const sessionUserData = {
      npub: `npub_${hex.slice(0,8)}`,
      nip05: `${v.username}@satnam.pub`,
      federationRole: role,
      authMethod: /** @type {const} */ ('nip05-password'),
      isWhitelisted: true,
      votingPower: role === 'guardian' ? 2 : 1,
      guardianApproved: true,
      stewardApproved: ['steward','guardian'].includes(role),
      sessionToken: ''
    };
    const jwtToken = await SecureSessionManager.createSession(undefined, sessionUserData);

    // Optional invitation processing (non-blocking)
    if (userData?.invitationToken) {
      try {
        const resp = await fetch(`${process.env.FRONTEND_URL || 'https://satnam.pub'}/api/authenticated/process-invitation`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` }, body: JSON.stringify({ inviteToken: userData.invitationToken })
        });
        if (!resp.ok) { /* ignore */ }
      } catch (e) { console.warn('Invitation processing failed:', e); }
    }

    return {
      statusCode: 201,
      headers: cors,
      body: JSON.stringify({
        success: true,
        message: 'Identity registered successfully with sovereignty enforcement',
        user: { id: v.deterministicUserId, username: v.username, role, spendingLimits, registeredAt: new Date().toISOString() },
        session: { token: jwtToken }
      })
    };

  } catch (e) {
    console.error('Registration error:', e);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success:false, error:'Registration failed' }) };
  }
};

export default handler;
