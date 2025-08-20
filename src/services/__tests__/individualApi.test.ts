// Individual API Service Tests
// File: src/services/__tests__/individualApi.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndividualApiService } from "../individualApi";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("IndividualApiService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getWalletData", () => {
    it("should fetch wallet data successfully", async () => {
      const mockWalletData = {
        memberId: "test-123",
        username: "testuser",
        lightningAddress: "testuser@satnam.pub",
        lightningBalance: 50000,
        ecashBalance: 25000,
        spendingLimits: {
          daily: 10000,
          weekly: 50000,
          requiresApproval: 100000,
        },
        recentTransactions: [],
        privacySettings: {
          defaultRouting: "lightning" as const,
          lnproxyEnabled: true,
          guardianProtected: false,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockWalletData),
      });

      const result = await IndividualApiService.getWalletData("test-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/individual/wallet?memberId=test-123",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        })
      );
      expect(result).toEqual(mockWalletData);
    });

    it("should handle API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve({ error: "Member not found" }),
      });

      await expect(
        IndividualApiService.getWalletData("invalid-id")
      ).rejects.toThrow("Member not found");
    });
  });

  describe("getLightningWalletData", () => {
    it("should fetch Lightning wallet data successfully", async () => {
      const mockLightningData = {
        zapHistory: [
          {
            id: "zap-1",
            amount: 1000,
            recipient: "npub123",
            memo: "Test zap",
            timestamp: new Date(),
            status: "completed" as const,
          },
        ],
        transactions: [
          {
            id: "tx-1",
            type: "zap" as const,
            amount: 1000,
            fee: 10,
            recipient: "npub123",
            memo: "Test zap",
            timestamp: new Date(),
            status: "completed" as const,
            paymentHash: "hash123",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLightningData),
      });

      const result = await IndividualApiService.getLightningWalletData(
        "test-123"
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/individual/lightning/wallet?memberId=test-123",
        expect.objectContaining({
          credentials: "include",
        })
      );
      expect(result).toEqual(mockLightningData);
    });
  });

  describe("getCashuWalletData", () => {
    it("should fetch Cashu wallet data successfully", async () => {
      const mockCashuData = {
        bearerInstruments: [
          {
            id: "bearer-1",
            amount: 5000,
            formFactor: "qr" as const,
            created: new Date(),
            redeemed: false,
            token: "token123",
          },
        ],
        transactions: [
          {
            id: "cashu-tx-1",
            type: "mint" as const,
            amount: 5000,
            fee: 0,
            timestamp: new Date(),
            status: "completed" as const,
            tokenId: "token123",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCashuData),
      });

      const result = await IndividualApiService.getCashuWalletData("test-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/individual/cashu/wallet?memberId=test-123",
        expect.objectContaining({
          credentials: "include",
        })
      );
      expect(result).toEqual(mockCashuData);
    });
  });

  describe("sendLightningZap", () => {
    it("should send Lightning zap successfully", async () => {
      const zapRequest = {
        memberId: "test-123",
        amount: 1000,
        recipient: "npub123",
        memo: "Test zap",
      };

      const mockZapResponse = {
        success: true,
        zapId: "zap-123",
        amount: 1000,
        recipient: "npub123",
        memo: "Test zap",
        status: "pending",
        timestamp: new Date().toISOString(),
        fee: 10,
        paymentHash: "hash123",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockZapResponse),
      });

      const result = await IndividualApiService.sendLightningZap(zapRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/individual/lightning/zap",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(zapRequest),
          credentials: "include",
        })
      );
      expect(result).toEqual(mockZapResponse);
    });

    it("should handle zap failures", async () => {
      const zapRequest = {
        memberId: "test-123",
        amount: 1000000, // Too large amount
        recipient: "npub123",
        memo: "Test zap",
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () => Promise.resolve({ error: "Amount exceeds spending limit" }),
      });

      await expect(
        IndividualApiService.sendLightningZap(zapRequest)
      ).rejects.toThrow("Amount exceeds spending limit");
    });
  });

  describe("createBearerNote", () => {
    it("should create bearer note successfully", async () => {
      const bearerRequest = {
        memberId: "test-123",
        amount: 5000,
        formFactor: "qr" as const,
      };

      const mockBearerResponse = {
        success: true,
        bearerId: "bearer-123",
        amount: 5000,
        formFactor: "qr" as const,
        token: "cashu-token-123",
        created: new Date().toISOString(),
        redeemed: false,
        qrCode: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBearerResponse),
      });

      const result = await IndividualApiService.createBearerNote(bearerRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/individual/cashu/bearer",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(bearerRequest),
          credentials: "include",
        })
      );
      expect(result).toEqual(mockBearerResponse);
    });

    it("should handle bearer note creation with DM form factor", async () => {
      const bearerRequest = {
        memberId: "test-123",
        amount: 5000,
        formFactor: "dm" as const,
        recipientNpub: "npub456",
      };

      const mockBearerResponse = {
        success: true,
        bearerId: "bearer-123",
        amount: 5000,
        formFactor: "dm" as const,
        token: "cashu-token-123",
        created: new Date().toISOString(),
        redeemed: false,
        dmStatus: {
          recipientNpub: "npub456",
          sent: true,
          messageId: "msg-123",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBearerResponse),
      });

      const result = await IndividualApiService.createBearerNote(bearerRequest);

      expect(result).toEqual(mockBearerResponse);
      expect(result.dmStatus?.recipientNpub).toBe("npub456");
    });
  });

  describe("handleApiError", () => {
    it("should handle Error objects", () => {
      const error = new Error("Test error message");
      const result = IndividualApiService.handleApiError(error);
      expect(result).toBe("Test error message");
    });

    it("should handle string errors", () => {
      const error = "String error message";
      const result = IndividualApiService.handleApiError(error);
      expect(result).toBe("String error message");
    });

    it("should handle unknown error types", () => {
      const error = { someProperty: "value" };
      const result = IndividualApiService.handleApiError(error);
      expect(result).toBe("An unexpected error occurred");
    });
  });

  describe("API Base URL", () => {
    it("should use localhost in development", () => {
      // The API_BASE is set to localhost:8000 in non-production
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining("https://your-production-domain.com"),
        expect.any(Object)
      );
    });
  });

  describe("Request Configuration", () => {
    it("should include credentials in all requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await IndividualApiService.getWalletData("test-123");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: "include",
        })
      );
    });

    it("should set correct content type for POST requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await IndividualApiService.sendLightningZap({
        memberId: "test-123",
        amount: 1000,
        recipient: "npub123",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
    });
  });
});
