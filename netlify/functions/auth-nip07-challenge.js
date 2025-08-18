// Netlify Function: /api/auth/nip07-challenge -> /.netlify/functions/auth-nip07-challenge
// Normalized with consistent CORS, logging, and dynamic import for memory efficiency

function buildCorsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigin = isProd ? (process.env.FRONTEND_URL || 'https://satnam.pub') : (origin || '*');
  const allowCreds = allowedOrigin !== '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': String(allowCreds),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

export const handler = async (event) => {
  const cors = buildCorsHeaders(event);
  const startedAt = new Date().toISOString();
  const name = 'auth-nip07-challenge';

  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: cors, body: '' };
    }
    if (event.httpMethod !== 'GET') {
      return withCors({ statusCode: 405, body: JSON.stringify({ success:false, error: 'Method not allowed' }) }, cors);
    }

    const traceToken = Math.random().toString(36).slice(2);
    console.log(`▶️  ${name}: started`, {
      startedAt,
      method: event.httpMethod,
      hasQuery: !!event.queryStringParameters,
      origin: event.headers?.origin || event.headers?.Origin,
      referer: event.headers?.referer || event.headers?.referrer,
      userAgent: event.headers?.['user-agent'] || event.headers?.['User-Agent'],
      nodeEnv: process.env.NODE_ENV,
      memMB: (process.memoryUsage?.().heapUsed || 0) / (1024 * 1024),
      traceToken,
    });

    // Dynamic imports for memory optimization
    const { randomBytes } = await import('node:crypto');
    const { supabase } = await robustImport('./supabase.js', ['netlify', 'functions', 'supabase.js']);

    const qs = event.queryStringParameters || {};
    const sessionId = qs.sessionId || undefined;

    // Generate challenge and nonce (hex)
    const challenge = randomBytes(32).toString('hex');
    const nonce = randomBytes(16).toString('hex');

    const domain = event.headers?.host || 'localhost:3000';
    const timestamp = Date.now();
    const expiresAt = timestamp + 5 * 60 * 1000; // 5 minutes

    // Best-effort cleanup of expired rows
    try {
      await supabase.from('auth_challenges').delete().lt('expires_at', new Date().toISOString());
    } catch (e) {
      console.warn(`${name}: cleanup expired challenges failed`);
    }

    // Persist challenge for replay protection
    try {
      await supabase.from('auth_challenges').insert({
        session_id: sessionId || nonce,
        nonce,
        challenge,
        domain,
        issued_at: new Date(timestamp).toISOString(),
        expires_at: new Date(expiresAt).toISOString(),
        is_used: false,
      });
    } catch (persistErr) {
      console.warn(`${name}: challenge persistence failed`);
    }

    const finishedAt = new Date().toISOString();
    console.log(`✅ ${name}: completed`, {
      startedAt,
      finishedAt,
      durationMs: Date.now() - Date.parse(startedAt),
      memMB: (process.memoryUsage?.().heapUsed || 0) / (1024 * 1024),
    });

    return withCors({
      statusCode: 200,
      headers: { 'X-Trace-Token': traceToken },
      body: JSON.stringify({
        success: true,
        data: { challenge, domain, timestamp, expiresAt, nonce },
        meta: { timestamp: new Date().toISOString(), protocol: 'NIP-07', privacyCompliant: true, traceToken },
      }),
    }, cors);
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
      headers: { 'X-Trace-Token': Math.random().toString(36).slice(2) },
      body: JSON.stringify({ success:false, error:'Failed to generate NIP-07 challenge' })
    }, cors);
  }
};
