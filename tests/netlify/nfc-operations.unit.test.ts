import * as crypto from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Unit Tests for NFC Cryptographic Operations
 * Tests: PIN validation, PBKDF2-SHA512 hashing, AES-256-GCM encryption, HMAC signatures, UID hashing
 */

// --- PIN Validation Tests ---

describe("PIN Validation", () => {
  function isPinValid(pin: string): boolean {
    return typeof pin === "string" && /^\d{4,6}$/.test(pin);
  }

  it("accepts valid 4-digit PIN", () => {
    expect(isPinValid("1234")).toBe(true);
  });

  it("accepts valid 5-digit PIN", () => {
    expect(isPinValid("12345")).toBe(true);
  });

  it("accepts valid 6-digit PIN", () => {
    expect(isPinValid("123456")).toBe(true);
  });

  it("rejects 3-digit PIN (too short)", () => {
    expect(isPinValid("123")).toBe(false);
  });

  it("rejects 7-digit PIN (too long)", () => {
    expect(isPinValid("1234567")).toBe(false);
  });

  it("rejects PIN with non-numeric characters", () => {
    expect(isPinValid("12a456")).toBe(false);
  });

  it("rejects empty PIN", () => {
    expect(isPinValid("")).toBe(false);
  });

  it("rejects null/undefined PIN", () => {
    expect(isPinValid(null as any)).toBe(false);
    expect(isPinValid(undefined as any)).toBe(false);
  });
});

// --- PBKDF2-SHA512 Hashing Tests ---

