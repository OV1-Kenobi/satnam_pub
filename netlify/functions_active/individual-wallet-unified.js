// Unified Individual Wallet Handler - Netlify Function (ESM)
// Consolidates individual-cashu-wallet, individual-lightning-wallet, and individual-fedimint-wallet
// Uses dynamic imports to load actual implementations only when called to reduce build memory usage

export const handler = async (event, context) => {
  const cors = buildCorsHeaders(event);

  // CORS preflight
  if ((event.httpMethod || 'GET').toUpperCase() === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  try {
    const method = (event.httpMethod || 'GET').toUpperCase();
    const path = event.path || '';

    // Route resolution for individual wallet operations
    const target = resolveIndividualWalletRoute(path, method);
    if (!target) {
      return { 
        statusCode: 404, 
        headers: cors, 
        body: JSON.stringify({ 
          success: false, 
          error: 'Individual wallet endpoint not found',
          path: path,
          method: method
        }) 
      };
    }

    // MEMORY OPTIMIZATION: Use runtime dynamic import to prevent bundling heavy modules
    let targetHandler;
    try {
      const mod = await import(target.module);
      targetHandler = mod.handler || mod.default;
    } catch (importError) {
      console.error(`Failed to import individual wallet module: ${target.module}`, importError);
      return { 
        statusCode: 500, 
        headers: cors, 
        body: JSON.stringify({ 
          success: false, 
          error: 'Individual wallet service temporarily unavailable',
          walletType: target.walletType
        }) 
      };
    }

    if (typeof targetHandler !== 'function') {
      return { 
        statusCode: 500, 
        headers: cors, 
        body: JSON.stringify({ 
          success: false, 
          error: 'Individual wallet handler not available',
          walletType: target.walletType
        }) 
      };
    }

    // Delegate to target handler with context preservation
    const response = await targetHandler(event, context);
    
    // Ensure CORS headers are present in response
    if (response && typeof response === 'object') {
      return { 
        ...response, 
        headers: { 
          ...(response.headers || {}), 
          ...cors 
        } 
      };
    }

    return { 
      statusCode: 200, 
      headers: cors, 
      body: typeof response === 'string' ? response : JSON.stringify(response) 
    };

  } catch (error) {
    console.error('Unified individual wallet handler error:', error);
    return { 
      statusCode: 500, 
      headers: cors, 
      body: JSON.stringify({ 
        success: false, 
        error: 'Individual wallet service error' 
      }) 
    };
  }
};

/**
 * Resolve individual wallet route to appropriate handler module
 * Supports cashu, lightning, and fedimint wallet operations
 * @param {string} path - Request path
 * @param {string} method - HTTP method
 * @returns {Object|null} Target module info or null if not found
 */
function resolveIndividualWalletRoute(path, method) {
  // Normalize path for consistent matching
  const normalizedPath = path.toLowerCase();

  // Individual Cashu wallet operations
  if (normalizedPath.includes('/individual/cashu/wallet') || normalizedPath.includes('/api/individual/cashu/wallet')) {
    return {
      module: '../functions_lazy/individual-cashu-wallet.js',
      walletType: 'cashu'
    };
  }

  // Individual Lightning wallet operations
  if (normalizedPath.includes('/individual/lightning/wallet') || normalizedPath.includes('/api/individual/lightning/wallet')) {
    return {
      module: '../functions_lazy/individual-lightning-wallet.js',
      walletType: 'lightning'
    };
  }

  // Individual Fedimint wallet operations
  if (normalizedPath.includes('/individual/fedimint/wallet') || normalizedPath.includes('/api/individual/fedimint/wallet')) {
    return {
      module: '../functions_lazy/individual-fedimint-wallet.js',
      walletType: 'fedimint'
    };
  }

  // No matching route found
  return null;
}

/**
 * Build CORS headers with environment-aware configuration
 * Uses established process.env pattern with fallback to primary production origin
 * @param {Object} event - Netlify function event
 * @returns {Object} CORS headers
 */
function buildCorsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const isProd = process.env.NODE_ENV === 'production';
  
  // Use FRONTEND_URL with fallback to primary production origin per user preferences
  const allowedOrigin = isProd 
    ? (process.env.FRONTEND_URL || 'https://www.satnam.pub') 
    : (origin || '*');
  
  const allowCredentials = allowedOrigin !== '*';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': String(allowCredentials),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    'Content-Type': 'application/json',
  };
}
