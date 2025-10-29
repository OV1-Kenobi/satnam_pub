// Netlify Function adapter for /api/communications/check-giftwrap-support (GET)
// Bridges to API route if present; otherwise returns 404 JSON

// Security utilities (Phase 2 hardening)
import { RATE_LIMITS, checkRateLimit, createRateLimitIdentifier, getClientIP } from '../utils/enhanced-rate-limiter.ts';
import { createRateLimitErrorResponse, generateRequestId, logError } from '../utils/error-handler.ts';
import { errorResponse, getSecurityHeaders, preflightResponse } from '../utils/security-headers.ts';

export const handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(event.headers || {});
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log('🚀 Check giftwrap support handler started:', {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  try {
    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitResult = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.IDENTITY_VERIFY
    );

    if (!rateLimitResult.allowed) {
      logError(new Error('Rate limit exceeded'), {
        requestId,
        endpoint: 'check-giftwrap-support',
        method: event.httpMethod,
      });
      return createRateLimitErrorResponse(rateLimitResult, requestId, requestOrigin);
    }

    const headers = getSecurityHeaders({ origin: requestOrigin });
    const mod = await import("../../../api/communications/check-giftwrap-support.js");
    const handler = mod.default || mod.handler || mod;
    return await Promise.resolve(handler({
      method: event.httpMethod,
      headers: event.headers || {},
      url: event.path || "/api/communications/check-giftwrap-support",
      query: event.queryStringParameters || {},
    }, {
      _status: 200,
      _headers: headers,
      status(code) { this._status = code; return this; },
      setHeader(k, v) { this._headers[k] = v; },
      json(payload) { return { statusCode: this._status, headers: this._headers, body: JSON.stringify(payload) }; },
      end() { return { statusCode: this._status, headers: this._headers, body: "" }; },
    }));
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: 'check-giftwrap-support',
      method: event.httpMethod,
    });
    return errorResponse(404, "check-giftwrap-support not implemented", requestId, requestOrigin);
  }
};

