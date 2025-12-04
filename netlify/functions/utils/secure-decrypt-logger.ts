/*
  Secure Decrypt + Audit Logging Template for Netlify Functions (ESM, TS)
  - Generates per-request UUID
  - Standardizes audit entries
  - Calls secure RPC wrappers (service-role only)
*/

import { randomUUID } from "node:crypto";

// IMPORTANT: Use the service-role Supabase client here (server-only). Adjust import to your project layout.
// Example assumes a helper that exposes an admin client: export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
// eslint-disable-next-line import/no-relative-packages
import { supabaseAdmin } from "../supabase.js";

export type DecryptOperation =
  | "decrypt_invoice_key"
  | "decrypt_admin_key"
  | "provision_wallet"
  | "scrub_update"
  | "lnurlp_invoice"
  | "memory_violation";

export interface DecryptAuditEntry {
  request_id: string;
  /** User identifier. For federation operations, use federation_id instead. */
  user_id?: string;
  /** Federation identifier for federation-specific operations. */
  federation_id?: string;
  wallet_id?: string;
  caller: string; // function/endpoint name
  operation: DecryptOperation;
  source_ip?: string; // optional
  result?: "success" | "failure";
  error?: string;
}

export function newRequestId(): string {
  return randomUUID();
}

export async function logDecryptAudit(entry: DecryptAuditEntry): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not available");
  }
  // Writes to private.lnbits_key_access_audit (service-role only)
  const { error } = await supabaseAdmin
    .schema("private")
    .from("lnbits_key_access_audit")
    .insert({
      request_id: entry.request_id,
      user_id: entry.user_id ?? null,
      wallet_id: entry.wallet_id ?? null,
      caller: entry.caller,
      operation: entry.operation,
      source_ip: entry.source_ip ?? null,
      result: entry.result ?? null,
      error: entry.error ?? null,
    });
  if (error) {
    throw error;
  }
}

export async function getInvoiceKey(
  walletId: string,
  caller: string,
  requestId: string
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not available");
  }
  const { data, error } = await supabaseAdmin.rpc(
    "private.get_invoice_key_for_wallet",
    {
      p_wallet_id: walletId,
      p_caller: caller,
      p_request_id: requestId,
    }
  );
  if (error) throw error;
  return data as string;
}

export async function getAdminKey(
  walletId: string,
  caller: string,
  requestId: string
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not available");
  }
  const { data, error } = await supabaseAdmin.rpc(
    "private.get_admin_key_for_wallet",
    {
      p_wallet_id: walletId,
      p_caller: caller,
      p_request_id: requestId,
    }
  );
  if (error) throw error;
  return data as string;
}

// Federation-specific key getters (uses federation_lightning_config table)

export async function getFederationInvoiceKey(
  walletId: string,
  caller: string,
  requestId: string
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not available");
  }
  const { data, error } = await supabaseAdmin.rpc(
    "private.get_federation_invoice_key_for_wallet",
    {
      p_wallet_id: walletId,
      p_caller: caller,
      p_request_id: requestId,
    }
  );
  if (error) throw error;
  return data as string;
}

export async function getFederationAdminKey(
  walletId: string,
  caller: string,
  requestId: string
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not available");
  }
  const { data, error } = await supabaseAdmin.rpc(
    "private.get_federation_admin_key_for_wallet",
    {
      p_wallet_id: walletId,
      p_caller: caller,
      p_request_id: requestId,
    }
  );
  if (error) throw error;
  return data as string;
}

// Memory safety guard: ensures decrypted keys are released within a short window
// We use a WeakMap keyed by an opaque token object; we never retain the actual key value.
const memoryGuards: WeakMap<
  object,
  { released: boolean; t0: number; timeoutMs: number }
> = new WeakMap();

async function scheduleMemoryCheck(
  token: object,
  ctx: {
    requestId: string;
    userId?: string;
    walletId?: string;
    caller: string;
    sourceIp?: string;
  },
  timeoutMs: number
) {
  setTimeout(async () => {
    try {
      const meta = memoryGuards.get(token);
      if (!meta) return; // token GC'd or already released
      if (!meta.released) {
        // Memory safety violation: key likely retained too long
        try {
          await logDecryptAudit({
            request_id: ctx.requestId,
            user_id: ctx.userId,
            wallet_id: ctx.walletId,
            caller: ctx.caller,
            operation: "memory_violation",
            result: "failure",
            error: `decrypted key not released within ${timeoutMs}ms`,
            source_ip: ctx.sourceIp,
          });
        } catch (e) {
          // Swallow audit errors to avoid unhandled rejections in timer
        }
      }
    } finally {
      // Do not keep the token beyond check
      memoryGuards.delete(token);
    }
  }, timeoutMs).unref?.();
}

export async function withMemorySafetyCheck(
  getKey: () => Promise<string>,
  ctx: {
    requestId: string;
    userId?: string;
    /** Federation identifier for federation-specific operations. */
    federationId?: string;
    walletId?: string;
    caller: string;
    sourceIp?: string;
    timeoutMs?: number;
  }
): Promise<{ key: string; release: () => Promise<void> }> {
  const timeoutMs = ctx.timeoutMs ?? 1000;
  const token = {};
  memoryGuards.set(token, { released: false, t0: Date.now(), timeoutMs });
  await scheduleMemoryCheck(token, ctx, timeoutMs);

  let key: string;
  try {
    key = await getKey();
  } catch (err) {
    // If key acquisition fails, remove guard to prevent false positives
    memoryGuards.delete(token);
    throw err;
  }

  async function release() {
    const meta = memoryGuards.get(token);
    if (meta) {
      meta.released = true;
      memoryGuards.delete(token);
    }
  }

  return { key, release };
}

