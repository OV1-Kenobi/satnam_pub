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

  // Standardized IP-based rate limiting (lightweight: 60s, 60 attempts)
  try {
    const xfwd = req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'];
    const clientIp = Array.isArray(xfwd) ? xfwd[0] : (xfwd || '').split(',')[0]?.trim() || 'unknown';
    const windowSec = 60;
    const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * (windowSec * 1000)).toISOString();
    const helper = await import('../../netlify/functions/supabase.js');
    const { supabase } = helper;
    const { data, error } = await supabase.rpc('increment_auth_rate', { p_identifier: clientIp, p_scope: 'ip', p_window_start: windowStart, p_limit: 60 });
    const limited = Array.isArray(data) ? data?.[0]?.limited : data?.limited;
    if (error || limited) {
      return res.status(429).json({ success:false, error:'Too many attempts' });
    }
  } catch {
    return res.status(429).json({ success:false, error:'Too many attempts' });
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
    // Ensure payload is JwtPayload (object) before accessing .type
    const isValid = !!payload && typeof payload !== 'string' && (/** @type {import('jsonwebtoken').JwtPayload} */ (payload)).type === 'refresh';

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