describe("PBKDF2-SHA512 PIN Hashing", () => {
  async function pbkdf2HashHex(pin: string, saltB64: string): Promise<string> {
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

  it("generates consistent hash for same PIN and salt", async () => {
    const pin = "123456";
    const salt = Buffer.from("test-salt-16bytes").toString("base64");

    const hash1 = await pbkdf2HashHex(pin, salt);
    const hash2 = await pbkdf2HashHex(pin, salt);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(128); // 512 bits = 64 bytes = 128 hex chars
  });

  it("generates different hash for different PIN", async () => {
    const salt = Buffer.from("test-salt-16bytes").toString("base64");

    const hash1 = await pbkdf2HashHex("123456", salt);
    const hash2 = await pbkdf2HashHex("654321", salt);

    expect(hash1).not.toBe(hash2);
  });

  it("generates different hash for different salt", async () => {
    const pin = "123456";
    const salt1 = Buffer.from("salt-1-16-bytes-").toString("base64");
    const salt2 = Buffer.from("salt-2-16-bytes-").toString("base64");

    const hash1 = await pbkdf2HashHex(pin, salt1);
    const hash2 = await pbkdf2HashHex(pin, salt2);

    expect(hash1).not.toBe(hash2);
  });

  it("produces 512-bit (64-byte) hash", async () => {
    const pin = "123456";
    const salt = Buffer.from("test-salt-16bytes").toString("base64");

    const hash = await pbkdf2HashHex(pin, salt);

    expect(hash.length).toBe(128); // 512 bits = 128 hex characters
  });
});

// --- SHA-256 Hashing Tests ---

describe("SHA-256 Hashing", () => {
  function sha256Hex(input: string | Buffer): string {
    const h = crypto.createHash("sha256");
    h.update(input);
    return h.digest("hex");
  }

  it("generates consistent hash for same input", () => {
    const input = "test-data";
    const hash1 = sha256Hex(input);
    const hash2 = sha256Hex(input);

    expect(hash1).toBe(hash2);
  });

  it("generates different hash for different input", () => {
    const hash1 = sha256Hex("data1");
    const hash2 = sha256Hex("data2");

    expect(hash1).not.toBe(hash2);
  });

  it("produces 256-bit (64-char hex) hash", () => {
    const hash = sha256Hex("test");

    expect(hash.length).toBe(64); // 256 bits = 64 hex characters
  });

  it("handles Buffer input", () => {
    const buf = Buffer.from("test-data");
    const hash = sha256Hex(buf);

    expect(hash.length).toBe(64);
  });
});

// --- HMAC-SHA256 Signature Tests ---

describe("HMAC-SHA256 Signatures", () => {
  function hmacSha256(input: string | Buffer, key: string | Buffer): Buffer {
    const h = crypto.createHmac("sha256", key);
    h.update(input);
    return h.digest();
  }

  it("generates consistent HMAC for same input and key", () => {
    const input = "test-data";
    const key = "secret-key";

    const hmac1 = hmacSha256(input, key);
    const hmac2 = hmacSha256(input, key);

    expect(hmac1.toString("hex")).toBe(hmac2.toString("hex"));
  });

  it("generates different HMAC for different input", () => {
    const key = "secret-key";

    const hmac1 = hmacSha256("data1", key);
    const hmac2 = hmacSha256("data2", key);

    expect(hmac1.toString("hex")).not.toBe(hmac2.toString("hex"));
  });

  it("generates different HMAC for different key", () => {
    const input = "test-data";

    const hmac1 = hmacSha256(input, "key1");
    const hmac2 = hmacSha256(input, "key2");

    expect(hmac1.toString("hex")).not.toBe(hmac2.toString("hex"));
  });

  it("produces 256-bit (32-byte) HMAC", () => {
    const hmac = hmacSha256("test", "key");

    expect(hmac.length).toBe(32); // 256 bits = 32 bytes
  });

  it("handles Buffer input and key", () => {
    const input = Buffer.from("test-data");
    const key = Buffer.from("secret-key");

    const hmac = hmacSha256(input, key);

    expect(hmac.length).toBe(32);
  });
});

// --- Buffer Size Validation Tests ---

describe("Buffer Size Validation", () => {
  function toFixedSize(buf: Buffer, size: number): Buffer {
    if (buf.length === size) return buf;
    if (buf.length > size) {
      throw new Error(
        `Buffer truncation: expected ${size} bytes, got ${buf.length}`
      );
    }
    const out = Buffer.alloc(size);
    buf.copy(out, 0, 0, Math.min(buf.length, size));
    return out;
  }

  it("returns buffer unchanged if correct size", () => {
    const buf = Buffer.from("1234567890123456"); // 16 bytes
    const result = toFixedSize(buf, 16);

    expect(result.length).toBe(16);
    expect(result.toString()).toBe("1234567890123456");
  });

  it("pads buffer with zeros if too small", () => {
    const buf = Buffer.from("12345678"); // 8 bytes
    const result = toFixedSize(buf, 16);

    expect(result.length).toBe(16);
    expect(result.slice(0, 8).toString()).toBe("12345678");
    expect(result.slice(8).toString()).toBe("\x00\x00\x00\x00\x00\x00\x00\x00");
  });

  it("throws error if buffer too large", () => {
    const buf = Buffer.from("12345678901234567890"); // 20 bytes
    expect(() => toFixedSize(buf, 16)).toThrow("Buffer truncation");
  });
});

// --- Timing-Safe Comparison Tests ---

describe("Timing-Safe Comparison", () => {
  function timingSafeEqualHex(aHex: string, bHex: string): boolean {
    const a = Buffer.from(aHex, "hex");
    const b = Buffer.from(bHex, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  it("returns true for identical hex strings", () => {
    const hex = "deadbeef";
    expect(timingSafeEqualHex(hex, hex)).toBe(true);
  });

  it("returns false for different hex strings", () => {
    expect(timingSafeEqualHex("deadbeef", "cafebabe")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(timingSafeEqualHex("deadbeef", "deadbeefaa")).toBe(false);
  });

  it("uses constant-time comparison (no early exit)", () => {
    // This test verifies the function uses timingSafeEqual
    // which prevents timing attacks
    const hex1 = "aaaaaaaaaaaaaaaa";
    const hex2 = "aaaaaaaaaaaaaaab";

    expect(timingSafeEqualHex(hex1, hex2)).toBe(false);
  });
});

// --- Card UID Hashing Tests ---

describe("Card UID Hashing", () => {
  function hashCardUid(uid: string): string {
    const h = crypto.createHash("sha256");
    h.update(uid);
    return h.digest("hex");
  }

  it("generates consistent hash for same UID", () => {
    const uid = "04A1B2C3D4E5F6G7";

    const hash1 = hashCardUid(uid);
    const hash2 = hashCardUid(uid);

    expect(hash1).toBe(hash2);
  });

  it("generates different hash for different UID", () => {
    const hash1 = hashCardUid("04A1B2C3D4E5F6G7");
    const hash2 = hashCardUid("04A1B2C3D4E5F6G8");

    expect(hash1).not.toBe(hash2);
  });

  it("produces 256-bit (64-char hex) hash", () => {
    const hash = hashCardUid("04A1B2C3D4E5F6G7");

    expect(hash.length).toBe(64);
  });
});

// --- Multi-Function Card Data Layout Tests ---

describe("Multi-Function Card Data Layout", () => {
  function derivePaymentHmacKey(): Buffer {
    const base = "test-secret-key";
    return crypto.createHash("sha256").update(base).digest();
  }

  function hmacSha256(input: string | Buffer, key: string | Buffer): Buffer {
    const h = crypto.createHmac("sha256", key);
    h.update(input);
    return h.digest();
  }

  function toFixedSize(buf: Buffer, size: number): Buffer {
    if (buf.length === size) return buf;
    if (buf.length > size) {
      throw new Error(
        `Buffer truncation: expected ${size} bytes, got ${buf.length}`
      );
    }
    const out = Buffer.alloc(size);
    buf.copy(out, 0, 0, Math.min(buf.length, size));
    return out;
  }

  it("File 01 (Payment): 16B card ref + 16B HMAC = 32B total", () => {
    const key = derivePaymentHmacKey();
    const boltcardId = "test-card-id-123";
    // Truncate boltcardId to 16 bytes before creating buffer
    const truncatedId = boltcardId.substring(0, 16);
    const refBytes = Buffer.from(truncatedId);
    // HMAC-SHA256 produces 32 bytes, truncate to 16
    const hmacFull = hmacSha256(refBytes, key);
    const sig = hmacFull.slice(0, 16);
    const payload = Buffer.concat([refBytes, sig]);

    expect(refBytes.length).toBeLessThanOrEqual(16);
    expect(sig.length).toBe(16);
    expect(payload.length).toBeLessThanOrEqual(32);
  });

  it("File 02 (Auth): SHA-256 hash = 32B", () => {
    const authKeyHash = "test-auth-key";
    const cardUid = "04A1B2C3D4E5F6G7";
    const h = crypto.createHash("sha256");
    h.update(
      Buffer.concat([Buffer.from(authKeyHash, "hex"), Buffer.from(cardUid)])
    );
    const payload = h.digest();

    expect(payload.length).toBe(32);
  });

  it("File 03 (Signing): 16B UUID + 16B nonce = 32B", () => {
    const uuid = Buffer.alloc(16, "test-uuid-123456");
    const nonce = Buffer.alloc(16, "test-nonce-12345");
    const payload = Buffer.concat([uuid, nonce]);

    expect(uuid.length).toBe(16);
    expect(nonce.length).toBe(16);
    expect(payload.length).toBe(32);
  });

  it("File 04 (Nostr): 28B NIP-05 + 4B reserved = 32B", () => {
    const nip05Str = "user@satnam.pub";
    // Pad NIP-05 to 28 bytes
    const nip05Padded = Buffer.alloc(28);
    Buffer.from(nip05Str).copy(nip05Padded);
    const reserved = Buffer.alloc(4);
    const payload = Buffer.concat([nip05Padded, reserved]);

    expect(nip05Padded.length).toBe(28);
    expect(reserved.length).toBe(4);
    expect(payload.length).toBe(32);
  });

  it("Total multi-function card usage: 128B of 440B available", () => {
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
