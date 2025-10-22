/**
 * Guardian Replacement Module
 * Implements guardian replacement workflows for permanently unavailable guardians
 */

export interface GuardianReplacementRequest {
  requestId: string;
  familyId: string;
  requesterId: string;
  guardianToReplace: string;
  replacementGuardian: string;
  reason: 'permanently_unavailable' | 'compromised' | 'voluntary_resignation' | 'other';
  reasonDetails?: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'completed';
  approvals: Array<{
    guardianId: string;
    approval: 'approved' | 'rejected' | 'abstained';
    approvedAt: number;
    reason?: string;
  }>;
  requiredApprovals: number;
  currentApprovals: number;
}

export interface BackupGuardianSet {
  setId: string;
  familyId: string;
  guardians: Array<{
    guardianId: string;
    npub: string;
    role: 'primary' | 'backup' | 'emergency';
    trustLevel: number; // 1-5
    activatedAt?: number;
  }>;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}

export interface GuardianReplacementAuditEntry {
  entryId: string;
  familyId: string;
  replacementRequestId: string;
  action: 'requested' | 'approved' | 'rejected' | 'completed' | 'cancelled';
  actor: string;
  timestamp: number;
  details: Record<string, unknown>;
}

/**
 * Guardian Replacement Manager
 * Handles guardian replacement workflows and backup guardian management
 */
export class GuardianReplacementManager {
  /**
   * Create a guardian replacement request
   */
  static createReplacementRequest(
    familyId: string,
    requesterId: string,
    guardianToReplace: string,
    replacementGuardian: string,
    reason: GuardianReplacementRequest['reason'],
    reasonDetails?: string,
    expiresInHours: number = 72
  ): GuardianReplacementRequest {
    const now = Math.floor(Date.now() / 1000);

    return {
      requestId: `replacement_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      familyId,
      requesterId,
      guardianToReplace,
      replacementGuardian,
      reason,
      reasonDetails,
      createdAt: now,
      expiresAt: now + expiresInHours * 3600,
      status: 'pending',
      approvals: [],
      requiredApprovals: 2, // Require at least 2 approvals for replacement
      currentApprovals: 0,
    };
  }

  /**
   * Validate replacement request
   */
  static validateReplacementRequest(
    request: GuardianReplacementRequest,
    allGuardians: string[]
  ): { valid: boolean; error?: string } {
    const now = Math.floor(Date.now() / 1000);

    if (request.expiresAt < now) {
      return { valid: false, error: 'Replacement request has expired' };
    }

    if (!allGuardians.includes(request.guardianToReplace)) {
      return { valid: false, error: 'Guardian to replace is not in family' };
    }

    if (request.guardianToReplace === request.replacementGuardian) {
      return { valid: false, error: 'Cannot replace guardian with themselves' };
    }

    if (!request.reason) {
      return { valid: false, error: 'Replacement reason is required' };
    }

    return { valid: true };
  }

  /**
   * Add approval to replacement request
   */
  static addApproval(
    request: GuardianReplacementRequest,
    guardianId: string,
    approval: 'approved' | 'rejected' | 'abstained',
    reason?: string
  ): GuardianReplacementRequest {
    // Check if guardian already approved
    const existingApproval = request.approvals.find((a) => a.guardianId === guardianId);
    if (existingApproval) {
      return request; // Already approved, don't add duplicate
    }

    const newApproval = {
      guardianId,
      approval,
      approvedAt: Math.floor(Date.now() / 1000),
      reason,
    };

    const updatedRequest = {
      ...request,
      approvals: [...request.approvals, newApproval],
    };

    // Update current approvals count
    updatedRequest.currentApprovals = updatedRequest.approvals.filter(
      (a) => a.approval === 'approved'
    ).length;

    // Update status if threshold reached
    if (updatedRequest.currentApprovals >= updatedRequest.requiredApprovals) {
      updatedRequest.status = 'approved';
    }

    return updatedRequest;
  }

  /**
   * Check if replacement request has been approved
   */
  static isReplacementApproved(request: GuardianReplacementRequest): boolean {
    return request.status === 'approved' && request.currentApprovals >= request.requiredApprovals;
  }

  /**
   * Check if replacement request has expired
   */
  static hasReplacementExpired(request: GuardianReplacementRequest): boolean {
    const now = Math.floor(Date.now() / 1000);
    return now > request.expiresAt && request.status === 'pending';
  }

  /**
   * Create backup guardian set
   */
  static createBackupGuardianSet(
    familyId: string,
    guardians: Array<{
      guardianId: string;
      npub: string;
      role: 'primary' | 'backup' | 'emergency';
      trustLevel: number;
    }>
  ): BackupGuardianSet {
    return {
      setId: `backup_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      familyId,
      guardians,
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
      isActive: true,
    };
  }

