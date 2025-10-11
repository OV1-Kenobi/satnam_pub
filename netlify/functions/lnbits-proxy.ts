/*
  LNbits Generic Proxy (ESM, TypeScript)
  - Coexists with existing specific LNbits functions in netlify/functions_active/*.ts
  - Preserves response shape: { success: true, data } | { success: false, error }
  - Uses process.env only; never import browser env
  - Strict action allow-list; minimal initial coverage while legacy functions remain
*/

export const config = { path: "/lnbits-proxy" };

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { supabase as adminSupabase, getRequestClient } from "./supabase.js";
import { allowRequest } from "./utils/rate-limiter.js";

const json = (statusCode: number, body: any) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const requireEnv = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
};

const FEATURE_ENABLED =
  (process.env.VITE_LNBITS_INTEGRATION_ENABLED || "").toLowerCase() === "true";

const LNBITS_BASE = requireEnv("LNBITS_BASE_URL");
const ADMIN_KEY =
  process.env.LNBITS_ADMIN_KEY || process.env.LNBITS_BOOTSTRAP_ADMIN_KEY;

let ENC_KEY_CACHE: Buffer | null = null;
async function getEncKeyBuf(): Promise<Buffer> {
  if (ENC_KEY_CACHE) return ENC_KEY_CACHE;
  const { data, error } = await adminSupabase
    .from("vault.decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", "lnbits_key_enc_secret")
    .single();
  if (error || !data?.decrypted_secret) {
    throw new Error("LNBITS_KEY_ENC_SECRET not found in Supabase Vault");
  }
  ENC_KEY_CACHE = createHash("sha256")
    .update(String(data.decrypted_secret))
    .digest();
  return ENC_KEY_CACHE;
}

