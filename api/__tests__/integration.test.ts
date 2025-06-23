import { describe, expect, it } from "vitest";

// Integration tests that test the actual API flow
describe("API Integration Tests", () => {
  const API_BASE = process.env.API_BASE || "";

  describe("API Flow Integration", () => {
    it("should complete a full family payment flow", async () => {
      // 1. Check system health
      const healthResponse = await fetch(`${API_BASE}/api/health`);
      expect(healthResponse.ok).toBe(true);

      const healthData = await healthResponse.json();
      expect(healthData.success).toBe(true);

      // 2. Get individual wallet data
      const walletResponse = await fetch(
        `${API_BASE}/api/individual/wallet?memberId=test-member`
      );
      expect(walletResponse.ok).toBe(true);

      const walletData = await walletResponse.json();
      expect(walletData.success).toBe(true);
      expect(walletData.data.memberId).toBe("test-member");

      // 3. Send a Lightning zap
      const zapResponse = await fetch(
        `${API_BASE}/api/individual/lightning/zap`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            memberId: "test-member",
            amount: 1000,
            recipient: "npub1test123",
            memo: "Integration test zap",
          }),
        }
      );

      expect(zapResponse.ok).toBe(true);
      const zapData = await zapResponse.json();
      expect(zapData.success).toBe(true);
      expect(zapData.data.amount).toBe(1000);
    });

    it("should complete atomic swap flow", async () => {
      // 1. Execute atomic swap
      const swapResponse = await fetch(`${API_BASE}/api/bridge/atomic-swap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fromContext: "lightning",
          toContext: "fedimint",
          fromMemberId: "parent1",
          toMemberId: "child1",
          amount: 50000,
          purpose: "allowance",
        }),
      });

      expect(swapResponse.ok).toBe(true);
      const swapData = await swapResponse.json();
      expect(swapData.success).toBe(true);

      const swapId = swapData.data.swapId;
      expect(swapId).toBeDefined();

      // 2. Check swap status
      const statusResponse = await fetch(
        `${API_BASE}/api/bridge/swap-status?swapId=${swapId}`
      );
      expect(statusResponse.ok).toBe(true);

      const statusData = await statusResponse.json();
      expect(statusData.success).toBe(true);
      expect(statusData.data.swap.swap_id).toBe(swapId);
    });

    it("should handle error cases gracefully", async () => {
      // Test invalid zap request
      const invalidZapResponse = await fetch(
        `${API_BASE}/api/individual/lightning/zap`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            // Missing required fields
            amount: 1000,
          }),
        }
      );

      expect(invalidZapResponse.status).toBe(400);
      const errorData = await invalidZapResponse.json();
      expect(errorData.success).toBe(false);
      expect(errorData.error).toContain("Missing required fields");
    });

    it("should handle CORS properly", async () => {
      const response = await fetch(`${API_BASE}/api/health`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
          "Access-Control-Request-Method": "GET",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
    });
  });

  describe("Service Status Integration", () => {
    it("should check all service statuses", async () => {
      const services = [
        "/api/lightning/status",
        "/api/phoenixd/status",
        "/api/fedimint/status",
      ];

      for (const service of services) {
        const response = await fetch(`${API_BASE}${service}`);
        expect(response.ok).toBe(true);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data).toBeDefined();
        expect(data.meta.timestamp).toBeDefined();
      }
    });
  });

  describe("Data Consistency", () => {
    it("should maintain consistent data format across endpoints", async () => {
      const endpoints = [
        "/api/health",
        "/api/test",
        "/api/lightning/status",
        "/api/individual/wallet?memberId=test",
      ];

      for (const endpoint of endpoints) {
        const response = await fetch(`${API_BASE}${endpoint}`);
        expect(response.ok).toBe(true);

        const data = await response.json();

        // Check consistent response structure
        expect(data).toHaveProperty("success");
        expect(data).toHaveProperty("meta");
        expect(data.meta).toHaveProperty("timestamp");
        expect(typeof data.success).toBe("boolean");
        expect(typeof data.meta.timestamp).toBe("string");

        if (data.success) {
          expect(data).toHaveProperty("data");
        } else {
          expect(data).toHaveProperty("error");
        }
      }
    });
  });

  describe("Performance Tests", () => {
    it("should respond within reasonable time limits", async () => {
      const startTime = Date.now();

      const response = await fetch(`${API_BASE}/api/health`);
      expect(response.ok).toBe(true);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Should respond within 5 seconds (generous for demo endpoints)
      expect(responseTime).toBeLessThan(5000);
    });

    it("should handle concurrent requests", async () => {
      const concurrentRequests = Array(10)
        .fill(null)
        .map(() => fetch(`${API_BASE}/api/health`));

      const responses = await Promise.all(concurrentRequests);

      for (const response of responses) {
        expect(response.ok).toBe(true);
        const data = await response.json();
        expect(data.success).toBe(true);
      }
    });
  });
});
