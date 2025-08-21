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
/** @type {{ACCESS_TOKEN_LIFETIME:number, REFRESH_TOKEN_LIFETIME:number, COOKIE_NAME:string, JWT_ALGORITHM:'HS256'}} */
const TOKEN_CONFIG = {
  ACCESS_TOKEN_LIFETIME: 15 * 60, // 15 minutes in seconds
  REFRESH_TOKEN_LIFETIME: 7 * 24 * 60 * 60, // 7 days in seconds
  COOKIE_NAME: 'satnam_refresh_token',
  JWT_ALGORITHM: 'HS256',
};

/**
 * @typedef {Object} HttpRequest
 * @property {string} method
 * @property {{[key:string]: string}} headers
 *
 * @typedef {Object} HttpResponse
 * @property {(code:number)=>HttpResponse} status
 * @property {(body:any)=>void} json
 * @property {(name:string, value:string)=>void} setHeader
 *
 * @typedef {Object} BaseTokenPayload
 * @property {string} userId
 * @property {'access'|'refresh'} type
 * @property {string} sessionId
 * @property {string=} nip05
 * @property {string=} hashedId
 *
 * @typedef {Object} TokenPayload
 * @property {string} userId
 * @property {'access'|'refresh'} type
 * @property {string} sessionId
 * @property {string=} nip05
 * @property {number} iat
 * @property {number} exp
 */

/**
 * Generate secure session ID
 */
function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * Generate JWT token with enhanced security
 * @param {BaseTokenPayload} payload
 * @param {string} secret
 * @param {number} expiresIn
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
      algorithm: 'HS256', // literal type to satisfy TS definitions
      issuer: 'satnam.pub',
      audience: 'satnam.pub-users',
    }
  );
}

/**
 * Verify JWT token with enhanced validation
 */
/**
 * @param {string} token
 * @param {string} secret
 * @returns {TokenPayload|null}
 */
function verifyJWTToken(token, secret) {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'], // use literal algorithm for TS
      issuer: 'satnam.pub',
      audience: 'satnam.pub-users',
    });
    // jsonwebtoken types can be string | JwtPayload; normalize to object
    return typeof decoded === 'string' ? /** @type {TokenPayload} */(JSON.parse(decoded)) : /** @type {TokenPayload} */(decoded);
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    return null;
  }
}

/**
 * Set secure HTTP-only cookie
 * @param {import('http').ServerResponse} res
 * @param {string} name
 * @param {string} value
 * @param {number} maxAge
 */
function setSecureCookie(res, name, value, maxAge) {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  res.setHeader('Set-Cookie', [
    `${name}=${value}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    ...(isDevelopment ? [] : ['Secure']),
  ].join('; '));
}

/**
 * Clear secure cookie
 * @param {import('http').ServerResponse} res
 * @param {string} name
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
 * @param {string|undefined} cookieHeader
 * @returns {{[key:string]: string}}
 */
function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [name, value] = cookie.trim().split('=');
    cookies[name] = value;
    return cookies;
  }, /** @type {{[key:string]: string}} */({}));
}

/**
 * Generate HMAC-SHA256 for identifier protection
 * @param {string} uuid
 * @param {string} pepper
 * @param {string=} salt
 * @returns {Promise<string>}
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

  // DIAG: Begin refresh handler diagnostics (privacy-preserving)
  const hadCookie = !!(req.headers && req.headers.cookie);
  console.log('🔄 REFRESH DIAG: start', { hadCookie });

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
    let jwtSecret;
    try {
      const helper = await import('../../netlify/functions/utils/jwt-secret.js');
      jwtSecret = helper.getJwtSecret();
    } catch (e) {
      console.error('JWT secret derivation failed:', e);
      return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    const duidServerSecret = process.env.DUID_SERVER_SECRET;
    if (!duidServerSecret) {
      console.error('Missing DUID_SERVER_SECRET environment variable');
      return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    const refreshPayload = verifyJWTToken(refreshToken, jwtSecret);
    const tokenValid = !!refreshPayload && refreshPayload.type === 'refresh';
    console.log('🔄 REFRESH DIAG: verify', { tokenValid });
    if (!tokenValid) {
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

    /** @type {BaseTokenPayload} */
    const accessPayload = {
      userId: refreshPayload.userId,
      hashedId: protectedId,
      nip05: refreshPayload.nip05,
      type: 'access',
      sessionId: newSessionId,
    };

    /** @type {BaseTokenPayload} */
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
  // DIAG: end of refresh handler reach (should not happen)

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