/**
 * Atomic Swap API Endpoints
 * MASTER CONTEXT COMPLIANCE: Browser-only serverless architecture with privacy-first principles
 * Converted from TypeScript to JavaScript with comprehensive JSDoc
 */

import { SatnamInternalLightningBridge } from "../../src/lib/internal-lightning-bridge.js";

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
 * @typedef {Object} AtomicSwapRequest
 * @property {string} fromContext - Source context (fedimint/cashu)
 * @property {string} toContext - Target context (fedimint/cashu)
 * @property {number} amount - Amount to swap in satoshis
 * @property {string} swapType - Type of swap operation
 * @property {string} [fromToken] - Source token if applicable
 * @property {string} [toAddress] - Target address if applicable
 */

/**
 * @typedef {Object} AtomicSwapResult
 * @property {boolean} success - Whether the swap was successful
 * @property {string} [swapId] - Unique swap identifier
 * @property {string} [preimage] - Payment preimage
 * @property {string} [error] - Error message if failed
 * @property {Object} [details] - Additional swap details
 */

/**
 * @typedef {Object} SwapQuote
 * @property {number} inputAmount - Input amount in satoshis
 * @property {number} outputAmount - Output amount in satoshis
 * @property {number} fee - Swap fee in satoshis
 * @property {number} rate - Exchange rate
 * @property {number} expiresAt - Quote expiration timestamp
 */

/**
 * @typedef {Object} APIResponse
 * @template T
 * @property {boolean} success - Whether the operation was successful
 * @property {T} [data] - Response data if successful
 * @property {string} [error] - Error message if failed
 * @property {string} [message] - Additional message
 */

// Initialize the lightning bridge
const lightningBridge = new SatnamInternalLightningBridge();

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
 * Get a quote for an atomic swap
 * @param {Object} event - Netlify event object
 * @param {Object} context - Netlify context object
 * @returns {Promise<APIResponse<SwapQuote>>} Swap quote response
 */
export async function getSwapQuote(event, context) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { fromContext, toContext, amount, swapType } = body;

    // Validate request
    if (!fromContext || !toContext || !amount || !swapType) {
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
          error: "Missing required fields: fromContext, toContext, amount, swapType"
        })
      };
    }

    // Validate swap contexts
    const validContexts = ['fedimint', 'cashu'];
    if (!validContexts.includes(fromContext) || !validContexts.includes(toContext)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: false,
          error: "Invalid swap context. Must be 'fedimint' or 'cashu'"
        })
      };
    }

    // Calculate swap quote
    const quote = await calculateSwapQuote(fromContext, toContext, amount, swapType);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({
        success: true,
        data: quote
      })
    };

  } catch (error) {
    console.error("Error getting swap quote:", error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: "Failed to get swap quote"
      })
    };
  }
}

/**
 * Execute an atomic swap
 * @param {Object} event - Netlify event object
 * @param {Object} context - Netlify context object
 * @returns {Promise<APIResponse<AtomicSwapResult>>} Swap execution response
 */
export async function executeSwap(event, context) {
  try {
    const body = JSON.parse(event.body || '{}');
    const swapRequest = body;

    // Validate swap request
    const validation = validateSwapRequest(swapRequest);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: false,
          error: validation.error
        })
      };
    }

    // Generate unique swap ID
    const swapId = await generatePrivacyHash(
      `${swapRequest.fromContext}-${swapRequest.toContext}-${Date.now()}`
    );

    // Execute the atomic swap
    const swapResult = await lightningBridge.executeAtomicSwap({
      ...swapRequest,
      swapId
    });

    return {
      statusCode: swapResult.success ? 200 : 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify(swapResult)
    };

  } catch (error) {
    console.error("Error executing swap:", error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: "Failed to execute swap"
      })
    };
  }
}

/**
 * Get swap status by ID
 * @param {Object} event - Netlify event object
 * @param {Object} context - Netlify context object
 * @returns {Promise<APIResponse<Object>>} Swap status response
 */
export async function getSwapStatus(event, context) {
  try {
    const { swapId } = event.queryStringParameters || {};

    if (!swapId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: false,
          error: "Swap ID is required"
        })
      };
    }

    // Get swap status from lightning bridge
    const status = await lightningBridge.getSwapStatus(swapId);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({
        success: true,
        data: status
      })
    };

  } catch (error) {
    console.error("Error getting swap status:", error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: "Failed to get swap status"
      })
    };
  }
}

/**
 * Calculate swap quote based on contexts and amount
 * @private
 * @param {string} fromContext - Source context
 * @param {string} toContext - Target context
 * @param {number} amount - Amount to swap
 * @param {string} swapType - Type of swap
 * @returns {Promise<SwapQuote>} Calculated quote
 */
async function calculateSwapQuote(fromContext, toContext, amount, swapType) {
  // Base fee calculation (0.1% of amount)
  const baseFee = Math.floor(amount * 0.001);
  
  // Context-specific fees
  let contextFee = 0;
  if (fromContext === 'fedimint' && toContext === 'cashu') {
    contextFee = 100; // 100 sats for fedimint -> cashu
  } else if (fromContext === 'cashu' && toContext === 'fedimint') {
    contextFee = 150; // 150 sats for cashu -> fedimint
  }

  const totalFee = baseFee + contextFee;
  const outputAmount = amount - totalFee;
  const rate = outputAmount / amount;

  return {
    inputAmount: amount,
    outputAmount: Math.max(0, outputAmount),
    fee: totalFee,
    rate,
    expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
  };
}

/**
 * Validate atomic swap request
 * @private
 * @param {AtomicSwapRequest} request - Swap request to validate
 * @returns {Object} Validation result
 */
function validateSwapRequest(request) {
  if (!request.fromContext || !request.toContext) {
    return { valid: false, error: "Missing swap contexts" };
  }

  if (!request.amount || request.amount <= 0) {
    return { valid: false, error: "Invalid amount" };
  }

  if (request.amount < 1000) {
    return { valid: false, error: "Minimum swap amount is 1000 sats" };
  }

  if (request.amount > 10000000) {
    return { valid: false, error: "Maximum swap amount is 10M sats" };
  }

  return { valid: true };
}

// Export utility functions
export { generatePrivacyHash, calculateSwapQuote, validateSwapRequest };
