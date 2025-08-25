/**
 * Clear HttpOnly Refresh Cookie API Endpoint
 *
 * SECURITY: Provides secure logout functionality by clearing HttpOnly refresh cookies
 * that cannot be accessed by client-side JavaScript.
 * FIXES: Proper cookie deletion with Domain matching and comprehensive CORS handling
 */

export default async function handler(req, res) {
  // CORS headers for production security
  // VITE_APP_DOMAIN: Uses fallback to 'https://www.satnam.pub' (no Netlify config needed)
  const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.VITE_APP_DOMAIN || 'https://www.satnam.pub',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '600',
    'Content-Type': 'application/json'
  };

  // CORS Preflight Response with proper headers and status
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

  // Method Not Allowed with CORS and Allow headers
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
    // Clear HttpOnly refresh cookies with proper Domain/Path matching
    // COOKIE_DOMAIN: Set to '.satnam.pub' in Netlify environment variables for subdomain support
    // NODE_ENV: Already configured as 'production' in netlify.toml
    const domainAttr = process.env.COOKIE_DOMAIN ? `Domain=${process.env.COOKIE_DOMAIN}; ` : '';
    const isDev = process.env.NODE_ENV !== 'production';

    // Match original cookie attributes exactly for successful deletion
    const commonAttrs = `${domainAttr}Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${isDev ? '' : '; Secure'}`;

    res.setHeader('Set-Cookie', [
      `satnam_refresh_token=; ${commonAttrs}`,
      `satnam_session_id=; ${commonAttrs}`
    ]);

    // Set CORS headers
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    return res.status(200).json({
      success: true,
      message: 'HttpOnly refresh cookies cleared successfully'
    });

  } catch (error) {
    console.error('Error clearing refresh cookies:', error);

    // Set CORS headers even on error
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to clear refresh cookies'
    });
  }
}
