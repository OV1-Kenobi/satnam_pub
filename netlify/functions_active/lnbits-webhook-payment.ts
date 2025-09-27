// netlify/functions_active/lnbits-webhook-payment.ts
// Handles LNURLp payment webhooks from LNbits and notifies via CEPS

import type { Handler } from "@netlify/functions";
import { createHmac } from "node:crypto";
import { supabase as adminClient } from "../functions/supabase.js";
import { allowRequest } from "../functions/utils/rate-limiter.js";

const FEATURE_ENABLED =
  (process.env.VITE_LNBITS_INTEGRATION_ENABLED || "").toLowerCase() === "true";
const WEBHOOK_SECRET = process.env.LNBITS_WEBHOOK_SECRET || "";

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

async function notifyRecipient(npub: string, message: string) {
  try {
    const { central_event_publishing_service: CEPS } = await import(
      "../../lib/central_event_publishing_service.js"
    );
    // CEPS unified interface: use server-managed keys for DM (prefers NIP-17 internally)
    await CEPS.sendServerDM(npub, message);
  } catch (err) {
    console.warn("CEPS notify failed:", err);
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
    if (!allowRequest(ip, 50, 60_000))
      return json(429, { success: false, error: "Too many attempts" });
    if (event.httpMethod !== "POST")
      return json(405, { success: false, error: "Method not allowed" });

    const raw = event.body || "";
    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return json(400, { success: false, error: "Invalid JSON" });
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
        return json(401, { success: false, error: "Invalid signature" });
    }

    // Expected fields: payment_hash, amount (msats), comment, lnurlp (
    const paymentHash =
      payload?.payment_hash || payload?.payment_hashid || payload?.hash;
    const amountMsat = Number(payload?.amount || payload?.amount_msat || 0);
    const linkId =
      payload?.lnurlp ||
      payload?.link ||
      payload?.link_id ||
      payload?.payment?.lnurlp;

    if (!paymentHash || !amountMsat || !linkId)
      return json(400, { success: false, error: "Missing fields" });

    // Map linkId -> recipient user
    const { data: row, error: walletError } = await adminClient
      .from("lnbits_wallets")
      .select("user_duid, lightning_address")
      .eq("lnurlp_link_id", String(linkId))
      .maybeSingle();
    if (walletError) {
      console.error("lnbits wallet lookup failed", walletError);
      return json(500, { success: false, error: "Wallet lookup failed" });
    }

    // Attempt CEPS DM if npub can be found, then record event
    if (row?.user_duid) {
      const { data: ident, error: identityError } = await adminClient
        .from("user_identities")
        .select("npub")
        .eq("id", row.user_duid)
        .maybeSingle();
      if (identityError) {
        console.error("identity lookup failed", identityError);
        return json(500, { success: false, error: "Identity lookup failed" });
      }
      const npub: string | undefined = ident?.npub || undefined;
      const amountSat = Math.round(amountMsat / 1000);
      const la = row.lightning_address || "(address unknown)";

      if (npub) {
        await notifyRecipient(
          npub,
          `✅ Payment received: ${amountSat} sats to ${la}. Hash: ${paymentHash}`
        );
      }

      // Record payment event (idempotent via unique index)
      const memo = (payload?.comment || payload?.memo || "").toString();
      const { error: upsertError } = await adminClient
        .from("lnbits_payment_events")
        .upsert(
          {
            user_duid: row.user_duid,
            payment_hash: String(paymentHash),
            amount_sats: amountSat,
            lightning_address: row.lightning_address || null,
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
  } catch (e: any) {
    return json(500, { success: false, error: e?.message || "Server error" });
  }
};
