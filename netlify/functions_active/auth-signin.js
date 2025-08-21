// Netlify Function: /api/auth/signin -> /.netlify/functions/auth-signin
// Consolidated implementation with security and reliability improvements

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import * as crypto from 'node:crypto';

function buildCorsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const isProd = process.env.NODE_ENV === 'production';
  // Preferred production origin consistency
  const allowedOrigin = isProd ? (process.env.FRONTEND_URL || 'https://www.satnam.pub') : (origin || '*');
  const allowCreds = allowedOrigin !== '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': String(allowCreds),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    'Content-Type': 'application/json',
  };
}

function withCors(resp, cors) {
  const headers = { ...(resp.headers || {}), ...cors };
  return { ...resp, headers };
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((cookies, part) => {
    const cookie = part.trim();
    if (!cookie) return cookies;
    const idx = cookie.indexOf('=');
    if (idx <= 0) return cookies; // skip malformed/no-name cookies
    const name = cookie.slice(0, idx).trim();
    const value = cookie.slice(idx + 1).trim();
    if (!name) return cookies;
    cookies[name] = value;
    return cookies;
  }, {});
}

function setSecureCookie(headers, name, value, maxAge) {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const cookie = [
    `${name}=${value}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    ...(isDevelopment ? [] : ['Secure'])
  ].join('; ');
  const existing = headers['Set-Cookie'];
  if (existing) {
    headers['Set-Cookie'] = Array.isArray(existing) ? [...existing, cookie] : [existing, cookie];
  } else {
    headers['Set-Cookie'] = cookie;
  }
}

// Token configuration
const TOKEN_CONFIG = {
  ACCESS_TOKEN_LIFETIME: 15 * 60, // seconds
  REFRESH_TOKEN_LIFETIME: 7 * 24 * 60 * 60, // seconds
  COOKIE_NAME: 'satnam_refresh_token',
  JWT_ALGORITHM: 'HS256',
};

function generateSessionId() { return crypto.randomUUID(); }

function generateJWTToken(payload, secret, expiresIn) {
  // Do not add iat manually (jsonwebtoken sets it). Keep jti only.
  const sanitized = { ...payload, jti: generateSessionId() };
  return jwt.sign(
    sanitized,
    secret,
    { expiresIn, algorithm: TOKEN_CONFIG.JWT_ALGORITHM, issuer: 'satnam.pub', audience: 'satnam.pub-users' }
  );
}

async function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString('base64'));
    });
  });
}

async function authenticateUser(nip05, password) {
  const duidServerSecret = process.env.DUID_SERVER_SECRET;
  if (!duidServerSecret) {
    throw new Error('Missing DUID_SERVER_SECRET configuration');
  }

  // Init Supabase client (anon key for public reads)
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase configuration');
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Resolve NIP-05 to npub. Add fallback for satnam.pub using hashed DB lookup
  const { resolveNIP05ToNpub } = await import('../../lib/security/duid-generator.js');
  let npub = await resolveNIP05ToNpub(nip05.trim().toLowerCase());

  let authPath = 'nip05-resolution';
  let userLookupSucceeded = false;

  if (!npub) {
    // Fallback only for satnam.pub domain using server-side hashed lookup
    try {
      const [local, domain] = String(nip05).toLowerCase().split('@');
      if (domain === 'satnam.pub' && local) {
        // Compute hashed_nip05 using server secret (same as registration path)
        const { default: nodeCrypto } = await import('node:crypto');
        const secret = process.env.DUID_SERVER_SECRET || process.env.VITE_DUID_SERVER_SECRET;
        if (secret) {
          const h1 = nodeCrypto.createHmac('sha256', secret).update(`${local}@${domain}`).digest('hex');
          const { data: rec, error: recErr } = await supabase
            .from('nip05_records')
            .select('hashed_npub')
            .eq('domain', 'satnam.pub')
            .eq('hashed_nip05', h1)
            .eq('is_active', true)
            .single();
          if (!recErr && rec?.hashed_npub) {
            const { data: userByHashed, error: userErr } = await supabase
              .from('user_identities')
              .select('*')
              .eq('hashed_npub', rec.hashed_npub)
              .eq('is_active', true)
              .single();
            if (!userErr && userByHashed?.id) {
              console.log('🔐 AUTH DIAG: fallback-path user lookup success');
              return { success: true, user: userByHashed, sessionId: generateSessionId(), diag: { path: 'hashed-fallback', userFound: true } };
            }
          }
        }
      }
      authPath = 'hashed-fallback';
    } catch (_) {
      authPath = 'hashed-fallback-error';
    }

    // If fallback not successful, maintain constant-time behavior and fail
    await hashPassword('dummy', 'dummy');
    console.warn('🔐 AUTH DIAG: no user found via fallback', { path: authPath });
    return { success: false, error: 'Invalid credentials', diag: { path: authPath, userFound: false } };
  }

  // Compute DUID index
  let duid_index;
  try {
    const mod = await import('../functions/security/duid-index-generator.mjs');
    const { generateDUIDIndexFromNpub } = mod;
    duid_index = generateDUIDIndexFromNpub(npub);
  } catch (e) {
    console.error('DUID index generation failed:', e);
    return { success: false, error: 'Server configuration error', diag: { path: authPath, duidGen: 'fail' } };
  }

  // Lookup user
  const { data: user, error } = await supabase
    .from('user_identities')
    .select('*')
    .eq('id', duid_index)
    .eq('is_active', true)
    .single();

  if (error || !user) {
    await hashPassword('dummy', 'dummy');
    console.warn('🔐 AUTH DIAG: user lookup failed before password verify', { path: authPath, userFound: false });
    return { success: false, error: 'Invalid credentials', diag: { path: authPath, userFound: false } };
  }

  userLookupSucceeded = true;

  // Check lock BEFORE verifying password
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    console.warn('🔐 AUTH DIAG: account locked', { path: authPath });
    return { success: false, error: 'Account temporarily locked', diag: { path: authPath, locked: true } };
  }

  // Verify password
  const hashedPassword = await hashPassword(password, user.password_salt);
  const match = hashedPassword === user.password_hash;
  console.log('🔐 AUTH DIAG: password-compare', { path: authPath, userFound: userLookupSucceeded, match });
  if (!match) {
    // Atomic increment via RPC to prevent race conditions
    try {
      await supabase.rpc('increment_failed_attempts', {
        user_id: user.id,
        lock_after: 5, // lock after 5 failed attempts
        lock_duration_minutes: 15,
      });
    } catch (rpcErr) {
      try {
        await supabase
          .from('user_identities')
          .update({
            failed_attempts: (user.failed_attempts || 0) + 1,
            locked_until: (user.failed_attempts >= 4)
              ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
              : null,
          })
          .eq('id', user.id);
      } catch (_) { /* swallow to avoid leaking details */ }
    }
    return { success: false, error: 'Invalid credentials', diag: { path: authPath, userFound: true, match: false } };
  }

  // Reset failed attempts on success
  await supabase
    .from('user_identities')
    .update({ failed_attempts: 0, locked_until: null, last_successful_auth: new Date().toISOString() })
    .eq('id', user.id);

  // Protected identifier using DUID_SERVER_SECRET
  const sessionId = generateSessionId();
  const hmac = crypto.createHmac('sha256', duidServerSecret);
  hmac.update(user.id + sessionId);
  const protectedId = hmac.digest('hex');

  return { success: true, user: { ...user, hashedId: protectedId }, sessionId, diag: { path: authPath, userFound: true, match: true } };
}

export const handler = async (event) => {
  const cors = buildCorsHeaders(event);
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: cors, body: '' };
    }
    if (event.httpMethod !== 'POST') {
      return withCors({ statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) }, cors);
    }

    let jwtSecret;
    try {
      const { getJwtSecret } = await import('../functions/utils/jwt-secret.js');
      jwtSecret = getJwtSecret();
    } catch (e) {
      console.error('JWT secret derivation failed:', e);
      return withCors({ statusCode: 500, body: JSON.stringify({ success: false, error: 'Server configuration error' }) }, cors);
    }

    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const { nip05, password, authMethod = 'nip05-password' } = body;
    if (!nip05 || !password) {
      return withCors({ statusCode: 400, body: JSON.stringify({ success: false, error: 'Missing required credentials' }) }, cors);
    }

    const authResult = await authenticateUser(nip05, password);
    if (!authResult.success) {
      return withCors({ statusCode: 401, body: JSON.stringify(authResult) }, cors);
    }

    const now = Math.floor(Date.now() / 1000);
    const accessTokenExpiry = now + TOKEN_CONFIG.ACCESS_TOKEN_LIFETIME;

    // REMOVE database id from tokens; include only hashedId
    const accessPayload = {
      hashedId: authResult.user.hashedId,
      nip05,
      type: 'access',
      sessionId: authResult.sessionId,
    };

    const refreshPayload = {
      hashedId: authResult.user.hashedId,
      nip05,
      type: 'refresh',
      sessionId: authResult.sessionId,
    };

    const accessToken = generateJWTToken(accessPayload, jwtSecret, TOKEN_CONFIG.ACCESS_TOKEN_LIFETIME);
    const refreshToken = generateJWTToken(refreshPayload, jwtSecret, TOKEN_CONFIG.REFRESH_TOKEN_LIFETIME);

    const headers = { ...cors };
    setSecureCookie(headers, TOKEN_CONFIG.COOKIE_NAME, refreshToken, TOKEN_CONFIG.REFRESH_TOKEN_LIFETIME);

    return withCors({
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          user: {
            id: authResult.user.hashedId,
            npub: '',
            username: undefined,
            nip05,
            role: authResult.user.role || 'private',
            is_active: authResult.user.is_active !== false,
          },
          authenticated: true,
          sessionToken: accessToken,
          expiresAt: new Date(accessTokenExpiry * 1000).toISOString(),
        },
        meta: {
          timestamp: new Date().toISOString(),
          sessionId: authResult.sessionId,
          authMethod,
        },
      }),
    }, cors);
  } catch (err) {
    console.error('Signin function error:', err);
    return withCors({ statusCode: 500, body: JSON.stringify({ success: false, error: 'Authentication failed' }) }, cors);
  }
};

