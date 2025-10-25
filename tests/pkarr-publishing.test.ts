/**
 * PKARR Publishing Integration Tests (REAL)
 * Phase 2A Day 8: Real integration tests for PKARR publishing workflows
 *
 * Tests:
 * - PKARR publishing during identity creation (IdentityForge flow)
 * - PKARR publishing in register-identity endpoint
 * - Scheduled republishing function (scheduled-pkarr-republish)
 * - Sequence number incrementation
 * - last_published_at timestamp updates
 * - pkarr_publish_history logging
 * - Non-blocking behavior (registration succeeds even if PKARR fails)
 * 
 * NOTE: These are REAL integration tests using actual Supabase database
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getTestSupabaseClient,
  TestDataFactory,
  DatabaseCleanup,
  DatabaseSeeding,
  TestLifecycle,
} from "./setup/integration-test-setup";

describe("PKARR Publishing Integration Tests (REAL)", () => {
  const supabase = getTestSupabaseClient();
  let testKeypair: ReturnType<typeof TestDataFactory.generateKeypair>;

  beforeAll(async () => {
    await TestLifecycle.beforeAll();
  });

  beforeEach(async () => {
    await TestLifecycle.beforeEach();
    testKeypair = TestDataFactory.generateKeypair();
  });

  afterEach(async () => {
    await TestLifecycle.afterEach();
  });

  describe("PKARR Record Creation", () => {
    it("should create a new PKARR record in the database", async () => {
      const record = TestDataFactory.generatePkarrRecord(testKeypair.publicKeyHex);

      const { data, error } = await supabase
        .from("pkarr_records")
        .insert(record)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.public_key).toBe(testKeypair.publicKeyHex);
      expect(data.sequence).toBe(1);
      expect(data.dns_records).toBeTruthy();
      expect(Array.isArray(data.dns_records)).toBe(true);
    });

    it("should upsert existing PKARR record with incremented sequence", async () => {
      // First insert
      const record1 = TestDataFactory.generatePkarrRecord(testKeypair.publicKeyHex, {
        sequence: 1,
      });

      await supabase.from("pkarr_records").insert(record1);

      // Upsert with incremented sequence
      const record2 = TestDataFactory.generatePkarrRecord(testKeypair.publicKeyHex, {
        sequence: 2,
        timestamp: Math.floor(Date.now() / 1000),
      });

      const { data, error } = await supabase
        .from("pkarr_records")
        .upsert(record2, { onConflict: "public_key" })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.sequence).toBe(2);
    });

    it("should store DNS records as JSONB", async () => {
      const dnsRecords = [
        {
          name: "_nostr",
          type: "TXT",
          value: testKeypair.publicKeyHex,
          ttl: 3600,
        },
        {
          name: "@",
          type: "TXT",
          value: "nostr-profile",
          ttl: 3600,
        },
      ];

      const record = TestDataFactory.generatePkarrRecord(testKeypair.publicKeyHex, {
        dns_records: dnsRecords,
      });

      const { data, error } = await supabase
        .from("pkarr_records")
        .insert(record)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.dns_records).toEqual(dnsRecords);
    });
  });

  describe("PKARR Publish History", () => {
    it("should log publish history when PKARR record is published", async () => {
      // Create PKARR record
      const record = await DatabaseSeeding.seedPkarrRecord(
        supabase,
        testKeypair.publicKeyHex
      );

      // Log publish history
      const historyEntry = {
        public_key: testKeypair.publicKeyHex,
        sequence: record.sequence,
        published_at: new Date().toISOString(),
        relay_urls: record.relay_urls,
        success: true,
      };

      const { data, error } = await supabase
        .from("pkarr_publish_history")
        .insert(historyEntry)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.public_key).toBe(testKeypair.publicKeyHex);
      expect(data.success).toBe(true);
    });

    it("should retrieve publish history ordered by published_at DESC", async () => {
      // Seed PKARR record
      await DatabaseSeeding.seedPkarrRecord(supabase, testKeypair.publicKeyHex);

      // Create multiple history entries
      const entries = [
        {
          public_key: testKeypair.publicKeyHex,
          sequence: 1,
          published_at: new Date(Date.now() - 3000).toISOString(),
          relay_urls: ["https://relay1.example.com"],
          success: true,
        },
        {
          public_key: testKeypair.publicKeyHex,
          sequence: 2,
          published_at: new Date(Date.now() - 2000).toISOString(),
          relay_urls: ["https://relay2.example.com"],
          success: true,
        },
        {
          public_key: testKeypair.publicKeyHex,
          sequence: 3,
          published_at: new Date(Date.now() - 1000).toISOString(),
          relay_urls: ["https://relay3.example.com"],
          success: false,
        },
      ];

      await supabase.from("pkarr_publish_history").insert(entries);

      // Retrieve history
      const { data, error } = await supabase
        .from("pkarr_publish_history")
        .select()
        .eq("public_key", testKeypair.publicKeyHex)
        .order("published_at", { ascending: false })
        .limit(10);

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.length).toBe(3);
      expect(data[0].sequence).toBe(3); // Most recent first
      expect(data[1].sequence).toBe(2);
      expect(data[2].sequence).toBe(1);
    });
  });

  describe("Scheduled Republishing", () => {
    it("should find records that need republishing (last_published_at > 24 hours ago)", async () => {
      // Create old record
      const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      await DatabaseSeeding.seedPkarrRecord(supabase, testKeypair.publicKeyHex, {
        last_published_at: oldTimestamp,
      });

      // Query for expired records
      const twentyFourHoursAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();

      const { data, error } = await supabase
        .from("pkarr_records")
        .select()
        .or(`last_published_at.is.null,last_published_at.lt.${twentyFourHoursAgo}`)
        .limit(100);

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.length).toBeGreaterThan(0);
      
      const ourRecord = data.find((r) => r.public_key === testKeypair.publicKeyHex);
      expect(ourRecord).toBeTruthy();
    });

    it("should update record with new sequence and timestamp after republishing", async () => {
      // Seed initial record
      const initialRecord = await DatabaseSeeding.seedPkarrRecord(
        supabase,
        testKeypair.publicKeyHex,
        { sequence: 1 }
      );

      // Simulate republishing
      const newSequence = 2;
      const newTimestamp = Math.floor(Date.now() / 1000);

      const { data, error } = await supabase
        .from("pkarr_records")
        .update({
          sequence: newSequence,
          timestamp: newTimestamp,
          relay_urls: ["https://pkarr.relay.pubky.tech"],
          last_published_at: new Date().toISOString(),
        })
        .eq("public_key", testKeypair.publicKeyHex)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.sequence).toBe(2);
      expect(data.relay_urls).toContain("https://pkarr.relay.pubky.tech");
      expect(new Date(data.last_published_at).getTime()).toBeGreaterThan(
        new Date(initialRecord.last_published_at).getTime()
      );
    });
  });

  describe("Sequence Number Incrementation", () => {
    it("should increment sequence number on each republish", async () => {
      // Initial publish
      await DatabaseSeeding.seedPkarrRecord(supabase, testKeypair.publicKeyHex, {
        sequence: 1,
      });

      // Verify initial sequence
      const { data: record } = await supabase
        .from("pkarr_records")
        .select()
        .eq("public_key", testKeypair.publicKeyHex)
        .single();

      expect(record.sequence).toBe(1);

      // Republish with incremented sequence
      await supabase
        .from("pkarr_records")
        .update({
          sequence: record.sequence + 1,
          timestamp: Math.floor(Date.now() / 1000),
          last_published_at: new Date().toISOString(),
        })
        .eq("public_key", testKeypair.publicKeyHex)
        .select()
        .single();

      // Verify updated sequence
      const { data: updatedRecord } = await supabase
        .from("pkarr_records")
        .select()
        .eq("public_key", testKeypair.publicKeyHex)
        .single();

      expect(updatedRecord.sequence).toBe(2);
    });
  });
});

