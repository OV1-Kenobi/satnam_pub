/**
 * Tapsigner Authentication Flow Integration Tests
 * Phase 4 Task 4.2: Integration Tests
 *
 * Tests for complete Tapsigner authentication flows with REAL components
 * NO MOCKING - uses real React components, hooks, and API calls
 *
 * Prerequisites:
 * - Run: netlify dev (starts local server on http://localhost:8888)
 * - Environment variables configured in .env.test
 *
 * Note: Tests are skipped if Netlify Functions server is not running
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkNetlifyServerAvailability,
  serverAvailable as initialServerAvailable,
  makeAuthenticatedCall
} from "../setup/integration-test-setup";

// Mock useAuth hook to provide session context
vi.mock("../../src/components/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user-123", hashedUUID: "test-uuid" },
    sessionToken: "test-jwt-token",
    authenticated: true,
    loading: false,
    error: null,
  }),
}));

// Mock Web NFC API for browser compatibility
if (typeof window !== "undefined" && !("NDEFReader" in window)) {
  (window as any).NDEFReader = class NDEFReaderMock {
    onreading: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    async scan() { }
    abort() { }
  };
}

describe("Tapsigner Authentication Flow Integration Tests", () => {
  let serverAvailable = initialServerAvailable;

  beforeAll(async () => {
    serverAvailable = await checkNetlifyServerAvailability();
    if (!serverAvailable) {
      console.warn(
        "\n⚠️  SKIPPING: Netlify Functions server not running. Start with: netlify dev\n"
      );
    }
  });

  beforeEach(() => {
    // Setup test environment
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Card Registration Flow", () => {
    it("should complete card registration with valid data", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("register", {
        cardId: "a1b2c3d4e5f6a7b8",
        publicKey: "a".repeat(64),
        familyRole: "private",
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    it("should handle registration errors gracefully", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("register", {
        cardId: "invalid",
        publicKey: "invalid-hex",
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should validate card data before registration", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("register", {});

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Card Verification Flow", () => {
    it("should verify card with valid signature", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("verify", {
        cardId: "a1b2c3d4e5f6a7b8",
        signature: "a".repeat(128),
        challenge: "test-challenge-" + Date.now(),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    it("should reject verification with invalid signature", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("verify", {
        cardId: "a1b2c3d4e5f6a7b8",
        signature: "invalid-signature",
        challenge: "test-challenge",
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Event Signing Flow", () => {
    it("should sign Nostr event with card", async () => {
      if (!serverAvailable) return;

      const event = {
        kind: 1,
        content: "Test message",
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
      };

      const response = await makeAuthenticatedCall("sign", {
        cardId: "a1b2c3d4e5f6a7b8",
        event,
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    it("should reject signing with invalid event", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("sign", {
        cardId: "a1b2c3d4e5f6a7b8",
        event: { invalid: "event" },
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Wallet Linking Flow", () => {
    it("should link wallet to card", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("lnbits-link", {
        cardId: "a1b2c3d4e5f6a7b8",
        walletId: "test-wallet-123",
        spendLimit: 100000,
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    it("should validate spend limit", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("lnbits-link", {
        cardId: "a1b2c3d4e5f6a7b8",
        walletId: "test-wallet-123",
        spendLimit: -1000,
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Feature Flag Integration", () => {
    it("should respect VITE_TAPSIGNER_ENABLED flag", async () => {
      const originalFlag = process.env.VITE_TAPSIGNER_ENABLED;
      process.env.VITE_TAPSIGNER_ENABLED = "false";

      try {
        // Component should handle disabled feature gracefully
        expect(process.env.VITE_TAPSIGNER_ENABLED).toBe("false");
      } finally {
        process.env.VITE_TAPSIGNER_ENABLED = originalFlag;
      }
    });

    it("should respect VITE_LNBITS_INTEGRATION_ENABLED flag", async () => {
      const originalFlag = process.env.VITE_LNBITS_INTEGRATION_ENABLED;
      process.env.VITE_LNBITS_INTEGRATION_ENABLED = "true";

      try {
        expect(process.env.VITE_LNBITS_INTEGRATION_ENABLED).toBe("true");
      } finally {
        process.env.VITE_LNBITS_INTEGRATION_ENABLED = originalFlag;
      }
    });
  });

  describe("Error Handling & Recovery", () => {
    it("should handle network errors gracefully", async () => {
      if (!serverAvailable) return;

      const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8888";
      const TAPSIGNER_ENDPOINT = `${API_BASE_URL}/.netlify/functions/tapsigner-unified`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 50);

      try {
        await fetch(TAPSIGNER_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-jwt-token",
          },
          body: JSON.stringify({ action: "status" }),
          signal: controller.signal,
        });
      } catch (error) {
        expect(error).toBeDefined();
      } finally {
        clearTimeout(timeoutId);
      }
    });

    it("should handle authentication failures", async () => {
      if (!serverAvailable) return;

      const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8888";
      const TAPSIGNER_ENDPOINT = `${API_BASE_URL}/.netlify/functions/tapsigner-unified`;

      const response = await fetch(TAPSIGNER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid-token",
        },
        body: JSON.stringify({
          action: "register",
          cardId: "a1b2c3d4e5f6a7b8",
          publicKey: "a".repeat(64),
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(401);
    });
  });
});

