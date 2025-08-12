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