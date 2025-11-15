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

  // Cached privacy logger importer with safe fallbacks (ESM named exports)
  let __privacyLoggerPromise;
  async function getPrivacyLogger() {
    if (!__privacyLoggerPromise) {
      __privacyLoggerPromise = import('./utils/privacy-logger.js');
    }
    try {
      const mod = await __privacyLoggerPromise;
      // Return named exports; build a small facade matching previous usage
      const { safeLog, safeWarn, safeError } = mod;
      return { safeLog, safeWarn, safeError };
    } catch {
      // Best-effort: no-op fallbacks so logging never breaks handler flow
      return { safeLog: () => {}, safeWarn: () => {}, safeError: () => {} };
    }
  }


  try {
    const urlParams = event.queryStringParameters || {};
    const name = (urlParams.name || '').trim().toLowerCase();
    const domain = process.env.VITE_PLATFORM_LIGHTNING_DOMAIN || 'my.satnam.pub';

    if (!name) {
      // Privacy-first: do not return a full listing
      return { statusCode: 200, headers, body: JSON.stringify({}) };
    }

    // Compute name_duid = HMAC-SHA-256(DUID_SERVER_SECRET, "name@domain")
    const crypto = await import('node:crypto');
    const secret = process.env.DUID_SERVER_SECRET;
    if (!secret) {
      const { safeError } = await getPrivacyLogger();
      safeError('NOSTR_JSON_MISCONFIG', { reason: 'Missing DUID_SERVER_SECRET' });
      return { statusCode: 500, headers, body: JSON.stringify({}) };
    }

    const identifier = `${name}@${domain}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(identifier);
    const name_duid = hmac.digest('hex');

    const path = `nip05_artifacts/${domain}/${name_duid}.json`;

    // Fetch per-user artifact from Supabase Storage (memory-friendly via existing client)
    let artifact = null;
    try {
      const supaMod = await import('./supabase.js');
      const { supabase } = supaMod.default || supaMod;
      const { data, error } = await supabase.storage.from('nip05-artifacts').download(path);
      if (!error && data) {
        const buf = Buffer.from(await data.arrayBuffer());
        artifact = JSON.parse(buf.toString('utf8'));
      } else {
        if (error) {
          const { safeWarn } = await getPrivacyLogger();
          safeWarn('NOSTR_JSON_STORAGE_DOWNLOAD_FAIL', { code: error.code, msg: error.message });
        }
      }
    } catch (e) {
      const { safeWarn } = await getPrivacyLogger();
      safeWarn('NOSTR_JSON_STORAGE_ACCESS_FAIL', { msg: e instanceof Error ? e.message : String(e) });
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
          const { safeWarn } = await getPrivacyLogger();
          safeWarn('NOSTR_JSON_INTEGRITY_MISMATCH', { namePrefix: name.substring(0, 4) + '...' });
          return { statusCode: 200, headers, body: JSON.stringify({}) };
        }
      }
    } catch {}

    const body = JSON.stringify({ names: { [name]: artifact.pubkey } });
    return { statusCode: 200, headers, body };
  } catch (err) {
    const { safeError } = await getPrivacyLogger();
    safeError('NOSTR_JSON_ERROR', { msg: err instanceof Error ? err.message : String(err) });
    return { statusCode: 500, headers, body: JSON.stringify({}) };
  } finally {
    const ms = Date.now() - startedAt;
    const { safeLog } = await getPrivacyLogger();
    if (ms > 50) safeLog('NOSTR_JSON_DONE', { ms });

  }
};

