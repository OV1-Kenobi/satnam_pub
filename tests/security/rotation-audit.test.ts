/**
 * Key Rotation Audit Trail Tests
 * Tests audit trail creation, management, and reporting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RotationAuditManager,
  RotationAuditTrail,
} from '../../lib/key-rotation/rotation-audit';

describe('RotationAuditManager', () => {
  const rotationId = 'rotation_123';
  const userId = 'user_123';
  let testTrail: RotationAuditTrail;

  beforeEach(() => {
    testTrail = RotationAuditManager.createAuditTrail(rotationId, userId);
  });

  describe('createAuditTrail', () => {
    it('should create valid audit trail', () => {
      expect(testTrail).toHaveProperty('rotationId', rotationId);
      expect(testTrail).toHaveProperty('userId', userId);
      expect(testTrail).toHaveProperty('entries', []);
      expect(testTrail).toHaveProperty('status', 'in_progress');
    });

    it('should set creation timestamp', () => {
      expect(testTrail.createdAt).toBeDefined();
      expect(testTrail.createdAt).toBeGreaterThan(0);
    });
  });

  describe('addAuditEntry', () => {
    it('should add entry to trail', () => {
      const updated = RotationAuditManager.addAuditEntry(
        testTrail,
        'initiated',
        'user_123',
        { oldNpub: 'npub1old', newNpub: 'npub1new' }
      );

      expect(updated.entries).toHaveLength(1);
      expect(updated.entries[0].eventType).toBe('initiated');
    });

    it('should include all entry fields', () => {
      const updated = RotationAuditManager.addAuditEntry(
        testTrail,
        'initiated',
        'user_123',
        { oldNpub: 'npub1old' },
        '192.168.1.1',
        'Mozilla/5.0'
      );

      const entry = updated.entries[0];
      expect(entry).toHaveProperty('entryId');
      expect(entry).toHaveProperty('rotationId', rotationId);
      expect(entry).toHaveProperty('userId', userId);
      expect(entry).toHaveProperty('eventType', 'initiated');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('actor', 'user_123');
      expect(entry).toHaveProperty('ipAddress', '192.168.1.1');
      expect(entry).toHaveProperty('userAgent', 'Mozilla/5.0');
    });

    it('should add multiple entries', () => {
      let updated = RotationAuditManager.addAuditEntry(
        testTrail,
        'initiated',
        'user_123',
        {}
      );
      updated = RotationAuditManager.addAuditEntry(updated, 'published', 'user_123', {});
      updated = RotationAuditManager.addAuditEntry(updated, 'completed', 'user_123', {});

      expect(updated.entries).toHaveLength(3);
    });
  });

  describe('markRotationCompleted', () => {
    it('should mark rotation as completed', () => {
      const updated = RotationAuditManager.markRotationCompleted(testTrail);

      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeDefined();
    });
  });

  describe('markRotationFailed', () => {
    it('should mark rotation as failed', () => {
      const updated = RotationAuditManager.markRotationFailed(
        testTrail,
        'NIP-26 delegation failed'
      );

      expect(updated.status).toBe('failed');
      expect(updated.completedAt).toBeDefined();
      expect(updated.entries).toHaveLength(1);
    });
  });

  describe('markRotationRolledBack', () => {
    it('should mark rotation as rolled back', () => {
      const updated = RotationAuditManager.markRotationRolledBack(
        testTrail,
        'User requested rollback',
        'user_123'
      );

      expect(updated.status).toBe('rolled_back');
      expect(updated.completedAt).toBeDefined();
      expect(updated.entries).toHaveLength(1);
    });
  });

  describe('getEntriesByType', () => {
    it('should filter entries by type', () => {
      let updated = RotationAuditManager.addAuditEntry(
        testTrail,
        'initiated',
        'user_123',
        {}
      );
      updated = RotationAuditManager.addAuditEntry(updated, 'published', 'user_123', {});
      updated = RotationAuditManager.addAuditEntry(updated, 'published', 'user_123', {});

      const published = RotationAuditManager.getEntriesByType(updated, 'published');

      expect(published).toHaveLength(2);
      expect(published.every((e) => e.eventType === 'published')).toBe(true);
    });
  });

  describe('getEntriesByActor', () => {
    it('should filter entries by actor', () => {
      let updated = RotationAuditManager.addAuditEntry(
        testTrail,
        'initiated',
        'user_123',
        {}
      );
      updated = RotationAuditManager.addAuditEntry(updated, 'published', 'system', {});

      const userEntries = RotationAuditManager.getEntriesByActor(updated, 'user_123');

      expect(userEntries).toHaveLength(1);
      expect(userEntries[0].actor).toBe('user_123');
    });
  });

  describe('getEntriesInTimeRange', () => {
    it('should filter entries by time range', () => {
      const now = Math.floor(Date.now() / 1000);
      let updated = RotationAuditManager.addAuditEntry(
        testTrail,
        'initiated',
        'user_123',
        {}
      );

      const entries = RotationAuditManager.getEntriesInTimeRange(
        updated,
        now - 3600,
        now + 3600
      );

      expect(entries).toHaveLength(1);
    });
  });

  describe('calculateRotationDuration', () => {
    it('should calculate duration for in-progress rotation', () => {
      const duration = RotationAuditManager.calculateRotationDuration(testTrail);

      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should calculate duration for completed rotation', () => {
      const completed = RotationAuditManager.markRotationCompleted(testTrail);
      const duration = RotationAuditManager.calculateRotationDuration(completed);

      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getRotationTimeline', () => {
    it('should generate timeline', () => {
      let updated = RotationAuditManager.addAuditEntry(
        testTrail,
        'initiated',
        'user_123',
        {}
      );
      updated = RotationAuditManager.addAuditEntry(updated, 'published', 'user_123', {});
      updated = RotationAuditManager.addAuditEntry(updated, 'completed', 'user_123', {});

      const timeline = RotationAuditManager.getRotationTimeline(updated);

      expect(timeline).toHaveLength(3);
      expect(timeline[0].eventType).toBe('initiated');
      expect(timeline[1].eventType).toBe('published');
      expect(timeline[2].eventType).toBe('completed');
    });

    it('should include descriptions', () => {
      const updated = RotationAuditManager.addAuditEntry(
        testTrail,
        'initiated',
        'user_123',
        {}
      );

      const timeline = RotationAuditManager.getRotationTimeline(updated);

      expect(timeline[0].description).toBeDefined();
      expect(timeline[0].description.length).toBeGreaterThan(0);
    });
  });

  describe('generateAuditReport', () => {
    it('should generate report', () => {
      let updated = RotationAuditManager.addAuditEntry(
        testTrail,
        'initiated',
        'user_123',
        {}
      );
      updated = RotationAuditManager.addAuditEntry(updated, 'completed', 'user_123', {});

      const report = RotationAuditManager.generateAuditReport(updated);

      expect(report).toContain('Audit Report');
      expect(report).toContain(rotationId);
      expect(report).toContain('Timeline');
      expect(report).toContain('Event Summary');
    });
  });

  describe('checkForSuspiciousActivity', () => {
    it('should detect multiple failures', () => {
      let updated = testTrail;
      for (let i = 0; i < 3; i++) {
        updated = RotationAuditManager.addAuditEntry(updated, 'failed', 'system', {
          errorMessage: 'Error',
        });
      }

      const issues = RotationAuditManager.checkForSuspiciousActivity(updated);

      expect(issues.some((i) => i.message.includes('failures'))).toBe(true);
    });

    it('should detect rollbacks', () => {
      const updated = RotationAuditManager.markRotationRolledBack(
        testTrail,
        'User requested',
        'user_123'
      );

      const issues = RotationAuditManager.checkForSuspiciousActivity(updated);

      expect(issues.some((i) => i.message.includes('rolled back'))).toBe(true);
    });

    it('should detect multiple actors', () => {
      let updated = RotationAuditManager.addAuditEntry(
        testTrail,
        'initiated',
        'user_123',
        {}
      );
      updated = RotationAuditManager.addAuditEntry(updated, 'published', 'user_456', {});
      updated = RotationAuditManager.addAuditEntry(updated, 'completed', 'system', {});

      const issues = RotationAuditManager.checkForSuspiciousActivity(updated);

      expect(issues.some((i) => i.message.includes('multiple actors'))).toBe(true);
    });

    it('should detect long duration', () => {
      let updated = testTrail;
      updated.createdAt = Math.floor(Date.now() / 1000) - 86400 * 2; // 2 days ago

      const issues = RotationAuditManager.checkForSuspiciousActivity(updated);

      expect(issues.some((i) => i.message.includes('unusually long'))).toBe(true);
    });
  });

  describe('exportAsJSON', () => {
    it('should export as JSON', () => {
      const updated = RotationAuditManager.addAuditEntry(
        testTrail,
        'initiated',
        'user_123',
        {}
      );

      const json = RotationAuditManager.exportAsJSON(updated);

      expect(json).toContain(rotationId);
      expect(json).toContain('initiated');
    });
  });

  describe('exportAsCSV', () => {
    it('should export as CSV', () => {
      const updated = RotationAuditManager.addAuditEntry(
        testTrail,
        'initiated',
        'user_123',
        {}
      );

      const csv = RotationAuditManager.exportAsCSV(updated);

      expect(csv).toContain('Entry ID');
      expect(csv).toContain('Event Type');
      expect(csv).toContain('initiated');
    });
  });
});

