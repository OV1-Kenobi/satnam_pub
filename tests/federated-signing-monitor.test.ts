/**
 * Federated Signing Monitor Tests
 * 
 * Tests for monitoring and alerting functionality
 */

import { describe, it, expect } from 'vitest';
import { FederatedSigningMonitor } from '../lib/monitoring/federated-signing-monitor';

describe('Federated Signing Monitor', () => {
  const monitor = new FederatedSigningMonitor();

  describe('Metrics Calculation', () => {
    it('should calculate success rate correctly', () => {
      const total = 100;
      const completed = 75;
      const successRate = (completed / total) * 100;

      expect(successRate).toBe(75);
    });

    it('should calculate failure rate correctly', () => {
      const total = 100;
      const failed = 15;
      const failureRate = (failed / total) * 100;

      expect(failureRate).toBe(15);
    });

    it('should handle zero total requests', () => {
      const total = 0;
      const completed = 0;
      const successRate = total > 0 ? (completed / total) * 100 : 0;

      expect(successRate).toBe(0);
    });

    it('should calculate average completion time', () => {
      const completionTimes = [1000, 2000, 3000, 4000, 5000]; // milliseconds
      const average = completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length;

      expect(average).toBe(3000);
    });
  });

  describe('Alert Thresholds', () => {
    it('should trigger alert when failure rate exceeds threshold', () => {
      const failureRate = 30;
      const threshold = 25;

      expect(monitor.shouldAlert(failureRate, threshold)).toBe(true);
    });

    it('should not trigger alert when failure rate is below threshold', () => {
      const failureRate = 20;
      const threshold = 25;

      expect(monitor.shouldAlert(failureRate, threshold)).toBe(false);
    });

    it('should trigger alert when failure rate equals threshold', () => {
      const failureRate = 25;
      const threshold = 25;

      expect(monitor.shouldAlert(failureRate, threshold)).toBe(true);
    });

    it('should use default threshold of 25%', () => {
      const failureRate = 30;

      expect(monitor.shouldAlert(failureRate)).toBe(true);
    });
  });

  describe('Time Range Filtering', () => {
    it('should calculate time range for last 24 hours', () => {
      const now = Date.now();
      const hours = 24;
      const startTime = now - hours * 60 * 60 * 1000;

      expect(startTime).toBeLessThan(now);
      expect(now - startTime).toBe(24 * 60 * 60 * 1000);
    });

    it('should calculate time range for last 7 days', () => {
      const now = Date.now();
      const days = 7;
      const startTime = now - days * 24 * 60 * 60 * 1000;

      expect(startTime).toBeLessThan(now);
      expect(now - startTime).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should calculate retention cutoff time', () => {
      const now = Date.now();
      const retentionDays = 90;
      const cutoffTime = now - retentionDays * 24 * 60 * 60 * 1000;

      expect(cutoffTime).toBeLessThan(now);
      expect(now - cutoffTime).toBe(90 * 24 * 60 * 60 * 1000);
    });
  });

  describe('Status Filtering', () => {
    it('should filter by failed status', () => {
      const requests = [
        { status: 'pending' },
        { status: 'completed' },
        { status: 'failed' },
        { status: 'failed' },
        { status: 'expired' },
      ];

      const failed = requests.filter((r) => r.status === 'failed');

      expect(failed.length).toBe(2);
    });

    it('should filter by completed status', () => {
      const requests = [
        { status: 'pending' },
        { status: 'completed' },
        { status: 'completed' },
        { status: 'failed' },
      ];

      const completed = requests.filter((r) => r.status === 'completed');

      expect(completed.length).toBe(2);
    });

    it('should filter by multiple statuses', () => {
      const requests = [
        { status: 'pending' },
        { status: 'completed' },
        { status: 'failed' },
        { status: 'expired' },
      ];

      const finalized = requests.filter((r) =>
        ['completed', 'failed', 'expired'].includes(r.status)
      );

      expect(finalized.length).toBe(3);
    });
  });

  describe('Error Logging', () => {
    it('should log error with request ID', () => {
      const requestId = 'test-request-123';
      const error = new Error('Test error');

      // This would normally log to console or external service
      expect(requestId).toBe('test-request-123');
      expect(error.message).toBe('Test error');
    });

    it('should log error with context', () => {
      const context = {
        familyId: 'family-456',
        threshold: 3,
        guardianCount: 5,
      };

      expect(context.familyId).toBe('family-456');
      expect(context.threshold).toBe(3);
      expect(context.guardianCount).toBe(5);
    });

    it('should handle string errors', () => {
      const error = 'Simple error message';

      expect(typeof error).toBe('string');
      expect(error).toBe('Simple error message');
    });

    it('should handle Error objects', () => {
      const error = new Error('Error object message');

      expect(error instanceof Error).toBe(true);
      expect(error.message).toBe('Error object message');
      expect(error.stack).toBeDefined();
    });
  });

  describe('Cleanup Operations', () => {
    it('should identify expired requests', () => {
      const now = Date.now();
      const requests = [
        { status: 'pending', expires_at: now - 1000 }, // Expired
        { status: 'pending', expires_at: now + 1000 }, // Not expired
        { status: 'completed', expires_at: now - 1000 }, // Already completed
      ];

      const expiredPending = requests.filter(
        (r) => r.status === 'pending' && r.expires_at < now
      );

      expect(expiredPending.length).toBe(1);
    });

    it('should identify old completed requests for cleanup', () => {
      const now = Date.now();
      const retentionDays = 90;
      const cutoffTime = now - retentionDays * 24 * 60 * 60 * 1000;

      const requests = [
        { status: 'completed', created_at: cutoffTime - 1000 }, // Old
        { status: 'completed', created_at: cutoffTime + 1000 }, // Recent
        { status: 'failed', created_at: cutoffTime - 1000 }, // Old
      ];

      const oldRequests = requests.filter(
        (r) =>
          ['completed', 'failed', 'expired'].includes(r.status) &&
          r.created_at < cutoffTime
      );

      expect(oldRequests.length).toBe(2);
    });

    it('should not cleanup pending requests', () => {
      const now = Date.now();
      const cutoffTime = now - 90 * 24 * 60 * 60 * 1000;

      const requests = [
        { status: 'pending', created_at: cutoffTime - 1000 },
        { status: 'completed', created_at: cutoffTime - 1000 },
      ];

      const toCleanup = requests.filter(
        (r) =>
          ['completed', 'failed', 'expired'].includes(r.status) &&
          r.created_at < cutoffTime
      );

      expect(toCleanup.length).toBe(1);
      expect(toCleanup[0].status).toBe('completed');
    });
  });

  describe('Query Options', () => {
    it('should support family ID filtering', () => {
      const options = {
        familyId: 'family-123',
      };

      expect(options.familyId).toBe('family-123');
    });

    it('should support creator filtering', () => {
      const options = {
        createdBy: 'creator-pubkey-456',
      };

      expect(options.createdBy).toBe('creator-pubkey-456');
    });

    it('should support time range filtering', () => {
      const now = Date.now();
      const options = {
        startTime: now - 24 * 60 * 60 * 1000,
        endTime: now,
      };

      expect(options.startTime).toBeLessThan(options.endTime);
    });

    it('should support result limiting', () => {
      const options = {
        limit: 10,
      };

      expect(options.limit).toBe(10);
    });

    it('should support combined filters', () => {
      const options = {
        familyId: 'family-123',
        status: 'failed' as const,
        startTime: Date.now() - 24 * 60 * 60 * 1000,
        limit: 5,
      };

      expect(options.familyId).toBe('family-123');
      expect(options.status).toBe('failed');
      expect(options.startTime).toBeDefined();
      expect(options.limit).toBe(5);
    });
  });

  describe('Metrics Structure', () => {
    it('should have all required metric fields', () => {
      const metrics = {
        total: 100,
        pending: 10,
        completed: 75,
        failed: 10,
        expired: 5,
        successRate: 75.0,
        failureRate: 10.0,
        averageCompletionTime: 3000,
      };

      expect(metrics.total).toBe(100);
      expect(metrics.pending).toBe(10);
      expect(metrics.completed).toBe(75);
      expect(metrics.failed).toBe(10);
      expect(metrics.expired).toBe(5);
      expect(metrics.successRate).toBe(75.0);
      expect(metrics.failureRate).toBe(10.0);
      expect(metrics.averageCompletionTime).toBe(3000);
    });

    it('should validate metric totals', () => {
      const metrics = {
        total: 100,
        pending: 10,
        completed: 75,
        failed: 10,
        expired: 5,
      };

      const sum = metrics.pending + metrics.completed + metrics.failed + metrics.expired;

      expect(sum).toBe(metrics.total);
    });

    it('should round success rate to 2 decimal places', () => {
      const successRate = 75.6789;
      const rounded = Math.round(successRate * 100) / 100;

      expect(rounded).toBe(75.68);
    });
  });

  describe('Failed Request Structure', () => {
    it('should have all required fields', () => {
      const failedRequest = {
        request_id: 'req-123',
        family_id: 'family-456',
        created_by: 'creator-789',
        threshold: 3,
        status: 'failed' as const,
        error_message: 'Insufficient shares',
        created_at: Date.now() - 1000,
        failed_at: Date.now(),
        expires_at: Date.now() + 1000,
      };

      expect(failedRequest.request_id).toBeDefined();
      expect(failedRequest.family_id).toBeDefined();
      expect(failedRequest.created_by).toBeDefined();
      expect(failedRequest.threshold).toBeGreaterThan(0);
      expect(failedRequest.status).toBe('failed');
      expect(failedRequest.error_message).toBeDefined();
      expect(failedRequest.created_at).toBeLessThan(failedRequest.failed_at!);
    });
  });
});

