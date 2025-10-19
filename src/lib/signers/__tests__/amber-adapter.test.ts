import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AmberAdapter } from "../../signers/amber-adapter";

// Minimal CEPS mock used by adapter
vi.mock("../../../../lib/central_event_publishing_service", () => ({
  central_event_publishing_service: {
    verifyEvent: vi.fn().mockResolvedValue(true),
  },
}));

const setAndroidUA = () => {
  Object.defineProperty(window.navigator, "userAgent", {
    value:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0 Mobile",
    configurable: true,
  });
};

const setNonAndroidUA = () => {
  Object.defineProperty(window.navigator, "userAgent", {
    value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit",
    configurable: true,
  });
};

function b64url(json: any) {
  const s = JSON.stringify(json);
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

describe("AmberAdapter - NIP-55 NONCE validation", () => {
  beforeEach(() => {
    // default strict on
    (process as any).env = {
      ...(process as any).env,
      VITE_AMBER_STRICT_NIP55_VALIDATION: "true",
    };
    setAndroidUA();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects callback with missing/mismatched NONCE", async () => {
    const adapter = new AmberAdapter();

    const wait = (adapter as any).nip55AwaitCallback("rid", 200, "nonce-ok");

    // wrong nonce
    (adapter as any).nip55HandleCallbackParams(
      new URLSearchParams({
        id: "rid",
        ok: "1",
        result: b64url({ pubkey: "abcd" }),
        nonce: "bad",
      })
    );

    await expect(wait).rejects.toThrow(/Invalid or missing NONCE/i);
  });

  it("resolves callback when NONCE matches", async () => {
    const adapter = new AmberAdapter();

    const wait = (adapter as any).nip55AwaitCallback("rid", 200, "nonce-ok");

    (adapter as any).nip55HandleCallbackParams(
      new URLSearchParams({
        id: "rid",
        ok: "1",
        result: b64url({ pubkey: "abcd" }),
        nonce: "nonce-ok",
      })
    );

    await expect(wait).resolves.toEqual({ pubkey: "abcd" });
  });
});

describe("AmberAdapter - platform checks", () => {
  it("connect() throws on non-Android platform", async () => {
    setNonAndroidUA();
    (process as any).env = {
      ...(process as any).env,
      VITE_ENABLE_AMBER_SIGNING: "true",
    };
    const adapter = new AmberAdapter();
    await expect(adapter.connect?.()).rejects.toThrow(
      /only available on Android/i
    );
  });
});
