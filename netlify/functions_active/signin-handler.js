/**
 * Sign-In Handler for Netlify Functions
 * Handles NIP-05/password authentication
 */

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import {
    RATE_LIMITS,
    checkRateLimit,
    createRateLimitIdentifier,
    getClientIP,
} from "./utils/enhanced-rate-limiter.ts";
import {
    createAuthErrorResponse,
    createRateLimitErrorResponse,
    createValidationErrorResponse,
    generateRequestId,
    logError,
} from "./utils/error-handler.ts";
import {
    errorResponse,
    jsonResponse,
    preflightResponse,
} from "./utils/security-headers.ts";

// Import Netlify Functions utilities
const pbkdf2 = promisify(crypto.pbkdf2);

// Supabase client for database operations
let supabase;

async function getSupabase() {
  if (!supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }
  return supabase;
}

// DUID generation for user identification (must match canonical generator)
async function generateDUID(nip05Identifier) {
  const secret = process.env.DUID_SERVER_SECRET;
  if (!secret) {
    throw new Error('DUID_SERVER_SECRET not configured');
  }

  // CRITICAL: Must normalize exactly like canonical generator
  const identifier = nip05Identifier.trim().toLowerCase();

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(identifier);
  return hmac.digest('hex');
}

// Password verification
async function verifyPassword(password, hash, salt) {
  try {
    const derivedKey = await pbkdf2(password, salt, 100000, 64, 'sha512');
    const derivedHash = derivedKey.toString('hex');
    return derivedHash === hash;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

// SECURE JWT CREATION FUNCTION (compatible with auth-unified and frontend)
async function createSecureJWT(payload) {
  try {
    // Import jose library for secure JWT creation
    const { SignJWT } = await import('jose');

    // Configuration
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
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

    console.log('✅ Secure JWT created successfully for signin');
    return jwt;

  } catch (error) {
    console.error('❌ JWT creation error:', error.message);
    throw new Error(`JWT creation failed: ${error.message}`);
  }
}

const handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(event.headers);
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 Sign-in handler started:", {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return preflightResponse(requestOrigin);
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', requestId, requestOrigin);
  }

  // Database-backed rate limiting
  const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
  const rateLimitAllowed = await checkRateLimit(
    rateLimitKey,
    RATE_LIMITS.AUTH_SIGNIN
  );

  if (!rateLimitAllowed) {
    logError(new Error("Rate limit exceeded"), {
      requestId,
      endpoint: "signin-handler",
      method: event.httpMethod,
    });
    return createRateLimitErrorResponse(requestId, requestOrigin);
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { nip05, password, authMethod } = body;

    console.log('🔄 Sign-in attempt:', { nip05, authMethod });

    // Validate input
    if (!nip05 || !password) {
      return createValidationErrorResponse(
        'NIP-05 and password are required',
        requestId,
        requestOrigin
      );
    }

    // Generate DUID for user lookup
    const userDUID = await generateDUID(nip05);

    // Get database client
    const db = await getSupabase();

    // Set per-request RLS context for SELECT by DUID (safe fallback if helper missing)
    try {
      await db.rpc('app_set_config', {
        setting_name: 'app.lookup_user_duid',
        setting_value: userDUID,
        is_local: true,
      });
    } catch (e) {
      try {
        await db.rpc('set_app_config', {
          setting_name: 'app.lookup_user_duid',
          setting_value: userDUID,
          is_local: true,
        });
      } catch {}
    }

    // Look up user by DUID
    const { data: user, error: userError } = await db
      .from('user_identities')
      .select('*')
      .eq('id', userDUID)
      .single();

    if (userError || !user) {
      console.log('❌ User not found for NIP-05 identifier');
      return errorResponse(404, 'User not found', requestId, requestOrigin);
    }

    // Verify password
    const isValidPassword = await verifyPassword(
      password,
      user.password_hash,
      user.password_salt
    );

    if (!isValidPassword) {
      console.log('❌ Invalid password for user:', nip05);
      return createAuthErrorResponse(
        'Invalid credentials',
        requestId,
        requestOrigin
      );
    }

    // Create secure JWT token with UNIFIED FORMAT compatible with frontend SecureTokenManager
    // Generate required fields that frontend SecureTokenManager.parseTokenPayload() expects
    const sessionId = crypto.randomBytes(16).toString('hex'); // Generate random session ID
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
    const hashedId = crypto.createHmac('sha256', JWT_SECRET)
      .update(`${user.id}|${sessionId}`)
      .digest('hex');

    const tokenPayload = {
      // FRONTEND-REQUIRED FIELDS (SecureTokenManager.parseTokenPayload expects these)
      userId: user.id,
      hashedId: hashedId, // Required by frontend - HMAC of userId|sessionId
      type: 'access', // Required by frontend - token type
      sessionId: sessionId, // Required by frontend - unique session identifier
      nip05: user.nip05, // Required by frontend

      // BACKEND-REQUIRED FIELDS (for compatibility with auth-unified and other endpoints)
      username: user.username,
      role: user.role
    };

    const token = await createSecureJWT(tokenPayload);

    console.log('✅ Sign-in successful:', { username: user.username, role: user.role });

    return jsonResponse(200, {
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
    }, requestOrigin);

  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "signin-handler",
      method: event.httpMethod,
    });
    return errorResponse(500, 'Authentication service temporarily unavailable', requestId, requestOrigin);
  }
}

// ESM export
export { handler };

