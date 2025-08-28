// Unified Invitation Handler - Netlify Function (CommonJS)
// Consolidates authenticated-generate-peer-invite and authenticated-process-signed-invitation
// Uses dynamic imports to load actual implementations only when called to reduce build memory usage

const handler = async (event, context) => {
  const cors = buildCorsHeaders(event);

  // CORS preflight
  if ((event.httpMethod || 'GET').toUpperCase() === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  try {
    const method = (event.httpMethod || 'GET').toUpperCase();
    // Get path from multiple sources (Netlify redirects may not preserve event.path)
    const path = event.path || event.rawUrl || event.headers?.['x-forwarded-for-path'] || '';
    const referer = event.headers?.referer || '';

    console.log('🔍 Path debug:', {
      eventPath: event.path,
      rawUrl: event.rawUrl,
      referer: referer.substring(0, 100),
      headers: Object.keys(event.headers || {}).join(', ')
    });

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

    // Handle inline implementations (for critical invitation endpoints)
    if (target.inline && target.operation === 'generate-peer-invite') {
      console.log('🔍 Using inline peer invitation implementation');
      return await handlePeerInviteInline(event, context, cors);
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

  // Generate peer invitation - INLINE IMPLEMENTATION for reliability
  // If path is not available (due to Netlify redirect), assume generate-peer-invite for POST requests
  if ((normalizedPath.includes('/authenticated/generate-peer-invite') ||
       normalizedPath.includes('/api/authenticated/generate-peer-invite') ||
       (!path && method === 'POST')) && method === 'POST') {
    return {
      inline: true,
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

// SECURE JWT VERIFICATION FUNCTION
async function verifyJWT(token) {
  try {
    // Import jose library for secure JWT verification
    const { jwtVerify, createRemoteJWKSet } = await import('jose');

    // Configuration
    const JWT_SECRET = process.env.JWT_SECRET;
    const JWKS_URI = process.env.JWKS_URI;
    const JWT_ISSUER = process.env.JWT_ISSUER || 'satnam.pub';
    const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'satnam.pub';

    let payload;

    // Option 1: JWKS verification (preferred for production)
    if (JWKS_URI) {
      console.log('🔐 Using JWKS verification');
      const JWKS = createRemoteJWKSet(new URL(JWKS_URI));
      const { payload: jwksPayload } = await jwtVerify(token, JWKS, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        clockTolerance: 30 // 30 seconds tolerance for clock skew
      });
      payload = jwksPayload;
    }
    // Option 2: HS256 secret-based verification (fallback)
    else if (JWT_SECRET) {
      console.log('🔐 Using HS256 secret verification');
      const secret = new TextEncoder().encode(JWT_SECRET);
      const { payload: secretPayload } = await jwtVerify(token, secret, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        clockTolerance: 30
      });
      payload = secretPayload;
    }
    // Fallback: Basic verification for development (INSECURE - only for dev)
    else if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️  WARNING: Using insecure JWT verification in development mode');
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

      // Basic expiration check
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        throw new Error('Token expired');
      }
    }
    else {
      throw new Error('JWT verification not configured - missing JWT_SECRET or JWKS_URI');
    }

    // Validate required claims
    if (!payload.userId || !payload.username) {
      throw new Error('Invalid token payload - missing required claims');
    }

    // Validate expiration (additional check)
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) {
      throw new Error('Token expired');
    }

    console.log('✅ JWT verification successful:', {
      userId: payload.userId,
      username: payload.username,
      exp: new Date(payload.exp * 1000).toISOString()
    });

    return payload;

  } catch (error) {
    console.error('❌ JWT verification error:', error.message);
    throw new Error(`JWT verification failed: ${error.message}`);
  }
}

// Inline peer invitation implementation for reliability
async function handlePeerInviteInline(event, context, corsHeaders) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    // Extract JWT token from Authorization header (case-insensitive)
    const headers = event.headers || {};
    const authHeader = headers.authorization || headers.Authorization ||
                      headers['authorization'] || headers['Authorization'];

    if (!authHeader) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Authorization token required'
        })
      };
    }

    // Support case-insensitive "Bearer" token detection
    const bearerMatch = authHeader.match(/^bearer\s+(.+)$/i);
    if (!bearerMatch) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Invalid authorization format. Expected: Bearer <token>'
        })
      };
    }

    const token = bearerMatch[1];

    // SECURE JWT VERIFICATION - Option A: JWKS/HS256 verification
    let payload;
    try {
      payload = await verifyJWT(token);
    } catch (jwtError) {
      console.error('❌ JWT verification failed:', jwtError.message);
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Invalid or expired token',
          debug: process.env.NODE_ENV === 'development' ? jwtError.message : undefined
        })
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { inviteType = 'peer', message = 'Join me on Satnam!', expiresIn = 24 } = body;

    console.log('🔄 Generating peer invitation:', {
      userId: payload.userId,
      username: payload.username,
      inviteType,
      expiresIn
    });

    // Generate invitation code (simple implementation)
    const { randomBytes } = await import('node:crypto');
    const inviteCode = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + (expiresIn * 60 * 60 * 1000)).toISOString();

    // Create invitation data
    const invitationData = {
      inviteCode,
      inviterUserId: payload.userId,
      inviterUsername: payload.username,
      inviterNip05: payload.nip05,
      inviteType,
      message,
      expiresAt,
      createdAt: new Date().toISOString(),
      isActive: true
    };

    // For now, return a simple invitation without database storage
    // In a full implementation, this would be stored in the database
    const inviteUrl = `https://satnam.pub/invite/${inviteCode}`;

    // Generate simple QR code data (placeholder)
    const qrCodeData = `data:image/svg+xml;base64,${Buffer.from(`
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="200" fill="white"/>
        <text x="100" y="100" text-anchor="middle" font-family="monospace" font-size="12">
          QR Code: ${inviteCode.substring(0, 8)}...
        </text>
      </svg>
    `).toString('base64')}`;

    console.log('✅ Peer invitation generated successfully:', {
      inviteCode: inviteCode.substring(0, 8) + '...',
      expiresAt
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Peer invitation generated successfully',
        inviteCode,
        inviteUrl,
        qrCode: qrCodeData,
        invitation: {
          type: inviteType,
          message,
          expiresAt,
          createdAt: invitationData.createdAt
        },
        inviter: {
          username: payload.username,
          nip05: payload.nip05
        }
      })
    };

  } catch (error) {
    console.error('❌ Peer invitation generation error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Failed to generate peer invitation',
        debug: {
          message: error.message,
          timestamp: new Date().toISOString()
        }
      })
    };
  }
}

// ESM export - FIXED: Use proper ESM syntax for "type": "module" compliance
export { handler };
