// Unified Invitation Handler - Netlify Function (ESM)
// Consolidates authenticated-generate-peer-invite and authenticated-process-signed-invitation
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

    // Route resolution for invitation operations
    const target = resolveInvitationRoute(path, method);
    if (!target) {
      return { 
        statusCode: 404, 
        headers: cors, 
        body: JSON.stringify({ 
          success: false, 
          error: 'Invitation endpoint not found',
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
      console.error(`Failed to import invitation module: ${target.module}`, importError);
      return { 
        statusCode: 500, 
        headers: cors, 
        body: JSON.stringify({ 
          success: false, 
          error: 'Invitation service temporarily unavailable',
          operation: target.operation
        }) 
      };
    }

    if (typeof targetHandler !== 'function') {
      return { 
        statusCode: 500, 
        headers: cors, 
        body: JSON.stringify({ 
          success: false, 
          error: 'Invitation handler not available',
          operation: target.operation
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
    console.error('Unified invitation handler error:', error);
    return { 
      statusCode: 500, 
      headers: cors, 
      body: JSON.stringify({ 
        success: false, 
        error: 'Invitation service error' 
      }) 
    };
  }
};

/**
 * Resolve invitation route to appropriate handler module
 * Supports peer invitation generation and processing operations
 * @param {string} path - Request path
 * @param {string} method - HTTP method
 * @returns {Object|null} Target module info or null if not found
 */
function resolveInvitationRoute(path, method) {
  // Normalize path for consistent matching
  const normalizedPath = path.toLowerCase();

  // Generate peer invitation
  if ((normalizedPath.includes('/authenticated/generate-peer-invite') || normalizedPath.includes('/api/authenticated/generate-peer-invite')) && method === 'POST') {
    return {
      module: '../../api/authenticated/generate-peer-invite.js',
      operation: 'generate-peer-invite'
    };
  }

  // Process signed invitation
  if ((normalizedPath.includes('/authenticated/process-signed-invitation') || normalizedPath.includes('/api/authenticated/process-signed-invitation')) && method === 'POST') {
    return {
      module: '../../api/authenticated/process-signed-invitation.js',
      operation: 'process-signed-invitation'
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
