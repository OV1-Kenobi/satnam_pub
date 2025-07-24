/**
 * API Route Utilities for Satnam.pub - Sovereign Bitcoin Identity Platform
 * MASTER CONTEXT COMPLIANCE: Browser-only serverless architecture with privacy-first principles
 * Converted from TypeScript to JavaScript with comprehensive JSDoc
 * 
 * ARCHITECTURE COMPLIANCE:
 * ✅ Browser-Based Serverless Environment
 * ✅ ONLY browser-compatible APIs
 * ✅ NO Node.js modules or patterns
 * ✅ All backend logic in Netlify Functions
 * ✅ JavaScript (.js) for API utilities
 */

/**
 * Environment variable getter with browser compatibility
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key) {
  // Primary: import.meta.env for Vite/browser environments
  if (typeof window !== 'undefined' && window.import && window.import.meta && window.import.meta.env) {
    return window.import.meta.env[key];
  }
  // Secondary: process.env for Node.js environments
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

import { IdentityAPI } from "./identity-endpoints.js";

/**
 * @typedef {Object} NetlifyEvent
 * @property {string} httpMethod - HTTP method
 * @property {string} path - Request path
 * @property {Object} headers - Request headers
 * @property {Object} queryStringParameters - Query parameters
 * @property {string} body - Request body
 * @property {boolean} isBase64Encoded - Whether body is base64 encoded
 */

/**
 * @typedef {Object} NetlifyContext
 * @property {string} requestId - Request ID
 * @property {Object} identity - User identity
 * @property {string} functionName - Function name
 */

/**
 * @typedef {Object} NetlifyResponse
 * @property {number} statusCode - HTTP status code
 * @property {Object} headers - Response headers
 * @property {string} body - Response body
 * @property {boolean} [isBase64Encoded] - Whether body is base64 encoded
 */

/**
 * @typedef {function(NetlifyEvent, NetlifyContext): Promise<NetlifyResponse>} NetlifyHandler
 */

/**
 * @typedef {Object} APIResponse
 * @template T
 * @property {boolean} success - Whether the operation was successful
 * @property {T} [data] - Response data if successful
 * @property {string} [error] - Error message if failed
 * @property {string} [message] - Additional message
 */

/**
 * @typedef {Object} RouteConfig
 * @property {string} method - HTTP method
 * @property {string} path - Route path
 * @property {NetlifyHandler} handler - Route handler
 * @property {boolean} [requiresAuth] - Whether route requires authentication
 * @property {string[]} [allowedRoles] - Allowed user roles
 */

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
 * Create standard CORS headers for API responses
 * @param {Object} [additionalHeaders] - Additional headers to include
 * @returns {Object} CORS headers
 */
export function createCORSHeaders(additionalHeaders = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
    ...additionalHeaders
  };
}

/**
 * Create a standardized API response
 * @template T
 * @param {boolean} success - Whether the operation was successful
 * @param {T} [data] - Response data
 * @param {string} [error] - Error message
 * @param {string} [message] - Additional message
 * @param {number} [statusCode] - HTTP status code
 * @returns {NetlifyResponse} Formatted response
 */
export function createAPIResponse(success, data = null, error = null, message = null, statusCode = null) {
  const responseBody = {
    success,
    ...(data && { data }),
    ...(error && { error }),
    ...(message && { message }),
    timestamp: new Date().toISOString()
  };

  // Determine status code if not provided
  let status = statusCode;
  if (!status) {
    if (success) {
      status = 200;
    } else {
      status = error?.includes('not found') ? 404 :
               error?.includes('unauthorized') ? 401 :
               error?.includes('forbidden') ? 403 :
               error?.includes('validation') ? 400 : 500;
    }
  }

  return {
    statusCode: status,
    headers: createCORSHeaders(),
    body: JSON.stringify(responseBody)
  };
}

/**
 * Handle OPTIONS requests for CORS preflight
 * @param {NetlifyEvent} event - Netlify event
 * @param {NetlifyContext} context - Netlify context
 * @returns {NetlifyResponse} CORS preflight response
 */
export function handleCORSPreflight(event, context) {
  return {
    statusCode: 200,
    headers: createCORSHeaders(),
    body: ''
  };
}

/**
 * Extract and validate request body
 * @param {NetlifyEvent} event - Netlify event
 * @param {string[]} [requiredFields] - Required fields in body
 * @returns {{valid: boolean, data?: Object, error?: string}} Validation result
 */
export function validateRequestBody(event, requiredFields = []) {
  try {
    if (!event.body) {
      return {
        valid: false,
        error: 'Request body is required'
      };
    }

    const data = JSON.parse(event.body);

    // Check required fields
    for (const field of requiredFields) {
      if (!(field in data) || data[field] === null || data[field] === undefined) {
        return {
          valid: false,
          error: `Missing required field: ${field}`
        };
      }
    }

    return {
      valid: true,
      data
    };

  } catch (error) {
    return {
      valid: false,
      error: 'Invalid JSON in request body'
    };
  }
}