export async function getInvoiceKeyWithSafety(
  walletId: string,
  caller: string,
  requestId: string,
  userId?: string,
  sourceIp?: string,
  timeoutMs = 1000
): Promise<{ key: string; release: () => Promise<void> }> {
  return withMemorySafetyCheck(
    () => getInvoiceKey(walletId, caller, requestId),
    { requestId, userId, walletId, caller, sourceIp, timeoutMs }
  );
}

export async function getAdminKeyWithSafety(
  walletId: string,
  caller: string,
  requestId: string,
  userId?: string,
  sourceIp?: string,
  timeoutMs = 1000
): Promise<{ key: string; release: () => Promise<void> }> {
  return withMemorySafetyCheck(() => getAdminKey(walletId, caller, requestId), {
    requestId,
    userId,
    walletId,
    caller,
    sourceIp,
    timeoutMs,
  });
}

// Federation-specific key safety wrappers

export async function getFederationInvoiceKeyWithSafety(
  walletId: string,
  caller: string,
  requestId: string,
  federationId?: string,
  sourceIp?: string,
  timeoutMs = 1000
): Promise<{ key: string; release: () => Promise<void> }> {
  return withMemorySafetyCheck(
    () => getFederationInvoiceKey(walletId, caller, requestId),
    { requestId, federationId, walletId, caller, sourceIp, timeoutMs }
  );
}

export async function getFederationAdminKeyWithSafety(
  walletId: string,
  caller: string,
  requestId: string,
  federationId?: string,
  sourceIp?: string,
  timeoutMs = 1000
): Promise<{ key: string; release: () => Promise<void> }> {
  return withMemorySafetyCheck(
    () => getFederationAdminKey(walletId, caller, requestId),
    { requestId, federationId, walletId, caller, sourceIp, timeoutMs }
  );
}

// Scenario A: lnurlp-platform.ts — generate invoice (needs invoice_key)
export async function exampleGenerateInvoicePlatform(params: {
  userId: string;
  walletId: string;
  sourceIp?: string;
  amountMsats: number;
  memo?: string;
}) {
  const request_id = newRequestId();
  const caller = "lnurlp-platform";
  await logDecryptAudit({
    request_id,
    user_id: params.userId,
    wallet_id: params.walletId,
    caller,
    operation: "lnurlp_invoice",
    source_ip: params.sourceIp,
  });

  let invoiceKey: string | undefined;
  let release: (() => Promise<void>) | undefined;
  try {
    const res = await getInvoiceKeyWithSafety(
      params.walletId,
      caller,
      request_id,
      params.userId,
      params.sourceIp
    );
    invoiceKey = res.key;
    release = res.release;
    // ... use invoiceKey to call LNbits invoice API (X-Api-Key: invoiceKey)
    // const pr = await createInvoiceWithLNbits(invoiceKey, params.amountMsats, params.memo)
    await logDecryptAudit({
      request_id,
      user_id: params.userId,
      wallet_id: params.walletId,
      caller,
      operation: "decrypt_invoice_key",
      result: "success",
      source_ip: params.sourceIp,
    });
    return { request_id, ok: true /*, pr*/ };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await logDecryptAudit({
      request_id,
      user_id: params.userId,
      wallet_id: params.walletId,
      caller,
      operation: "decrypt_invoice_key",
      result: "failure",
      error: msg,
      source_ip: params.sourceIp,
    });
    throw err;
  } finally {
    // memory cleanup
    invoiceKey = undefined as unknown as string;
    if (release) await release();
  }
}

// Scenario B: lnaddress-proxy.ts — update Scrub configuration (needs admin_key)
export async function exampleUpdateScrubConfig(params: {
  userId: string;
  walletId: string;
  sourceIp?: string;
  forwardAddress: string;
  percent?: number;
}) {
  const request_id = newRequestId();
  const caller = "lnaddress-proxy";
  await logDecryptAudit({
    request_id,
    user_id: params.userId,
    wallet_id: params.walletId,
    caller,
    operation: "scrub_update",
    source_ip: params.sourceIp,
  });

  let adminKey: string | undefined;
  let release: (() => Promise<void>) | undefined;
  try {
    const res = await getAdminKeyWithSafety(
      params.walletId,
      caller,
      request_id,
      params.userId,
      params.sourceIp
    );
    adminKey = res.key;
    release = res.release;
    // ... call LNbits Scrub admin API using adminKey to set forwarding address/percent
    await logDecryptAudit({
      request_id,
      user_id: params.userId,
      wallet_id: params.walletId,
      caller,
      operation: "decrypt_admin_key",
      result: "success",
      source_ip: params.sourceIp,
    });
    return { request_id, ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await logDecryptAudit({
      request_id,
      user_id: params.userId,
      wallet_id: params.walletId,
      caller,
      operation: "decrypt_admin_key",
      result: "failure",
      error: msg,
      source_ip: params.sourceIp,
    });
    throw err;
  } finally {
    // memory cleanup
    adminKey = undefined as unknown as string;
    if (release) await release();
  }
}
