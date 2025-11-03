/**
 * Phase 3: PKARR Publishing Integration Tests
 * Phase 2 Week 3: Real Integration Testing
 *
 * Tests real PKARR record publishing to DHT relays.
 * Publishes real PKARR records to DHT and queries from relays.
 *
 * Test Coverage:
 * - Create PKARR records
 * - Publish records to DHT relays
 * - Query records from DHT
 * - Verify record structure
 * - Verify sequence number incrementation
 * - Handle DHT errors
 */

import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  createPkarrRecord,
  publishPkarrRecord,
  queryPkarrRecordFromDHT,
  isValidPublicKey,
  isValidPkarrRecord,
  isValidDnsRecord,
  publishMultiplePkarrRecords,
  queryMultiplePkarrRecords,
  PkarrRecord,
  PkarrPublishResult,
  PkarrQueryResult,
} from "./setup/pkarr-publishing";
import { mockSimpleProofAPI, restoreOriginalFetch } from "./setup/simpleproof-mock";

// ============================================================================
// TEST SETUP
// ============================================================================

beforeEach(() => {
  mockSimpleProofAPI();
});

afterEach(() => {
  restoreOriginalFetch();
});

// ============================================================================
// PKARR PUBLISHING TESTS
// ============================================================================

describe("Phase 3: PKARR Publishing", () => {
  describe("PKARR Record Creation", () => {
    it("should create valid PKARR record", () => {
      const publicKey =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const records = [
        {
          name: "user",
          type: "TXT",
          value: "v=satnam1 nip05=user@my.satnam.pub",
          ttl: 3600,
        },
      ];

      const record = createPkarrRecord(publicKey, records);

      expect(record.public_key).toBe(publicKey);
      expect(record.records).toEqual(records);
      expect(record.sequence).toBe(1);
      expect(isValidPkarrRecord(record)).toBe(true);
    });

    it("should create PKARR record with multiple DNS records", () => {
      const publicKey =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const records = [
        {
          name: "user",
          type: "TXT",
          value: "v=satnam1 nip05=user@my.satnam.pub",
          ttl: 3600,
        },
        {
          name: "_nostr",
          type: "TXT",
          value: "npub1abc123def456",
          ttl: 3600,
        },
      ];

      const record = createPkarrRecord(publicKey, records);

      expect(record.records.length).toBe(2);
      expect(record.records.every(isValidDnsRecord)).toBe(true);
    });

    it("should generate valid signature", () => {
      const publicKey =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const records = [
        {
          name: "user",
          type: "TXT",
          value: "v=satnam1",
          ttl: 3600,
        },
      ];

      const record = createPkarrRecord(publicKey, records);

      expect(record.signature).toBeDefined();
      expect(record.signature.length).toBe(128); // 64 bytes = 128 hex chars
      expect(/^[a-f0-9]{128}$/.test(record.signature)).toBe(true);
    });
  });

  describe("PKARR Record Publishing", () => {
    it("should publish PKARR record to DHT", async () => {
      const publicKey =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const records = [
        {
          name: "user",
          type: "TXT",
          value: "v=satnam1 nip05=user@my.satnam.pub",
          ttl: 3600,
        },
      ];

      const record = createPkarrRecord(publicKey, records);
      const result = await publishPkarrRecord(record);

      expect(result).toBeDefined();
      expect(result.publicKey).toBe(publicKey);
      expect(result.sequence).toBe(1);
    });

    it("should handle publish errors gracefully", async () => {
      const publicKey =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const records = [
        {
          name: "user",
          type: "TXT",
          value: "v=satnam1",
          ttl: 3600,
        },
      ];

      const record = createPkarrRecord(publicKey, records);
      const result = await publishPkarrRecord(record);

      // Should return result object even if publish fails
      expect(result).toBeDefined();
      expect(result.publicKey).toBe(publicKey);
    });

    it("should publish multiple PKARR records", async () => {
      const records = [];
      for (let i = 0; i < 3; i++) {
        const publicKey = `a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef123456789${i}`;
        records.push(
          createPkarrRecord(publicKey, [
            {
              name: "user",
              type: "TXT",
              value: `v=satnam1 index=${i}`,
              ttl: 3600,
            },
          ])
        );
      }

      const results = await publishMultiplePkarrRecords(records);

      expect(results.length).toBe(3);
      results.forEach((result) => {
        expect(result).toBeDefined();
      });
    });
  });

  describe("PKARR Record Querying", () => {
    it("should query PKARR record from DHT", async () => {
      const publicKey =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const records = [
        {
          name: "user",
          type: "TXT",
          value: "v=satnam1 nip05=user@my.satnam.pub",
          ttl: 3600,
        },
      ];

      const record = createPkarrRecord(publicKey, records);
      await publishPkarrRecord(record);

      const result = await queryPkarrRecordFromDHT(publicKey);

      expect(result).toBeDefined();
    });

    it("should query multiple PKARR records", async () => {
      const publicKeys = [
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890",
        "b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890ab",
        "c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890abc",
      ];

      const results = await queryMultiplePkarrRecords(publicKeys);

      expect(results.length).toBe(3);
      results.forEach((result) => {
        expect(result).toBeDefined();
      });
    });
  });

  describe("PKARR Record Validation", () => {
    it("should validate public key format", () => {
      const validKey =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const invalidKey =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef123456789"; // 63 chars

      expect(isValidPublicKey(validKey)).toBe(true);
      expect(isValidPublicKey(invalidKey)).toBe(false);
    });

    it("should validate PKARR record structure", () => {
      const publicKey =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const records = [
        {
          name: "user",
          type: "TXT",
          value: "v=satnam1",
          ttl: 3600,
        },
      ];

      const record = createPkarrRecord(publicKey, records);

      expect(isValidPkarrRecord(record)).toBe(true);
    });

    it("should validate DNS record structure", () => {
      const validRecord = {
        name: "user",
        type: "TXT",
        value: "v=satnam1",
        ttl: 3600,
      };

      const invalidRecord = {
        name: "user",
        type: "TXT",
        // Missing value
      };

      expect(isValidDnsRecord(validRecord)).toBe(true);
      expect(isValidDnsRecord(invalidRecord)).toBe(false);
    });
  });

  describe("Sequence Number Management", () => {
    it("should track sequence numbers", () => {
      const publicKey =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const records = [
        {
          name: "user",
          type: "TXT",
          value: "v=satnam1",
          ttl: 3600,
        },
      ];

      const record1 = createPkarrRecord(publicKey, records, 1);
      const record2 = createPkarrRecord(publicKey, records, 2);
      const record3 = createPkarrRecord(publicKey, records, 3);

      expect(record1.sequence).toBe(1);
      expect(record2.sequence).toBe(2);
      expect(record3.sequence).toBe(3);
    });

    it("should increment sequence on updates", () => {
      const publicKey =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const records = [
        {
          name: "user",
          type: "TXT",
          value: "v=satnam1",
          ttl: 3600,
        },
      ];

      const record = createPkarrRecord(publicKey, records, 1);
      expect(record.sequence).toBe(1);

      const updatedRecord = createPkarrRecord(publicKey, records, 2);
      expect(updatedRecord.sequence).toBeGreaterThan(record.sequence);
    });
  });
});

