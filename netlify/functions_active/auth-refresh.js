// netlify/functions_active/auth-refresh.js
// ESM-only Netlify Function
// Provides POST /api/auth/refresh compatible with SecureTokenManager expectations

export const handler = async (event, context) => {
  const cors = buildCors(event);

  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  if (method !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ success:false, error:'Method not allowed' }) };
  }

  try {
    const cookies = parseCookies(event.headers?.cookie);
    const refreshToken = cookies['satnam_refresh_token'];
    if (!refreshToken) {
      // Clear cookie defensively
      return {
        statusCode: 401,
        headers: { ...cors, 'Set-Cookie': clearRefreshCookie() },
        body: JSON.stringify({ success:false, error:'No refresh token' })
      };
    }

    const { getJwtSecret } = await import('./utils/jwt-secret.js');
    const jwtSecret = getJwtSecret();
    const jwt = (await import('jsonwebtoken')).default;

    // Verify refresh token
    let payload = jwt.verify(refreshToken, jwtSecret, {
      algorithms: ['HS256'],
      issuer: 'satnam.pub',
      audience: 'satnam.pub-users'
    });
    payload = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (payload.type !== 'refresh') {
      return {
        statusCode: 401,
        headers: { ...cors, 'Set-Cookie': clearRefreshCookie() },
        body: JSON.stringify({ success:false, error:'Invalid refresh token' })
      };
    }

    // Basic refresh rate-limit (per token): require at least 60s since iat
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.iat && nowSec - payload.iat < 60) {
      return { statusCode: 429, headers: cors, body: JSON.stringify({ success:false, error:'Too frequent refresh' }) };
    }

    // Mint new access+refresh
    const duidSecret = process.env.DUID_SERVER_SECRET || process.env.DUID_SECRET_KEY;
    if (!duidSecret) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ success:false, error:'Server configuration error' }) };
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
      type: 'access',
      sessionId
    }, ACCESS);

    const newRefresh = sign({
      userId: payload.userId,
      hashedId: protectedSubject,
      nip05: payload.nip05,
      type: 'refresh',
      sessionId
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

    return { statusCode: 200, headers: { ...cors, 'Set-Cookie': cookie }, body: JSON.stringify(body) };
  } catch (error) {
    console.error('auth-refresh error:', error && error.message ? error.message : String(error));
    return {
      statusCode: 500,
      headers: { ...buildCors(event), 'Set-Cookie': clearRefreshCookie() },
      body: JSON.stringify({ success:false, error:'Token refresh failed' })
    };
  }
};

function parseCookies(header) {
  if (!header) return {};
  return header.split(';').reduce((acc, c) => {
    const [n, ...r] = c.trim().split('=');
    acc[n] = r.join('=');
    return acc;
  }, {});
}

function buildCors(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigin = isProd ? (process.env.FRONTEND_URL || 'https://www.satnam.pub') : (origin || '*');
  const allowCreds = allowedOrigin !== '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': String(allowCreds),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };
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

