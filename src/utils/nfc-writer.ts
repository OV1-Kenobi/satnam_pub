// src/utils/nfc-writer.ts
// Web NFC helper to write an NDEF Text record containing a NIP-05 identifier.
// Client-side only. Use on Android (Chrome/Edge). Gracefully no-op on unsupported platforms.
// Phase 11 Task 11.2.4: Updated to use batch writer with retry logic

import { writeSingleTextRecord } from "../lib/nfc/batch-ndef-writer";

export async function writeNdefTextRecord(
  nip05: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof window === "undefined") {
      return { success: false, error: "Not a browser environment" };
    }

    // Informational log; avoid logging sensitive data
    console.debug(
      "[NFC] Writing NDEF Text record (readable by iOS devices)...",
    );

    // Use optimized batch writer with retry logic
    const result = await writeSingleTextRecord(nip05, "en", 3);

    if (!result.success) {
      console.warn("[NFC] NDEF Text write failed:", result.error);
      return { success: false, error: result.error };
    }

    return { success: true };
  } catch (e: any) {
    const msg = e?.message || "NDEF write failed";
    console.warn("[NFC] NDEF Text write failed:", msg);
    return { success: false, error: msg };
  }
}
