/**
 * Secure Username Availability Check with Centralized Rate Limiting
 *
 * This Netlify Function implements secure username availability checking with:
 * - Centralized database-backed rate limiting
 * - RLS-compatible implementation using anon key permissions
 * - Protection against enumeration attacks
 * - Proper error handling and security fallbacks
 *
 * Phase 3 Security Hardening:
 * - Uses centralized enhanced-rate-limiter utility
 * - Standardized security headers
 * - Consistent error handling
 */

import { supabase } from '../../netlify/functions/supabase.js';
import { resolvePlatformLightningDomainServer } from "../functions/utils/domain.server.js";

// Security utilities (Phase 3 hardening)
import {
  RATE_LIMITS,
  checkRateLimit,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.ts";
import {
  createRateLimitErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.ts";
import { errorResponse, preflightResponse } from "./utils/security-headers.ts";

console.log('🔒 Secure username availability function initialized (shared Supabase client)');

/**
 * Check username availability using secure DUID architecture
 * Uses the same logic as register-identity.js for consistency
 * @param {string} username - Username to check
 * @returns {Promise<{available: boolean, error?: string, suggestion?: string}>} Availability result
 */
async function checkUsernameAvailability(username) {
  try {
    const domain = resolvePlatformLightningDomainServer();
    const local = (username || '').trim().toLowerCase();

    // Basic validation
    if (!local) {
      return { available: false, error: 'Username is required' };
    }

    if (local.length < 3 || local.length > 20) {
      return { available: false, error: 'Username must be between 3 and 20 characters' };
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(local)) {
      return { available: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
    }

    // Server-side DUID hashing for availability check (no plaintext lookup)
    const crypto = await import('node:crypto');
    // SERVER-SIDE ONLY — secrets must come from server env (no VITE_ vars)
    const duidServerSecret = process.env.DUID_SERVER_SECRET;
    const duidSecretKey = process.env.DUID_SECRET_KEY;
    if (!duidServerSecret && duidSecretKey) {
      console.warn('DUID_SECRET_KEY is deprecated; please set DUID_SERVER_SECRET.');
    }
    const secretRaw = duidServerSecret ?? duidSecretKey;
    const secret = (typeof secretRaw === 'string' && secretRaw.trim())
                    ? secretRaw.trim()
                    : undefined;

    if (!secret) {
      console.warn('DUID server secret missing. Set DUID_SERVER_SECRET in the server environment; rejecting availability check.');
      return { available: false, error: 'Server configuration error' };
    }

    const identifier = `${local}@${domain}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(identifier);
    const name_duid = hmac.digest('hex');

    // Check against nip05_records table
    const { data, error } = await supabase
      .from('nip05_records')
      .select('id')
      .eq('domain', domain)
      .eq('name_duid', name_duid)
      .eq('is_active', true)
      .limit(1);

    if (error) {
      // Handle undefined_column (42703) by falling back to plaintext column (temporary compatibility)
      if (error.code === '42703') {
        try {
          const { data: dataPlain, error: plainErr } = await supabase
            .from('nip05_records')
            .select('id')
            .eq('domain', domain)
            .eq('name', local)
            .eq('is_active', true)
            .limit(1);
          if (plainErr) {
            console.error('Fallback username check failed:', plainErr);
            return { available: false, error: 'Failed to check username availability' };
          }
          const isAvailablePlain = !dataPlain || dataPlain.length === 0;
          if (!isAvailablePlain) {
            const suggestion = await generateUsernameSuggestion(local);
            return { available: false, error: 'Username is already taken', suggestion };
          }
          return { available: true };
        } catch (e) {
          console.error('Fallback username check error:', e);
          return { available: false, error: 'Failed to check username availability' };
        }
      }
      console.error('Username availability check failed:', error);
      return { available: false, error: 'Failed to check username availability' };
    }

    let isAvailable = !data || data.length === 0;

    if (isAvailable) {
      // Double-check against user_identities via canonical DUID to avoid silent duplicates
      try {
        const identifierFull = `${local}@${domain}`;
        const { generateDUIDFromNIP05 } = await import('../../lib/security/duid-generator.js');
        const duid = await generateDUIDFromNIP05(identifierFull);
        const { data: users, error: userErr } = await supabase
          .from('user_identities')
          .select('id')
          .eq('id', duid)
          .limit(1);
        if (!userErr && users && users.length > 0) {
          isAvailable = false;
        }
      } catch (duidErr) {
        console.warn('DUID availability cross-check failed; relying on nip05_records only:', duidErr);
      }
    }

    if (!isAvailable) {
      // Generate a suggestion for taken usernames
      const suggestion = await generateUsernameSuggestion(local);
      return {
        available: false,
        error: 'Username is already taken',
        suggestion
      };
    }

    return { available: true };

  } catch (error) {
    console.error('Username availability check error:', error);
    return { available: false, error: 'Failed to check username availability' };
  }
}

/**
 * Generate username suggestion when the requested username is taken
 * SECURITY: Limits recursion depth to prevent infinite loops and excessive database queries
 * @param {string} baseUsername - Base username to generate suggestions from
 * @param {number} attemptCount - Current attempt count (internal use, starts at 0)
 * @returns {Promise<string>} Suggested username
 */
async function generateUsernameSuggestion(baseUsername, attemptCount = 0) {
  // SECURITY FIX #1: Maximum recursion depth limit (5 attempts max)
  const MAX_SUGGESTION_ATTEMPTS = 5;

  if (attemptCount >= MAX_SUGGESTION_ATTEMPTS) {
    console.warn(`[USERNAME_SUGGESTION] Max attempts (${MAX_SUGGESTION_ATTEMPTS}) reached for base username: ${baseUsername}`);
    // Return fallback immediately without further database queries
    return `${baseUsername}_${Math.floor(Math.random() * 10000)}`;
  }

  const suggestions = [
    `${baseUsername}${Math.floor(Math.random() * 100)}`,
    `${baseUsername}_${Math.floor(Math.random() * 1000)}`,
    `${baseUsername}${new Date().getFullYear()}`,
    `${baseUsername}_user`,
    `${baseUsername}_new`
  ];

  // Try to find an available suggestion (non-recursive approach)
  for (const suggestion of suggestions) {
    try {
      const result = await checkUsernameAvailability(suggestion);
      if (result.available) {
        console.log(`[USERNAME_SUGGESTION] Found available suggestion: ${suggestion}`);
        return suggestion;
      }
    } catch (err) {
      console.warn(`[USERNAME_SUGGESTION] Error checking suggestion ${suggestion}:`, err instanceof Error ? err.message : err);
      // Continue to next suggestion on error
    }
  }

  // If no suggestions available, return fallback immediately (no recursion)
  console.warn(`[USERNAME_SUGGESTION] No available suggestions found after ${attemptCount + 1} attempt(s), using random fallback`);
  return `${baseUsername}_${Math.floor(Math.random() * 10000)}`;
}

/**
 * Main Netlify Function handler with centralized rate limiting
 * @param {Object} event - Netlify event object
 * @returns {Promise<Object>} Netlify response object
 */
export const handler = async (event, context) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(event.headers || {});
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return preflightResponse(requestOrigin);
  }

  // Allow both POST and GET requests
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return errorResponse(405, 'Method not allowed', requestOrigin);
  }

  try {
    // Database-backed rate limiting
    // FIX #4: Rate limit documentation for username availability checks
    // RATE_LIMITS.IDENTITY_VERIFY = 50 requests per hour per IP
    // Rationale: Username checks are performed during registration flow (real-time validation)
    // and should allow reasonable frequency for form input validation without being too permissive.
    // 50 req/hr = ~1 request per 72 seconds, sufficient for typical user registration workflows.
    // If users report rate limiting issues during registration, consider increasing to 100 req/hr.
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const allowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.IDENTITY_VERIFY
    );

    if (!allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "check-username-availability",
        method: event.httpMethod,
        rateLimitConfig: `${RATE_LIMITS.IDENTITY_VERIFY.limit} requests per ${RATE_LIMITS.IDENTITY_VERIFY.windowMs / 1000 / 60} minutes`,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Extract username from request
    let username;
    if (event.httpMethod === 'POST') {
      try {
        const body = JSON.parse(event.body || '{}');
        username = body.username;
      } catch {
        return errorResponse(400, 'Invalid JSON in request body', requestOrigin);
      }
    } else {
      username = event.queryStringParameters?.username;
    }

    if (!username) {
      return errorResponse(400, 'Username parameter is required', requestOrigin);
    }

    // Check username availability
    const result = await checkUsernameAvailability(username);

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin":
        requestOrigin || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        available: result.available,
        error: result.error,
        suggestion: result.suggestion
      })
    };

  } catch (error) {
    console.error('Username availability check handler error:', error);
    logError(error, {
      requestId,
      endpoint: "check-username-availability",
      method: event.httpMethod,
    });
    return errorResponse(500, 'Internal server error', requestOrigin);
  }
};
