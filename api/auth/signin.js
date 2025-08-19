/**
 * Secure Signin API Endpoint
 * 
 * Implements secure authentication with HttpOnly refresh cookies and short-lived access tokens
 * as per the security improvements from unified-authentication-system.md
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase configuration');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Token configuration matching client-side
const TOKEN_CONFIG = {
  ACCESS_TOKEN_LIFETIME: 15 * 60, // 15 minutes in seconds
  REFRESH_TOKEN_LIFETIME: 7 * 24 * 60 * 60, // 7 days in seconds
  COOKIE_NAME: 'satnam_refresh_token',
  JWT_ALGORITHM: 'HS256',
};

/**
 * Generate secure session ID
 */
function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * Generate HMAC-SHA256 for identifier protection
 */
function generateProtectedId(uuid, pepper, salt = '') {
  const message = uuid + salt;
  const hmac = crypto.createHmac('sha256', pepper);
  hmac.update(message);
  return hmac.digest('hex');
}

/**
 * Hash password using PBKDF2 with salt
 */
async function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      // Store/compare in base64 to match registration storage format
      else resolve(derivedKey.toString('base64'));
    });
  });
}

/**
 * Generate JWT token with enhanced security
 */
function generateJWTToken(payload, secret, expiresIn) {
  return jwt.sign(
    {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      jti: generateSessionId(), // JWT ID for token tracking
    },
    secret,
    {
      expiresIn,
      algorithm: TOKEN_CONFIG.JWT_ALGORITHM,
      issuer: 'satnam.pub',
      audience: 'satnam.pub-users',
    }
  );
}

/**
 * Set secure HTTP-only cookie
 */
function setSecureCookie(res, name, value, maxAge) {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.setHeader('Set-Cookie', [
    `${name}=${value}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    ...(isDevelopment ? [] : ['Secure']), // Only Secure in production (HTTPS)
  ].join('; '));
}

/**
 * Authenticate user with NIP-05 and password (DUID-based, greenfield)
 */
async function authenticateUser(nip05, password) {
  try {
    const duidServerSecret = process.env.DUID_SERVER_SECRET;
    if (!duidServerSecret) {
      throw new Error('Missing DUID_SERVER_SECRET configuration');
    }

    // Resolve NIP-05 to npub
    const { resolveNIP05ToNpub } = await import('../../lib/security/duid-generator.js');
    const npub = await resolveNIP05ToNpub(nip05.trim().toLowerCase());
    if (!npub) {
      // Constant-time dummy hash to equalize timing
      await hashPassword('dummy', 'dummy');
      return { success: false, error: 'Invalid credentials' };
    }

    // Compute secure DUID index from npub using server secret
    let duid_index;
    try {
      const mod = await import('../../netlify/functions/security/duid-index-generator.mjs');
      const { generateDUIDIndexFromNpub } = mod;
      duid_index = generateDUIDIndexFromNpub(npub);
    } catch (e) {
      console.error('DUID index generation failed:', e);
      return { success: false, error: 'Server configuration error' };
    }

    // Query user by DUID index (primary key)
    const { data: user, error } = await supabase
      .from('user_identities')
      .select('*')
      .eq('id', duid_index)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      // Constant-time dummy hash to equalize timing
      await hashPassword('dummy', 'dummy');
      return { success: false, error: 'Invalid credentials' };
    }

    // Verify password
    const hashedPassword = await hashPassword(password, user.password_salt);
    if (hashedPassword !== user.password_hash) {
      await supabase
        .from('user_identities')
        .update({
          failed_attempts: user.failed_attempts + 1,
          locked_until: user.failed_attempts >= 4 ?
            new Date(Date.now() + 15 * 60 * 1000).toISOString() : null
        })
        .eq('id', user.id);
      return { success: false, error: 'Invalid credentials' };
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return { success: false, error: 'Account temporarily locked' };
    }

    // Reset failed attempts on successful authentication
    await supabase
      .from('user_identities')
      .update({
        failed_attempts: 0,
        locked_until: null,
        last_successful_auth: new Date().toISOString()
      })
      .eq('id', user.id);

    // Generate protected identifier for tokens using DUID_SERVER_SECRET as pepper
    const sessionId = generateSessionId();
    const protectedId = generateProtectedId(user.id, duidServerSecret, sessionId);

    // Create user object with protected identifier
    const userWithProtectedId = {
      ...user,
      hashedId: protectedId,
    };

    return { success: true, user: userWithProtectedId, sessionId };

  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, error: 'Authentication failed' };
  }
}

/**
 * Main signin handler
 */
export default async function handler(req, res) {
  // CORS headers for browser compatibility
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const { nip05, password, authMethod = 'nip05-password' } = req.body;

    // Validate input
    if (!nip05 || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required credentials',
      });
    }

    // Authenticate user
    const authResult = await authenticateUser(nip05, password);
    
    if (!authResult.success) {
      return res.status(401).json(authResult);
    }

    // Get JWT secret
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('Missing JWT_SECRET environment variable');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error',
      });
    }

    // Generate tokens
    const now = Math.floor(Date.now() / 1000);
    const accessTokenExpiry = now + TOKEN_CONFIG.ACCESS_TOKEN_LIFETIME;
    const refreshTokenExpiry = now + TOKEN_CONFIG.REFRESH_TOKEN_LIFETIME;

    // Create token payloads
    const accessPayload = {
      userId: authResult.user.id,
      hashedId: authResult.user.hashedId,
      nip05: nip05, // Store original for reference (not hashed in token)
      type: 'access',
      sessionId: authResult.sessionId,
    };

    const refreshPayload = {
      userId: authResult.user.id,
      hashedId: authResult.user.hashedId,
      nip05: nip05,
      type: 'refresh',
      sessionId: authResult.sessionId,
    };

    // Generate tokens
    const accessToken = generateJWTToken(
      accessPayload,
      jwtSecret,
      TOKEN_CONFIG.ACCESS_TOKEN_LIFETIME
    );

    const refreshToken = generateJWTToken(
      refreshPayload,
      jwtSecret,
      TOKEN_CONFIG.REFRESH_TOKEN_LIFETIME
    );

    // Set refresh token in HttpOnly cookie
    setSecureCookie(
      res,
      TOKEN_CONFIG.COOKIE_NAME,
      refreshToken,
      TOKEN_CONFIG.REFRESH_TOKEN_LIFETIME
    );

    // Return standardized SessionData response with privacy-first data
    res.status(200).json({
      success: true,
      data: {
        user: {
          id: authResult.user.hashedId, // Hashed DUID only
          npub: '', // Not applicable in NIP-05/password flow
          username: undefined, // Not returned here
          nip05: nip05,
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
    });

    console.log(`🔐 Secure authentication successful for user ${authResult.user.id}`);

  } catch (error) {
    console.error('Signin error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}