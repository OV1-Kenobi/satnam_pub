import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

function makeEvent(body: any) {
  return {
    httpMethod: "POST",
    headers: { "x-forwarded-for": "127.0.0.1" },
    path: "/.netlify/functions/nfc-resolver/vp-verify",
    body: JSON.stringify(body),
  } as any;
}

describe("nfc-resolver vp-verify", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("verifies acct mapping + JWK match + issuer status via primary did.json", async () => {
    const nip05 = "user@example.com";
    const primary = "https://example.com/.well-known/did.json";
    const nostrJson = "https://example.com/.well-known/nostr.json?name=user";
    const didScid = "did:scid:ke:1:ABC";
    const jwk = { kty: "EC", crv: "secp256k1", x: "Xx", y: "Yy" };

    // Mock fetch for did.json and nostr.json
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        const s = String(url);
        if (s === primary) {
          return {
            ok: true,
            json: async () => ({
              id: "did:web:example.com",
              alsoKnownAs: [
                `acct:${nip05}`,
                `${didScid}?src=${primary}`,
              ],
              verificationMethod: [
                { id: "#0", type: "JsonWebKey2020", controller: "did:web:example.com", publicKeyJwk: jwk },
              ],
            }),
          } as any;
        }
        if (s === nostrJson) {
          return {
            ok: true,
            json: async () => ({ names: { user: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789" } }),
          } as any;
        }
        return { ok: false } as any;
      })
    );

    // Mock Supabase client
    const supabasePath = path.resolve(process.cwd(), "netlify/functions_active/supabase.js");
    await vi.doMock(supabasePath, () => {
      return {
        getRequestClient: () => ({
          from: () => ({
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { status: "active" } }) }),
            }),
          }),
        }),
      };
    });

    const { handler } = await import("../../netlify/functions_active/nfc-resolver.ts");
    const res = await handler(makeEvent({ nip05, holderPublicJwk: jwk }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.nip05Verified).toBe(true);
    expect(body.data.didDocumentVerified).toBe(true);
    expect(body.data.didScid).toBe(didScid);
    expect(body.data.mirrorsValidated).toContain(primary);
    expect(body.data.issuerRegistryStatus).toBe("active");
  });

  it("fails when did.json missing acct mapping and no mirrors", async () => {
    const nip05 = "user@missing.com";
    const primary = "https://missing.com/.well-known/did.json";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        if (String(url) === primary) return { ok: true, json: async () => ({ alsoKnownAs: [] }) } as any;
        return { ok: false } as any;
      })
    );

    const { handler } = await import("../../netlify/functions_active/nfc-resolver.ts");
    const res = await handler(makeEvent({ nip05, holderPublicJwk: { kty: "EC", crv: "secp256k1", x: "x", y: "y" } }));
    expect(res.statusCode).toBe(404);
  });

  it("uses mirror did.json when primary fails", async () => {
    const nip05 = "user@mirror.org";
    const primary = "https://mirror.org/.well-known/did.json";
    const mirror = "https://cdn.mirror.org/did.json";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        const s = String(url);
        if (s === primary) return { ok: false } as any;
        if (s === mirror) {
          return {
            ok: true,
            json: async () => ({
              alsoKnownAs: [`acct:${nip05}`, "did:scid:ke:1:XYZ?src=" + mirror],
              verificationMethod: [{ publicKeyJwk: { kty: "EC", crv: "secp256k1", x: "x", y: "y" } }],
            }),
          } as any;
        }
        if (s.startsWith("https://mirror.org/.well-known/nostr.json")) return { ok: true, json: async () => ({ names: { user: "a".repeat(64) } }) } as any;
        return { ok: false } as any;
      })
    );

    const { handler } = await import("../../netlify/functions_active/nfc-resolver.ts");
    const res = await handler(
      makeEvent({ nip05, holderPublicJwk: { kty: "EC", crv: "secp256k1", x: "x", y: "y" }, didJsonUrls: [mirror] })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.mirrorsValidated).toContain(mirror);
    expect(body.data.didDocumentVerified).toBe(true);
  });

  it("returns didDocumentVerified=false when JWK mismatches and no did:scid present", async () => {
    const nip05 = "user@badkeys.net";
    const primary = "https://badkeys.net/.well-known/did.json";

    vi.stubGlobal("fetch", vi.fn(async (url: any) => {
      if (String(url) === primary) {
        return { ok: true, json: async () => ({ alsoKnownAs: [ `acct:${nip05}` ], verificationMethod: [{ publicKeyJwk: { kty: "EC", crv: "secp256k1", x: "X1", y: "Y1" } }] }) } as any;
      }
      if (String(url).startsWith("https://badkeys.net/.well-known/nostr.json")) return { ok: true, json: async () => ({ names: { user: "b".repeat(64) } }) } as any;
      return { ok: false } as any;
    }));

    const { handler } = await import("../../netlify/functions_active/nfc-resolver.ts");
    const res = await handler(makeEvent({ nip05, holderPublicJwk: { kty: "EC", crv: "secp256k1", x: "X2", y: "Y2" } }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.didDocumentVerified).toBe(false);
  });
});

