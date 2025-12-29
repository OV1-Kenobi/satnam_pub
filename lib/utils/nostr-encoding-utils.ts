import { nip19, getPublicKey } from "nostr-tools";

import { decodeNsecToBytes } from "./nsec-utils";
import { bytesToHex } from "./crypto-utils";

/**
 * Nostr key encoding/decoding helpers shared across lib and src layers.
 * These helpers depend only on nostr-tools and local stateless utilities.
 */

export function encodeNpub(pubkeyHex: string): string {
  return nip19.npubEncode(pubkeyHex);
}

export function encodeNsec(privBytes: Uint8Array): string {
  // Pass raw bytes to nip19.nsecEncode to match current nostr-tools API
  return (nip19 as any).nsecEncode(privBytes);
}

export function derivePubkeyHexFromNsec(nsec: string): string {
  const privBytes = decodeNsecToBytes(nsec);
  const privHex = bytesToHex(privBytes);
  return getPublicKey(privHex);
}

export function deriveNpubFromNsec(nsec: string): string {
  const pubHex = derivePubkeyHexFromNsec(nsec);
  return encodeNpub(pubHex);
}

