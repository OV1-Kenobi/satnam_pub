// Unified Authentication Handler - Netlify Function (ESM)
// Consolidates all authentication endpoints into a single lightweight proxy function
// Uses dynamic imports to load actual implementations only when called to reduce build memory usage

export const handler = async (event, context) => {
  console.log('🚀 Auth-unified handler called:', {
    path: event.path,
    method: event.httpMethod,
    timestamp: new Date().toISOString()
  });

  const cors = buildCorsHeaders(event);

  // CORS preflight
  if ((event.httpMethod || 'GET').toUpperCase() === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  try {
    const method = (event.httpMethod || 'GET').toUpperCase();
    const path = event.path || '';

    console.log('🔍 Processing request:', { method, path });

    // Route resolution with comprehensive endpoint support
    const target = resolveAuthRoute(path, method);
    console.log('🔍 Route resolved:', target);

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

    // Handle inline implementations (for critical auth endpoints)
    if (target.inline && target.endpoint === 'signin') {
      console.log('🔍 Using inline signin implementation');
      return await handleSigninInline(event, context, cors);
    }

    if (target.inline && target.endpoint === 'session') {
      console.log('🔍 Using inline session validation implementation');
      return await handleSessionInline(event, context, cors);
    }

    // MEMORY OPTIMIZATION: Use runtime dynamic import to prevent bundling heavy modules
    let targetHandler;
    try {
      console.log('🔍 Attempting to import module:', target.module);

      // Ensure proper ES module import with explicit file extension - SECURITY FIX: Use import.meta.url for reliable resolution
      const rawModulePath = target.module.endsWith('.js') ? target.module : `${target.module}.js`;
      const moduleUrl = new URL(rawModulePath, import.meta.url);
      console.log('🔍 Resolved module path:', moduleUrl.href);

      const mod = await import(moduleUrl.href);
      console.log('✅ Module imported successfully, available exports:', Object.keys(mod));

      targetHandler = mod.default || mod.handler;
      console.log('✅ Target handler resolved:', typeof targetHandler);
    } catch (importError) {
      console.error(`Failed to import auth module: ${target.module}`, importError);
      console.error('Import error details:', {
        name: importError.name,
        message: importError.message,
        stack: importError.stack?.substring(0, 500),
        cause: importError.cause,
        modulePath: target.module
      });

      // Enhanced error response for debugging - SECURITY FIX: Only expose debug info with explicit DEBUG flag
      const isDebugMode = process.env.DEBUG === 'true';

      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({
          success: false,
          error: 'Authentication service temporarily unavailable',
          endpoint: target.endpoint,
          ...(isDebugMode && {
            debug: {
              importError: importError.message,
              modulePath: target.module,
              timestamp: new Date().toISOString()
            }
          })
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

  // Core authentication endpoints - INLINE IMPLEMENTATION for reliability
  if ((normalizedPath.endsWith('/auth/signin') || normalizedPath.endsWith('/api/auth/signin')) && method === 'POST') {
    return {
      inline: true, // Handle signin directly in auth-unified
      endpoint: 'signin'
    };
  }

  // register-identity is now a standalone lazy function, not handled by auth-unified
  // Requests to /api/auth/register-identity will be routed directly to the register-identity function

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
  if ((normalizedPath.endsWith('/auth/session') || normalizedPath.endsWith('/api/auth/session')) && method === 'GET') {
    return {
      inline: true,
      endpoint: 'session'
    };
  }

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

// SECURE JWT VERIFICATION FUNCTION (shared between signin and session validation)
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

    // Validate required claims (be flexible with username since it might be hashed or fallback)
    if (!payload.userId) {
      throw new Error('Invalid token payload - missing userId claim');
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

// SECURE JWT CREATION FUNCTION
async function createSecureJWT(payload) {
  try {
    // Import jose library for secure JWT creation
    const { SignJWT } = await import('jose');

    // Configuration - SECURITY FIX: Fail fast if JWT_SECRET is missing
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is required');
    }
    const JWT_ISSUER = process.env.JWT_ISSUER || 'satnam.pub';
    const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'satnam.pub';

    // Create secret key
    const secret = new TextEncoder().encode(JWT_SECRET);

    // Create JWT with proper claims
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime('24h') // 24 hours
      .sign(secret);

    console.log('✅ Secure JWT created successfully');
    return jwt;

  } catch (error) {
    console.error('❌ JWT creation error:', error.message);
    throw new Error(`JWT creation failed: ${error.message}`);
  }
}

// Inline signin implementation for reliability
async function handleSigninInline(event, context, corsHeaders) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { nip05, password } = body;

    console.log('🔄 Inline signin attempt:', { nip05 });
    console.log('🔍 Environment debug:', {
      JWT_SECRET: !!process.env.JWT_SECRET,
      DUID_SERVER_SECRET: !!process.env.DUID_SERVER_SECRET,
      NODE_ENV: process.env.NODE_ENV
    });

    // Validate input
    if (!nip05 || !password) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'NIP-05 and password are required'
        })
      };
    }

    // Import required modules dynamically - SECURITY FIX: Use proper named imports for ESM
    const { pbkdf2: pbkdf2Cb, timingSafeEqual } = await import('node:crypto');
    const { promisify } = await import('node:util');
    const pbkdf2 = promisify(pbkdf2Cb);

    // Generate DUID using canonical generator (consistent with registration)
    const { generateDUIDFromNIP05 } = await import('../../lib/security/duid-generator.js');
    const userDUID = await generateDUIDFromNIP05(nip05);

    // Get Supabase client (try both prefixed and non-prefixed env vars)
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(`Supabase configuration missing: URL=${!!supabaseUrl}, KEY=${!!supabaseKey}`);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Look up user by DUID
    const { data: user, error: userError } = await supabase
      .from('user_identities')
      .select('*')
      .eq('id', userDUID)
      .single();

    if (userError || !user) {
      console.log('❌ User not found:', { nip05, userDUID: userDUID.substring(0, 8) });
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'User not found',
          registerEndpoint: '/identity-forge'
        })
      };
    }

    console.log('🔍 User data debug:', {
      id: user.id?.substring(0, 8),
      username: user.username,
      nip05: user.nip05,
      role: user.role,
      hasPasswordHash: !!user.password_hash,
      hasPasswordSalt: !!user.password_salt
    });

    // Verify password (match registration format: base64 encoding) - SECURITY FIX: Use constant-time comparison
    const derivedKey = await pbkdf2(password, user.password_salt, 100000, 64, 'sha512');
    const storedHash = Buffer.from(user.password_hash, 'base64');
    const isValidPassword =
      storedHash.length === derivedKey.length &&
      timingSafeEqual(derivedKey, storedHash);

    if (!isValidPassword) {
      console.log('❌ Invalid password for user:', nip05);
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Invalid credentials'
        })
      };
    }

    // Create secure JWT token with UNIFIED FORMAT compatible with frontend SecureTokenManager
    // Generate required fields that frontend SecureTokenManager.parseTokenPayload() expects
    const { randomBytes, createHmac } = await import('node:crypto');
    const sessionId = randomBytes(16).toString('hex'); // Generate random session ID
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is required');
    }
    const hashedId = createHmac('sha256', JWT_SECRET)
      .update(`${user.id}|${sessionId}`)
      .digest('hex');

    // Handle both privacy-first schema (hashed fields) and regular schema
    const token = await createSecureJWT({
      // FRONTEND-REQUIRED FIELDS (SecureTokenManager.parseTokenPayload expects these)
      userId: user.id,
      hashedId: hashedId, // Required by frontend - HMAC of userId|sessionId
      type: 'access', // Required by frontend - token type
      sessionId: sessionId, // Required by frontend - unique session identifier
      nip05: user.nip05 || user.hashed_nip05 || 'unknown', // Required by frontend

      // BACKEND-REQUIRED FIELDS (for compatibility with other endpoints)
      username: user.username || user.hashed_username || 'unknown', // Handle both schemas
      role: user.role || 'private'
    });

    console.log('✅ Inline signin successful:', { username: user.username, role: user.role });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Authentication successful',
        user: {
          id: user.id,
          username: user.username,
          nip05: user.nip05,
          role: user.role
        },
        session: {
          token,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        }
      })
    };

  } catch (error) {
    console.error('❌ Inline signin error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Authentication service temporarily unavailable',
        debug: {
          message: error.message,
          timestamp: new Date().toISOString()
        }
      })
    };
  }
}

// Inline session validation implementation
async function handleSessionInline(event, context, corsHeaders) {
  if (event.httpMethod !== 'GET') {
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

    // SECURE JWT VERIFICATION
    let payload;
    try {
      payload = await verifyJWT(token);
    } catch (jwtError) {
      console.error('❌ Session JWT verification failed:', jwtError.message);
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

    console.log('✅ Session validation successful:', { userId: payload.userId, username: payload.username });

    // FIXED: Return response format that matches frontend expectations
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          authenticated: true,
          user: {
            id: payload.userId,
            username: payload.username,
            nip05: payload.nip05,
            role: payload.role,
            is_active: true // Assume active if token is valid
          },
          accountActive: true, // User is active if they have a valid token
          sessionValid: true,
          sessionToken: null, // Don't return the token in session validation
          lastValidated: Date.now()
        },
        session: {
          valid: true,
          expiresAt: new Date(payload.exp * 1000).toISOString()
        }
      })
    };

  } catch (error) {
    console.error('❌ Session validation error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Session validation failed',
        debug: {
          message: error.message,
          timestamp: new Date().toISOString()
        }
      })
    };
  }
}
