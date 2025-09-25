import { describe, it, expect } from 'vitest';
import { central_event_publishing_service as CEPS } from '../../lib/central_event_publishing_service';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

describe('Nostr migration e2e consistency', () => {
  it('produces the same npub from the same nsec across flows', async () => {
    const skHex = 'aa'.repeat(32);
    const skBytes = hexToBytes(skHex);

    // Simulate import flow (user pastes nsec)
    const nsecBech32 = CEPS.encodeNsec(skBytes);
    const npubFromImport = CEPS.deriveNpubFromNsec(nsecBech32);

    // Simulate IdentityForge-style derivation (hex private key in memory only)
    const pubHex = CEPS.getPublicKeyHex(skHex);
    const npubFromForge = CEPS.encodeNpub(pubHex);

    expect(npubFromImport).toBe(npubFromForge);
  });
});

