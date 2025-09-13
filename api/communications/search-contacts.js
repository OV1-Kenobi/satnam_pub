/**
 * Search Contacts Endpoint (secured, privacy-first)
 * Express-style handler used by Netlify adapter at netlify/functions/communications/search-contacts.ts
 * POST /api/communications/search-contacts
 * Body: { query: string, limit?: number }
 *
 * Searches hashed/encrypted fields only. No plaintext search.
 */

import { allowRequest } from '../../netlify/functions/utils/rate-limiter.js';
let getRequestClient;

async function getClientFromReq(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
    throw { status: 401, message: 'Unauthorized' };
  }
  const accessToken = String(authHeader).slice(7).trim();
  if (!getRequestClient) {
    const mod = await import('../../netlify/functions/supabase.js');
    getRequestClient = mod.getRequestClient;
  }
  const client = getRequestClient(accessToken);
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData?.user) {
    throw { status: 401, message: 'Invalid token' };
  }
  // Targeted lookup of caller's hash
  const userId = userData.user.id;
  let userHashes = null; let hashErr = null;
  try {
    const resp = await client.from('privacy_users').select('hashed_uuid').eq('user_id', userId).limit(10);
    if (resp.error) { hashErr = resp.error; } else { userHashes = resp.data; }
    if (!userHashes || userHashes.length === 0) {
      const resp2 = await client.from('privacy_users').select('hashed_uuid').eq('auth_user_id', userId).limit(10);
      if (resp2.error) { hashErr = resp2.error; } else { userHashes = resp2.data; }
    }
  } catch (e) { hashErr = e; }
  if (hashErr || !userHashes?.length) { throw { status: 403, message: 'User not authorized' }; }
  const allowed = new Set((userHashes || []).map((r) => r.hashed_uuid).filter(Boolean));
  return { client, allowedHashes: allowed };
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ success: false, error: 'Method not allowed' }); return; }

  // Rate limiting (best-effort)
  const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  if (!allowRequest(String(clientIP))) { res.status(429).json({ success: false, error: 'Rate limit exceeded' }); return; }

  try {
    const { client, allowedHashes } = await getClientFromReq(req);

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { query, limit = 20 } = body;
    if (!query || typeof query !== 'string') { res.status(400).json({ success: false, error: 'query required' }); return; }

    // Privacy-first: search on contact_hash only (client pre-hashes displayName/nip05 into contact_hash variants if needed)
    const likeQuery = `%${String(query).toLowerCase()}%`;

    let q = client
      .from('encrypted_contacts')
      .select('id, owner_hash, encrypted_contact, contact_hash, contact_encryption_salt, contact_encryption_iv, trust_level, family_role, supports_gift_wrap, preferred_encryption, added_at, last_contact_at, contact_count')
      .ilike('contact_hash', likeQuery)
      .order('added_at', { ascending: false })
      .limit(Math.min(parseInt(limit, 10) || 20, 50));

    // Constrain to caller's allowed owner hashes using RLS or explicit filter
    if (allowedHashes.size > 0) {
      q = q.in('owner_hash', Array.from(allowedHashes));
    }

    const { data, error } = await q;
    if (error) { console.error('search-contacts db error:', error); res.status(500).json({ success: false, error: 'Search failed' }); return; }

    res.status(200).json({ success: true, contacts: data || [] });
  } catch (e) {
    const code = e?.status || e?.code || 500;
    console.error('search-contacts error:', e);
    res.status(code).json({ success: false, error: e?.message || 'Unexpected error' });
  }
}
