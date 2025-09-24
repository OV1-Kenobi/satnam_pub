import { describe, it, expect, beforeEach, vi } from 'vitest';
import { didScidFromJwkAndNip05, buildDidDocument, type Secp256k1Jwk } from '../src/lib/vc/jwk-did.ts';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i*2, i*2+2), 16);
  return out;
}
function toBase64Url(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replaceAll('+','-').replaceAll('/','_').replace(/=+$/g, '');
}

const xHex = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const yHex = 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';
const jwk: Secp256k1Jwk = {
  kty: 'EC',
  crv: 'secp256k1',
  x: toBase64Url(hexToBytes(xHex)),
  y: toBase64Url(hexToBytes(yHex)),
};

const nip05 = 'user@example.com';

describe('did:scid helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('didScidFromJwkAndNip05: valid inputs yield deterministic id', async () => {
    const d1 = await didScidFromJwkAndNip05('ke', 1, jwk, nip05);
    const d2 = await didScidFromJwkAndNip05('ke', 1, jwk, nip05);
    expect(d1).toEqual(d2);
    expect(d1.startsWith('did:scid:ke:1:')).toBe(true);
  });

  it('didScidFromJwkAndNip05: changing inputs changes output', async () => {
    const d1 = await didScidFromJwkAndNip05('ke', 1, jwk, nip05);
    const jwk2: Secp256k1Jwk = { ...jwk, x: toBase64Url(hexToBytes('11'.repeat(32))) };
    const d2 = await didScidFromJwkAndNip05('ke', 1, jwk2, nip05);
    expect(d1).not.toEqual(d2);

    const d3 = await didScidFromJwkAndNip05('ke', 1, jwk, 'other@example.com');
    expect(d1).not.toEqual(d3);
  });

  it('didScidFromJwkAndNip05: invalid inputs throw', async () => {
    await expect(didScidFromJwkAndNip05('', 1, jwk, nip05)).rejects.toThrow();
    await expect(didScidFromJwkAndNip05('ke', 0, jwk, nip05)).rejects.toThrow();
    const badJwk: any = { kty: 'EC', crv: 'secp256k1', x: undefined, y: jwk.y };
    await expect(didScidFromJwkAndNip05('ke', 1, badJwk, nip05)).rejects.toThrow();
  });

  it('buildDidDocument: verifies nip05 via nostr.json and succeeds when x matches', async () => {
    const username = 'user';
    const domain = 'example.com';
    const nostrUrl = `https://${domain}/.well-known/nostr.json?name=${username}`;
    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      if (String(url) === nostrUrl) {
        return {
          ok: true,
          json: async () => ({ names: { [username]: xHex } }),
        } as any;
      }
      throw new Error('Unexpected fetch ' + url);
    }));

    const doc = await buildDidDocument({ nip05, jwk, mirrors: ['https://mirror.example'] });
    expect(doc.id).toBe('did:web:example.com');
    expect(Array.isArray(doc.alsoKnownAs)).toBe(true);
    expect(doc.alsoKnownAs?.some(a => a === `acct:${nip05}`)).toBe(true);
    expect(doc.alsoKnownAs?.some(a => a.startsWith('did:scid:'))).toBe(true);
  });

  it('buildDidDocument: throws when nostr.json mapping does not match jwk.x', async () => {
    const username = 'user';
    const domain = 'example.com';
    const nostrUrl = `https://${domain}/.well-known/nostr.json?name=${username}`;
    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      if (String(url) === nostrUrl) {
        return {
          ok: true,
          json: async () => ({ names: { [username]: 'deadbeef' } }),
        } as any;
      }
      return { ok: false } as any;
    }));

    await expect(buildDidDocument({ nip05, jwk })).rejects.toThrow();
  });
});

