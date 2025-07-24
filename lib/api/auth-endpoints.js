/**
 * Authentication API endpoints
 * MASTER CONTEXT COMPLIANCE: Browser-only serverless architecture with privacy-first principles
 * Converted from TypeScript to JavaScript with comprehensive JSDoc
 */

import { HybridAuth } from "../../netlify/functions/hybrid-auth";
import { createSupabaseClient } from "../supabase.js";

/**
 * Environment variable getter with browser compatibility
 * @param {string} key - Environment variable key
 * @param {string} [defaultValue] - Default value if not found
 * @returns {string} Environment variable value
 */
function getEnvVar(key, defaultValue = '') {
  // Primary: import.meta.env for Vite/browser environments
  if (typeof window !== 'undefined' && window.import && window.import.meta && window.import.meta.env) {
    return window.import.meta.env[key] || defaultValue;
  }
  // Secondary: process.env for Node.js environments
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }
  return defaultValue;
}

/**
 * @typedef {Object} APIResponse
 * @template T
 * @property {boolean} success - Whether the operation was successful
 * @property {T} [data] - Response data if successful
 * @property {string} [error] - Error message if failed
 * @property {string} [message] - Additional message
 */

/**
 * @typedef {Object} NostrEvent
 * @property {string} id - Event ID
 * @property {string} pubkey - Public key of event creator
 * @property {number} created_at - Unix timestamp
 * @property {number} kind - Event kind
 * @property {string[][]} tags - Event tags
 * @property {string} content - Event content
 * @property {string} sig - Event signature
 */

/**
 * @typedef {Object} NetlifyContext
 * @property {string} requestId - Request ID
 * @property {Object} identity - User identity
 * @property {string} functionName - Function name
 */

/**
 * Helper function to safely extract error message
 * @param {unknown} error - Error to extract message from
 * @returns {string} Error message
 */
function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unknown error occurred";
}

/**
 * Helper function to get user identity from database
 * IMPORTANT: userId must be a hashed UUID, not a readable userID
 * @param {string} userId - Hashed user ID
 * @param {import('@supabase/supabase-js').SupabaseClient} [client] - Supabase client
 * @returns {Promise<Object|null>} User identity or null
 */
async function getUserIdentity(userId, client) {
  if (!client) {
    client = await createSupabaseClient();
  }

  try {
    const { data, error } = await client
      .from("user_identities")
      .select("*")
      .eq("hashed_user_id", userId)
      .single();

    if (error) {
      console.error("Error fetching user identity:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error in getUserIdentity:", error);
    return null;
  }
}

/**
 * Generate a privacy-preserving hash using Web Crypto API
 * @param {string} data - Data to hash
 * @param {string} [salt] - Optional salt
 * @returns {Promise<string>} Hashed data
 */
async function generatePrivacyHash(data, salt = '') {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const dataToHash = encoder.encode(data + salt);
    const hash = await crypto.subtle.digest('SHA-256', dataToHash);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Fallback for environments without Web Crypto API
    let hash = 0;
    const str = data + salt;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Handle Nostr authentication endpoint
 * @param {Object} event - Netlify event
 * @param {NetlifyContext} context - Netlify context
 * @returns {Promise<APIResponse>} Authentication result
 */
export async function handleNostrAuth(event, context) {
  try {
    const hybridAuth = new HybridAuth();
    
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { nostrEvent, nip05 } = body;

      if (!nostrEvent) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
          },
          body: JSON.stringify({
            success: false,
            error: "Nostr event is required"
          })
        };
      }

      const result = await hybridAuth.authenticateWithNostr(nostrEvent, nip05);
      
      return {
        statusCode: result.success ? 200 : 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
        },
        body: JSON.stringify(result)
      };
    }

    // Handle OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
        },
        body: ''
      };
    }

    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: "Method not allowed"
      })
    };

  } catch (error) {
    console.error("Error in handleNostrAuth:", error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: getErrorMessage(error)
      })
    };
  }
}

/**
 * Handle OTP authentication endpoint
 * @param {Object} event - Netlify event
 * @param {NetlifyContext} context - Netlify context
 * @returns {Promise<APIResponse>} Authentication result
 */
export async function handleOTPAuth(event, context) {
  try {
    const hybridAuth = new HybridAuth();
    
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { npub, nip05, otpKey, otp } = body;

      if (otpKey && otp) {
        // Verify OTP
        const result = await hybridAuth.verifyOTP(otpKey, otp);
        
        return {
          statusCode: result.success ? 200 : 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
          },
          body: JSON.stringify(result)
        };
      } else if (npub) {
        // Send OTP
        const result = await hybridAuth.sendOTP(npub, nip05);
        
        return {
          statusCode: result.success ? 200 : 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
          },
          body: JSON.stringify(result)
        };
      }

      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: false,
          error: "Invalid request parameters"
        })
      };
    }

    // Handle OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
        },
        body: ''
      };
    }

    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: "Method not allowed"
      })
    };

  } catch (error) {
    console.error("Error in handleOTPAuth:", error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: getErrorMessage(error)
      })
    };
  }
}

// Export helper functions
export { generatePrivacyHash, getErrorMessage, getUserIdentity };

