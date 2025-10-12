import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub out bolt11 to avoid requiring the real dependency for these tests
vi.mock("bolt11", () => ({
  decode: vi.fn(),
}));

// We dynamically import the SUT after setting up mocks so that mocked
// dependencies are applied at module evaluation time.

describe("generateLightningAddress", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("throws when domain resolution fails (null|undefined|empty)", async () => {
    const cases: Array<null | undefined | ""> = [null, undefined, ""];

    for (const ret of cases) {
      vi.doMock("../src/config/domain.client", () => ({
        resolvePlatformLightningDomain: () => ret as any,
      }));

      const mod = await import("../lib/lightning");

      expect(() => mod.generateLightningAddress("user")).toThrowError(
        "Failed to resolve platform Lightning domain"
      );

      // Prepare for next loop iteration
      vi.resetModules();
    }
  });

  it("throws when final address validation fails", async () => {
    // Provide a domain that yields an invalid Lightning address under the validator regex
    vi.doMock("../src/config/domain.client", () => ({
      resolvePlatformLightningDomain: () => "localhost", // no TLD -> invalid per regex
    }));

    const mod = await import("../lib/lightning");

    expect(() => mod.generateLightningAddress("alice")).toThrowError(
      "Generated Lightning address is invalid"
    );
  });

  it("returns the address on success", async () => {
    vi.doMock("../src/config/domain.client", () => ({
      resolvePlatformLightningDomain: () => "my.satnam.pub",
    }));

    const mod = await import("../lib/lightning");

    const spy = vi.spyOn(mod, "validateLightningAddress").mockReturnValue(true);

    const addr = mod.generateLightningAddress("testuser");
    expect(addr).toBe("testuser@my.satnam.pub");

    spy.mockRestore();
  });
});
