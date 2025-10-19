import { beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityShardingService } from "../../src/lib/up/identity-sharding";

// Minimal mock for FrostPolynomialManager to keep unit tests fast
vi.mock("../../src/lib/frost/polynomial", () => {
  return {
    FrostPolynomialManager: {
      async generatePolynomial(secretHex: string, threshold: number) {
        return { coefficients: [secretHex], threshold } as any;
      },
      async generateShares(_poly: any, n: number) {
        return Array.from({ length: n }).map((_, i) => ({
          index: i + 1,
          y: `share_${i + 1}`,
        }));
      },
    },
  };
});

function createSupabaseMock() {
  const state: any = {
    identities: new Map<
      string,
      { role: string; family_federation_id?: string }
    >(),
    identityShards: [] as any[],
  };

  const from = vi.fn((table: string) => {
    const api: any = {
      _filters: {} as any,
      select: vi.fn(function (_cols: string) {
        return api;
      }),
      eq: vi.fn(function (col: string, val: any) {
        api._filters[col] = val;
        return api;
      }),
      single: vi.fn(async function () {
        if (table === "user_identities") {
          const id = api._filters.id;
          const row = state.identities.get(id);
          if (row) return { data: row, error: null };
          return { data: null, error: { message: "not found" } };
        }
        return { data: null, error: { message: "not supported" } };
      }),
      maybeSingle: vi.fn(async function () {
        return { data: null, error: null };
      }),
      insert: vi.fn(async function (rows: any[]) {
        if (table === "identity_shards") {
          state.identityShards.push(...rows);
          return { error: null };
        }
        return { error: { message: "insert not supported" } };
      }),
    };
    return api;
  });

  (from as any).state = state;
  return { from } as any;
}

describe("IdentityShardingService", () => {
  let client: any;
  let svc: IdentityShardingService;

  beforeEach(() => {
    client = createSupabaseMock();
    svc = new IdentityShardingService(client);

    // Seed users
    (client.from as any).state.identities.set("userF", {
      role: "steward",
      family_federation_id: "fed-1",
      user_salt: "test-user-salt-123",
    });
    (client.from as any).state.identities.set("privUser", {
      role: "private",
      user_salt: "priv-salt",
    });
  });

  it("validates threshold bounds (1 ≤ t ≤ n)", async () => {
    await expect(
      svc.createIdentityShards("userF", ["g1", "g2"], 0)
    ).rejects.toThrow(/Invalid threshold/);
    await expect(
      svc.createIdentityShards("userF", ["g1", "g2"], 3)
    ).rejects.toThrow(/Invalid threshold/);
  });

  it("rejects when no guardians provided", async () => {
    await expect(svc.createIdentityShards("userF", [], 1)).rejects.toThrow(
      /No guardians/
    );
  });

  it("creates shards when valid and stores them", async () => {
    const res = await svc.createIdentityShards("userF", ["g1", "g2", "g3"], 2);
    expect(res.total).toBe(3);
    expect(res.threshold).toBe(2);
    const rows = (client.from as any).state.identityShards;
    expect(rows.length).toBe(3);
    expect(rows[0]).toMatchObject({
      user_id: "userF",
      guardian_id: "g1",
      shard_index: 1,
    });
    // Encrypted shard should be Noble V2 compact format and not plaintext
    expect(typeof rows[0].encrypted_shard).toBe("string");
    expect(rows[0].encrypted_shard.startsWith("noble-v2.")).toBe(true);
    expect(rows[0].encrypted_shard.includes("share_1")).toBe(false);
  });

  it("throws guard error for individual/private user", async () => {
    await expect(
      svc.createIdentityShards("privUser", ["g1"], 1)
    ).rejects.toThrow(/Federation-only operation/);
  });
});
