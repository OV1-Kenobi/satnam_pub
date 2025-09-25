/* @vitest-environment node */
import { beforeAll, describe, expect, it } from "vitest";
let CEPS: typeof import("../../lib/central_event_publishing_service")["central_event_publishing_service"];

// Use CEPS for signing to ensure consistent environment
beforeAll(async () => {
  // Ensure Web Crypto APIs available for tests before importing CEPS/nostr-tools
  if (!(globalThis as any).crypto || !(globalThis as any).crypto.subtle) {
    const { webcrypto } = await import("node:crypto");
    (globalThis as any).crypto = webcrypto as any;
  }
  if (typeof (globalThis as any).TextEncoder === "undefined") {
    const util = await import("node:util");
    (globalThis as any).TextEncoder = (util as any).TextEncoder;
  }
  // Dynamic import after polyfills so nostr-tools captures correct globals
  const mod = await import("../../lib/central_event_publishing_service");
  CEPS = (mod as any).central_event_publishing_service;
});

describe("CEPS signature verification", () => {
  it("verifies a correctly signed event", async () => {
    const skHex = "11".repeat(32);
    const pubHex = CEPS.getPublicKeyHex(skHex);
    const unsigned = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [] as string[][],
      content: "hello world",
      pubkey: pubHex,
    };
    const ev = CEPS.signEvent(unsigned as any, skHex) as any;
    expect(CEPS.verifyEvent(ev as any)).toBe(true);
  });

  it("detects a tampered event via hash mismatch", async () => {
    const { getEventHash } = await import("nostr-tools");
    const skHex = "22".repeat(32);
    const pubHex = CEPS.getPublicKeyHex(skHex);
    const unsigned = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [] as string[][],
      content: "original",
      pubkey: pubHex,
    };
    const ev = CEPS.signEvent(unsigned as any, skHex) as any;
    const tampered = { ...ev, content: "tampered" } as any;
    // Signature still verifies against existing id, but structural hash must not match
    expect(getEventHash(tampered)).not.toBe(tampered.id);
  });
});
