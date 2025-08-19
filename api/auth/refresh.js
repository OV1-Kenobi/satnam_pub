/**
 * Token Refresh API Endpoint
 * 
 * Implements secure token refresh using HttpOnly cookies as per security requirements:
 * - Short-lived access tokens (5-15 min) with rotating refresh tokens
 * - HttpOnly, Secure, SameSite=Strict cookies for refresh tokens
 * - Token rotation on each refresh
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

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
 * Verify JWT token with enhanced validation
 */
function verifyJWTToken(token, secret) {
  try {
    return jwt.verify(token, secret, {
      algorithms: [TOKEN_CONFIG.JWT_ALGORITHM],
      issuer: 'satnam.pub',
      audience: 'satnam.pub-users',
    });
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    return null;
  }
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
 * Clear secure cookie
 */
function clearCookie(res, name) {
  res.setHeader('Set-Cookie', [
    `${name}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ].join('; '));
}

/**
 * Parse cookies from request
 */
function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  
  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [name, value] = cookie.trim().split('=');
    cookies[name] = value;
    return cookies;
  }, {});
}

/**
 * Generate HMAC-SHA256 for identifier protection
 */
async function generateProtectedId(uuid, pepper, salt = '') {
  const message = uuid + salt;
  const hmac = crypto.createHmac('sha256', pepper);
  hmac.update(message);
  return hmac.digest('hex');
}

/**
 * Main refresh token handler
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
    // Get refresh token from HttpOnly cookie
    const cookies = parseCookies(req.headers.cookie);
    const refreshToken = cookies[TOKEN_CONFIG.COOKIE_NAME];

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'No refresh token found',
      });
    }

    // Verify refresh token
    const jwtSecret = process.env.JWT_SECRET;
    const duidServerSecret = process.env.DUID_SERVER_SECRET;

    if (!jwtSecret || !duidServerSecret) {
      console.error('Missing JWT_SECRET or DUID_SERVER_SECRET environment variables');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error',
      });
    }

    const refreshPayload = verifyJWTToken(refreshToken, jwtSecret);
    if (!refreshPayload || refreshPayload.type !== 'refresh') {
      clearCookie(res, TOKEN_CONFIG.COOKIE_NAME);
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token',
      });
    }

    // Validate token hasn't been used too recently (prevent replay attacks)
    const now = Math.floor(Date.now() / 1000);
    if (now - refreshPayload.iat < 60) { // 1 minute minimum between refreshes
      return res.status(429).json({
        success: false,
        error: 'Token refresh rate limit exceeded',
      });
    }

    // Generate new tokens with rotation
    const newSessionId = generateSessionId();
    const accessTokenExpiry = now + TOKEN_CONFIG.ACCESS_TOKEN_LIFETIME;
    const refreshTokenExpiry = now + TOKEN_CONFIG.REFRESH_TOKEN_LIFETIME;

    // Generate protected identifier for new tokens
    const protectedId = await generateProtectedId(
      refreshPayload.userId,
      duidServerSecret,
      newSessionId
    );

    // Create new access token payload
    const accessPayload = {
      userId: refreshPayload.userId,
      hashedId: protectedId,
      nip05: refreshPayload.nip05,
      type: 'access',
      sessionId: newSessionId,
    };

    // Create new refresh token payload
    const refreshPayload_new = {
      userId: refreshPayload.userId,
      hashedId: protectedId,
      nip05: refreshPayload.nip05,
      type: 'refresh',
      sessionId: newSessionId,
    };

    // Generate new tokens
    const newAccessToken = generateJWTToken(
      accessPayload,
      jwtSecret,
      TOKEN_CONFIG.ACCESS_TOKEN_LIFETIME
    );

    const newRefreshToken = generateJWTToken(
      refreshPayload_new,
      jwtSecret,
      TOKEN_CONFIG.REFRESH_TOKEN_LIFETIME
    );

    // Set new refresh token in HttpOnly cookie
    setSecureCookie(
      res,
      TOKEN_CONFIG.COOKIE_NAME,
      newRefreshToken,
      TOKEN_CONFIG.REFRESH_TOKEN_LIFETIME
    );

    // Return standardized SessionData payload
    res.status(200).json({
      success: true,
      data: {
        user: {
          id: refreshPayload.userId,
          npub: '',
          username: undefined,
          nip05: refreshPayload.nip05,
          role: undefined,
          is_active: true,
        },
        authenticated: true,
        sessionToken: newAccessToken,
        expiresAt: new Date(accessTokenExpiry * 1000).toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        sessionId: newSessionId,
      },
    });

    console.log(`🔄 Tokens refreshed for user ${refreshPayload.userId}`);
  } catch (error) {
    console.error('Token refresh error:', error);
    
    // Clear potentially invalid refresh cookie
    clearCookie(res, TOKEN_CONFIG.COOKIE_NAME);
    
    res.status(500).json({
      success: false,
      error: 'Token refresh failed',
      details: error.message,
    });
  }
}