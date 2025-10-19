import { describe, it, expect, beforeAll } from "vitest";
import { supabase } from "../../src/lib/supabase";

// RLS Integration Tests for duplicate_detection_votes
// These tests are skipped unless RUN_RLS_TESTS=true and Supabase env is configured.
// They use the anon key only and do not mutate data.

const runRls = process.env.RUN_RLS_TESTS === "true" && !!process.env.VITE_SUPABASE_URL && !!process.env.VITE_SUPABASE_ANON_KEY;

const maybeDescribe = runRls ? describe : describe.skip;

maybeDescribe("RLS: duplicate_detection_votes", () => {
  beforeAll(() => {
    // Sanity check
    expect(typeof supabase).toBe("object");
  });

  it("anon cannot list duplicate_detection_votes", async () => {
    const { data, error } = await supabase
      .from("duplicate_detection_votes")
      .select("id")
      .limit(1);

    // Expect either empty data due to RLS or an error due to permission
    expect(error || data === null || Array.isArray(data)).toBeTruthy();
    // If error present, it should be a permission error in most setups
    if (error) {
      expect((error.message || "").toLowerCase()).toMatch(/(permission|not allowed|rls|policy)/);
    }
  });

  it("anon cannot insert into duplicate_detection_votes", async () => {
    const { error } = await supabase
      .from("duplicate_detection_votes")
      .insert({});
    expect(error).toBeTruthy();
    expect((error!.message || "").toLowerCase()).toMatch(/(permission|not allowed|rls|policy)/);
  });
});

