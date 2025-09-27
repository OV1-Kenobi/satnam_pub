// netlify/functions_active/lnbits-create-boltcard.ts
// Provisions NTAG424 Boltcard via LNbits Boltcards extension; returns auth QR and card params

import type { Handler } from "@netlify/functions";
import { createDecipheriv, createHash } from "node:crypto";
import { getRequestClient } from "../functions/supabase.js";
import { allowRequest } from "../functions/utils/rate-limiter.js";

const BASE_URL = process.env.LNBITS_BASE_URL || "";
const FEATURE_ENABLED =
  (process.env.VITE_LNBITS_INTEGRATION_ENABLED || "").toLowerCase() === "true";

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
function clientIpFrom(event: any): string {
  const xfwd =
    event.headers?.["x-forwarded-for"] ||
    event.headers?.["X-Forwarded-For"] ||
    "";
  return (
    (Array.isArray(xfwd) ? xfwd[0] : xfwd).split(",")[0]?.trim() ||
    event.headers?.["x-real-ip"] ||
    "unknown"
  );
}
function parseJson(body: string | null): any {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function keyFromSecret(): Buffer {
  const s = process.env.LNBITS_KEY_ENC_SECRET || process.env.DUID_SERVER_SECRET;
  if (!s) throw new Error("Encryption secret not configured");
  return createHash("sha256").update(s).digest();
}
function decrypt(encB64: string): string {
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

async function lnbitsFetch(
  path: string,
  apiKey: string,
  init: RequestInit = {}
) {
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
    throw new Error(
      `LNbits ${path} -> ${res.status}: ${text || res.statusText}`
    );
  }
  const ctype = res.headers.get("content-type") || "";
  return ctype.includes("application/json") ? res.json() : res.text();
}

export const handler: Handler = async (event) => {
  try {
    if (!FEATURE_ENABLED)
      return json(503, {
        success: false,
        error: "LNbits integration disabled",
      });

    const ip = clientIpFrom(event);
    if (!allowRequest(ip, 10, 60_000))
      return json(429, { success: false, error: "Too many attempts" });
    if (event.httpMethod !== "POST")
      return json(405, { success: false, error: "Method not allowed" });

    const token = (
      event.headers?.authorization ||
      event.headers?.Authorization ||
      ""
    ).replace(/^Bearer\s+/i, "");
    if (!token)
      return json(401, { success: false, error: "Missing Authorization" });
    const supabase = getRequestClient(token);

    const { data: me, error: meErr } = await supabase.auth.getUser();
    if (meErr || !me?.user?.id)
      return json(401, { success: false, error: "Unauthorized" });
    const user_duid: string = me.user.id;

    // Body: label, spend_limit_sats, pin_required (bool), pos (bool)
    const body = parseJson(event.body);
    const label: string =
      typeof body?.label === "string" && body.label.trim()
        ? body.label.trim()
        : "My Boltcard";
    const spendLimit: number = Number(body?.spend_limit_sats || 20000);

    // Fetch wallet row and decrypt invoice/admin key (Boltcards usually requires admin key)
    const { data: walletRow, error: rowErr } = await supabase
      .from("lnbits_wallets")
      .select("id, wallet_id, wallet_admin_key_enc, wallet_invoice_key_enc")
      .eq("user_duid", user_duid)
      .single();
    if (rowErr || !walletRow)
      return json(400, { success: false, error: "No wallet found" });

    const adminKey = walletRow.wallet_admin_key_enc
      ? decrypt(walletRow.wallet_admin_key_enc)
      : undefined;
    if (!adminKey)
      return json(500, {
        success: false,
        error: "Wallet admin key unavailable",
      });

    // Create bolt card via Boltcards extension
    // API: POST /boltcards/api/v1/cards { uid, label, daily_limit, currency, k0/k1/k2 (optional, server can generate), lnurlw_base (optional) }
    const cardReq = {
      label,
      daily_limit: spendLimit,
    } as any;

    const created = await lnbitsFetch("/boltcards/api/v1/cards", adminKey, {
      method: "POST",
      body: JSON.stringify(cardReq),
    });
    const cardId =
      created?.id || created?.uid || created?.card_id || created?.data?.id;
    if (!cardId)
      return json(500, { success: false, error: "Failed to create boltcard" });

    // Save minimal parameters locally (no secrets)
    const { error: insErr } = await supabase.from("lnbits_boltcards").insert({
      user_duid,
      wallet_id: walletRow.wallet_id,
      card_id: String(cardId),
      label,
      spend_limit_sats: spendLimit,
      created_at: new Date().toISOString(),
    });
    if (insErr)
      return json(500, { success: false, error: insErr.message || "DB error" });

    // Return QR or programming payload if provided (depends on LNbits version)
    const authQr = created?.auth_link || created?.lnurlw || created?.qr || null;

    return json(200, { success: true, cardId, authQr });
  } catch (e: any) {
    return json(500, { success: false, error: e?.message || "Server error" });
  }
};
