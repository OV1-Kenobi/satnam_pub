/**
 * Logout API Endpoint
 *
 * Securely logs out users by clearing HttpOnly refresh token cookies
 * with proper CORS handling and cookie deletion attributes
 */

/**
 * SECURITY FIX: Clear secure cookie with proper Domain/Path matching
 * Ensures cookies are deleted by matching original creation attributes
 */
function clearSecureCookie(res, name) {
  // ISSUE 1 FIX: Cookie deletion with proper Domain attribute matching
  const domainAttr = process.env.COOKIE_DOMAIN ? `Domain=${process.env.COOKIE_DOMAIN}; ` : '';
  const isDev = process.env.NODE_ENV !== 'production';

  // Match original cookie attributes exactly for successful deletion
  const commonAttrs = [
    `${domainAttr}Path=/`,
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(isDev ? [] : ['Secure']) // Conditional Secure for local development
  ].join('; ');

  return `${name}=; ${commonAttrs}`;
}

/**
 * Main logout handler with comprehensive CORS and cookie deletion fixes
 */
export const handler = async (req, res) => {
  // CORS headers for browser compatibility
  const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.VITE_APP_DOMAIN || 'https://www.satnam.pub',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600'
  };

  // ISSUE 2 FIX: CORS Preflight Response with proper headers and status
  if (req.method === 'OPTIONS') {
    // Echo requested headers and cache preflight
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] || corsHeaders['Access-Control-Allow-Headers']
    );
    res.setHeader('Access-Control-Max-Age', corsHeaders['Access-Control-Max-Age'] || '600');
    return res.status(204).end(); // 204 No Content for preflight
  }

  // ISSUE 3 FIX: Method Not Allowed with CORS and Allow headers
  if (req.method !== 'POST') {
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Standardized IP-based rate limiting for logout (60s, 60 attempts)
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

    // SECURITY FIX: Clear HttpOnly refresh cookies with proper attributes
    res.setHeader('Set-Cookie', [
      clearSecureCookie(res, 'satnam_refresh_token'),
      clearSecureCookie(res, 'satnam_session_id')
    ]);

    // Set CORS headers for successful response
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
      meta: {
        timestamp: new Date().toISOString(),
      },
    });

    console.log('🚪 User logged out successfully');
  } catch (error) {
    console.error('Logout error:', error);

    // Set CORS headers even on error
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    res.status(500).json({
      success: false,
      error: 'Logout failed',
      details: error.message,
    });
  }
}