  /**
   * Activate backup guardian from set
   */
  static activateBackupGuardian(
    backupSet: BackupGuardianSet,
    guardianId: string
  ): BackupGuardianSet {
    const updatedGuardians = backupSet.guardians.map((g) => {
      if (g.guardianId === guardianId) {
        return {
          ...g,
          activatedAt: Math.floor(Date.now() / 1000),
        };
      }
      return g;
    });

    return {
      ...backupSet,
      guardians: updatedGuardians,
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Get available backup guardians
   */
  static getAvailableBackupGuardians(
    backupSet: BackupGuardianSet,
    excludeGuardians: string[] = []
  ): Array<{
    guardianId: string;
    npub: string;
    role: 'primary' | 'backup' | 'emergency';
    trustLevel: number;
  }> {
    return backupSet.guardians.filter(
      (g) => !excludeGuardians.includes(g.guardianId) && !g.activatedAt
    );
  }

  /**
   * Generate audit entry for replacement action
   */
  static createAuditEntry(
    familyId: string,
    replacementRequestId: string,
    action: GuardianReplacementAuditEntry['action'],
    actor: string,
    details: Record<string, unknown> = {}
  ): GuardianReplacementAuditEntry {
    return {
      entryId: `audit_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      familyId,
      replacementRequestId,
      action,
      actor,
      timestamp: Math.floor(Date.now() / 1000),
      details,
    };
  }

  /**
   * Generate notification for replacement request
   */
  static generateReplacementNotification(
    request: GuardianReplacementRequest
  ): {
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
    actions: Array<{ label: string; action: string }>;
  } {
    if (request.status === 'approved') {
      return {
        title: 'Guardian Replacement Approved',
        message: `Guardian replacement has been approved. ${request.replacementGuardian} will replace ${request.guardianToReplace}.`,
        severity: 'info',
        actions: [
          { label: 'View Details', action: 'view_replacement_details' },
          { label: 'Acknowledge', action: 'acknowledge_replacement' },
        ],
      };
    }

    if (request.status === 'rejected') {
      return {
        title: 'Guardian Replacement Rejected',
        message: `Guardian replacement request has been rejected by family members.`,
        severity: 'warning',
        actions: [
          { label: 'View Details', action: 'view_replacement_details' },
          { label: 'Create New Request', action: 'create_new_request' },
        ],
      };
    }

    return {
      title: 'Guardian Replacement Request',
      message: `Guardian replacement request pending approval. ${request.currentApprovals}/${request.requiredApprovals} approvals received.`,
      severity: 'info',
      actions: [
        { label: 'View Request', action: 'view_replacement_request' },
        { label: 'Approve', action: 'approve_replacement' },
        { label: 'Reject', action: 'reject_replacement' },
      ],
    };
  }

  /**
   * Calculate replacement priority based on guardian trust level and availability
   */
  static calculateReplacementPriority(
    guardianToReplace: {
      trustLevel: number;
      lastSeenAt: number;
      isResponsive: boolean;
    },
    reason: GuardianReplacementRequest['reason']
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (reason === 'compromised') return 'critical';
    if (!guardianToReplace.isResponsive) return 'high';
    if (guardianToReplace.trustLevel < 2) return 'medium';
    return 'low';
  }
}

