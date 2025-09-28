// netlify/functions_active/lnbits-set-boltcard-pin.ts
// Sets/updates a PIN for a user's Boltcard (Name Tag). Stores only salted PBKDF2-SHA-512 hash,
// encrypted at rest via AES-256-GCM with server-side secret. Constant-time validation helper included.

import type { Handler } from "@netlify/functions";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";
import { getRequestClient } from "../functions/supabase.js";
import { allowRequest } from "../functions/utils/rate-limiter.js";

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

function keyFromSecret(): Buffer {
  const s = process.env.LNBITS_KEY_ENC_SECRET || process.env.DUID_SERVER_SECRET;
  if (!s) throw new Error("Encryption secret not configured");
  return createHash("sha256").update(s).digest();
}

function encryptB64(plain: Buffer): string {
  const key = keyFromSecret();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decryptB64(encB64: string): Buffer {
  const raw = Buffer.from(encB64, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const key = keyFromSecret();
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]);
}

function parseJson(body: string | null): any {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function isSixDigitPin(pin: string): boolean {
  return /^[0-9]{6}$/.test(pin);
}

function hashPin(pin: string, salt: Buffer): Buffer {
  // PBKDF2-SHA-512, 100k iterations, 64-byte key
  return pbkdf2Sync(pin, salt, 100_000, 64, "sha512");
}

export const handler: Handler = async (event) => {
  try {
    if (!FEATURE_ENABLED)
      return json(503, {
        success: false,
        error: "LNbits integration disabled",
      });

    const ip = clientIpFrom(event);
    if (!allowRequest(ip, 6, 60_000))
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

    const body = parseJson(event.body);
    const cardId: string | undefined =
      typeof body?.cardId === "string" ? body.cardId : undefined;
    const pin: string | undefined =
      typeof body?.pin === "string" ? body.pin : undefined;
    if (!cardId || !pin || !isSixDigitPin(pin))
      return json(400, { success: false, error: "Invalid parameters" });

    // Ensure card belongs to user
    const { data: row, error: rowErr } = await supabase
      .from("lnbits_boltcards")
      .select("id, card_id")
      .eq("user_duid", user_duid)
      .eq("card_id", cardId)
      .single();
    if (rowErr || !row)
      return json(404, { success: false, error: "Card not found" });

    // Create fresh salt and compute hash
    const salt = randomBytes(16);
    const hash = hashPin(pin, salt);

    // Encrypt hash for at-rest storage
    const pin_hash_enc = encryptB64(hash);

    const saltB64 = salt.toString("base64");
    const { error: upErr } = await supabase
      .from("lnbits_boltcards")
      .update({
        pin_salt: saltB64,
        pin_hash_enc,
        pin_last_set_at: new Date().toISOString(),
      })
      .eq("user_duid", user_duid)
      .eq("card_id", cardId);

    if (upErr)
      return json(500, { success: false, error: upErr.message || "DB error" });

    return json(200, { success: true });
  } catch (e: any) {
    return json(500, { success: false, error: e?.message || "Server error" });
  }
};
