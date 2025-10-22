/**
 * Key Rotation Verification Tests
 * Tests verification of rotation completion and status
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RotationVerificationManager,
  RotationVerificationStep,
} from '../../lib/key-rotation/rotation-verification';

describe('RotationVerificationManager', () => {
  const rotationId = 'rotation_123';
  const userId = 'user_123';
  const oldNpub = 'npub1old1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
  const newNpub = 'npub1new1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  let testSteps: RotationVerificationStep[];

  beforeEach(() => {
    testSteps = RotationVerificationManager.createVerificationChecklist(rotationId);
  });

  describe('createVerificationChecklist', () => {
    it('should create checklist with all steps', () => {
      expect(testSteps.length).toBeGreaterThan(0);
    });

    it('should initialize all steps as pending', () => {
      testSteps.forEach((step) => {
        expect(step.status).toBe('pending');
      });
    });

    it('should include critical steps', () => {
      const stepNames = testSteps.map((s) => s.stepName);
      expect(stepNames).toContain('nip26_delegation_published');
      expect(stepNames).toContain('kind0_profile_updated');
      expect(stepNames).toContain('database_records_updated');
    });
  });

  describe('markStepCompleted', () => {
    it('should mark step as completed', () => {
      const updated = RotationVerificationManager.markStepCompleted(
        testSteps,
        'nip26_delegation_published'
      );

      const step = updated.find((s) => s.stepName === 'nip26_delegation_published');
      expect(step?.status).toBe('completed');
      expect(step?.completedAt).toBeDefined();
    });

    it('should not affect other steps', () => {
      const updated = RotationVerificationManager.markStepCompleted(
        testSteps,
        'nip26_delegation_published'
      );

      const otherStep = updated.find((s) => s.stepName === 'kind0_profile_updated');
      expect(otherStep?.status).toBe('pending');
    });
  });

  describe('markStepFailed', () => {
    it('should mark step as failed with error', () => {
      const updated = RotationVerificationManager.markStepFailed(
        testSteps,
        'nip26_delegation_published',
        'Failed to publish delegation event'
      );

      const step = updated.find((s) => s.stepName === 'nip26_delegation_published');
      expect(step?.status).toBe('failed');
      expect(step?.error).toBe('Failed to publish delegation event');
    });
  });

  describe('calculateOverallStatus', () => {
    it('should return verified when all steps completed', () => {
      let updated = testSteps;
      testSteps.forEach((step) => {
        updated = RotationVerificationManager.markStepCompleted(updated, step.stepName);
      });

      const status = RotationVerificationManager.calculateOverallStatus(updated);
      expect(status).toBe('verified');
    });

    it('should return failed when any step failed', () => {
      let updated = RotationVerificationManager.markStepFailed(
        testSteps,
        'nip26_delegation_published',
        'Error'
      );

      const status = RotationVerificationManager.calculateOverallStatus(updated);
      expect(status).toBe('failed');
    });

    it('should return partial when some steps completed', () => {
      const updated = RotationVerificationManager.markStepCompleted(
        testSteps,
        'nip26_delegation_published'
      );

      const status = RotationVerificationManager.calculateOverallStatus(updated);
      expect(status).toBe('partial');
    });
  });

  describe('calculateCompletionPercentage', () => {
    it('should calculate 0% for no completed steps', () => {
      const percentage = RotationVerificationManager.calculateCompletionPercentage(testSteps);
      expect(percentage).toBe(0);
    });

    it('should calculate 100% for all completed steps', () => {
      let updated = testSteps;
      testSteps.forEach((step) => {
        updated = RotationVerificationManager.markStepCompleted(updated, step.stepName);
      });

      const percentage = RotationVerificationManager.calculateCompletionPercentage(updated);
      expect(percentage).toBe(100);
    });

    it('should calculate partial percentage', () => {
      const updated = RotationVerificationManager.markStepCompleted(
        testSteps,
        'nip26_delegation_published'
      );

      const percentage = RotationVerificationManager.calculateCompletionPercentage(updated);
      expect(percentage).toBeGreaterThan(0);
      expect(percentage).toBeLessThan(100);
    });
  });

  describe('verifyNIP26Delegation', () => {
    it('should verify valid delegation', () => {
      const result = RotationVerificationManager.verifyNIP26Delegation(
        'event_id_123',
        oldNpub,
        newNpub
      );

      expect(result.verified).toBe(true);
    });

    it('should reject missing event ID', () => {
      const result = RotationVerificationManager.verifyNIP26Delegation(undefined, oldNpub, newNpub);

      expect(result.verified).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject missing npubs', () => {
      const result = RotationVerificationManager.verifyNIP26Delegation('event_id_123', '', '');

      expect(result.verified).toBe(false);
    });
  });

  describe('verifyNIP05Update', () => {
    it('should verify valid NIP-05 update', () => {
      const result = RotationVerificationManager.verifyNIP05Update('user@satnam.pub', newNpub);

      expect(result.verified).toBe(true);
    });

    it('should reject missing identifier', () => {
      const result = RotationVerificationManager.verifyNIP05Update(undefined, newNpub);

      expect(result.verified).toBe(false);
    });

    it('should reject missing npub', () => {
      const result = RotationVerificationManager.verifyNIP05Update('user@satnam.pub', '');

      expect(result.verified).toBe(false);
    });
  });

  describe('verifyContactNotifications', () => {
    it('should verify notifications sent', () => {
      const result = RotationVerificationManager.verifyContactNotifications(
        ['event_1', 'event_2', 'event_3'],
        5
      );

      expect(result.verified).toBe(true);
      expect(result.sentCount).toBe(3);
    });

    it('should reject no notifications', () => {
      const result = RotationVerificationManager.verifyContactNotifications([], 5);

      expect(result.verified).toBe(false);
      expect(result.sentCount).toBe(0);
    });

    it('should reject insufficient notifications', () => {
      const result = RotationVerificationManager.verifyContactNotifications(
        ['event_1'],
        10
      );

      expect(result.verified).toBe(false);
    });
  });

  describe('verifyOldKeyDeprecation', () => {
    it('should verify deprecation published', () => {
      const result = RotationVerificationManager.verifyOldKeyDeprecation('event_id_123', oldNpub);

      expect(result.verified).toBe(true);
    });

    it('should reject missing event ID', () => {
      const result = RotationVerificationManager.verifyOldKeyDeprecation(undefined, oldNpub);

      expect(result.verified).toBe(false);
    });
  });

  describe('createVerificationResult', () => {
    it('should create verification result', () => {
      const result = RotationVerificationManager.createVerificationResult(
        rotationId,
        userId,
        oldNpub,
        newNpub,
        testSteps
      );

      expect(result).toHaveProperty('rotationId', rotationId);
      expect(result).toHaveProperty('userId', userId);
      expect(result).toHaveProperty('oldNpub', oldNpub);
      expect(result).toHaveProperty('newNpub', newNpub);
      expect(result).toHaveProperty('overallStatus');
      expect(result).toHaveProperty('completionPercentage');
    });

    it('should include issues for failed steps', () => {
      let updated = RotationVerificationManager.markStepFailed(
        testSteps,
        'nip26_delegation_published',
        'Error'
      );

      const result = RotationVerificationManager.createVerificationResult(
        rotationId,
        userId,
        oldNpub,
        newNpub,
        updated
      );

      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('generateVerificationReport', () => {
    it('should generate report', () => {
      const result = RotationVerificationManager.createVerificationResult(
        rotationId,
        userId,
        oldNpub,
        newNpub,
        testSteps
      );

      const report = RotationVerificationManager.generateVerificationReport(result);

      expect(report).toContain('Verification Report');
      expect(report).toContain(rotationId);
      expect(report).toContain('Verification Steps');
    });
  });

  describe('isRotationFullyVerified', () => {
    it('should return true for fully verified rotation', () => {
      let updated = testSteps;
      testSteps.forEach((step) => {
        updated = RotationVerificationManager.markStepCompleted(updated, step.stepName);
      });

      const result = RotationVerificationManager.createVerificationResult(
        rotationId,
        userId,
        oldNpub,
        newNpub,
        updated
      );

      expect(RotationVerificationManager.isRotationFullyVerified(result)).toBe(true);
    });

    it('should return false for partial verification', () => {
      const result = RotationVerificationManager.createVerificationResult(
        rotationId,
        userId,
        oldNpub,
        newNpub,
        testSteps
      );

      expect(RotationVerificationManager.isRotationFullyVerified(result)).toBe(false);
    });
  });

  describe('getVerificationSummary', () => {
    it('should provide summary for verified rotation', () => {
      let updated = testSteps;
      testSteps.forEach((step) => {
        updated = RotationVerificationManager.markStepCompleted(updated, step.stepName);
      });

      const result = RotationVerificationManager.createVerificationResult(
        rotationId,
        userId,
        oldNpub,
        newNpub,
        updated
      );

      const summary = RotationVerificationManager.getVerificationSummary(result);

      expect(summary.summary).toContain('successfully');
      expect(summary.nextSteps.length).toBeGreaterThan(0);
    });

    it('should provide summary for partial verification', () => {
      const result = RotationVerificationManager.createVerificationResult(
        rotationId,
        userId,
        oldNpub,
        newNpub,
        testSteps
      );

      const summary = RotationVerificationManager.getVerificationSummary(result);

      expect(summary.summary).toContain('complete');
      expect(summary.nextSteps.length).toBeGreaterThan(0);
    });
  });
});

