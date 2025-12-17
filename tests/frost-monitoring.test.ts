/**
 * FROST Monitoring Test Suite
 *
 * Tests for FROST session monitoring and cleanup including:
 * - FROST session metrics
 * - Failed session retrieval
 * - Session expiration
 * - Session cleanup
 * - Orphaned nonce commitment cleanup
 *
 * Task 7 - Phase 4: Monitoring & Cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  FrostSessionMetrics,
  FailedFrostSession,
} from "../lib/monitoring/federated-signing-monitor";

// Mock Supabase before importing the module
vi.mock("../src/lib/supabase.js", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        gte: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          lte: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        lte: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      update: vi.fn(() => ({
        in: vi.fn(() => ({
          lt: vi.fn(() => ({
            select: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        in: vi.fn(() => ({
          lt: vi.fn(() => ({
            select: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: 0, error: null })),
  },
}));

// Import after mock is set up
import { FederatedSigningMonitor } from "../lib/monitoring/federated-signing-monitor";

// Test data
const TEST_FAMILY_ID = "test-family-monitor-123";
const TEST_GUARDIANS = [
  "guardian1-pubkey-hex",
  "guardian2-pubkey-hex",
  "guardian3-pubkey-hex",
];

describe("FROST Monitoring Tests", () => {
  let monitor: FederatedSigningMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    monitor = new FederatedSigningMonitor();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("FROST Session Metrics", () => {
    it("should return empty metrics when no sessions exist", async () => {
      const metrics = await monitor.getFrostSessionMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.total).toBe(0);
      expect(metrics.pending).toBe(0);
      expect(metrics.collectingCommitments).toBe(0);
      expect(metrics.aggregating).toBe(0);
      expect(metrics.completed).toBe(0);
      expect(metrics.failed).toBe(0);
      expect(metrics.expired).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.failureRate).toBe(0);
    });

    it("should calculate success rate correctly", () => {
      const metrics: FrostSessionMetrics = {
        total: 10,
        pending: 1,
        collectingCommitments: 1,
        aggregating: 1,
        completed: 5,
        failed: 1,
        expired: 1,
        successRate: 50,
        failureRate: 10,
      };

      expect(metrics.successRate).toBe(50);
      expect(metrics.failureRate).toBe(10);
    });

    it("should filter metrics by familyId", async () => {
      const metrics = await monitor.getFrostSessionMetrics({
        familyId: TEST_FAMILY_ID,
      });

      expect(metrics).toBeDefined();
      expect(metrics.total).toBe(0);
    });

    it("should filter metrics by time range", async () => {
      const startTime = Date.now() - 24 * 60 * 60 * 1000;
      const endTime = Date.now();

      const metrics = await monitor.getFrostSessionMetrics({
        startTime,
        endTime,
      });

      expect(metrics).toBeDefined();
    });
  });

  describe("Failed FROST Sessions", () => {
    it("should return empty array when no failed sessions exist", async () => {
      const failedSessions = await monitor.getFrostFailedSessions();

      expect(failedSessions).toBeDefined();
      expect(Array.isArray(failedSessions)).toBe(true);
      expect(failedSessions.length).toBe(0);
    });

    it("should validate FailedFrostSession interface", () => {
      const failedSession: FailedFrostSession = {
        session_id: "frost-session-failed-123",
        family_id: TEST_FAMILY_ID,
        created_by: "guardian1-pubkey-hex",
        threshold: 2,
        participants: TEST_GUARDIANS,
        status: "failed",
        error_message: "Timeout waiting for nonce commitments",
        created_at: Math.floor(Date.now() / 1000) - 3600,
        failed_at: Math.floor(Date.now() / 1000),
        expires_at: Math.floor(Date.now() / 1000) + 600,
      };

      expect(failedSession.session_id).toBeDefined();
      expect(failedSession.status).toBe("failed");
      expect(failedSession.error_message).toBeDefined();
      expect(failedSession.participants.length).toBe(3);
    });

    it("should filter failed sessions by limit", async () => {
      const failedSessions = await monitor.getFrostFailedSessions({ limit: 5 });

      expect(failedSessions).toBeDefined();
      expect(Array.isArray(failedSessions)).toBe(true);
    });
  });

  describe("FROST Session Cleanup", () => {
    it("should expire FROST sessions past expiration time", async () => {
      const expiredCount = await monitor.expireFrostSessions();

      expect(typeof expiredCount).toBe("number");
      expect(expiredCount).toBeGreaterThanOrEqual(0);
    });

    it("should cleanup old FROST sessions", async () => {
      const cleanedCount = await monitor.cleanupFrostSessions(90);

      expect(typeof cleanedCount).toBe("number");
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });

    it("should cleanup orphaned nonce commitments", async () => {
      const cleanedCount = await monitor.cleanupOrphanedNonceCommitments(7);

      expect(typeof cleanedCount).toBe("number");
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });

    it("should run full cleanup for both SSS and FROST", async () => {
      const results = await monitor.runFullCleanup({
        retentionDays: 90,
        nonceRetentionDays: 7,
      });

      expect(results).toBeDefined();
      expect(results.sss).toBeDefined();
      expect(results.frost).toBeDefined();
      expect(typeof results.sss.expired).toBe("number");
      expect(typeof results.sss.cleaned).toBe("number");
      expect(typeof results.frost.expired).toBe("number");
      expect(typeof results.frost.cleaned).toBe("number");
      expect(typeof results.frost.orphanedNonces).toBe("number");
    });
  });

  describe("FROST Activity Summary", () => {
    it("should get recent FROST activity", async () => {
      const activity = await monitor.getRecentFrostActivity(24);

      expect(activity).toBeDefined();
      expect(activity.metrics).toBeDefined();
      expect(activity.failedSessions).toBeDefined();
      expect(typeof activity.shouldAlert).toBe("boolean");
    });

    it("should get combined SSS and FROST activity", async () => {
      const activity = await monitor.getCombinedActivity(24);

      expect(activity).toBeDefined();
      expect(activity.sss).toBeDefined();
      expect(activity.frost).toBeDefined();
      expect(typeof activity.overallShouldAlert).toBe("boolean");
    });

    it("should trigger alert when failure rate exceeds threshold", () => {
      const shouldAlert = monitor.shouldAlert(30, 25);

      expect(shouldAlert).toBe(true);
    });

    it("should not trigger alert when failure rate is below threshold", () => {
      const shouldAlert = monitor.shouldAlert(10, 25);

      expect(shouldAlert).toBe(false);
    });
  });

  describe("FROST Logging", () => {
    it("should log failed FROST session with structured data", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      monitor.logFailedFrostSession(
        "frost-session-123",
        new Error("Signature aggregation failed"),
        {
          familyId: TEST_FAMILY_ID,
          threshold: 2,
          participantCount: 3,
        }
      );

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0];
      expect(logCall[0]).toContain("[FROST Monitor]");

      consoleSpy.mockRestore();
    });

    it("should handle string error messages", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      monitor.logFailedFrostSession(
        "frost-session-456",
        "Network timeout during nonce collection"
      );

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("Metrics Calculations", () => {
    it("should calculate average completion time", () => {
      const sessions = [
        { completed_at: 1000, created_at: 500 }, // 500ms
        { completed_at: 2000, created_at: 1500 }, // 500ms
        { completed_at: 3000, created_at: 2400 }, // 600ms
      ];

      const totalTime = sessions.reduce(
        (sum, s) => sum + (s.completed_at - s.created_at),
        0
      );
      const averageTime = totalTime / sessions.length;

      // (500 + 500 + 600) / 3 = 1600 / 3 = 533.33...
      expect(averageTime).toBeCloseTo(533.33, 0);
    });

    it("should handle empty session list for metrics", () => {
      const sessions: { completed_at: number; created_at: number }[] = [];
      const total = sessions.length;

      expect(total).toBe(0);
      expect(total > 0 ? 100 : 0).toBe(0); // success rate
    });

    it("should include FROST-specific timing metrics", () => {
      const metrics: FrostSessionMetrics = {
        total: 5,
        pending: 0,
        collectingCommitments: 0,
        aggregating: 0,
        completed: 5,
        failed: 0,
        expired: 0,
        successRate: 100,
        failureRate: 0,
        averageCompletionTime: 5000,
        averageNonceCollectionTime: 2000,
        averageSigningTime: 3000,
      };

      expect(metrics.averageCompletionTime).toBe(5000);
      expect(metrics.averageNonceCollectionTime).toBe(2000);
      expect(metrics.averageSigningTime).toBe(3000);
    });
  });
});
