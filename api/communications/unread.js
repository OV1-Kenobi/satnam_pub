/**
 * Unread utilities (secured)
 * - GET /api/communications/unread  -> returns total unread for authenticated user
 * - POST /api/communications/unread/mark-read { messageIds: [] }
 * - POST /api/communications/unread { conversationId, upToCreatedAt }
 */

// Per-request Supabase client with Authorization header for RLS
import { allowRequest } from '../../netlify/functions/utils/rate-limiter.js';
let getRequestClient;

async function getClientFromReq(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { status: 401, message: 'Authentication required' };
  }
  const accessToken = authHeader.slice(7);
  if (!getRequestClient) {
    const mod = await import('../../netlify/functions/supabase.js');
    getRequestClient = mod.getRequestClient;
  }
  const client = getRequestClient(accessToken);
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData?.user) {
    throw { status: 401, message: 'Invalid token' };
  }
  // Fetch caller's allowed hashes via targeted lookup (no unbounded scans)
  const userId = userData.user.id;
  let userHashes = null;
  let hashErr = null;
  try {
    const resp = await client
      .from('privacy_users')
      .select('hashed_uuid')
      .eq('user_id', userId)
      .limit(10);
    if (resp.error) {
      hashErr = resp.error;
    } else {
      userHashes = resp.data;
    }
    if (!userHashes || userHashes.length === 0) {
      const resp2 = await client
        .from('privacy_users')
        .select('hashed_uuid')
        .eq('auth_user_id', userId)
        .limit(10);
      if (resp2.error) {
        hashErr = resp2.error;
      } else {
        userHashes = resp2.data;
      }
    }
  } catch (e) {
    hashErr = e;
  }
  if (hashErr || !userHashes?.length) {
    throw { status: 403, message: 'User not authorized' };
  }
  const allowed = new Set((userHashes || []).map((r) => r.hashed_uuid).filter(Boolean));
  return { client, allowedHashes: allowed };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Basic IP rate limiting
  const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  if (!allowRequest(String(clientIP))) {
    res.status(429).json({ success: false, error: 'Rate limit exceeded' });
    return;
  }

  try {
    const { client, allowedHashes } = await getClientFromReq(req);

    if (req.method === 'GET') {
      // Sum unread across all allowed owner hashes via RPC
      let total = 0;
      for (const h of allowedHashes) {
        const { data, error } = await client.rpc('get_unread_count', { p_owner_hash: h });
        if (!error && typeof data === 'number') total += data;
      }
      return res.status(200).json({ success: true, unread: total });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const path = req.url || '';

      // POST /unread/mark-read
      if (path.endsWith('/unread/mark-read')) {
        const { messageIds } = body || {};
        if (!Array.isArray(messageIds) || messageIds.length === 0) {
          return res.status(400).json({ success: false, error: 'messageIds required' });
        }
        // Upsert read state for all allowed owner hashes; RLS will enforce scope
        const rows = [];
        for (const id of messageIds) {
          for (const h of allowedHashes) rows.push({ message_id: id, owner_hash: h });
        }
        const { error } = await client.from('message_read_state').upsert(rows, { onConflict: 'message_id,owner_hash' });
        if (error) return res.status(500).json({ success: false, error: 'Failed to mark read' });
        return res.status(200).json({ success: true });
      }

      // Default POST: mark all messages to a cursor as read
      const { conversationId, upToCreatedAt } = body || {};
      if (!conversationId || !upToCreatedAt) {
        return res.status(400).json({ success: false, error: 'conversationId and upToCreatedAt required' });
      }
      const parts = String(conversationId).split(':');
      if (parts.length !== 2) {
        return res.status(400).json({ success: false, error: 'Invalid conversationId format' });
      }
      const [left, right] = parts;
      const hashPattern = /^[a-zA-Z0-9_-]+$/;
      if (!hashPattern.test(left) || !hashPattern.test(right)) {
        return res.status(400).json({ success: false, error: 'Invalid hash format in conversationId' });
      }
      if (!allowedHashes.has(left) && !allowedHashes.has(right)) {
        return res.status(403).json({ success: false, error: 'Forbidden conversation' });
      }

      const { data: messages, error } = await client
        .from('gift_wrapped_messages')
        .select('id, created_at, sender_hash, recipient_hash')
        .in('sender_hash', [left, right])
        .in('recipient_hash', [left, right])
        .lte('created_at', upToCreatedAt)
        .limit(500);
      if (error) return res.status(500).json({ success: false, error: 'Failed to fetch messages' });

      const rows = [];
      for (const m of (messages || [])) {
        for (const h of allowedHashes) rows.push({ message_id: m.id, owner_hash: h });
      }
      const { error: upError } = await client.from('message_read_state').upsert(rows, { onConflict: 'message_id,owner_hash' });
      if (upError) return res.status(500).json({ success: false, error: 'Failed to mark read' });
      return res.status(200).json({ success: true, marked: rows.length });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (e) {
    const code = e && typeof e === 'object' && 'status' in e ? e.status : 500;
    console.error('unread endpoint error:', e);
    res.status(code).json({ success: false, error: e?.message || 'Unexpected error' });
  }
}

