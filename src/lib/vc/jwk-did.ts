/*
 * did:jwk helpers for secp256k1 (public-only)
 * - Zero-knowledge safe: never accept private keys
 * - Web Crypto API for hashing (RFC7638 thumbprint)
 */

export type Secp256k1Jwk = {
  kty: "EC";
  crv: "secp256k1";
  x: string; // base64url
  y: string; // base64url
};

function toBase64Url(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Invalid hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function jwkFromSecp256k1XY(x: Uint8Array, y: Uint8Array): Secp256k1Jwk {
  return {
    kty: "EC",
    crv: "secp256k1",
    x: toBase64Url(x),
    y: toBase64Url(y),
  };
}

// RFC7638 JWK thumbprint (SHA-256 over canonical members) for EC keys
// Canonical JSON for EC per RFC7638 includes only: crv, kty, x, y (lexicographic order)
async function jwkThumbprintRFC7638(jwk: Secp256k1Jwk): Promise<string> {
  const canonical = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}","y":"${jwk.y}"}`;
  const data = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(new Uint8Array(digest));
}

export async function deriveDidJwkFromXY(
  xHex: string,
  yHex: string
): Promise<string> {
  const x = hexToBytes(xHex);
  const y = hexToBytes(yHex);
  const jwk = jwkFromSecp256k1XY(x, y);
  const thumb = await jwkThumbprintRFC7638(jwk);
  return `did:jwk:${thumb}`;
}

export async function buildDidDocumentMinimal(
  jwk: Secp256k1Jwk
): Promise<Record<string, unknown>> {
  // Minimal did:jwk document (public)
  const thumb = await jwkThumbprintRFC7638(jwk);
  const did = `did:jwk:${thumb}`;
  return {
    id: did,
    verificationMethod: [
      {
        id: `${did}#0`,
        type: "JsonWebKey2020",
        controller: did,
        publicKeyJwk: jwk,
      },
    ],
    assertionMethod: [`${did}#0`],
    authentication: [`${did}#0`],
  };
}
