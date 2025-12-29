/**
 * Content provenance — create and publish a Nostr event with content hash
 * Uses CEPS to sign with the active session (NIP-42 capable if relay requires it)
 */

import { publishEventWithCeps, signEventWithCeps } from "../ceps";
import { sha256Hex } from "./hashing";

export interface ProvenanceRecord {
  eventId: string;
  hashHex: string;
}

export async function publishContentProvenance(
  content: string,
  tags?: string[][]
): Promise<ProvenanceRecord> {
  const hashHex = await sha256Hex(content);
  const now = Math.floor(Date.now() / 1000);
  const ev = await signEventWithCeps({
    kind: 11100, // application-specific provenance kind
    created_at: now,
    tags: [["h", hashHex], ...(tags ?? [])],
    content,
  });
  const id = await publishEventWithCeps(ev);
  return { eventId: id, hashHex };
}
