import { afterEach, describe, expect, it, vi } from "vitest";
import { Nip07Adapter } from "../../signers/nip07-adapter";

describe("NIP-07 adapter", () => {
  afterEach(() => {
    (window as any).nostr = undefined;
  });

  it("getStatus returns unavailable when window.nostr is undefined", async () => {
    (window as any).nostr = undefined;
    const adapter = new Nip07Adapter();
    await expect(adapter.getStatus()).resolves.toBe("unavailable");
  });

  it("available/connected flows", async () => {
    const pk = "abc123";
    (window as any).nostr = {
      getPublicKey: vi.fn().mockResolvedValue(pk),
      signEvent: vi
        .fn()
        .mockImplementation((ev: any) =>
          Promise.resolve({ ...ev, id: "id", sig: "sig", pubkey: pk })
        ),
    };

    const adapter = new Nip07Adapter();
    await expect(adapter.getStatus()).resolves.toBe("available");

    await expect(adapter.connect?.()).resolves.toBeUndefined();
    await expect(adapter.getStatus()).resolves.toBe("connected");
  });

  it("connect() propagates extension errors", async () => {
    (window as any).nostr = {
      getPublicKey: vi.fn().mockRejectedValue(new Error("ext failed")),
    };
    const adapter = new Nip07Adapter();
    await expect(adapter.connect?.()).rejects.toThrow(/ext failed/i);
  });
});
