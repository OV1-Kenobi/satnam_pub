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
  createHmac,
  pbkdf2Sync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  supabase as adminSupabase,
  getRequestClient,
  supabaseAdmin,
} from "./supabase.js";
import {
  getInvoiceKeyWithSafety,
  logDecryptAudit,
  newRequestId,
} from "./utils/secure-decrypt-logger.js";

import { SecureSessionManager } from "./security/session-manager.js";
import { resolvePlatformLightningDomainServer } from "./utils/domain.server.js";

// Security utilities (Phase 2 hardening)
import {
  RATE_LIMITS,
  checkRateLimit,
  createRateLimitIdentifier,
  getClientIP,
} from "../functions_active/utils/enhanced-rate-limiter.ts";
import {
  createAuthErrorResponse,
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "../functions_active/utils/error-handler.ts";
import {
  errorResponse,
  preflightResponse,
} from "../functions_active/utils/security-headers.ts";

const json = (statusCode: number, body: any) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// LNURL raw JSON response helper (no { success, data } envelope)
const lnurlJson = (statusCode: number, lnurlData: any) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(lnurlData),
});

const requireEnv = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
};

const FEATURE_ENABLED =
  (process.env.VITE_LNBITS_INTEGRATION_ENABLED || "").toLowerCase() === "true";
const WEBHOOK_SECRET = process.env.LNBITS_WEBHOOK_SECRET || "";

