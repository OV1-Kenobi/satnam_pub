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
import {
  RATE_LIMITS,
  checkRateLimit,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.js";
import {
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.js";
import {
  errorResponse,
  getSecurityHeaders,
  preflightResponse,
} from "./utils/security-headers.js";

const FEATURE_ENABLED =
  (process.env.VITE_LNBITS_INTEGRATION_ENABLED || "").toLowerCase() === "true";

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
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    (event.headers || {}) as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 NFC enable signing handler started:", {
    requestId,
    method: event.httpMethod,
    timestamp: new Date().toISOString(),
  });

  try {
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return preflightResponse(requestOrigin);
    }

    if (!FEATURE_ENABLED)
      return errorResponse(503, "LNbits integration disabled", requestOrigin);

    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitAllowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.NFC_OPERATIONS
    );

    if (!rateLimitAllowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "nfc-enable-signing",
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    if (event.httpMethod !== "POST")
      return errorResponse(405, "Method not allowed", requestOrigin);

    const token = (
      event.headers?.authorization ||
      event.headers?.Authorization ||
      ""
    ).replace(/^Bearer\s+/i, "");
    if (!token)
      return errorResponse(401, "Missing Authorization", requestOrigin);

    const supabase = getRequestClient(token);
    const { data: me, error: meErr } = await supabase.auth.getUser();
    if (meErr || !me?.user?.id)
      return errorResponse(401, "Unauthorized", requestOrigin);
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

    if (!cardId)
      return createValidationErrorResponse(
        "Missing cardId",
        requestId,
        requestOrigin
      );
    if (!shareTypeInput || !isValidShareType(shareTypeInput))
      return createValidationErrorResponse(
        "Invalid shareType",
        requestId,
        requestOrigin
      );
    if (!signingTypeInput || !isValidSigningType(signingTypeInput))
      return createValidationErrorResponse(
        "Invalid signingType",
        requestId,
        requestOrigin
      );

    let shareId: string | undefined;
    let nostrEnabled = false;
    const warnings: string[] = [];

    // FROST linking if requested
    if (signingTypeInput === "frost" || signingTypeInput === "both") {
      if (!encryptedShard || typeof encryptedShard !== "object") {
        return createValidationErrorResponse(
          "Invalid encryptedShard",
          requestId,
          requestOrigin
        );
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
          return createValidationErrorResponse(
            `encryptedShard.${String(f)} required`,
            requestId,
            requestOrigin
          );
        }
      }
      if (
        encryptedShard.shard_index != null &&
        typeof encryptedShard.shard_index !== "number"
      ) {
        return createValidationErrorResponse(
          "encryptedShard.shard_index must be number",
          requestId,
          requestOrigin
        );
      }
      if (
        encryptedShard.threshold_required != null &&
        typeof encryptedShard.threshold_required !== "number"
      ) {
        return createValidationErrorResponse(
          "encryptedShard.threshold_required must be number",
          requestId,
          requestOrigin
        );
      }
      if (
        encryptedShard.expires_at != null &&
        typeof encryptedShard.expires_at !== "string"
      ) {
        return createValidationErrorResponse(
          "encryptedShard.expires_at must be ISO string",
          requestId,
          requestOrigin
        );
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
        logError(new Error(result.error || "Failed to enable FROST signing"), {
          requestId,
          endpoint: "nfc-enable-signing",
          action: "frost-signing",
        });
        return errorResponse(
          code,
          result.error || "Failed to enable FROST signing",
          requestOrigin
        );
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
        return createValidationErrorResponse(
          "Missing nip05 for Nostr signing",
          requestId,
          requestOrigin
        );

      // Validate the authenticated user's NIP-05
      const { data: ident, error: identErr } = await supabase
        .from("user_identities")
        .select("nip05_identifier")
        .eq("id", user_duid)
        .single();
      if (identErr || !ident?.nip05_identifier) {
        logError(identErr || new Error("User identity not found"), {
          requestId,
          endpoint: "nfc-enable-signing",
          action: "nostr-signing",
        });
        return errorResponse(400, "User identity not found", requestOrigin);
      }
      if (
        String(ident.nip05_identifier).toLowerCase() !== nip05.toLowerCase()
      ) {
        return errorResponse(
          400,
          "NIP-05 mismatch for authenticated user",
          requestOrigin
        );
      }

      // Ensure the card belongs to the authenticated user
      const { data: card, error: cardErr } = await supabase
        .from("lnbits_boltcards")
        .select("id, functions")
        .eq("user_duid", user_duid)
        .eq("card_id", String(cardId))
        .single();
      if (cardErr || !card?.id) {
        logError(cardErr || new Error("Card not found for user"), {
          requestId,
          endpoint: "nfc-enable-signing",
          action: "nostr-signing",
        });
        return errorResponse(400, "Card not found for user", requestOrigin);
      }

      // Append 'nostr_signing' via centralized helper and persist nip05
      const syncRes = await syncBoltcardDbAfterProgramming(
        supabase as any,
        user_duid,
        cardId,
        ["nostr_signing"]
      );
      if (!syncRes.success) {
        logError(new Error(syncRes.error || "Failed to enable Nostr signing"), {
          requestId,
          endpoint: "nfc-enable-signing",
          action: "nostr-sync",
        });
        return errorResponse(
          500,
          syncRes.error || "Failed to enable Nostr signing",
          requestOrigin
        );
      }
      const { error: upErr } = await (supabase as any)
        .from("lnbits_boltcards")
        .update({ nostr_nip05: nip05 })
        .eq("id", card.id);
      if (upErr) {
        logError(upErr, {
          requestId,
          endpoint: "nfc-enable-signing",
          action: "nostr-update",
        });
        return errorResponse(
          500,
          "Failed to update Nostr identifier",
          requestOrigin
        );
      }
      nostrEnabled = true;
    }

    return {
      statusCode: 200,
      headers: getSecurityHeaders(requestOrigin),
      body: JSON.stringify({
        success: true,
        shareId,
        nostrEnabled,
        warning: warnings[0],
      }),
    };
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "nfc-enable-signing",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
