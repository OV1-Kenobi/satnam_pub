// NWC client wrapper for Netlify Functions (ESM)
// Static ESM imports only; Node-only websocket polyfill is safe in Functions
import { NWCClient } from '@getalby/sdk/nwc';
import 'websocket-polyfill';

/**
 * Build a standard NWC URI from connection parts
 * @param {{ pubkey: string; relay: string; secret: string }} c
 */
function buildNwcUri(c) {
  const pubkey = encodeURIComponent(String(c.pubkey || ''));
  const relay  = encodeURIComponent(String(c.relay  || ''));
  const secret = encodeURIComponent(String(c.secret || ''));
  return `nostr+walletconnect://${pubkey}?relay=${relay}&secret=${secret}`;
}

function withTimeout(promise, timeoutMs = 30000, label = 'NWC operation') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(v => { clearTimeout(t); resolve(v); }).catch(e => { clearTimeout(t); reject(e); });
  });
}

/**
 * Perform a NIP-47 operation over Nostr using Alby SDK NWCClient (low-level API)
 *
 * @param {{
 *   method: 'get_balance'|'make_invoice'|'pay_invoice'|'lookup_invoice'|'list_transactions',
 *   params: any,
 *   connection: { pubkey: string; relay: string; secret: string },
 *   timeoutMs?: number
 * }} args
 */
export async function performNwcOperationOverNostr({ method, params = {}, connection, timeoutMs = 30000 }) {
  if (!connection || !connection.pubkey || !connection.relay || !connection.secret) {
    throw new Error('Invalid NWC connection data');
  }

  const nwcUrl = buildNwcUri(connection);

  // NWCClient uses the NWC URL to perform LN ops via NIP-47 directly
  const client = new NWCClient({ nostrWalletConnectUrl: nwcUrl });

  const op = (async () => {
    try {
      switch (method) {
      case 'get_balance': {
        const res = await client.getBalance();
        // Normalize to { balance, max_amount, budget_renewal, currency }
        return {
          balance: res?.balance ?? res?.availableBalance ?? 0,
          max_amount: res?.max_amount ?? res?.maxAmount,
          budget_renewal: res?.budget_renewal ?? res?.budgetRenewal,
          currency: res?.currency ?? 'sat',
        };
      }
      case 'make_invoice': {
        const amount = Number(params.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid invoice amount');
        const description = typeof params.description === 'string' ? params.description : 'NWC Invoice';
        const res = await client.makeInvoice({ amount, description });
        return {
          payment_request: res?.payment_request ?? res?.paymentRequest ?? res?.invoice ?? '',
          payment_hash: res?.payment_hash ?? res?.paymentHash ?? res?.rHash ?? '',
          amount,
          description,
          expires_at: res?.expires_at ?? res?.expiresAt ?? null,
        };
      }
      case 'pay_invoice': {
        const invoice = String(params.invoice || '');
        if (!invoice) throw new Error('Invoice is required');
        const res = await client.payInvoice({ invoice });
        return {
          payment_hash: res?.payment_hash ?? res?.paymentHash ?? res?.rHash ?? '',
          paid: res?.paid ?? (res?.status === 'completed' || res?.status === 'succeeded') ?? true,
          amount: res?.amount ?? null,
          fee: res?.fee ?? null,
          timestamp: res?.timestamp ?? Date.now(),
        };
      }
      case 'lookup_invoice': {
        const payment_hash = String(params.payment_hash || '');
        if (!payment_hash) throw new Error('payment_hash is required');
        // Try preferred lookup method name, with graceful fallbacks
        const res = await client.lookupInvoice({ payment_hash });
        return {
          payment_hash,
          paid: !!(res?.paid ?? res?.settled ?? (res?.status === 'completed')),
          amount: res?.amount ?? res?.amount_msat ?? null,
          description: res?.description ?? res?.memo ?? undefined,
          expires_at: res?.expires_at ?? res?.expiry ?? null,
          created_at: res?.created_at ?? null,
        };
      }
      case 'list_transactions': {
        const limitNum = Number(params.limit);
        const limit = Number.isFinite(limitNum)
          ? Math.max(1, Math.min(100, limitNum))
          : 10;
        const offset = Math.max(0, Number(params.offset || 0));
        const res = await client.listTransactions({ limit, offset });
        const transactions = Array.isArray(res?.transactions)
          ? res.transactions
          : (Array.isArray(res) ? res : []);
        return { transactions, total: res?.total ?? undefined, limit, offset };
      }
      default:
        throw new Error(`Unsupported NWC method: ${method}`);
    }
  } finally {
    try { await Promise.resolve(client.close()); } catch (_) {}
  }
})();

  return await withTimeout(op, timeoutMs, `NWC ${method}`);
}

