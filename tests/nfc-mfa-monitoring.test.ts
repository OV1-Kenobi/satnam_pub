/**
 * Tests for NFC MFA Production Monitoring & Metrics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  recordNfcMfaMetric,
  recordAlert,
  flushMetrics,
  flushAlerts,
  getMetricsBuffer,
  getAlertsBuffer,
  clearBuffers,
  calculateSuccessRate,
  calculateAverageLatency,
  getMetricsByEventType,
  getFailureMetrics,
  type NfcMfaMetrics,
  type NfcMfaAlert,
} from "../src/lib/steward/nfc-mfa-monitoring";

describe("NFC MFA Production Monitoring & Metrics", () => {
  beforeEach(() => {
    clearBuffers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearBuffers();
  });

  describe("recordNfcMfaMetric", () => {
    it("should record successful metric", () => {
      const metric: NfcMfaMetrics = {
        timestamp: Date.now(),
        eventType: "nfc_signature_verification",
        success: true,
        latencyMs: 45,
      };

      recordNfcMfaMetric(metric);

      const buffer = getMetricsBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0]).toEqual(metric);
    });

    it("should record failed metric", () => {
      const metric: NfcMfaMetrics = {
        timestamp: Date.now(),
        eventType: "nfc_signature_verification",
        success: false,
        latencyMs: 50,
        errorCategory: "signature_invalid",
      };

      recordNfcMfaMetric(metric);

      const buffer = getMetricsBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0].success).toBe(false);
    });

    it("should include family ID and operation hash", () => {
      const metric: NfcMfaMetrics = {
        timestamp: Date.now(),
        eventType: "policy_enforcement",
        familyId: "family-123",
        operationHash: "abc123def456...",
        success: true,
      };

      recordNfcMfaMetric(metric);

      const buffer = getMetricsBuffer();
      expect(buffer[0].familyId).toBe("family-123");
      expect(buffer[0].operationHash).toBe("abc123def456...");
    });
  });

  describe("recordAlert", () => {
    it("should record info alert", () => {
      const alert: NfcMfaAlert = {
        timestamp: Date.now(),
        severity: "info",
        message: "NFC MFA enabled for family",
        context: { familyId: "family-123" },
      };

      recordAlert(alert);

      const buffer = getAlertsBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0]).toEqual(alert);
    });

    it("should record warning alert", () => {
      const alert: NfcMfaAlert = {
        timestamp: Date.now(),
        severity: "warning",
        message: "NFC signature verification failed",
        context: { operationHash: "abc123..." },
      };

      recordAlert(alert);

      const buffer = getAlertsBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0].severity).toBe("warning");
    });

    it("should record error alert", () => {
      const alert: NfcMfaAlert = {
        timestamp: Date.now(),
        severity: "error",
        message: "NFC card not found",
        context: { cardUid: "unknown" },
      };

      recordAlert(alert);

      const buffer = getAlertsBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0].severity).toBe("error");
    });

    it("should record critical alert", () => {
      const alert: NfcMfaAlert = {
        timestamp: Date.now(),
        severity: "critical",
        message: "NFC MFA policy enforcement failed",
        context: { familyId: "family-123" },
      };

      recordAlert(alert);

      const buffer = getAlertsBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0].severity).toBe("critical");
    });
  });

  describe("flushMetrics", () => {
    it("should flush metrics buffer", () => {
      recordNfcMfaMetric({
        timestamp: Date.now(),
        eventType: "nfc_signature_verification",
        success: true,
        latencyMs: 45,
      });

      expect(getMetricsBuffer()).toHaveLength(1);
      flushMetrics();
      expect(getMetricsBuffer()).toHaveLength(0);
    });

    it("should handle empty buffer", () => {
      expect(() => flushMetrics()).not.toThrow();
    });
  });

  describe("flushAlerts", () => {
    it("should flush alerts buffer", () => {
      recordAlert({
        timestamp: Date.now(),
        severity: "info",
        message: "Test alert",
        context: {},
      });

      expect(getAlertsBuffer()).toHaveLength(1);
      flushAlerts();
      expect(getAlertsBuffer()).toHaveLength(0);
    });

    it("should handle empty buffer", () => {
      expect(() => flushAlerts()).not.toThrow();
    });
  });

  describe("calculateSuccessRate", () => {
    it("should calculate 100% success rate", () => {
      const metrics: NfcMfaMetrics[] = [
        {
          timestamp: Date.now(),
          eventType: "test",
          success: true,
        },
        {
          timestamp: Date.now(),
          eventType: "test",
          success: true,
        },
      ];

      const rate = calculateSuccessRate(metrics);
      expect(rate).toBe(100);
    });

    it("should calculate 50% success rate", () => {
      const metrics: NfcMfaMetrics[] = [
        {
          timestamp: Date.now(),
          eventType: "test",
          success: true,
        },
        {
          timestamp: Date.now(),
          eventType: "test",
          success: false,
        },
      ];

      const rate = calculateSuccessRate(metrics);
      expect(rate).toBe(50);
    });

    it("should return 100% for empty metrics", () => {
      const rate = calculateSuccessRate([]);
      expect(rate).toBe(100);
    });
  });

  describe("calculateAverageLatency", () => {
    it("should calculate average latency", () => {
      const metrics: NfcMfaMetrics[] = [
        {
          timestamp: Date.now(),
          eventType: "test",
          success: true,
          latencyMs: 40,
        },
        {
          timestamp: Date.now(),
          eventType: "test",
          success: true,
          latencyMs: 60,
        },
      ];

      const avg = calculateAverageLatency(metrics);
      expect(avg).toBe(50);
    });

    it("should return 0 for empty metrics", () => {
      const avg = calculateAverageLatency([]);
      expect(avg).toBe(0);
    });
  });

  describe("getMetricsByEventType", () => {
    it("should filter metrics by event type", () => {
      const metrics: NfcMfaMetrics[] = [
        {
          timestamp: Date.now(),
          eventType: "nfc_signature_verification",
          success: true,
        },
        {
          timestamp: Date.now(),
          eventType: "policy_enforcement",
          success: true,
        },
        {
          timestamp: Date.now(),
          eventType: "nfc_signature_verification",
          success: false,
        },
      ];

      const filtered = getMetricsByEventType(
        metrics,
        "nfc_signature_verification"
      );
      expect(filtered).toHaveLength(2);
      expect(filtered.every((m) => m.eventType === "nfc_signature_verification")).toBe(true);
    });
  });

  describe("getFailureMetrics", () => {
    it("should filter failure metrics", () => {
      const metrics: NfcMfaMetrics[] = [
        {
          timestamp: Date.now(),
          eventType: "test",
          success: true,
        },
        {
          timestamp: Date.now(),
          eventType: "test",
          success: false,
        },
        {
          timestamp: Date.now(),
          eventType: "test",
          success: false,
        },
      ];

      const failures = getFailureMetrics(metrics);
      expect(failures).toHaveLength(2);
      expect(failures.every((m) => !m.success)).toBe(true);
    });
  });

  describe("clearBuffers", () => {
    it("should clear all buffers", () => {
      recordNfcMfaMetric({
        timestamp: Date.now(),
        eventType: "test",
        success: true,
      });
      recordAlert({
        timestamp: Date.now(),
        severity: "info",
        message: "Test",
        context: {},
      });

      expect(getMetricsBuffer()).toHaveLength(1);
      expect(getAlertsBuffer()).toHaveLength(1);

      clearBuffers();

      expect(getMetricsBuffer()).toHaveLength(0);
      expect(getAlertsBuffer()).toHaveLength(0);
    });
  });
});

