/**
 * @fileoverview Individual API Integration Tests
 * @description Vitest tests for individual wallet API endpoints
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { cashuAPI, healthAPI } from "../lib/api";

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Individual API Integration", () => {
  beforeAll(() => {
    // Reset mocks before each test suite
    vi.clearAllMocks();
  });

  describe("Health Check", () => {
    it("should check server health", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            message: "Identity Forge API is healthy",
            timestamp: new Date().toISOString(),
            version: "1.0.0",
          }),
      });

      const response = await healthAPI.check();

      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty("message");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/health",
        expect.objectContaining({
          method: "GET",
          credentials: "include",
        })
      );
    });
  });

  describe("Cashu Bearer API", () => {
    it("should create QR bearer note", async () => {
      const mockResponse = {
        success: true,
        bearerId: "bearer_123",
        amount: 1000,
        formFactor: "qr",
        qrCode: "data:image/png;base64,mock_qr_data",
        cashuToken: "cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHA...",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const testData = {
        memberId: "test_member_123",
        amount: 1000,
        formFactor: "qr" as const,
      };

      const response = await cashuAPI.createBearer(testData);

      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty("bearerId");
      expect(response.data).toHaveProperty("qrCode");
      expect(response.data?.amount).toBe(1000);
      expect(response.data?.formFactor).toBe("qr");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/individual/cashu/bearer",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(testData),
        })
      );
    });

    it("should create NFC bearer note", async () => {
      const mockResponse = {
        success: true,
        bearerId: "bearer_456",
        amount: 2000,
        formFactor: "nfc",
        nfcData: "mock_nfc_data",
        cashuToken: "cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHA...",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const testData = {
        memberId: "test_member_456",
        amount: 2000,
        formFactor: "nfc" as const,
      };

      const response = await cashuAPI.createBearer(testData);

      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty("nfcData");
      expect(response.data?.amount).toBe(2000);
      expect(response.data?.formFactor).toBe("nfc");
    });

    it("should create DM bearer note with recipient", async () => {
      const mockResponse = {
        success: true,
        bearerId: "bearer_789",
        amount: 5000,
        formFactor: "dm",
        dmStatus: {
          sent: true,
          recipientNpub: "npub1test123456789",
          messageId: "dm_msg_123",
        },
        cashuToken: "cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHA...",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const testData = {
        memberId: "test_member_789",
        amount: 5000,
        formFactor: "dm" as const,
        recipientNpub: "npub1test123456789",
      };

      const response = await cashuAPI.createBearer(testData);

      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty("dmStatus");
      expect(response.data?.dmStatus?.sent).toBe(true);
      expect(response.data?.dmStatus?.recipientNpub).toBe("npub1test123456789");
    });

    it("should create physical bearer note", async () => {
      const mockResponse = {
        success: true,
        bearerId: "bearer_physical_001",
        amount: 10000,
        formFactor: "physical",
        physicalInstructions: "Print this token and store securely",
        cashuToken: "cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHA...",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const testData = {
        memberId: "test_member_physical",
        amount: 10000,
        formFactor: "physical" as const,
      };

      const response = await cashuAPI.createBearer(testData);

      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty("physicalInstructions");
      expect(response.data?.amount).toBe(10000);
      expect(response.data?.formFactor).toBe("physical");
    });

    it("should handle validation errors", async () => {
      const mockErrorResponse = {
        success: false,
        error: "Validation failed",
        details: {
          memberId: "Member ID is required",
          amount: "Amount must be a positive number",
          formFactor: "Form factor must be one of: qr, nfc, dm, physical",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(mockErrorResponse),
      });

      const invalidData = {
        memberId: "",
        amount: -100,
        formFactor: "invalid" as any,
      };

      const response = await cashuAPI.createBearer(invalidData);

      expect(response.success).toBe(false);
      expect(response.error).toContain("Validation failed");
    });

    it("should handle server errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            success: false,
            error: "Internal server error",
          }),
      });

      const testData = {
        memberId: "test_member",
        amount: 1000,
        formFactor: "qr" as const,
      };

      const response = await cashuAPI.createBearer(testData);

      expect(response.success).toBe(false);
      expect(response.error).toContain("Internal server error");
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network connection failed"));

      const testData = {
        memberId: "test_member",
        amount: 1000,
        formFactor: "qr" as const,
      };

      const response = await cashuAPI.createBearer(testData);

      expect(response.success).toBe(false);
      expect(response.error).toContain("Network connection failed");
    });
  });

  describe("API Request Configuration", () => {
    it("should include proper headers in requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await cashuAPI.createBearer({
        memberId: "test",
        amount: 1000,
        formFactor: "qr",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/individual/cashu/bearer",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          credentials: "include",
        })
      );
    });

    it("should use correct HTTP methods", async () => {
      // Test GET request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await healthAPI.check();

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/health",
        expect.objectContaining({
          method: "GET",
        })
      );

      // Test POST request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await cashuAPI.createBearer({
        memberId: "test",
        amount: 1000,
        formFactor: "qr",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/individual/cashu/bearer",
        expect.objectContaining({
          method: "POST",
        })
      );
    });
  });

  describe("Response Handling", () => {
    it("should parse JSON responses correctly", async () => {
      const mockData = {
        success: true,
        message: "Test response",
        data: { key: "value" },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const response = await healthAPI.check();

      expect(response).toEqual(mockData);
    });

    it("should handle non-JSON responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.reject(new Error("Invalid JSON")),
      });

      const response = await healthAPI.check();

      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
    });
  });
});
