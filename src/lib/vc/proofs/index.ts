/**
 * Proofs (JOSE/Data Integrity) — Web Crypto implementations
 * Compliant with W3C VC Data Model v2.0 Sec 4.12 (JsonWebSignature2020 / Ed25519Signature2020)
 * Notes:
 * - To avoid new deps, we support Web Crypto based signatures (ES256 and Ed25519 where available).
 * - We embed the publicKeyJwk in the proof for offline verification (no DID resolution).
 */

import type { VerifiableCredential } from "../builders";

export type SupportedAlg = "ES256" | "EdDSA";

export interface ProofOptions {
  purpose?: "assertionMethod" | "authentication";
  created?: string; // ISO
  domain?: string;
  challenge?: string;
  verificationMethod?: string; // DID URL of key
  algorithm: SupportedAlg;
  privateKey?: CryptoKey; // Preferred
  privateKeyJwk?: JsonWebKey; // Alternative
  publicKeyJwk?: JsonWebKey; // Optional (if not inferable from privateKeyJwk)
}

function base64url(bytes: Uint8Array | string): string {
  const b = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  // Process in chunks to avoid stack overflow
  const CHUNK_SIZE = 0x8000;
  let s = "";
  for (let i = 0; i < b.length; i += CHUNK_SIZE) {
    const chunk = b.slice(i, i + CHUNK_SIZE);
    s += String.fromCharCode(...chunk);
  }
  s = btoa(s);
  return s.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function textToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// Stable, deterministic JSON canonicalization (sorted keys, drop undefined)
function stableStringify(obj: unknown): string {
  const seen = new WeakSet();
  const canonical = (x: any): any => {
    if (x === null || typeof x !== "object") return x;
    if (seen.has(x)) return null;
    seen.add(x);
    if (Array.isArray(x)) return x.map(canonical);
    const out: Record<string, any> = {};
    Object.keys(x)
      .filter((k) => typeof x[k] !== "undefined")
      .sort()
      .forEach((k) => {
        out[k] = canonical(x[k]);
      });
    return out;
  };
  return JSON.stringify(canonical(obj));
}

async function importPrivateKey(
  alg: SupportedAlg,
  jwk?: JsonWebKey
): Promise<CryptoKey> {
  if (!jwk)
    throw new Error("privateKeyJwk required when privateKey not provided");
  if (alg === "ES256") {
    return crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  }
  // Ed25519 (EdDSA)
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "Ed25519" } as any,
    false,
    ["sign"]
  );
}

async function importPublicKey(
  alg: SupportedAlg,
  jwk: JsonWebKey
): Promise<CryptoKey> {
  if (alg === "ES256") {
    return crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  }
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "Ed25519" } as any,
    false,
    ["verify"]
  );
}

function headerForAlg(alg: SupportedAlg): Record<string, any> {
  return { alg, typ: "JWT" }; // compact JWS-style header
}

function buildSigningPayload(vc: VerifiableCredential): Uint8Array {
  // Exclude existing proof when signing
  const { proof, ...unsigned } = vc as any;
  const payload = stableStringify(unsigned);
  return textToBytes(payload);
}

export async function createDataIntegrityProof(
  vc: VerifiableCredential,
  opts: ProofOptions
): Promise<Record<string, unknown>> {
  const created = opts.created || new Date().toISOString();
  const purpose = opts.purpose || "assertionMethod";

  // Resolve keys
  const priv =
    opts.privateKey ||
    (await importPrivateKey(opts.algorithm, opts.privateKeyJwk));
  const pubJwk =
    opts.publicKeyJwk ||
    (opts.privateKeyJwk && ({ ...opts.privateKeyJwk, d: undefined } as any));
  if (!pubJwk) throw new Error("publicKeyJwk is required");

  // Create JWS compact over canonicalized VC payload
  const header = headerForAlg(opts.algorithm);
  const encodedHeader = base64url(JSON.stringify(header));
  const payloadBytes = buildSigningPayload(vc);
  const encodedPayload = base64url(payloadBytes);
  const signingInput = textToBytes(`${encodedHeader}.${encodedPayload}`);

  let sigBytes: ArrayBuffer;
  if (opts.algorithm === "ES256") {
    sigBytes = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      priv,
      new Uint8Array(signingInput)
    );
  } else {
    sigBytes = await crypto.subtle.sign(
      { name: "Ed25519" } as any,
      priv,
      new Uint8Array(signingInput)
    );
  }
  const signatureB64u = base64url(new Uint8Array(sigBytes));
  const jws = `${encodedHeader}.${encodedPayload}.${signatureB64u}`;

  return {
    type:
      opts.algorithm === "ES256"
        ? "JsonWebSignature2020"
        : "Ed25519Signature2020",
    created,
    proofPurpose: purpose,
    domain: opts.domain,
    challenge: opts.challenge,
    verificationMethod: opts.verificationMethod,
    publicKeyJwk: pubJwk,
    jws,
  } as Record<string, unknown>;
}

export async function verifyDataIntegrityProof(
  vc: VerifiableCredential
): Promise<{ valid: boolean; errors?: string[] }> {
  const p = (vc.proof || {}) as Record<string, any>;
  const jws: string | undefined = p.jws;
  const pub: JsonWebKey | undefined = p.publicKeyJwk;
  const type: string | undefined = p.type;
  if (!jws || !pub || !type)
    return { valid: false, errors: ["Missing required proof fields"] };

  const alg: SupportedAlg = type === "JsonWebSignature2020" ? "ES256" : "EdDSA";
  const [h, pl, sig] = jws.split(".");
  if (!h || !pl || !sig) return { valid: false, errors: ["Malformed jws"] };

  // Verify header alg matches
  try {
    const hdr = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(h.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
          c.charCodeAt(0)
        )
      )
    );
    if (hdr.alg !== (alg === "ES256" ? "ES256" : "EdDSA")) {
      return { valid: false, errors: ["Alg mismatch"] };
    }
  } catch (e) {
    return { valid: false, errors: ["Invalid JWS header format"] };
  }

  const verifyInput = textToBytes(`${h}.${pl}`);
  const sigBytes = Uint8Array.from(
    atob(sig.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );
  const key = await importPublicKey(alg, pub);

  let ok: boolean;
  if (alg === "ES256") {
    ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      sigBytes,
      new Uint8Array(verifyInput)
    );
  } else {
    ok = await crypto.subtle.verify(
      { name: "Ed25519" } as any,
      key,
      sigBytes,
      new Uint8Array(verifyInput)
    );
  }

  // Defend against proof replay across altered payloads: re-calc payload must match pl
  const recomputedPayload = base64url(buildSigningPayload(vc));
  if (recomputedPayload !== pl)
    return { valid: false, errors: ["Payload mismatch"] };

  return ok ? { valid: true } : { valid: false, errors: ["Signature invalid"] };
}
