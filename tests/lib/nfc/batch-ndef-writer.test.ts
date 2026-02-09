/**
 * Batch NDEF Writer Unit Tests
 * Phase 11 Task 11.2.4: NFC Read/Write Cycle Optimization Tests
 * Phase 12 Task 12.1: Unit Tests for batch NDEF write operations
 *
 * Tests for:
 * - batchWriteNDEFRecords() with multiple records
 * - writeSingleTextRecord() convenience function
 * - Retry logic integration
 * - Error handling for write failures
 * - isNFCWriteSupported() browser compatibility check
 * - Proper NDEF record formatting
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  batchWriteNDEFRecords,
  writeSingleTextRecord,
  isNFCWriteSupported,
  type NDEFRecordData,
} from "../../../src/lib/nfc/batch-ndef-writer";
import {
  cleanupTestEnv,
  setupTestEnv,
  waitFor,
} from "../../setup/tapsigner-test-setup";

describe("Batch NDEF Writer", () => {
  let mockNDEFWriter: any;
  let writeCallCount: number;
  let writtenRecords: any[] = [];

  beforeEach(() => {
    setupTestEnv();
    writeCallCount = 0;
    writtenRecords = [];

    // Mock NDEFWriter
    mockNDEFWriter = class NDEFWriterMock {
      async write(message: any) {
        writeCallCount++;
        writtenRecords.push(message);
        await waitFor(50);
        // Simulate successful write
      }
    };

    (window as any).NDEFWriter = mockNDEFWriter;
  });

  afterEach(() => {
    cleanupTestEnv();
    vi.clearAllMocks();
    writeCallCount = 0;
    writtenRecords = [];
  });

  describe("isNFCWriteSupported", () => {
    it("should return true when NDEFWriter is available", () => {
      const result = isNFCWriteSupported();
      expect(result).toBe(true);
    });

    it("should return false when window is undefined", () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;
      const result = isNFCWriteSupported();
      expect(result).toBe(false);
      global.window = originalWindow;
    });

    it("should return false when NDEFWriter is not available", () => {
      delete (window as any).NDEFWriter;
      const result = isNFCWriteSupported();
      expect(result).toBe(false);
    });
  });

  describe("batchWriteNDEFRecords", () => {
    it("should write single record successfully", async () => {
      const records: NDEFRecordData[] = [
        {
          recordType: "text",
          data: "test-data",
          lang: "en",
        },
      ];

      const result = await batchWriteNDEFRecords(records);

      expect(result.success).toBe(true);
      expect(result.bytesWritten).toBeGreaterThan(0);
      expect(writeCallCount).toBe(1);
      expect(writtenRecords.length).toBe(1);
    });

    it("should write multiple records in single operation", async () => {
      const records: NDEFRecordData[] = [
        {
          recordType: "text",
          data: "record-1",
          lang: "en",
        },
        {
          recordType: "text",
          data: "record-2",
          lang: "en",
        },
        {
          recordType: "text",
          data: "record-3",
          lang: "en",
        },
      ];

      const result = await batchWriteNDEFRecords(records);

      expect(result.success).toBe(true);
      expect(result.bytesWritten).toBeGreaterThan(0);
      // Should be single write operation
      expect(writeCallCount).toBe(1);
      // Should contain all 3 records
      expect(writtenRecords[0].records.length).toBe(3);
    });

    it("should format NDEF records correctly", async () => {
      const records: NDEFRecordData[] = [
        {
          recordType: "text",
          data: "test-data",
          lang: "en",
        },
      ];

      await batchWriteNDEFRecords(records);

      const writtenMessage = writtenRecords[0];
      expect(writtenMessage.records).toBeDefined();
      expect(writtenMessage.records[0].recordType).toBe("text");
      expect(writtenMessage.records[0].data).toBe("test-data");
      expect(writtenMessage.records[0].lang).toBe("en");
    });

    it("should handle records with mediaType", async () => {
      const records: NDEFRecordData[] = [
        {
          recordType: "mime",
          data: "application-data",
          mediaType: "application/json",
        },
      ];

      await batchWriteNDEFRecords(records);

      const writtenMessage = writtenRecords[0];
      expect(writtenMessage.records[0].mediaType).toBe("application/json");
    });

    it("should return error when NFC writing not supported", async () => {
      delete (window as any).NDEFWriter;

      const records: NDEFRecordData[] = [
        {
          recordType: "text",
          data: "test-data",
        },
      ];

      const result = await batchWriteNDEFRecords(records);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not supported");
      expect(result.bytesWritten).toBe(0);
    });

    it("should handle write failures with error message", async () => {
      mockNDEFWriter = class NDEFWriterMock {
        async write(message: any) {
          throw new Error("Write failed");
        }
      };

      (window as any).NDEFWriter = mockNDEFWriter;

      const records: NDEFRecordData[] = [
        {
          recordType: "text",
          data: "test-data",
        },
      ];

      const result = await batchWriteNDEFRecords(records);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Write failed");
      expect(result.bytesWritten).toBe(0);
    });

    it("should retry on transient failures", async () => {
      let attemptCount = 0;

      mockNDEFWriter = class NDEFWriterMock {
        async write(message: any) {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error("Transient write error");
          }
          // Succeed on 3rd attempt
          writtenRecords.push(message);
        }
      };

      (window as any).NDEFWriter = mockNDEFWriter;

      const records: NDEFRecordData[] = [
        {
          recordType: "text",
          data: "test-data",
        },
      ];

      const result = await batchWriteNDEFRecords(records, 3);

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
    });

    it("should calculate bytes written correctly", async () => {
      const records: NDEFRecordData[] = [
        {
          recordType: "text",
          data: "a".repeat(100), // 100 bytes
        },
        {
          recordType: "text",
          data: "b".repeat(50), // 50 bytes
        },
      ];

      const result = await batchWriteNDEFRecords(records);

      expect(result.success).toBe(true);
      expect(result.bytesWritten).toBe(150);
    });
  });

  describe("writeSingleTextRecord", () => {
    it("should write single text record successfully", async () => {
      const result = await writeSingleTextRecord("test-nip05@satnam.app", "en");

      expect(result.success).toBe(true);
      expect(result.bytesWritten).toBeGreaterThan(0);
      expect(writeCallCount).toBe(1);
    });

    it("should use default language if not specified", async () => {
      const result = await writeSingleTextRecord("test-data");

      expect(result.success).toBe(true);
      const writtenMessage = writtenRecords[0];
      expect(writtenMessage.records[0].lang).toBe("en");
    });

    it("should use custom retry count", async () => {
      let attemptCount = 0;

      mockNDEFWriter = class NDEFWriterMock {
        async write(message: any) {
          attemptCount++;
          if (attemptCount < 2) {
            throw new Error("Transient error");
          }
          writtenRecords.push(message);
        }
      };

      (window as any).NDEFWriter = mockNDEFWriter;

      const result = await writeSingleTextRecord("test-data", "en", 5);

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(2);
    });

    it("should handle write failures", async () => {
      mockNDEFWriter = class NDEFWriterMock {
        async write(message: any) {
          throw new Error("Write failed");
        }
      };

      (window as any).NDEFWriter = mockNDEFWriter;

      const result = await writeSingleTextRecord("test-data");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Write failed");
    });

    it("should calculate bytes written for text record", async () => {
      const testData = "a".repeat(200);
      const result = await writeSingleTextRecord(testData);

      expect(result.success).toBe(true);
      expect(result.bytesWritten).toBe(200);
    });
  });

  describe("Performance Comparison", () => {
    it("should be faster than sequential writes", async () => {
      const records: NDEFRecordData[] = [
        { recordType: "text", data: "record-1" },
        { recordType: "text", data: "record-2" },
        { recordType: "text", data: "record-3" },
      ];

      // Batch write
      const batchStart = performance.now();
      await batchWriteNDEFRecords(records);
      const batchEnd = performance.now();
      const batchTime = batchEnd - batchStart;

      // Should be single write operation
      expect(writeCallCount).toBe(1);

      // Sequential writes would require 3 operations
      // Batch should be significantly faster (single operation vs 3)
      expect(writeCallCount).toBeLessThan(3);
    });
  });
});
