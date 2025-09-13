/**
 * Add Contact Endpoint (secured)
 * POST /api/communications/add-contact
 * Privacy-first: expects client-encrypted payload; owner_hash is derived server-side
 */

import { allowRequest } from '../../netlify/functions/utils/rate-limiter.js';
let getRequestClient;

async function getClientFromReq(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { statusCode: 401, message: 'Authentication required' };
  }
  const accessToken = authHeader.slice(7);
  if (!getRequestClient) {
    const mod = await import('../../netlify/functions/supabase.js');
    getRequestClient = mod.getRequestClient;
  }
  const client = getRequestClient(accessToken);
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData?.user) { throw { statusCode: 401, message: 'Invalid token' }; }
  // Targeted lookup of caller's hash (avoid unbounded scans)
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
  if (hashErr || !userHashes?.length) { throw { statusCode: 403, message: 'User not authorized' }; }
  const allowed = new Set((userHashes || []).map(r => r.hashed_uuid).filter(Boolean));
  return { client, allowedHashes: allowed };
}

export default async function handler(req, res) {
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

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const {
      encrypted_contact,
      contact_encryption_salt,
      contact_encryption_iv,
      contact_hash,
      contact_hash_salt,
      trust_level = 'unverified',
      family_role = null,
      supports_gift_wrap = false,
      preferred_encryption = 'gift-wrap',
    } = body || {};

    if (!encrypted_contact || !contact_encryption_salt || !contact_encryption_iv || !contact_hash || !contact_hash_salt) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    // Insert one record per allowed owner hash (or choose a primary hash if only one should be used)
    // Here we insert for all allowed hashes so contacts are available across the user's identities.
    const rows = Array.from(allowedHashes).map((owner_hash) => ({
      owner_hash,
      encrypted_contact,
      contact_encryption_salt,
      contact_encryption_iv,
      contact_hash,
      contact_hash_salt,
      trust_level,
      family_role,
      supports_gift_wrap,
      preferred_encryption,
    }));

    const { data, error } = await client.from('encrypted_contacts').insert(rows).select();
    if (error) { console.error('add-contact db error:', error); res.status(500).json({ success: false, error: 'Failed to add contact' }); return; }

    res.status(200).json({ success: true, contact: Array.isArray(data) ? data[0] : data });
  } catch (e) {
    const code = e && typeof e === 'object' && 'statusCode' in e ? e.statusCode : 500;
    console.error('add-contact error:', e);
    res.status(code).json({ success: false, error: e?.message || 'Unexpected error' });
  }
}

