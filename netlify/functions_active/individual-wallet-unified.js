// Unified Individual Wallet Handler - Netlify Function (ESM)
// Converts lazy-loaded wallet modules to inline implementations for Netlify dev compatibility
// Routes: /api/individual/lightning/wallet, /api/individual/cashu/wallet, /api/individual/wallet, /api/user/nwc-connections, /api/wallet/nostr-wallet-connect

import { SecureSessionManager } from '../functions/security/session-manager.js';

export const handler = async (event, context) => {
  const cors = buildCorsHeaders(event);

  // CORS preflight
  if ((event.httpMethod || 'GET').toUpperCase() === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  try {
    const method = (event.httpMethod || 'GET').toUpperCase();
    const path = (event.path || '').toLowerCase();

    // Route resolution for individual wallet operations (inline handlers)
    const target = resolveIndividualWalletRoute(path, method);
    if (!target) {
      return {
        statusCode: 404,
        headers: cors,
        body: JSON.stringify({ success: false, error: 'Individual wallet endpoint not found', path, method })
      };
    }

    let response;
    switch (target.route) {
      case 'lightning':
        response = await handleLightningWalletInline(event, cors);
        break;
      case 'cashu':
        response = await handleCashuWalletInline(event, cors);
        break;
      case 'unified':
        response = await handleUnifiedWalletInline(event, cors);
        break;
      case 'nwc':
        response = await handleNwcConnectionsInline(event, cors);
        break;
      case 'nwc_ops':
        response = await handleNwcOperationsInline(event, cors);
        break;
      default:
        return { statusCode: 404, headers: cors, body: JSON.stringify({ success: false, error: 'Route not handled' }) };
    }

    // Ensure CORS headers are present in response
    if (response && typeof response === 'object') {
      return { ...response, headers: { ...(response.headers || {}), ...cors } };
    }

    return { statusCode: 200, headers: cors, body: typeof response === 'string' ? response : JSON.stringify(response) };

  } catch (error) {
    console.error('Unified individual wallet handler error:', error);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: 'Individual wallet service error' })
    };
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
async function handleLightningWalletInline(event, corsHeaders) {
  if ((event.httpMethod || 'GET').toUpperCase() !== 'GET') {
    return { statusCode: 405, headers: { ...corsHeaders, Allow: 'GET' }, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
  const isAuthed = !!(session && (session.isAuthenticated === true || session?.userId || session?.npub));
  if (!isAuthed) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Authentication required' }) };
  }

  const qs = event.queryStringParameters || {};
  const rawMemberId = typeof qs.memberId === 'string' ? qs.memberId : '';
  if (!rawMemberId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Member ID is required' }) };
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

  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(body) };
}

// Inline: Cashu wallet handler (GET)
async function handleCashuWalletInline(event, corsHeaders) {
  if ((event.httpMethod || 'GET').toUpperCase() !== 'GET') {
    return { statusCode: 405, headers: { ...corsHeaders, Allow: 'GET' }, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
  const isAuthed = !!(session && (session.isAuthenticated === true || session?.userId || session?.npub));
  if (!isAuthed) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Authentication required' }) };
  }

  const qs = event.queryStringParameters || {};
  const rawMemberId = typeof qs.memberId === 'string' ? qs.memberId : '';
  if (!rawMemberId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Member ID is required' }) };
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

  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(body) };
}

// Inline: Unified wallet (GET/POST)
async function handleUnifiedWalletInline(event, corsHeaders) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    return { statusCode: 405, headers: { ...corsHeaders, Allow: 'GET, POST' }, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
  const isAuthed = !!(session && (session.isAuthenticated === true || session?.userId || session?.npub));
  if (!isAuthed) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Authentication required' }) };
  }

  const qs = event.queryStringParameters || {};
  const rawMemberId = typeof qs.memberId === 'string' ? qs.memberId : '';
  if (!rawMemberId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Member ID is required' }) };
  }
  const memberId = rawMemberId === 'current-user' ? session.userId : rawMemberId;

  if (method === 'POST') {
    // Accept privacy settings updates (no-op mock to maintain API compatibility)
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, updated: true }) };
  }

  // For GET, assemble a concise unified summary
  const lightning = await JSON.parse((await handleLightningWalletInline({ ...event, httpMethod: 'GET', queryStringParameters: { ...qs, memberId } }, corsHeaders)).body);
  const cashu = await JSON.parse((await handleCashuWalletInline({ ...event, httpMethod: 'GET', queryStringParameters: { ...qs, memberId } }, corsHeaders)).body);

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

  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(body) };
}

