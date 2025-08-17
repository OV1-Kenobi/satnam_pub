// Netlify Function: Upsert NIP-05 artifact and hashed_npub on key rotation
// POST /.netlify/functions/nip05-artifact-upsert

export const handler = async (event) => {
  const startedAt = Date.now();
  const cors = (origin) => {
    const isProd = process.env.NODE_ENV === 'production';
    const allowed = isProd ? (process.env.FRONTEND_URL || 'https://www.satnam.pub') : origin || '*';
    return {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Credentials': String(allowed !== '*'),
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
      'Content-Type': 'application/json'
    };
  };

  const origin = event.headers?.origin || event.headers?.Origin;
  const headers = cors(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };

  try {
    const { nip05, newNpub, username, domain = 'satnam.pub' } = JSON.parse(event.body || '{}');
    const localName = username || (typeof nip05 === 'string' ? String(nip05).split('@')[0] : '');
    const effectiveDomain = domain || (typeof nip05 === 'string' ? String(nip05).split('@')[1] : 'satnam.pub') || 'satnam.pub';

    if (!localName || !newNpub) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing required fields' }) };
    }

    const crypto = await import('node:crypto');
    const secret = process.env.DUID_SERVER_SECRET;
    if (!secret) {
      const { safeError } = await import('./utils/privacy-logger.js');
      safeError('NIP05_ARTIFACT_UPSERT_MISCONFIG', { reason: 'Missing DUID_SERVER_SECRET' });
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Server misconfiguration' }) };
    }

    const identifier = `${localName.toLowerCase()}@${effectiveDomain}`;
    const hmac1 = crypto.createHmac('sha256', secret).update(identifier).digest('hex');
    const hmac2 = crypto.createHmac('sha256', secret).update(`NPUBv1:${newNpub}`).digest('hex');

    const supaMod = await import('./supabase.js');
    const supabase = (supaMod && (supaMod.supabase ?? supaMod.default)) || null;
    if (!supabase || typeof supabase.from !== 'function') {
      const { safeError } = await import('./utils/privacy-logger.js');
      safeError('NIP05_ARTIFACT_UPSERT_MISCONFIG', { reason: 'Supabase client missing or invalid export in ./supabase.js' });
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Server misconfiguration' }) };
    }

    // Update hashed_npub in DB for this hashed_nip05
    const { error: updateErr } = await supabase
      .from('nip05_records')
      .update({ hashed_npub: hmac2, updated_at: new Date().toISOString() })
      .eq('domain', effectiveDomain)
      .eq('hashed_nip05', hmac1)
      .eq('is_active', true);

    if (updateErr) {
      const { safeWarn } = await import('./utils/privacy-logger.js');
      safeWarn('NIP05_ARTIFACT_UPSERT_DB_FAIL', { code: updateErr.code, msg: updateErr.message });
      // Continue to artifact write; the artifact still needs to reflect new pubkey
    }

    // Build artifact and integrity tag
    const issued_at = new Date().toISOString();
    const artifactCore = { name: localName, domain: effectiveDomain, pubkey: newNpub, issued_at };
    const integrity = crypto.createHmac('sha256', secret).update(JSON.stringify(artifactCore)).digest('hex');
    const payload = JSON.stringify({ ...artifactCore, integrity });

    // Ensure bucket exists (best-effort; requires elevated perms in most setups)
    try {
      // Create bucket if missing (will no-op or fail without service role)
      await supabase.storage.createBucket('nip05-artifacts', { public: false });
    } catch (e) {
      // Not fatal; bucket may already exist or permission denied under anon
    }

    // Upload artifact (upsert)
    const path = `nip05_artifacts/${effectiveDomain}/${hmac1}.json`;
    try {
      const { error: uploadErr } = await supabase.storage
        .from('nip05-artifacts')
        .upload(path, new Blob([payload], { type: 'application/json' }), { upsert: true });
      if (uploadErr) {
        const { safeError } = await import('./utils/privacy-logger.js');
        safeError('NIP05_ARTIFACT_UPLOAD_FAIL', { code: uploadErr.code, msg: uploadErr.message });
      }
    } catch (e) {
      const { safeError } = await import('./utils/privacy-logger.js');
      safeError('NIP05_ARTIFACT_UPLOAD_EXC', { msg: e instanceof Error ? e.message : String(e) });
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    const { safeError } = await import('./utils/privacy-logger.js');
    safeError('NIP05_ARTIFACT_UPSERT_ERROR', { msg: err instanceof Error ? err.message : String(err) });
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Internal server error' }) };
  } finally {
    const ms = Date.now() - startedAt;
    const { safeLog } = await import('./utils/privacy-logger.js');
    if (ms > 50) safeLog('NIP05_ARTIFACT_UPSERT_DONE', { ms });
  }
};

