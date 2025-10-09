// netlify/functions_active/lnbits-create-boltcard.ts
// Provisions NTAG424 Boltcard via LNbits Boltcards extension; returns auth QR and card params

import type { Handler } from "@netlify/functions";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
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

function encryptB64(plain: string): string {
  const key = keyFromSecret();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

async function getUserSalt(
  supabase: any,
  user_duid: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("user_identities")
      .select("user_salt")
      .eq("id", user_duid)
      .single();
    if (error) return null;
    return data?.user_salt || null;
  } catch {
    return null;
  }
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
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

    // Attempt to compute and persist privacy-preserving card_uid_hash
    try {
      // 1) Get per-user salt
      const userSalt = await getUserSalt(supabase, user_duid);
      if (!userSalt) {
        console.warn("card_uid_hash: missing user_salt; skipping hash persist");
      } else {
        // 2) Extract UID from creation response or fetch card list as fallback
        let cardUid: string | null = created?.uid || created?.card_uid || null;
        if (!cardUid) {
          try {
            const cards = await lnbitsFetch(
              "/boltcards/api/v1/cards",
              adminKey,
              {
                method: "GET",
              }
            );
            if (Array.isArray(cards)) {
              const match = cards.find(
                (c: any) =>
                  String(c?.id || c?.uid || c?.card_id) === String(cardId)
              );
              if (match?.uid) cardUid = String(match.uid);
            }
          } catch (e: any) {
            console.warn(
              "card_uid_hash: unable to list cards from LNbits (non-fatal)",
              e?.message || String(e)
            );
          }
        }
        if (cardUid) {
          const card_uid_hash = sha256Hex(`${cardUid}${userSalt}`);
          const { error: hashErr } = await supabase
            .from("lnbits_boltcards")
            .update({ card_uid_hash })
            .eq("user_duid", user_duid)
            .eq("card_id", String(cardId));
          if (hashErr) {
            console.warn(
              "card_uid_hash update failed (non-fatal):",
              hashErr.message
            );
          }
        } else {
          console.warn(
            "card_uid_hash: LNbits did not return UID; hash not persisted (non-fatal)"
          );
        }
      }
    } catch (e: any) {
      console.warn(
        "card_uid_hash: computation/persist error (non-fatal):",
        e?.message || String(e)
      );
    }

    // Return QR or programming payload if provided (depends on LNbits version)
    const authQr = created?.auth_link || created?.lnurlw || created?.qr || null;

    // Persist encrypted auth link if provided (optional)
    if (authQr) {
      try {
        const { error: updErr } = await supabase
          .from("lnbits_boltcards")
          .update({ auth_link_enc: encryptB64(authQr) })
          .eq("user_duid", user_duid)
          .eq("card_id", String(cardId));
        if (updErr) {
          console.warn("Failed to store auth link:", updErr.message);
        }
      } catch (e: any) {
        console.warn("auth_link_enc update failed:", e?.message || String(e));
      }
    }

    return json(200, { success: true, cardId, authQr });
  } catch (e: any) {
    return json(500, { success: false, error: e?.message || "Server error" });
  }
};
