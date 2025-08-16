// Netlify Function: /.netlify/functions/nostr-json
// Privacy-preserving NIP-05 resolver that serves a single name mapping on demand
// Uses server-side HMAC with DUID_SERVER_SECRET and per-user artifacts in storage

export const handler = async (event) => {
  const startedAt = Date.now();

  function corsHeaders(origin) {
    const isProd = process.env.NODE_ENV === 'production';
    const allowed = isProd ? (process.env.FRONTEND_URL || 'https://www.satnam.pub') : origin || '*';
    return {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Credentials': String(allowed !== '*'),
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
      'Content-Type': 'application/json'
    };
  }

  const origin = event.headers?.origin || event.headers?.Origin;
  const headers = corsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({}) };
  }

  try {
    const urlParams = event.queryStringParameters || {};
    const name = (urlParams.name || '').trim().toLowerCase();
    const domain = 'satnam.pub';

    if (!name) {
      // Privacy-first: do not return a full listing
      return { statusCode: 200, headers, body: JSON.stringify({}) };
    }

    // Compute hashed key = HMAC-SHA-256(DUID_SERVER_SECRET, "name@domain")
    const crypto = await import('node:crypto');
    const secret = process.env.DUID_SERVER_SECRET;
    if (!secret) {
      console.error('nostr-json: Missing DUID_SERVER_SECRET');
      return { statusCode: 500, headers, body: JSON.stringify({}) };
    }

    const identifier = `${name}@${domain}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(identifier);
    const hashed_nip05 = hmac.digest('hex');

    const path = `nip05_artifacts/${domain}/${hashed_nip05}.json`;

    // Fetch per-user artifact from Supabase Storage (memory-friendly via existing client)
    let artifact = null;
    try {
      const { supabase } = await import('./supabase.js');
      const { data, error } = await supabase.storage.from('nip05-artifacts').download(path);
      if (!error && data) {
        const buf = Buffer.from(await data.arrayBuffer());
        artifact = JSON.parse(buf.toString('utf8'));
      } else {
        if (error) console.warn('nostr-json: storage download error', error);
      }
    } catch (e) {
      console.warn('nostr-json: storage access failed', e);
    }

    if (!artifact || !artifact.pubkey || artifact.name !== name || artifact.domain !== domain) {
      // Not found or invalid; return empty mapping
      return { statusCode: 200, headers, body: JSON.stringify({}) };
    }

    // Optional integrity verification (HMAC of payload)
    try {
      if (artifact.integrity) {
        const verifier = crypto.createHmac('sha256', secret);
        verifier.update(JSON.stringify({ name: artifact.name, domain: artifact.domain, pubkey: artifact.pubkey, issued_at: artifact.issued_at }));
        const mac = verifier.digest('hex');
        if (mac !== artifact.integrity) {
          console.warn('nostr-json: integrity mismatch');
          return { statusCode: 200, headers, body: JSON.stringify({}) };
        }
      }
    } catch {}

    const body = JSON.stringify({ names: { [name]: artifact.pubkey } });
    return { statusCode: 200, headers, body };
  } catch (err) {
    console.error('nostr-json: error', err instanceof Error ? err.message : String(err));
    return { statusCode: 500, headers, body: JSON.stringify({}) };
  } finally {
    const ms = Date.now() - startedAt;
    if (ms > 50) console.log(`nostr-json completed in ${ms}ms`);
  }
};

