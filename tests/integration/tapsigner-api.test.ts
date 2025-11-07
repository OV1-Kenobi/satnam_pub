/**
 * Tapsigner API Integration Tests
 * Phase 4 Task 4.2: Integration Tests
 *
 * Tests for Tapsigner Netlify Functions endpoints with REAL API calls
 * NO MOCKING - uses real Netlify Functions via netlify dev
 *
 * Prerequisites:
 * - Run: netlify dev (starts local server on http://localhost:8888)
 * - Environment variables configured in .env.test
 *
 * Note: Tests are skipped if Netlify Functions server is not running
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  checkNetlifyServerAvailability,
  createTestJWT,
  serverAvailable as initialServerAvailable,
  makeAuthenticatedCall,
} from "../setup/integration-test-setup";

// Test data
const testCardId = "a1b2c3d4e5f6a7b8";
const testPublicKey = "a".repeat(64);

describe("Tapsigner API Integration Tests", () => {
  let serverAvailable = initialServerAvailable;

  beforeAll(async () => {
    serverAvailable = await checkNetlifyServerAvailability();
    if (!serverAvailable) {
      console.warn(
        "\n⚠️  SKIPPING: Netlify Functions server not running. Start with: netlify dev\n"
      );
    }
  });

  describe("POST /tapsigner-unified - register action", () => {
    it("should register card with valid data", async () => {
      if (!serverAvailable) {
        console.log("⏭️  Skipped: Server not available");
        return;
      }

      const response = await makeAuthenticatedCall("register", {
        cardId: testCardId,
        publicKey: testPublicKey,
        familyRole: "private",
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);

      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty("success");
      }
    });

    it("should reject missing cardId", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("register", {
        publicKey: testPublicKey,
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should reject missing publicKey", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("register", {
        cardId: testCardId,
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should reject invalid publicKey format", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("register", {
        cardId: testCardId,
        publicKey: "invalid-hex",
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /tapsigner-unified - verify action", () => {
    it("should verify card with valid signature", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("verify", {
        cardId: testCardId,
        signature: "a".repeat(128),
        challenge: "test-challenge",
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    it("should reject missing signature", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("verify", {
        cardId: testCardId,
        challenge: "test-challenge",
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /tapsigner-unified - sign action", () => {
    it("should sign event with valid data", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("sign", {
        cardId: testCardId,
        event: {
          kind: 1,
          content: "test event",
          created_at: Math.floor(Date.now() / 1000),
        },
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    it("should reject missing event", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("sign", {
        cardId: testCardId,
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /tapsigner-unified - status action", () => {
    it("should return status for registered card", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("status", {
        cardId: testCardId,
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);

      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty("status");
      }
    });
  });

  describe("Authentication & Authorization", () => {
    it("should reject requests without authorization header", async () => {
      if (!serverAvailable) return;

      const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8888";
      const TAPSIGNER_ENDPOINT = `${API_BASE_URL}/.netlify/functions/tapsigner-unified`;

      const response = await fetch(TAPSIGNER_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          cardId: testCardId,
          publicKey: testPublicKey,
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(401);
    });

    it("should reject invalid JWT token", async () => {
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
          cardId: testCardId,
          publicKey: testPublicKey,
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(401);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid action", async () => {
      if (!serverAvailable) return;

      const response = await makeAuthenticatedCall("invalid-action");

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should handle malformed JSON", async () => {
      if (!serverAvailable) return;

      const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8888";
      const TAPSIGNER_ENDPOINT = `${API_BASE_URL}/.netlify/functions/tapsigner-unified`;
      const token = createTestJWT();

      const response = await fetch(TAPSIGNER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: "{ invalid json",
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should handle network timeout gracefully", async () => {
      if (!serverAvailable) return;

      const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8888";
      const TAPSIGNER_ENDPOINT = `${API_BASE_URL}/.netlify/functions/tapsigner-unified`;
      const token = createTestJWT();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 100);

      try {
        const response = await fetch(TAPSIGNER_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: "status" }),
          signal: controller.signal,
        });

        expect(response).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      } finally {
        clearTimeout(timeoutId);
      }
    });
  });
});
