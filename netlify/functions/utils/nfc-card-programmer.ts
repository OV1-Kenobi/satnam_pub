// netlify/functions/utils/nfc-card-programmer.ts
// Multi-function NFC card programming service (NTAG424 DNA)
// NOTE: This module focuses on data layout, integrity checks, and integration points.
// Actual NFC I/O is environment-specific (Web NFC on mobile or nfc-pcsc on desktop);
// functions here return structured results and include TODOs for platform adapters.
//
// SECURITY ANALYSIS (File 04 plaintext NIP-05):
// - Storing a plaintext NIP-05 identifier that is readable without PIN is acceptable ONLY for
//   UX convenience (smart business card). It MUST NOT be treated as proof of ownership.
// - Server-side validation must bind the physical card UID to the claimed identity:
//     1) Client reads card UID (via Web NFC serialNumber) and NIP-05 (from File 04 or NDEF Text).
//     2) Server looks up the claimed user by NIP-05 to obtain that user's salt, then
//        recomputes card_uid_hash = SHA-256(cardUid || user_salt) and verifies it matches
//        lnbits_boltcards.card_uid_hash for that user.
// - This prevents trivial spoofing (attacker writing someone else's NIP-05) without depending
//   on storing raw card UIDs in the DB. An attacker would need to both know the owner's salt and
//   clone the exact UID, which is non-trivial on NTAG424.
// - For high-assurance contact verification, additionally require SUN/SDM verification when
//   available. Storing an HMAC signature alongside plaintext NIP-05 within 32 bytes is space-
//   constrained; instead, keep plaintext NIP-05 for UX and rely on server verification of UID.

import * as crypto from "node:crypto";

export type ProgramFunction = "payment" | "auth" | "signing";

export interface NFCAdapter {
  readFile(fileNumber: number): Promise<Buffer | null>;
  writeFile(fileNumber: number, data: Buffer): Promise<boolean>;
  authenticate(pin: string): Promise<boolean>;
  getCardUid(): Promise<string>;
}

export interface ProgramOptions {
  boltcardId?: string; // required if 'payment'
  authKeyHash?: string; // required if 'auth' (32-byte hex preferred)
  frostShareId?: string; // required if 'signing' (UUID)
  nip05?: string; // optional: if provided, File 04 Nostr metadata is written
  pin: string; // mandatory PIN for protection
}

export interface ProgramResult {
  success: boolean;
  programmedFunctions: string[];
  error?: string;
  warning?: string;
}

export interface WriteResult {
  success: boolean;
  bytesWritten: number;
  error?: string;
}
export interface VerifyResult {
  success: boolean;
  verifiedFunctions: string[];
  errors?: string[];
}
export interface DeprovisionResult {
  success: boolean;
  wipedFiles: number[];
  error?: string;
}

// --- Internal helpers ---

function sha256Hex(input: string | Buffer): string {
  const h = crypto.createHash("sha256");
  h.update(input);
  return h.digest("hex");
}

function hmacSha256(input: string | Buffer, key: string | Buffer): Buffer {
  const h = crypto.createHmac("sha256", key);
  h.update(input);
  return h.digest();
}

function toFixedSize(buf: Buffer, size: number): Buffer {
  if (buf.length === size) return buf;
  if (buf.length > size) {
    throw new Error(
      `Buffer truncation: expected ${size} bytes, got ${buf.length}`
    );
  }
  const out = Buffer.alloc(size);
  buf.copy(out, 0, 0, Math.min(buf.length, size));
  return out;
}

function isPinValid(pin: string): boolean {
  return typeof pin === "string" && /^\d{4,6}$/.test(pin);
}

// Derive an HMAC key for File 01 signature (deployment-specific secret)
function derivePaymentHmacKey(): Buffer {
  const base =
    process.env.NTAG424_FILE01_HMAC_KEY || process.env.DUID_SERVER_SECRET;
  if (!base) {
    throw new Error(
      "NTAG424_FILE01_HMAC_KEY or DUID_SERVER_SECRET must be set"
    );
  }
  return crypto.createHash("sha256").update(base).digest();
}

// Constant-time equality for sensitive comparisons
function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// --- Public API ---

