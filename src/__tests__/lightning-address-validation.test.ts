import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We will import the util under test fresh per test to pick up env/mocks
const importUtils = async () => {
  const mod = await import("../utils/lightning-address");
  return mod;
};

const setFlag = (value: boolean) => {
  (import.meta as any).env = {
    ...(import.meta as any).env,
    VITE_USE_ALBY_LIGHTNING_TOOLS: String(value),
  };
};

// Simple fetch mock helper
const mockFetchOnce = (ok: boolean, body: any) => {
  globalThis.fetch = vi
    .fn()
    .mockResolvedValue({ ok, json: vi.fn().mockResolvedValue(body) } as any);
};

// Reset between tests
beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("lightning-address utils", () => {
  it("parseLightningAddress validates and parses correctly", async () => {
    const { parseLightningAddress } = await importUtils();
    expect(parseLightningAddress("alice@example.com")).toEqual({
      local: "alice",
      domain: "example.com",
    });
    expect(parseLightningAddress("Alice@Example.Com")).toEqual({
      local: "Alice",
      domain: "example.com",
    });
    expect(parseLightningAddress("bad@domain")).toBeNull();
    expect(parseLightningAddress("not-an-address")).toBeNull();
  });

  it("toLnurlpUrl converts LUD-16 to LNURL-pay endpoint", async () => {
    const { toLnurlpUrl } = await importUtils();
    expect(toLnurlpUrl("alice@example.com")).toBe(
      "https://example.com/.well-known/lnurlp/alice"
    );
    expect(toLnurlpUrl("bad@domain")).toBeNull();
  });

  it("isLightningAddressReachable returns true when Lightning Tools succeeds (proxy disabled)", async () => {
    setFlag(true);
    const ctorArgs: any[] = [];
    vi.mock("@getalby/lightning-tools/lnurl", () => ({
      default: undefined,
      LightningAddress: class {
        addr: string;
        opts: any;
        lnurlpData: any;
        constructor(address: string, opts?: any) {
          this.addr = address;
          this.opts = opts;
          ctorArgs.push({ address, opts });
          this.lnurlpData = null;
        }
        async fetch() {
          this.lnurlpData = {
            tag: "payRequest",
            callback: "https://example.com/cb",
          };
        }
      },
    }));

    const { isLightningAddressReachable } = await importUtils();
    const ok = await isLightningAddressReachable("alice@example.com");
    expect(ctorArgs.length).toBeGreaterThan(0);
    expect(ok).toBe(true);
    expect(ctorArgs[0].opts?.proxy).toBe(false);
  });

  it("falls back to direct fetch when Lightning Tools throws", async () => {
    setFlag(true);
    vi.mock("@getalby/lightning-tools/lnurl", () => ({
      default: undefined,
      LightningAddress: class {
        async fetch() {
          throw new Error("network");
        }
      },
    }));
    mockFetchOnce(true, {
      tag: "payRequest",
      callback: "https://example.com/cb",
    });

    const { isLightningAddressReachable } = await importUtils();
    await expect(isLightningAddressReachable("bob@example.com")).resolves.toBe(
      true
    );
  });

  it("returns false when both Lightning Tools and direct fetch fail", async () => {
    setFlag(true);
    vi.mock("@getalby/lightning-tools/lnurl", () => ({
      default: undefined,
      LightningAddress: class {
        async fetch() {
          /* no data set */
        }
      },
    }));
    // fallback fetch fails
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("cors")) as any;

    const { isLightningAddressReachable } = await importUtils();
    await expect(
      isLightningAddressReachable("charlie@example.com")
    ).resolves.toBe(false);
  });

  it("returns false for malformed addresses", async () => {
    const { isLightningAddressReachable } = await importUtils();
    await expect(isLightningAddressReachable("bad@domain")).resolves.toBe(
      false
    );
    await expect(isLightningAddressReachable("not-an-address")).resolves.toBe(
      false
    );
  });

  it("works with feature flag disabled (direct fetch only)", async () => {
    setFlag(false);
    mockFetchOnce(true, {
      tag: "payRequest",
      callback: "https://example.com/cb",
    });
    const { isLightningAddressReachable } = await importUtils();
    await expect(isLightningAddressReachable("dora@example.com")).resolves.toBe(
      true
    );
  });
});
