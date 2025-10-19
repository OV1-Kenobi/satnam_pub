import { ed25519 } from "@noble/curves/ed25519";
import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyFederationResponsePayload } from "../../netlify/functions/utils/federation-signature-verifier";
import type { FederationRole } from "../../src/types/auth";

function headers(rec: Record<string, string>) {
  // Simple Headers-like shim for tests
  return {
    get: (k: string) => rec[k] ?? rec[k.toLowerCase()] ?? null,
  } as any;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = await webcrypto.subtle.digest("SHA-256", data);
  return new Uint8Array(buf);
}

describe("Federation signature verifier", () => {
  let sk: Uint8Array;
  let pk: Uint8Array;
  let pkHex: string;

  beforeAll(() => {
    // Generate private key using Web Crypto random bytes for compatibility
    sk = new Uint8Array(32);
    webcrypto.getRandomValues(sk);
    pk = ed25519.getPublicKey(sk);
    pkHex = hex(pk);
  });

  it("verifies a valid signature (success)", async () => {
    const body = new TextEncoder().encode('{"ok":true}');
    const digest = await sha256(body);
    const sig = ed25519.sign(digest, sk);

    const res = await verifyFederationResponsePayload(
      body,
      headers({
        "X-Signature": hex(sig),
        "X-Signature-Timestamp": String(Math.floor(Date.now() / 1000)),
        "X-Key-Id": "key-1",
      }),
      pkHex,
      "steward" as FederationRole
    );
    expect(res.ok).toBe(true);
  });

  it("rejects invalid signature", async () => {
    const body = new TextEncoder().encode("data");
    const res = await verifyFederationResponsePayload(
      body,
      headers({
        "X-Signature": "00".repeat(64), // wrong sig over different payload
        "X-Signature-Timestamp": String(Math.floor(Date.now() / 1000)),
      }),
      pkHex,
      "guardian"
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(
      /Signature verification failed|Malformed|Invalid/
    );
  });

  it("prevents replay with expired timestamp", async () => {
    const body = new TextEncoder().encode("x");
    const digest = await sha256(body);
    const sig = ed25519.sign(digest, sk);
    const now = Math.floor(Date.now() / 1000);
    const res = await verifyFederationResponsePayload(
      body,
      headers({
        "X-Signature": hex(sig),
        "X-Signature-Timestamp": String(now - 3600 - 1), // beyond 1h window
      }),
      pkHex,
      "adult",
      { now: now }
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Expired/);
  });

  it("accepts timestamps within ±1h skew", async () => {
    const body = new TextEncoder().encode("y");
    const digest = await sha256(body);
    const sig = ed25519.sign(digest, sk);
    const now = Math.floor(Date.now() / 1000);

    const withinPast = await verifyFederationResponsePayload(
      body,
      headers({
        "X-Signature": hex(sig),
        "X-Signature-Timestamp": String(now - 3599),
      }),
      pkHex,
      "steward",
      { now }
    );
    expect(withinPast.ok).toBe(true);

    const withinFuture = await verifyFederationResponsePayload(
      body,
      headers({
        "X-Signature": hex(sig),
        "X-Signature-Timestamp": String(now + 299),
      }),
      pkHex,
      "steward",
      { now }
    );
    expect(withinFuture.ok).toBe(true);
  });

  it("rejects timestamps >5 minutes in future", async () => {
    const body = new TextEncoder().encode("z");
    const digest = await sha256(body);
    const sig = ed25519.sign(digest, sk);
    const now = Math.floor(Date.now() / 1000);

    const res = await verifyFederationResponsePayload(
      body,
      headers({
        "X-Signature": hex(sig),
        "X-Signature-Timestamp": String(now + 301),
      }),
      pkHex,
      "guardian",
      { now }
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Future timestamp/);
  });

  it("rejects malformed signature format", async () => {
    const body = new TextEncoder().encode("a");
    const res = await verifyFederationResponsePayload(
      body,
      headers({
        "X-Signature": "not-hex",
        "X-Signature-Timestamp": String(Math.floor(Date.now() / 1000)),
      }),
      pkHex,
      "guardian"
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Malformed/);
  });

  it("rejects missing required headers", async () => {
    const body = new TextEncoder().encode("b");
    const res = await verifyFederationResponsePayload(
      body,
      headers({}),
      pkHex,
      "steward"
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Missing required/);
  });

  it("throws for individual/private user context", async () => {
    const body = new TextEncoder().encode("c");
    await expect(
      verifyFederationResponsePayload(
        body,
        headers({
          "X-Signature": "00".repeat(64),
          "X-Signature-Timestamp": String(Math.floor(Date.now() / 1000)),
        }),
        pkHex,
        "private" as FederationRole
      )
    ).rejects.toThrow(/Federation-only operation/);
  });

  it("accepts missing X-Key-Id header (optional)", async () => {
    const body = new TextEncoder().encode("ok");
    const digest = await sha256(body);
    const sig = ed25519.sign(digest, sk);
    const res = await verifyFederationResponsePayload(
      body,
      headers({
        "X-Signature": hex(sig),
        "X-Signature-Timestamp": String(Math.floor(Date.now() / 1000)),
      }),
      pkHex,
      "guardian"
    );
    expect(res.ok).toBe(true);
  });

  it("rejects non-integer timestamp", async () => {
    const body = new TextEncoder().encode("bad-ts");
    const digest = await sha256(body);
    const sig = ed25519.sign(digest, sk);
    const res = await verifyFederationResponsePayload(
      body,
      headers({
        "X-Signature": hex(sig),
        "X-Signature-Timestamp": "not-a-number",
      }),
      pkHex,
      "steward"
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Invalid timestamp/);
  });
});
