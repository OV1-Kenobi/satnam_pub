/**
 * Verify a provenance record by re-hashing content and verifying the signed event
 */

import { central_event_publishing_service as CEPS } from "../../../lib/central_event_publishing_service";
import { sha256Hex } from "./hashing";

export interface VerificationResult {
  ok: boolean;
  reason?: string;
}

export async function verifyProvenance(
  content: string,
  ev: any
): Promise<VerificationResult> {
  try {
    const hashHex = await sha256Hex(content);
    if (!Array.isArray(ev?.tags)) return { ok: false, reason: "missing tags" };
    const h = ev.tags.find((t: string[]) => t[0] === "h")?.[1];
    if (!h) return { ok: false, reason: "missing hash tag" };
    if (h !== hashHex) return { ok: false, reason: "hash mismatch" };
    const ok = await CEPS.verifyEvent(ev);
    return { ok };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "verify error",
    };
  }
}