// Inline: NWC connections (GET/POST)
async function handleNwcConnectionsInline(event, corsHeaders) {
  const method = (event.httpMethod || 'GET').toUpperCase();

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
  const isAuthed = !!(session && (session.isAuthenticated === true || session?.userId || session?.npub));
  if (!isAuthed) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Authentication required' }) };
  }

  if (method === 'GET') {
    // Return an empty list by default; UI handles empty state
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, connections: [] }) };
  }

  if (method === 'POST') {
    // Accept new connection (mock persistence)
    let payload = {};
    try { payload = JSON.parse(event.body || '{}'); } catch {}
    const { connectionString = '', walletName = 'NWC Wallet', provider = 'other', userRole = 'adult' } = payload || {};

    const connection = {
      connection_id: `nwc_${Date.now()}`,
      wallet_name: String(walletName),
      wallet_provider: String(provider),
      pubkey_preview: 'npub1...',
      relay_domain: 'relay.satnam.pub',
      user_role: /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (userRole),
      is_primary: true,
      connection_status: 'connected',
      created_at: new Date().toISOString(),
      last_used_at: new Date().toISOString()
    };

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, connection }) };
  }

  return { statusCode: 405, headers: { ...corsHeaders, Allow: 'GET, POST' }, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
}


// Inline: NWC wallet operations (POST)
async function handleNwcOperationsInline(event, corsHeaders) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method !== 'POST') {
    return { statusCode: 405, headers: { ...corsHeaders, Allow: 'POST' }, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
  const isAuthed = !!(session && (session.isAuthenticated === true || session?.userId || session?.npub));
  if (!isAuthed) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Authentication required' }) };
  }

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Invalid JSON body' }) };
  }

  const op = typeof payload.method === 'string' ? payload.method : '';
  const params = (payload && payload.params) || {};
  const connectionId = payload && payload.connectionId ? String(payload.connectionId) : undefined;

  try {
    switch (op) {
      case 'get_balance': {
        const result = { balance: 125000, max_amount: 500000, budget_renewal: 86400 };
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, data: { method: op, connectionId, result } }) };
      }
      case 'make_invoice': {
        const amount = Number(params.amount) || 1000;
        const description = typeof params.description === 'string' ? params.description : 'NWC Invoice';
        const payment_hash = `ph_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const payment_request = `lnbc${amount}n1${payment_hash.slice(-8)}...`;
        const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const result = { payment_request, payment_hash, amount, description, expires_at };
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, data: { method: op, connectionId, result } }) };
      }
      case 'pay_invoice': {
        const invoice = typeof params.invoice === 'string' ? params.invoice : '';
        const payment_hash = `ph_${Date.now().toString(36)}`;
        const result = { payment_hash, status: 'completed', fee: 5, invoice: Boolean(invoice) };
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, data: { method: op, connectionId, result } }) };
      }
      case 'lookup_invoice': {
        const payment_hash = typeof params.payment_hash === 'string' ? params.payment_hash : `ph_${Date.now().toString(36)}`;
        const result = { payment_hash, status: 'completed', amount: 1000, settled_at: new Date().toISOString() };
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, data: { method: op, connectionId, result } }) };
      }
      case 'list_transactions': {
        const limit = Math.max(1, Math.min(50, Number(params.limit) || 10));
        const now = Date.now();
        const items = Array.from({ length: limit }).map((_, i) => ({
          id: `nwc_tx_${i + 1}`,
          type: i % 3 === 0 ? 'payment' : (i % 3 === 1 ? 'invoice' : 'zap'),
          amount: 1000 + i * 100,
          fee: i % 2 === 0 ? 1 : 0,
          memo: i % 3 === 0 ? 'Payment' : (i % 3 === 1 ? 'Invoice' : 'Zap'),
          timestamp: new Date(now - (i + 1) * 600000),
          status: 'completed',
          payment_hash: `ph_${(now - i).toString(36)}`,
        }));
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, data: { method: op, connectionId, result: items } }) };
      }
      default:
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Unsupported NWC method' }) };
    }
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'NWC operation failed' }) };
  }
}

/**
 * Build CORS headers with environment-aware configuration
 * @param {Object} event
 * @returns {Object}
 */
function buildCorsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigin = isProd ? (process.env.FRONTEND_URL || 'https://www.satnam.pub') : (origin || '*');
  const allowCredentials = allowedOrigin !== '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': String(allowCredentials),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    'Content-Type': 'application/json'
  };
}
