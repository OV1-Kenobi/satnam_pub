import { describe, it, expect } from 'vitest';
import { buildSelfIssuedVC } from '../../src/lib/vc/builders';
import { createDataIntegrityProof, verifyDataIntegrityProof } from '../../src/lib/vc/proofs';

async function genES256() {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  return { privateKey: keyPair.privateKey, publicKeyJwk: pubJwk, privateKeyJwk: privJwk };
}

async function tryGenEd25519(): Promise<null | { privateKey: CryptoKey; publicKeyJwk: JsonWebKey; privateKeyJwk: JsonWebKey }>{
  try {
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' } as any, true, ['sign', 'verify']);
    const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
    const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
    return { privateKey: kp.privateKey, publicKeyJwk: pub, privateKeyJwk: priv };
  } catch {
    return null;
  }
}

describe('VC Proofs (Web Crypto)', () => {
  it('creates and verifies ES256 JsonWebSignature2020', async () => {
    const { privateKey, publicKeyJwk, privateKeyJwk } = await genES256();
    const vc = buildSelfIssuedVC({ holderId: 'nostr:npub1example', subject: { role: 'private' } });
    const proof = await createDataIntegrityProof(vc, { algorithm: 'ES256', privateKey, privateKeyJwk, publicKeyJwk });
    vc.proof = proof as any;
    const res = await verifyDataIntegrityProof(vc);
    expect(res.valid).toBe(true);
  });

  it('creates and verifies Ed25519Signature2020 (if supported)', async () => {
    const ed = await tryGenEd25519();
    if (!ed) return; // skip if not supported
    const vc = buildSelfIssuedVC({ holderId: 'nostr:npub1example', subject: { role: 'private' } });
    const proof = await createDataIntegrityProof(vc, { algorithm: 'EdDSA', privateKey: ed.privateKey, privateKeyJwk: ed.privateKeyJwk, publicKeyJwk: ed.publicKeyJwk });
    vc.proof = proof as any;
    const res = await verifyDataIntegrityProof(vc);
    expect(res.valid).toBe(true);
  });
});

