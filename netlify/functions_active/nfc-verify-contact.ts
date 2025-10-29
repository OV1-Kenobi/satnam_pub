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

// Security utilities (Phase 2 hardening)
import {
  RATE_LIMITS,
  checkRateLimitStatus,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.ts";
import {
  createRateLimitErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.ts";
import {
  errorResponse,
  getSecurityHeaders,
  preflightResponse,
} from "./utils/security-headers.ts";

import { getRequestClient } from "./supabase.js";

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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ p: piccDataHex, c: cmacHex }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
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
      error:
        e?.name === "AbortError"
          ? "LNbits verification timeout"
          : e?.message || "LNbits verification error",
    };
  }
}

export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 NFC verify contact handler started:", {
    requestId,
    method: event.httpMethod,
    timestamp: new Date().toISOString(),
  });

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  try {
    if (event.httpMethod !== "POST") {
      return errorResponse(405, "Method not allowed", requestOrigin);
    }

    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitResult = await checkRateLimitStatus(
      rateLimitKey,
      RATE_LIMITS.NFC_OPERATIONS
    );

    if (!rateLimitResult.allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "nfc-verify-contact",
        method: event.httpMethod,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    const token = (
      event.headers?.authorization ||
      event.headers?.Authorization ||
      ""
    ).replace(/^Bearer\s+/i, "");
    if (!token) {
      return errorResponse(401, "Missing Authorization", requestOrigin);
    }

    const supabase = getRequestClient(token);
    const { data: me, error: meErr } = await supabase.auth.getUser();
    if (meErr || !me?.user?.id) {
      return errorResponse(401, "Unauthorized", requestOrigin);
    }
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

    if (!cardUid) {
      return errorResponse(400, "Missing cardUid", requestOrigin);
    }
    if (!nip05) {
      return errorResponse(400, "Missing nip05", requestOrigin);
    }

    // Find the contact (card owner) by NIP-05 and obtain their user_salt
    const { data: ident, error: identErr } = await (supabase as any)
      .from("user_identities")
      .select("id, user_salt")
      .eq("nip05_identifier", nip05)
      .single();
    if (identErr || !ident?.id || !ident?.user_salt) {
      return errorResponse(400, "Contact identity not found", requestOrigin);
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
      return errorResponse(
        400,
        "Card not registered to provided NIP-05",
        requestOrigin
      );
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
        return errorResponse(
          400,
          "SUN verification not available for this card",
          requestOrigin
        );
      }
      if (!res.ok) {
        return errorResponse(400, "SUN verification failed", requestOrigin);
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
        logError(insErr, {
          requestId,
          endpoint: "nfc-verify-contact",
          operation: "insert",
        });
        return errorResponse(
          500,
          "Failed to save validated contact",
          requestOrigin
        );
      }
    }

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        contactDuid: contact_duid,
        contactNip05: nip05,
        sunVerified,
      }),
    };
  } catch (e: any) {
    logError(e, {
      requestId,
      endpoint: "nfc-verify-contact",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
