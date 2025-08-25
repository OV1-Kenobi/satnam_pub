// Unified Authentication Handler - Netlify Function (ESM)
// Consolidates all authentication endpoints into a single lightweight proxy function
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

    // Route resolution with comprehensive endpoint support
    const target = resolveAuthRoute(path, method);
    if (!target) {
      return { 
        statusCode: 404, 
        headers: cors, 
        body: JSON.stringify({ 
          success: false, 
          error: 'Authentication endpoint not found',
          path: path,
          method: method
        }) 
      };
    }

    // MEMORY OPTIMIZATION: Use runtime dynamic import to prevent bundling heavy modules
    let targetHandler;
    try {
      const mod = await import(target.module);
      targetHandler = mod.default || mod.handler;
    } catch (importError) {
      console.error(`Failed to import auth module: ${target.module}`, importError);
      return { 
        statusCode: 500, 
        headers: cors, 
        body: JSON.stringify({ 
          success: false, 
          error: 'Authentication service temporarily unavailable',
          endpoint: target.endpoint
        }) 
      };
    }

    if (typeof targetHandler !== 'function') {
      return { 
        statusCode: 500, 
        headers: cors, 
        body: JSON.stringify({ 
          success: false, 
          error: 'Authentication handler not available',
          endpoint: target.endpoint
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
    console.error('Unified auth handler error:', error);
    return { 
      statusCode: 500, 
      headers: cors, 
      body: JSON.stringify({ 
        success: false, 
        error: 'Authentication service error' 
      }) 
    };
  }
};

/**
 * Resolve authentication route to appropriate handler module
 * Supports both /auth/* and /api/auth/* patterns for backward compatibility
 * @param {string} path - Request path
 * @param {string} method - HTTP method
 * @returns {Object|null} Target module info or null if not found
 */
function resolveAuthRoute(path, method) {
  // Normalize path for consistent matching
  const normalizedPath = path.toLowerCase();

  // Core authentication endpoints
  if ((normalizedPath.endsWith('/auth/signin') || normalizedPath.endsWith('/api/auth/signin')) && method === 'POST') {
    return {
      module: './auth-signin.js',
      endpoint: 'signin'
    };
  }

  if ((normalizedPath.endsWith('/auth/register-identity') || normalizedPath.endsWith('/api/auth/register-identity')) && method === 'POST') {
    return {
      module: './auth-register-identity.js',
      endpoint: 'register-identity'
    };
  }

  // NIP-07 browser extension authentication
  if ((normalizedPath.endsWith('/auth/nip07-challenge') || normalizedPath.endsWith('/api/auth/nip07-challenge')) && method === 'GET') {
    return {
      module: '../../api/auth/nip07-challenge.js',
      endpoint: 'nip07-challenge'
    };
  }

  if ((normalizedPath.endsWith('/auth/nip07-signin') || normalizedPath.endsWith('/api/auth/nip07-signin')) && method === 'POST') {
    return {
      module: '../../api/auth/nip07-signin.js',
      endpoint: 'nip07-signin'
    };
  }

  // Session management endpoints
  if ((normalizedPath.endsWith('/auth/logout') || normalizedPath.endsWith('/api/auth/logout')) && method === 'POST') {
    return {
      module: '../../api/auth/logout.js',
      endpoint: 'logout'
    };
  }

  if ((normalizedPath.endsWith('/auth/refresh') || normalizedPath.endsWith('/api/auth/refresh')) && method === 'POST') {
    return {
      module: '../../api/auth/refresh.js',
      endpoint: 'refresh'
    };
  }

  if ((normalizedPath.endsWith('/auth/check-refresh') || normalizedPath.endsWith('/api/auth/check-refresh')) && method === 'GET') {
    return {
      module: '../../api/auth/check-refresh.js',
      endpoint: 'check-refresh'
    };
  }

  // Username availability check (auth-related utility)
  if ((normalizedPath.endsWith('/auth/check-username-availability') || normalizedPath.endsWith('/api/auth/check-username-availability')) && method === 'GET') {
    return {
      module: '../../api/auth/check-username-availability.js',
      endpoint: 'check-username-availability'
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    'Content-Type': 'application/json',
  };
}
