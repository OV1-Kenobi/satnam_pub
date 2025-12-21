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

    // Compute user_duid = HMAC-SHA-256(DUID_SERVER_SECRET, "name@domain")
    // This is the same value as user_identities.id for the corresponding user
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
    const user_duid = hmac.digest('hex');

    const path = `nip05_artifacts/${domain}/${user_duid}.json`;

    // Fetch per-user artifact from Supabase Storage (memory-friendly via existing client)
    let artifact = null;
	    let federationNpub = null;
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
      // Per-user artifact missing or invalid; fall back to federation lookup
      // Optimized: first check federation_lightning_config by handle (indexed), then decrypt npub
      try {
        const supaMod = await import('./supabase.js');
        const { supabaseAdmin } = supaMod.default || supaMod;
        if (!supabaseAdmin) {
          const { safeWarn } = await getPrivacyLogger();
          safeWarn('NOSTR_JSON_FEDERATION_LOOKUP_DISABLED', {
            reason: 'supabaseAdmin not configured',
          });
        } else {
          // Step 1: Check if handle exists in federation_lightning_config (indexed lookup)
          const { data: flcData, error: flcError } = await supabaseAdmin
            .from('federation_lightning_config')
            .select('federation_duid')
            .eq('federation_handle', name)
            .single();

          if (flcError && flcError.code !== 'PGRST116') {
            // PGRST116 = no rows returned, which is fine
            const { safeWarn } = await getPrivacyLogger();
            safeWarn('NOSTR_JSON_FEDERATION_FLC_QUERY_FAIL', {
              msg: flcError.message,
            });
          }

          if (flcData && flcData.federation_duid) {
            // Step 2: Get the encrypted npub from family_federations using federation_duid
            const { data: ffData, error: ffError } = await supabaseAdmin
              .from('family_federations')
              .select('federation_npub_encrypted, is_active')
              .eq('federation_duid', flcData.federation_duid)
              .eq('is_active', true)
              .single();

            if (ffError) {
              const { safeWarn } = await getPrivacyLogger();
              safeWarn('NOSTR_JSON_FEDERATION_FF_QUERY_FAIL', {
                msg: ffError.message,
              });
            } else if (ffData && ffData.federation_npub_encrypted) {
              // Step 3: Decrypt the federation npub
              try {
                const nobleMod = await import('./security/noble-encryption.js');
                const { decryptFederationFieldEnvelope } =
                  nobleMod.default || nobleMod;

                federationNpub = await decryptFederationFieldEnvelope(
                  ffData.federation_npub_encrypted,
                  'federation_npub_encrypted'
                );
              } catch (decryptErr) {
                const { safeWarn } = await getPrivacyLogger();
                safeWarn('NOSTR_JSON_FEDERATION_DECRYPT_FAIL', {
                  field: 'federation_npub_encrypted',
                  namePrefix: name.substring(0, 4) + '...',
                  msg:
                    decryptErr instanceof Error
                      ? decryptErr.message
                      : String(decryptErr),
                });
              }
            }
          }
        }
      } catch (e) {
        const { safeWarn } = await getPrivacyLogger();
        safeWarn('NOSTR_JSON_FEDERATION_LOOKUP_ERROR', {
          msg: e instanceof Error ? e.message : String(e),
        });
      }

      if (!federationNpub) {
        // Not found or invalid; return empty mapping
        return { statusCode: 200, headers, body: JSON.stringify({}) };
      }

      const body = JSON.stringify({ names: { [name]: federationNpub } });
      return { statusCode: 200, headers, body };
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

