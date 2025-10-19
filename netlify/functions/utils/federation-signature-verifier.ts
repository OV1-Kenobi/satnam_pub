/*
 * Federation Response Signature Verifier
 * Scope: Cross-instance federation API responses ONLY (NOT individual/private users)
 * Federation-only operation. Individual users use self-sovereign recovery.
 */

import { ed25519 } from "@noble/curves/ed25519";
import { webcrypto } from "node:crypto"; // Static import (Netlify Functions require static imports)
import type { FederationRole } from "../../../src/types/auth";

export interface VerificationResult {
  ok: boolean;
  error?: string;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return out;
}

function getHeader(
  headers: Headers | Record<string, string>,
  key: string
): string | null {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(key);
  }
  const rec = headers as Record<string, string>;
  const found = Object.keys(rec).find(
    (k) => k.toLowerCase() === key.toLowerCase()
  );
  return found ? rec[found] : null;
}

/**
 * Verify Ed25519 signature on HTTP response payload
 * - Verifies X-Signature (hex, 128 chars)
 * - Verifies X-Signature-Timestamp (±1h tolerance, max +5m future)
 * - X-Key-Id optional (logged for rotation)
 * - Message = SHA-256(rawBody)
 * - Guard: throws if contextRole === 'private'
 */
export async function verifyFederationResponsePayload(
  body: Uint8Array,
  headers: Headers | Record<string, string>,
  publicKeyHex: string,
  contextRole: FederationRole,
  opts?: { now?: number }
): Promise<VerificationResult> {
  if (contextRole === "private") {
    throw new Error(
      "Federation-only operation: individual/private users must use self-sovereign flows"
    );
  }

  try {
    const sigHex = getHeader(headers, "X-Signature") || "";
    const tsStr = getHeader(headers, "X-Signature-Timestamp") || "";
    const keyId = getHeader(headers, "X-Key-Id") || undefined; // optional

    if (!sigHex || !tsStr) {
      return { ok: false, error: "Missing required signature headers" };
    }
    if (!/^[0-9a-fA-F]{128}$/.test(sigHex)) {
      return { ok: false, error: "Malformed signature format" };
    }

    const ts = Number(tsStr);
    const now = Math.floor(
      opts?.now !== undefined ? opts.now : Date.now() / 1000
    );
    if (!Number.isInteger(ts)) {
      return { ok: false, error: "Invalid timestamp" };
    }
    // Replay/skew window: not older than 1h; not more than +5m future
    if (ts < now - 3600) {
      return { ok: false, error: "Expired signature (replay window exceeded)" };
    }
    if (ts > now + 300) {
      return { ok: false, error: "Future timestamp beyond tolerance" };
    }

    // Compute SHA-256 of raw body bytes
    const hashBuf = await webcrypto.subtle.digest("SHA-256", body);
    const toVerify = new Uint8Array(hashBuf);

    // Convert inputs
    const signature = fromHex(sigHex);
    const publicKey = fromHex(publicKeyHex);

    // Ed25519 verify
    const ok = ed25519.verify(signature, toVerify, publicKey);
    if (!ok) {
      return { ok: false, error: "Signature verification failed" };
    }

    // Optional: log key id without exposing sensitive payload
    if (keyId) {
      // eslint-disable-next-line no-console
      console.log("[FederationVerifier] Verified with key id:", keyId);
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    // eslint-disable-next-line no-console
    console.error("[FederationVerifier] Error:", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Convenience wrapper for WHATWG Response objects
 */
export async function verifyFederationResponse(
  res: Response,
  publicKeyHex: string,
  contextRole: FederationRole,
  opts?: { now?: number }
): Promise<VerificationResult> {
  const bodyBuf = new Uint8Array(await res.clone().arrayBuffer());
  return verifyFederationResponsePayload(
    bodyBuf,
    res.headers,
    publicKeyHex,
    contextRole,
    opts
  );
}

export function sha256Hex(data: Uint8Array): Promise<string> {
  return webcrypto.subtle
    .digest("SHA-256", data)
    .then((buf) => toHex(new Uint8Array(buf)));
}