async function decryptB64(encB64: string): Promise<string> {
  const raw = Buffer.from(encB64, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const key = await getEncKeyBuf();
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  const out = Buffer.concat([d.update(data), d.final()]);
  return out.toString("utf8");
}

async function encryptB64(plain: string): Promise<string> {
  const key = await getEncKeyBuf();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

async function decryptB64Buf(encB64: string): Promise<Buffer> {
  const raw = Buffer.from(encB64, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const key = await getEncKeyBuf();
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]);
}

async function encryptB64Buf(plain: Buffer): Promise<string> {
  const key = await getEncKeyBuf();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function isSixDigitPin(pin: string): boolean {
  return /^[0-9]{6}$/.test(pin);
}

function hashPin(pin: string, salt: Buffer): Buffer {
  return pbkdf2Sync(pin, salt, 100_000, 64, "sha512");
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

async function getUserSalt(supa: any, userId: string): Promise<string | null> {
  try {
    const { data, error } = await supa
      .from("user_identities")
      .select("user_salt")
      .eq("id", userId)
      .single();
    if (error) return null;
    return data?.user_salt || null;
  } catch {
    return null;
  }
}

function parseInvoiceAmountSats(invoice: string): number | null {
  if (!invoice || typeof invoice !== "string") return null;
  const inv = invoice.trim().toLowerCase();
  if (!inv.startsWith("ln")) return null;
  const sep = inv.indexOf("1");
  if (sep <= 2) return null;
  const hrp = inv.slice(0, sep);
  const afterLn = hrp.slice(2);
  let i = 0;
  while (
    i < afterLn.length &&
    afterLn.charCodeAt(i) >= 97 &&
    afterLn.charCodeAt(i) <= 122
  )
    i++;
  if (i >= afterLn.length) return null;
  let j = i;
  while (
    j < afterLn.length &&
    afterLn.charCodeAt(j) >= 48 &&
    afterLn.charCodeAt(j) <= 57
  )
    j++;
  if (j === i) return null;
  const amountStr = afterLn.slice(i, j);
  const unit = afterLn.slice(j);
  const amount = Number.parseInt(amountStr, 10);
  if (!Number.isFinite(amount)) return null;
  let multiplierBTC = 1;
  const u = unit || "";
  if (u === "m") multiplierBTC = 1 / 1_000;
  else if (u === "u") multiplierBTC = 1 / 1_000_000;
  else if (u === "n") multiplierBTC = 1 / 1_000_000_000;
  else if (u === "p") multiplierBTC = 1 / 1_000_000_000_000;
  else if (u.length > 0) return null;
  const sats = Math.round(amount * multiplierBTC * 100_000_000);
  return sats > 0 ? sats : null;
}

const ACTIONS = {
  // Admin-scoped operation: create LNbits user/wallet
  provisionWallet: { scope: "admin" as const },
  // Wallet-scoped operations
  payInvoice: { scope: "wallet" as const },
  getPaymentHistory: { scope: "wallet" as const },
  getWalletUrl: { scope: "wallet" as const },
  // Future actions kept for parity with existing endpoints; implement incrementally
  createLightningAddress: { scope: "wallet" as const },
  createBoltcard: { scope: "wallet" as const },
  getBoltcardLnurl: { scope: "wallet" as const },
  setBoltcardPin: { scope: "wallet" as const },
  validateBoltcardPin: { scope: "wallet" as const },
  syncBoltcards: { scope: "wallet" as const },
} as const;

type ActionName = keyof typeof ACTIONS;

async function lnbitsFetch(path: string, apiKey: string, init?: RequestInit) {
  const res = await fetch(`${LNBITS_BASE.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let jsonBody: any;
  try {
    jsonBody = text ? JSON.parse(text) : {};
  } catch {
    jsonBody = { raw: text };
  }
  if (!res.ok) {
    const msg =
      jsonBody?.detail || jsonBody?.message || `LNbits error ${res.status}`;
    throw new Error(msg);
  }
  return jsonBody;
}

async function getUserContext(event: any) {
  const auth = event.headers.authorization || event.headers.Authorization;
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/i, "");
  const supa = getRequestClient(token);
  const { data } = await supa.auth.getUser();
  const user = data?.user;
  if (!user) return null;
  return { supa, user } as const;
}

async function resolvePerUserWalletKey(
  supa: any,
  userId: string
): Promise<{ apiKey: string; walletId?: string }> {
  // Minimal example: fetch first wallet row for user and decrypt key as needed.
  // Adjust table/column names to your schema if they differ.
  const { data, error } = await supa
    .from("lnbits_wallets")
    .select("wallet_admin_key_enc, wallet_id")
    .eq("user_duid", userId)
    .limit(1)
    .single();
  if (error) throw new Error("Wallet not found for user");
  if (!data?.wallet_admin_key_enc)
    throw new Error("Wallet admin key unavailable");
  const apiKey = await decryptB64(data.wallet_admin_key_enc as string);
  return { apiKey, walletId: data.wallet_id as string | undefined };
}

export const handler = async (event: any) => {
  try {
    // Basic method and rate limit
    if (event.httpMethod !== "POST") {
      return json(405, { success: false, error: "Method Not Allowed" });
    }
    const xfwd =
      event.headers?.["x-forwarded-for"] ||
      event.headers?.["X-Forwarded-For"] ||
      "";
    const ip =
      (Array.isArray(xfwd) ? xfwd[0] : xfwd).split(",")[0]?.trim() ||
      event.headers?.["x-real-ip"] ||
      "unknown";
    if (!allowRequest(ip, 10, 60_000))
      return json(429, { success: false, error: "Too Many Requests" });

    if (!FEATURE_ENABLED) {
      return json(503, {
        success: false,
        error: "LNbits integration disabled",
      });
    }

    // Authn (required for wallet-scoped ops)
    const ctx = await getUserContext(event);

    const body = event.body ? JSON.parse(event.body) : {};
    const action: ActionName = body?.action;
    const payload = body?.payload || {};

    if (!action || !(action in ACTIONS)) {
      return json(400, { success: false, error: "Invalid or missing action" });
    }

    const scope = ACTIONS[action].scope;

    if (scope === "admin") {
      if (!ctx?.user) {
        return json(401, { success: false, error: "Unauthorized" });
      }
      const { data: identity, error: identityErr } = await ctx.supa
        .from("user_identities")
        .select("role")
        .eq("id", ctx.user.id)
        .single();
      const role = identity?.role as string | undefined;
      if (identityErr || !role || !["guardian", "admin"].includes(role)) {
        return json(403, { success: false, error: "Forbidden" });
      }
      if (!ADMIN_KEY)
        return json(500, {
          success: false,
          error: "Server not configured for admin operations",
        });
      if (action === "provisionWallet") {
        // Admin flow using LNbits UserManager: requires username, password, wallet_name
        const username = String(payload?.username || "").trim();
        const password = String(payload?.password || "").trim();
        const wallet_name = String(
          payload?.wallet_name || payload?.name || "Satnam Wallet"
        ).trim();
        if (!username || !password) {
          return json(400, {
            success: false,
            error: "username and password are required",
          });
        }
        const user = await lnbitsFetch("/usermanager/api/v1/users", ADMIN_KEY, {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
        const wallet = await lnbitsFetch(
          "/usermanager/api/v1/wallets",
          ADMIN_KEY,
          {
            method: "POST",
            body: JSON.stringify({ user_id: user?.id, wallet_name }),
          }
        );
        return json(200, { success: true, data: { user, wallet } });
      }
      return json(400, { success: false, error: "Unsupported admin action" });
    }

    // wallet-scoped operations require logged-in user
    if (!ctx?.user) return json(401, { success: false, error: "Unauthorized" });

    const { supa, user } = ctx;
    let apiKey: string | undefined;
    if (action !== "setBoltcardPin" && action !== "validateBoltcardPin") {
      const resolved = await resolvePerUserWalletKey(supa, user.id);
      apiKey = resolved.apiKey;
    }

    switch (action) {
      case "payInvoice": {
        const invoice = String(payload?.invoice || "").trim();
        if (!invoice)
          return json(400, { success: false, error: "Missing invoice" });
        // Enforce Master Context limits (offspring)
        const amountSats = parseInvoiceAmountSats(invoice);
        if (amountSats === null)
          return json(400, {
            success: false,
            error: "Invoice must specify an amount",
          });
        const { data: ident, error: identErr } = await supa
          .from("user_identities")
          .select("role")
          .eq("id", user.id)
          .single();
        if (identErr || !ident)
          return json(500, {
            success: false,
            error: "Failed to load user role",
          });
        const role = (ident.role as string) || "private";
        if (role === "offspring") {
          if (amountSats > 50_000)
            return json(403, {
              success: false,
              error: "Daily limit exceeded for offspring (50,000 sats)",
            });
          if (amountSats > 25_000)
            return json(403, {
              success: false,
              error: "Guardian approval required above 25,000 sats",
            });
        }
        const bodyPayload: any = {
          out: true,
          bolt11: invoice,
          memo: payload?.memo,
        };
        if (payload?.maxFeeSats != null)
          bodyPayload.max_fee = Number(payload.maxFeeSats);
        if (!apiKey)
          return json(400, { success: false, error: "No wallet found" });
        const data = await lnbitsFetch("/api/v1/payments", apiKey, {
          method: "POST",
          body: JSON.stringify(bodyPayload),
        });
        return json(200, { success: true, data });
      }
      case "getPaymentHistory": {
        const limit = Number(payload?.limit ?? 50);
        const offset = Number(payload?.offset ?? 0);
        if (!apiKey)
          return json(400, { success: false, error: "No wallet found" });
        const data = await lnbitsFetch(
          `/api/v1/payments?limit=${limit}&offset=${offset}`,
          apiKey
        );
        return json(200, { success: true, data });
      }
      case "getWalletUrl": {
        let walletId = String(payload?.walletId || "");
        if (!walletId) {
          const { data: walletRow } = await supa
            .from("lnbits_wallets")
            .select("wallet_id")
            .eq("user_duid", user.id)
            .single();
          if (walletRow?.wallet_id) {
            walletId = String(walletRow.wallet_id);
          } else {
            return json(400, { success: false, error: "No wallet found" });
          }
        }
        const base = LNBITS_BASE.replace(/\/$/, "");
        const url = `${base}/wallet?wal=${encodeURIComponent(walletId)}`;
        return json(200, {
          success: true,
          data: { walletUrl: url, walletId, baseUrl: base },
        });
      }
      case "createLightningAddress": {
        // Create Lightning Address via LNbits LNURLp extension using per-user wallet admin key
        const username = String(payload?.username || "")
          .trim()
          .toLowerCase();
        if (
          !username ||
          username.includes("@") ||
          !/^[a-z0-9._-]+$/i.test(username)
        )
          return json(400, {
            success: false,
            error: "Invalid Lightning Address format",
          });

        // Resolve per-user wallet admin key and wallet id
        const { apiKey, walletId } = await resolvePerUserWalletKey(
          supa,
          user.id
        );
        if (!walletId)
          return json(400, { success: false, error: "No wallet found" });

        const domain = process.env.LNBITS_LNURLP_DOMAIN || "satnam.pub";
        const description =
          typeof payload?.description === "string" && payload.description.trim()
            ? String(payload.description).trim()
            : `Satnam tips for ${username}@${domain}`;
        const min = Number.isFinite(Number(payload?.min))
          ? Math.max(1, Number(payload.min))
          : 1000;
        const max = Number.isFinite(Number(payload?.max))
          ? Number(payload.max)
          : 1000000;
        const comment_chars = Number.isFinite(Number(payload?.comment_chars))
          ? Number(payload.comment_chars)
          : 255;

        const reqBody = {
          wallet_id: walletId,
          description,
          min,
          max,
          currency: "sat",
          comment_chars,
          username,
        };

        const created = await lnbitsFetch("/lnurlp/api/v1/links", apiKey, {
          method: "POST",
          body: JSON.stringify(reqBody),
        });

        const lightning_address = `${username}@${domain}`;
        const resp = {
          id: created?.id ?? created?.data?.id,
          lnurl: created?.lnurl ?? created?.data?.lnurl,
          payment_url: created?.payment_url ?? created?.data?.payment_url,
          username,
          lightning_address,
        };
        return json(200, { success: true, data: resp });
      }

      case "getBoltcardLnurl": {
        // Return existing Boltcard LNURL auth link; lazily create a default card if none exists
        // 1) Check existing encrypted auth link
        const { data: existing, error: exErr } = await supa
          .from("lnbits_boltcards")
          .select("card_id, auth_link_enc, card_uid_hash, created_at")
          .eq("user_duid", user.id)
          .not("auth_link_enc", "is", null)
          .order("created_at", { ascending: false })
          .limit(1);
        if (exErr)
          return json(500, {
            success: false,
            error: exErr.message || "DB error",
          });
        if (existing && existing.length && existing[0].auth_link_enc) {
          const row = existing[0] as any;
          try {
            const lnurl = await decryptB64(row.auth_link_enc as string);
            // Opportunistic backfill of card_uid_hash if missing
            if (!row.card_uid_hash) {
              try {
                const { apiKey } = await resolvePerUserWalletKey(supa, user.id);
                const cards = await lnbitsFetch(
                  "/boltcards/api/v1/cards",
                  apiKey,
                  {
                    method: "GET",
                  }
                );
                if (Array.isArray(cards)) {
                  const match = cards.find(
                    (c: any) =>
                      String(c?.id || c?.uid || c?.card_id) ===
                      String(row.card_id)
                  );
                  if (match?.uid) {
                    const salt = await getUserSalt(supa, user.id);
                    if (salt) {
                      const card_uid_hash = sha256Hex(
                        `${String(match.uid)}${salt}`
                      );
                      await supa
                        .from("lnbits_boltcards")
                        .update({ card_uid_hash })
                        .eq("user_duid", user.id)
                        .eq("card_id", String(row.card_id));
                    }
                  }
                }
              } catch (e: any) {
                console.warn(
                  "card_uid_hash backfill (non-fatal)",
                  e?.message || String(e)
                );
              }
            }
            return json(200, { success: true, lnurl });
          } catch (e: any) {
            return json(500, {
              success: false,
              error: e?.message || "Decrypt failed",
            });
          }
        }

        // 2) Lazy create default "Name Tag" card
        const { apiKey, walletId } = await resolvePerUserWalletKey(
          supa,
          user.id
        );
        if (!walletId)
          return json(400, { success: false, error: "No wallet found" });

        // Acquire idempotency lock row
        const nowIso = new Date().toISOString();
        const lockRow: any = {
          user_duid: user.id,
          wallet_id: String(walletId),
          card_id: "PENDING",
          label: "Name Tag",
          spend_limit_sats: 20000,
          created_at: nowIso,
        };
        let lockAcquired = false;
        try {
          const { error: lockErr } = await supa
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
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
          for (let i = 0; i < 2; i++) {
            await sleep(300);
            const { data: again } = await supa
              .from("lnbits_boltcards")
              .select("auth_link_enc")
              .eq("user_duid", user.id)
              .eq("label", "Name Tag")
              .not("auth_link_enc", "is", null)
              .order("created_at", { ascending: false })
              .limit(1);
            if (again && again.length && again[0].auth_link_enc) {
              try {
                return json(200, {
                  success: true,
                  lnurl: await decryptB64(again[0].auth_link_enc),
                });
              } catch {}
            }
          }
          return json(202, {
            success: false,
            error: "Boltcard is being prepared. Please try again.",
          });
        }

        // Create boltcard via LNbits
        let created: any;
        try {
          created = await lnbitsFetch("/boltcards/api/v1/cards", apiKey, {
            method: "POST",
            body: JSON.stringify({ label: "Name Tag", daily_limit: 20000 }),
          });
        } catch (e: any) {
          await supa
            .from("lnbits_boltcards")
            .delete()
            .eq("user_duid", user.id)
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
          await supa
            .from("lnbits_boltcards")
            .delete()
            .eq("user_duid", user.id)
            .eq("label", "Name Tag")
            .eq("card_id", "PENDING");
          return json(500, {
            success: false,
            error: "Failed to create boltcard",
          });
        }
        const authQr =
          created?.auth_link || created?.lnurlw || created?.qr || null;
        if (!authQr) {
          await supa
            .from("lnbits_boltcards")
            .delete()
            .eq("user_duid", user.id)
            .eq("label", "Name Tag")
            .eq("card_id", "PENDING");
          return json(502, {
            success: false,
            error: "LNbits did not return an auth link",
          });
        }

        const { error: updErr } = await supa
          .from("lnbits_boltcards")
          .update({
            card_id: String(cardId),
            updated_at: new Date().toISOString(),
            auth_link_enc: await encryptB64(String(authQr)),
          })
          .eq("user_duid", user.id)
          .eq("label", "Name Tag")
          .eq("card_id", "PENDING");
        if (updErr)
          return json(500, {
            success: false,
            error: updErr.message || "DB error (update)",
          });

        // Opportunistically compute and persist card_uid_hash
        try {
          const salt = await getUserSalt(supa, user.id);
          if (salt) {
            let cardUid: string | null =
              created?.uid || created?.card_uid || null;
            if (!cardUid) {
              try {
                const cards = await lnbitsFetch(
                  "/boltcards/api/v1/cards",
                  apiKey,
                  { method: "GET" }
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
                  "card_uid_hash list cards (non-fatal)",
                  e?.message || String(e)
                );
              }
            }
            if (cardUid) {
              const card_uid_hash = sha256Hex(`${cardUid}${salt}`);
              await supa
                .from("lnbits_boltcards")
                .update({ card_uid_hash })
                .eq("user_duid", user.id)
                .eq("label", "Name Tag")
                .eq("card_id", String(cardId));
            }
          } else {
            console.warn("card_uid_hash: missing user_salt; skipping");
          }
        } catch (e: any) {
          console.warn(
            "card_uid_hash persist (non-fatal)",
            e?.message || String(e)
          );
        }

        return json(200, { success: true, lnurl: String(authQr) });
      }

      case "createBoltcard": {
        // Provision a new Boltcard with optional label and spend limit
        const { apiKey, walletId } = await resolvePerUserWalletKey(
          supa,
          user.id
        );
        if (!walletId)
          return json(400, { success: false, error: "No wallet found" });

        const label =
          typeof payload?.label === "string" && payload.label.trim()
            ? String(payload.label).trim()
            : "My Boltcard";
        const spendLimit = Number.isFinite(Number(payload?.spend_limit_sats))
          ? Math.max(1, Number(payload.spend_limit_sats))
          : 20000;

        let created: any;
        try {
          created = await lnbitsFetch("/boltcards/api/v1/cards", apiKey, {
            method: "POST",
            body: JSON.stringify({ label, daily_limit: spendLimit }),
          });
        } catch (e: any) {
          return json(500, {
            success: false,
            error: e?.message || "Failed to create boltcard",
          });
        }

        const cardId =
          created?.id || created?.uid || created?.card_id || created?.data?.id;
        if (!cardId)
          return json(500, {
            success: false,
            error: "Failed to create boltcard",
          });
        const authQr =
          created?.auth_link || created?.lnurlw || created?.qr || null;

        // Insert DB record for tracking
        const row: any = {
          user_duid: user.id,
          wallet_id: String(walletId),
          card_id: String(cardId),
          label,
          spend_limit_sats: spendLimit,
          created_at: new Date().toISOString(),
        };
        if (authQr) row.auth_link_enc = await encryptB64(String(authQr));
        const { error: insErr } = await supa
          .from("lnbits_boltcards")
          .insert(row);
        if (insErr)
          return json(500, {
            success: false,
            error: insErr.message || "DB insert error",
          });

        // Opportunistically compute and persist card_uid_hash
        try {
          const salt = await getUserSalt(supa, user.id);
          if (salt) {
            let cardUid: string | null =
              created?.uid || created?.card_uid || null;
            if (!cardUid) {
              try {
                const cards = await lnbitsFetch(
                  "/boltcards/api/v1/cards",
                  apiKey,
                  { method: "GET" }
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
                  "card_uid_hash list cards (non-fatal)",
                  e?.message || String(e)
                );
              }
            }
            if (cardUid) {
              const card_uid_hash = sha256Hex(`${cardUid}${salt}`);
              await supa
                .from("lnbits_boltcards")
                .update({ card_uid_hash })
                .eq("user_duid", user.id)
                .eq("card_id", String(cardId));
            }
          }
        } catch (e: any) {
          console.warn(
            "card_uid_hash persist (non-fatal)",
            e?.message || String(e)
          );
        }

        return json(200, {
          success: true,
          cardId: String(cardId),
          authQr: authQr ? String(authQr) : undefined,
        });
      }

      case "setBoltcardPin": {
        if (!allowRequest(ip, 6, 60_000))
          return json(429, { success: false, error: "Too many attempts" });
        const cardId =
          typeof payload?.cardId === "string" ? payload.cardId : undefined;
        const pin = typeof payload?.pin === "string" ? payload.pin : undefined;
        if (!cardId || !pin || !isSixDigitPin(pin))
          return json(400, { success: false, error: "Invalid parameters" });

        const { data: row, error: rowErr } = await supa
          .from("lnbits_boltcards")
          .select("id, card_id")
          .eq("user_duid", user.id)
          .eq("card_id", cardId)
          .single();
        if (rowErr || !row)
          return json(404, { success: false, error: "Card not found" });

        const salt = randomBytes(16);
        const hash = hashPin(pin, salt);
        const pin_hash_enc = await encryptB64Buf(hash);
        const saltB64 = salt.toString("base64");

        const { error: upErr } = await supa
          .from("lnbits_boltcards")
          .update({
            pin_salt: saltB64,
            pin_hash_enc,
            pin_last_set_at: new Date().toISOString(),
          })
          .eq("user_duid", user.id)
          .eq("card_id", cardId);
        if (upErr)
          return json(500, {
            success: false,
            error: upErr.message || "DB error",
          });
        return json(200, { success: true });
      }

      case "validateBoltcardPin": {
        if (!allowRequest(ip, 8, 60_000))
          return json(429, { success: false, error: "Too many attempts" });
        const cardId =
          typeof payload?.cardId === "string" ? payload.cardId : undefined;
        const pin = typeof payload?.pin === "string" ? payload.pin : undefined;
        if (!cardId || !pin || !isSixDigitPin(pin))
          return json(400, { success: false, error: "Invalid parameters" });

        const { data: row, error: rowErr } = await supa
          .from("lnbits_boltcards")
          .select("pin_salt, pin_hash_enc")
          .eq("user_duid", user.id)
          .eq("card_id", cardId)
          .single();
        if (rowErr || !row)
          return json(404, { success: false, error: "Card not found" });
        if (!row.pin_salt || !row.pin_hash_enc)
          return json(400, { success: false, error: "PIN not set" });

        const storedHash = await decryptB64Buf(String(row.pin_hash_enc));
        const saltRaw = row.pin_salt as string;
        const salt = Buffer.from(saltRaw, "base64");
        const candidate = hashPin(pin, salt);
        if (storedHash.length !== candidate.length) {
          const padded = Buffer.alloc(storedHash.length);
          try {
            timingSafeEqual(storedHash, padded);
          } catch {}
          return json(401, { success: false, error: "Invalid PIN" });
        }
        const ok = timingSafeEqual(storedHash, candidate);
        if (!ok) return json(401, { success: false, error: "Invalid PIN" });
        return json(200, { success: true });
      }

      case "syncBoltcards": {
        // User-scoped sync of cards from LNbits into our DB for this wallet
        const { apiKey, walletId } = await resolvePerUserWalletKey(
          supa,
          user.id
        );
        if (!walletId)
          return json(400, { success: false, error: "No wallet found" });

        const cards = await lnbitsFetch("/boltcards/api/v1/cards", apiKey, {
          method: "GET",
        });
        const list: any[] = Array.isArray(cards) ? cards : cards?.data || [];
        let synced = 0;
        const salt = await getUserSalt(supa, user.id);

        for (const c of list) {
          const cid = String(c?.id || c?.uid || c?.card_id || "");
          if (!cid) continue;
          const label = typeof c?.label === "string" ? c.label : null;
          const spend = Number.isFinite(Number(c?.daily_limit))
            ? Number(c.daily_limit)
            : undefined;
          const authQr = c?.auth_link || c?.lnurlw || c?.qr || null;
          let card_uid_hash: string | undefined;
          if (salt && c?.uid)
            card_uid_hash = sha256Hex(`${String(c.uid)}${salt}`);

          const update: any = {
            label: label ?? undefined,
            spend_limit_sats: spend ?? undefined,
            updated_at: new Date().toISOString(),
          };
          if (authQr) update.auth_link_enc = await encryptB64(String(authQr));
          if (card_uid_hash) update.card_uid_hash = card_uid_hash;

          const { data: exists } = await supa
            .from("lnbits_boltcards")
            .select("card_id")
            .eq("user_duid", user.id)
            .eq("card_id", cid)
            .maybeSingle();

          if (!exists) {
            const insertRow: any = {
              user_duid: user.id,
              wallet_id: String(walletId),
              card_id: cid,
              label: label || "",
              spend_limit_sats: spend ?? null,
              created_at: new Date().toISOString(),
              ...(update.auth_link_enc
                ? { auth_link_enc: update.auth_link_enc }
                : {}),
              ...(card_uid_hash ? { card_uid_hash } : {}),
            };
            const { error: insErr } = await supa
              .from("lnbits_boltcards")
              .insert(insertRow);
            if (!insErr) synced++;
          } else {
            const { error: updErr } = await supa
              .from("lnbits_boltcards")
              .update(update)
              .eq("user_duid", user.id)
              .eq("card_id", cid);
            if (!updErr) synced++;
          }
        }

        return json(200, {
          success: true,
          results: [{ walletId: String(walletId), hits: synced }],
        });
      }
    }

    return json(400, { success: false, error: "Unsupported action" });
  } catch (error: any) {
    console.error("[lnbits-proxy]", error);
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
