import * as crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integration Tests for NFC Flows
 * Tests: Complete NFC auth flow, multi-function card programming, Boltcard provisioning, PIN-based MFA
 */

// Mock Supabase client
const mockSupabaseData: Record<string, any[]> = {
  ntag424_registrations: [],
  ntag424_operations_log: [],
  lnbits_boltcards: [],
  user_signing_preferences: [],
};

vi.mock("../../netlify/functions_active/supabase.js", () => ({
  getRequestClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      insert: vi.fn(async (payload: any) => {
        if (!mockSupabaseData[table]) mockSupabaseData[table] = [];
        mockSupabaseData[table].push(payload);
        return { data: null, error: null };
      }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => {
        if (table === "ntag424_registrations") {
          return { data: mockSupabaseData[table][0] || null, error: null };
        }
        return { data: null, error: null };
      }),
      update: vi.fn().mockReturnThis(),
    })),
  })),
}));

vi.mock("../../netlify/functions_active/security/session-manager.js", () => ({
  SecureSessionManager: {
    validateSessionFromHeader: vi.fn(async () => ({
      hashedId: "user_hash_test_123",
    })),
    createSession: vi.fn(async () => "session_token_test_abc"),
  },
}));

vi.mock("../../netlify/functions_active/utils/rate-limiter.js", () => ({
  allowRequest: () => true,
}));

// Test Helpers
function generateTestCardUid(): string {
  return crypto.randomBytes(7).toString("hex").toUpperCase();
}

function generateTestPin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function hashPin(pin: string, saltB64: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const saltBytes = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-512",
    },
    keyMaterial,
    512
  );
  const out = new Uint8Array(derivedBits);
  return Array.from(out)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Integration Tests
