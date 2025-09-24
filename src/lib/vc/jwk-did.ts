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

// ---------------- did:scid + DID Document (with NIP-05 verification) ----------------

export type DidDocument = {
  id: string;
  alsoKnownAs?: string[];
  verificationMethod: Array<{
    id: string;
    type: string;
    controller: string;
    publicKeyJwk: Secp256k1Jwk;
  }>;
  assertionMethod?: string[];
  authentication?: string[];
};

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 2 ? "==" : b64.length % 4 === 3 ? "=" : "";
  const s = atob(b64 + pad);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseNip05(nip05: string): { username: string; domain: string } {
  const parts = nip05.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid NIP-05 format; expected username@domain");
  }
  return { username: parts[0].toLowerCase(), domain: parts[1].toLowerCase() };
}

export async function didScidFromJwkAndNip05(
  fmt: string,
  version: number,
  jwk: Secp256k1Jwk,
  nip05: string
): Promise<string> {
  if (!fmt || typeof fmt !== "string")
    throw new Error("Invalid did:scid format");
  if (!Number.isInteger(version) || version < 1)
    throw new Error("Invalid did:scid version");
  if (jwk.kty !== "EC" || jwk.crv !== "secp256k1" || !jwk.x || !jwk.y) {
    throw new Error("Invalid secp256k1 JWK");
  }
  const thumb = await jwkThumbprintRFC7638(jwk);
  const seed = new TextEncoder().encode(`${nip05}|${thumb}`);
  const digest = await crypto.subtle.digest("SHA-256", seed);
  const scid = toBase64Url(new Uint8Array(digest));
  return `did:scid:${fmt}:${version}:${scid}`;
}

export function didScidUrlWithSrc(
  didScid: string,
  originOrDomain: string
): string {
  const origin = originOrDomain.includes("://")
    ? originOrDomain
    : `https://${originOrDomain}`;
  const src = `${origin.replace(/\/$/, "")}/.well-known/did.json`;
  return `${didScid}?src=${encodeURIComponent(src)}`;
}

export async function buildDidDocument(params: {
  nip05: string;
  jwk: Secp256k1Jwk;
  mirrors?: string[]; // e.g., ["https://www.satnam.pub", "https://mirror.example"]
}): Promise<DidDocument> {
  const { nip05, jwk } = params;
  const mirrors = (params.mirrors || []).map((s) =>
    s.includes("://") ? s : `https://${s}`
  );

  // 1) Verify NIP-05 against nostr.json
  const { username, domain } = parseNip05(nip05);
  const nostrJsonUrl = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(
    username
  )}`;
  const res = await fetch(nostrJsonUrl, { method: "GET" });
  if (!res.ok) {
    throw new Error(
      `NIP-05 verification failed: nostr.json not found for ${nip05}`
    );
  }
  const nostrData: { names?: Record<string, string> } = await res.json();
  const expectedHex = nostrData?.names?.[username];
  if (!expectedHex) {
    throw new Error(
      `NIP-05 verification failed: username not present in nostr.json`
    );
  }
  // Compare JWK.x (base64url) to nostr x-only hex
  const jwkXHex = bytesToHex(base64urlToBytes(jwk.x));
  if (jwkXHex.toLowerCase() !== expectedHex.toLowerCase()) {
    throw new Error(
      `NIP-05 verification failed: JWK.x does not match nostr.json pubkey`
    );
  }

  // 2) Compute did:scid bound to NIP-05 + JWK thumbprint
  const didScid = await didScidFromJwkAndNip05("ke", 1, jwk, nip05);

  // 3) Build DID Document (controller = did:web:<domain>)
  const controller = `did:web:${domain}`;
  const did = controller; // using did:web as primary id
  const vmId = `${did}#0`;

  const alsoKnownAs: string[] = [
    `acct:${nip05}`,
    didScid,
    didScidUrlWithSrc(didScid, `https://${domain}`),
    // Cross-reference nostr.json used for verification
    `${nostrJsonUrl}`,
    ...mirrors.map((m) => didScidUrlWithSrc(didScid, m)),
  ];

  return {
    id: did,
    alsoKnownAs,
    verificationMethod: [
      {
        id: vmId,
        type: "JsonWebKey2020",
        controller: did,
        publicKeyJwk: jwk,
      },
    ],
    assertionMethod: [vmId],
    authentication: [vmId],
  };
}
