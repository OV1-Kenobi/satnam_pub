import { describe, expect, it } from "vitest";

// Use CEPS as the canonical place for nostr-tools usage
import { central_event_publishing_service as CEPS } from "../../lib/central_event_publishing_service";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 ? "0" + hex : hex;
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++)
    arr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

describe("nsec -> npub derivation consistency", () => {
  it("derives identical npub from the same nsec as reference implementation", async () => {
    const nt = await import("nostr-tools");
    const nip19 = (nt as any).nip19 as any;
    const getPub = (nt as any).getPublicKey as (sk: string) => string;

    // Fixed valid private key (32 bytes of 0x11)
    const skHex = "11".repeat(32);
    const pkHex = getPub(skHex);
    const nsec = nip19.nsecEncode(hexToBytes(skHex));
    const npub = nip19.npubEncode(pkHex);

    const derivedNpub = CEPS.deriveNpubFromNsec(nsec);
    expect(derivedNpub).toBe(npub);
  });

  it("derives correct pubkey hex from nsec", async () => {
    const nt = await import("nostr-tools");
    const nip19 = (nt as any).nip19 as any;
    const getPub = (nt as any).getPublicKey as (sk: string) => string;

    const skHex = "22".repeat(32);
    const pkHex = getPub(skHex);
    const nsec = nip19.nsecEncode(hexToBytes(skHex));

    const derivedPubHex = CEPS.derivePubkeyHexFromNsec(nsec);
    expect(derivedPubHex).toBe(pkHex);
  });
});
