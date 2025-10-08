// netlify/functions_active/lnbits-pay-invoice.ts
// Programmatic Lightning invoice payment via LNbits
//
// API: POST /.netlify/functions/lnbits-pay-invoice
// Auth: JWT Bearer (Authorization: Bearer <token>)
// Body: { invoice: string, walletId?: string, maxFeeSats?: number }
// Response (200): { success: true, data: { payment_hash, checking_id?, fee?, amount_sats } }
// Errors: 400 (validation), 401 (auth), 403 (limits), 405 (method), 429 (rate limit), 500/503
//
// Notes:
// - Feature-gated by VITE_LNBITS_INTEGRATION_ENABLED
// - Decrypts per-user LNbits admin key from lnbits_wallets.wallet_admin_key_enc
// - Applies Master Context single-transaction limits for offspring role
//   • offspring approval threshold: 25_000 sats (reject without guardian approval)
//   • offspring daily limit: 50_000 sats (conservative single-payment cap enforced here)
// - Amount parsing: uses BOLT11 HRP to extract amount. If missing, rejects.

import type { Handler } from "@netlify/functions";
import { createDecipheriv, createHash } from "node:crypto";
import { getRequestClient } from "../functions/supabase.js";
import { allowRequest } from "../functions/utils/rate-limiter.js";

const BASE_URL = process.env.LNBITS_BASE_URL || "";
const FEATURE_ENABLED = (process.env.VITE_LNBITS_INTEGRATION_ENABLED || "").toLowerCase() === "true";

function json(statusCode: number, body: any) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function clientIpFrom(event: any): string {
  const xfwd = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"] || "";
  return (Array.isArray(xfwd) ? xfwd[0] : xfwd).split(",")[0]?.trim() || (event.headers?.["x-real-ip"] as string) || "unknown";
}

function keyFromSecret(): Buffer {
  const s = process.env.LNBITS_KEY_ENC_SECRET || process.env.DUID_SERVER_SECRET;
  if (!s) throw new Error("Encryption secret not configured");
  return createHash("sha256").update(s).digest();
}

