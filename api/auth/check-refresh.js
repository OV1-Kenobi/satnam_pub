/**
 * Check Refresh API Endpoint
 * 
 * Checks if a valid refresh token exists without consuming it
 */

const jwt = require('jsonwebtoken');

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
 * Verify JWT token with enhanced validation
 */
function verifyJWTToken(token, secret) {
  try {
    return jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'satnam.pub',
      audience: 'satnam.pub-users',
    });
  } catch (error) {
    return null;
  }
}

/**
 * Main check-refresh handler
 */
export default async function handler(req, res) {
  // CORS headers for browser compatibility
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    // Get refresh token from HttpOnly cookie
    const cookies = parseCookies(req.headers.cookie);
    const refreshToken = cookies['satnam_refresh_token'];

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        available: false,
      });
    }

    // Verify refresh token without using it
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error',
      });
    }

    const payload = verifyJWTToken(refreshToken, jwtSecret);
    const isValid = payload && payload.type === 'refresh';

    res.status(200).json({
      success: true,
      available: isValid,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('Check refresh error:', error);
    
    res.status(500).json({
      success: false,
      available: false,
      error: 'Check refresh failed',
    });
  }
}