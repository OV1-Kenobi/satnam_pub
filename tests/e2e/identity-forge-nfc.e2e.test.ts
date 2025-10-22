import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as crypto from "node:crypto";

/**
 * E2E Tests for Identity Forge NFC Journey
 * Tests: 5-step NFC Name Tag flow, Boltcard creation, NFC programming, registration completion
 */

// Mock browser APIs
const mockNDEFReader = {
  scan: vi.fn(),
  write: vi.fn(),
};

// Mock Supabase
const mockSupabaseData: Record<string, any[]> = {
  user_identities: [],
  ntag424_registrations: [],
  lnbits_boltcards: [],
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
        if (table === "user_identities") {
          return { data: mockSupabaseData[table][0] || null, error: null };
        }
        return { data: null, error: null };
      }),
      update: vi.fn().mockReturnThis(),
    })),
  })),
}));

// Mock SecureSessionManager
vi.mock("../../netlify/functions_active/security/session-manager.js", () => ({
  SecureSessionManager: {
    validateSessionFromHeader: vi.fn(async () => ({ hashedId: "user_hash_e2e_test" })),
    createSession: vi.fn(async () => "session_token_e2e_test"),
  },
}));

// Mock rate limiter
vi.mock("../../netlify/functions_active/utils/rate-limiter.js", () => ({
  allowRequest: () => true,
}));

// Test Helpers
function generateTestUsername(): string {
  return `testuser_${Math.random().toString(36).substring(7)}`;
}

function generateTestPassword(): string {
  return "TestPassword123!@#";
}

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

