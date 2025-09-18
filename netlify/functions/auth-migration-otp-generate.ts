// Netlify Function: auth-migration-otp-generate
// Purpose: Initiate secure Account Migration by sending a TOTP via Nostr DM to the existing account
// ESM-only; uses process.env; integrates CEPS for DM delivery; stores TOTP secret with 10-minute TTL

import type { Handler } from '@netlify/functions';
import { allowRequest } from './utils/rate-limiter.js';
import { supabase } from './supabase.js';
import { central_event_publishing_service as CEPS } from '../../lib/central_event_publishing_service';
import { generateTOTPSecret, generateTOTP, TOTP_CONFIG } from '../../utils/crypto';

// Helper to parse JSON safely
function parseJSON(body: string | null): any {
  if (!body) return {};
  try { return JSON.parse(body); } catch { return {}; }
}

function corsHeaders(origin?: string) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  } as Record<string, string>;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(event.headers.origin), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event.headers.origin), body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  const headers = corsHeaders(event.headers.origin);

  // Basic IP-based rate limit (extra defense-in-depth)
  const ip = (event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown').toString();
  if (!allowRequest(`gen:${ip}`, 10, 60_000)) {
    return { statusCode: 429, headers, body: JSON.stringify({ success: false, error: 'Rate limit exceeded. Please wait and try again.' }) };
  }

  const { npub, nip05, lightningAddress } = parseJSON(event.body || null);

  if (!npub || typeof npub !== 'string' || !npub.startsWith('npub1')) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid or missing npub' }) };
  }
  if (!nip05 || typeof nip05 !== 'string' || !nip05.includes('@')) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid or missing NIP-05 identifier' }) };
  }

  try {
    // Enforce generation rate: max 3 new sessions per 15 minutes per npub
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: recent, error: recentErr } = await supabase
      .from('migration_otp_sessions')
      .select('session_id, created_at')
      .eq('npub', npub)
      .gte('created_at', fifteenMinAgo);
    if (recentErr) throw recentErr;
    if (Array.isArray(recent) && recent.length >= 3) {
      return { statusCode: 429, headers, body: JSON.stringify({ success: false, error: 'Too many OTP requests for this account. Please wait 15 minutes.' }) };
    }

    // Create or refresh a session (10-minute TTL)
    const secret = await generateTOTPSecret();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const insertRes = await supabase
      .from('migration_otp_sessions')
      .insert({ npub, totp_secret: secret, expires_at: expiresAt.toISOString(), attempt_count: 0, used_codes: [] })
      .select('session_id, expires_at')
      .single();

    if (insertRes.error || !insertRes.data) throw insertRes.error || new Error('Failed to create session');

    // Compute current TOTP to include in DM (valid for 120s ±1 window)
    const code = await generateTOTP(secret);

    // Build migration message per spec
    const la = typeof lightningAddress === 'string' && lightningAddress.length ? lightningAddress : '';
    const message = `Your account is being migrated to Satnam.pub. New NIP-05: ${nip05}.` +
      (la ? ` New Lightning Address: ${la}.` : '') + ` Verification code: ${code}`;

    // Send encrypted DM to existing account via CEPS (server-managed DM)
    try {
      await CEPS.sendServerDM(npub, message);
    } catch (e) {
      // Non-fatal: still return session so user can retry send
      console.warn('[migration-otp-generate] DM send failed:', e instanceof Error ? e.message : String(e));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        sessionId: insertRes.data.session_id,
        expiresAt: insertRes.data.expires_at,
        period: TOTP_CONFIG.PERIOD,
        digits: TOTP_CONFIG.DIGITS,
      }),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal error';
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: msg }) };
  }
};

export default { handler };