export async function programMultiFunctionCard(
  userId: string,
  cardUid: string,
  functions: ProgramFunction[],
  options: ProgramOptions,
  adapter?: NFCAdapter,
  supabase?: any,
  userDuid?: string,
  cardId?: string,
  shareId?: string
): Promise<ProgramResult> {
  try {
    if (!isPinValid(options.pin))
      return {
        success: false,
        programmedFunctions: [],
        error: "INVALID_PIN_FORMAT",
      };

    // Enforce prerequisites
    if (functions.includes("payment") && !options.boltcardId) {
      return {
        success: false,
        programmedFunctions: [],
        error: "MISSING_BOLTCARD_ID",
      };
    }
    if (functions.includes("auth") && !options.authKeyHash) {
      return {
        success: false,
        programmedFunctions: [],
        error: "MISSING_AUTH_KEY_HASH",
      };
    }
    if (functions.includes("signing") && !options.frostShareId) {
      return {
        success: false,
        programmedFunctions: [],
        error: "MISSING_FROST_SHARE_ID",
      };
    }

    const programmed: string[] = [];

    // If adapter is available, authenticate once with PIN before protected writes
    if (adapter) {
      const authed = await adapter.authenticate(options.pin);
      if (!authed) {
        return {
          success: false,
          programmedFunctions: [],
          error: "PIN_AUTH_FAILED",
        };
      }
    }

    // Payment (File 01)
    if (functions.includes("payment")) {
      const wr = await writePaymentData(cardUid, options.boltcardId!, adapter);
      if (!wr.success)
        return {
          success: false,
          programmedFunctions: programmed,
          error: wr.error || "PAYMENT_WRITE_FAILED",
        };
      programmed.push("payment");
    }

    // Auth (File 02)
    if (functions.includes("auth")) {
      const wr = await writeAuthData(cardUid, options.authKeyHash!, adapter);
      if (!wr.success)
        return {
          success: false,
          programmedFunctions: programmed,
          error: wr.error || "AUTH_WRITE_FAILED",
        };
      programmed.push("auth");
    }

    // Signing (File 03)
    if (functions.includes("signing")) {
      // Pointer format: UUID (16 bytes) + nonce (16 bytes), hex-encoded payload length 32 bytes total
      const pointer = buildSharePointer(options.frostShareId!);
      const wr = await writeSigningData(cardUid, pointer, adapter);
      if (!wr.success)
        return {
          success: false,
          programmedFunctions: programmed,
          error: wr.error || "SIGNING_WRITE_FAILED",
        };
      programmed.push("signing");
    }

    // Verify pass (best-effort)
    const vr = await verifyCardProgramming(cardUid, programmed, adapter);
    if (!vr.success) {
      return {
        success: false,
        programmedFunctions: programmed,
        error: "CARD_WRITE_VERIFY_FAILED",
      };
    }

    // Nostr metadata (File 04) — optional plaintext NIP-05 for business-card UX
    // Dual-write strategy for cross-platform compatibility:
    // - File 04: Custom layout for Android Web NFC and future desktop bridge
    // - NDEF Text: Standard format for iOS Core NFC (read-only on iOS)
    if (options.nip05) {
      const wr = await writeNostrMetadata(cardUid, options.nip05, adapter);
      if (!wr.success) {
        return {
          success: false,
          programmedFunctions: programmed,
          error: wr.error || "NOSTR_METADATA_WRITE_FAILED",
        };
      }
      // Best-effort: also mirror NIP-05 into an NDEF Text record
      const nw = await writeNdefTextRecord(options.nip05);
      if (!nw.success) {
        // Do not fail entire programming if NDEF write fails; log/return partial success
        // Callers may show a warning that iOS may not read File 04 without NDEF fallback
      }
      programmed.push("nostr");
    }

    // Optional: sync DB after successful programming if caller provided supabase + context
    let warning: string | undefined;
    if (supabase && userDuid && cardId) {
      const syncRes = await syncBoltcardDbAfterProgramming(
        supabase,
        userDuid,
        cardId,
        programmed,
        shareId
      );
      if (!syncRes.success) {
        warning = syncRes.error || "DB sync failed";
      }
    }

    return { success: true, programmedFunctions: programmed, warning };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { success: false, programmedFunctions: [], error: msg };
  }
}

