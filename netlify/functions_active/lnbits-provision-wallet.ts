// netlify/functions_active/lnbits-provision-wallet.ts
// Creates LNbits user and wallet for authenticated Satnam users
// ESM-only, static imports, process.env access only

import type { Handler } from "@netlify/functions";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { getRequestClient } from "../functions/supabase.js";
import { allowRequest } from "../functions/utils/rate-limiter.js";

const BASE_URL = process.env.LNBITS_BASE_URL || "";
const BOOTSTRAP_KEY = process.env.LNBITS_BOOTSTRAP_ADMIN_KEY || "";
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

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env ${key}`);
  return v;
}

// AES-256-GCM small helper using a server-side secret (reuse DUID_SERVER_SECRET if no specific key)
function getKey(): Buffer {
  const secret =
    process.env.LNBITS_KEY_ENC_SECRET || process.env.DUID_SERVER_SECRET;
  if (!secret) throw new Error("Encryption secret not configured");
  // derive 32-byte key by SHA-256 of secret
  return createHash("sha256").update(secret).digest();
}

function encryptServerSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function parseJson(body: string | null): any {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
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

    // Basic rate limiting
    const ip = clientIpFrom(event);
    if (!allowRequest(ip, 10, 60_000))
      return json(429, { success: false, error: "Too many attempts" });

    if (event.httpMethod !== "POST")
      return json(405, { success: false, error: "Method not allowed" });

    if (!BOOTSTRAP_KEY)
      return json(500, { success: false, error: "Server not configured" });

    const token = (
      event.headers?.authorization ||
      event.headers?.Authorization ||
      ""
    ).replace(/^Bearer\s+/i, "");
    if (!token)
      return json(401, { success: false, error: "Missing Authorization" });

    const supabase = getRequestClient(token);

    // Identify authenticated user via RLS token
    const { data: me, error: meErr } = await supabase.auth.getUser();
    if (meErr || !me?.user?.id)
      return json(401, { success: false, error: "Unauthorized" });
    const user_duid: string = me.user.id; // per policy: RLS matches auth.uid()

    // Upsert or return existing wallet record
    const { data: existingRows, error: existingErr } = await supabase
      .from("lnbits_wallets")
      .select("id,wallet_id,lnurlp_username,lightning_address")
      .eq("user_duid", user_duid)
      .limit(1);

    if (existingErr) {
      return json(500, {
        success: false,
        error: existingErr.message || "DB error",
      });
    }

    if (existingRows && existingRows.length) {
      return json(200, {
        success: true,
        walletId: existingRows[0].wallet_id,
        lightningAddress: existingRows[0].lightning_address || null,
      });
    }

    const body = parseJson(event.body);
    const walletName: string =
      typeof body?.walletName === "string" && body.walletName.trim()
        ? body.walletName.trim()
        : "Satnam";

    // 1) Create LNbits user via User Manager
    const user = await lnbitsFetch("/usermanager/api/v1/users", BOOTSTRAP_KEY, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const lnbitsUserId =
      user?.id ||
      user?.user_id ||
      user?.userid ||
      user?.userid ||
      user?.data?.id;
    if (!lnbitsUserId) throw new Error("Failed to create LNbits user (no id)");

    // 2) Create wallet for that user
    const wallet = await lnbitsFetch(
      "/usermanager/api/v1/wallets",
      BOOTSTRAP_KEY,
      {
        method: "POST",
        body: JSON.stringify({
          user_id: lnbitsUserId,
          wallet_name: walletName,
        }),
      }
    );

    const walletId: string =
      wallet?.id || wallet?.wallet_id || wallet?.data?.id;
    if (!walletId) throw new Error("Failed to create LNbits wallet (no id)");

    // Some deployments return keys; store encrypted if present
    const adminKey: string | undefined =
      wallet?.adminkey || wallet?.admin_key || wallet?.adminKey;
    const invoiceKey: string | undefined =
      wallet?.inkey || wallet?.invoice_key || wallet?.invoiceKey;

    const row: any = {
      user_duid,
      lnbits_user_id: String(lnbitsUserId),
      wallet_id: String(walletId),
      created_at: new Date().toISOString(),
    };
    if (adminKey) row.wallet_admin_key_enc = encryptServerSecret(adminKey);
    if (invoiceKey)
      row.wallet_invoice_key_enc = encryptServerSecret(invoiceKey);

    const { error: insErr } = await supabase.from("lnbits_wallets").insert(row);
    if (insErr)
      return json(500, { success: false, error: insErr.message || "DB error" });

    return json(200, { success: true, walletId });
  } catch (e: any) {
    return json(500, { success: false, error: e?.message || "Server error" });
  }
};
