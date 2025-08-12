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
      else resolve(derivedKey.toString('hex'));
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
 * Authenticate user with NIP-05 and password
 */
async function authenticateUser(nip05, password) {
  try {
    // Hash the NIP-05 for lookup (consistent with database storage)
    const globalSalt = process.env.GLOBAL_SALT;
    if (!globalSalt) {
      throw new Error('Missing global salt configuration');
    }

    const hashedNip05 = crypto
      .createHash('sha256')
      .update(nip05 + globalSalt)
      .digest('hex');

    // Query user_identities table with hashed NIP-05
    const { data: users, error } = await supabase
      .from('user_identities')
      .select('*')
      .eq('hashed_nip05', hashedNip05)
      .eq('is_active', true)
      .single();

    if (error || !users) {
      // Use constant-time comparison to prevent timing attacks
      await hashPassword('dummy', 'dummy'); // Prevent timing analysis
      return { success: false, error: 'Invalid credentials' };
    }

    // Verify password
    const hashedPassword = await hashPassword(password, users.password_salt);
    if (hashedPassword !== users.password_hash) {
      // Increment failed attempts
      await supabase
        .from('user_identities')
        .update({ 
          failed_attempts: users.failed_attempts + 1,
          locked_until: users.failed_attempts >= 4 ? 
            new Date(Date.now() + 15 * 60 * 1000).toISOString() : null // 15 min lockout
        })
        .eq('id', users.id);
        
      return { success: false, error: 'Invalid credentials' };
    }

    // Check if account is locked
    if (users.locked_until && new Date(users.locked_until) > new Date()) {
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
      .eq('id', users.id);

    // Generate protected identifier for tokens
    const sessionId = generateSessionId();
    const protectedId = generateProtectedId(users.id, globalSalt, sessionId);

    // Create user object with protected identifier
    const userWithProtectedId = {
      ...users,
      hashedId: protectedId,
    };

    return { 
      success: true, 
      user: userWithProtectedId,
      sessionId
    };

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

    // Return success response with access token
    res.status(200).json({
      success: true,
      sessionToken: accessToken, // For compatibility with existing code
      accessToken: accessToken,
      accessTokenExpiry: accessTokenExpiry * 1000, // Convert to milliseconds for JS
      user: {
        id: authResult.user.id,
        hashedId: authResult.user.hashedId,
        role: authResult.user.role,
        is_active: authResult.user.is_active,
        federationRole: authResult.user.federationRole || 'private',
        privacy_settings: authResult.user.privacy_settings,
        // Don't expose sensitive hashed data in response
      },
      message: 'Authentication successful',
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