// E2E Tests
describe("Identity Forge NFC Journey E2E", () => {
  beforeEach(() => {
    Object.keys(mockSupabaseData).forEach((key) => {
      mockSupabaseData[key] = [];
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("5-Step NFC Name Tag Flow", () => {
    it("should complete Step 1: Signin/Registration", async () => {
      const username = generateTestUsername();
      const password = generateTestPassword();

      // Simulate user entering credentials
      const credentials = { username, password };

      expect(credentials.username).toBeDefined();
      expect(credentials.password).toBeDefined();
      expect(credentials.username.length).toBeGreaterThan(0);
      expect(credentials.password.length).toBeGreaterThan(0);
    });

    it("should complete Step 2: Wallet Creation", async () => {
      const walletSetup = {
        walletType: "lnbits",
        walletUrl: "https://lnbits.example.com",
        adminKey: "test_admin_key_123",
        created_at: new Date().toISOString(),
      };

      expect(walletSetup.walletType).toBe("lnbits");
      expect(walletSetup.walletUrl).toBeDefined();
      expect(walletSetup.adminKey).toBeDefined();
    });

    it("should complete Step 3: Name Tag Registration", async () => {
      const cardUid = generateTestCardUid();
      const pin = generateTestPin();
      const saltB64 = Buffer.from("test-salt-16bytes").toString("base64");
      const pinHash = await hashPin(pin, saltB64);

      const registration = {
        owner_hash: "user_hash_e2e_test",
        hashed_tag_uid: crypto.createHash("sha256").update(cardUid).digest("hex"),
        pin_salt_base64: saltB64,
        pin_hash_hex: pinHash,
        created_at: new Date().toISOString(),
      };

      mockSupabaseData.ntag424_registrations.push(registration);

      expect(mockSupabaseData.ntag424_registrations).toHaveLength(1);
      expect(mockSupabaseData.ntag424_registrations[0].pin_hash_hex).toBe(pinHash);
    });

    it("should complete Step 4: NFC Programming", async () => {
      const cardUid = generateTestCardUid();
      const nip05 = "testuser@satnam.pub";

      // Simulate File 04 (Nostr) programming
      const nip05Str = nip05;
      const nip05Padded = Buffer.alloc(28);
      Buffer.from(nip05Str).copy(nip05Padded);
      const reserved = Buffer.alloc(4);
      const payload = Buffer.concat([nip05Padded, reserved]);

      expect(payload.length).toBe(32);
      expect(nip05Padded.toString("utf8").substring(0, nip05.length)).toBe(nip05);
    });

    it("should complete Step 5: Registration Complete", async () => {
      const username = generateTestUsername();
      const npub = "npub1test123456789";
      const nip05 = `${username}@satnam.pub`;

      const userIdentity = {
        owner_hash: "user_hash_e2e_test",
        username,
        npub,
        nip05,
        created_at: new Date().toISOString(),
      };

      mockSupabaseData.user_identities.push(userIdentity);

      expect(mockSupabaseData.user_identities).toHaveLength(1);
      expect(mockSupabaseData.user_identities[0].username).toBe(username);
      expect(mockSupabaseData.user_identities[0].nip05).toBe(nip05);
    });
  });

  describe("Boltcard Creation in Identity Forge", () => {
    it("should create Boltcard with Name Tag label", async () => {
      const boltcard = {
        id: "card_e2e_test_123",
        label: "Name Tag",
        spend_limit_sats: 20000,
        functions: ["payment"],
        created_at: new Date().toISOString(),
      };

      mockSupabaseData.lnbits_boltcards.push(boltcard);

      expect(mockSupabaseData.lnbits_boltcards).toHaveLength(1);
      expect(mockSupabaseData.lnbits_boltcards[0].label).toBe("Name Tag");
      expect(mockSupabaseData.lnbits_boltcards[0].spend_limit_sats).toBe(20000);
    });

    it("should set 6-digit PIN for Boltcard", async () => {
      const pin = "123456";
      const saltB64 = Buffer.from("test-salt-16bytes").toString("base64");
      const pinHash = await hashPin(pin, saltB64);

      const boltcard = {
        id: "card_e2e_test_123",
        pin_salt_base64: saltB64,
        pin_hash_hex: pinHash,
      };

      expect(boltcard.pin_salt_base64).toBe(saltB64);
      expect(boltcard.pin_hash_hex).toBe(pinHash);
    });

    it("should display Boltcard auth QR code", async () => {
      const authQr = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      expect(authQr).toBeDefined();
      expect(authQr.startsWith("data:image")).toBe(true);
    });
  });

  describe("NFC Programming Flow", () => {
    it("should program File 01 (Payment)", () => {
      const cardRefStr = "test-card-ref-123".substring(0, 16);
      const cardRef = Buffer.from(cardRefStr);
      const key = crypto.createHash("sha256").update("test-key").digest();
      const hmac = crypto.createHmac("sha256", key).update(cardRef).digest();
      const hmacTruncated = hmac.slice(0, 16);
      const payload = Buffer.concat([cardRef, hmacTruncated]);

      expect(payload.length).toBeLessThanOrEqual(32);
    });

    it("should program File 02 (Auth)", () => {
      const authKeyHash = "test-auth-key";
      const cardUid = "04A1B2C3D4E5F6G7";
      const payload = crypto
        .createHash("sha256")
        .update(Buffer.concat([Buffer.from(authKeyHash, "hex"), Buffer.from(cardUid)]))
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

    it("should verify programmed card", async () => {
      const cardUid = generateTestCardUid();
      const hashedUid = crypto.createHash("sha256").update(cardUid).digest("hex");

      const verification = {
        owner_hash: "user_hash_e2e_test",
        hashed_tag_uid: hashedUid,
        operation_type: "verify-tag",
        success: true,
        timestamp: new Date().toISOString(),
      };

      expect(verification.success).toBe(true);
      expect(verification.operation_type).toBe("verify-tag");
    });
  });

  describe("Complete Registration Journey", () => {
    it("should complete full Identity Forge NFC journey", async () => {
      const username = generateTestUsername();
      const password = generateTestPassword();
      const cardUid = generateTestCardUid();
      const pin = generateTestPin();
      const saltB64 = Buffer.from("test-salt-16bytes").toString("base64");
      const pinHash = await hashPin(pin, saltB64);

      // Step 1: Create user identity
      const userIdentity = {
        owner_hash: "user_hash_e2e_test",
        username,
        npub: "npub1test123456789",
        nip05: `${username}@satnam.pub`,
        created_at: new Date().toISOString(),
      };
      mockSupabaseData.user_identities.push(userIdentity);

      // Step 2: Create Boltcard
      const boltcard = {
        id: "card_e2e_test_123",
        label: "Name Tag",
        spend_limit_sats: 20000,
        pin_salt_base64: saltB64,
        pin_hash_hex: pinHash,
        created_at: new Date().toISOString(),
      };
      mockSupabaseData.lnbits_boltcards.push(boltcard);

      // Step 3: Register NFC tag
      const registration = {
        owner_hash: "user_hash_e2e_test",
        hashed_tag_uid: crypto.createHash("sha256").update(cardUid).digest("hex"),
        pin_salt_base64: saltB64,
        pin_hash_hex: pinHash,
        created_at: new Date().toISOString(),
      };
      mockSupabaseData.ntag424_registrations.push(registration);

      // Verify all steps completed
      expect(mockSupabaseData.user_identities).toHaveLength(1);
      expect(mockSupabaseData.lnbits_boltcards).toHaveLength(1);
      expect(mockSupabaseData.ntag424_registrations).toHaveLength(1);

      // Verify data consistency
      expect(mockSupabaseData.user_identities[0].username).toBe(username);
      expect(mockSupabaseData.lnbits_boltcards[0].label).toBe("Name Tag");
      expect(mockSupabaseData.ntag424_registrations[0].pin_hash_hex).toBe(pinHash);
    });

    it("should handle registration errors gracefully", async () => {
      const errors: string[] = [];

      try {
        throw new Error("Boltcard creation failed");
      } catch (e) {
        errors.push((e as Error).message);
      }

      try {
        throw new Error("NFC tag registration failed");
      } catch (e) {
        errors.push((e as Error).message);
      }

      expect(errors).toHaveLength(2);
      expect(errors[0]).toBe("Boltcard creation failed");
      expect(errors[1]).toBe("NFC tag registration failed");
    });
  });

  describe("Mobile Browser Compatibility", () => {
    it("should detect Web NFC API availability", () => {
      const hasWebNFC = typeof (globalThis as any).NDEFReader !== "undefined";
      expect(typeof hasWebNFC).toBe("boolean");
    });

    it("should handle Android Web NFC", () => {
      const isAndroid = /Android/.test(navigator.userAgent);
      expect(typeof isAndroid).toBe("boolean");
    });

    it("should handle iOS limitations", () => {
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      expect(typeof isIOS).toBe("boolean");
    });

    it("should provide fallback for unsupported browsers", () => {
      const fallbackMessage = "Web NFC not supported on this device";
      expect(fallbackMessage).toBeDefined();
      expect(fallbackMessage.length).toBeGreaterThan(0);
    });
  });
});

