// Unified Auth Router - Netlify Function (ESM)
// Routes /api/auth/* to specific handlers via runtime dynamic imports
// Keeps the router bundle tiny and avoids bundling heavy leaf modules

export const handler = async (event) => {
  const cors = buildCorsHeaders(event);

  // CORS preflight
  if ((event.httpMethod || 'GET').toUpperCase() === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  try {
    const method = (event.httpMethod || 'GET').toUpperCase();
    const path = event.path || '';

    const target = resolveRoute(path, method);
    if (!target) {
      return { statusCode: 404, headers: cors, body: JSON.stringify({ success: false, error: 'Not found' }) };
    }

    // IMPORTANT: Use runtime dynamic import to prevent bundling
    const mod = await import(target);
    const fn = mod.default || mod.handler;
    if (typeof fn !== 'function') {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: 'Handler not available' }) };
    }

    // Delegate to target handler
    const resp = await fn(event);
    // Ensure CORS headers are present
    if (resp && typeof resp === 'object') {
      return { ...resp, headers: { ...(resp.headers || {}), ...cors } };
    }
    return { statusCode: 200, headers: cors, body: typeof resp === 'string' ? resp : JSON.stringify(resp) };
  } catch (e) {
    console.error('Auth router error:', e);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: 'Server error' }) };
  }
};

function resolveRoute(path, method) {
  // Normalize for safety
  const p = path.toLowerCase();

  // Core auth (NIP-05/password)
  if (p.endsWith('/api/auth/signin') && method === 'POST') return './auth-signin.js';

  // Registration
  if (p.endsWith('/api/auth/register-identity') && method === 'POST') return './auth-register-identity.js';

  // Session management
  if (p.endsWith('/api/auth/logout') && method === 'POST') return '../../api/auth/logout.js';
  if (p.endsWith('/api/auth/refresh') && method === 'POST') return '../../api/auth/refresh.js';
  if (p.endsWith('/api/auth/check-refresh') && method === 'GET') return '../../api/auth/check-refresh.js';

  // NIP-07
  if (p.endsWith('/api/auth/nip07-challenge') && method === 'GET') return '../../api/auth/nip07-challenge.js';
  if (p.endsWith('/api/auth/nip07-signin') && method === 'POST') return '../../api/auth/nip07-signin.js';

  return null;
}

function buildCorsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigin = isProd ? (process.env.FRONTEND_URL || 'https://www.satnam.pub') : (origin || '*');
  const allowCreds = allowedOrigin !== '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': String(allowCreds),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    'Content-Type': 'application/json',
  };
}

