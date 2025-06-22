import { createRequest, createResponse } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptCredentials, encryptCredentials } from "../../lib/security";
import { generateSecureToken } from "../../utils/crypto-factory";
import { checkFederationWhitelist } from "../auth/federation-whitelist";
import { nwcSignIn, verifyNWCConnection } from "../auth/nwc-signin";
import { initiateOTP, validateSession, verifyOTP } from "../auth/otp-signin";

// Mock Supabase
vi.mock("../../lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: {}, error: null })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: {}, error: null })),
            })),
          })),
        })),
      })),
    })),
  },
}));

vi.mock("@nostr-dev-kit/ndk", () => ({
  default: vi.fn(() => ({
    connect: vi.fn(),
    fetchEvent: vi.fn(),
  })),
}));

describe("Family Federation Authentication System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Privacy and Encryption Integrity", () => {
    it("should not expose sensitive data in session tokens", async () => {
      const token = generateSecureToken(64);

      // Verify token doesn't contain readable patterns
      expect(token).not.toMatch(/nsec|npub|nip05|password/i);
      expect(token.length).toBeGreaterThan(50);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // Base64URL format
    });

    it("should maintain encryption/decryption integrity", async () => {
      const sensitiveData = "nsec1234567890abcdef";
      const password = "test-password-123";

      // Test that our new auth system doesn't break existing encryption
      const encrypted = await encryptCredentials(sensitiveData, password);
      const decrypted = await decryptCredentials(encrypted, password);

      expect(decrypted).toBe(sensitiveData);
      expect(encrypted).not.toContain(sensitiveData);
    });

    it("should not log sensitive authentication data", async () => {
      const consoleSpy = vi.spyOn(console, "log");
      const consoleErrorSpy = vi.spyOn(console, "error");

      // Test that sensitive data isn't logged
      const sensitiveData = {
        nwcUrl:
          "nostr+walletconnect://abcd1234@relay.example.com?secret=supersecret",
        otp: "123456",
        sessionToken: "session-token-123",
      };

      // Actually call functions that might log sensitive data
      const req = createRequest({
        method: "POST",
        body: { nwcUrl: sensitiveData.nwcUrl },
      });
      const res = createResponse();

      // Mock error to trigger potential logging
      mockSupabase.rpc.mockRejectedValueOnce(new Error("Test error"));

      await verifyNWCConnection(req, res);

      // Test OTP function that might log sensitive data
      const otpReq = createRequest({
        method: "POST",
        body: {
          otpKey: "test-key",
          otp: sensitiveData.otp,
        },
      });
      const otpRes = createResponse();

      await verifyOTP(otpReq, otpRes);

      // Test session validation that might log sensitive data
      const sessionReq = createRequest({
        method: "POST",
        body: { sessionToken: sensitiveData.sessionToken },
      });
      const sessionRes = createResponse();

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{ is_valid: false }],
        error: null,
      });

      await validateSession(sessionReq, sessionRes);

      // These should not appear in logs
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining(sensitiveData.nwcUrl)
      );
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining(sensitiveData.otp)
      );
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining(sensitiveData.sessionToken)
      );
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining(sensitiveData.sessionToken)
      );

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("Federation Whitelist API", () => {
    it("should check whitelist status without exposing internal data", async () => {
      const req = createRequest({
        method: "POST",
        body: { nip05: "test@example.com" },
      });
      const res = createResponse();

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [
          { is_whitelisted: true, family_role: "parent", voting_power: 2 },
        ],
        error: null,
      });

      await checkFederationWhitelist(req, res);

      expect(res.statusCode).toBe(200);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(true);
      expect(responseData.data.whitelisted).toBe(true);

      // Verify no internal database structure is exposed
      expect(responseData.data).not.toHaveProperty("id");
      expect(responseData.data).not.toHaveProperty("created_at");
    });

    it("should handle non-whitelisted users securely", async () => {
      const req = createRequest({
        method: "POST",
        body: { nip05: "unauthorized@example.com" },
      });
      const res = createResponse();

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{ is_whitelisted: false }],
        error: null,
      });

      await checkFederationWhitelist(req, res);

      expect(res.statusCode).toBe(403);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(false);
      expect(responseData.whitelisted).toBe(false);

      // Verify error message doesn't leak sensitive info
      expect(responseData.error).not.toContain("database");
      expect(responseData.error).not.toContain("sql");
    });
  });

  describe("NWC Authentication", () => {
    it("should validate NWC URL format without exposing secrets", async () => {
      const req = createRequest({
        method: "POST",
        body: { nwcUrl: "invalid-url" },
      });
      const res = createResponse();

      await verifyNWCConnection(req, res);

      expect(res.statusCode).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(false);
      expect(responseData.error).toContain("Invalid NWC URI");

      // Verify the invalid URL isn't echoed back
      expect(responseData.error).not.toContain("invalid-url");
    });

    it("should handle NWC authentication errors securely", async () => {
      const req = createRequest({
        method: "POST",
        body: {
          nwcUrl:
            "nostr+walletconnect://pubkey@relay.example.com?secret=test&relay=wss://relay.example.com",
        },
      });
      const res = createResponse();

      // Mock connection failure
      mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null });

      await nwcSignIn(req, res);

      expect(res.statusCode).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(false);

      // Verify NWC URL components aren't exposed in error
      expect(JSON.stringify(responseData)).not.toContain("secret=test");
      expect(JSON.stringify(responseData)).not.toContain("pubkey");
    });
  });

  describe("OTP Authentication", () => {
    it("should generate OTP without exposing implementation details", async () => {
      const req = createRequest({
        method: "POST",
        body: { npub: "npub1234567890abcdef" },
      });
      const res = createResponse();

      await initiateOTP(req, res);

      expect(res.statusCode).toBe(200);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(true);

      // In production, OTP shouldn't be returned
      if (process.env.NODE_ENV === "production") {
        expect(responseData.data).not.toHaveProperty("_demo_otp");
      }

      // Verify no internal implementation details are exposed
      expect(responseData.data).not.toHaveProperty("otpStorage");
      expect(responseData.data).not.toHaveProperty("privateKey");
    });

    it("should handle OTP verification securely", async () => {
      const req = createRequest({
        method: "POST",
        body: {
          otpKey: "invalid-key",
          otp: "123456",
        },
      });
      const res = createResponse();

      await verifyOTP(req, res);

      expect(res.statusCode).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(false);

      // Verify error doesn't expose internal state
      expect(responseData.error).not.toContain("otpStorage");
      expect(responseData.error).not.toContain("Map");
    });
  });

  describe("Session Management", () => {
    it("should validate sessions without exposing internal structure", async () => {
      const req = createRequest({
        method: "POST",
        body: { sessionToken: "invalid-token" },
      });
      const res = createResponse();

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{ is_valid: false }],
        error: null,
      });

      await validateSession(req, res);

      expect(res.statusCode).toBe(401);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(false);

      // Verify no database internals are exposed
      expect(responseData.error).not.toContain("family_auth_sessions");
      expect(responseData.error).not.toContain("expires_at");
    });

    it("should return valid session data without sensitive fields", async () => {
      const req = createRequest({
        method: "POST",
        body: { sessionToken: "valid-token" },
      });
      const res = createResponse();

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [
          {
            is_valid: true,
            npub: "npub1234",
            nip05_address: "test@example.com",
            federation_role: "parent",
            auth_method: "nwc",
            is_whitelisted: true,
            expires_at: new Date().toISOString(),
          },
        ],
        error: null,
      });

      await validateSession(req, res);

      expect(res.statusCode).toBe(200);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(true);

      // Verify sensitive session data isn't exposed
      expect(responseData.data.userAuth).not.toHaveProperty("session_token");
      expect(responseData.data.userAuth).not.toHaveProperty("nwc_pubkey");
      expect(responseData.data.userAuth).not.toHaveProperty("nwc_relay");
      expect(responseData.data.userAuth).not.toHaveProperty("id");
    });
  });

  describe("Security Headers and Response Format", () => {
    it("should include security metadata in all responses", async () => {
      const req = createRequest({
        method: "POST",
        body: { nip05: "test@example.com" },
      });
      const res = createResponse();

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{ is_whitelisted: true, family_role: "parent" }],
        error: null,
      });

      await checkFederationWhitelist(req, res);

      const responseData = JSON.parse(res._getData());

      // Verify security metadata is present
      expect(responseData).toHaveProperty("meta");
      expect(responseData.meta).toHaveProperty("timestamp");
      expect(responseData.meta.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
    });

    it("should not expose stack traces in production errors", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const req = createRequest({
        method: "POST",
        body: { nip05: "test@example.com" },
      });
      const res = createResponse();

      // Mock database error
      mockSupabase.rpc.mockRejectedValueOnce(
        new Error("Database connection failed")
      );

      await checkFederationWhitelist(req, res);

      const responseData = JSON.parse(res._getData());

      // Verify no stack trace or internal error details
      expect(JSON.stringify(responseData)).not.toContain(
        "Database connection failed"
      );
      expect(JSON.stringify(responseData)).not.toContain("at Object.");
      expect(JSON.stringify(responseData)).not.toContain("node_modules");

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("Input Validation and Sanitization", () => {
    it("should sanitize NIP-05 inputs", async () => {
      const req = createRequest({
        method: "POST",
        body: { nip05: '<script>alert("xss")</script>@example.com' },
      });
      const res = createResponse();

      await checkFederationWhitelist(req, res);

      expect(res.statusCode).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(false);

      // Verify XSS attempt is not reflected
      expect(JSON.stringify(responseData)).not.toContain("<script>");
      expect(JSON.stringify(responseData)).not.toContain("alert");
    });

    it("should validate NWC URL parameters safely", async () => {
      const maliciousUrl =
        'nostr+walletconnect://"><script>alert(1)</script>@relay.com?secret=test';

      const req = createRequest({
        method: "POST",
        body: { nwcUrl: maliciousUrl },
      });
      const res = createResponse();

      await verifyNWCConnection(req, res);

      const responseData = JSON.parse(res._getData());

      // Verify malicious content is not reflected
      expect(JSON.stringify(responseData)).not.toContain("<script>");
      expect(JSON.stringify(responseData)).not.toContain("alert(1)");
    });
  });
});

describe("Integration with Existing Privacy Systems", () => {
  it("should not interfere with existing secure storage", async () => {
    // Test that new auth system doesn't break existing encryption
    const testData = "sensitive-nsec-data";
    const password = "user-password";

    const encrypted = await encryptCredentials(testData, password);
    const decrypted = await decryptCredentials(encrypted, password);

    expect(decrypted).toBe(testData);
    expect(encrypted).not.toContain(testData);
    expect(encrypted).not.toContain(password);
  });

  it("should maintain token generation security", () => {
    const tokens = new Set();

    // Generate multiple tokens to test uniqueness
    for (let i = 0; i < 100; i++) {
      const token = generateSecureToken();
      expect(tokens.has(token)).toBe(false);
      tokens.add(token);
      expect(token.length).toBeGreaterThan(50);
    }
  });

  it("should preserve existing crypto utilities", async () => {
    // Verify existing crypto functions still work
    const { generateRandomHex, sha256 } = await import(
      "../../utils/crypto-lazy"
    );

    const randomHex = generateRandomHex(32);
    expect(randomHex).toMatch(/^[0-9a-f]{32}$/);

    const hash = await sha256("test-data");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(await sha256("test-data")); // Deterministic
  });
});
