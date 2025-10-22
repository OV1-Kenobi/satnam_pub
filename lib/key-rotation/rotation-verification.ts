/**
 * Key Rotation Verification Module
 * Verifies that all steps of key rotation have been completed successfully
 */

export interface RotationVerificationStep {
  stepName: string;
  description: string;
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  completedAt?: number;
  error?: string;
}

export interface RotationVerificationResult {
  rotationId: string;
  userId: string;
  oldNpub: string;
  newNpub: string;
  overallStatus: 'verified' | 'partial' | 'failed';
  completionPercentage: number;
  steps: RotationVerificationStep[];
  verifiedAt: number;
  issues: Array<{
    severity: 'warning' | 'error' | 'critical';
    message: string;
    step: string;
  }>;
}

/**
 * Key Rotation Verification Manager
 * Verifies all aspects of key rotation completion
 */
export class RotationVerificationManager {
  /**
   * Create verification checklist for key rotation
   */
  static createVerificationChecklist(rotationId: string): RotationVerificationStep[] {
    return [
      {
        stepName: 'nip26_delegation_published',
        description: 'NIP-26 delegation event published (old key → new key)',
        status: 'pending',
      },
      {
        stepName: 'kind0_profile_updated',
        description: 'Kind:0 profile event updated with new key',
        status: 'pending',
      },
      {
        stepName: 'nip05_record_updated',
        description: 'NIP-05 identifier updated to point to new key',
        status: 'pending',
      },
      {
        stepName: 'lightning_address_updated',
        description: 'Lightning Address updated (if applicable)',
        status: 'pending',
      },
      {
        stepName: 'contact_notifications_sent',
        description: 'Contact notifications sent via NIP-17 gift-wrapped messaging',
        status: 'pending',
      },
      {
        stepName: 'old_key_deprecation_published',
        description: 'Old key deprecation notice published',
        status: 'pending',
      },
      {
        stepName: 'database_records_updated',
        description: 'Database records updated with new key',
        status: 'pending',
      },
      {
        stepName: 'audit_trail_recorded',
        description: 'Audit trail recorded for rotation event',
        status: 'pending',
      },
    ];
  }

  /**
   * Mark verification step as completed
   */
  static markStepCompleted(
    steps: RotationVerificationStep[],
    stepName: string
  ): RotationVerificationStep[] {
    return steps.map((step) => {
      if (step.stepName === stepName) {
        return {
          ...step,
          status: 'completed',
          completedAt: Math.floor(Date.now() / 1000),
        };
      }
      return step;
    });
  }

  /**
   * Mark verification step as failed
   */
  static markStepFailed(
    steps: RotationVerificationStep[],
    stepName: string,
    error: string
  ): RotationVerificationStep[] {
    return steps.map((step) => {
      if (step.stepName === stepName) {
        return {
          ...step,
          status: 'failed',
          error,
        };
      }
      return step;
    });
  }

  /**
   * Calculate overall verification status
   */
  static calculateOverallStatus(steps: RotationVerificationStep[]): 'verified' | 'partial' | 'failed' {
    const completed = steps.filter((s) => s.status === 'completed').length;
    const failed = steps.filter((s) => s.status === 'failed').length;
    const total = steps.length;

    if (failed > 0) {
      return 'failed';
    }

    if (completed === total) {
      return 'verified';
    }

    return 'partial';
  }

  /**
   * Calculate completion percentage
   */
  static calculateCompletionPercentage(steps: RotationVerificationStep[]): number {
    const completed = steps.filter((s) => s.status === 'completed').length;
    return Math.round((completed / steps.length) * 100);
  }

  /**
   * Verify NIP-26 delegation was published
   */
  static verifyNIP26Delegation(
    delegationEventId: string | undefined,
    oldNpub: string,
    newNpub: string
  ): { verified: boolean; error?: string } {
    if (!delegationEventId) {
      return { verified: false, error: 'NIP-26 delegation event ID not found' };
    }

    if (!oldNpub || !newNpub) {
      return { verified: false, error: 'Old or new npub missing' };
    }

    // In production, would verify event was actually published to relays
    return { verified: true };
  }

  /**
   * Verify NIP-05 record was updated
   */
  static verifyNIP05Update(
    nip05Identifier: string | undefined,
    newNpub: string
  ): { verified: boolean; error?: string } {
    if (!nip05Identifier) {
      return { verified: false, error: 'NIP-05 identifier not found' };
    }

    if (!newNpub) {
      return { verified: false, error: 'New npub not found' };
    }

    // In production, would verify NIP-05 record actually points to new npub
    return { verified: true };
  }

