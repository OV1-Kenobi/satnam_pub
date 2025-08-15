// Netlify Function: /api/auth/nip07-challenge
// Self-contained implementation to avoid dynamic imports and bundling issues

export const handler = async (event) => {
  // CORS setup
  const getAllowedOrigin = (origin) => {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) return 'https://satnam.pub';
    if (!origin) return '*';
    try {
      const u = new URL(origin);
      if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.protocol === 'http:') return origin;
    } catch {}
    return '*';
  };
  const requestOrigin = event.headers?.origin || event.headers?.Origin;
  const corsHeaders = {
    'Access-Control-Allow-Origin': getAllowedOrigin(requestOrigin),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success:false, error: 'Method not allowed' }) };
  }

  try {
    const { randomBytes } = await import('node:crypto');
    const { supabase } = await import('./supabase.js');

    // Request params
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
    } catch {}

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
      // Do not leak details
      console.warn('Challenge persistence failed');
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: { challenge, domain, timestamp, expiresAt, nonce },
        meta: { timestamp: new Date().toISOString(), protocol: 'NIP-07', privacyCompliant: true },
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Failed to generate NIP-07 challenge' }) };
  }
};

