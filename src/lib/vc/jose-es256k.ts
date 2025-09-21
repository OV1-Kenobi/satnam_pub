/*
 * VC-JWT (ES256K) skeleton helpers using jose.
 * NOTE: Keep zero-knowledge: call these only where private key material is already
 * under user control (ClientSessionVault or NIP-07). Do not persist private keys.
 */

import type { JWTPayload, JWK } from "jose";
import { importJWK, SignJWT, jwtVerify } from "jose";

export type VcJwtHeader = {
  alg: "ES256K";
  typ?: "JWT" | string;
  kid?: string;
};

export async function signJwtEs256k(payload: JWTPayload, privateJwk: JWK, kid?: string): Promise<string> {
  const key = await importJWK(privateJwk, "ES256K");
  const now = Math.floor(Date.now() / 1000);
  const signer = new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256K", typ: "JWT", ...(kid ? { kid } : {}) })
    .setIssuedAt(now);
  return await signer.sign(key);
}

export async function verifyJwtEs256k<T = JWTPayload>(token: string, publicJwk: JWK): Promise<{ payload: T }>{
  const key = await importJWK(publicJwk, "ES256K");
  const { payload } = await jwtVerify(token, key, { algorithms: ["ES256K"] });
  return { payload: payload as T };
}

// Convenience: build a minimal VC-JWT style payload (holder/subject are the same for self-issued)
export function buildSelfIssuedVcPayload(params: {
  subDid: string;
  issuerDid: string; // often same as subDid for self-issued
  vc: Record<string, unknown>; // conforming to VC DM 2.0
  nbf?: number;
  exp?: number;
}): JWTPayload {
  const { subDid, issuerDid, vc, nbf, exp } = params;
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: issuerDid,
    sub: subDid,
    nbf: nbf ?? now,
    iat: now,
    ...(typeof exp === "number" ? { exp } : {}),
    vc,
  } as JWTPayload;
}

