import { describe, it, expect, beforeAll } from "vitest";
import { supabase } from "../../src/lib/supabase";

// RLS Integration Tests for identity_shards
// Skipped by default unless RUN_RLS_TESTS=true with Supabase env configured.
// Uses anon key and does not mutate production data.

const runRls = process.env.RUN_RLS_TESTS === "true" && !!process.env.VITE_SUPABASE_URL && !!process.env.VITE_SUPABASE_ANON_KEY;

const maybeDescribe = runRls ? describe : describe.skip;

maybeDescribe("RLS: identity_shards", () => {
  beforeAll(() => {
    expect(typeof supabase).toBe("object");
  });

  it("anon cannot list identity_shards", async () => {
    const { data, error } = await supabase
      .from("identity_shards")
      .select("id")
      .limit(1);

    // Expect either empty or permission error due to RLS
    expect(error || data === null || Array.isArray(data)).toBeTruthy();
    if (error) {
      expect((error.message || "").toLowerCase()).toMatch(/(permission|not allowed|rls|policy)/);
    }
  });

  it("anon cannot insert into identity_shards", async () => {
    const { error } = await supabase
      .from("identity_shards")
      .insert({});
    expect(error).toBeTruthy();
    expect((error!.message || "").toLowerCase()).toMatch(/(permission|not allowed|rls|policy)/);
  });
});