export async function writePaymentData(
  cardUid: string,
  boltcardId: string,
  adapter?: NFCAdapter
): Promise<WriteResult> {
  try {
    // Layout: 16 bytes card ref + 16 bytes HMAC-SHA256 signature
    const key = derivePaymentHmacKey();
    const refBytes = toFixedSize(Buffer.from(boltcardId), 16);
    const sig = toFixedSize(hmacSha256(refBytes, key), 16);
    const payload = Buffer.concat([refBytes, sig]); // 32 bytes

    // NFC write to File 01 via adapter (if provided)
    if (adapter) {
      const ok = await adapter.writeFile(0x01, payload);
      if (!ok)
        return {
          success: false,
          bytesWritten: 0,
          error: "FILE01_WRITE_FAILED",
        };
    }

    return { success: true, bytesWritten: payload.length };
  } catch (e) {
    return {
      success: false,
      bytesWritten: 0,
      error: "NFC_COMMUNICATION_FAILED",
    };
  }
}

export async function writeAuthData(
  cardUid: string,
  authKeyHash: string,
  adapter?: NFCAdapter
): Promise<WriteResult> {
  try {
    // Layout: SHA-256(authKeyHash + cardUid) -> 32 bytes
    const materialHex = sha256Hex(
      Buffer.concat([Buffer.from(authKeyHash, "hex"), Buffer.from(cardUid)])
    );
    const payload = Buffer.from(materialHex, "hex"); // 32 bytes

    // Write to File 02 via adapter (PIN should be authenticated by caller)
    if (adapter) {
      const ok = await adapter.writeFile(0x02, payload);
      if (!ok)
        return {
          success: false,
          bytesWritten: 0,
          error: "FILE02_WRITE_FAILED",
        };
    }

    return { success: true, bytesWritten: payload.length };
  } catch (e) {
    return {
      success: false,
      bytesWritten: 0,
      error: "NFC_COMMUNICATION_FAILED",
    };
  }
}

function buildSharePointer(frostShareId: string): string {
  // 16 bytes UUID + 16 bytes nonce
  const uuidHex = frostShareId.replace(/-/g, "").toLowerCase();
  const uuidBuf = Buffer.from(uuidHex, "hex");
  const nonce = crypto.randomBytes(16);
  const out = Buffer.concat([toFixedSize(uuidBuf, 16), nonce]);
  return out.toString("hex");
}

export async function writeSigningData(
  cardUid: string,
  encryptedSharePointer: string,
  adapter?: NFCAdapter
): Promise<WriteResult> {
  try {
    const payload = toFixedSize(Buffer.from(encryptedSharePointer, "hex"), 32);

    // Write to File 03 via adapter (PIN should be authenticated by caller)
    if (adapter) {
      const ok = await adapter.writeFile(0x03, payload);
      if (!ok)
        return {
          success: false,
          bytesWritten: 0,
          error: "FILE03_WRITE_FAILED",
        };
    }

    return { success: true, bytesWritten: payload.length };
  } catch (e) {
    return {
      success: false,
      bytesWritten: 0,
      error: "NFC_COMMUNICATION_FAILED",
    };
  }
}

/**
 * File 04 (32 bytes): Nostr identity metadata (readable without PIN)
 * Layout: NIP-05 identifier (UTF-8, up to 28 bytes) + reserved (4 bytes for future use)
 * Example: "alice@satnam.pub\0..." (null-padded) + 4-byte zeros
 *
 * SECURITY: Plaintext NIP-05 here is for UX only and MUST be validated on the server by binding
 * the provided card UID to the claimed identity's salt-derived card_uid_hash (see module header).
 */
export async function writeNostrMetadata(
  cardUid: string,
  nip05: string,
  adapter?: NFCAdapter
): Promise<WriteResult> {
  try {
    const nipBuf = Buffer.from(nip05, "utf8");
    if (nipBuf.length > 28) {
      throw new Error(
        `NIP-05 identifier too long: ${nipBuf.length} bytes (max 28)`
      );
    }
    const nipFixed = toFixedSize(nipBuf, 28); // null-pad to 28 bytes (no truncation)
    const reserved = Buffer.alloc(4); // zeros for future counters/flags
    const payload = Buffer.concat([nipFixed, reserved]); // 32 bytes

    // Write to File 04 via adapter
    if (adapter) {
      const ok = await adapter.writeFile(0x04, payload);
      if (!ok)
        return {
          success: false,
          bytesWritten: 0,
          error: "FILE04_WRITE_FAILED",
        };
    }

    return { success: true, bytesWritten: payload.length };
  } catch (e) {
    return {
      success: false,
      bytesWritten: 0,
      error: "NFC_COMMUNICATION_FAILED",
    };
  }
}

