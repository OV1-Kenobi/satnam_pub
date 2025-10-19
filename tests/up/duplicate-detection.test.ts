import { beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicateDetectionService } from "../../src/lib/up/duplicate-detection";

function createSupabaseMock() {
  const state: any = {
    identities: new Map<
      string,
      { role: string; family_federation_id?: string }
    >(),
    familyMembers: new Map<
      string,
      Array<{ user_duid: string; family_role: string; is_active: boolean }>
    >(),
    votes: [] as Array<{
      suspected_duplicate_user_id: string;
      original_user_id: string;
      voting_guardian_id: string;
      vote: string;
      evidence?: string;
    }>,
    identityShards: [] as any[],
  };

  const from = vi.fn((table: string) => {
    const api: any = {
      _filters: {} as Record<string, any>,
      select(this: any, _cols: string) {
        return this;
      },
      eq(this: any, col: string, val: any) {
        this._filters[col] = val;
        return this;
      },
      limit(this: any, _n?: number) {
        return this;
      },
      async single() {
        if (table === "user_identities") {
          const id = (this as any)._filters.id;
          const row = state.identities.get(id);
          if (row) return { data: row, error: null };
          return { data: null, error: { message: "not found" } };
        }
        return { data: null, error: { message: "not supported" } };
      },
      async maybeSingle() {
        if (table === "family_members") {
          const uid = (this as any)._filters.user_duid;
          const isActive = (this as any)._filters.is_active;
          for (const [, members] of state.familyMembers) {
            const row = members.find(
              (m) => m.user_duid === uid && (isActive ? m.is_active : true)
            );
            if (row)
              return {
                data: {
                  family_federation_id: "fed-1",
                  family_role: row.family_role,
                },
                error: null,
              };
          }
          return { data: null, error: null };
        }
        return { data: null, error: null };
      },
      async insert(rows: any[]) {
        if (table === "duplicate_detection_votes") {
          state.votes.push(...rows);
          return { error: null };
        }
        if (table === "identity_shards") {
          state.identityShards.push(...rows);
          return { error: null };
        }
        return { error: { message: "insert not supported" } };
      },
      then(this: any, resolve: any) {
        if (table === "family_members") {
          const fedId = (this as any)._filters["family_federation_id"];
          const role = (this as any)._filters["family_role"];
          const active = (this as any)._filters["is_active"];
          const members = state.familyMembers.get(fedId) || [];
          const data = members
            .filter(
              (m) =>
                (!role || m.family_role === role) && (!active || m.is_active)
            )
            .map((m) => ({ user_duid: m.user_duid }));
          return Promise.resolve(resolve({ data, error: null }));
        }
        if (table === "duplicate_detection_votes") {
          const suspectedId = (this as any)._filters[
            "suspected_duplicate_user_id"
          ];
          const data = state.votes
            .filter((v) => v.suspected_duplicate_user_id === suspectedId)
            .map((v) => ({ vote: v.vote }));

          return Promise.resolve(resolve({ data, error: null }));
        }
        return Promise.resolve(resolve({ data: null, error: null }));
      },
    };
    return api;
  });

  (from as any).state = state;
  return { from } as any;
}

describe("DuplicateDetectionService", () => {
  let client: any;
  let svc: DuplicateDetectionService;

  beforeEach(() => {
    client = createSupabaseMock();
    svc = new DuplicateDetectionService(client);

    // Seed identities
    (client.from as any).state.identities.set("userA", {
      role: "steward",
      family_federation_id: "fed-1",
    });
    (client.from as any).state.identities.set("userB", {
      role: "adult",
      family_federation_id: "fed-1",
    });
    (client.from as any).state.identities.set("privUser", { role: "private" });

    // Seed guardians in family_members
    (client.from as any).state.familyMembers.set("fed-1", [
      { user_duid: "g1", family_role: "guardian", is_active: true },
      { user_duid: "g2", family_role: "guardian", is_active: true },
      { user_duid: "x3", family_role: "adult", is_active: true },
    ]);
  });

  it("initiateDuplicateVote creates records for all guardians", async () => {
    await svc.initiateDuplicateVote("userA", "userB", "evidence");
    const votes = (client.from as any).state.votes;
    const guardians = votes.map((v: any) => v.voting_guardian_id);
    expect(guardians.sort()).toEqual(["g1", "g2"].sort());
  });

  it("checkDuplicateConsensus handles null/empty vote data", async () => {
    const result = await svc.checkDuplicateConsensus("userA");
    expect(result.isDuplicate).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("checkDuplicateConsensus calculates correct confidence", async () => {
    await svc.initiateDuplicateVote("userA", "userB", "evidence");
    // Simulate two votes
    (client.from as any).state.votes.push(
      {
        suspected_duplicate_user_id: "userA",
        original_user_id: "userB",
        voting_guardian_id: "g1",
        vote: "duplicate",
      },
      {
        suspected_duplicate_user_id: "userA",
        original_user_id: "userB",
        voting_guardian_id: "g2",
        vote: "not_duplicate",
      }
    );
    const result = await svc.checkDuplicateConsensus("userA", 2);
    expect(result.isDuplicate).toBe(false);
    expect(result.confidence).toBeCloseTo(0.5);
  });

  it("returns isDuplicate=true when threshold met", async () => {
    await svc.initiateDuplicateVote("userA", "userB", "evidence");
    (client.from as any).state.votes.push(
      {
        suspected_duplicate_user_id: "userA",
        original_user_id: "userB",
        voting_guardian_id: "g1",
        vote: "duplicate",
      },
      {
        suspected_duplicate_user_id: "userA",
        original_user_id: "userB",
        voting_guardian_id: "g2",
        vote: "duplicate",
      }
    );
    const result = await svc.checkDuplicateConsensus("userA", 2);
    expect(result.isDuplicate).toBe(true);
    expect(result.confidence).toBeCloseTo(1);
  });

  it("returns isDuplicate=false when threshold not met", async () => {
    await svc.initiateDuplicateVote("userA", "userB", "evidence");
    (client.from as any).state.votes.push(
      {
        suspected_duplicate_user_id: "userA",
        original_user_id: "userB",
        voting_guardian_id: "g1",
        vote: "duplicate",
      },
      {
        suspected_duplicate_user_id: "userA",
        original_user_id: "userB",
        voting_guardian_id: "g2",
        vote: "not_duplicate",
      }
    );
    const result = await svc.checkDuplicateConsensus("userA", 2);
    expect(result.isDuplicate).toBe(false);
  });

  it("rejects individual/private users (guard)", async () => {
    await expect(
      svc.initiateDuplicateVote("privUser", "userB", "e")
    ).rejects.toThrow(/Federation-only operation/);
    await expect(svc.checkDuplicateConsensus("privUser")).rejects.toThrow(
      /Federation-only operation/
    );
  });
});