function decryptB64(encB64: string): string {
  const raw = Buffer.from(encB64, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const key = keyFromSecret();
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  const out = Buffer.concat([d.update(data), d.final()]);
  return out.toString("utf8");
}

async function lnbitsFetch(path: string, apiKey: string, init: RequestInit = {}) {
  if (!BASE_URL) throw new Error("LNbits base URL not configured");
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LNbits ${path} -> ${res.status}: ${text || res.statusText}`);
  }
  const ctype = res.headers.get("content-type") || "";
  return ctype.includes("application/json") ? res.json() : res.text();
}

// Minimal BOLT11 HRP amount parser (returns sats or null if missing)
function parseInvoiceAmountSats(invoice: string): number | null {
  if (!invoice || typeof invoice !== "string") return null;
  const inv = invoice.trim().toLowerCase();
  if (!inv.startsWith("ln")) return null;
  const sep = inv.indexOf("1");
  if (sep <= 2) return null; // invalid or no HRP/data separator
  const hrp = inv.slice(0, sep); // e.g., lnbc2500u
  // strip network prefix after 'ln'
  const afterLn = hrp.slice(2); // e.g., bc2500u
  // find first digit
  let i = 0;
  while (i < afterLn.length && afterLn.charCodeAt(i) >= 97 && afterLn.charCodeAt(i) <= 122) i++; // skip letters
  if (i >= afterLn.length) return null; // amount missing
  let j = i;
  while (j < afterLn.length && afterLn.charCodeAt(j) >= 48 && afterLn.charCodeAt(j) <= 57) j++; // digits
  if (j === i) return null;
  const amountStr = afterLn.slice(i, j);
  const unit = afterLn.slice(j); // may be '', 'm','u','n','p'
  const amount = Number.parseInt(amountStr, 10);
  if (!Number.isFinite(amount)) return null;
  let multiplierBTC = 1; // default is BTC if no unit
  const u = unit || "";
  if (u === "m") multiplierBTC = 1 / 1_000;
  else if (u === "u") multiplierBTC = 1 / 1_000_000;
  else if (u === "n") multiplierBTC = 1 / 1_000_000_000;
  else if (u === "p") multiplierBTC = 1 / 1_000_000_000_000;
  else if (u.length > 0) return null; // unknown unit
  const sats = Math.round(amount * multiplierBTC * 100_000_000);
  return sats > 0 ? sats : null;
}

export const handler: Handler = async (event) => {
  try {
    if (!FEATURE_ENABLED) return json(503, { success: false, error: "LNbits integration disabled" });
    if (event.httpMethod !== "POST") return json(405, { success: false, error: "Method not allowed" });

    const ip = clientIpFrom(event);
    if (!allowRequest(ip, 10, 60_000)) return json(429, { success: false, error: "Too many requests" });

    const authz = event.headers?.authorization || event.headers?.Authorization || "";
    const token = authz.replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { success: false, error: "Missing Authorization" });
    const supabase = getRequestClient(token);

    const { data: me, error: meErr } = await supabase.auth.getUser();
    if (meErr || !me?.user?.id) return json(401, { success: false, error: "Unauthorized" });
    const user_duid: string = me.user.id;

    // Parse request body
    let body: any = {};
    try {
      const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json(400, { success: false, error: "Invalid JSON body" });
    }

    const invoice = typeof body.invoice === "string" ? body.invoice.trim() : "";
    const walletId = typeof body.walletId === "string" ? body.walletId.trim() : undefined;
    const maxFeeSats = typeof body.maxFeeSats === "number" && Number.isFinite(body.maxFeeSats) && body.maxFeeSats >= 0 ? Math.floor(body.maxFeeSats) : undefined;

    if (!invoice || invoice.length < 100 || invoice.length > 4096 || !invoice.toLowerCase().startsWith("ln")) {
      return json(400, { success: false, error: "Invalid Lightning invoice" });
    }

    const amountSats = parseInvoiceAmountSats(invoice);
    if (amountSats === null) {
      return json(400, { success: false, error: "Invoice must specify an amount" });
    }

    // Fetch user's role (Master Context) for limit checks
    const { data: ident, error: identErr } = await supabase
      .from("user_identities")
      .select("role")
      .eq("id", user_duid)
      .single();
    if (identErr || !ident) return json(500, { success: false, error: "Failed to load user role" });
    const role: "private"|"offspring"|"adult"|"steward"|"guardian" = (ident.role as any) || "private";

    // Enforce conservative single-transaction limits for offspring
    if (role === "offspring") {
      if (amountSats > 50_000) {
        return json(403, { success: false, error: "Daily limit exceeded for offspring (50,000 sats)" });
      }
      if (amountSats > 25_000) {
        return json(403, { success: false, error: "Guardian approval required above 25,000 sats" });
      }
    }

    // Fetch wallet row for this user (RLS ensures ownership)
    const query = supabase
      .from("lnbits_wallets")
      .select("id, wallet_id, wallet_admin_key_enc")
      .eq("user_duid", user_duid);
    const { data: wallets, error: wErr } = walletId ? await query.eq("wallet_id", walletId) : await query.limit(1);
    if (wErr) return json(500, { success: false, error: wErr.message || "DB error" });

    const walletRow = Array.isArray(wallets) ? (wallets[0] as any) : (wallets as any);
    if (!walletRow || !walletRow.wallet_admin_key_enc || !walletRow.wallet_id) {
      return json(400, { success: false, error: "No wallet/admin key found" });
    }

    let adminKey: string;
    try {
      adminKey = decryptB64(walletRow.wallet_admin_key_enc);
    } catch (e: any) {
      return json(500, { success: false, error: e?.message || "Failed to decrypt admin key" });
    }

    // Execute payment via LNbits Core API
    const payload: Record<string, any> = { out: true, bolt11: invoice };
    if (typeof maxFeeSats === "number") payload.max_fee = maxFeeSats; // honored if supported by LNbits

    const result: any = await lnbitsFetch("/api/v1/payments", adminKey, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    // Normalize response fields
    const data = {
      payment_hash: String(result?.payment_hash || result?.checking_id || result?.paymentHash || ""),
      checking_id: result?.checking_id ? String(result.checking_id) : undefined,
      amount_sats: amountSats,
      fee: typeof result?.fee === "number" ? result.fee : undefined,
      raw: result,
    };

    return json(200, { success: true, data });
  } catch (e: any) {
    return json(500, { success: false, error: e?.message || "Server error" });
  }
};

