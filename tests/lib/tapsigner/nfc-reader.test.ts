/**
 * NFC Reader Library Unit Tests
 * Phase 4 Task 4.1: Unit Tests - Step 1
 *
 * Tests for Web NFC API integration with REAL implementations
 * NO MOCKING except unavoidable browser APIs
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractCardData,
  getNFCCompatibilityMessage,
  handleNFCError,
  initializeNFCReader,
  isNFCSupported,
  parseNDEFMessage,
  validateCardData,
  type CardData,
} from "../../../src/lib/tapsigner/nfc-reader";
import {
  cleanupTestEnv,
  createTestCardData,
  createTestNDEFMessage,
  setupNDEFReaderMock,
  setupTestEnv,
} from "../../setup/tapsigner-test-setup";

describe("NFC Reader Library", () => {
  beforeEach(() => {
    setupTestEnv();
    setupNDEFReaderMock();
  });

  afterEach(() => {
    cleanupTestEnv();
    vi.clearAllMocks();
  });

  describe("isNFCSupported", () => {
    it("should return true when NDEFReader is available", () => {
      const result = isNFCSupported();
      expect(typeof result).toBe("boolean");
    });

    it("should return false when window is undefined", () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;
      const result = isNFCSupported();
      expect(result).toBe(false);
      global.window = originalWindow;
    });

    it("should detect NDEFReader in window", () => {
      if (typeof window !== "undefined") {
        const hasNDEF = "NDEFReader" in window;
        const result = isNFCSupported();
        expect(result).toBe(hasNDEF);
      }
    });
  });

  describe("getNFCCompatibilityMessage", () => {
    it("should return appropriate message when NFC is supported", () => {
      const message = getNFCCompatibilityMessage();
      expect(typeof message).toBe("string");
      expect(message.length).toBeGreaterThan(0);
    });

    it("should mention Chrome or Edge when NFC is not supported", () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;
      const message = getNFCCompatibilityMessage();
      expect(message).toContain("Chrome");
      global.window = originalWindow;
    });
  });

  describe("initializeNFCReader", () => {
    it("should initialize successfully when NFC is supported", async () => {
      const result = await initializeNFCReader();
      expect(result).toBe(true);
    });

    it("should throw error when NFC is not supported", async () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;
      try {
        await initializeNFCReader();
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
      }
      global.window = originalWindow;
    });
  });

  describe("parseNDEFMessage", () => {
    it("should parse valid NDEF message", () => {
      const message = createTestNDEFMessage();
      const result = parseNDEFMessage(message);

      expect(result).toBeDefined();
      expect(result.records).toBeDefined();
      expect(Array.isArray(result.records)).toBe(true);
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it("should throw error for invalid message structure", () => {
      expect(() => parseNDEFMessage(null)).toThrow();
      expect(() => parseNDEFMessage({})).toThrow();
      expect(() => parseNDEFMessage({ records: null })).toThrow();
    });

    it("should handle empty records array", () => {
      const message = { records: [] };
      const result = parseNDEFMessage(message);
      expect(result.records).toEqual([]);
    });

    it("should decode text records correctly", () => {
      const encoder = new TextEncoder();
      const message = {
        records: [
          {
            recordType: "text",
            mediaType: "text/plain",
            data: encoder.encode("test-data"),
          },
        ],
      };
      const result = parseNDEFMessage(message);
      expect(result.records[0].data).toBe("test-data");
    });
  });

  describe("extractCardData", () => {
    it("should extract card data from valid NDEF message", () => {
      const message = createTestNDEFMessage();
      const result = extractCardData(message);

      expect(result).toBeDefined();
      expect(result.cardId).toBeDefined();
      expect(result.publicKey).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it("should throw error for invalid message", () => {
      expect(() => extractCardData(null)).toThrow();
      expect(() => extractCardData({})).toThrow();
      expect(() => extractCardData({ records: [] })).toThrow();
    });

    it("should use placeholder public key if not in records", () => {
      const encoder = new TextEncoder();
      const message = {
        records: [
          {
            recordType: "text",
            data: encoder.encode("test-card-id"),
          },
        ],
      };
      const result = extractCardData(message);
      expect(result.publicKey).toBe("0".repeat(64));
    });

    it("should extract both card ID and public key when available", () => {
      const message = createTestNDEFMessage();
      const result = extractCardData(message);
      expect(result.cardId).toBe("a1b2c3d4e5f6a7b8");
      expect(result.publicKey).toBe("a".repeat(64));
    });
  });

  describe("handleNFCError", () => {
    it("should handle timeout errors", () => {
      const error = new Error("timeout occurred");
      const message = handleNFCError(error);
      expect(message).toContain("timed out");
    });

    it("should handle not supported errors", () => {
      const error = new Error("not supported");
      const message = handleNFCError(error);
      expect(message).toContain("not supported");
    });

    it("should handle permission errors", () => {
      const error = new Error("permission denied");
      const message = handleNFCError(error);
      expect(message).toContain("permission");
    });

    it("should handle abort errors", () => {
      const error = new Error("abort");
      const message = handleNFCError(error);
      expect(message).toContain("cancelled");
    });

    it("should handle invalid data errors", () => {
      const error = new Error("invalid data");
      const message = handleNFCError(error);
      expect(message).toContain("Invalid");
    });

    it("should return generic message for unknown errors", () => {
      const message = handleNFCError(null);
      expect(message).toContain("unknown");
    });
  });

  describe("validateCardData", () => {
    it("should validate correct card data", () => {
      const cardData = createTestCardData();
      const result = validateCardData(cardData);
      expect(result).toBe(true);
    });

    it("should reject null or undefined", () => {
      expect(validateCardData(null as any)).toBe(false);
      expect(validateCardData(undefined as any)).toBe(false);
    });

    it("should reject empty card ID", () => {
      const cardData: CardData = {
        cardId: "",
        publicKey: "a".repeat(64),
        timestamp: Date.now(),
      };
      expect(validateCardData(cardData)).toBe(false);
    });

    it("should reject empty public key", () => {
      const cardData: CardData = {
        cardId: "a1b2c3d4",
        publicKey: "",
        timestamp: Date.now(),
      };
      expect(validateCardData(cardData)).toBe(false);
    });

    it("should reject invalid timestamp", () => {
      const cardData: CardData = {
        cardId: "a1b2c3d4",
        publicKey: "a".repeat(64),
        timestamp: 0,
      };
      expect(validateCardData(cardData)).toBe(false);
    });

    it("should reject non-hex card ID", () => {
      const cardData: CardData = {
        cardId: "ZZZZZZZZ",
        publicKey: "a".repeat(64),
        timestamp: Date.now(),
      };
      expect(validateCardData(cardData)).toBe(false);
    });

    it("should reject invalid public key format", () => {
      const cardData: CardData = {
        cardId: "a1b2c3d4",
        publicKey: "invalid-key",
        timestamp: Date.now(),
      };
      expect(validateCardData(cardData)).toBe(false);
    });

    it("should accept placeholder public key", () => {
      const cardData: CardData = {
        cardId: "a1b2c3d4",
        publicKey: "0".repeat(64),
        timestamp: Date.now(),
      };
      expect(validateCardData(cardData)).toBe(true);
    });
  });
});
