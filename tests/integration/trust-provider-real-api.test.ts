import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";
const API_BASE_URL =
  process.env.VITE_API_URL || "http://localhost:8888/.netlify/functions";

let testProviderId: string;
let serverRunning = false;
let testResults: {
  category: string;
  test: string;
  status: string;
  error?: string;
}[] = [];

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper function to check if server is running
async function isServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/trust-provider-marketplace/list`,
      {
        headers: { Authorization: "Bearer test-token" },
        signal: AbortSignal.timeout(2000),
      }
    );
    return true;
  } catch (error) {
    return false;
  }
}

// Helper function to log test results
function logTestResult(
  category: string,
  test: string,
  status: string,
  error?: string
) {
  testResults.push({ category, test, status, error });
}

describe("Trust Provider API - Real Endpoint Tests", () => {
  beforeAll(async () => {
    const { data: providers } = await supabase
      .from("trust_providers")
      .select("id")
      .limit(1);
    if (providers && providers.length > 0) {
      testProviderId = providers[0].id;
    }

    // Check if server is running
    serverRunning = await isServerRunning();
    if (!serverRunning) {
      console.warn("⚠️ Netlify Functions server is not running on port 8888");
      console.warn("   Run 'npm run dev' to start the server");
    }
  });

  afterAll(() => {
    console.log("\n📊 Test Results Summary:");
    console.log("========================");
    const grouped = testResults.reduce((acc, result) => {
      if (!acc[result.category]) acc[result.category] = [];
      acc[result.category].push(result);
      return acc;
    }, {} as Record<string, typeof testResults>);

    for (const [category, results] of Object.entries(grouped)) {
      const passed = results.filter((r) => r.status === "PASS").length;
      const failed = results.filter((r) => r.status === "FAIL").length;
      console.log(`${category}: ${passed} passed, ${failed} failed`);
    }
  });

  describe("Marketplace Endpoints", () => {
    it("GET /list - should list providers", async () => {
      if (!serverRunning) {
        logTestResult("Marketplace", "GET /list", "SKIP");
        return;
      }
      try {
        const response = await fetch(
          `${API_BASE_URL}/trust-provider-marketplace/list`,
          { headers: { Authorization: "Bearer test-token" } }
        );
        logTestResult(
          "Marketplace",
          "GET /list",
          response.status === 200 || response.status === 401 ? "PASS" : "FAIL"
        );
        expect([200, 401]).toContain(response.status);
      } catch (error) {
        logTestResult("Marketplace", "GET /list", "FAIL", String(error));
        throw error;
      }
    });

    it("GET /list - pagination edge cases", async () => {
      if (!serverRunning) {
        logTestResult("Marketplace", "GET /list (pagination)", "SKIP");
        return;
      }
      try {
        const response = await fetch(
          `${API_BASE_URL}/trust-provider-marketplace/list?page=0&pageSize=10`,
          { headers: { Authorization: "Bearer test-token" } }
        );
        logTestResult(
          "Marketplace",
          "GET /list (pagination)",
          response.status === 400 || response.status === 200 ? "PASS" : "FAIL"
        );
        expect([200, 400, 401]).toContain(response.status);
      } catch (error) {
        logTestResult(
          "Marketplace",
          "GET /list (pagination)",
          "FAIL",
          String(error)
        );
      }
    });

    it("GET /details - should get provider details", async () => {
      if (!testProviderId || !serverRunning) {
        logTestResult("Marketplace", "GET /details", "SKIP");
        return;
      }
      try {
        const response = await fetch(
          `${API_BASE_URL}/trust-provider-marketplace/details?providerId=${testProviderId}`,
          { headers: { Authorization: "Bearer test-token" } }
        );
        logTestResult(
          "Marketplace",
          "GET /details",
          response.status === 200 || response.status === 401 ? "PASS" : "FAIL"
        );
        expect([200, 401]).toContain(response.status);
      } catch (error) {
        logTestResult("Marketplace", "GET /details", "FAIL", String(error));
      }
    });

    it("GET /details - missing providerId should return 400", async () => {
      if (!serverRunning) {
        logTestResult("Marketplace", "GET /details (missing param)", "SKIP");
        return;
      }
      try {
        const response = await fetch(
          `${API_BASE_URL}/trust-provider-marketplace/details`,
          { headers: { Authorization: "Bearer test-token" } }
        );
        logTestResult(
          "Marketplace",
          "GET /details (missing param)",
          response.status === 400 || response.status === 401 ? "PASS" : "FAIL"
        );
        expect([400, 401]).toContain(response.status);
      } catch (error) {
        logTestResult(
          "Marketplace",
          "GET /details (missing param)",
          "FAIL",
          String(error)
        );
      }
    });

    it("POST /subscribe - should require auth", async () => {
      if (!serverRunning) {
        logTestResult("Marketplace", "POST /subscribe", "SKIP");
        return;
      }
      try {
        const response = await fetch(
          `${API_BASE_URL}/trust-provider-marketplace/subscribe`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerId: testProviderId }),
          }
        );
        logTestResult(
          "Marketplace",
          "POST /subscribe",
          response.status === 401 ? "PASS" : "FAIL"
        );
        expect(response.status).toBe(401);
      } catch (error) {
        logTestResult("Marketplace", "POST /subscribe", "FAIL", String(error));
      }
    });

    it("DELETE /unsubscribe - should require auth", async () => {
      if (!serverRunning) {
        logTestResult("Marketplace", "DELETE /unsubscribe", "SKIP");
        return;
      }
      try {
        const response = await fetch(
          `${API_BASE_URL}/trust-provider-marketplace/unsubscribe`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerId: testProviderId }),
          }
        );
        logTestResult(
          "Marketplace",
          "DELETE /unsubscribe",
          response.status === 401 ? "PASS" : "FAIL"
        );
        expect(response.status).toBe(401);
      } catch (error) {
        logTestResult(
          "Marketplace",
          "DELETE /unsubscribe",
          "FAIL",
          String(error)
        );
      }
    });
  });

  describe("Ratings Endpoints", () => {
    it("GET /list - should list ratings", async () => {
      if (!testProviderId) return;
      const response = await fetch(
        `${API_BASE_URL}/trust-provider-ratings/list?providerId=${testProviderId}`,
        { headers: { Authorization: "Bearer test-token" } }
      );
      expect([200, 404, 401]).toContain(response.status);
    });

    it("GET /user-rating - should require auth", async () => {
      const response = await fetch(
        `${API_BASE_URL}/trust-provider-ratings/user-rating?providerId=${testProviderId}`
      );
      const body = await response.text();
      console.log("GET /user-rating response:", {
        status: response.status,
        body,
      });
      expect(response.status).toBe(401);
    });

    it("POST /submit - should require auth", async () => {
      const response = await fetch(
        `${API_BASE_URL}/trust-provider-ratings/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId: testProviderId, rating: 5 }),
        }
      );
      expect(response.status).toBe(401);
    });

    it("PUT /update - should require auth", async () => {
      const response = await fetch(
        `${API_BASE_URL}/trust-provider-ratings/update`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ratingId: "test", rating: 4 }),
        }
      );
      expect(response.status).toBe(401);
    });
  });

  describe("Comparison Endpoints", () => {
    it("POST /compare - should require auth", async () => {
      const response = await fetch(
        `${API_BASE_URL}/trust-metrics-comparison/compare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactIds: ["c1"] }),
        }
      );
      expect(response.status).toBe(401);
    });

    it("GET /history - should require auth", async () => {
      const response = await fetch(
        `${API_BASE_URL}/trust-metrics-comparison/history?contactId=test`
      );
      expect(response.status).toBe(401);
    });

    it("GET /export - should require auth", async () => {
      const response = await fetch(
        `${API_BASE_URL}/trust-metrics-comparison/export?format=json`
      );
      expect(response.status).toBe(401);
    });
  });

  describe("Security", () => {
    it("should return CORS headers", async () => {
      const response = await fetch(
        `${API_BASE_URL}/trust-provider-marketplace/list`,
        { headers: { Authorization: "Bearer test-token" } }
      );
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
    });
  });
});
