import { nip19 } from "nostr-tools";
import { hexToBytes } from "./crypto-utils";

/**
 * Decode a bech32-encoded nsec (nsec1...) into raw private key bytes.
 *
 * This helper intentionally depends only on nostr-tools/nip19 and local
 * utilities so it can be safely shared between CEPS and SecureNsecManager
 * without creating circular dependencies.
 */
export function decodeNsecToBytes(nsec: string): Uint8Array {
  const dec = nip19.decode(nsec);
  if (dec.type !== "nsec") {
    throw new Error("Invalid nsec format");
  }
  return typeof dec.data === "string"
    ? hexToBytes(dec.data as string)
    : (dec.data as Uint8Array);
}
