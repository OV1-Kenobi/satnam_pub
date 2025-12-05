/**
 * Family Foundry Netlify Function Wrapper
 * 
 * This function proxies requests to the api/family/foundry.js handler.
 * The actual business logic is in api/family/foundry.js.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * - ESM module format (no CommonJS)
 * - Delegates to existing api/family/foundry.js handler
 */

import foundryHandler from '../../api/family/foundry.js';

/**
 * Netlify Function handler
 * @param {Object} event - Netlify event object
 * @param {Object} context - Netlify context object
 * @returns {Promise<Object>} Response object
 */
export async function handler(event, context) {
  try {
    // Delegate to the actual foundry handler
    return await foundryHandler(event, context);
  } catch (error) {
    console.error('Family foundry function error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}

