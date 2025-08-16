// Netlify Function: /api/auth/nip07-signin -> /.netlify/functions/auth-nip07-signin
// Normalized wrapper with consistent CORS, logging, and dynamic import for memory efficiency

/** Build CORS headers consistently across auth functions */
function buildCorsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const isProd = process.env.NODE_ENV === 'production';
  // Prefer explicit production origin; fallback to wildcard in dev
  const allowedOrigin = isProd ? (process.env.FRONTEND_URL || 'https://satnam.pub') : (origin || '*');
  const allowCreds = allowedOrigin !== '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': String(allowCreds),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    'Content-Type': 'application/json',
  };
}

async function robustImport(rel, segs) {
  try {
    return await import(rel);
  } catch (_e1) {
    const path = await import('node:path');
    const url = await import('node:url');
    const fileUrl = url.pathToFileURL(path.resolve(process.cwd(), ...segs)).href;
    return await import(fileUrl);
  }
}

function withCors(resp, cors) {
  const headers = { ...(resp.headers || {}), ...cors };
  return { ...resp, headers };
}

export const handler = async (event, context) => {
  const cors = buildCorsHeaders(event);
  const startedAt = new Date().toISOString();
  const name = 'auth-nip07-signin';

  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: cors, body: '' };
    }

    if (event.httpMethod !== 'POST') {
      return withCors({
        statusCode: 405,
        body: JSON.stringify({ success: false, error: 'Method not allowed' }),
      }, cors);
    }

    console.log(`▶️  ${name}: started`, {
      startedAt,
      method: event.httpMethod,
      hasBody: !!event.body,
      bodyLength: event.body?.length || 0,
      nodeEnv: process.env.NODE_ENV,
      memMB: (process.memoryUsage?.().heapUsed || 0) / (1024 * 1024),
    });

    // Dynamically import the implementation to reduce cold start/memory
    const mod = await robustImport('../../api/auth/nip07-signin.js', ['api', 'auth', 'nip07-signin.js']).catch(async () => {
      // Fallback to functions-local implementation if present
      return await robustImport('./auth-nip07-signin.js', ['netlify', 'functions', 'auth-nip07-signin.js']);
    });

    const fn = mod && (mod.handler || mod.default);
    if (typeof fn !== 'function') {
      console.error(`${name}: implementation missing`);
      return withCors({ statusCode: 500, body: JSON.stringify({ success: false, error: 'Signin handler not available' }) }, cors);
    }

    const result = await fn(event, context);
    const finishedAt = new Date().toISOString();
    console.log(`✅ ${name}: completed`, {
      startedAt,
      finishedAt,
      durationMs: Date.now() - Date.parse(startedAt),
      statusCode: result?.statusCode,
      memMB: (process.memoryUsage?.().heapUsed || 0) / (1024 * 1024),
    });

    return withCors(result || { statusCode: 500, body: JSON.stringify({ success: false, error: 'Empty response' }) }, cors);
  } catch (err) {
    const finishedAt = new Date().toISOString();
    console.error(`❌ ${name}: failed`, {
      startedAt,
      finishedAt,
      durationMs: Date.now() - Date.parse(startedAt),
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      memMB: (process.memoryUsage?.().heapUsed || 0) / (1024 * 1024),
    });

    return withCors({
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    }, cors);
  }
};

