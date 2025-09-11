// netlify/functions_active/auth-logout.js
// ESM-only Netlify Function
// Provides POST /api/auth/logout to clear HttpOnly refresh cookie

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
    return { statusCode: 200, headers: { ...cors, 'Set-Cookie': clearRefreshCookie() }, body: JSON.stringify({ success:true }) };
  } catch (error) {
    console.error('auth-logout error:', error && error.message ? error.message : String(error));
    // Return 200 anyway but ensure cookie cleared client-side can proceed
    return { statusCode: 200, headers: { ...cors, 'Set-Cookie': clearRefreshCookie() }, body: JSON.stringify({ success:true }) };
  }
};

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

