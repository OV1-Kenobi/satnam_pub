// Unified Family Wallet Handler - Netlify Function (ESM)
// Consolidates family-cashu-wallet, family-lightning-wallet, and family-fedimint-wallet
// Uses dynamic imports to load actual implementations only when called to reduce build memory usage

import { RATE_LIMITS, checkRateLimit, createRateLimitIdentifier, getClientIP } from './utils/enhanced-rate-limiter.ts';
import { createRateLimitErrorResponse, generateRequestId, logError } from './utils/error-handler.ts';
import { errorResponse, getSecurityHeaders, preflightResponse } from './utils/security-headers.ts';

// Security utilities (Phase 2 hardening)

export const handler = async (event, context) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(event.headers || {});
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log('🚀 Family wallet handler started:', {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  // Handle CORS preflight
  if ((event.httpMethod || 'GET').toUpperCase() === 'OPTIONS') {
    return preflightResponse(requestOrigin);
  }

  try {
    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitAllowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.WALLET_OPERATIONS
    );

    if (!rateLimitAllowed) {
      logError(new Error('Rate limit exceeded'), {
        requestId,
        endpoint: 'family-wallet-unified',
        method: event.httpMethod,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    const method = (event.httpMethod || 'GET').toUpperCase();
    const path = event.path || '';

    // Route resolution for family wallet operations
    const target = resolveFamilyWalletRoute(path, method);
    if (!target) {
      return errorResponse(
        404,
        'Family wallet endpoint not found',
        requestId,
        requestOrigin
      );
    }

    // MEMORY OPTIMIZATION: Use runtime dynamic import to prevent bundling heavy modules
    let targetHandler;
    try {
      const mod = await import(target.module);
      targetHandler = mod.handler || mod.default;
    } catch (importError) {
      console.error(`Failed to import family wallet module: ${target.module}`, importError);
      return errorResponse(
        500,
        'Family wallet service temporarily unavailable',
        requestId,
        requestOrigin
      );
    }

    if (typeof targetHandler !== 'function') {
      return errorResponse(
        500,
        'Family wallet handler not available',
        requestId,
        requestOrigin
      );
    }

    // Delegate to target handler with context preservation
    const response = await targetHandler(event, context);

    // Ensure CORS headers are present in response
    const securityHeaders = getSecurityHeaders(requestOrigin);
    if (response && typeof response === 'object') {
      return {
        ...response,
        headers: {
          ...(response.headers || {}),
          ...securityHeaders
        }
      };
    }

    return {
      statusCode: 200,
      headers: securityHeaders,
      body: typeof response === 'string' ? response : JSON.stringify(response)
    };

  } catch (error) {
    logError(error, {
      requestId,
      endpoint: 'family-wallet-unified',
      method: event.httpMethod,
    });
    return errorResponse(
      500,
      'Family wallet service error',
      requestId,
      requestOrigin
    );
  }
};

/**
 * Resolve family wallet route to appropriate handler module
 * Supports cashu, lightning, and fedimint wallet operations for family federations
 * @param {string} path - Request path
 * @param {string} method - HTTP method
 * @returns {Object|null} Target module info or null if not found
 */
function resolveFamilyWalletRoute(path, method) {
  // Normalize path for consistent matching
  const normalizedPath = path.toLowerCase();

  // Family Cashu wallet operations
  if (normalizedPath.includes('/family/cashu/wallet') || normalizedPath.includes('/api/family/cashu/wallet')) {
    return {
      module: '../functions_lazy/family-cashu-wallet.js',
      walletType: 'cashu'
    };
  }

  // Family Lightning wallet operations
  if (normalizedPath.includes('/family/lightning/wallet') || normalizedPath.includes('/api/family/lightning/wallet')) {
    return {
      module: '../functions_lazy/family-lightning-wallet.js',
      walletType: 'lightning'
    };
  }

  // Family Fedimint wallet operations
  if (normalizedPath.includes('/family/fedimint/wallet') || normalizedPath.includes('/api/family/fedimint/wallet')) {
    return {
      module: '../functions_lazy/family-fedimint-wallet.js',
      walletType: 'fedimint'
    };
  }

  // No matching route found
  return null;
}
