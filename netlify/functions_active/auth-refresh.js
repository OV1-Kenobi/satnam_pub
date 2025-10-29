// netlify/functions_active/auth-refresh.js
// ESM-only Netlify Function
// Provides POST /api/auth/refresh compatible with SecureTokenManager expectations

import {
    RATE_LIMITS,
    checkRateLimit,
    createRateLimitIdentifier,
    getClientIP,
} from "./utils/enhanced-rate-limiter.js";
import {
    createRateLimitErrorResponse,
    generateRequestId,
    logError
} from "./utils/error-handler.js";
import {
    errorResponse,
    getSecurityHeaders,
    jsonResponse,
    preflightResponse
} from "./utils/security-headers.js";

export const handler = async (event, context) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(event.headers);
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 Token refresh handler started:", {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  const cors = buildSecurityHeaders(requestOrigin);

  const method = (event.httpMethod || "GET").toUpperCase();
  if (method === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }
  if (method !== "POST") {
    return errorResponse(405, "Method not allowed", requestId, requestOrigin);
  }

  try {
    const cookies = parseCookies(event.headers?.cookie);
    const refreshToken = cookies["satnam_refresh_token"];
    if (!refreshToken) {
      // Clear cookie defensively
      const response = errorResponse(401, "No refresh token", requestId, requestOrigin);
      response.headers["Set-Cookie"] = clearRefreshCookie();
      return response;
    }

    const { getJwtSecret } = await import("./utils/jwt-secret.js");
    const jwtSecret = getJwtSecret();
    const jwt = (await import("jsonwebtoken")).default;

    // Verify refresh token
    let payload = jwt.verify(refreshToken, jwtSecret, {
      algorithms: ["HS256"],
      issuer: "satnam.pub",
      audience: "satnam.pub-users",
    });
    payload = typeof payload === "string" ? JSON.parse(payload) : payload;
    if (payload.type !== "refresh") {
      const response = errorResponse(401, "Invalid refresh token", requestId, requestOrigin);
      response.headers["Set-Cookie"] = clearRefreshCookie();
      return response;
    }

    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(payload.userId, clientIP);
    const rateLimitAllowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.AUTH_REFRESH
    );

    if (!rateLimitAllowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "auth-refresh",
        method: event.httpMethod,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Mint new access+refresh
    const duidSecret = process.env.DUID_SERVER_SECRET || process.env.DUID_SECRET_KEY;
    if (!duidSecret) {
      return errorResponse(500, "Server configuration error", requestId, requestOrigin);
    }

    const { createHmac, randomUUID } = await import('node:crypto');
    const protectedSubject = createHmac('sha256', duidSecret)
      .update(String(payload.userId || payload.hashedId || 'user') + randomUUID())
      .digest('hex');

    const ACCESS = 15 * 60; // seconds
    const REFRESH = 7 * 24 * 60 * 60; // seconds

    const sign = (pl, expSec) => jwt.sign({ ...pl, jti: randomUUID() }, jwtSecret, {
      expiresIn: expSec,
      algorithm: 'HS256',
      issuer: 'satnam.pub',
      audience: 'satnam.pub-users'
    });

    const sessionId = randomUUID();
    const accessToken = sign({
      userId: payload.userId, // may be undefined for some flows; tolerated
      hashedId: protectedSubject,
      nip05: payload.nip05,
      type: "access",
      sessionId,
    }, ACCESS);

    const newRefresh = sign({
      userId: payload.userId,
      hashedId: protectedSubject,
      nip05: payload.nip05,
      type: "refresh",
      sessionId,
    }, REFRESH);

    const expiryMs = Date.now() + ACCESS * 1000;

    // Set-cookie for refresh rotation
    const cookie = setRefreshCookie(newRefresh, REFRESH);

    // IMPORTANT: Return payload expected by SecureTokenManager
    const body = {
      accessToken,
      accessTokenExpiry: expiryMs,
      // refreshToken intentionally omitted; handled via HttpOnly cookie
    };

    const response = jsonResponse(200, body, requestOrigin);
    response.headers["Set-Cookie"] = cookie;
    return response;
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "auth-refresh",
      method: event.httpMethod,
    });
    const response = errorResponse(500, "Token refresh failed", requestId, requestOrigin);
    response.headers["Set-Cookie"] = clearRefreshCookie();
    return response;
  }
};

function parseCookies(header) {
  if (!header) return {};
  return header.split(";").reduce((acc, c) => {
    const [n, ...r] = c.trim().split("=");
    acc[n] = r.join("=");
    return acc;
  }, {});
}

function buildSecurityHeaders(origin) {
  return getSecurityHeaders(origin, {
    cspPolicy: "default-src 'none'; frame-ancestors 'none'",
  });
}

function setRefreshCookie(token, maxAgeSec) {
  const isDev = process.env.NODE_ENV !== 'production';
  const base = [
    `satnam_refresh_token=${token}`,
    `Max-Age=${maxAgeSec}`,
    'Path=/',
    'HttpOnly'
  ];
  const prod = ['SameSite=None', 'Secure', 'Domain=.satnam.pub'];
  const dev = ['SameSite=Lax'];
  return [...base, ...(isDev ? dev : prod)].join('; ');
}

function clearRefreshCookie() {
  const isDev = process.env.NODE_ENV !== 'production';
  const base = [
    'satnam_refresh_token=',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Path=/',
    'HttpOnly'
  ];
  const prod = ['SameSite=None', 'Secure', 'Domain=.satnam.pub'];
  const dev = ['SameSite=Lax'];
  return [...base, ...(isDev ? dev : prod)].join('; ');
}

