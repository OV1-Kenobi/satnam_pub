/**
 * RESTORED: Secure Username Availability Check with Database-Based Rate Limiting
 *
 * This Netlify Function implements secure username availability checking with:
 * - Database-based rate limiting that persists across serverless function invocations
 * - RLS-compatible implementation using anon key permissions
 * - Protection against enumeration attacks
 * - Proper error handling and security fallbacks
 *
 * SECURITY FEATURES RESTORED:
 * - Persistent rate limiting using Supabase rate_limits table
 * - Client isolation and tracking
 * - DUID-based privacy-preserving username checks
 * - Comprehensive logging for security monitoring
 */

import { supabase } from '../../netlify/functions/supabase.js';

console.log('🔒 Secure username availability function initialized (shared Supabase client)');
/**
 * RESTORED: Secure database-based rate limiting for serverless environment
 * Uses Supabase with RLS policies to maintain persistence across function invocations
 * This prevents security vulnerabilities from in-memory rate limiting that resets on cold starts
 */
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute (security-focused)

async function checkRateLimit(clientIP) {
  const now = Date.now();
  const clientKey = clientIP || 'unknown';
  const endpoint = 'check-username-availability';

  try {
    console.log('🔒 Checking database-based rate limit for client:', clientKey);

    // Query existing rate limit record
    const { data, error } = await supabase
      .from('rate_limits')
      .select('count, reset_time')
      .eq('client_key', clientKey)
      .eq('endpoint', endpoint)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Rate limit check error:', error);
      // SECURITY: Allow request on database error to avoid blocking legitimate users
      // but log the error for monitoring
      return true;
    }

    if (!data || now > data.reset_time) {
      // Create or reset rate limit record
      console.log('🔒 Creating/resetting rate limit for client:', clientKey);

      const { error: upsertError } = await supabase
        .from('rate_limits')
        .upsert({
          client_key: clientKey,
          endpoint: endpoint,
          count: 1,
          reset_time: now + RATE_LIMIT_WINDOW,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'client_key,endpoint'
        });

      if (upsertError) {
        console.error('Rate limit upsert error:', upsertError);
        // SECURITY: Allow request on database error but log for monitoring
        return true;
      }

      return true;
    }

    if (data.count >= RATE_LIMIT_MAX_REQUESTS) {
      console.warn('🚫 Rate limit exceeded for client:', clientKey, 'count:', data.count);
      return false;
    }

    // Increment count
    console.log('🔒 Incrementing rate limit count for client:', clientKey, 'current:', data.count);

    const { error: updateError } = await supabase
      .from('rate_limits')
      .update({
        count: data.count + 1,
        updated_at: new Date().toISOString()
      })
      .eq('client_key', clientKey)
      .eq('endpoint', endpoint);

    if (updateError) {
      console.error('Rate limit update error:', updateError);
      // SECURITY: Allow request on database error but log for monitoring
      return true;
    }

    return true;

  } catch (error) {
    console.error('Rate limiting system error:', error);
    // SECURITY: Allow request on system error to avoid blocking legitimate users
    // but log the error for monitoring
    return true;
  }
}

/**
 * Check username availability using secure DUID architecture
 * Uses the same logic as register-identity.js for consistency
 * @param {string} username - Username to check
 * @returns {Promise<{available: boolean, error?: string, suggestion?: string}>} Availability result
 */
async function checkUsernameAvailability(username) {
  try {
    const domain = 'satnam.pub';
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
    const hashed_nip05 = hmac.digest('hex');

    // Check against nip05_records table
    const { data, error } = await supabase
      .from('nip05_records')
      .select('id')
      .eq('domain', domain)
      .eq('hashed_nip05', hashed_nip05)
      .eq('is_active', true)
      .limit(1);

    if (error) {
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
 * @param {string} baseUsername - Base username to generate suggestions from
 * @returns {Promise<string>} Suggested username
 */
async function generateUsernameSuggestion(baseUsername) {
  const suggestions = [
    `${baseUsername}${Math.floor(Math.random() * 100)}`,
    `${baseUsername}_${Math.floor(Math.random() * 1000)}`,
    `${baseUsername}${new Date().getFullYear()}`,
    `${baseUsername}_user`,
    `${baseUsername}_new`
  ];

  // Try to find an available suggestion
  for (const suggestion of suggestions) {
    const result = await checkUsernameAvailability(suggestion);
    if (result.available) {
      return suggestion;
    }
  }

  // Fallback to random number
  return `${baseUsername}_${Math.floor(Math.random() * 10000)}`;
}

/**
 * RESTORED: Main Netlify Function handler with secure database-based rate limiting
 * @param {Object} event - Netlify event object
 * @returns {Promise<Object>} Netlify response object
 */
export const handler = async (event, context) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  // Allow both POST and GET requests
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Method not allowed'
      })
    };
  }

  try {
    // RESTORED: Secure database-based rate limiting
    const clientIP = event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown';
    if (!(await checkRateLimit(clientIP))) {
      return {
        statusCode: 429,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Too many requests. Please try again later.'
        })
      };
    }

    // Parse request data based on HTTP method
    let requestData;
    if (event.httpMethod === 'POST') {
      try {
        requestData = JSON.parse(event.body || '{}');
      } catch (parseError) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body'
          })
        };
      }
    } else {
      // For GET requests, extract from query parameters
      requestData = event.queryStringParameters || {};
    }

    const { username } = requestData;

    if (!username || typeof username !== 'string') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Username is required and must be a string'
        })
      };
    }

    // Check username availability
    const result = await checkUsernameAvailability(username);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        available: result.available,
        error: result.error,
        suggestion: result.suggestion
      })
    };

  } catch (error) {
    console.error('Username availability check handler error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error'
      })
    };
  }
};
