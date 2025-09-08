// Inline check-refresh implementation (moved above handler for scope availability)
async function handleCheckRefreshInline(event, context, corsHeaders) {
  if ((event.httpMethod || 'GET').toUpperCase() !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  // Lightweight IP rate limiting via Supabase RPC
  try {
    const xfwd = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
    const clientIp = Array.isArray(xfwd) ? xfwd[0] : (xfwd || "").split(",")[0]?.trim() || "unknown";
    const windowSec = 60;
    const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * (windowSec * 1000)).toISOString();
    const { supabase } = await import('../supabase.js');
    const { data, error } = await supabase.rpc('increment_auth_rate', {
      p_identifier: clientIp,
      p_scope: 'ip',
      p_window_start: windowStart,
      p_limit: 60,
    });
    const limited = Array.isArray(data) ? data?.[0]?.limited : data?.limited;
    if (error || limited) {
      return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Too many attempts' }) };
    }
  } catch {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Too many attempts' }) };
  }

  const parseCookies = (cookieHeader) => {
    if (!cookieHeader) return {};
    return cookieHeader.split(';').reduce((acc, c) => {
      const [name, ...rest] = c.trim().split('=');
      acc[name] = rest.join('=');
      return acc;
    }, {});
  };

  try {
    const cookies = parseCookies(event.headers?.cookie);
    const refreshToken = cookies?.['satnam_refresh_token'];

    if (!refreshToken) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, available: false }) };
    }

    const jwt = await import('jsonwebtoken');
    const { getJwtSecret } = await import('../utils/jwt-secret.js');
    const secret = getJwtSecret();

    let payload;
    try {
      payload = jwt.default.verify(refreshToken, secret, {
        algorithms: ['HS256'],
        issuer: 'satnam.pub',
        audience: 'satnam.pub-users',
      });
    } catch {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, available: false }) };
    }

    const obj = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const isValid = !!obj && obj.type === 'refresh';

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, available: isValid }) };
  } catch (error) {
    console.error('check-refresh inline error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, available: false, error: 'Check refresh failed' }) };
  }
}

// Inline NIP-07 challenge implementation (moved above handler for scope availability)
async function handleNip07ChallengeInline(event, context, corsHeaders) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  // Rate limiting: 60s window, 30 attempts
  try {
    const xfwd = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
    const clientIp = Array.isArray(xfwd) ? xfwd[0] : (xfwd || "").split(",")[0]?.trim() || "unknown";
    const windowSec = 60;
    const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * (windowSec * 1000)).toISOString();
    const { supabase } = await import('../supabase.js');
    const { data, error } = await supabase.rpc('increment_auth_rate', {
      p_identifier: clientIp,
      p_scope: 'ip',
      p_window_start: windowStart,
      p_limit: 30,
    });
    const limited = Array.isArray(data) ? data?.[0]?.limited : data?.limited;
    if (error || limited) {
      return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Too many attempts' }) };
    }
  } catch {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Too many attempts' }) };
  }

  try {
    const qp = event.queryStringParameters || {};
    const legacyRole = String(qp.userRole || 'private');
    const includeMetadata = String(qp.includeMetadata || 'false') === 'true';

    const convertRole = (role) => {
      switch (role) {
        case 'admin': return 'guardian';
        case 'user': return 'adult';
        case 'parent': return 'adult';
        case 'child':
        case 'teen': return 'offspring';
        case 'steward':
        case 'guardian':
        case 'private':
        case 'offspring':
        case 'adult': return role;
        default: return 'private';
      }
    };
    const role = convertRole(legacyRole);

    // Sovereignty: authorize all roles; flag offspring as requiring approval
    const sovereigntyStatus = {
      role,
      hasUnlimitedAccess: role !== 'offspring',
      requiresApproval: role === 'offspring',
    };

    // Generate challenge and nonce via Web Crypto (Node 18+ has globalThis.crypto)
    const challengeBytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(challengeBytes);
    const challenge = Array.from(challengeBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    challengeBytes.fill(0);

    const nonceBytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(nonceBytes);
    const nonce = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    nonceBytes.fill(0);

    const domain = event.headers?.host || process.env.FRONTEND_URL || 'localhost:3000';
    const timestamp = Date.now();
    const expiresAt = timestamp + 5 * 60 * 1000;

    // Persist challenge best-effort
    try {
      const { supabase } = await import('../supabase.js');
      const sessionId = qp.sessionId || nonce;
      await supabase.from('auth_challenges').delete().lt('expires_at', new Date().toISOString());
      await supabase.from('auth_challenges').insert({
        session_id: sessionId,
        nonce,
        challenge,
        domain,
        issued_at: new Date(timestamp).toISOString(),
        expires_at: new Date(expiresAt).toISOString(),
        is_used: false,
      });
    } catch {}

    const data = { challenge, domain, timestamp, expiresAt, nonce };
    if (includeMetadata) {
      data.metadata = { version: '1.0.0', algorithm: 'secp256k1', encoding: 'hex' };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, data, sovereigntyStatus, meta: { timestamp: new Date().toISOString(), protocol: 'NIP-07', privacyCompliant: true } })
    };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Failed to generate NIP-07 challenge' }) };
  }
}