export async function verifyCardProgramming(
  cardUid: string,
  expectedFunctions: string[],
  adapter?: NFCAdapter
): Promise<VerifyResult> {
  try {
    const errors: string[] = [];
    const verified: string[] = [];

    if (!adapter) {
      return {
        success: true,
        verifiedFunctions: [...expectedFunctions],
        errors: ["Verification skipped: no adapter"],
      };
    }

    const nonZero = (buf: Buffer) => {
      const zeroHex = Buffer.alloc(buf.length).toString("hex");
      return !timingSafeEqualHex(buf.toString("hex"), zeroHex);
    };

    if (expectedFunctions.includes("payment")) {
      const rb = await adapter.readFile(0x01);
      if (!rb || rb.length !== 32) {
        errors.push("File 01 read failed or invalid length");
      } else if (!nonZero(rb)) {
        errors.push("File 01 appears empty");
      } else {
        verified.push("payment");
      }
    }
    if (expectedFunctions.includes("auth")) {
      const rb = await adapter.readFile(0x02);
      if (!rb || rb.length !== 32) {
        errors.push("File 02 read failed or invalid length");
      } else if (!nonZero(rb)) {
        errors.push("File 02 appears empty");
      } else {
        verified.push("auth");
      }
    }
    if (expectedFunctions.includes("signing")) {
      const rb = await adapter.readFile(0x03);
      if (!rb || rb.length !== 32) {
        errors.push("File 03 read failed or invalid length");
      } else if (!nonZero(rb)) {
        errors.push("File 03 appears empty");
      } else {
        verified.push("signing");
      }
    }
    if (expectedFunctions.includes("nostr")) {
      const rb = await adapter.readFile(0x04);
      if (!rb || rb.length !== 32) {
        errors.push("File 04 read failed or invalid length");
      } else if (!nonZero(rb)) {
        errors.push("File 04 appears empty");
      } else {
        verified.push("nostr");
      }
    }

    return {
      success: errors.length === 0,
      verifiedFunctions: verified,
      errors: errors.length ? errors : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { success: false, verifiedFunctions: [], errors: [msg] };
  }
}

// Top-level placeholder for writing NDEF Text record (client adapter performs real I/O)
export async function writeNdefTextRecord(nip05: string): Promise<WriteResult> {
  try {
    const bytes = Buffer.from(nip05, "utf8").length;
    return { success: true, bytesWritten: bytes };
  } catch (e) {
    return { success: false, bytesWritten: 0, error: "NFC_NDEF_WRITE_FAILED" };
  }
}

export async function deprovisionCard(
  cardUid: string,
  adapter?: NFCAdapter
): Promise<DeprovisionResult> {
  try {
    const wiped: number[] = [];

    if (adapter) {
      // Overwrite files 01..04 with zeros (simple wipe)
      for (const fileNo of [0x01, 0x02, 0x03, 0x04]) {
        const ok = await adapter.writeFile(fileNo, Buffer.alloc(32));
        if (ok) wiped.push(fileNo);
      }
    }

    return { success: true, wipedFiles: wiped };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { success: false, wipedFiles: [], error: msg };
  }
}

// Centralized DB sync helper after successful NFC programming
export async function syncBoltcardDbAfterProgramming(
  supabase: any,
  userDuid: string,
  cardId: string,
  programmedFunctions: string[],
  shareId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: card, error: cardErr } = await supabase
      .from("lnbits_boltcards")
      .select("id, functions, frost_share_ids")
      .eq("user_duid", userDuid)
      .eq("card_id", String(cardId))
      .single();
    if (cardErr || !card?.id) {
      return { success: false, error: "Card not found for user" };
    }

    const existingFns: string[] = Array.isArray(card.functions)
      ? card.functions
      : [];
    const nextFns = Array.from(
      new Set([...(existingFns as string[]), ...(programmedFunctions || [])])
    );

    const existingShares: string[] = Array.isArray(card.frost_share_ids)
      ? card.frost_share_ids
      : [];
    const nextShares = shareId
      ? Array.from(new Set([...(existingShares as string[]), String(shareId)]))
      : existingShares;

    const { error: upErr } = await supabase
      .from("lnbits_boltcards")
      .update({ functions: nextFns, frost_share_ids: nextShares })
      .eq("id", card.id);
    if (upErr) return { success: false, error: String(upErr.message || upErr) };

    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { success: false, error: msg };
  }
}