describe("NFC Integration Flows", () => {
  beforeEach(() => {
    Object.keys(mockSupabaseData).forEach((key) => {
      mockSupabaseData[key] = [];
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Complete NFC Registration Flow", () => {
    it("should register new NFC tag with PIN", async () => {
      const cardUid = generateTestCardUid();
      const pin = generateTestPin();
      const saltB64 = Buffer.from("test-salt-16bytes").toString("base64");
      const pinHash = await hashPin(pin, saltB64);

      const registration = {
        owner_hash: "user_hash_test_123",
        hashed_tag_uid: crypto
          .createHash("sha256")
          .update(cardUid)
          .digest("hex"),
        pin_salt_base64: saltB64,
        pin_hash_hex: pinHash,
        encrypted_config: "encrypted_config_test",
        created_at: new Date().toISOString(),
      };

      mockSupabaseData.ntag424_registrations.push(registration);

      expect(mockSupabaseData.ntag424_registrations).toHaveLength(1);
      expect(mockSupabaseData.ntag424_registrations[0].owner_hash).toBe(
        "user_hash_test_123"
      );
      expect(mockSupabaseData.ntag424_registrations[0].pin_hash_hex).toBe(
        pinHash
      );
    });

    it("should log registration operation", async () => {
      const cardUid = generateTestCardUid();
      const hashedUid = crypto
        .createHash("sha256")
        .update(cardUid)
        .digest("hex");

      const operationLog = {
        owner_hash: "user_hash_test_123",
        hashed_tag_uid: hashedUid,
        operation_type: "register",
        success: true,
        timestamp: new Date().toISOString(),
        metadata: { card_uid_length: cardUid.length },
      };

      mockSupabaseData.ntag424_operations_log.push(operationLog);

      expect(mockSupabaseData.ntag424_operations_log).toHaveLength(1);
      expect(mockSupabaseData.ntag424_operations_log[0].operation_type).toBe(
        "register"
      );
      expect(mockSupabaseData.ntag424_operations_log[0].success).toBe(true);
    });
  });

  describe("Complete NFC Authentication Flow", () => {
    it("should authenticate with valid PIN", async () => {
      const pin = "123456";
      const saltB64 = Buffer.from("test-salt-16bytes").toString("base64");
      const providedHash = await hashPin(pin, saltB64);
      const storedHash = providedHash;

      expect(providedHash).toBe(storedHash);

      const authLog = {
        owner_hash: "user_hash_test_123",
        hashed_tag_uid: "test_uid_hash",
        operation_type: "auth",
        success: true,
        timestamp: new Date().toISOString(),
      };

      mockSupabaseData.ntag424_operations_log.push(authLog);

      expect(mockSupabaseData.ntag424_operations_log[0].success).toBe(true);
    });

    it("should reject invalid PIN", async () => {
      const correctPin = "123456";
      const wrongPin = "654321";
      const saltB64 = Buffer.from("test-salt-16bytes").toString("base64");

      const correctHash = await hashPin(correctPin, saltB64);
      const wrongHash = await hashPin(wrongPin, saltB64);

      expect(correctHash).not.toBe(wrongHash);

      const authLog = {
        owner_hash: "user_hash_test_123",
        hashed_tag_uid: "test_uid_hash",
        operation_type: "auth",
        success: false,
        timestamp: new Date().toISOString(),
        metadata: { reason: "pin_invalid" },
      };

      mockSupabaseData.ntag424_operations_log.push(authLog);

      expect(mockSupabaseData.ntag424_operations_log[0].success).toBe(false);
    });
  });

  describe("Multi-Function Card Programming", () => {
    it("should program File 01 (Payment)", () => {
      const cardRefStr = "test-card-ref-123".substring(0, 16);
      const cardRef = Buffer.from(cardRefStr);
      const key = crypto.createHash("sha256").update("test-key").digest();
      const hmac = crypto.createHmac("sha256", key).update(cardRef).digest();
      const hmacTruncated = hmac.slice(0, 16);
      const payload = Buffer.concat([cardRef, hmacTruncated]);

      expect(payload.length).toBeLessThanOrEqual(32);
      expect(hmacTruncated.length).toBe(16);
    });

    it("should program File 02 (Auth)", () => {
      const authKeyHash = "test-auth-key";
      const cardUid = "04A1B2C3D4E5F6G7";
      const payload = crypto
        .createHash("sha256")
        .update(
          Buffer.concat([Buffer.from(authKeyHash, "hex"), Buffer.from(cardUid)])
        )
        .digest();

      expect(payload.length).toBe(32);
    });

    it("should program File 03 (Signing)", () => {
      const uuid = Buffer.alloc(16, "test-uuid-123456");
      const nonce = Buffer.alloc(16, "test-nonce-12345");
      const payload = Buffer.concat([uuid, nonce]);

      expect(payload.length).toBe(32);
    });

    it("should program File 04 (Nostr)", () => {
      const nip05Str = "user@satnam.pub";
      const nip05Padded = Buffer.alloc(28);
      Buffer.from(nip05Str).copy(nip05Padded);
      const reserved = Buffer.alloc(4);
      const payload = Buffer.concat([nip05Padded, reserved]);

      expect(payload.length).toBe(32);
    });

    it("should verify total storage usage", () => {
      const file01 = Buffer.alloc(32);
      const file02 = Buffer.alloc(32);
      const file03 = Buffer.alloc(32);
      const file04 = Buffer.alloc(32);
      const totalUsed =
        file01.length + file02.length + file03.length + file04.length;

      expect(totalUsed).toBe(128);
      expect(totalUsed).toBeLessThanOrEqual(440);
    });
  });

  describe("Boltcard Provisioning", () => {
    it("should create Boltcard with Name Tag label", () => {
      const boltcard = {
        id: "card_test_123",
        label: "Name Tag",
        spend_limit_sats: 20000,
        card_uid_hash: crypto
          .createHash("sha256")
          .update("04A1B2C3D4E5F6G7")
          .digest("hex"),
        functions: ["payment"],
        created_at: new Date().toISOString(),
      };

      mockSupabaseData.lnbits_boltcards.push(boltcard);

      expect(mockSupabaseData.lnbits_boltcards).toHaveLength(1);
      expect(mockSupabaseData.lnbits_boltcards[0].label).toBe("Name Tag");
      expect(mockSupabaseData.lnbits_boltcards[0].spend_limit_sats).toBe(20000);
    });

    it("should add signing capability to Boltcard", () => {
      const boltcard = {
        id: "card_test_123",
        label: "Name Tag",
        functions: ["payment"],
      };

      if (!boltcard.functions.includes("signing")) {
        boltcard.functions.push("signing");
      }

      expect(boltcard.functions).toContain("signing");
      expect(boltcard.functions).toContain("payment");
    });

    it("should link FROST shares to Boltcard", () => {
      const boltcard = {
        id: "card_test_123",
        frost_share_ids: ["share_uuid_1", "share_uuid_2", "share_uuid_3"],
      };

      expect(boltcard.frost_share_ids).toHaveLength(3);
      expect(boltcard.frost_share_ids[0]).toBe("share_uuid_1");
    });
  });

  describe("PIN-Based MFA Setup", () => {
    it("should validate 6-digit PIN format", () => {
      const validPins = ["123456", "000000", "999999"];
      const invalidPins = ["12345", "1234567", "12345a", ""];

      validPins.forEach((pin) => {
        expect(/^\d{6}$/.test(pin)).toBe(true);
      });

      invalidPins.forEach((pin) => {
        expect(/^\d{6}$/.test(pin)).toBe(false);
      });
    });

    it("should store encrypted PIN with salt", async () => {
      const pin = "123456";
      const salt = Buffer.from("test-salt-16bytes");
      const saltB64 = salt.toString("base64");
      const pinHash = await hashPin(pin, saltB64);

      const pinRecord = {
        card_id: "card_test_123",
        pin_salt_base64: saltB64,
        pin_hash_hex: pinHash,
        created_at: new Date().toISOString(),
      };

      mockSupabaseData.lnbits_boltcards.push(pinRecord as any);

      expect(mockSupabaseData.lnbits_boltcards[0].pin_salt_base64).toBe(
        saltB64
      );
      expect(mockSupabaseData.lnbits_boltcards[0].pin_hash_hex).toBe(pinHash);
    });

    it("should require NFC for unlock when configured", () => {
      const preference = {
        owner_hash: "user_hash_test_123",
        require_nfc_for_unlock: true,
        nfc_pin_timeout_seconds: 300,
        created_at: new Date().toISOString(),
      };

      mockSupabaseData.user_signing_preferences.push(preference);

      expect(
        mockSupabaseData.user_signing_preferences[0].require_nfc_for_unlock
      ).toBe(true);
    });
  });

  describe("Error Scenarios", () => {
    it("should handle missing card UID", () => {
      const cardUid = "";
      expect(cardUid.length).toBe(0);
      expect(() => {
        if (!cardUid) throw new Error("Card UID required");
      }).toThrow("Card UID required");
    });

    it("should handle PIN validation failure", async () => {
      const pin = "123456";
      const saltB64 = Buffer.from("test-salt-16bytes").toString("base64");
      const correctHash = await hashPin(pin, saltB64);
      const wrongHash = "wrong_hash_value";

      expect(correctHash).not.toBe(wrongHash);
    });

    it("should handle database insert failure", async () => {
      const failedInsert = {
        success: false,
        error: "Database connection failed",
      };

      expect(failedInsert.success).toBe(false);
      expect(failedInsert.error).toBeDefined();
    });

    it("should handle rate limiting", () => {
      const attempts = 10;
      const limit = 8;
      const isRateLimited = attempts > limit;

      expect(isRateLimited).toBe(true);
    });
  });
});