/**
 * Extract query parameters with type conversion
 * @param {NetlifyEvent} event - Netlify event
 * @param {Object} [schema] - Parameter schema with types
 * @returns {Object} Parsed query parameters
 */
export function extractQueryParams(event, schema = {}) {
  const params = event.queryStringParameters || {};
  const result = {};

  for (const [key, value] of Object.entries(params)) {
    const expectedType = schema[key];
    
    if (expectedType === 'number') {
      const num = Number(value);
      result[key] = isNaN(num) ? value : num;
    } else if (expectedType === 'boolean') {
      result[key] = value === 'true' || value === '1';
    } else if (expectedType === 'array') {
      result[key] = value ? value.split(',').map(s => s.trim()) : [];
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Create a route handler with common middleware
 * @param {NetlifyHandler} handler - Route handler function
 * @param {Object} [options] - Handler options
 * @param {boolean} [options.requiresAuth] - Whether route requires authentication
 * @param {string[]} [options.allowedMethods] - Allowed HTTP methods
 * @param {string[]} [options.requiredFields] - Required body fields
 * @returns {NetlifyHandler} Enhanced handler with middleware
 */
export function createRouteHandler(handler, options = {}) {
  return async (event, context) => {
    try {
      // Handle CORS preflight
      if (event.httpMethod === 'OPTIONS') {
        return handleCORSPreflight(event, context);
      }

      // Check allowed methods
      if (options.allowedMethods && !options.allowedMethods.includes(event.httpMethod)) {
        return createAPIResponse(
          false,
          null,
          `Method ${event.httpMethod} not allowed`,
          null,
          405
        );
      }

      // Validate request body if required fields specified
      if (options.requiredFields && options.requiredFields.length > 0) {
        const bodyValidation = validateRequestBody(event, options.requiredFields);
        if (!bodyValidation.valid) {
          return createAPIResponse(
            false,
            null,
            bodyValidation.error,
            null,
            400
          );
        }
        // Attach validated data to event for handler use
        event.validatedBody = bodyValidation.data;
      }

      // TODO: Add authentication middleware if requiresAuth is true
      if (options.requiresAuth) {
        // Authentication logic would go here
        // For now, we'll skip this as it requires JWT implementation
      }

      // Call the actual handler
      return await handler(event, context);

    } catch (error) {
      console.error('Error in route handler:', error);
      return createAPIResponse(
        false,
        null,
        'Internal server error',
        null,
        500
      );
    }
  };
}

/**
 * Create identity-related route handlers
 * @returns {Object} Object containing identity route handlers
 */
export function createIdentityRoutes() {
  return {
    /**
     * GET /api/identity/profile/:npub
     */
    getProfile: createRouteHandler(
      async (event, context) => {
        const npub = event.path.split('/').pop();
        if (!npub) {
          return createAPIResponse(false, null, 'npub parameter is required', null, 400);
        }

        const result = await IdentityAPI.getUserProfile(npub);
        return createAPIResponse(result.success, result.data, result.error);
      },
      { allowedMethods: ['GET'] }
    ),

    /**
     * POST /api/identity/register
     */
    register: createRouteHandler(
      async (event, context) => {
        const result = await IdentityAPI.registerNewAccount(event.validatedBody);
        return createAPIResponse(result.success, result.data, result.error);
      },
      { 
        allowedMethods: ['POST'],
        requiredFields: ['username', 'password']
      }
    ),

    /**
     * PUT /api/identity/profile
     */
    updateProfile: createRouteHandler(
      async (event, context) => {
        const { npub, ...updates } = event.validatedBody;
        const result = await IdentityAPI.updateUserProfile(npub, updates);
        return createAPIResponse(result.success, result.data, result.error);
      },
      { 
        allowedMethods: ['PUT'],
        requiredFields: ['npub'],
        requiresAuth: true
      }
    )
  };
}

/**
 * Log API request for debugging and monitoring
 * @param {NetlifyEvent} event - Netlify event
 * @param {NetlifyContext} context - Netlify context
 * @param {NetlifyResponse} response - Response object
 */
export function logAPIRequest(event, context, response) {
  const logData = {
    timestamp: new Date().toISOString(),
    method: event.httpMethod,
    path: event.path,
    statusCode: response.statusCode,
    requestId: context.requestId,
    userAgent: event.headers['user-agent'],
    // Don't log sensitive data
    hasBody: !!event.body,
    queryParams: Object.keys(event.queryStringParameters || {})
  };

  console.log('API Request:', JSON.stringify(logData));
}

// Export utility functions
export { 
  generatePrivacyHash,
  getEnvVar
};
