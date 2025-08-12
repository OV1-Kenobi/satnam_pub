/**
 * Get Pepper API Endpoint
 * 
 * Provides secure pepper for HMAC-SHA256 identifier protection
 * Note: In production, this should be retrieved from a secure KMS
 */

const crypto = require('crypto');

/**
 * Generate or retrieve secure pepper
 * In production, this would come from AWS KMS, HashiCorp Vault, etc.
 */
function getSecurePepper() {
  const pepper = process.env.GLOBAL_SALT || process.env.DUID_SERVER_SECRET;
  
  if (!pepper) {
    throw new Error('No secure pepper configured in environment');
  }
  
  return pepper;
}

/**
 * Main get-pepper handler
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
    const pepper = getSecurePepper();
    
    // In a real implementation, you might want to add additional validation
    // such as checking if the requesting client is authenticated
    
    res.status(200).json({
      success: true,
      pepper: pepper,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('Get pepper error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve secure pepper',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}