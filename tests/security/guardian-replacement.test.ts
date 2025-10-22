/**
 * Guardian Replacement Tests
 * Tests guardian replacement workflows and backup guardian management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GuardianReplacementManager,
  GuardianReplacementRequest,
  BackupGuardianSet,
} from '../../lib/family/guardian-replacement';

describe('GuardianReplacementManager', () => {
  const familyId = 'family_123';
  const requesterId = 'guardian_1';
  const guardianToReplace = 'guardian_2';
  const replacementGuardian = 'guardian_4';
  const now = Math.floor(Date.now() / 1000);

  let testRequest: GuardianReplacementRequest;

  beforeEach(() => {
    testRequest = GuardianReplacementManager.createReplacementRequest(
      familyId,
      requesterId,
      guardianToReplace,
      replacementGuardian,
      'permanently_unavailable',
      'Guardian has not responded for 30 days',
      72
    );
  });

  describe('createReplacementRequest', () => {
    it('should create valid replacement request', () => {
      expect(testRequest).toHaveProperty('requestId');
      expect(testRequest).toHaveProperty('familyId', familyId);
      expect(testRequest).toHaveProperty('requesterId', requesterId);
      expect(testRequest).toHaveProperty('guardianToReplace', guardianToReplace);
      expect(testRequest).toHaveProperty('replacementGuardian', replacementGuardian);
      expect(testRequest).toHaveProperty('status', 'pending');
    });

    it('should set correct expiration time', () => {
      const expectedExpiry = testRequest.createdAt + 72 * 3600;
      expect(testRequest.expiresAt).toBe(expectedExpiry);
    });

    it('should initialize with empty approvals', () => {
      expect(testRequest.approvals).toEqual([]);
      expect(testRequest.currentApprovals).toBe(0);
    });
  });

  describe('validateReplacementRequest', () => {
    it('should validate valid request', () => {
      const allGuardians = ['guardian_1', 'guardian_2', 'guardian_3'];
      const result = GuardianReplacementManager.validateReplacementRequest(
        testRequest,
        allGuardians
      );

      expect(result.valid).toBe(true);
    });

    it('should reject expired requests', () => {
      const expiredRequest = {
        ...testRequest,
        expiresAt: now - 3600,
      };

      const result = GuardianReplacementManager.validateReplacementRequest(
        expiredRequest,
        ['guardian_1', 'guardian_2', 'guardian_3']
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject if guardian to replace not in family', () => {
      const result = GuardianReplacementManager.validateReplacementRequest(testRequest, [
        'guardian_1',
        'guardian_3',
      ]);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not in family');
    });

    it('should reject self-replacement', () => {
      const selfReplaceRequest = {
        ...testRequest,
        replacementGuardian: guardianToReplace,
      };

      const result = GuardianReplacementManager.validateReplacementRequest(
        selfReplaceRequest,
        ['guardian_1', 'guardian_2', 'guardian_3']
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('themselves');
    });
  });

  describe('addApproval', () => {
    it('should add approval to request', () => {
      const updated = GuardianReplacementManager.addApproval(
        testRequest,
        'guardian_1',
        'approved',
        'Agree with replacement'
      );

      expect(updated.approvals).toHaveLength(1);
      expect(updated.currentApprovals).toBe(1);
    });

    it('should not add duplicate approvals', () => {
      let updated = GuardianReplacementManager.addApproval(
        testRequest,
        'guardian_1',
        'approved'
      );
      updated = GuardianReplacementManager.addApproval(updated, 'guardian_1', 'approved');

      expect(updated.approvals).toHaveLength(1);
    });

    it('should update status when threshold reached', () => {
      let updated = GuardianReplacementManager.addApproval(
        testRequest,
        'guardian_1',
        'approved'
      );
      updated = GuardianReplacementManager.addApproval(updated, 'guardian_3', 'approved');

      expect(updated.status).toBe('approved');
      expect(updated.currentApprovals).toBe(2);
    });

    it('should count only approved votes', () => {
      let updated = GuardianReplacementManager.addApproval(
        testRequest,
        'guardian_1',
        'approved'
      );
      updated = GuardianReplacementManager.addApproval(updated, 'guardian_3', 'rejected');

      expect(updated.currentApprovals).toBe(1);
    });
  });

  describe('isReplacementApproved', () => {
    it('should return false for pending requests', () => {
      expect(GuardianReplacementManager.isReplacementApproved(testRequest)).toBe(false);
    });

    it('should return true for approved requests', () => {
      let updated = GuardianReplacementManager.addApproval(
        testRequest,
        'guardian_1',
        'approved'
      );
      updated = GuardianReplacementManager.addApproval(updated, 'guardian_3', 'approved');

      expect(GuardianReplacementManager.isReplacementApproved(updated)).toBe(true);
    });
  });

  describe('hasReplacementExpired', () => {
    it('should return false for active requests', () => {
      expect(GuardianReplacementManager.hasReplacementExpired(testRequest)).toBe(false);
    });

    it('should return true for expired requests', () => {
      const expiredRequest = {
        ...testRequest,
        expiresAt: now - 3600,
      };

      expect(GuardianReplacementManager.hasReplacementExpired(expiredRequest)).toBe(true);
    });

    it('should return false for non-pending requests', () => {
      const completedRequest = {
        ...testRequest,
        status: 'completed' as const,
        expiresAt: now - 3600,
      };

      expect(GuardianReplacementManager.hasReplacementExpired(completedRequest)).toBe(false);
    });
  });

  describe('createBackupGuardianSet', () => {
    it('should create valid backup guardian set', () => {
      const guardians = [
        { guardianId: 'backup_1', npub: 'npub1aaa', role: 'backup' as const, trustLevel: 4 },
        { guardianId: 'backup_2', npub: 'npub1bbb', role: 'emergency' as const, trustLevel: 3 },
      ];

      const set = GuardianReplacementManager.createBackupGuardianSet(familyId, guardians);

      expect(set).toHaveProperty('setId');
      expect(set).toHaveProperty('familyId', familyId);
      expect(set.guardians).toHaveLength(2);
      expect(set.isActive).toBe(true);
    });
  });

  describe('activateBackupGuardian', () => {
    it('should activate backup guardian', () => {
      const guardians = [
        { guardianId: 'backup_1', npub: 'npub1aaa', role: 'backup' as const, trustLevel: 4 },
      ];
      const set = GuardianReplacementManager.createBackupGuardianSet(familyId, guardians);

      const updated = GuardianReplacementManager.activateBackupGuardian(set, 'backup_1');

      expect(updated.guardians[0].activatedAt).toBeDefined();
    });
  });

  describe('getAvailableBackupGuardians', () => {
    it('should return available backup guardians', () => {
      const guardians = [
        { guardianId: 'backup_1', npub: 'npub1aaa', role: 'backup' as const, trustLevel: 4 },
        { guardianId: 'backup_2', npub: 'npub1bbb', role: 'emergency' as const, trustLevel: 3 },
      ];
      const set = GuardianReplacementManager.createBackupGuardianSet(familyId, guardians);

      const available = GuardianReplacementManager.getAvailableBackupGuardians(set);

      expect(available).toHaveLength(2);
    });

    it('should exclude activated guardians', () => {
      const guardians = [
        { guardianId: 'backup_1', npub: 'npub1aaa', role: 'backup' as const, trustLevel: 4 },
        { guardianId: 'backup_2', npub: 'npub1bbb', role: 'emergency' as const, trustLevel: 3 },
      ];
      let set = GuardianReplacementManager.createBackupGuardianSet(familyId, guardians);
      set = GuardianReplacementManager.activateBackupGuardian(set, 'backup_1');

      const available = GuardianReplacementManager.getAvailableBackupGuardians(set);

      expect(available).toHaveLength(1);
      expect(available[0].guardianId).toBe('backup_2');
    });

    it('should exclude specified guardians', () => {
      const guardians = [
        { guardianId: 'backup_1', npub: 'npub1aaa', role: 'backup' as const, trustLevel: 4 },
        { guardianId: 'backup_2', npub: 'npub1bbb', role: 'emergency' as const, trustLevel: 3 },
      ];
      const set = GuardianReplacementManager.createBackupGuardianSet(familyId, guardians);

      const available = GuardianReplacementManager.getAvailableBackupGuardians(set, ['backup_1']);

      expect(available).toHaveLength(1);
      expect(available[0].guardianId).toBe('backup_2');
    });
  });

  describe('createAuditEntry', () => {
    it('should create valid audit entry', () => {
      const entry = GuardianReplacementManager.createAuditEntry(
        familyId,
        testRequest.requestId,
        'requested',
        requesterId,
        { reason: 'permanently_unavailable' }
      );

      expect(entry).toHaveProperty('entryId');
      expect(entry).toHaveProperty('familyId', familyId);
      expect(entry).toHaveProperty('action', 'requested');
      expect(entry).toHaveProperty('actor', requesterId);
    });
  });

  describe('generateReplacementNotification', () => {
    it('should generate pending notification', () => {
      const notification = GuardianReplacementManager.generateReplacementNotification(testRequest);

      expect(notification.title).toContain('Guardian Replacement Request');
      expect(notification.severity).toBe('info');
    });

    it('should generate approved notification', () => {
      let updated = GuardianReplacementManager.addApproval(
        testRequest,
        'guardian_1',
        'approved'
      );
      updated = GuardianReplacementManager.addApproval(updated, 'guardian_3', 'approved');

      const notification = GuardianReplacementManager.generateReplacementNotification(updated);

      expect(notification.title).toContain('Approved');
      expect(notification.severity).toBe('info');
    });

    it('should generate rejected notification', () => {
      const rejectedRequest = {
        ...testRequest,
        status: 'rejected' as const,
      };

      const notification = GuardianReplacementManager.generateReplacementNotification(
        rejectedRequest
      );

      expect(notification.title).toContain('Rejected');
      expect(notification.severity).toBe('warning');
    });
  });

  describe('calculateReplacementPriority', () => {
    it('should return critical for compromised guardians', () => {
      const priority = GuardianReplacementManager.calculateReplacementPriority(
        { trustLevel: 5, lastSeenAt: now, isResponsive: true },
        'compromised'
      );

      expect(priority).toBe('critical');
    });

    it('should return high for unresponsive guardians', () => {
      const priority = GuardianReplacementManager.calculateReplacementPriority(
        { trustLevel: 5, lastSeenAt: now - 86400 * 30, isResponsive: false },
        'permanently_unavailable'
      );

      expect(priority).toBe('high');
    });

    it('should return medium for low trust guardians', () => {
      const priority = GuardianReplacementManager.calculateReplacementPriority(
        { trustLevel: 1, lastSeenAt: now, isResponsive: true },
        'voluntary_resignation'
      );

      expect(priority).toBe('medium');
    });
  });
});

