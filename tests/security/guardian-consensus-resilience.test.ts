/**
 * Guardian Consensus Resilience Tests
 * Tests timeout handling, fallback mechanisms, and emergency recovery
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GuardianConsensusResilienceManager,
  GuardianConsensusState,
  GuardianTimeoutConfig,
} from '../../lib/family/guardian-consensus-resilience';

describe('GuardianConsensusResilienceManager', () => {
  let testState: GuardianConsensusState;
  const now = Math.floor(Date.now() / 1000);

  beforeEach(() => {
    testState = {
      requestId: 'test_request_123',
      operationType: 'nsec_reconstruction',
      requiredThreshold: 2,
      totalGuardians: 3,
      approvedGuardians: ['guardian_1'],
      respondedGuardians: ['guardian_1', 'guardian_2'],
      unresponsiveGuardians: ['guardian_3'],
      status: 'pending',
      createdAt: now - 3600, // 1 hour ago
      expiresAt: now + 82800, // 23 hours from now
    };
  });

  describe('hasTimedOut', () => {
    it('should return false for active requests', () => {
      expect(GuardianConsensusResilienceManager.hasTimedOut(testState)).toBe(false);
    });

    it('should return true for expired requests', () => {
      const expiredState = {
        ...testState,
        expiresAt: now - 3600, // 1 hour ago
      };
      expect(GuardianConsensusResilienceManager.hasTimedOut(expiredState)).toBe(true);
    });
  });

  describe('shouldWarnAboutTimeout', () => {
    it('should return false when warning threshold not reached', () => {
      const result = GuardianConsensusResilienceManager.shouldWarnAboutTimeout(testState);
      expect(result).toBe(false);
    });

    it('should return true when warning threshold reached', () => {
      const warningState = {
        ...testState,
        createdAt: now - 43200, // 12 hours ago (50% of 24 hour timeout)
      };
      const result = GuardianConsensusResilienceManager.shouldWarnAboutTimeout(warningState);
      expect(result).toBe(true);
    });

    it('should return false if warning already sent', () => {
      const warnedState = {
        ...testState,
        createdAt: now - 43200,
        lastWarningAt: now - 1000,
      };
      const result = GuardianConsensusResilienceManager.shouldWarnAboutTimeout(warnedState);
      expect(result).toBe(false);
    });
  });

  describe('shouldActivateEmergencyRecovery', () => {
    it('should return false when emergency threshold not reached', () => {
      const result = GuardianConsensusResilienceManager.shouldActivateEmergencyRecovery(testState);
      expect(result).toBe(false);
    });

    it('should return true when emergency threshold reached', () => {
      const emergencyState = {
        ...testState,
        createdAt: now - 64800, // 18 hours ago (75% of 24 hour timeout)
      };
      const result = GuardianConsensusResilienceManager.shouldActivateEmergencyRecovery(emergencyState);
      expect(result).toBe(true);
    });

    it('should return false if already activated', () => {
      const activatedState = {
        ...testState,
        createdAt: now - 64800,
        emergencyActivatedAt: now - 1000,
      };
      const result = GuardianConsensusResilienceManager.shouldActivateEmergencyRecovery(activatedState);
      expect(result).toBe(false);
    });
  });

  describe('getUnresponsiveGuardians', () => {
    it('should identify unresponsive guardians', () => {
      const allGuardians = ['guardian_1', 'guardian_2', 'guardian_3'];
      const responded = ['guardian_1', 'guardian_2'];

      const unresponsive = GuardianConsensusResilienceManager.getUnresponsiveGuardians(
        allGuardians,
        responded
      );

      expect(unresponsive).toEqual(['guardian_3']);
    });

    it('should return empty array when all guardians responded', () => {
      const allGuardians = ['guardian_1', 'guardian_2'];
      const responded = ['guardian_1', 'guardian_2'];

      const unresponsive = GuardianConsensusResilienceManager.getUnresponsiveGuardians(
        allGuardians,
        responded
      );

      expect(unresponsive).toEqual([]);
    });
  });

  describe('calculateReducedQuorumThreshold', () => {
    it('should reduce threshold by 1', () => {
      const reduced = GuardianConsensusResilienceManager.calculateReducedQuorumThreshold(3, 5);
      expect(reduced).toBe(2);
    });

    it('should not go below minimum threshold', () => {
      const reduced = GuardianConsensusResilienceManager.calculateReducedQuorumThreshold(1, 3, 1);
      expect(reduced).toBe(1);
    });

    it('should not exceed total guardians', () => {
      const reduced = GuardianConsensusResilienceManager.calculateReducedQuorumThreshold(5, 3);
      expect(reduced).toBeLessThanOrEqual(3);
    });
  });

  describe('determineBestFallback', () => {
    it('should prefer backup guardians when available', () => {
      const fallback = GuardianConsensusResilienceManager.determineBestFallback(
        testState,
        ['backup_guardian_1', 'backup_guardian_2']
      );

      expect(fallback?.type).toBe('backup_guardians');
    });

    it('should use reduced quorum when close to threshold', () => {
      const closeState = {
        ...testState,
        approvedGuardians: ['guardian_1', 'guardian_2'],
        requiredThreshold: 2,
      };

      const fallback = GuardianConsensusResilienceManager.determineBestFallback(closeState, []);

      expect(fallback?.type).toBe('reduced_quorum');
    });

    it('should use emergency recovery as last resort', () => {
      const farState = {
        ...testState,
        approvedGuardians: [],
        requiredThreshold: 3,
      };

      const fallback = GuardianConsensusResilienceManager.determineBestFallback(farState, []);

      expect(fallback?.type).toBe('emergency_recovery');
    });
  });

  describe('createEmergencyRecoveryPath', () => {
    it('should create valid emergency recovery path', () => {
      const path = GuardianConsensusResilienceManager.createEmergencyRecoveryPath(
        'nsec_reconstruction',
        'time_locked',
        72
      );

      expect(path).toHaveProperty('pathId');
      expect(path).toHaveProperty('operationType', 'nsec_reconstruction');
      expect(path).toHaveProperty('recoveryMethod', 'time_locked');
      expect(path).toHaveProperty('status', 'active');
    });

    it('should set correct expiration time', () => {
      const path = GuardianConsensusResilienceManager.createEmergencyRecoveryPath(
        'nsec_reconstruction',
        'time_locked',
        72
      );

      const expectedExpiry = path.activatedAt + 72 * 3600;
      expect(path.expiresAt).toBe(expectedExpiry);
    });
  });

  describe('hasEmergencyRecoveryExpired', () => {
    it('should return false for active recovery paths', () => {
      const path = GuardianConsensusResilienceManager.createEmergencyRecoveryPath(
        'nsec_reconstruction',
        'time_locked',
        72
      );

      expect(GuardianConsensusResilienceManager.hasEmergencyRecoveryExpired(path)).toBe(false);
    });

    it('should return true for expired recovery paths', () => {
      const path = GuardianConsensusResilienceManager.createEmergencyRecoveryPath(
        'nsec_reconstruction',
        'time_locked',
        1
      );
      path.expiresAt = now - 3600; // 1 hour ago

      expect(GuardianConsensusResilienceManager.hasEmergencyRecoveryExpired(path)).toBe(true);
    });
  });

  describe('generateTimeoutNotification', () => {
    it('should generate reduced quorum notification', () => {
      const fallback = {
        type: 'reduced_quorum' as const,
        description: 'Proceed with reduced quorum',
        requiredThreshold: 1,
        timeoutHours: 24,
        enabled: true,
      };

      const notification = GuardianConsensusResilienceManager.generateTimeoutNotification(
        testState,
        ['guardian_3'],
        fallback
      );

      expect(notification.title).toContain('Reduced Quorum');
      expect(notification.severity).toBe('warning');
      expect(notification.actions.length).toBeGreaterThan(0);
    });

    it('should generate emergency recovery notification', () => {
      const fallback = {
        type: 'emergency_recovery' as const,
        description: 'Emergency recovery',
        requiredThreshold: 0,
        timeoutHours: 72,
        enabled: true,
      };

      const notification = GuardianConsensusResilienceManager.generateTimeoutNotification(
        testState,
        ['guardian_2', 'guardian_3'],
        fallback
      );

      expect(notification.title).toContain('Emergency Recovery');
      expect(notification.severity).toBe('critical');
    });
  });

  describe('updateStateWithTimeout', () => {
    it('should update state with timeout information', () => {
      const updated = GuardianConsensusResilienceManager.updateStateWithTimeout(
        testState,
        ['guardian_3']
      );

      expect(updated.status).toBe('timeout');
      expect(updated.unresponsiveGuardians).toEqual(['guardian_3']);
      expect(updated.lastWarningAt).toBeDefined();
    });
  });

  describe('activateEmergencyRecovery', () => {
    it('should activate emergency recovery in state', () => {
      const updated = GuardianConsensusResilienceManager.activateEmergencyRecovery(testState);

      expect(updated.status).toBe('emergency_recovery');
      expect(updated.emergencyActivatedAt).toBeDefined();
    });
  });
});

