// Unified Individual Wallet Handler - Netlify Function (ESM)
// Converts lazy-loaded wallet modules to inline implementations for Netlify dev compatibility
// Routes: /api/individual/lightning/wallet, /api/individual/cashu/wallet, /api/individual/wallet, /api/user/nwc-connections, /api/wallet/nostr-wallet-connect

import { SecureSessionManager } from '../functions/security/session-manager.js';
import { performNwcOperationOverNostr } from '../functions/utils/nwc-client.js';
import { RATE_LIMITS, checkRateLimit, createRateLimitIdentifier, getClientIP } from './utils/enhanced-rate-limiter.ts';
import { createAuthErrorResponse, createRateLimitErrorResponse, createValidationErrorResponse, generateRequestId, logError } from './utils/error-handler.ts';
import { errorResponse, getSecurityHeaders, preflightResponse } from './utils/security-headers.ts';

// Security utilities (Phase 2 hardening)

export const handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(event.headers || {});
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log('🚀 Individual wallet handler started:', {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  // Handle CORS preflight
  if ((event.httpMethod || 'GET').toUpperCase() === 'OPTIONS') {
    return preflightResponse(requestOrigin);
  }

  try {
    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitAllowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.WALLET_OPERATIONS
    );

    if (!rateLimitAllowed) {
      logError(new Error('Rate limit exceeded'), {
        requestId,
        endpoint: 'individual-wallet-unified',
        method: event.httpMethod,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    const method = (event.httpMethod || 'GET').toUpperCase();
    const path = (event.path || '').toLowerCase();

    // Route resolution for individual wallet operations (inline handlers)
    const target = resolveIndividualWalletRoute(path, method);
    if (!target) {
      return errorResponse(
        404,
        'Individual wallet endpoint not found',
        requestId,
        requestOrigin
      );
    }

    let response;
    switch (target.route) {
      case 'lightning':
        response = await handleLightningWalletInline(event, requestId, requestOrigin);
        break;
      case 'cashu':
        response = await handleCashuWalletInline(event, requestId, requestOrigin);
        break;
      case 'unified':
        response = await handleUnifiedWalletInline(event, requestId, requestOrigin);
        break;
      case 'nwc':
        response = await handleNwcConnectionsInline(event, requestId, requestOrigin);
        break;
      case 'nwc_ops':
        response = await handleNwcOperationsInline(event, requestId, requestOrigin);
        break;
      default:
        return errorResponse(
          404,
          'Route not handled',
          requestId,
          requestOrigin
        );
    }

    // Ensure CORS headers are present in response
    const securityHeaders = getSecurityHeaders(requestOrigin);
    if (response && typeof response === 'object') {
      return { ...response, headers: { ...(response.headers || {}), ...securityHeaders } };
    }

    return { statusCode: 200, headers: securityHeaders, body: typeof response === 'string' ? response : JSON.stringify(response) };

  } catch (error) {
    logError(error, {
      requestId,
      endpoint: 'individual-wallet-unified',
      method: event.httpMethod,
    });
    return errorResponse(
      500,
      'Individual wallet service temporarily unavailable',
      requestId,
      requestOrigin
    );
  }
};

/**
 * Resolve individual wallet route to inline handler
 * @param {string} path
 * @param {string} method
 * @returns {{route: 'cashu'|'lightning'|'unified'|'nwc'|'nwc_ops'}|null}
 */
function resolveIndividualWalletRoute(path, method) {
  const p = path;

  // Cashu wallet
  if (p.includes('/api/individual/cashu/wallet') || p.endsWith('/individual/cashu/wallet')) {
    return { route: 'cashu' };
  }

  // Lightning wallet
  if (p.includes('/api/individual/lightning/wallet') || p.endsWith('/individual/lightning/wallet')) {
    return { route: 'lightning' };
  }

  // Unified individual wallet
  if (p.includes('/api/individual/wallet') || p.endsWith('/individual/wallet')) {
    return { route: 'unified' };
  }

  // NWC connections (used by useNWCWallet hook)
  if (p.includes('/api/user/nwc-connections') || p.endsWith('/user/nwc-connections')) {
    return { route: 'nwc' };
  }

  // NWC operations endpoint (wallet operations via Nostr Wallet Connect)
  if (p.includes('/api/wallet/nostr-wallet-connect') || p.endsWith('/wallet/nostr-wallet-connect')) {
    return { route: 'nwc_ops' };
  }

  return null;
}

// Inline: Lightning wallet handler (GET)
async function handleLightningWalletInline(event, requestId, requestOrigin) {
  if ((event.httpMethod || 'GET').toUpperCase() !== 'GET') {
    return errorResponse(405, 'Method not allowed', requestId, requestOrigin);
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
  const isAuthed = !!(session && (session.isAuthenticated === true || session?.userId || session?.npub));
  if (!isAuthed) {
    return createAuthErrorResponse(
      'Authentication required',
      requestId,
      requestOrigin
    );
  }

  const qs = event.queryStringParameters || {};
  const rawMemberId = typeof qs.memberId === 'string' ? qs.memberId : '';
  if (!rawMemberId) {
    return createValidationErrorResponse(
      'Member ID is required',
      requestId,
      requestOrigin
    );
  }
  const memberId = rawMemberId === 'current-user' ? (session?.userId || session?.npub || 'current-user') : rawMemberId;
  const role = (qs.userRole || session?.federationRole || session?.role || 'private');

  // Minimal, privacy-compliant mock data consistent with api/individual/lightning/wallet.js
  const hasUnlimited = role === 'private' || role === 'adult' || role === 'steward' || role === 'guardian';
  const balanceBase = hasUnlimited ? 500000 : 100000;
  const now = Date.now();

  const zapHistory = [
    { id: 'zap_1', amount: hasUnlimited ? 1000 : 500, recipient: 'npub1...', memo: 'Great post! ⚡', timestamp: new Date(now - 3600000), status: 'completed' },
    { id: 'zap_2', amount: hasUnlimited ? 500 : 250, recipient: 'npub1...', memo: 'Thanks for sharing', timestamp: new Date(now - 7200000), status: 'completed' }
  ];

  const transactions = [
    { id: 'ln_tx_1', type: 'payment', amount: hasUnlimited ? 25000 : 10000, fee: hasUnlimited ? 10 : 5, recipient: 'merchant@store.com', memo: 'Online purchase', timestamp: new Date(now - 1800000), status: 'completed', paymentHash: 'a1b2...' },
    { id: 'ln_tx_2', type: 'invoice', amount: hasUnlimited ? 50000 : 20000, fee: 0, sender: 'client@business.com', memo: 'Service payment', timestamp: new Date(now - 3600000), status: 'completed', paymentHash: 'b2c3...' }
  ];

  const body = {
    success: true,
    data: {
      walletId: 'lightning_mock',
      memberId,
      nodeProviders: {
        voltage: { type: 'voltage', name: 'Voltage', enabled: true, isDefault: true },
        phoenixd: { type: 'phoenixd', name: 'PhoenixD', enabled: role !== 'private', isInternal: true },
        breez: { type: 'breez', name: 'Breez', enabled: true, isCustodial: true },
        nwc: { type: 'nwc', name: 'Nostr Wallet Connect', enabled: role === 'adult' || role === 'steward' || role === 'guardian', isUserOwned: true },
        selfHosted: { type: 'self-hosted', name: 'Self-Hosted Node', enabled: role === 'adult' || role === 'steward' || role === 'guardian', isUserOwned: true, isSelfCustody: true }
      },
      zapHistory,
      transactions,
      balance: { total: balanceBase, available: balanceBase - 1000, pending: 1000, currency: 'sats' },
      message: 'Lightning wallet data (inline)'
    },
    meta: { timestamp: new Date().toISOString(), demo: true }
  };

  return { statusCode: 200, headers: getSecurityHeaders(requestOrigin), body: JSON.stringify(body) };
}

// Inline: Cashu wallet handler (GET)
async function handleCashuWalletInline(event, requestId, requestOrigin) {
  if ((event.httpMethod || 'GET').toUpperCase() !== 'GET') {
    return errorResponse(405, 'Method not allowed', requestId, requestOrigin);
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
  const isAuthed = !!(session && (session.isAuthenticated === true || session?.userId || session?.npub));
  if (!isAuthed) {
    return createAuthErrorResponse(
      'Authentication required',
      requestId,
      requestOrigin
    );
  }

  const qs = event.queryStringParameters || {};
  const rawMemberId = typeof qs.memberId === 'string' ? qs.memberId : '';
  if (!rawMemberId) {
    return createValidationErrorResponse(
      'Member ID is required',
      requestId,
      requestOrigin
    );
  }
  const memberId = rawMemberId === 'current-user' ? (session?.userId || session?.npub || 'current-user') : rawMemberId;
  const role = (qs.userRole || session?.federationRole || session?.role || 'private');

  const now = Date.now();
  const bearerInstruments = [
    { id: `cashu_${memberId}_1`, amount: 10000, formFactor: 'qr', created: new Date(now - 86400000), redeemed: false, token: 'cashuAbc...' },
    { id: `cashu_${memberId}_2`, amount: 5000, formFactor: 'nfc', created: new Date(now - 172800000), redeemed: true, token: 'cashuXyz...' }
  ];
  const transactions = [
    { id: `cashu_tx_${memberId}_1`, type: 'mint', amount: 25000, fee: 0, memo: 'Lightning to Cashu', timestamp: new Date(now - 1800000), status: 'completed', tokenId: `cashu_token_${memberId}_1`, lightningInvoice: 'lnbc...' },
    { id: `cashu_tx_${memberId}_2`, type: 'send', amount: 10000, fee: 0, recipient: 'Bearer note recipient', memo: 'Gift', timestamp: new Date(now - 3600000), status: 'completed', tokenId: `cashu_token_${memberId}_2` }
  ];

  const body = {
    success: true,
    data: {
      balance: bearerInstruments.filter(b => !b.redeemed).reduce((s, b) => s + b.amount, 0),
      bearerInstruments,
      transactions,
      tokenSummary: { keyset_001: { count: bearerInstruments.length, totalAmount: bearerInstruments.reduce((s,b)=>s+b.amount,0), active: true } },
      supportedNuts: ['NUTS-00','NUTS-01','NUTS-04','NUTS-05','NUTS-06','NUTS-07']
    },
    sovereigntyStatus: { role, hasUnlimitedAccess: role === 'private' || role === 'adult' || role === 'steward' || role === 'guardian', spendingLimit: -1, requiresApproval: role === 'offspring' },
    meta: { timestamp: new Date().toISOString(), mockImplementation: true, mintUrl: process.env.CASHU_MINT_URL || 'https://mint.satnam.pub' }
  };

  return { statusCode: 200, headers: getSecurityHeaders(requestOrigin), body: JSON.stringify(body) };
}

// Inline: Unified wallet (GET/POST)
async function handleUnifiedWalletInline(event, requestId, requestOrigin) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    return errorResponse(405, 'Method not allowed', requestId, requestOrigin);
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
  const isAuthed = !!(session && (session.isAuthenticated === true || session?.userId || session?.npub));
  if (!isAuthed) {
    return createAuthErrorResponse(
      'Authentication required',
      requestId,
      requestOrigin
    );
  }

  const qs = event.queryStringParameters || {};
  const rawMemberId = typeof qs.memberId === 'string' ? qs.memberId : '';
  if (!rawMemberId) {
    return createValidationErrorResponse(
      'Member ID is required',
      requestId,
      requestOrigin
    );
  }
  const memberId = rawMemberId === 'current-user' ? session.userId : rawMemberId;

  if (method === 'POST') {
    // Accept privacy settings updates (no-op mock to maintain API compatibility)
    return { statusCode: 200, headers: getSecurityHeaders(requestOrigin), body: JSON.stringify({ success: true, updated: true }) };
  }

  // For GET, assemble a concise unified summary
  const lightning = await JSON.parse((await handleLightningWalletInline({ ...event, httpMethod: 'GET', queryStringParameters: { ...qs, memberId } }, requestId, requestOrigin)).body);
  const cashu = await JSON.parse((await handleCashuWalletInline({ ...event, httpMethod: 'GET', queryStringParameters: { ...qs, memberId } }, requestId, requestOrigin)).body);

  const body = {
    memberId,
    username: 'user',
    lightningAddress: 'user@lightning.pub',
    lightningBalance: lightning?.data?.balance?.available ?? 0,
    ecashBalance: cashu?.data?.balance ?? 0,
    spendingLimits: { daily: -1, weekly: -1, requiresApproval: -1 },
    recentTransactions: [
      ...(lightning?.data?.transactions?.slice(0, 1) || []),
      ...(cashu?.data?.transactions?.slice(0, 1) || [])
    ],
    privacySettings: { defaultRouting: 'lightning', lnproxyEnabled: false, guardianProtected: false }
  };

  return { statusCode: 200, headers: getSecurityHeaders(requestOrigin), body: JSON.stringify(body) };
}

// Inline: NWC connections (GET/POST)
async function handleNwcConnectionsInline(event, requestId, requestOrigin) {
  const method = (event.httpMethod || 'GET').toUpperCase();

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
  const isAuthed = !!(session && (session.isAuthenticated === true || session?.userId || session?.npub));
  if (!isAuthed) {
    return createAuthErrorResponse(
      'Authentication required',
      requestId,
      requestOrigin
    );
  }

  // Lazy import Supabase per request (singleton factory)
  const { getRequestClient } = await import('./supabase.js');
  const supabase = getRequestClient(String((authHeader || '').replace(/^Bearer\s+/i, '')));

  // Set RLS context for this request (binds RLS to authenticated user)
  try {
    await supabase.rpc('set_app_current_user_hash', { val: session.hashedId });
  } catch {
    try {
      await supabase.rpc('set_app_config', { setting_name: 'app.current_user_hash', setting_value: session.hashedId, is_local: true });
    } catch {
      try { await supabase.rpc('app_set_config', { setting_name: 'app.current_user_hash', setting_value: session.hashedId, is_local: true }); } catch {}
    }
  }

  if (method === 'GET') {
    // Query user's NWC connections (privacy-first: RLS ensures scoping)
    const { data, error } = await supabase
      .from('nwc_wallet_connections')
      .select('connection_id,wallet_name,wallet_provider,pubkey_preview,relay_domain,user_role,spending_limit,requires_approval,is_active,is_primary,connection_status,supported_methods,created_at,last_used_at')
      .eq('user_hash', session.hashedId)
      .order('is_primary', { ascending: false });

    if (error) {
      console.error('Failed to fetch NWC connections:', error);
      return errorResponse(500, 'Failed to fetch connections', requestId, requestOrigin);
    }

    return { statusCode: 200, headers: getSecurityHeaders(requestOrigin), body: JSON.stringify({ success: true, connections: data || [] }) };
  }

  if (method === 'POST') {
    // Add new NWC connection (store encrypted connection string)
    let payload = {};
    try { payload = JSON.parse(event.body || '{}'); } catch {
      return createValidationErrorResponse(
        'Invalid JSON body',
        requestId,
        requestOrigin
      );
    }

    const { connectionString = '', walletName = 'NWC Wallet', provider = 'other', userRole = 'adult', setPrimary = true } = payload || {};

    // Basic validation of NWC connection string
    if (typeof connectionString !== 'string' || !connectionString.startsWith('nostr+walletconnect://')) {
      return createValidationErrorResponse(
        'Invalid NWC connection string',
        requestId,
        requestOrigin
      );
    }

    // Parse pubkey, relay
    let pubkey = '', relay = '';
    try {
      const u = new URL(connectionString);
      pubkey = u.hostname;
      relay = String(u.searchParams.get('relay') || '');
    } catch {}
    if (!pubkey || pubkey.length !== 64 || !relay.startsWith('ws')) {
      return createValidationErrorResponse(
        'Malformed NWC URL',
        requestId,
        requestOrigin
      );
    }

    // Generate connection_id (privacy-preserving)
    const encoder = new TextEncoder();
    const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(`nwc_${pubkey}_${Date.now()}`));
    const idHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    const connectionId = `nwc_${idHex}`;

    // Encrypt connection string using AES-GCM with per-user key derivation (PBKDF2)
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(session.hashedId || 'user'), { name: 'PBKDF2' }, false, ['deriveKey']);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const aesKey = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoder.encode(connectionString));
    const saltB64 = btoa(String.fromCharCode(...salt));
    const ivB64 = btoa(String.fromCharCode(...iv));
    const encB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));

    const pubkeyPreview = `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
    const relayDomain = (() => { try { return new URL(relay).hostname; } catch { return relay; } })();

    // Persist using RPC helper (sets spending limits by role)
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_nwc_wallet_connection', {
      p_user_hash: session.hashedId,
      p_connection_id: connectionId,
      p_encrypted_connection_string: encB64,
      p_connection_encryption_salt: saltB64,
      p_connection_encryption_iv: ivB64,
      p_wallet_name: String(walletName),
      p_wallet_provider: String(provider),
      p_pubkey_preview: pubkeyPreview,
      p_relay_domain: relayDomain,
      p_user_role: String(userRole)
    });

    if (rpcError) {
      return errorResponse(500, 'Failed to save connection', requestId, requestOrigin);
    }

    // Optionally set as primary
    if (setPrimary) {
      try {
        await supabase.from('nwc_wallet_connections').update({ is_primary: true }).eq('user_hash', session.hashedId).eq('connection_id', connectionId);
      } catch {}
    }

    return { statusCode: 201, headers: getSecurityHeaders(requestOrigin), body: JSON.stringify({ success: true, data: { connection_id: connectionId, wallet_name: walletName, wallet_provider: provider, pubkey_preview: pubkeyPreview, relay_domain: relayDomain } }) };
  }

  return errorResponse(405, 'Method not allowed', requestId, requestOrigin);
}


// Inline: NWC wallet operations (POST)
async function handleNwcOperationsInline(event, requestId, requestOrigin) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method !== 'POST') {
    return errorResponse(405, 'Method not allowed', requestId, requestOrigin);
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
  const isAuthed = !!(session && (session.isAuthenticated === true || session?.userId || session?.npub));
  if (!isAuthed) {
    return createAuthErrorResponse(
      'Authentication required',
      requestId,
      requestOrigin
    );
  }

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch {
    return createValidationErrorResponse(
      'Invalid JSON body',
      requestId,
      requestOrigin
    );
  }

  const op = typeof payload.method === 'string' ? payload.method : '';
  const params = (payload && payload.params) || {};
  const connectionId = payload && payload.connectionId ? String(payload.connectionId) : undefined;

  // Load connection-specific relay from DB (if connectionId provided)
  let connectionInfo = { relay: '', pubkey: '', secret: '' };
  if (connectionId) {
    try {
      const { getRequestClient } = await import('./supabase.js');
      const supabase = getRequestClient(String((authHeader || '').replace(/^Bearer\s+/i, '')));
      try { await supabase.rpc('set_app_current_user_hash', { val: session.hashedId }); } catch {}
      const { data: row } = await supabase
        .from('nwc_wallet_connections')
        .select('encrypted_connection_string, connection_encryption_salt, connection_encryption_iv')
        .eq('user_hash', session.hashedId)
        .eq('connection_id', connectionId)
        .maybeSingle();
      if (row && row.encrypted_connection_string && row.connection_encryption_salt && row.connection_encryption_iv) {
        const enc = Uint8Array.from(atob(row.encrypted_connection_string), c => c.charCodeAt(0));
        const salt = Uint8Array.from(atob(row.connection_encryption_salt), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(row.connection_encryption_iv), c => c.charCodeAt(0));
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(session.hashedId || 'user'), { name: 'PBKDF2' }, false, ['deriveKey']);
        const aesKey = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, enc);
        const connStr = new TextDecoder().decode(plainBuf);
        try {
          const u = new URL(connStr);
          connectionInfo.pubkey = u.hostname;
          connectionInfo.relay = String(u.searchParams.get('relay') || '');
          connectionInfo.secret = String(u.searchParams.get('secret') || '');
        } catch {}
      }
    } catch {}
  }

  try {
    if (!op) {
      return createValidationErrorResponse(
        'NWC method is required',
        requestId,
        requestOrigin
      );
    }

    // Ensure we have connection details
    if (!connectionInfo.pubkey || !connectionInfo.relay || !connectionInfo.secret) {
      return createValidationErrorResponse(
        'Missing NWC connection details',
        requestId,
        requestOrigin
      );
    }

    const resultRaw = await performNwcOperationOverNostr({
      method: op,
      params,
      connection: { pubkey: connectionInfo.pubkey, relay: connectionInfo.relay, secret: connectionInfo.secret },
      timeoutMs: 30000,
    });

    const result = (resultRaw && typeof resultRaw === 'object') ? { ...resultRaw, relay: connectionInfo.relay } : resultRaw;

    return { statusCode: 200, headers: getSecurityHeaders(requestOrigin), body: JSON.stringify({ success: true, data: { method: op, connectionId, result } }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'NWC operation failed';
    return errorResponse(500, message, requestId, requestOrigin);
  }
}