// Inline NIP-07 signin implementation (moved above handler for scope availability)
async function handleNip07SigninInline(event, context, corsHeaders) {
  if ((event.httpMethod || 'POST').toUpperCase() !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Method not allowed' }) };
  }
  try {
    const xfwd = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
    const clientIp = Array.isArray(xfwd) ? xfwd[0] : (xfwd || '').split(',')[0]?.trim() || 'unknown';
    const windowSec = 60;
    const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * (windowSec * 1000)).toISOString();
    const { supabase } = await import('../supabase.js');
    try {
      const { data, error } = await supabase.rpc('increment_auth_rate', { p_identifier: clientIp, p_scope: 'ip', p_window_start: windowStart, p_limit: 30 });
      const limited = Array.isArray(data) ? data?.[0]?.limited : data?.limited;
      if (error || limited) return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Too many attempts' }) };
    } catch { return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Too many attempts' }) }; }

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Invalid JSON body' }) }; }
    const { signedEvent, challenge, domain, userRole = 'private', sessionId, nonce } = body || {};
    if (!signedEvent || !sessionId || !nonce) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Missing required fields' }) };
    }

    // Load challenge
    const { data: chRows, error: chErr } = await supabase
      .from('auth_challenges')
      .select('*')
      .eq('session_id', sessionId)
      .eq('nonce', nonce)
      .limit(1);
    if (chErr || !chRows || chRows.length === 0) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Challenge not found' }) };
    }
    const ch = chRows[0];
    if (ch.is_used) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Challenge already used' }) };
    if (Date.now() > new Date(ch.expires_at).getTime()) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Challenge expired' }) };
    if (domain && ch.domain && domain !== ch.domain) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Domain mismatch' }) };

    // Validate event basics
    if (signedEvent.kind !== 22242 || signedEvent.content !== ch.challenge) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Invalid auth event' }) };
    }
    // Verify signature
    const hexToBytes = (hex) => {
      if (!hex || hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) return null;
      const out = new Uint8Array(hex.length / 2);
      for (let i=0;i<hex.length;i+=2) out[i/2] = parseInt(hex.slice(i,i+2),16);
      return out;
    };
    try {
      const { secp256k1 } = await import('@noble/curves/secp256k1');
      const sig = hexToBytes(signedEvent.sig);
      const msg = hexToBytes(signedEvent.id);
      const pub = hexToBytes(signedEvent.pubkey);
      if (!sig || !msg || !pub) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Invalid event encoding' }) };
      const ok = secp256k1.verify(sig, msg, pub);
      if (!ok) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Invalid event signature' }) };
    } catch {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Signature verification failed' }) };
    }

    // Convert pubkey to npub and resolve DUID via nip05_records
    let npub;
    try { const { nip19 } = await import('nostr-tools'); npub = nip19.npubEncode(signedEvent.pubkey); } catch { npub = `npub${String(signedEvent.pubkey||'').slice(0,16)}...`; }

    // Resolve DUID from npub using hashed_npub -> hashed_nip05
    const { createHmac } = await import('node:crypto');
    const duidSecret = process.env.DUID_SERVER_SECRET || process.env.DUID_SECRET_KEY;
    if (!duidSecret) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Server configuration error' }) };
    const hashed_npub = createHmac('sha256', duidSecret).update(npub).digest('hex');
    const { data: rec, error: recErr } = await supabase
      .from('nip05_records').select('hashed_nip05, nip05').eq('hashed_npub', hashed_npub).eq('is_active', true).single();
    if (recErr || !rec) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Authentication failed' }) };
    }
    const duid = rec.hashed_nip05;

    // Lookup user
    const { data: user, error: userErr } = await supabase
      .from('user_identities')
      .select('id, role, nip05')
      .eq('id', duid)
      .eq('is_active', true)
      .single();
    if (userErr || !user) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Authentication failed' }) };
    }

    // Mark challenge used
    await supabase.from('auth_challenges').update({ is_used: true, event_id: signedEvent.id }).eq('id', ch.id);

    // Create JWTs
    const { getJwtSecret } = await import('../utils/jwt-secret.js');
    const jwtSecret = getJwtSecret();
    const jwt = (await import('jsonwebtoken')).default;
    const newSessionId = crypto.randomUUID();
    const protectedId = createHmac('sha256', duidSecret).update(String(duid) + newSessionId).digest('hex');
    const ACCESS = 15*60, REFRESH = 7*24*60*60;
    const sign = (payload, exp) => jwt.sign({ ...payload, jti: crypto.randomUUID() }, jwtSecret, { expiresIn: exp, algorithm: 'HS256', issuer: 'satnam.pub', audience: 'satnam.pub-users' });
    const accessToken = sign({ hashedId: protectedId, nip05: user.nip05, type:'access', sessionId: newSessionId }, ACCESS);
    const refreshToken = sign({ hashedId: protectedId, nip05: user.nip05, type:'refresh', sessionId: newSessionId }, REFRESH);

    // Set HttpOnly refresh cookie
    const isDev = process.env.NODE_ENV !== 'production';
    const cookie = [
      `satnam_refresh_token=${refreshToken}`,
      `Max-Age=${REFRESH}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      ...(isDev ? [] : ['Secure'])
    ].join('; ');

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Set-Cookie': cookie },
      body: JSON.stringify({
        success: true,
        data: {
          user: { id: protectedId, npub, nip05: user.nip05, role: user.role || 'private', is_active: true },
          authenticated: true,
          sessionToken: accessToken,
        },
        meta: { timestamp: new Date().toISOString(), protocol: 'NIP-07', privacyCompliant: true }
      })
    };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Authentication verification failed' }) };
  }
}


// Inline logout implementation (moved above handler for scope availability)
async function handleLogoutInline(event, context, corsHeaders) {
  if ((event.httpMethod || 'POST').toUpperCase() === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if ((event.httpMethod || 'POST').toUpperCase() !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Method not allowed' }) };
  }
  try {
    // rate limit best-effort
    try {
      const xfwd = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
      const clientIp = Array.isArray(xfwd) ? xfwd[0] : (xfwd || '').split(',')[0]?.trim() || 'unknown';
      const windowSec = 60;
      const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * (windowSec * 1000)).toISOString();
      const { supabase } = await import('../supabase.js');
      const { data, error } = await supabase.rpc('increment_auth_rate', { p_identifier: clientIp, p_scope: 'ip', p_window_start: windowStart, p_limit: 60 });
      const limited = Array.isArray(data) ? data?.[0]?.limited : data?.limited;
      if (error || limited) return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Too many attempts' }) };
    } catch { return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Too many attempts' }) }; }

    const clear = `satnam_refresh_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    return { statusCode: 200, headers: { ...corsHeaders, 'Set-Cookie': clear }, body: JSON.stringify({ success:true }) };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Logout failed' }) };
  }
}

