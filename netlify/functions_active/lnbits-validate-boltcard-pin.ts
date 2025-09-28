// netlify/functions_active/lnbits-validate-boltcard-pin.ts
// Validates a PIN against the user's stored Boltcard entry. Constant-time compare.

import type { Handler } from "@netlify/functions";
import {
  createDecipheriv,
  createHash,
  pbkdf2Sync,
  timingSafeEqual,
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
    if (!allowRequest(ip, 8, 60_000))
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

    const { data: row, error: rowErr } = await supabase
      .from("lnbits_boltcards")
      .select("pin_salt, pin_hash_enc")
      .eq("user_duid", user_duid)
      .eq("card_id", cardId)
      .single();
    if (rowErr || !row)
      return json(404, { success: false, error: "Card not found" });
    if (!row.pin_salt || !row.pin_hash_enc)
      return json(400, { success: false, error: "PIN not set" });

    const storedHash = decryptB64(row.pin_hash_enc as string);
    const saltRaw = row.pin_salt;
    const salt =
      typeof saltRaw === "string"
        ? Buffer.from(saltRaw, "base64")
        : Buffer.isBuffer(saltRaw)
        ? saltRaw
        : Buffer.from(saltRaw as ArrayBuffer);
    const candidate = hashPin(pin, salt);
    if (storedHash.length !== candidate.length) {
      // Always run timingSafeEqual with same-sized buffers to keep constant-time properties
      const padded = Buffer.alloc(storedHash.length);
      try {
        timingSafeEqual(storedHash, padded);
      } catch {}
      return json(401, { success: false, error: "Invalid PIN" });
    }

    const ok = timingSafeEqual(storedHash, candidate);
    if (!ok) return json(401, { success: false, error: "Invalid PIN" });

    return json(200, { success: true });
  } catch (e: any) {
    return json(500, { success: false, error: e?.message || "Server error" });
  }
};
