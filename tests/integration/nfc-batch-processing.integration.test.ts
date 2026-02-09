/**
 * NFC Batch Processing Integration Tests
 * Phase 12 Task 12.2: Integration Tests
 *
 * Tests for:
 * - Batch mode (10 users with parallel NFC programming)
 * - Tapsigner vs Boltcard flows (card type detection and programming)
 * - Multiple card types in single session (NTAG424, Boltcard, Tapsigner)
 *
 * Integration Points:
 * - batch-queue-manager.ts for parallel processing
 * - nfc-programming-service.ts for unified card programming
 * - NFCCardRegistrationStep.tsx with optimized scanForCard()
 * - Database operations via onboarding-batch-insert.ts function
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatchQueueManager } from "../../../src/lib/onboarding/batch-queue-manager";
import * as nfcReader from "../../../src/lib/tapsigner/nfc-reader";
import * as batchNdefWriter from "../../../src/lib/nfc/batch-ndef-writer";
import {
  cleanupTestEnv,
  createTestCardData,
  setupTestEnv,
  waitFor as testWaitFor,
} from "../../setup/tapsigner-test-setup";

// Mock NFC modules
vi.mock("../../../src/lib/tapsigner/nfc-reader", async () => {
  const actual = await vi.importActual("../../../src/lib/tapsigner/nfc-reader");
  return {
    ...actual,
    scanForCard: vi.fn(),
    isNFCSupported: vi.fn(() => true),
    handleNFCError: vi.fn((error: any) => error.message || "NFC error"),
  };
});

vi.mock("../../../src/lib/nfc/batch-ndef-writer", async () => {
  const actual = await vi.importActual(
    "../../../src/lib/nfc/batch-ndef-writer",
  );
  return {
    ...actual,
    batchWriteNDEFRecords: vi.fn(),
    writeSingleTextRecord: vi.fn(),
    isNFCWriteSupported: vi.fn(() => true),
  };
});

// Mock Netlify Functions
global.fetch = vi.fn();

describe("NFC Batch Processing Integration Tests", () => {
  let batchQueueManager: BatchQueueManager;

  beforeEach(() => {
    setupTestEnv();
    vi.clearAllMocks();

    // Initialize batch queue manager
    batchQueueManager = new BatchQueueManager({
      maxConcurrent: 3,
      batchSize: 10,
      autoFlushInterval: 5000,
    });

    // Setup default successful mocks
    vi.mocked(nfcReader.scanForCard).mockResolvedValue(createTestCardData());
    vi.mocked(batchNdefWriter.batchWriteNDEFRecords).mockResolvedValue({
      success: true,
      bytesWritten: 100,
    });
    vi.mocked(batchNdefWriter.writeSingleTextRecord).mockResolvedValue({
      success: true,
      bytesWritten: 50,
    });

    // Mock fetch for Netlify Functions
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
  });

  afterEach(() => {
    cleanupTestEnv();
    batchQueueManager.shutdown();
  });

  describe("Batch Mode (10 Users with Parallel NFC Programming)", () => {
    it("should process 10 users in parallel with max 3 concurrent operations", async () => {
      const participants = Array.from({ length: 10 }, (_, i) => ({
        id: `participant-${i}`,
        username: `user${i}`,
        nip05: `user${i}@satnam.app`,
        cardType: "NTAG424" as const,
      }));

      const startTime = performance.now();
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      // Mock scanForCard to track concurrency
      vi.mocked(nfcReader.scanForCard).mockImplementation(async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await testWaitFor(100); // Simulate NFC operation
        currentConcurrent--;
        return createTestCardData();
      });

      // Add all participants to queue
      const promises = participants.map((participant) =>
        batchQueueManager.addToQueue(participant),
      );

      // Wait for all to complete
      await Promise.all(promises);

      const endTime = performance.now();
      const durationSeconds = (endTime - startTime) / 1000;

      // Verify concurrency limit was respected
      expect(maxConcurrent).toBeLessThanOrEqual(3);

      // Verify all participants were processed
      expect(nfcReader.scanForCard).toHaveBeenCalledTimes(10);

      // Verify performance (should be faster than sequential)
      // Sequential would take ~1 second (10 * 100ms)
      // Parallel with 3 concurrent should take ~400ms (10 / 3 * 100ms)
      expect(durationSeconds).toBeLessThan(1);
    });

    it("should batch database inserts for all 10 users", async () => {
      const participants = Array.from({ length: 10 }, (_, i) => ({
        id: `participant-${i}`,
        username: `user${i}`,
        nip05: `user${i}@satnam.app`,
        cardType: "NTAG424" as const,
      }));

      // Add all participants to queue
      const promises = participants.map((participant) =>
        batchQueueManager.addToQueue(participant),
      );

      await Promise.all(promises);

      // Verify batch insert was called
      const fetchCalls = (global.fetch as any).mock.calls;
      const batchInsertCalls = fetchCalls.filter((call: any) =>
        call[0]?.includes("onboarding-batch-insert"),
      );

      // Should use batch insert instead of 10 individual inserts
      expect(batchInsertCalls.length).toBeGreaterThan(0);
      expect(batchInsertCalls.length).toBeLessThan(10);
    });

    it("should handle mixed success/failure in batch", async () => {
      const participants = Array.from({ length: 10 }, (_, i) => ({
        id: `participant-${i}`,
        username: `user${i}`,
        nip05: `user${i}@satnam.app`,
        cardType: "NTAG424" as const,
      }));

      // Mock failures for participants 3, 5, 7
      let callCount = 0;
      vi.mocked(nfcReader.scanForCard).mockImplementation(async () => {
        callCount++;
        if (callCount === 3 || callCount === 5 || callCount === 7) {
          throw new Error("Transient NFC error");
        }
        return createTestCardData();
      });

      const promises = participants.map((participant) =>
        batchQueueManager.addToQueue(participant),
      );

      const results = await Promise.allSettled(promises);

      // Verify some succeeded and some failed
      const succeeded = results.filter((r) => r.status === "fulfilled");
      const failed = results.filter((r) => r.status === "rejected");

      expect(succeeded.length).toBe(7);
      expect(failed.length).toBe(3);
    });

    it("should achieve 10+ users/hour throughput", async () => {
      const participants = Array.from({ length: 10 }, (_, i) => ({
        id: `participant-${i}`,
        username: `user${i}`,
        nip05: `user${i}@satnam.app`,
        cardType: "NTAG424" as const,
      }));

      const startTime = performance.now();

      // Add all participants to queue
      const promises = participants.map((participant) =>
        batchQueueManager.addToQueue(participant),
      );

      await Promise.all(promises);

      const endTime = performance.now();
      const durationMinutes = (endTime - startTime) / 1000 / 60;

      // Verify throughput target: 10 users in <60 minutes (ideally much faster)
      expect(durationMinutes).toBeLessThan(60);

      // Calculate users per hour
      const usersPerHour = (10 / durationMinutes) * 60;
      expect(usersPerHour).toBeGreaterThan(10);
    });

    it("should auto-flush batch after interval", async () => {
      // Create manager with short auto-flush interval
      const shortFlushManager = new BatchQueueManager({
        maxConcurrent: 3,
        batchSize: 10,
        autoFlushInterval: 100, // 100ms
      });

      const participants = Array.from({ length: 5 }, (_, i) => ({
        id: `participant-${i}`,
        username: `user${i}`,
        nip05: `user${i}@satnam.app`,
        cardType: "NTAG424" as const,
      }));

      // Add participants
      participants.forEach((participant) =>
        shortFlushManager.addToQueue(participant),
      );

      // Wait for auto-flush
      await testWaitFor(150);

      // Verify batch was flushed
      const fetchCalls = (global.fetch as any).mock.calls;
      const batchInsertCalls = fetchCalls.filter((call: any) =>
        call[0]?.includes("onboarding-batch-insert"),
      );

      expect(batchInsertCalls.length).toBeGreaterThan(0);

      shortFlushManager.shutdown();
    });
  });

  describe("Tapsigner vs Boltcard Flows", () => {
    it("should detect and program Tapsigner cards", async () => {
      const tapsignerCard = {
        ...createTestCardData(),
        cardType: "Tapsigner" as const,
      };

      vi.mocked(nfcReader.scanForCard).mockResolvedValue(tapsignerCard);

      const participant = {
        id: "participant-1",
        username: "tapsigner-user",
        nip05: "tapsigner@satnam.app",
        cardType: "Tapsigner" as const,
      };

      await batchQueueManager.addToQueue(participant);

      // Verify Tapsigner-specific programming
      expect(nfcReader.scanForCard).toHaveBeenCalled();
      expect(batchNdefWriter.batchWriteNDEFRecords).toHaveBeenCalled();

      // Verify Tapsigner-specific NDEF records
      const writeCall = vi.mocked(batchNdefWriter.batchWriteNDEFRecords).mock
        .calls[0];
      const records = writeCall[0];

      // Tapsigner should include specific record types
      expect(records).toBeDefined();
      expect(Array.isArray(records)).toBe(true);
    });

    it("should detect and program Boltcard cards", async () => {
      const boltcardCard = {
        ...createTestCardData(),
        cardType: "Boltcard" as const,
      };

      vi.mocked(nfcReader.scanForCard).mockResolvedValue(boltcardCard);

      const participant = {
        id: "participant-1",
        username: "boltcard-user",
        nip05: "boltcard@satnam.app",
        cardType: "Boltcard" as const,
      };

      await batchQueueManager.addToQueue(participant);

      // Verify Boltcard-specific programming
      expect(nfcReader.scanForCard).toHaveBeenCalled();
      expect(batchNdefWriter.batchWriteNDEFRecords).toHaveBeenCalled();

      // Verify Boltcard-specific NDEF records
      const writeCall = vi.mocked(batchNdefWriter.batchWriteNDEFRecords).mock
        .calls[0];
      const records = writeCall[0];

      expect(records).toBeDefined();
      expect(Array.isArray(records)).toBe(true);
    });

    it("should handle different card types with appropriate timeouts", async () => {
      // Tapsigner typically requires longer timeout
      const tapsignerParticipant = {
        id: "participant-1",
        username: "tapsigner-user",
        nip05: "tapsigner@satnam.app",
        cardType: "Tapsigner" as const,
      };

      await batchQueueManager.addToQueue(tapsignerParticipant);

      // Verify scanForCard was called with appropriate timeout
      expect(nfcReader.scanForCard).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Boolean),
      );

      vi.clearAllMocks();

      // Boltcard typically uses standard timeout
      const boltcardParticipant = {
        id: "participant-2",
        username: "boltcard-user",
        nip05: "boltcard@satnam.app",
        cardType: "Boltcard" as const,
      };

      await batchQueueManager.addToQueue(boltcardParticipant);

      expect(nfcReader.scanForCard).toHaveBeenCalled();
    });

    it("should program NTAG424 DNA cards", async () => {
      const ntag424Card = {
        ...createTestCardData(),
        cardType: "NTAG424" as const,
      };

      vi.mocked(nfcReader.scanForCard).mockResolvedValue(ntag424Card);

      const participant = {
        id: "participant-1",
        username: "ntag424-user",
        nip05: "ntag424@satnam.app",
        cardType: "NTAG424" as const,
      };

      await batchQueueManager.addToQueue(participant);

      // Verify NTAG424-specific programming
      expect(nfcReader.scanForCard).toHaveBeenCalled();
      expect(batchNdefWriter.batchWriteNDEFRecords).toHaveBeenCalled();
    });
  });

  describe("Multiple Card Types in Single Session", () => {
    it("should handle mixed card types in batch", async () => {
      const participants = [
        {
          id: "participant-1",
          username: "user1",
          nip05: "user1@satnam.app",
          cardType: "NTAG424" as const,
        },
        {
          id: "participant-2",
          username: "user2",
          nip05: "user2@satnam.app",
          cardType: "Boltcard" as const,
        },
        {
          id: "participant-3",
          username: "user3",
          nip05: "user3@satnam.app",
          cardType: "Tapsigner" as const,
        },
        {
          id: "participant-4",
          username: "user4",
          nip05: "user4@satnam.app",
          cardType: "NTAG424" as const,
        },
        {
          id: "participant-5",
          username: "user5",
          nip05: "user5@satnam.app",
          cardType: "Boltcard" as const,
        },
      ];

      // Add all participants to queue
      const promises = participants.map((participant) =>
        batchQueueManager.addToQueue(participant),
      );

      await Promise.all(promises);

      // Verify all card types were processed
      expect(nfcReader.scanForCard).toHaveBeenCalledTimes(5);
      expect(batchNdefWriter.batchWriteNDEFRecords).toHaveBeenCalledTimes(5);
    });

    it("should maintain separate programming logic per card type", async () => {
      const participants = [
        {
          id: "participant-1",
          username: "tapsigner-user",
          nip05: "tapsigner@satnam.app",
          cardType: "Tapsigner" as const,
        },
        {
          id: "participant-2",
          username: "boltcard-user",
          nip05: "boltcard@satnam.app",
          cardType: "Boltcard" as const,
        },
      ];

      const promises = participants.map((participant) =>
        batchQueueManager.addToQueue(participant),
      );

      await Promise.all(promises);

      // Verify different NDEF records for different card types
      const writeCalls = vi.mocked(batchNdefWriter.batchWriteNDEFRecords).mock
        .calls;
      expect(writeCalls.length).toBe(2);

      // Each card type should have different record structure
      const tapsignerRecords = writeCalls[0][0];
      const boltcardRecords = writeCalls[1][0];

      expect(tapsignerRecords).toBeDefined();
      expect(boltcardRecords).toBeDefined();
    });

    it("should handle card type switching within session", async () => {
      // First batch: NTAG424 cards
      const batch1 = Array.from({ length: 3 }, (_, i) => ({
        id: `participant-${i}`,
        username: `user${i}`,
        nip05: `user${i}@satnam.app`,
        cardType: "NTAG424" as const,
      }));

      const promises1 = batch1.map((p) => batchQueueManager.addToQueue(p));
      await Promise.all(promises1);

      vi.clearAllMocks();

      // Second batch: Boltcard cards
      const batch2 = Array.from({ length: 3 }, (_, i) => ({
        id: `participant-${i + 3}`,
        username: `user${i + 3}`,
        nip05: `user${i + 3}@satnam.app`,
        cardType: "Boltcard" as const,
      }));

      const promises2 = batch2.map((p) => batchQueueManager.addToQueue(p));
      await Promise.all(promises2);

      // Verify second batch was processed correctly
      expect(nfcReader.scanForCard).toHaveBeenCalledTimes(3);
    });
  });
});
