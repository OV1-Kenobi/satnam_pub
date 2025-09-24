import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

function makeEvent(nip05: string) {
  return {
    httpMethod: "GET",
    headers: { "x-forwarded-for": "127.0.0.1" },
    queryStringParameters: { nip05 },
  } as any;
}

describe("nip05-resolver function", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("resolves valid NIP-05 with did:scid and mirrors; issuer status active", async () => {
    const nip05 = "user@example.com";
    const didJsonUrl = "https://example.com/.well-known/did.json";
    const didScid = "did:scid:ke:1:SCIDVALUE";

    // Mock fetch for did.json
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        if (String(url) === didJsonUrl) {
          return {
            ok: true,
            json: async () => ({
              id: "did:web:example.com",
              alsoKnownAs: [
                `acct:${nip05}`,
                `${didScid}?src=${didJsonUrl}`,
                `${didScid}?src=https://mirror.example/.well-known/did.json`,
              ],
            }),
          } as any;
        }
        return { ok: false } as any;
      })
    );

    // Mock Supabase client
    const supabasePath = path.resolve(
      process.cwd(),
      "netlify/functions_active/supabase.js"
    );
    await vi.doMock(supabasePath, () => {
      return {
        getRequestClient: () => ({
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { status: "active" },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
    });

    const { handler: nip05Resolver } = await import(
      "../netlify/functions_active/nip05-resolver.ts"
    );
    const res = await nip05Resolver(makeEvent(nip05));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.didScid).toBe(didScid);
    expect(body.data.mirrors).toContain(didJsonUrl);
    expect(body.data.issuerRegistryStatus).toBe("active");
  });

  it("returns 404 when did.json missing/invalid", async () => {
    const nip05 = "user@missing.com";
    const didJsonUrl = "https://missing.com/.well-known/did.json";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        if (String(url) === didJsonUrl) {
          return { ok: false } as any;
        }
        return { ok: false } as any;
      })
    );

    const { handler: nip05Resolver } = await import(
      "../netlify/functions_active/nip05-resolver.ts"
    );
    const res = await nip05Resolver(makeEvent(nip05));
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/did\.json not found/i);
  });

  it("issuer registry lookup missing returns null status", async () => {
    const nip05 = "user@example.org";
    const didJsonUrl = "https://example.org/.well-known/did.json";
    const didScid = "did:scid:ke:1:OTHER";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        if (String(url) === didJsonUrl) {
          return {
            ok: true,
            json: async () => ({
              id: "did:web:example.org",
              alsoKnownAs: [`acct:${nip05}`, `${didScid}?src=${didJsonUrl}`],
            }),
          } as any;
        }
        return { ok: false } as any;
      })
    );

    const supabasePath2 = path.resolve(
      process.cwd(),
      "netlify/functions_active/supabase.js"
    );
    await vi.doMock(supabasePath2, () => {
      return {
        getRequestClient: () => ({
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      };
    });

    const { handler: nip05Resolver } = await import(
      "../netlify/functions_active/nip05-resolver.ts"
    );
    const res = await nip05Resolver(makeEvent(nip05));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.issuerRegistryStatus).toBeNull();
  });
});