// Inline refresh implementation (moved above handler for scope availability)
async function handleRefreshInline(event, context, corsHeaders) {
  if ((event.httpMethod || 'POST').toUpperCase() !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Method not allowed' }) };
  }
  const parseCookies = (cookieHeader) => {
    if (!cookieHeader) return {};
    return cookieHeader.split(';').reduce((acc, c) => { const [n,...r]=c.trim().split('='); acc[n]=r.join('='); return acc; }, {});
  };
  try {
    // rate limit
    try {
      const xfwd = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
      const clientIp = Array.isArray(xfwd) ? xfwd[0] : (xfwd || '').split(',')[0]?.trim() || 'unknown';
      const windowSec = 60;
      const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * (windowSec * 1000)).toISOString();
      const { supabase } = await import('../supabase.js');
      const { data, error } = await supabase.rpc('increment_auth_rate', { p_identifier: clientIp, p_scope: 'ip', p_window_start: windowStart, p_limit: 30 });
      const limited = Array.isArray(data) ? data?.[0]?.limited : data?.limited;
      if (error || limited) return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Too many attempts' }) };
    } catch { return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Too many attempts' }) }; }

    const cookies = parseCookies(event.headers?.cookie);
    const refreshToken = cookies['satnam_refresh_token'];
    if (!refreshToken) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success:false, error:'No refresh token found' }) };

    const { getJwtSecret } = await import('../utils/jwt-secret.js');
    const jwtSecret = getJwtSecret();
    const duidSecret = process.env.DUID_SERVER_SECRET || process.env.DUID_SECRET_KEY;
    if (!duidSecret) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Server configuration error' }) };
    const jwt = (await import('jsonwebtoken')).default;
    let payload;
    try {
      payload = jwt.verify(refreshToken, jwtSecret, { algorithms:['HS256'], issuer:'satnam.pub', audience:'satnam.pub-users' });
      payload = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (payload.type !== 'refresh') throw new Error('Not a refresh token');
    } catch (e) {
      const clear = `satnam_refresh_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      return { statusCode: 401, headers: { ...corsHeaders, 'Set-Cookie': clear }, body: JSON.stringify({ success:false, error:'Invalid refresh token' }) };
    }

    const now = Math.floor(Date.now()/1000);
    if (payload.iat && now - payload.iat < 60) {
      return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Token refresh rate limit exceeded' }) };
    }

    const newSessionId = crypto.randomUUID();
    const subject = payload.userId || payload.hashedId || 'user';
    const protectedId = (await import('node:crypto')).createHmac('sha256', duidSecret).update(String(subject)+newSessionId).digest('hex');
    const ACCESS = 15*60, REFRESH = 7*24*60*60;
    const sign = (pl, exp) => jwt.sign({ ...pl, jti: crypto.randomUUID() }, jwtSecret, { expiresIn: exp, algorithm:'HS256', issuer:'satnam.pub', audience:'satnam.pub-users' });
    const newAccess = sign({ userId: payload.userId, hashedId: protectedId, nip05: payload.nip05, type:'access', sessionId: newSessionId }, ACCESS);
    const newRefresh = sign({ userId: payload.userId, hashedId: protectedId, nip05: payload.nip05, type:'refresh', sessionId: newSessionId }, REFRESH);

    const isDev = process.env.NODE_ENV !== 'production';
    const cookie = [
      `satnam_refresh_token=${newRefresh}`,
      `Max-Age=${REFRESH}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      ...(isDev ? [] : ['Secure'])
    ].join('; ');

    return { statusCode: 200, headers: { ...corsHeaders, 'Set-Cookie': cookie }, body: JSON.stringify({ success:true, data:{ user:{ id: payload.userId || protectedId, nip05: payload.nip05, is_active: true }, authenticated:true, sessionToken: newAccess, expiresAt: new Date((now+ACCESS)*1000).toISOString() }, meta:{ timestamp: new Date().toISOString(), sessionId: newSessionId } }) };
  } catch (error) {
    const clear = `satnam_refresh_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    return { statusCode: 500, headers: { ...corsHeaders, 'Set-Cookie': clear }, body: JSON.stringify({ success:false, error:'Token refresh failed' }) };
  }
}


// Inline session-user implementation (moved above handler for scope availability)
async function handleSessionUserInline(event, context, corsHeaders) {
  if ((event.httpMethod || 'GET').toUpperCase() !== 'GET') {
    return { statusCode: 405, headers: { ...corsHeaders, Allow: 'GET' }, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  function parseCookies(cookieHeader) {
    if (!cookieHeader) return {};
    return cookieHeader.split(';').reduce((acc, c) => {
      const [name, ...rest] = c.trim().split('=');
      acc[name] = rest.join('=');
      return acc;
    }, {});
  }

  // Lightweight IP rate limiting via Supabase RPC
  try {
    const xfwd = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
    const clientIp = Array.isArray(xfwd) ? xfwd[0] : (xfwd || "").split(",")[0]?.trim() || "unknown";
    const windowSec = 60;
    const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * (windowSec * 1000)).toISOString();
    const { supabase } = await import('../supabase.js');
    const { data, error } = await supabase.rpc('increment_auth_rate', {
      p_identifier: clientIp,
      p_scope: 'ip',
      p_window_start: windowStart,
      p_limit: 60,
    });
    const limited = Array.isArray(data) ? data?.[0]?.limited : data?.limited;
    if (error || limited) {
      return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Too many attempts' }) };
    }
  } catch {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Too many attempts' }) };
  }

  try {
    // 1) Authorization: Bearer header
    const headers = event.headers || {};
    const authHeader = headers.authorization || headers.Authorization || headers['authorization'] || headers['Authorization'];
    let nip05 = null;

    if (authHeader && /^bearer\s+.+/i.test(String(authHeader))) {
      const token = String(authHeader).replace(/^bearer\s+/i, '');
      try {
        const payload = await verifyJWT(token);
        if (payload && payload.nip05) nip05 = payload.nip05;
      } catch {}
    }

    // 2) Refresh cookie fallback
    if (!nip05) {
      const cookies = parseCookies(headers.cookie);
      const refreshToken = cookies?.['satnam_refresh_token'];
      if (!refreshToken) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Unauthorized' }) };
      }
      try {
        const jwt = await import('jsonwebtoken');
        const { getJwtSecret } = await import('../utils/jwt-secret.js');
        const secret = getJwtSecret();
        const payload = jwt.default.verify(refreshToken, secret, {
          algorithms: ['HS256'],
          issuer: 'satnam.pub',
          audience: 'satnam.pub-users',
        });
        const obj = typeof payload === 'string' ? JSON.parse(payload) : payload;
        if (obj?.type === 'refresh') nip05 = obj.nip05;
      } catch {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Unauthorized' }) };
      }
    }

    if (!nip05) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Unauthorized' }) };
    }

    // 3) DUID from nip05 via server secret
    let duid;
    try {
      const { getEnvVar } = await import('../utils/env.js');
      const secret = getEnvVar('DUID_SERVER_SECRET');
      if (!secret) throw new Error('DUID_SERVER_SECRET not configured');
      const { createHmac } = await import('node:crypto');
      duid = createHmac('sha256', secret).update(nip05).digest('hex');
    } catch (e) {
      console.error('DUID generation failed:', e);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Authentication system error' }) };
    }

    // 4) Lookup user
    const { supabase } = await import('../supabase.js');
    const { data: user, error: userError, status } = await supabase
      .from('user_identities')
      .select('id, role, is_active, user_salt, encrypted_nsec, encrypted_nsec_iv, npub, username')
      .eq('id', duid)
      .single();

    if (userError || !user) {
      const code = status === 406 ? 404 : 500;
      return { statusCode: code, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'User not found' }) };
    }

    const userPayload = {
      id: user.id,
      nip05,
      role: user.role || 'private',
      is_active: user.is_active !== false,
      user_salt: user.user_salt || null,
      encrypted_nsec: user.encrypted_nsec || null,
      encrypted_nsec_iv: user.encrypted_nsec_iv || null,
      npub: user.npub || null,
      username: user.username || null,
    };

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, data: { user: userPayload } })
    };
  } catch (error) {
    console.error('session-user inline error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Internal server error' }) };
  }
}

// Inline session validation implementation (moved above handler for scope availability)
async function handleSessionInline(event, context, corsHeaders) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    // Extract JWT token from Authorization header (case-insensitive)
    const headers = event.headers || {};
    const authHeader = headers.authorization || headers.Authorization ||
                      headers['authorization'] || headers['Authorization'];

    if (!authHeader) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Authorization token required'
        })
      };
    }

    // Support case-insensitive "Bearer" token detection
    const bearerMatch = authHeader.match(/^bearer\s+(.+)$/i);
    if (!bearerMatch) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Invalid authorization format. Expected: Bearer <token>'
        })
      };
    }

    const token = bearerMatch[1];

    // SECURE JWT VERIFICATION
    let payload;
    try {
      payload = await verifyJWT(token);
    } catch (jwtError) {
      console.error('❌ Session JWT verification failed:', jwtError.message);
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Invalid or expired token',
          debug: process.env.NODE_ENV === 'development' ? jwtError.message : undefined
        })
      };
    }

    console.log('✅ Session validation successful:', { userId: payload.userId, username: payload.username });

    // FIXED: Return response format that matches frontend expectations
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          authenticated: true,
          user: {
            id: payload.userId,
            username: payload.username,
            nip05: payload.nip05,
            role: payload.role,
            is_active: true // Assume active if token is valid
          },
          accountActive: true, // User is active if they have a valid token
          sessionValid: true,
          sessionToken: null, // Don't return the token in session validation
          lastValidated: Date.now()
        },
        session: {
          valid: true,
          expiresAt: new Date(payload.exp * 1000).toISOString()
        }
      })
    };

  } catch (error) {
    console.error('❌ Session validation error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Session validation failed',
        debug: {
          message: (error && typeof error === 'object' && 'message' in error) ? /** @type {any} */ (error).message : String(error),
          timestamp: new Date().toISOString()
        }
      })
    };
  }
}

// Inline username availability implementation (moved above handler for scope availability)
async function handleCheckUsernameAvailabilityInline(event, context, corsHeaders) {
  if ((event.httpMethod || 'GET').toUpperCase() !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Method not allowed' }) };
  }
  try {
    // Rate limit
    try {
      const xfwd = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
      const clientIp = Array.isArray(xfwd) ? xfwd[0] : (xfwd || '').split(',')[0]?.trim() || 'unknown';
      const windowSec = 60;
      const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * (windowSec * 1000)).toISOString();
      const { supabase } = await import('../supabase.js');
      const { data, error } = await supabase.rpc('increment_auth_rate', { p_identifier: clientIp, p_scope: 'ip', p_window_start: windowStart, p_limit: 10 });
      const limited = Array.isArray(data) ? data?.[0]?.limited : data?.limited;
      if (error || limited) return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Too many requests' }) };
    } catch { return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Too many requests' }) }; }

    const qp = event.queryStringParameters || {};
    const username = String(qp.username || '').trim().toLowerCase();
    if (!username) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Username is required' }) };
    if (username.length < 3 || username.length > 20) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Username must be between 3 and 20 characters' }) };
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Username can only contain letters, numbers, underscores, and hyphens' }) };

    const domain = 'satnam.pub';
    const { createHmac } = await import('node:crypto');
    const secret = (process.env.DUID_SERVER_SECRET || process.env.DUID_SECRET_KEY || '').trim();
    if (!secret) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Server configuration error' }) };
    const identifier = `${username}@${domain}`;
    const hashed_nip05 = createHmac('sha256', secret).update(identifier).digest('hex');

    const { supabase } = await import('../supabase.js');
    const { data, error } = await supabase
      .from('nip05_records')
      .select('id')
      .eq('domain', domain)
      .eq('hashed_nip05', hashed_nip05)
      .eq('is_active', true)
      .limit(1);

    let available = !error && (!data || data.length === 0);

    // Cross-check against user_identities using canonical DUID when possible
    if (available) {
      try {
        const { generateDUIDFromNIP05 } = await import('../../lib/security/duid-generator.js');
        const duid = await generateDUIDFromNIP05(identifier);
        const { data: users } = await supabase.from('user_identities').select('id').eq('id', duid).limit(1);
        if (users && users.length > 0) available = false;
      } catch {}
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success:true, available }) };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success:false, error:'Internal server error' }) };
  }
}


/**
 * Resolve authentication route to appropriate handler module
 * Supports both /auth/* and /api/auth/* patterns for backward compatibility
 * @param {string} path - Request path
 * @param {string} method - HTTP method
 * @returns {Object|null} Target module info or null if not found
 */
function resolveAuthRoute(path, method) {
  // Normalize path for consistent matching
  const normalizedPath = path.toLowerCase();

  // Core authentication endpoints - INLINE IMPLEMENTATION for reliability
  if ((normalizedPath.endsWith('/auth/signin') || normalizedPath.endsWith('/api/auth/signin')) && method === 'POST') {
    return {
      inline: true, // Handle signin directly in auth-unified
      endpoint: 'signin'
    };
  }

  // register-identity is now a standalone lazy function, not handled by auth-unified
  // Requests to /api/auth/register-identity will be routed directly to the register-identity function

  // NIP-07 browser extension authentication
  if ((normalizedPath.endsWith('/auth/nip07-challenge') || normalizedPath.endsWith('/api/auth/nip07-challenge')) && method === 'GET') {
    return {
      inline: true,
      endpoint: 'nip07-challenge'
    };
  }

  if ((normalizedPath.endsWith('/auth/nip07-signin') || normalizedPath.endsWith('/api/auth/nip07-signin')) && method === 'POST') {
    return {
      inline: true,
      endpoint: 'nip07-signin'
    };
  }

  // Session management endpoints
  if ((normalizedPath.endsWith('/auth/session') || normalizedPath.endsWith('/api/auth/session')) && method === 'GET') {
    return {
      inline: true,
      endpoint: 'session'
    };
  }

  if ((normalizedPath.endsWith('/auth/session-user') || normalizedPath.endsWith('/api/auth/session-user')) && method === 'GET') {
    return {
      inline: true,
      endpoint: 'session-user'
    };
  }

  if ((normalizedPath.endsWith('/auth/logout') || normalizedPath.endsWith('/api/auth/logout')) && method === 'POST') {
    return {
      inline: true,
      endpoint: 'logout'
    };
  }

  if ((normalizedPath.endsWith('/auth/refresh') || normalizedPath.endsWith('/api/auth/refresh')) && method === 'POST') {
    return {
      inline: true,
      endpoint: 'refresh'
    };
  }

  if ((normalizedPath.endsWith('/auth/check-refresh') || normalizedPath.endsWith('/api/auth/check-refresh')) && method === 'GET') {
    return {
      inline: true,
      endpoint: 'check-refresh'
    };
  }

  // Username availability check (auth-related utility)
  if ((normalizedPath.endsWith('/auth/check-username-availability') || normalizedPath.endsWith('/api/auth/check-username-availability')) && method === 'GET') {
    return {
      inline: true,
      endpoint: 'check-username-availability'
    };
  }

  // No matching route found
  return null;
}

/**
 * Build CORS headers with environment-aware configuration
 * Uses established process.env pattern with fallback to primary production origin
 * @param {Object} event - Netlify function event
 * @returns {Object} CORS headers
 */
function buildCorsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const isProd = process.env.NODE_ENV === 'production';

  // Use FRONTEND_URL with fallback to primary production origin per user preferences
  const allowedOrigin = isProd
    ? (process.env.FRONTEND_URL || 'https://www.satnam.pub')
    : (origin || '*');

  const allowCredentials = allowedOrigin !== '*';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': String(allowCredentials),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    'Content-Type': 'application/json',
  };
}

// SECURE JWT VERIFICATION FUNCTION (shared between signin and session validation)
async function verifyJWT(token) {
  try {
    // Import jose library for secure JWT verification
    const { jwtVerify, createRemoteJWKSet } = await import('jose');

    // Configuration
    const JWT_SECRET = process.env.JWT_SECRET;
    const JWKS_URI = process.env.JWKS_URI;
    const JWT_ISSUER = process.env.JWT_ISSUER || 'satnam.pub';
    const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'satnam.pub';

    let payload;

    // Option 1: JWKS verification (preferred for production)
    if (JWKS_URI) {
      console.log('🔐 Using JWKS verification');
      const JWKS = createRemoteJWKSet(new URL(JWKS_URI));
      const { payload: jwksPayload } = await jwtVerify(token, JWKS, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        clockTolerance: 30 // 30 seconds tolerance for clock skew
      });
      payload = jwksPayload;
    }
    // Option 2: HS256 secret-based verification (fallback)
    else if (JWT_SECRET) {
      console.log('🔐 Using HS256 secret verification');
      const secret = new TextEncoder().encode(JWT_SECRET);
      const { payload: secretPayload } = await jwtVerify(token, secret, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        clockTolerance: 30
      });
      payload = secretPayload;
    }
    // Fallback: Basic verification for development (INSECURE - only for dev)
    else if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️  WARNING: Using insecure JWT verification in development mode');
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

      // Basic expiration check
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        throw new Error('Token expired');
      }
    }
    else {
      throw new Error('JWT verification not configured - missing JWT_SECRET or JWKS_URI');
    }

    // Validate required claims (be flexible with username since it might be hashed or fallback)
    if (!payload.userId) {
      throw new Error('Invalid token payload - missing userId claim');
    }

    // Validate expiration (additional check)
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) {
      throw new Error('Token expired');
    }

    console.log('✅ JWT verification successful:', {
      userId: payload.userId,
      username: payload.username,
      exp: new Date(payload.exp * 1000).toISOString()
    });

    return payload;

  } catch (error) {
    console.error('❌ JWT verification error:', error.message);
    throw new Error(`JWT verification failed: ${error.message}`);
  }
}

// SECURE JWT CREATION FUNCTION
async function createSecureJWT(payload) {
  try {
    // Import jose library for secure JWT creation
    const { SignJWT } = await import('jose');

    // Configuration - SECURITY FIX: Fail fast if JWT_SECRET is missing
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is required');
    }
    const JWT_ISSUER = process.env.JWT_ISSUER || 'satnam.pub';
    const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'satnam.pub';

    // Create secret key
    const secret = new TextEncoder().encode(JWT_SECRET);

    // Create JWT with proper claims
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime('24h') // 24 hours
      .sign(secret);

    console.log('✅ Secure JWT created successfully');
    return jwt;

  } catch (error) {
    console.error('❌ JWT creation error:', error.message);
    throw new Error(`JWT creation failed: ${error.message}`);
  }
}

// Inline signin implementation for reliability
async function handleSigninInline(event, context, corsHeaders) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { nip05, password } = body;

    console.log('🔄 Inline signin attempt:', { nip05 });
    console.log('🔍 Environment debug:', {
      JWT_SECRET: !!process.env.JWT_SECRET,
      DUID_SERVER_SECRET: !!process.env.DUID_SERVER_SECRET,
      NODE_ENV: process.env.NODE_ENV
    });

    // Validate input
    if (!nip05 || !password) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'NIP-05 and password are required'
        })
      };
    }

    // Import required modules dynamically - SECURITY FIX: Use proper named imports for ESM
    const { pbkdf2: pbkdf2Cb, timingSafeEqual } = await import('node:crypto');
    const { promisify } = await import('node:util');
    const pbkdf2 = promisify(pbkdf2Cb);

    // Generate DUID using canonical generator (consistent with registration)
    const { generateDUIDFromNIP05 } = await import('../../lib/security/duid-generator.js');
    const userDUID = await generateDUIDFromNIP05(nip05);

    console.log('🔍 DUID generation debug:', {
      nip05Input: nip05,
      generatedDUID: userDUID?.substring(0, 8) + '...',
      duidLength: userDUID?.length || 0,
      duidType: typeof userDUID
    });

    // Get Supabase client (try both prefixed and non-prefixed env vars)
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(`Supabase configuration missing: URL=${!!supabaseUrl}, KEY=${!!supabaseKey}`);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Look up user by DUID with explicit field selection to handle both schema types
    // This ensures we get all required fields regardless of schema version
    const { data: user, error: userError } = await supabase
      .from('user_identities')
      .select(`
        id,
        role,
        is_active,
        password_hash,
        password_salt,
        user_salt,
        encrypted_nsec,
        encrypted_nsec_iv,
        username,
        npub,
        nip05,
        hashed_username,
        hashed_npub,
        hashed_nip05,
        created_at,
        updated_at
      `)
      .eq('id', userDUID)
      .single();

    console.log('🔍 Database query result:', {
      userFound: !!user,
      userError: userError?.message || null,
      userErrorCode: userError?.code || null,
      userDUID: userDUID?.substring(0, 8) + '...',
      querySuccess: !userError && !!user
    });

    if (userError || !user) {
      console.log('❌ User not found:', {
        nip05,
        userDUID: userDUID.substring(0, 8) + '...',
        error: userError?.message || 'No user data returned',
        errorCode: userError?.code || 'NO_DATA'
      });
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'User not found',
          registerEndpoint: '/identity-forge'
        })
      };
    }

    console.log('🔍 User data debug:', {
      id: user.id?.substring(0, 8),
      username: user.username,
      nip05: user.nip05,
      role: user.role,
      hasPasswordHash: !!user.password_hash,
      hasPasswordSalt: !!user.password_salt,
      // CRITICAL: Debug encrypted credentials for SecureNsecManager session creation
      hasUserSalt: !!user.user_salt,
      hasEncryptedNsec: !!user.encrypted_nsec,
      hasEncryptedNsecIv: !!user.encrypted_nsec_iv,
      hasNpub: !!user.npub,
      // Debug all available fields to identify missing data
      availableFields: Object.keys(user || {})
    });

    // CRITICAL DEBUG: Log the complete user object (sanitized) to identify missing fields
    console.log('🔍 Complete user object keys:', Object.keys(user || {}));
    console.log('🔍 User salt preview:', user.user_salt ? `${user.user_salt.substring(0, 8)}...` : 'MISSING');
    console.log('🔍 Encrypted nsec preview:', user.encrypted_nsec ? `${user.encrypted_nsec.substring(0, 8)}...` : 'MISSING');
    console.log('🔍 Npub preview:', user.npub ? `${user.npub.substring(0, 8)}...` : 'MISSING');

    // CRITICAL FIX: Check if user has required encrypted credentials for SecureNsecManager session creation
    const hasRequiredCredentials = !!(user.user_salt && user.encrypted_nsec);
    console.log('🔍 Required credentials check:', {
      hasUserSalt: !!user.user_salt,
      hasEncryptedNsec: !!user.encrypted_nsec,
      hasRequiredCredentials,
      canCreateSecureSession: hasRequiredCredentials
    });

    if (!hasRequiredCredentials) {
      console.warn('⚠️ User missing encrypted credentials - SecureNsecManager session creation will fail');
      console.warn('⚠️ This user may need to re-register or update their account with encrypted credentials');
    }

    // Verify password with backward-compatible formats (hex or base64) using constant-time comparison
    const derivedKey = await pbkdf2(password, user.password_salt, 100000, 64, 'sha512');

    let isValidPassword = false;
    // First, attempt hex comparison
    try {
      const storedHexBuf = Buffer.from(user.password_hash, 'hex');
      if (storedHexBuf.length === derivedKey.length && timingSafeEqual(derivedKey, storedHexBuf)) {
        isValidPassword = true;
      }
    } catch {}

    // If not hex, attempt base64 comparison (legacy)
    if (!isValidPassword) {
      try {
        const storedB64Buf = Buffer.from(user.password_hash, 'base64');
        if (storedB64Buf.length === derivedKey.length && timingSafeEqual(derivedKey, storedB64Buf)) {
          isValidPassword = true;
        }
      } catch {}
    }

    if (!isValidPassword) {
      console.log('❌ Invalid password for user:', nip05);
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Invalid credentials'
        })
      };
    }

    // Create secure JWT token with UNIFIED FORMAT compatible with frontend SecureTokenManager
    // Generate required fields that frontend SecureTokenManager.parseTokenPayload() expects
    const { randomBytes, createHmac } = await import('node:crypto');
    const sessionId = randomBytes(16).toString('hex'); // Generate random session ID
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is required');
    }
    const hashedId = createHmac('sha256', JWT_SECRET)
      .update(`${user.id}|${sessionId}`)
      .digest('hex');

    // Handle both privacy-first schema (hashed fields) and regular schema
    const token = await createSecureJWT({
      // FRONTEND-REQUIRED FIELDS (SecureTokenManager.parseTokenPayload expects these)
      userId: user.id,
      hashedId: hashedId, // Required by frontend - HMAC of userId|sessionId
      type: 'access', // Required by frontend - token type
      sessionId: sessionId, // Required by frontend - unique session identifier
      nip05: user.nip05 || user.hashed_nip05 || 'unknown', // Required by frontend

      // BACKEND-REQUIRED FIELDS (for compatibility with other endpoints)
      username: user.username || user.hashed_username || 'unknown', // Handle both schemas
      role: user.role || 'private'
    });

    // CRITICAL FIX: Prepare response data with proper field mapping for both schema types
    const responseUserData = {
      id: user.id,
      nip05: nip05, // Use the input nip05, not the potentially missing user.nip05
      role: user.role,
      is_active: true,

      // CRITICAL: Include encrypted credentials for SecureNsecManager session creation
      user_salt: user.user_salt || null,
      encrypted_nsec: user.encrypted_nsec || null,
      encrypted_nsec_iv: user.encrypted_nsec_iv || null,

      // Handle both schema types for identity fields
      npub: user.npub || user.hashed_npub || null,
      username: user.username || user.hashed_username || null,

      // Additional fields that might be needed
      hashed_npub: user.hashed_npub || null,
      hashed_username: user.hashed_username || null,
      hashed_nip05: user.hashed_nip05 || null
    };

    console.log('🔍 Response user data debug:', {
      id: responseUserData.id?.substring(0, 8),
      nip05: responseUserData.nip05,
      role: responseUserData.role,
      hasUserSalt: !!responseUserData.user_salt,
      hasEncryptedNsec: !!responseUserData.encrypted_nsec,
      hasEncryptedNsecIv: !!responseUserData.encrypted_nsec_iv,
      hasNpub: !!responseUserData.npub,
      username: responseUserData.username
    });

    console.log('✅ Inline signin successful:', {
      username: user.username,
      role: user.role,
      nip05Input: nip05,
      userNip05: user.nip05,
      credentialsIncluded: !!(user.user_salt && user.encrypted_nsec && user.npub)
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          user: responseUserData,
          sessionToken: token
        }
      })
    };

  } catch (error) {
    console.error('❌ Inline signin error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Authentication service temporarily unavailable',
        debug: {
          message: (error && typeof error === 'object' && 'message' in error) ? /** @type {any} */ (error).message : String(error),
          timestamp: new Date().toISOString()
        }
      })
    };
  }

}






// Exported Netlify handler (ESM)
export const handler = async (event, context) => {
  const corsHeaders = buildCorsHeaders(event);

  // CORS preflight
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    const path = event.path || '';
    const target = resolveAuthRoute(path, method);

    if (!target || !target.inline) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Not found' }) };
    }

    switch (target.endpoint) {
      case 'signin':
        return await handleSigninInline(event, context, corsHeaders);
      case 'nip07-challenge':
        return await handleNip07ChallengeInline(event, context, corsHeaders);
      case 'nip07-signin':
        return await handleNip07SigninInline(event, context, corsHeaders);
      case 'session':
        return await handleSessionInline(event, context, corsHeaders);
      case 'session-user':
        return await handleSessionUserInline(event, context, corsHeaders);
      case 'logout':
        return await handleLogoutInline(event, context, corsHeaders);
      case 'refresh':
        return await handleRefreshInline(event, context, corsHeaders);
      case 'check-refresh':
        return await handleCheckRefreshInline(event, context, corsHeaders);
      case 'check-username-availability':
        return await handleCheckUsernameAvailabilityInline(event, context, corsHeaders);
      default:
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Endpoint not found' }) };
    }
  } catch (error) {
    console.error('auth-unified handler error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Authentication service error' }) };
  }
};
