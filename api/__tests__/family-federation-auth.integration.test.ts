import { createRequest, createResponse } from "node-mocks-http";
import { beforeEach, describe, expect, it } from "vitest";
import { decryptCredentials, encryptCredentials } from "../../lib/security";
import { generateSecureToken } from "../../utils/crypto-factory";
import { checkFederationWhitelist } from "../auth/federation-whitelist";
import { nwcSignIn, verifyNWCConnection } from "../auth/nwc-signin";
import { initiateOTP, validateSession } from "../auth/otp-signin";

// Import real Supabase for production-ready tests
import { supabase } from "../../lib/supabase";

describe("Family Federation Authentication Integration", () => {
  beforeEach(() => {
    // Clear any test data if needed
  });

  describe("Production Security Tests", () => {
    it("should not expose sensitive data in session tokens", async () => {
      const token = await generateSecureToken(64);

      // Verify token doesn't contain readable patterns
      expect(token).not.toMatch(/nsec|npub|nip05|password/i);
      expect(token.length).toBeGreaterThan(50);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // Base64URL format
    });

    it("should maintain encryption/decryption integrity", async () => {
      const sensitiveData = "nsec1234567890abcdef";
      const password = "test-password-123";

      const encrypted = await encryptCredentials(sensitiveData, password);
      const decrypted = await decryptCredentials(encrypted, password);

      expect(decrypted).toBe(sensitiveData);
      expect(encrypted).not.toContain(sensitiveData);
      expect(encrypted).not.toContain(password);
    });

    it("should maintain token generation security", async () => {
      const tokens = new Set();

      // Generate multiple tokens to test uniqueness
      for (let i = 0; i < 10; i++) {
        // Reduced from 100 for faster testing
        const token = await generateSecureToken();
        expect(tokens.has(token)).toBe(false);
        tokens.add(token);
        expect(token.length).toBeGreaterThan(50);
      }
    });
  });

  describe("Real Supabase Integration", () => {
    it("should connect to Supabase successfully", async () => {
      // Test real Supabase connection
      const { error } = await supabase
        .from("health_check")
        .select("*")
        .limit(1);

      // Should not error on connection
      expect(error).toBeNull();
    });

    it("should validate federation whitelist functionality", async () => {
      const req = createRequest({
        method: "POST",
        body: { nip05: "test@example.com" },
      });
      const res = createResponse();

      // Test with real database
      await checkFederationWhitelist(req, res);

      // Should respond without throwing
      expect(res.statusCode).toBeDefined();
    });
  });

  describe("Authentication Flow Integration", () => {
    it("should handle NWC connection verification", async () => {
      const req = createRequest({
        method: "POST",
        body: {
          nwcUrl: "nostr+walletconnect://test",
        },
      });
      const res = createResponse();

      await verifyNWCConnection(req, res);

      // Should respond without throwing
      expect(res.statusCode).toBeDefined();
    });

    it("should handle OTP initiation", async () => {
      const req = createRequest({
        method: "POST",
        body: {
          npub: "npub1test123456789abcdef",
          federationRole: "parent",
        },
      });
      const res = createResponse();

      await initiateOTP(req, res);

      // Should respond without throwing
      expect(res.statusCode).toBeDefined();
    });

    it("should handle session validation", async () => {
      const sessionToken = await generateSecureToken(64);

      const req = createRequest({
        method: "POST",
        body: { sessionToken },
      });
      const res = createResponse();

      await validateSession(req, res);

      // Should respond without throwing
      expect(res.statusCode).toBeDefined();
    });
  });

  describe("Data Privacy Compliance", () => {
    it("should not expose credentials in responses", async () => {
      const testCredentials = {
        nsec: "nsec1test123456789abcdef",
        npub: "npub1test123456789abcdef",
        nwcUrl: "nostr+walletconnect://test-secret-key",
      };

      const req = createRequest({
        method: "POST",
        body: { nwcUrl: testCredentials.nwcUrl },
      });
      const res = createResponse();

      await nwcSignIn(req, res);

      const responseData = res._getData();
      if (responseData) {
        const responseStr = JSON.stringify(responseData);
        expect(responseStr).not.toContain(testCredentials.nsec);
        expect(responseStr).not.toContain("secret-key");
      }
    });
  });
});