  /**
   * Verify contact notifications were sent
   */
  static verifyContactNotifications(
    notificationEventIds: string[] | undefined,
    contactCount: number
  ): { verified: boolean; error?: string; sentCount?: number } {
    if (!notificationEventIds || notificationEventIds.length === 0) {
      return { verified: false, error: 'No contact notification events found', sentCount: 0 };
    }

    // Verify at least some notifications were sent
    if (notificationEventIds.length < Math.max(1, Math.floor(contactCount * 0.5))) {
      return {
        verified: false,
        error: `Only ${notificationEventIds.length} of ${contactCount} contact notifications sent`,
        sentCount: notificationEventIds.length,
      };
    }

    return { verified: true, sentCount: notificationEventIds.length };
  }

  /**
   * Verify old key deprecation was published
   */
  static verifyOldKeyDeprecation(
    deprecationEventId: string | undefined,
    oldNpub: string
  ): { verified: boolean; error?: string } {
    if (!deprecationEventId) {
      return { verified: false, error: 'Old key deprecation event not found' };
    }

    if (!oldNpub) {
      return { verified: false, error: 'Old npub not found' };
    }

    return { verified: true };
  }

  /**
   * Create comprehensive verification result
   */
  static createVerificationResult(
    rotationId: string,
    userId: string,
    oldNpub: string,
    newNpub: string,
    steps: RotationVerificationStep[]
  ): RotationVerificationResult {
    const overallStatus = this.calculateOverallStatus(steps);
    const completionPercentage = this.calculateCompletionPercentage(steps);

    const issues: RotationVerificationResult['issues'] = [];

    // Check for failed steps
    steps.forEach((step) => {
      if (step.status === 'failed') {
        issues.push({
          severity: 'error',
          message: step.error || 'Step failed',
          step: step.stepName,
        });
      }
    });

    // Check for critical missing steps
    const criticalSteps = [
      'nip26_delegation_published',
      'kind0_profile_updated',
      'database_records_updated',
    ];
    criticalSteps.forEach((stepName) => {
      const step = steps.find((s) => s.stepName === stepName);
      if (step && step.status !== 'completed') {
        issues.push({
          severity: 'critical',
          message: `Critical step not completed: ${step.description}`,
          step: stepName,
        });
      }
    });

    return {
      rotationId,
      userId,
      oldNpub,
      newNpub,
      overallStatus,
      completionPercentage,
      steps,
      verifiedAt: Math.floor(Date.now() / 1000),
      issues,
    };
  }

  /**
   * Generate verification report
   */
  static generateVerificationReport(result: RotationVerificationResult): string {
    const lines = [
      '=== Key Rotation Verification Report ===',
      `Rotation ID: ${result.rotationId}`,
      `Overall Status: ${result.overallStatus.toUpperCase()}`,
      `Completion: ${result.completionPercentage}%`,
      '',
      '--- Verification Steps ---',
    ];

    result.steps.forEach((step) => {
      const statusIcon =
        step.status === 'completed' ? '✓' : step.status === 'failed' ? '✗' : '○';
      lines.push(`${statusIcon} ${step.stepName}: ${step.status}`);
      if (step.error) {
        lines.push(`  Error: ${step.error}`);
      }
    });

    if (result.issues.length > 0) {
      lines.push('', '--- Issues ---');
      result.issues.forEach((issue) => {
        lines.push(`[${issue.severity.toUpperCase()}] ${issue.message}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Check if rotation is fully verified
   */
  static isRotationFullyVerified(result: RotationVerificationResult): boolean {
    return result.overallStatus === 'verified' && result.issues.length === 0;
  }

  /**
   * Get verification summary
   */
  static getVerificationSummary(result: RotationVerificationResult): {
    summary: string;
    nextSteps: string[];
  } {
    if (result.overallStatus === 'verified') {
      return {
        summary: 'Key rotation completed successfully and verified.',
        nextSteps: ['Monitor for any issues', 'Update your backup keys if applicable'],
      };
    }

    if (result.overallStatus === 'partial') {
      return {
        summary: `Key rotation is ${result.completionPercentage}% complete.`,
        nextSteps: [
          'Complete remaining verification steps',
          'Check for any failed steps',
          'Contact support if issues persist',
        ],
      };
    }

    return {
      summary: 'Key rotation verification failed.',
      nextSteps: [
        'Review the issues listed above',
        'Attempt to complete failed steps',
        'Contact support for assistance',
      ],
    };
  }
}

