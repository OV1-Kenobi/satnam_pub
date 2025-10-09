// netlify/functions_active/nfc-verify-contact.ts
// Purpose: Verify an NFC-tapped contact and add to validated_contacts
// Auth: JWT via Authorization header (Bearer token)
// RLS: Uses request-scoped Supabase client
// Notes: We DO NOT trust plaintext NIP-05 on card; we bind card UID to the claimed
// identity by recomputing the owner's card_uid_hash using the owner's user_salt.
// Optional SUN/SDM verification: when provided, we require a cryptographic check
// using NTAG424 SDM keys (if available via LNbits). Failing SUN when requested
// will cause verification to be rejected.

import type { Handler } from "@netlify/functions";
import * as crypto from "node:crypto";
import { getRequestClient } from "../functions/supabase.js";
import { allowRequest } from "../functions/utils/rate-limiter.js";

function json(statusCode: number, body: unknown) {
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

function sha256Hex(input: string | Buffer): string {
  const h = crypto.createHash("sha256");
  h.update(input);
  return h.digest("hex");
}

function parseBody(body: string | null): any {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a.toLowerCase(), "hex");
    const bb = Buffer.from(b.toLowerCase(), "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

// SUN/SDM verification via LNbits Boltcards API
// Endpoint: POST {LNBITS_BASE_URL}/boltcards/api/v1/scan/{card_id}
// Headers: X-Api-Key: {LNBITS_ADMIN_KEY}
// Body: { p: piccDataHex, c: cmacHex }
async function verifySunWithProvider(
  cardId: string,
  piccDataHex: string,
  cmacHex: string
): Promise<{ supported: boolean; ok: boolean; error?: string }> {
  const base = (process.env.LNBITS_BASE_URL || "https://my.satnam.pub").replace(
    /\/$/,
    ""
  );
  const apiKey = process.env.LNBITS_ADMIN_KEY;
  if (!apiKey) {
    return { supported: false, ok: false, error: "Missing LNBITS_ADMIN_KEY" };
  }
  const url = `${base}/boltcards/api/v1/scan/${encodeURIComponent(cardId)}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ p: piccDataHex, c: cmacHex }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return {
        supported: true,
        ok: false,
        error: `LNbits scan failed: ${text || resp.status}`,
      };
    }
    const data: any = await resp.json();
    const ok = data?.valid === true;
    return { supported: true, ok };
  } catch (e: any) {
    return {
      supported: true,
      ok: false,
      error: e?.message || "LNbits verification error",
    };
  }
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST")
      return json(405, { success: false, error: "Method not allowed" });

    const ip = clientIpFrom(event);
    if (!allowRequest(ip, 12, 60_000))
      return json(429, { success: false, error: "Too many attempts" });

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
    const owner_duid: string = me.user.id; // tapper's user id

    const body = parseBody(event.body);
    const cardUid: string | undefined =
      typeof body?.cardUid === "string" ? body.cardUid : undefined;
    const nip05: string | undefined =
      typeof body?.nip05 === "string" ? body.nip05 : undefined;
    const sunParams =
      body?.sunParams && typeof body.sunParams === "object"
        ? {
            piccData:
              typeof body.sunParams.piccData === "string"
                ? body.sunParams.piccData
                : undefined,
            cmac:
              typeof body.sunParams.cmac === "string"
                ? body.sunParams.cmac
                : undefined,
          }
        : undefined;

    if (!cardUid)
      return json(400, { success: false, error: "Missing cardUid" });
    if (!nip05) return json(400, { success: false, error: "Missing nip05" });

    // Find the contact (card owner) by NIP-05 and obtain their user_salt
    const { data: ident, error: identErr } = await (supabase as any)
      .from("user_identities")
      .select("id, user_salt")
      .eq("nip05_identifier", nip05)
      .single();
    if (identErr || !ident?.id || !ident?.user_salt) {
      return json(400, { success: false, error: "Contact identity not found" });
    }
    const contact_duid: string = String(ident.id);

    // Compute owner's card_uid_hash = SHA-256(cardUid || contact_user_salt)
    const card_uid_hash = sha256Hex(
      Buffer.concat([
        Buffer.from(cardUid),
        Buffer.from(String(ident.user_salt)),
      ])
    );

    // Verify that the card belongs to the claimed contact by checking lnbits_boltcards
    const { data: card, error: cardErr } = await (supabase as any)
      .from("lnbits_boltcards")
      .select("id, card_id, wallet_id")
      .eq("user_duid", contact_duid)
      .eq("card_uid_hash", card_uid_hash)
      .single();
    if (cardErr || !card?.id) {
      return json(400, {
        success: false,
        error: "Card not registered to provided NIP-05",
      });
    }

    // If SUN parameters provided, require SUN verification to pass
    let sunVerified = false;
    if (sunParams?.piccData && sunParams?.cmac) {
      const res = await verifySunWithProvider(
        String(card.card_id || card.id),
        sunParams.piccData,
        sunParams.cmac
      );
      if (!res.supported) {
        return json(400, {
          success: false,
          error: "SUN verification not available for this card",
        });
      }
      if (!res.ok) {
        return json(400, { success: false, error: "SUN verification failed" });
      }
      sunVerified = true;
    }

    // Insert validated contact (RLS enforces owner_duid = auth.uid())
    const { error: insErr } = await (supabase as any)
      .from("validated_contacts")
      .insert({
        owner_duid,
        contact_duid,
        contact_nip05: nip05,
        card_uid_hash,
      });
    if (insErr) {
      // If unique violation, treat as success (already added)
      const msg = String(insErr.message || "").toLowerCase();
      if (!msg.includes("duplicate") && !msg.includes("unique")) {
        return json(500, {
          success: false,
          error: "Failed to save validated contact",
        });
      }
    }

    return json(200, {
      success: true,
      contactDuid: contact_duid,
      contactNip05: nip05,
      sunVerified,
    });
  } catch (e: any) {
    return json(500, { success: false, error: e?.message || "Server error" });
  }
};