async function notifyRecipient(npub: string, message: string) {
  try {
    const { central_event_publishing_service: CEPS } = await import(
      "../../lib/central_event_publishing_service.js"
    );
    await CEPS.sendServerDM(npub, message);
  } catch (err) {
    console.warn("CEPS notify failed:", err);
  }
}

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
  // Public-scoped operations (no auth required; rate-limited; GET allowed where noted)
  lnurlpWellKnown: { scope: "public" as const },
  lnurlpDirect: { scope: "public" as const },
  lnurlpPlatform: { scope: "public" as const },
  // Wallet-scoped operations
  payInvoice: { scope: "wallet" as const },
  getPaymentHistory: { scope: "wallet" as const },
  getWalletUrl: { scope: "wallet" as const },
  provisionWalletHybrid: { scope: "wallet" as const },
  // NWC provider management (LNbits NWC extension)
  nwcPermissions: { scope: "wallet" as const },
  nwcListConnections: { scope: "wallet" as const },
  nwcGetConnection: { scope: "wallet" as const },
  nwcCreateConnection: { scope: "wallet" as const },
  nwcRevokeConnection: { scope: "wallet" as const },
  nwcUpdateConnection: { scope: "wallet" as const },
  // Future actions kept for parity with existing endpoints; implement incrementally
  createLightningAddress: { scope: "wallet" as const },
  createBoltcard: { scope: "wallet" as const },
  getBoltcardLnurl: { scope: "wallet" as const },
  setBoltcardPin: { scope: "wallet" as const },
  validateBoltcardPin: { scope: "wallet" as const },
  syncBoltcards: { scope: "wallet" as const },
  // Webhooks from external LNbits server
  webhookPayment: { scope: "public" as const },
  // Tapsigner multi-purpose device authorization
  tapsignerAuthorizeAction: { scope: "wallet" as const },
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
  const requestId = generateRequestId();
  const clientIP = getClientIP(event.headers || {});
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 LNbits proxy handler started:", {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  try {
    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitAllowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.WALLET_OPERATIONS
    );

    if (!rateLimitAllowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "lnbits-proxy",
        method: event.httpMethod,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    if (!FEATURE_ENABLED) {
      return errorResponse(
        503,
        "LNbits integration disabled",
        requestId,
        requestOrigin
      );
    }

    // Support GET for public LNURL actions and POST for others
    const isGet = event.httpMethod === "GET";
    const qs = event.queryStringParameters || {};
    const rawPath = String(event.path || "");

    let action: ActionName | undefined = undefined;
    if (isGet) {
      action = qs.action as ActionName as any;
      if (!action) {
        if (rawPath.includes("/.well-known/lnurlp/"))
          action = "lnurlpWellKnown" as ActionName;
        else if (rawPath.includes("/lnurlp/direct/"))
          action = "lnurlpDirect" as ActionName;
        else if (rawPath.includes("/lnurlp/platform/"))
          action = "lnurlpPlatform" as ActionName;
      }
    } else {
      const body = event.body ? JSON.parse(event.body) : {};
      action = body?.action as ActionName;
      if (!action) action = qs.action as ActionName;
    }

    // Method gate
    if (!isGet && event.httpMethod !== "POST") {
      return errorResponse(405, "Method Not Allowed", requestId, requestOrigin);
    }

    if (!action || !(action in ACTIONS)) {
      return createValidationErrorResponse(
        "Invalid or missing action",
        requestId,
        requestOrigin
      );
    }

    const scope = ACTIONS[action].scope;

    if (isGet && scope !== "public") {
      return errorResponse(405, "Method Not Allowed", requestId, requestOrigin);
    }

    // Build payload
    let payload: any = {};
    if (isGet) {
      const usernameFromPath = rawPath.split("/").pop() || "";
      const username =
        typeof qs.username === "string" ? qs.username : usernameFromPath;
      const amount = qs.amount != null ? Number(qs.amount) : undefined;
      const comment = typeof qs.comment === "string" ? qs.comment : undefined;
      payload = { username, amount, comment };
    } else {
      const body = event.body ? JSON.parse(event.body) : {};
      payload = body?.payload || {};
    }

    // Handle public-scoped actions (no auth required)
    if (scope === "public") {
      switch (action) {
        case "lnurlpWellKnown": {
          const usernameRaw =
            typeof payload?.username === "string" ? payload.username : "";
          const username = usernameRaw.trim().toLowerCase();
          if (!username || !/^[a-z0-9._-]+$/i.test(username)) {
            return createValidationErrorResponse(
              "Invalid username",
              requestId,
              requestOrigin
            );
          }
          try {
            const { data, error } = await adminSupabase.rpc(
              "public.get_ln_proxy_data",
              { p_username: username }
            );
            if (error)
              return json(500, {
                success: false,
                error: error.message || "RPC error",
              });
            if (!data)
              return errorResponse(
                404,
                "User not found",
                requestId,
                requestOrigin
              );

            const domain = resolvePlatformLightningDomainServer();
            const origin =
              process.env.PRODUCTION_ORIGIN || "https://www.satnam.pub";
            const baseUrl = (origin || "").replace(/\/$/, "");
            const directCb = `${baseUrl}/api/lnurlp/direct/${encodeURIComponent(
              username
            )}`;
            const platformCb = `${baseUrl}/api/lnurlp/platform/${encodeURIComponent(
              username
            )}`;
            const callback = data?.external_ln_address ? directCb : platformCb; // Option B
            const description = `Satnam tips for ${username}@${domain}`;
            const metadata = JSON.stringify([["text/plain", description]]);

            const lnurl = {
              status: "OK",
              tag: "payRequest",
              minSendable: 1000,
              maxSendable: 10_000_000_000,
              commentAllowed: 255,
              metadata,
              callback,
            };
            if (isGet) return lnurlJson(200, lnurl);
            return json(200, { success: true, data: lnurl });
          } catch (e: any) {
            return json(500, {
              success: false,
              error: e?.message || "Unexpected error",
            });
          }
        }

        case "lnurlpDirect": {
          const usernameRaw =
            typeof payload?.username === "string" ? payload.username : "";
          const username = usernameRaw.trim().toLowerCase();
          const amount = Number(payload?.amount);
          const comment =
            typeof payload?.comment === "string" ? payload.comment : undefined;
          if (!username || !/^[a-z0-9._-]+$/i.test(username))
            return createValidationErrorResponse(
              "Invalid username",
              requestId,
              requestOrigin
            );
          if (!Number.isFinite(amount) || amount <= 0)
            return createValidationErrorResponse(
              "Invalid amount",
              requestId,
              requestOrigin
            );

          // Load external LN address for this username
          const { data, error } = await adminSupabase.rpc(
            "public.get_ln_proxy_data",
            { p_username: username }
          );
          if (error)
            return json(500, {
              success: false,
              error: error.message || "RPC error",
            });
          if (!data || !data.external_ln_address)
            return json(404, {
              success: false,
              error: "No external address configured",
            });

          const addr = String(data.external_ln_address);
          const [name, domain] = addr.split("@");
          if (!name || !domain)
            return json(500, {
              success: false,
              error: "Malformed external address",
            });

          try {
            // Fetch well-known from external provider
            const wellKnownUrl = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(
              name
            )}`;
            const metaRes = await fetch(wellKnownUrl, { method: "GET" });
            if (!metaRes.ok)
              return json(502, {
                success: false,
                error: `Provider meta ${metaRes.status}`,
              });
            const meta = await metaRes.json();
            const callback = meta?.callback || meta?.paymentLink || meta?.url;
            if (!callback || typeof callback !== "string")
              return json(502, {
                success: false,
                error: "Provider missing callback",
              });

            const u = new URL(callback);
            u.searchParams.set("amount", String(Math.floor(amount)));
            if (comment) u.searchParams.set("comment", String(comment));
            const invRes = await fetch(u.toString(), { method: "GET" });
            if (!invRes.ok)
              return json(502, {
                success: false,

                error: `Provider invoice ${invRes.status}`,
              });
            const inv = await invRes.json();
            return json(200, { success: true, data: inv });
          } catch (e: any) {
            return json(500, {
              success: false,
              error: e?.message || "Upstream error",
            });
          }
        }

        case "lnurlpPlatform": {
          const usernameRaw =
            typeof payload?.username === "string" ? payload.username : "";
          const username = usernameRaw.trim().toLowerCase();
          const amountMsats = Number(payload?.amount);
          const comment =
            typeof payload?.comment === "string" ? payload.comment : undefined;
          if (!username || !/^[a-z0-9._-]+$/i.test(username))
            return createValidationErrorResponse(
              "Invalid username",
              requestId,
              requestOrigin
            );
          if (!Number.isFinite(amountMsats) || amountMsats <= 0)
            return createValidationErrorResponse(
              "Invalid amount",
              requestId,
              requestOrigin
            );
          // Reject fractional millisat amounts to remain LNURL-compliant
          if (!Number.isInteger(amountMsats) || amountMsats % 1000 !== 0)
            return createValidationErrorResponse(
              "Amount must be a multiple of 1000 millisats",
              requestId,
              requestOrigin
            );

          const { data, error } = await adminSupabase.rpc(
            "public.get_ln_proxy_data",
            { p_username: username }
          );
          if (error)
            return json(500, {
              success: false,
              error: error.message || "RPC error",
            });
          if (!data)
            return errorResponse(
              404,
              "User not found",
              requestId,
              requestOrigin
            );

          const walletId: string = String(
            data.lnbits_wallet_id || data.wallet_id || ""
          );
          const userId: string | undefined = (data.user_id ||
            data.user_duid) as string | undefined;
          if (!walletId)
            return json(404, {
              success: false,
              error: "Wallet not configured",
            });

          const auditRequestId = newRequestId();
          // Log start of custody event (audit + rpc)
          try {
            await logDecryptAudit({
              request_id: auditRequestId,
              user_id: userId,
              wallet_id: walletId,
              caller: "lnurlpPlatform",
              operation: "lnurlp_invoice",
              source_ip: clientIP,
            });
          } catch {}
          try {
            await adminSupabase.rpc("public.log_custody_event", {
              p_username: username,
              p_amount_msats: Math.floor(amountMsats),
              p_status: "pending",
              p_wallet_id: walletId,
            });
          } catch {}

          // Decrypt invoice key with memory safety
          let release: (() => Promise<void>) | undefined;
          let invoiceKey: string = "";
          try {
            const res = await getInvoiceKeyWithSafety(
              walletId,
              "lnurlpPlatform",
              requestId,
              userId,
              clientIP
            );
            invoiceKey = res.key;
            release = res.release;

            const amountSats = Math.floor(amountMsats / 1000);
            const body = { out: false, amount: amountSats, memo: comment };
            const inv = await lnbitsFetch("/api/v1/payments", invoiceKey, {
              method: "POST",
              body: JSON.stringify(body),
            });
            const pr =
              inv?.payment_request ||
              inv?.bolt11 ||
              inv?.data?.payment_request ||
              inv?.data?.bolt11;
            if (!pr)
              return json(502, {
                success: false,
                error: "Failed to create invoice",
              });

            const out = { pr, routes: [] as any[] };
            if (isGet) return lnurlJson(200, out);
            return json(200, { success: true, data: out });
          } catch (e: any) {
            return json(500, {
              success: false,
              error: e?.message || "Invoice error",
            });
          } finally {
            // memory cleanup
            invoiceKey = undefined as unknown as string;
            if (release) await release();
          }
        }
        case "webhookPayment": {
          if (event.httpMethod !== "POST")
            return errorResponse(
              405,
              "Method not allowed",
              requestId,
              requestOrigin
            );

          const raw = event.body || "";
          let payload: any;
          try {
            payload = JSON.parse(raw);
          } catch {
            return createValidationErrorResponse(
              "Invalid JSON",
              requestId,
              requestOrigin
            );
          }

          // Optional HMAC verification (depends on LNbits config)
          if (WEBHOOK_SECRET) {
            const sig =
              event.headers?.["x-lnbits-signature"] ||
              event.headers?.["X-LNBits-Signature"] ||
              "";
            const mac = createHmac("sha256", WEBHOOK_SECRET)
              .update(raw)
              .digest("hex");
            if (!sig || sig !== mac)
              return createAuthErrorResponse(
                "Invalid signature",
                requestId,
                requestOrigin
              );
          }

          const paymentHash =
            payload?.payment_hash || payload?.payment_hashid || payload?.hash;
          const amountMsat = Number(
            payload?.amount || payload?.amount_msat || 0
          );
          const linkId =
            payload?.lnurlp ||
            payload?.link ||
            payload?.link_id ||
            payload?.payment?.lnurlp;

          if (!paymentHash || !amountMsat || !linkId)
            return createValidationErrorResponse(
              "Missing fields",
              requestId,
              requestOrigin
            );

          // Map linkId -> recipient user
          const { data: row, error: walletError } = await adminSupabase
            .from("lnbits_wallets")
            .select("user_duid, lightning_address")
            .eq("lnurlp_link_id", String(linkId))
            .maybeSingle();
          if (walletError) {
            console.error("lnbits wallet lookup failed", walletError);
            return errorResponse(
              500,
              "Wallet lookup failed",
              requestId,
              requestOrigin
            );
          }

          if (row?.user_duid) {
            const { data: ident, error: identityError } = await adminSupabase
              .from("user_identities")
              .select("npub")
              .eq("id", row.user_duid)
              .maybeSingle();
            if (identityError) {
              console.error("identity lookup failed", identityError);
              return json(500, {
                success: false,
                error: "Identity lookup failed",
              });
            }
            const npub: string | undefined = (ident as any)?.npub || undefined;
            const amountSat = Math.round(amountMsat / 1000);
            const la = (row as any).lightning_address || "(address unknown)";

            if (npub) {
              await notifyRecipient(
                npub,
                `\u2705 Payment received: ${amountSat} sats to ${la}. Hash: ${paymentHash}`
              );
            }

            const memo = (payload?.comment || payload?.memo || "").toString();
            const { error: upsertError } = await adminSupabase
              .from("lnbits_payment_events")
              .upsert(
                {
                  user_duid: row.user_duid,
                  payment_hash: String(paymentHash),
                  amount_sats: amountSat,
                  lightning_address: (row as any).lightning_address || null,
                  memo,
                  lnurlp_link_id: String(linkId),
                },
                { onConflict: "payment_hash" }
              );
            if (upsertError) {
              console.error("payment event upsert failed", upsertError);
              return json(500, {
                success: false,
                error: "Failed to record payment event",
              });
            }
          }

          return json(200, { success: true });
        }
      }
    }

    // Authn (required for wallet/admin-scoped ops)
    const ctx = scope !== "public" ? await getUserContext(event) : null;

    if (scope === "admin") {
      if (!ctx?.user) {
        return createAuthErrorResponse(
          "Unauthorized",
          requestId,
          requestOrigin
        );
      }
      const { data: identity, error: identityErr } = await ctx.supa
        .from("user_identities")
        .select("role")
        .eq("id", ctx.user.id)
        .single();
      const role = identity?.role as string | undefined;
      if (identityErr || !role || !["guardian", "admin"].includes(role)) {
        return errorResponse(403, "Forbidden", requestId, requestOrigin);
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
      return createValidationErrorResponse(
        "Unsupported admin action",
        requestId,
        requestOrigin
      );
    }

    // wallet-scoped operations require logged-in user
    if (!ctx?.user)
      return createAuthErrorResponse("Unauthorized", requestId, requestOrigin);

    const { supa, user } = ctx;
    let apiKey: string | undefined;
    if (action !== "setBoltcardPin" && action !== "validateBoltcardPin") {
      const resolved = await resolvePerUserWalletKey(supa, user.id);
      apiKey = resolved.apiKey;
    }

    switch (action) {
      case "tapsignerAuthorizeAction": {
        // Multi-purpose Tapsigner action authorization
        // Routes to tapsigner-unified /authorize_action endpoint
        const cardId = String(payload?.cardId || "").trim();
        const actionType = String(payload?.actionType || "").trim();
        const contextData = payload?.contextData || {};

        if (!cardId || !actionType) {
          return createValidationErrorResponse(
            "Missing cardId or actionType",
            requestId,
            requestOrigin
          );
        }

        if (!["payment", "event", "login"].includes(actionType)) {
          return createValidationErrorResponse(
            "Invalid actionType: must be payment, event, or login",
            requestId,
            requestOrigin
          );
        }

        try {
          // Call tapsigner-unified endpoint with PIN parameter
          const tapsignerUrl = `${
            process.env.NETLIFY_SITE_URL || "http://localhost:8888"
          }/.netlify/functions/tapsigner-unified/authorize_action`;
          const authHeader = event.headers?.authorization || "";
          const pin = String(payload?.pin || "").trim(); // 6-digit PIN from frontend

          const response = await fetch(tapsignerUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader,
            },
            body: JSON.stringify({
              cardId,
              actionType,
              contextData,
              pin: pin || undefined, // Include PIN if provided
            }),
          });

          const result = await response.json();

          if (!response.ok) {
            return json(response.status, result);
          }

          return json(200, result);
        } catch (err: any) {
          logError(err, {
            requestId,
            endpoint: "lnbits-proxy",
            action: "tapsignerAuthorizeAction",
          });
          return json(500, {
            success: false,
            error: "Tapsigner authorization failed",
          });
        }
      }

      case "payInvoice": {
        const invoice = String(payload?.invoice || "").trim();
        if (!invoice)
          return createValidationErrorResponse(
            "Missing invoice",
            requestId,
            requestOrigin
          );
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
          return createValidationErrorResponse(
            "No wallet found",
            requestId,
            requestOrigin
          );
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
          return createValidationErrorResponse(
            "No wallet found",
            requestId,
            requestOrigin
          );
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
            return createValidationErrorResponse(
              "No wallet found",
              requestId,
              requestOrigin
            );
          }
        }
        const base = LNBITS_BASE.replace(/\/$/, "");
        const url = `${base}/wallet?wal=${encodeURIComponent(walletId)}`;
        return json(200, {
          success: true,
          data: { walletUrl: url, walletId, baseUrl: base },
        });
      }
      case "provisionWalletHybrid": {
        if (!ADMIN_KEY)
          return json(500, {
            success: false,
            error: "Server not configured for admin operations",
          });
        const external_ln_address =
          typeof payload?.external_ln_address === "string"
            ? String(payload.external_ln_address).trim()
            : undefined;
        const wallet_name =
          typeof payload?.wallet_name === "string" && payload.wallet_name.trim()
            ? String(payload.wallet_name).trim()
            : "Satnam Wallet";

        // Load nip05_username
        const { data: ident, error: identErr } = await supa
          .from("user_identities")
          .select("nip05_username")
          .eq("id", user.id)
          .single();
        if (identErr || !ident?.nip05_username) {
          return json(400, {
            success: false,
            error: "User missing nip05_username; complete profile first",
          });
        }
        const nip05_username = String(ident.nip05_username).toLowerCase();

        // Create LNbits user + wallet via User Manager
        const lnUser = await lnbitsFetch(
          "/usermanager/api/v1/users",
          ADMIN_KEY as string,
          {
            method: "POST",
            body: JSON.stringify({
              username: `satnam_${nip05_username}`,
              password: randomUUID(),
            }),
          }
        );
        const userId = lnUser?.id || lnUser?.data?.id;
        const lnWallet = await lnbitsFetch(
          "/usermanager/api/v1/wallets",
          ADMIN_KEY as string,
          {
            method: "POST",
            body: JSON.stringify({ user_id: userId, wallet_name }),
          }
        );

        const wallet_id: string = String(
          lnWallet?.id ||
            lnWallet?.wallet_id ||
            lnWallet?.data?.id ||
            lnWallet?.data?.wallet_id
        );
        const admin_key: string | undefined =
          lnWallet?.adminkey ||
          lnWallet?.admin_key ||
          lnWallet?.data?.adminkey ||
          lnWallet?.data?.admin_key;
        const invoice_key: string | undefined =
          lnWallet?.inkey ||
          lnWallet?.invoice_key ||
          lnWallet?.data?.inkey ||
          lnWallet?.data?.invoice_key;
        if (!wallet_id || !admin_key || !invoice_key) {
          return json(502, {
            success: false,
            error: "LNbits did not return wallet keys",
          });
        }

        // Encrypt keys server-side using DB function private.enc
        if (!supabaseAdmin)
          return json(500, {
            success: false,
            error: "Service-role Supabase client unavailable",
          });
        const { data: encAdmin, error: encAdminErr } = await (
          supabaseAdmin as any
        ).rpc("private.enc", { p_text: String(admin_key) });
        if (encAdminErr)
          return json(500, {
            success: false,
            error: encAdminErr.message || "Encrypt admin key failed",
          });
        const { data: encInvoice, error: encInvErr } = await (
          supabaseAdmin as any
        ).rpc("private.enc", { p_text: String(invoice_key) });
        if (encInvErr)
          return json(500, {
            success: false,
            error: encInvErr.message || "Encrypt invoice key failed",
          });

        const scrubPercent = Number.isFinite(
          Number(process.env.LNBITS_DEFAULT_SCRUB_PERCENT)
        )
          ? Math.max(
              0,
              Math.min(100, Number(process.env.LNBITS_DEFAULT_SCRUB_PERCENT))
            )
          : 100;

        const row: any = {
          user_id: user.id,
          nip05_username,
          external_ln_address: external_ln_address || null,
          lnbits_wallet_id: wallet_id,
          lnbits_admin_key_enc: encAdmin as string,
          lnbits_invoice_key_enc: encInvoice as string,
          scrub_enabled: Boolean(external_ln_address) && scrubPercent > 0,
          scrub_percent: scrubPercent,
          updated_at: new Date().toISOString(),
        };

        const { data: existing } = await (supabaseAdmin as any)
          .from("user_lightning_config")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (existing) {
          const { error: updErr } = await (supabaseAdmin as any)
            .from("user_lightning_config")
            .update(row)
            .eq("user_id", user.id);
          if (updErr)
            return json(500, {
              success: false,
              error: updErr.message || "DB update failed",
            });
        } else {
          const { error: insErr } = await (supabaseAdmin as any)
            .from("user_lightning_config")
            .insert({ ...row, created_at: new Date().toISOString() });
          if (insErr)
            return json(500, {
              success: false,
              error: insErr.message || "DB insert failed",
            });
        }

        // Attempt Scrub configuration (non-fatal)
        let scrubConfigured = false;
        if (external_ln_address) {
          try {
            await lnbitsFetch("/scrub/api/v1/forward", String(admin_key), {
              method: "POST",
              body: JSON.stringify({
                wallet_id,
                percent: scrubPercent,
                address: external_ln_address,
              }),
            });
            scrubConfigured = true;
          } catch (e) {
            console.warn("Scrub config attempt failed (non-fatal)", e);
          }
        }

        const domain = resolvePlatformLightningDomainServer();
        const platform_ln_address = `${nip05_username}@${domain}`;
        return json(200, {
          success: true,
          data: {
            wallet_id,
            platform_ln_address,
            scrub_enabled:
              Boolean(external_ln_address) &&
              scrubPercent > 0 &&
              scrubConfigured,
            scrub_percent: scrubPercent,
          },
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
          return createValidationErrorResponse(
            "No wallet found",
            requestId,
            requestOrigin
          );

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
          return createValidationErrorResponse(
            "No wallet found",
            requestId,
            requestOrigin
          );

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
          return createValidationErrorResponse(
            "No wallet found",
            requestId,
            requestOrigin
          );

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

      case "nwcPermissions": {
        if (!apiKey)
          return createValidationErrorResponse(
            "No wallet found",
            requestId,
            requestOrigin
          );
        try {
          const data = await lnbitsFetch(
            `/nwcprovider/api/v1/permissions`,
            apiKey,
            { method: "GET" }
          );
          return json(200, { success: true, data });
        } catch (e: any) {
          return json(502, {
            success: false,
            error: e?.message || "LNbits error",
          });
        }
      }

      case "nwcListConnections": {
        if (!apiKey)
          return createValidationErrorResponse(
            "No wallet found",
            requestId,
            requestOrigin
          );
        const include_expired = Boolean(payload?.include_expired ?? true);
        const calculate_spent_budget = Boolean(
          payload?.calculate_spent_budget ?? true
        );
        try {
          const qs = `?include_expired=${include_expired}&calculate_spent_budget=${calculate_spent_budget}`;
          const data = await lnbitsFetch(
            `/nwcprovider/api/v1/nwc${qs}`,
            apiKey,
            { method: "GET" }
          );
          return json(200, { success: true, data });
        } catch (e: any) {
          return json(502, {
            success: false,
            error: e?.message || "LNbits error",
          });
        }
      }

      case "nwcGetConnection": {
        if (!apiKey)
          return createValidationErrorResponse(
            "No wallet found",
            requestId,
            requestOrigin
          );
        const pubkey = String(payload?.pubkey || "").trim();
        if (!pubkey)
          return createValidationErrorResponse(
            "Missing pubkey",
            requestId,
            requestOrigin
          );
        const include_expired = Boolean(payload?.include_expired ?? true);
        try {
          const data = await lnbitsFetch(
            `/nwcprovider/api/v1/nwc/${encodeURIComponent(
              pubkey
            )}?include_expired=${include_expired}`,
            apiKey,
            { method: "GET" }
          );
          return json(200, { success: true, data });
        } catch (e: any) {
          return json(502, {
            success: false,
            error: e?.message || "LNbits error",
          });
        }
      }

      case "nwcCreateConnection": {
        if (!apiKey)
          return createValidationErrorResponse(
            "No wallet found",
            requestId,
            requestOrigin
          );
        // Validate inputs
        const client_pubkey = String(payload?.client_pubkey || "").trim();
        const client_secret = String(payload?.client_secret || "").trim();
        const description = String(payload?.description || "Satnam NWC").trim();
        if (!client_pubkey || !client_secret)
          return createValidationErrorResponse(
            "Missing client pubkey/secret",
            requestId,
            requestOrigin
          );
        const permissions =
          Array.isArray(payload?.permissions) && payload.permissions.length
            ? payload.permissions.map((p: any) => String(p))
            : [
                "get_balance",
                "make_invoice",
                "pay_invoice",
                "lookup_invoice",
                "list_transactions",
              ];
        const expires_at = Number.isFinite(Number(payload?.expires_at))
          ? Number(payload.expires_at)
          : 0;
        // Budget: accept msats or sats; default 100k sats daily if offspring, else unlimited
        let budget_msats = undefined as number | undefined;
        let refresh_window = Number(payload?.refresh_window) || 86400;
        const budgetSats = Number(payload?.budget_sats);
        if (Number.isFinite(budgetSats) && budgetSats > 0)
          budget_msats = Math.round(budgetSats * 1000);
        const budgets = budget_msats
          ? [
              {
                budget_msats,
                refresh_window,
                created_at: Math.floor(Date.now() / 1000),
              },
            ]
          : [];

        // Create on LNbits provider
        try {
          await lnbitsFetch(
            `/nwcprovider/api/v1/nwc/${encodeURIComponent(client_pubkey)}`,
            apiKey,
            {
              method: "PUT",
              body: JSON.stringify({
                permissions,
                description,
                expires_at,
                budgets,
              }),
            }
          );
        } catch (e: any) {
          const msg = e?.message || "Failed to register NWC connection";
          // Common errors to surface clearly
          if (/already exists/i.test(msg))
            return errorResponse(
              409,
              "Connection already exists for pubkey",
              requestId,
              requestOrigin
            );
          return errorResponse(502, msg, requestId, requestOrigin);
        }

        // Retrieve pairing URL (full NWC URI)
        let fullUri: string;
        try {
          const pairing = await lnbitsFetch(
            `/nwcprovider/api/v1/pairing/${encodeURIComponent(client_secret)}`,
            apiKey,
            { method: "GET" }
          );
          fullUri = typeof pairing === "string" ? pairing : pairing?.uri || "";
          if (!fullUri || !/^nostr\+walletconnect:\/\//.test(fullUri))
            throw new Error("Invalid pairing response");
        } catch (e: any) {
          return json(502, {
            success: false,
            error: e?.message || "Failed to fetch pairing URL",
          });
        }

        // Parse for previews
        let providerPubkey = "";
        let relayDomain = "";
        let relay = "";
        try {
          const u = new URL(
            fullUri.replace(/^nostr\+walletconnect:\/\//, "https://")
          );
          providerPubkey = u.hostname || "";
          relay = u.searchParams.get("relay") || "";
          try {
            relayDomain = relay ? new URL(relay).hostname : "";
          } catch {
            relayDomain = relay;
          }
        } catch {}

        // Prepare storage: encrypt once server-side using per-user key (PBKDF2 -> AES-GCM)
        const authHeader = String(
          event.headers?.authorization || event.headers?.Authorization || ""
        );
        const session = await SecureSessionManager.validateSessionFromHeader(
          authHeader
        );
        if (!session?.hashedId)
          return createAuthErrorResponse(
            "Unauthorized",
            requestId,
            requestOrigin
          );

        // Set RLS context
        const reqClient = getRequestClient(
          authHeader.replace(/^Bearer\s+/i, "")
        );
        try {
          await reqClient.rpc("set_app_current_user_hash", {
            val: session.hashedId,
          });
        } catch {}

        async function encryptForUser(userHash: string, plaintext: string) {
          const enc = new TextEncoder();
          const keyMaterial = await (
            globalThis.crypto as Crypto
          ).subtle.importKey(
            "raw",
            enc.encode(userHash || "user"),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
          );
          const salt = (globalThis.crypto as Crypto).getRandomValues(
            new Uint8Array(16)
          );
          const key = await (globalThis.crypto as Crypto).subtle.deriveKey(
            { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt"]
          );
          const iv = (globalThis.crypto as Crypto).getRandomValues(
            new Uint8Array(12)
          );
          const ct = await (globalThis.crypto as Crypto).subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            enc.encode(plaintext)
          );
          const saltB64 = Buffer.from(salt).toString("base64");
          const ivB64 = Buffer.from(iv).toString("base64");
          const encB64 = Buffer.from(new Uint8Array(ct)).toString("base64");
          return { encB64, saltB64, ivB64 };
        }

        const { encB64, saltB64, ivB64 } = await encryptForUser(
          session.hashedId,
          fullUri
        );

        // Generate connection_id compatible with existing flows
        const seed = `nwc_${providerPubkey || client_pubkey}_${Date.now()}`;
        const seedBuf = await (globalThis.crypto as Crypto).subtle.digest(
          "SHA-256",
          new TextEncoder().encode(seed)
        );
        const idHex = Array.from(new Uint8Array(seedBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .slice(0, 16);
        const connectionId = `nwc_${idHex}`;

        // Persist via RPC to apply sovereignty limits
        const walletName = String(payload?.wallet_name || "Satnam Wallet");
        const provider = "lnbits-nwc";
        const pubkeyPreview = providerPubkey
          ? `${providerPubkey.slice(0, 8)}...${providerPubkey.slice(-8)}`
          : `${client_pubkey.slice(0, 8)}...${client_pubkey.slice(-8)}`;
        const userRoleRow = await supa
          .from("user_identities")
          .select("role")
          .eq("id", user.id)
          .single();
        const userRole = (userRoleRow?.data?.role as string) || "private";

        const { error: rpcErr } = await reqClient.rpc(
          "create_nwc_wallet_connection",
          {
            p_user_hash: session.hashedId,
            p_connection_id: connectionId,
            p_encrypted_connection_string: encB64,
            p_connection_encryption_salt: saltB64,
            p_connection_encryption_iv: ivB64,
            p_wallet_name: walletName,
            p_wallet_provider: provider,
            p_pubkey_preview: pubkeyPreview,
            p_relay_domain:
              relayDomain || resolvePlatformLightningDomainServer(),
            p_user_role: userRole,
          }
        );
        if (rpcErr)
          return json(500, {
            success: false,
            error: "Failed to save connection",
          });

        // Return masked preview + one-time URI for immediate display
        const secretTail = (() => {
          try {
            const u = new URL(
              fullUri.replace(/^nostr\+walletconnect:\/\//, "https://")
            );
            const s = String(u.searchParams.get("secret") || "");
            return s ? s.slice(-6) : "";
          } catch {
            return "";
          }
        })();
        return json(201, {
          success: true,
          data: {
            connection_id: connectionId,
            wallet_name: walletName,
            wallet_provider: provider,
            pubkey_preview: pubkeyPreview,
            relay_domain: relayDomain,
            one_time_uri: fullUri,
            secret_tail: secretTail,
          },
        });
      }

      case "nwcRevokeConnection": {
        if (!apiKey)
          return createValidationErrorResponse(
            "No wallet found",
            requestId,
            requestOrigin
          );
        const pubkey = String(payload?.pubkey || "").trim();
        const connectionId = String(payload?.connection_id || "").trim();
        if (!pubkey)
          return createValidationErrorResponse(
            "Missing pubkey",
            requestId,
            requestOrigin
          );
        try {
          await lnbitsFetch(
            `/nwcprovider/api/v1/nwc/${encodeURIComponent(pubkey)}`,
            apiKey,
            { method: "DELETE" }
          );
        } catch (e: any) {
          return json(502, {
            success: false,
            error: e?.message || "LNbits error",
          });
        }
        // Soft-delete local record if provided
        if (connectionId) {
          const authHeader = String(
            event.headers?.authorization || event.headers?.Authorization || ""
          );
          const session = await SecureSessionManager.validateSessionFromHeader(
            authHeader
          );
          if (session?.hashedId) {
            const reqClient = getRequestClient(
              authHeader.replace(/^Bearer\s+/i, "")
            );
            try {
              await reqClient.rpc("set_app_current_user_hash", {
                val: session.hashedId,
              });
            } catch {}
            await reqClient
              .from("nwc_wallet_connections")
              .update({
                is_active: false,
                connection_status: "revoked",
                last_used_at: new Date().toISOString(),
              })
              .eq("user_hash", session.hashedId)
              .eq("connection_id", connectionId);
          }
        }
        return json(200, { success: true });
      }

      case "nwcUpdateConnection": {
        if (!apiKey)
          return createValidationErrorResponse(
            "No wallet found",
            requestId,
            requestOrigin
          );
        // Implement as delete + create; client must provide new client_pubkey/secret
        const oldPubkey = String(payload?.old_pubkey || "").trim();
        const connectionId = String(payload?.connection_id || "").trim();
        if (!oldPubkey)
          return createValidationErrorResponse(
            "Missing old pubkey",
            requestId,
            requestOrigin
          );
        try {
          await lnbitsFetch(
            `/nwcprovider/api/v1/nwc/${encodeURIComponent(oldPubkey)}`,
            apiKey,
            { method: "DELETE" }
          );
        } catch (e: any) {
          return json(502, {
            success: false,
            error: e?.message || "Failed to revoke old connection",
          });
        }
        return json(200, {
          success: true,
          note: "Old connection revoked. Call nwcCreateConnection to create a new one.",
          connection_id: connectionId || undefined,
        });
      }

      case "setBoltcardPin": {
        // Rate limit: 6 requests per 60 seconds for PIN setting
        const pinSetLimitKey = `${user.id}:boltcard_pin_set`;
        const pinSetAllowed = await checkRateLimit(pinSetLimitKey, {
          limit: 6,
          windowMs: 60 * 1000,
        });
        if (!pinSetAllowed)
          return createRateLimitErrorResponse(requestId, requestOrigin);
        const cardId =
          typeof payload?.cardId === "string" ? payload.cardId : undefined;
        const pin = typeof payload?.pin === "string" ? payload.pin : undefined;
        if (!cardId || !pin || !isSixDigitPin(pin))
          return createValidationErrorResponse(
            "Invalid parameters",
            requestId,
            requestOrigin
          );

        const { data: row, error: rowErr } = await supa
          .from("lnbits_boltcards")
          .select("id, card_id")
          .eq("user_duid", user.id)
          .eq("card_id", cardId)
          .single();
        if (rowErr || !row)
          return errorResponse(404, "Card not found", requestId, requestOrigin);

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
        // Rate limit: 8 requests per 60 seconds for PIN validation
        const pinValidateLimitKey = `${user.id}:boltcard_pin_validate`;
        const pinValidateAllowed = await checkRateLimit(pinValidateLimitKey, {
          limit: 8,
          windowMs: 60 * 1000,
        });
        if (!pinValidateAllowed)
          return createRateLimitErrorResponse(requestId, requestOrigin);
        const cardId =
          typeof payload?.cardId === "string" ? payload.cardId : undefined;
        const pin = typeof payload?.pin === "string" ? payload.pin : undefined;

        if (!cardId || !pin || !isSixDigitPin(pin))
          return createValidationErrorResponse(
            "Invalid parameters",
            requestId,
            requestOrigin
          );

        const { data: row, error: rowErr } = await supa
          .from("lnbits_boltcards")
          .select("pin_salt, pin_hash_enc")
          .eq("user_duid", user.id)
          .eq("card_id", cardId)
          .single();
        if (rowErr || !row)
          return errorResponse(404, "Card not found", requestId, requestOrigin);
        if (!row.pin_salt || !row.pin_hash_enc)
          return createValidationErrorResponse(
            "PIN not set",
            requestId,
            requestOrigin
          );

        const storedHash = await decryptB64Buf(String(row.pin_hash_enc));
        const saltRaw = row.pin_salt as string;
        const salt = Buffer.from(saltRaw, "base64");
        const candidate = hashPin(pin, salt);
        if (storedHash.length !== candidate.length) {
          const padded = Buffer.alloc(storedHash.length);
          try {
            timingSafeEqual(storedHash, padded);
          } catch {}
          return createAuthErrorResponse(
            "Invalid PIN",
            requestId,
            requestOrigin
          );
        }
        const ok = timingSafeEqual(storedHash, candidate);
        if (!ok)
          return createAuthErrorResponse(
            "Invalid PIN",
            requestId,
            requestOrigin
          );
        return json(200, { success: true });
      }

      case "syncBoltcards": {
        // User-scoped sync of cards from LNbits into our DB for this wallet
        const { apiKey, walletId } = await resolvePerUserWalletKey(
          supa,
          user.id
        );
        if (!walletId)
          return createValidationErrorResponse(
            "No wallet found",
            requestId,
            requestOrigin
          );

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

    return createValidationErrorResponse(
      "Unsupported action",
      requestId,
      requestOrigin
    );
  } catch (error: any) {
    logError(error, {
      requestId,
      endpoint: "lnbits-proxy",
      method: event.httpMethod,
    });
    return errorResponse(
      500,
      "LNbits service temporarily unavailable",
      requestId,
      requestOrigin
    );
  }
};
