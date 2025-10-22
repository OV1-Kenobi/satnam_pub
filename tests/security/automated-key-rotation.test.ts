/**
 * Automated Key Rotation Scheduler Tests
 * Tests automated scheduling, notifications, and metrics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AutomatedKeyRotationScheduler,
  KeyRotationSchedule,
} from '../../lib/key-rotation/automated-scheduler';

describe('AutomatedKeyRotationScheduler', () => {
  const userId = 'user_123';
  const now = Math.floor(Date.now() / 1000);
  let testSchedule: KeyRotationSchedule;

  beforeEach(() => {
    testSchedule = AutomatedKeyRotationScheduler.createRotationSchedule(userId, 90, now - 86400);
  });

  describe('createRotationSchedule', () => {
    it('should create valid rotation schedule', () => {
      expect(testSchedule).toHaveProperty('scheduleId');
      expect(testSchedule).toHaveProperty('userId', userId);
      expect(testSchedule).toHaveProperty('rotationIntervalDays', 90);
      expect(testSchedule).toHaveProperty('isEnabled', true);
    });

    it('should set correct next rotation time', () => {
      const expectedNextRotation = testSchedule.lastRotationAt + 90 * 86400;
      expect(testSchedule.nextRotationAt).toBe(expectedNextRotation);
    });

    it('should initialize metadata', () => {
      expect(testSchedule.metadata.rotationCount).toBe(0);
      expect(testSchedule.metadata.averageRotationTimeMs).toBe(0);
      expect(testSchedule.metadata.lastRotationStatus).toBe('pending');
    });
  });

  describe('isRotationDue', () => {
    it('should return false for future rotations', () => {
      const futureSchedule = {
        ...testSchedule,
        nextRotationAt: now + 86400 * 30, // 30 days from now
      };
      expect(AutomatedKeyRotationScheduler.isRotationDue(futureSchedule)).toBe(false);
    });

    it('should return true for due rotations', () => {
      const dueSchedule = {
        ...testSchedule,
        nextRotationAt: now - 3600, // 1 hour ago
      };
      expect(AutomatedKeyRotationScheduler.isRotationDue(dueSchedule)).toBe(true);
    });

    it('should return false for disabled schedules', () => {
      const disabledSchedule = {
        ...testSchedule,
        isEnabled: false,
        nextRotationAt: now - 3600,
      };
      expect(AutomatedKeyRotationScheduler.isRotationDue(disabledSchedule)).toBe(false);
    });
  });

  describe('isRotationOverdue', () => {
    it('should return false for recent rotations', () => {
      const recentSchedule = {
        ...testSchedule,
        nextRotationAt: now - 86400, // 1 day ago
      };
      expect(AutomatedKeyRotationScheduler.isRotationOverdue(recentSchedule, 7)).toBe(false);
    });

    it('should return true for overdue rotations', () => {
      const overdueSchedule = {
        ...testSchedule,
        nextRotationAt: now - 86400 * 10, // 10 days ago
      };
      expect(AutomatedKeyRotationScheduler.isRotationOverdue(overdueSchedule, 7)).toBe(true);
    });
  });

  describe('getDaysUntilRotation', () => {
    it('should calculate days until rotation', () => {
      const futureSchedule = {
        ...testSchedule,
        nextRotationAt: now + 86400 * 14, // 14 days from now
      };
      const days = AutomatedKeyRotationScheduler.getDaysUntilRotation(futureSchedule);
      expect(days).toBe(14);
    });

    it('should return 0 for overdue rotations', () => {
      const overdueSchedule = {
        ...testSchedule,
        nextRotationAt: now - 86400 * 5,
      };
      const days = AutomatedKeyRotationScheduler.getDaysUntilRotation(overdueSchedule);
      expect(days).toBe(0);
    });
  });

  describe('getNotificationType', () => {
    it('should return upcoming for rotations within 14 days', () => {
      const upcomingSchedule = {
        ...testSchedule,
        nextRotationAt: now + 86400 * 7, // 7 days from now
      };
      const type = AutomatedKeyRotationScheduler.getNotificationType(upcomingSchedule);
      expect(type).toBe('upcoming');
    });

    it('should return due for rotations today', () => {
      const dueSchedule = {
        ...testSchedule,
        nextRotationAt: now + 3600, // 1 hour from now
      };
      const type = AutomatedKeyRotationScheduler.getNotificationType(dueSchedule);
      expect(type).toBe('due');
    });

    it('should return overdue for rotations past due', () => {
      const overdueSchedule = {
        ...testSchedule,
        nextRotationAt: now - 86400 * 10, // 10 days ago
      };
      const type = AutomatedKeyRotationScheduler.getNotificationType(overdueSchedule);
      expect(type).toBe('overdue');
    });

    it('should return null for far future rotations', () => {
      const farSchedule = {
        ...testSchedule,
        nextRotationAt: now + 86400 * 30, // 30 days from now
      };
      const type = AutomatedKeyRotationScheduler.getNotificationType(farSchedule);
      expect(type).toBeNull();
    });
  });

  describe('createNotification', () => {
    it('should create valid notification', () => {
      const notification = AutomatedKeyRotationScheduler.createNotification(
        testSchedule,
        'upcoming'
      );

      expect(notification).toHaveProperty('notificationId');
      expect(notification).toHaveProperty('userId', userId);
      expect(notification).toHaveProperty('notificationType', 'upcoming');
      expect(notification).toHaveProperty('acknowledged', false);
    });
  });

  describe('updateScheduleAfterRotation', () => {
    it('should update schedule with new rotation time', () => {
      const updated = AutomatedKeyRotationScheduler.updateScheduleAfterRotation(
        testSchedule,
        5000
      );

      expect(updated.lastRotationAt).toBeGreaterThan(testSchedule.lastRotationAt);
      expect(updated.nextRotationAt).toBeGreaterThan(updated.lastRotationAt);
    });

    it('should increment rotation count', () => {
      const updated = AutomatedKeyRotationScheduler.updateScheduleAfterRotation(
        testSchedule,
        5000
      );

      expect(updated.metadata.rotationCount).toBe(1);
    });

    it('should calculate average rotation time', () => {
      let updated = AutomatedKeyRotationScheduler.updateScheduleAfterRotation(
        testSchedule,
        5000
      );
      updated = AutomatedKeyRotationScheduler.updateScheduleAfterRotation(updated, 7000);

      expect(updated.metadata.averageRotationTimeMs).toBe(6000);
    });

    it('should set status to success', () => {
      const updated = AutomatedKeyRotationScheduler.updateScheduleAfterRotation(
        testSchedule,
        5000
      );

      expect(updated.metadata.lastRotationStatus).toBe('success');
    });
  });

  describe('updateScheduleAfterFailure', () => {
    it('should set status to failed', () => {
      const updated = AutomatedKeyRotationScheduler.updateScheduleAfterFailure(testSchedule);

      expect(updated.metadata.lastRotationStatus).toBe('failed');
    });

    it('should not change next rotation time', () => {
      const updated = AutomatedKeyRotationScheduler.updateScheduleAfterFailure(testSchedule);

      expect(updated.nextRotationAt).toBe(testSchedule.nextRotationAt);
    });
  });

  describe('setScheduleEnabled', () => {
    it('should enable schedule', () => {
      const disabled = { ...testSchedule, isEnabled: false };
      const enabled = AutomatedKeyRotationScheduler.setScheduleEnabled(disabled, true);

      expect(enabled.isEnabled).toBe(true);
    });

    it('should disable schedule', () => {
      const disabled = AutomatedKeyRotationScheduler.setScheduleEnabled(testSchedule, false);

      expect(disabled.isEnabled).toBe(false);
    });
  });

  describe('updateRotationInterval', () => {
    it('should update rotation interval', () => {
      const updated = AutomatedKeyRotationScheduler.updateRotationInterval(testSchedule, 120);

      expect(updated.rotationIntervalDays).toBe(120);
    });

    it('should reject intervals below 30 days', () => {
      expect(() => {
        AutomatedKeyRotationScheduler.updateRotationInterval(testSchedule, 20);
      }).toThrow();
    });

    it('should reject intervals above 365 days', () => {
      expect(() => {
        AutomatedKeyRotationScheduler.updateRotationInterval(testSchedule, 400);
      }).toThrow();
    });
  });

  describe('filterDueSchedules', () => {
    it('should filter due schedules', () => {
      const schedules = [
        testSchedule,
        { ...testSchedule, nextRotationAt: now - 3600 },
        { ...testSchedule, nextRotationAt: now + 86400 * 30 },
      ];

      const due = AutomatedKeyRotationScheduler.filterDueSchedules(schedules);

      expect(due.length).toBe(1);
    });
  });

  describe('filterOverdueSchedules', () => {
    it('should filter overdue schedules', () => {
      const schedules = [
        testSchedule,
        { ...testSchedule, nextRotationAt: now - 86400 * 10 },
        { ...testSchedule, nextRotationAt: now - 86400 * 2 },
      ];

      const overdue = AutomatedKeyRotationScheduler.filterOverdueSchedules(schedules, 7);

      expect(overdue.length).toBe(1);
    });
  });

  describe('calculateMetrics', () => {
    it('should calculate metrics', () => {
      const schedules = [testSchedule, testSchedule, testSchedule];

      const metrics = AutomatedKeyRotationScheduler.calculateMetrics(schedules);

      expect(metrics.totalSchedules).toBe(3);
      expect(metrics.enabledSchedules).toBe(3);
      expect(metrics.averageRotationInterval).toBe(90);
    });
  });

  describe('generateNotificationMessage', () => {
    it('should generate upcoming notification message', () => {
      const notification = AutomatedKeyRotationScheduler.createNotification(
        testSchedule,
        'upcoming'
      );
      const message = AutomatedKeyRotationScheduler.generateNotificationMessage(notification);

      expect(message.title).toContain('Upcoming');
      expect(message.actionUrl).toBe('/settings/key-rotation');
    });

    it('should generate due notification message', () => {
      const notification = AutomatedKeyRotationScheduler.createNotification(
        testSchedule,
        'due'
      );
      const message = AutomatedKeyRotationScheduler.generateNotificationMessage(notification);

      expect(message.title).toContain('Due');
    });

    it('should generate overdue notification message', () => {
      const notification = AutomatedKeyRotationScheduler.createNotification(
        testSchedule,
        'overdue'
      );
      const message = AutomatedKeyRotationScheduler.generateNotificationMessage(notification);

      expect(message.title).toContain('Overdue');
    });
  });

  describe('validateRotationInterval', () => {
    it('should validate valid intervals', () => {
      const result = AutomatedKeyRotationScheduler.validateRotationInterval(90);
      expect(result.valid).toBe(true);
    });

    it('should reject intervals below 30 days', () => {
      const result = AutomatedKeyRotationScheduler.validateRotationInterval(20);
      expect(result.valid).toBe(false);
    });

    it('should reject intervals above 365 days', () => {
      const result = AutomatedKeyRotationScheduler.validateRotationInterval(400);
      expect(result.valid).toBe(false);
    });
  });
});

