// netlify/functions_active/lnbits-create-lnaddress.ts
// Creates LNURLp link and Lightning Address based on user's NIP-05 identifier

import type { Handler } from "@netlify/functions";
import { createDecipheriv, createHash } from "node:crypto";
import { resolve4, resolve6 } from "node:dns/promises";

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
function parseJson(body: string | null): any {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function keyFromSecret(): Buffer {
  const secret =
    process.env.LNBITS_KEY_ENC_SECRET || process.env.DUID_SERVER_SECRET;
  if (!secret) throw new Error("Encryption secret not configured");
  return createHash("sha256").update(secret).digest();
}
function decryptServerSecret(encB64: string): string {
  const raw = Buffer.from(encB64, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const key = keyFromSecret();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
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
function validateLightningAddressFormat(addr: string): {
  valid: boolean;
  local?: string;
  domain?: string;
  error?: string;
} {
  try {
    const s = (addr || "").trim().toLowerCase();
    const m = s.match(/^([a-z0-9._-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i);
    if (!m) return { valid: false, error: "Invalid Lightning Address format" };
    return { valid: true, local: m[1], domain: m[2] };
  } catch {
    return { valid: false, error: "Invalid Lightning Address" };
  }
}

function ipToLong(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((n) => parseInt(n, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3];
}

function isPrivateIPv4(ip: string): boolean {
  if (ip === "127.0.0.1") return true;
  const long = ipToLong(ip);
  if (long == null) return false;
  // 10.0.0.0/8
  if ((long & 0xff000000) === 0x0a000000) return true;
  // 172.16.0.0/12
  if ((long & 0xfff00000) === 0xac100000) return true;
  // 192.168.0.0/16
  if ((long & 0xffff0000) === 0xc0a80000) return true;
  // 169.254.0.0/16 (link-local)
  if ((long & 0xffff0000) === 0xa9fe0000) return true;
  // 127.0.0.0/8 (loopback)
  if ((long & 0xff000000) === 0x7f000000) return true;
  // 0.0.0.0/8 (unspecified)
  if ((long & 0xff000000) === 0x00000000) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::1" || s === "::") return true; // loopback or unspecified
  // Unique local addresses fc00::/7 => fc.. or fd..
  if (s.startsWith("fc") || s.startsWith("fd")) return true;
  // Link-local fe80::/10 => fe8., fe9., fea., feb.
  if (
    s.startsWith("fe8") ||
    s.startsWith("fe9") ||
    s.startsWith("fea") ||
    s.startsWith("feb")
  )
    return true;
  return false;
}

async function resolvesOnlyToPublicIps(domain: string): Promise<boolean> {
  if (!domain || domain.toLowerCase() === "localhost") return false;
  try {
    const [a4, a6] = await Promise.allSettled([
      resolve4(domain),
      resolve6(domain),
    ]);
    let hasPublic = false;
    if (a4.status === "fulfilled") {
      for (const ip of a4.value) {
        if (typeof ip === "string") {
          if (isPrivateIPv4(ip)) return false;
          hasPublic = true;
        }
      }
    }
    if (a6.status === "fulfilled") {
      for (const ip of a6.value) {
        if (typeof ip === "string") {
          if (isPrivateIPv6(ip)) return false;
          hasPublic = true;
        }
      }
    }
    return hasPublic;
  } catch {
    return false;
  }
}

async function verifyLightningAddressReachable(
  local: string,
  domain: string,
  timeoutMs = 5000
): Promise<boolean> {
  if (!(await resolvesOnlyToPublicIps(domain))) return false;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(
      local
    )}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as any;
    return !!json && (json.tag === "payRequest" || json.tag === "payrequest");
  } catch {
    return false;
  } finally {
    clearTimeout(to);
  }
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

    const { data: me, error: meErr } = await supabase.auth.getUser();
    if (meErr || !me?.user?.id)
      return json(401, { success: false, error: "Unauthorized" });
    const user_duid: string = me.user.id;

    // Load user's LNbits wallet row
    const { data: row, error: selErr } = await supabase
      .from("lnbits_wallets")
      .select("id, wallet_id, wallet_admin_key_enc, lnbits_user_id")
      .eq("user_duid", user_duid)
      .single();
    if (selErr || !row)
      return json(400, { success: false, error: "No wallet found" });

    const adminKey = row.wallet_admin_key_enc
      ? decryptServerSecret(row.wallet_admin_key_enc)
      : undefined;
    if (!adminKey)
      return json(500, {
        success: false,
        error: "Wallet admin key unavailable",
      });
    // Optional: External Lightning Address path (preserve user sovereignty)
    const body = parseJson(event.body || null);
    const externalAddr: string | undefined = (
      body?.externalLightningAddress ||
      body?.lightningAddress ||
      ""
    ).trim();
    if (externalAddr) {
      const v = validateLightningAddressFormat(externalAddr);
      if (!v.valid || !v.local || !v.domain) {
        return json(400, {
          success: false,
          error: v.error || "Invalid Lightning Address",
        });
      }
      const reachable = await verifyLightningAddressReachable(
        v.local,
        v.domain
      ).catch(() => false);
      if (!reachable) {
        return json(400, {
          success: false,
          error: "Lightning Address unreachable or invalid LNURL-pay",
        });
      }
      const { error: updExtErr } = await supabase
        .from("lnbits_wallets")
        .update({ lightning_address: `${v.local}@${v.domain}` })
        .eq("id", row.id);
      if (updExtErr)
        return json(500, {
          success: false,
          error: updExtErr.message || "DB error",
        });
      return json(200, {
        success: true,
        address: `${v.local}@${v.domain}`,
        mode: "external",
      });
    }

    // Determine Lightning Address components
    // Prefer NIP-05 identifier from user_identities if available
    let nip05: string | undefined;
    {
      const { data: ident } = await supabase
        .from("user_identities")
        .select("nip05, username, lightning_address")
        .eq("id", user_duid)
        .maybeSingle();
      if (ident?.nip05) nip05 = ident.nip05;
    }
    if (!nip05)
      return json(400, {
        success: false,
        error: "NIP-05 required for Lightning Address",
      });

    // Extract local part and domain from NIP-05
    const [local, domain] = nip05.split("@");
    if (!local || !domain)
      return json(400, { success: false, error: "Invalid NIP-05 format" });

    // 1) Create LNURLp link via LNURLp extension
    const lnurlp = await lnbitsFetch("/lnurlp/api/v1/links", adminKey, {
      method: "POST",
      body: JSON.stringify({
        description: `Satnam tips for ${nip05}`,
        min: 1,
        max: 1000000,
        currency: "sat",
      }),
    });
    const linkId: string =
      lnurlp?.id || lnurlp?.link || lnurlp?.uniqueid || lnurlp?.data?.id;
    if (!linkId)
      return json(500, {
        success: false,
        error: "Failed to create LNURLp link",
      });

    // 2) Create Lightning Address mapping
    await lnbitsFetch("/lnurlp/api/v1/addresses", adminKey, {
      method: "POST",
      body: JSON.stringify({ username: local, domain, link: linkId }),
    });

    const address = `${local}@${domain}`;

    // Store lnurlp link id and lightning address in DB
    const { error: updErr } = await supabase
      .from("lnbits_wallets")
      .update({
        lnurlp_link_id: linkId,
        lnurlp_username: local,
        lnurlp_domain: domain,
        lightning_address: address,
      })
      .eq("id", row.id);
    if (updErr)
      return json(500, { success: false, error: updErr.message || "DB error" });

    return json(200, { success: true, address, linkId });
  } catch (e: any) {
    return json(500, { success: false, error: e?.message || "Server error" });
  }
};
