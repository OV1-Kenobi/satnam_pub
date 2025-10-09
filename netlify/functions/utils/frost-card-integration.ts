// netlify/functions/utils/frost-card-integration.ts
// Utility: enable "signing" on a Boltcard and link a FROST share to it
// Notes:
// - Callers MUST pass a request-scoped Supabase client created via getRequestClient(token)
//   so that RLS policies (owner access) permit SELECT/INSERT/UPDATE operations.
// - This helper never logs plaintext card UIDs or shard material.
// - Uses process.env only (no import.meta.env). ESM-compatible.

export type ShareType = "individual" | "family" | "federation";

export interface EncryptedShardData {
  // Primary encrypted shard layer
  encrypted_shard_data: string;
  shard_salt: string;
  shard_iv: string;
  shard_tag: string;
  // Second encryption layer (double wrap)
  double_encrypted_shard: string;
  double_salt: string;
  double_iv: string;
  double_tag: string;
  // Optional metadata
  shard_index?: number;
  threshold_required?: number;
  expires_at?: string; // ISO timestamp (optional)
}

export interface EnableSigningResult {
  shareId: string | null;
  success: boolean;
  error?: string;
}

/**
 * Enable card signing and create/link a secure_guardian_shards row.
 *
 * @param supabase Supabase client with user's JWT in Authorization header
 * @param userDuid Authenticated user's DUID (auth.uid())
 * @param cardId   LNbits card_id for the user's Boltcard
 * @param shareType 'individual'|'family'|'federation'
 * @param encryptedShard Encrypted shard payload using double-encryption pattern
 */
export async function enableCardSigning(
  supabase: any,
  userDuid: string,
  cardId: string,
  shareType: ShareType,
  encryptedShard: EncryptedShardData
): Promise<EnableSigningResult> {
  try {
    // a) Verify card exists and is owned by user; get card_uid_hash and functions
    const { data: card, error: cardErr } = await supabase
      .from("lnbits_boltcards")
      .select("card_uid_hash, functions, frost_share_ids")
      .eq("user_duid", userDuid)
      .eq("card_id", cardId)
      .single();
    if (cardErr || !card) {
      return { success: false, shareId: null, error: "Card not found for user" };
    }
    if (!card.card_uid_hash) {
      // Hash should be backfilled by on-demand processes; fail safe for now
      return { success: false, shareId: null, error: "Card hash unavailable" };
    }

    // b) Ensure 'signing' function is present exactly once
    const hasSigning = Array.isArray(card.functions)
      ? card.functions.includes("signing")
      : false;
    if (!hasSigning) {
      const next = Array.isArray(card.functions) ? [...card.functions, "signing"] : ["signing"];
      const { error: funcErr } = await supabase
        .from("lnbits_boltcards")
        .update({ functions: next })
        .eq("user_duid", userDuid)
        .eq("card_id", cardId);
      if (funcErr) {
        return { success: false, shareId: null, error: funcErr.message || "Failed to update card functions" };
      }
    }

    // c) Insert new secure_guardian_shards row (RLS: owner insert via nfc_card_uid_hash)
    const insertPayload: any = {
      nfc_card_uid_hash: card.card_uid_hash,
      share_type: shareType,
      encrypted_shard_data: encryptedShard.encrypted_shard_data,
      shard_salt: encryptedShard.shard_salt,
      shard_iv: encryptedShard.shard_iv,
      shard_tag: encryptedShard.shard_tag,
      double_encrypted_shard: encryptedShard.double_encrypted_shard,
      double_salt: encryptedShard.double_salt,
      double_iv: encryptedShard.double_iv,
      double_tag: encryptedShard.double_tag,
    };
    if (typeof encryptedShard.shard_index === "number")
      insertPayload.shard_index = encryptedShard.shard_index;
    if (typeof encryptedShard.threshold_required === "number")
      insertPayload.threshold_required = encryptedShard.threshold_required;
    if (encryptedShard.expires_at)
      insertPayload.expires_at = encryptedShard.expires_at;

    const { data: newShare, error: insErr } = await supabase
      .from("secure_guardian_shards")
      .insert(insertPayload)
      .select("id")
      .single();
    if (insErr || !newShare?.id) {
      return { success: false, shareId: null, error: insErr?.message || "Failed to create shard" };
    }

    // d) Optionally append to frost_share_ids on the card
    try {
      const current: string[] = Array.isArray(card.frost_share_ids) ? card.frost_share_ids : [];
      const nextIds = [...current, String(newShare.id)];
      const { error: updErr } = await supabase
        .from("lnbits_boltcards")
        .update({ frost_share_ids: nextIds })
        .eq("user_duid", userDuid)
        .eq("card_id", cardId);
      if (updErr) {
        // Non-fatal; the main goal (share creation) succeeded
        console.warn("frost_share_ids append failed (non-fatal)");
      }
    } catch {
      // Swallow non-fatal errors to avoid leaking details
    }

    return { success: true, shareId: String(newShare.id) };
  } catch (e: any) {
    return { success: false, shareId: null, error: e?.message || "Unknown error" };
  }
}

