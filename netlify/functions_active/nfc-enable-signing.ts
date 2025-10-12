// netlify/functions_active/nfc-enable-signing.ts
// Purpose: Enable "signing" capability on a user's Boltcard and link a FROST share
// Auth: JWT via Authorization header (Bearer token)
// RLS: Uses request-scoped Supabase client for owner-scoped access
// Flags: VITE_LNBITS_INTEGRATION_ENABLED must be true
// Rate limiting: modest per-IP limit
// Note: This endpoint performs database-side linking (FROST share association and Nostr enablement)
// and does not perform physical NFC I/O. Actual card programming happens on client (Web NFC)
// or a desktop bridge. Use syncBoltcardDbAfterProgramming to keep DB state in sync.

import type { Handler } from "@netlify/functions";
import { getRequestClient } from "../functions/supabase.js";
import type { ShareType } from "../functions/utils/frost-card-integration.ts";
import { enableCardSigning } from "../functions/utils/frost-card-integration.ts";
import { syncBoltcardDbAfterProgramming } from "../functions/utils/nfc-card-programmer.ts";
import { allowRequest } from "../functions/utils/rate-limiter.js";

const FEATURE_ENABLED =
  (process.env.VITE_LNBITS_INTEGRATION_ENABLED || "").toLowerCase() === "true";

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

function isValidShareType(x: string): x is ShareType {
  return x === "individual" || x === "family" || x === "federation";
}

type SigningType = "frost" | "nostr" | "both";
function isValidSigningType(x: string): x is SigningType {
  return x === "frost" || x === "nostr" || x === "both";
}

function parseBody(body: string | null): any {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
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

    const body = parseBody(event.body);
    const cardId: string | undefined =
      typeof body?.cardId === "string" ? body.cardId : undefined;
    const shareTypeInput: string | undefined =
      typeof body?.shareType === "string" ? body.shareType : undefined;
    const signingTypeInput: string | undefined =
      typeof body?.signingType === "string" ? body.signingType : undefined;
    const nip05: string | undefined =
      typeof body?.nip05 === "string" ? body.nip05 : undefined;
    const encryptedShard: any = body?.encryptedShard;

    if (!cardId) return json(400, { success: false, error: "Missing cardId" });
    if (!shareTypeInput || !isValidShareType(shareTypeInput))
      return json(400, { success: false, error: "Invalid shareType" });
    if (!signingTypeInput || !isValidSigningType(signingTypeInput))
      return json(400, { success: false, error: "Invalid signingType" });

    let shareId: string | undefined;
    let nostrEnabled = false;
    const warnings: string[] = [];

    // FROST linking if requested
    if (signingTypeInput === "frost" || signingTypeInput === "both") {
      if (!encryptedShard || typeof encryptedShard !== "object") {
        return json(400, { success: false, error: "Invalid encryptedShard" });
      }
      const requiredFields = [
        "encrypted_shard_data",
        "shard_salt",
        "shard_iv",
        "shard_tag",
        "double_encrypted_shard",
        "double_salt",
        "double_iv",
        "double_tag",
      ];
      for (const f of requiredFields) {
        if (!(f in encryptedShard) || typeof encryptedShard[f] !== "string") {
          return json(400, {
            success: false,
            error: `encryptedShard.${String(f)} required`,
          });
        }
      }
      if (
        encryptedShard.shard_index != null &&
        typeof encryptedShard.shard_index !== "number"
      ) {
        return json(400, {
          success: false,
          error: "encryptedShard.shard_index must be number",
        });
      }
      if (
        encryptedShard.threshold_required != null &&
        typeof encryptedShard.threshold_required !== "number"
      ) {
        return json(400, {
          success: false,
          error: "encryptedShard.threshold_required must be number",
        });
      }
      if (
        encryptedShard.expires_at != null &&
        typeof encryptedShard.expires_at !== "string"
      ) {
        return json(400, {
          success: false,
          error: "encryptedShard.expires_at must be ISO string",
        });
      }

      const result = await enableCardSigning(
        supabase,
        user_duid,
        cardId,
        shareTypeInput,
        encryptedShard
      );
      if (!result.success) {
        const isOwnershipError = result.error
          ?.toLowerCase()
          .includes("card not found");
        const code = isOwnershipError ? 400 : 500;
        return json(code, {
          success: false,
          error: result.error || "Failed to enable FROST signing",
        });
      }
      // Ensure undefined instead of null for optional string type
      shareId = (result as any).shareId ?? undefined;

      // After FROST linking, sync DB for this card (owner-scoped)
      if (shareId) {
        const syncResult = await syncBoltcardDbAfterProgramming(
          supabase,
          user_duid,
          cardId,
          [],
          shareId
        );
        if (!syncResult.success) {
          warnings.push(syncResult.error || "DB sync failed");
        }
      }
    }

    // Nostr signing enablement if requested
    if (signingTypeInput === "nostr" || signingTypeInput === "both") {
      if (!nip05)
        return json(400, {
          success: false,
          error: "Missing nip05 for Nostr signing",
        });

      // Validate the authenticated user's NIP-05
      const { data: ident, error: identErr } = await supabase
        .from("user_identities")
        .select("nip05_identifier")
        .eq("id", user_duid)
        .single();
      if (identErr || !ident?.nip05_identifier) {
        return json(400, { success: false, error: "User identity not found" });
      }
      if (
        String(ident.nip05_identifier).toLowerCase() !== nip05.toLowerCase()
      ) {
        return json(400, {
          success: false,
          error: "NIP-05 mismatch for authenticated user",
        });
      }

      // Ensure the card belongs to the authenticated user
      const { data: card, error: cardErr } = await supabase
        .from("lnbits_boltcards")
        .select("id, functions")
        .eq("user_duid", user_duid)
        .eq("card_id", String(cardId))
        .single();
      if (cardErr || !card?.id) {
        return json(400, { success: false, error: "Card not found for user" });
      }

      // Append 'nostr_signing' via centralized helper and persist nip05
      const syncRes = await syncBoltcardDbAfterProgramming(
        supabase as any,
        user_duid,
        cardId,
        ["nostr_signing"]
      );
      if (!syncRes.success) {
        return json(500, {
          success: false,
          error: syncRes.error || "Failed to enable Nostr signing",
        });
      }
      const { error: upErr } = await (supabase as any)
        .from("lnbits_boltcards")
        .update({ nostr_nip05: nip05 })
        .eq("id", card.id);
      if (upErr)
        return json(500, {
          success: false,
          error: "Failed to update Nostr identifier",
        });
      nostrEnabled = true;
    }

    return json(200, {
      success: true,
      shareId,
      nostrEnabled,
      warning: warnings[0],
    });
  } catch (e: any) {
    return json(500, { success: false, error: e?.message || "Server error" });
  }
};
