// netlify/functions_active/lnbits-sync-boltcards.ts
// Scheduled function (or manual) to sync LNbits Boltcards hits and send CEPS notifications

import type { Handler } from "@netlify/functions";
import { createDecipheriv, createHash } from "node:crypto";
import { supabase as adminClient } from "../functions/supabase.js";

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

async function notifyNpub(npub: string, content: string) {
  try {
    const { central_event_publishing_service: CEPS } = await import(
      "../../lib/central_event_publishing_service.js"
    );
    // Use server-managed DM keys; default to NIP-17 path with CEPS internals
    await CEPS.sendServerDM(npub, content);
  } catch (e) {
    console.warn("CEPS notify failed:", e);
  }
}

export const handler: Handler = async (_event) => {
  try {
    if (!FEATURE_ENABLED)
      return json(503, {
        success: false,
        error: "LNbits integration disabled",
      });

    // Fetch all users with stored invoice or admin keys to sync hits
    const { data: wallets, error } = await adminClient
      .from("lnbits_wallets")
      .select(
        "id, user_duid, lightning_address, wallet_admin_key_enc, wallet_invoice_key_enc"
      )
      .or(
        "wallet_invoice_key_enc.not.is.null,wallet_admin_key_enc.not.is.null"
      );

    if (error) return json(500, { success: false, error: error.message });

    const results: any[] = [];

    for (const w of wallets || []) {
      const keyEnc = w.wallet_invoice_key_enc || w.wallet_admin_key_enc;
      if (!keyEnc) continue;
      let apiKey: string;
      try {
        apiKey = decrypt(keyEnc);
      } catch {
        continue;
      }

      // GET /boltcards/api/v1/hits (implementation differs; fallback to /boltcards/api/v1/cards and per-card hits if needed)
      let hits: any[] = [];
      try {
        const resp = await lnbitsFetch("/boltcards/api/v1/hits", apiKey, {
          method: "GET",
        });
        hits = Array.isArray(resp) ? resp : resp?.data || [];
      } catch (e) {
        // Best-effort: ignore per-wallet errors
        results.push({
          walletId: w.id,
          error: (e as any)?.message || "sync error",
        });
        continue;
      }

      if (hits.length) {
        // Notify owner; look up npub
        const { data: ident } = await adminClient
          .from("user_identities")
          .select("npub")
          .eq("id", w.user_duid)
          .maybeSingle();
        const npub: string | undefined = ident?.npub || undefined;
        if (npub) {
          await notifyNpub(
            npub,
            `\u26a1 Boltcard activity: ${
              hits.length
            } new hit(s) on your card at ${new Date().toISOString()}`
          );
        }
        results.push({ walletId: w.id, hits: hits.length });
      }
    }

    return json(200, { success: true, results });
  } catch (e: any) {
    return json(500, { success: false, error: e?.message || "Server error" });
  }
};
