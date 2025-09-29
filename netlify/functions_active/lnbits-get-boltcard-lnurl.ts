// netlify/functions_active/lnbits-get-boltcard-lnurl.ts
// Returns the Boltcard provisioning LNURL for the authenticated user.
// If none exists, lazily creates a new Boltcard via LNbits Boltcards extension and returns its auth link.

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
    (event.headers?.["x-real-ip"] as string) ||
    "unknown"
  );
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
    if (!allowRequest(ip, 20, 60_000))
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

    // 1) Try to fetch the most recent boltcard with an auth_link_enc
    const { data: existing, error: exErr } = await supabase
      .from("lnbits_boltcards")
      .select("card_id, auth_link_enc, created_at")
      .eq("user_duid", user_duid)
      .not("auth_link_enc", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (exErr)
      return json(500, { success: false, error: exErr.message || "DB error" });

    if (existing && existing.length && existing[0].auth_link_enc) {
      try {
        const lnurl = decrypt(existing[0].auth_link_enc);
        return json(200, { success: true, lnurl });
      } catch (e: any) {
        return json(500, {
          success: false,
          error: e?.message || "Decrypt failed",
        });
      }
    }

    // 2) No existing card with auth link. Lazily create a new card and return its auth lnurl
    // Fetch wallet row and admin key
    const { data: walletRow, error: rowErr } = await supabase
      .from("lnbits_wallets")
      .select("id, wallet_id, wallet_admin_key_enc")
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

    // Idempotency guard: create a placeholder row for the default "Name Tag" card.
    // This relies on a partial unique index on (user_duid) WHERE label='Name Tag'.
    const nowIso = new Date().toISOString();
    const lockRow: any = {
      user_duid,
      wallet_id: String(walletRow.wallet_id),
      card_id: "PENDING",
      label: "Name Tag",
      spend_limit_sats: 20000,
      created_at: nowIso,
    };

    let lockAcquired = false;
    try {
      const { error: lockErr } = await supabase
        .from("lnbits_boltcards")
        .insert(lockRow);
      if (!lockErr) lockAcquired = true;
      else if (String(lockErr.code) !== "23505") {
        return json(500, {
          success: false,
          error: lockErr.message || "DB error (lock)",
        });
      }
    } catch (e: any) {
      return json(500, {
        success: false,
        error: e?.message || "DB error (lock)",
      });
    }

    if (!lockAcquired) {
      // Another request is creating the card. Briefly wait and re-check, then advise retry if still not ready.
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 2; i++) {
        await sleep(300);
        const { data: again } = await supabase
          .from("lnbits_boltcards")
          .select("auth_link_enc")
          .eq("user_duid", user_duid)
          .eq("label", "Name Tag")
          .not("auth_link_enc", "is", null)
          .order("created_at", { ascending: false })
          .limit(1);
        if (again && again.length && again[0].auth_link_enc) {
          try {
            return json(200, {
              success: true,
              lnurl: decrypt(again[0].auth_link_enc),
            });
          } catch {}
        }
      }
      return json(202, {
        success: false,
        error: "Boltcard is being prepared. Please try again.",
      });
    }

    // Create a new boltcard (default daily limit and label)
    let created: any;
    try {
      created = await lnbitsFetch("/boltcards/api/v1/cards", adminKey, {
        method: "POST",
        body: JSON.stringify({ label: "Name Tag", daily_limit: 20000 }),
      });
    } catch (e: any) {
      // Release the lock row on failure
      await supabase
        .from("lnbits_boltcards")
        .delete()
        .eq("user_duid", user_duid)
        .eq("label", "Name Tag")
        .eq("card_id", "PENDING");
      return json(500, {
        success: false,
        error: e?.message || "Failed to create boltcard",
      });
    }

    const cardId =
      created?.id || created?.uid || created?.card_id || created?.data?.id;
    if (!cardId) {
      await supabase
        .from("lnbits_boltcards")
        .delete()
        .eq("user_duid", user_duid)
        .eq("label", "Name Tag")
        .eq("card_id", "PENDING");
      return json(500, { success: false, error: "Failed to create boltcard" });
    }

    const authQr = created?.auth_link || created?.lnurlw || created?.qr || null;
    if (!authQr) {
      await supabase
        .from("lnbits_boltcards")
        .delete()
        .eq("user_duid", user_duid)
        .eq("label", "Name Tag")
        .eq("card_id", "PENDING");
      return json(502, {
        success: false,
        error: "LNbits did not return an auth link",
      });
    }

    // Update the placeholder row with real values
    const { error: updErr } = await supabase
      .from("lnbits_boltcards")
      .update({
        card_id: String(cardId),
        updated_at: new Date().toISOString(),
        auth_link_enc: encryptB64(String(authQr)),
      })
      .eq("user_duid", user_duid)
      .eq("label", "Name Tag")
      .eq("card_id", "PENDING");
    if (updErr)
      return json(500, {
        success: false,
        error: updErr.message || "DB error (update)",
      });

    return json(200, { success: true, lnurl: String(authQr) });
  } catch (e: any) {
    return json(500, { success: false, error: e?.message || "Server error" });
  }
};
