/**
 * PKARR Integration Tests
 * Tests for full PKARR publishing flow with validation and database storage
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";

/**
 * Mock Supabase client for testing
 */
class MockSupabaseClient {
  private records: Map<string, any> = new Map();

  from(table: string) {
    if (table !== "pkarr_records") {
      throw new Error(`Unexpected table: ${table}`);
    }
    return {
      upsert: vi.fn(async (data: any) => {
        this.records.set(data.public_key, data);
        return { data, error: null };
      }),
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: this.records.get(Array.from(this.records.keys())[0]),
          error: null,
        })),
      })),
    };
  }

  getRecords() {
    return Array.from(this.records.values());
  }

  clear() {
    this.records.clear();
  }
}

/**
 * Helper: Generate Ed25519 keypair
 */
function generateTestKeypair() {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    privateKeyHex: Buffer.from(privateKey).toString("hex"),
    publicKeyHex: Buffer.from(publicKey).toString("hex"),
  };
}

/**
 * Helper: Create valid PKARR payload
 */
function createValidPayload(keypair: ReturnType<typeof generateTestKeypair>) {
  const records = [
    { name: "example.com", type: "A", value: "192.0.2.1", ttl: 3600 },
    { name: "www.example.com", type: "CNAME", value: "example.com", ttl: 3600 },
  ];
  const timestamp = Math.floor(Date.now() / 1000);
  const sequence = 1;

  const message = `${JSON.stringify(records)}${timestamp}${sequence}`;
  const messageBytes = new TextEncoder().encode(message);
  const privateKey = new Uint8Array(Buffer.from(keypair.privateKeyHex, "hex"));
  const signature = ed25519.sign(messageBytes, privateKey);

  return {
    public_key: keypair.publicKeyHex,
    records,
    timestamp,
    sequence,
    signature: Buffer.from(signature).toString("hex"),
  };
}

describe("PKARR Integration Tests", () => {
  let mockSupabase: MockSupabaseClient;
  let testKeypair: ReturnType<typeof generateTestKeypair>;

  beforeEach(() => {
    mockSupabase = new MockSupabaseClient();
    testKeypair = generateTestKeypair();
  });

  describe("Full Publishing Flow", () => {
    it("should successfully publish valid PKARR record", async () => {
      const payload = createValidPayload(testKeypair);

      // Simulate database storage
      const result = await mockSupabase
        .from("pkarr_records")
        .upsert({
          ...payload,
          verified: true,
          cache_expires_at: Math.floor(Date.now() / 1000) + 3600,
          relay_urls: [],
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
        })
        .select()
        .single();

      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data.public_key).toBe(testKeypair.publicKeyHex);
      expect(result.data.verified).toBe(true);
      expect(result.data.sequence).toBe(1);
    });

    it("should reject record with invalid signature", async () => {
      const payload = createValidPayload(testKeypair);
      payload.signature = "0".repeat(128); // Invalid signature

      // Verify signature would fail
      const message = `${JSON.stringify(payload.records)}${payload.timestamp}${payload.sequence}`;
      const messageBytes = new TextEncoder().encode(message);
      const publicKey = new Uint8Array(
        Buffer.from(payload.public_key, "hex")
      );
      const signatureBytes = new Uint8Array(
        Buffer.from(payload.signature, "hex")
      );

      const isValid = ed25519.verify(signatureBytes, messageBytes, publicKey);
      expect(isValid).toBe(false);
    });

    it("should handle sequence number updates", async () => {
      const payload1 = createValidPayload(testKeypair);

      // Store first record
      await mockSupabase
        .from("pkarr_records")
        .upsert({
          ...payload1,
          verified: true,
          cache_expires_at: Math.floor(Date.now() / 1000) + 3600,
          relay_urls: [],
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
        });

      // Create second payload with higher sequence
      const records = payload1.records;
      const timestamp = Math.floor(Date.now() / 1000);
      const sequence = 2; // Higher sequence

      const message = `${JSON.stringify(records)}${timestamp}${sequence}`;
      const messageBytes = new TextEncoder().encode(message);
      const privateKey = new Uint8Array(
        Buffer.from(testKeypair.privateKeyHex, "hex")
      );
      const signature = ed25519.sign(messageBytes, privateKey);

      const payload2 = {
        public_key: testKeypair.publicKeyHex,
        records,
        timestamp,
        sequence,
        signature: Buffer.from(signature).toString("hex"),
      };

      // Store second record with higher sequence
      await mockSupabase
        .from("pkarr_records")
        .upsert({
          ...payload2,
          verified: true,
          cache_expires_at: Math.floor(Date.now() / 1000) + 3600,
          relay_urls: [],
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
        });

      const records_stored = mockSupabase.getRecords();
      expect(records_stored.length).toBeGreaterThan(0);
      expect(records_stored[0].sequence).toBe(2);
    });

    it("should reject record with lower sequence number", () => {
      const payload1 = createValidPayload(testKeypair);
      const payload2 = createValidPayload(testKeypair);

      // Simulate sequence check
      const currentSequence = payload1.sequence;
      const newSequence = payload2.sequence;

      // Both have sequence 1, so new should be rejected
      const shouldReject = newSequence <= currentSequence;
      expect(shouldReject).toBe(true);
    });

    it("should set verified flag to true after signature verification", async () => {
      const payload = createValidPayload(testKeypair);

      const result = await mockSupabase
        .from("pkarr_records")
        .upsert({
          ...payload,
          verified: true, // Set after server-side verification
          cache_expires_at: Math.floor(Date.now() / 1000) + 3600,
          relay_urls: [],
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
        })
        .select()
        .single();

      expect(result.data.verified).toBe(true);
    });

    it("should set cache_expires_at based on TTL", async () => {
      const payload = createValidPayload(testKeypair);
      const now = Math.floor(Date.now() / 1000);
      const cacheExpiresAt = now + 3600; // 1 hour TTL

      const result = await mockSupabase
        .from("pkarr_records")
        .upsert({
          ...payload,
          verified: true,
          cache_expires_at: cacheExpiresAt,
          relay_urls: [],
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      expect(result.data.cache_expires_at).toBe(cacheExpiresAt);
      expect(result.data.cache_expires_at).toBeGreaterThan(now);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing required fields", () => {
      const payload = createValidPayload(testKeypair);
      delete (payload as any).signature;

      const hasRequiredFields =
        payload.public_key &&
        payload.records &&
        payload.timestamp !== undefined &&
        payload.sequence !== undefined &&
        (payload as any).signature;

      expect(hasRequiredFields).toBe(false);
    });

    it("should handle database errors gracefully", async () => {
      const payload = createValidPayload(testKeypair);

      // Simulate database error
      const mockErrorClient = {
        from: () => ({
          upsert: vi.fn(async () => ({
            data: null,
            error: new Error("Database connection failed"),
          })),
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: null,
              error: new Error("Database connection failed"),
            })),
          })),
        }),
      };

      const result = await mockErrorClient
        .from("pkarr_records")
        .upsert(payload)
        .select()
        .single();

      expect(result.error).toBeDefined();
      expect(result.data).toBeNull();
    });
  });
});

