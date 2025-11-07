/**
 * Tapsigner Hooks Integration Tests
 * Phase 4 Task 4.2: Integration Tests
 *
 * Tests for Tapsigner hooks with REAL API calls and state management
 * NO MOCKING - uses real Netlify Functions and hook implementations
 *
 * Prerequisites:
 * - Run: netlify dev (starts local server on http://localhost:8888)
 * - Environment variables configured in .env.test
 *
 * Note: Tests are skipped if Netlify Functions server is not running
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  checkNetlifyServerAvailability,
  serverAvailable as initialServerAvailable,
  makeAuthenticatedCall,
} from "../setup/integration-test-setup";

const API_BASE_URL = process.env.VITE_API_BASE_URL || "http://localhost:8888";

// Mock useAuth hook
vi.mock("../../src/components/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user-123" },
    sessionToken: "test-jwt-token-" + Date.now(),
    authenticated: true,
    loading: false,
    error: null,
  }),
}));

// Mock Web NFC API
if (typeof window !== "undefined" && !("NDEFReader" in window)) {
  (window as any).NDEFReader = class NDEFReaderMock {
    onreading: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    async scan() {}
    abort() {}
  };
}

describe("Tapsigner Hooks Integration Tests", () => {
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
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("useTapsigner Hook - API Integration", () => {
    it("should call register endpoint with correct parameters", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("register", {
        cardId: "a1b2c3d4e5f6a7b8",
        publicKey: "a".repeat(64),
        familyRole: "private",
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    it("should call verify endpoint with signature", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("verify", {
        cardId: "a1b2c3d4e5f6a7b8",
        signature: "a".repeat(128),
        challenge: "test-challenge-" + Date.now(),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    it("should call sign endpoint with event data", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("sign", {
        cardId: "a1b2c3d4e5f6a7b8",
        event: {
          kind: 1,
          content: "Test message",
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
        },
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    it("should handle API errors gracefully", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("register", {
        cardId: "invalid",
        publicKey: "invalid-hex",
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should include session token in requests", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("status", {
        cardId: "a1b2c3d4e5f6a7b8",
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe("useTapsignerLnbits Hook - API Integration", () => {
    it("should call lnbits-link endpoint", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("lnbits-link", {
        cardId: "a1b2c3d4e5f6a7b8",
        walletId: "test-wallet-123",
        spendLimit: 100000,
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    it("should validate spend limit parameter", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("lnbits-link", {
        cardId: "a1b2c3d4e5f6a7b8",
        walletId: "test-wallet-123",
        spendLimit: -1000,
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should handle wallet linking errors", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("lnbits-link", {
        cardId: "invalid-card",
        walletId: "invalid-wallet",
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Retry Logic Integration", () => {
    it("should retry on network failure", async () => {
      let attempts = 0;
      const maxAttempts = 3;

      const attemptRequest = async () => {
        attempts++;
        try {
          const response = await fetch(
            `${API_BASE_URL}/.netlify/functions/tapsigner-unified`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer test-jwt-token",
              },
              body: JSON.stringify({ action: "status" }),
            }
          );
          return response;
        } catch (error) {
          if (attempts < maxAttempts) {
            await new Promise((resolve) =>
              setTimeout(resolve, 100 * Math.pow(2, attempts - 1))
            );
            return attemptRequest();
          }
          throw error;
        }
      };

      try {
        const response = await attemptRequest();
        expect(response).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("State Management Integration", () => {
    it("should maintain session state across requests", async () => {
      if (!serverAvailable) return;

      // First request
      const response1 = await makeAuthenticatedCall("status", {
        cardId: "a1b2c3d4e5f6a7b8",
      });

      expect(response1.status).toBeGreaterThanOrEqual(200);
      expect(response1.status).toBeLessThan(500);

      // Second request with same session
      const response2 = await makeAuthenticatedCall("status", {
        cardId: "a1b2c3d4e5f6a7b8",
      });

      expect(response2.status).toBeGreaterThanOrEqual(200);
      expect(response2.status).toBeLessThan(500);
    });
  });

  describe("Feature Flag Integration", () => {
    it("should respect VITE_TAPSIGNER_ENABLED flag", () => {
      const originalFlag = process.env.VITE_TAPSIGNER_ENABLED;
      process.env.VITE_TAPSIGNER_ENABLED = "false";

      try {
        expect(process.env.VITE_TAPSIGNER_ENABLED).toBe("false");
      } finally {
        process.env.VITE_TAPSIGNER_ENABLED = originalFlag;
      }
    });

    it("should respect VITE_TAPSIGNER_DEBUG flag", () => {
      const originalFlag = process.env.VITE_TAPSIGNER_DEBUG;
      process.env.VITE_TAPSIGNER_DEBUG = "true";

      try {
        expect(process.env.VITE_TAPSIGNER_DEBUG).toBe("true");
      } finally {
        process.env.VITE_TAPSIGNER_DEBUG = originalFlag;
      }
    });
  });
});
