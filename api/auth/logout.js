/**
 * Logout API Endpoint
 * 
 * Securely logs out users by clearing HttpOnly refresh token cookies
 */

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
 * Main logout handler
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

    // Clear refresh token cookie
    clearCookie(res, 'satnam_refresh_token');

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
    
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      details: error.message,
    });
  }
}