/**
 * Guardian Consensus Resilience Module
 * Implements timeout handling, fallback mechanisms, and emergency recovery paths
 * for guardian consensus failures
 */

export interface GuardianTimeoutConfig {
  defaultTimeoutHours: number; // Default: 24 hours
  warningThresholdHours: number; // Notify user at 50% timeout
  emergencyThresholdHours: number; // Activate emergency recovery at 75% timeout
  maxRetries: number; // Maximum retry attempts
}

export interface GuardianConsensusState {
  requestId: string;
  operationType: string;
  requiredThreshold: number;
  totalGuardians: number;
  approvedGuardians: string[];
  respondedGuardians: string[];
  unresponsiveGuardians: string[];
  status:
    | "pending"
    | "threshold_met"
    | "timeout"
    | "emergency_recovery"
    | "failed";
  createdAt: number;
  expiresAt: number;
  lastWarningAt?: number;
  emergencyActivatedAt?: number;
}

export interface FallbackMechanism {
  type:
    | "reduced_quorum"
    | "emergency_recovery"
    | "backup_guardians"
    | "time_locked_recovery";
  description: string;
  requiredThreshold: number;
  timeoutHours: number;
  enabled: boolean;
}

export interface EmergencyRecoveryPath {
  pathId: string;
  operationType: string;
  activatedAt: number;
  expiresAt: number;
  recoveryMethod: "time_locked" | "backup_guardians" | "reduced_quorum";
  status: "active" | "completed" | "expired" | "cancelled";
  metadata: Record<string, unknown>;
}

/**
 * Guardian Consensus Resilience Manager
 * Handles timeout detection, fallback activation, and emergency recovery
 */
export class GuardianConsensusResilienceManager {
  private static readonly DEFAULT_CONFIG: GuardianTimeoutConfig = {
    defaultTimeoutHours: 24,
    warningThresholdHours: 12, // 50% of 24 hours
    emergencyThresholdHours: 18, // 75% of 24 hours
    maxRetries: 3,
  };

  /**
   * Check if consensus request has timed out
   */
  static hasTimedOut(state: GuardianConsensusState): boolean {
    const now = Math.floor(Date.now() / 1000);
    return now > state.expiresAt;
  }

  /**
   * Check if warning threshold has been reached
   */
  static shouldWarnAboutTimeout(
    state: GuardianConsensusState,
    config: GuardianTimeoutConfig = this.DEFAULT_CONFIG
  ): boolean {
    const now = Math.floor(Date.now() / 1000);
    const warningThreshold =
      state.createdAt + config.warningThresholdHours * 3600;

    return now >= warningThreshold && !state.lastWarningAt;
  }

  /**
   * Check if emergency recovery should be activated
   */
  static shouldActivateEmergencyRecovery(
    state: GuardianConsensusState,
    config: GuardianTimeoutConfig = this.DEFAULT_CONFIG
  ): boolean {
    const now = Math.floor(Date.now() / 1000);
    const emergencyThreshold =
      state.createdAt + config.emergencyThresholdHours * 3600;

    return (
      now >= emergencyThreshold &&
      !state.emergencyActivatedAt &&
      state.status === "pending"
    );
  }

  /**
   * Get list of unresponsive guardians
   */
  static getUnresponsiveGuardians(
    allGuardians: string[],
    respondedGuardians: string[]
  ): string[] {
    return allGuardians.filter((g) => !respondedGuardians.includes(g));
  }

  /**
   * Calculate reduced quorum threshold for fallback
   * Reduces threshold by 1 when consensus cannot be reached
   */
  static calculateReducedQuorumThreshold(
    originalThreshold: number,
    totalGuardians: number,
    minThreshold: number = 1
  ): number {
    const reduced = Math.max(minThreshold, originalThreshold - 1);
    return Math.min(reduced, totalGuardians);
  }

  /**
   * Determine best fallback mechanism based on consensus state
   */
  static determineBestFallback(
    state: GuardianConsensusState,
    availableBackupGuardians: string[] = [],
    config: GuardianTimeoutConfig = this.DEFAULT_CONFIG
  ): FallbackMechanism | null {
    const unresponsive = this.getUnresponsiveGuardians(
      Array(state.totalGuardians)
        .fill(0)
        .map((_, i) => `guardian_${i}`),
      state.respondedGuardians
    );

    // If we have backup guardians available, use them
    if (availableBackupGuardians.length > 0) {
      return {
        type: "backup_guardians",
        description: "Use backup guardians to reach consensus",
        requiredThreshold: state.requiredThreshold,
        timeoutHours: config.defaultTimeoutHours,
        enabled: true,
      };
    }

    // If we're close to threshold with responded guardians, use reduced quorum
    const approvedCount = state.approvedGuardians.length;
    const reducedThreshold = this.calculateReducedQuorumThreshold(
      state.requiredThreshold,
      state.totalGuardians
    );

    if (approvedCount >= reducedThreshold) {
      return {
        type: "reduced_quorum",
        description: "Proceed with reduced quorum threshold",
        requiredThreshold: reducedThreshold,
        timeoutHours: config.defaultTimeoutHours,
        enabled: true,
      };
    }

    // Last resort: time-locked recovery
    return {
      type: "emergency_recovery",
      description: "Activate time-locked emergency recovery",
      requiredThreshold: 0, // No guardian approval needed
      timeoutHours: 72, // 3-day time lock
      enabled: true,
    };
  }

  /**
   * Create emergency recovery path
   */
  static createEmergencyRecoveryPath(
    operationType: string,
    recoveryMethod: "time_locked" | "backup_guardians" | "reduced_quorum",
    timeoutHours: number = 72
  ): EmergencyRecoveryPath {
    const now = Math.floor(Date.now() / 1000);

    return {
      pathId: `recovery_${Date.now()}_${Math.random()
        .toString(36)
        .substring(7)}`,
      operationType,
      activatedAt: now,
      expiresAt: now + timeoutHours * 3600,
      recoveryMethod,
      status: "active",
      metadata: {
        activationReason: "Guardian consensus timeout",
        recoveryMethod,
        timeoutHours,
      },
    };
  }

  /**
   * Check if emergency recovery path has expired
   */
  static hasEmergencyRecoveryExpired(path: EmergencyRecoveryPath): boolean {
    const now = Math.floor(Date.now() / 1000);
    return now > path.expiresAt;
  }

  /**
   * Generate comprehensive error notification for user
   */
  static generateTimeoutNotification(
    state: GuardianConsensusState,
    unresponsiveGuardians: string[],
    fallback: FallbackMechanism | null
  ): {
    title: string;
    message: string;
    severity: "warning" | "error" | "critical";
    actions: Array<{ label: string; action: string }>;
  } {
    const unresponsiveCount = unresponsiveGuardians.length;
    const respondedCount = state.respondedGuardians.length;

    if (fallback?.type === "reduced_quorum") {
      return {
        title: "Guardian Consensus - Reduced Quorum Available",
        message: `${respondedCount} of ${state.totalGuardians} guardians have responded. You can proceed with reduced quorum (${fallback.requiredThreshold} approvals needed).`,
        severity: "warning",
        actions: [
          {
            label: "Proceed with Reduced Quorum",
            action: "proceed_reduced_quorum",
          },
          { label: "Wait for More Guardians", action: "wait_for_guardians" },
          { label: "Cancel Operation", action: "cancel_operation" },
        ],
      };
    }

    if (fallback?.type === "backup_guardians") {
      return {
        title: "Guardian Consensus - Using Backup Guardians",
        message: `${unresponsiveCount} guardians are unresponsive. Backup guardians are available to complete the consensus.`,
        severity: "warning",
        actions: [
          { label: "Use Backup Guardians", action: "use_backup_guardians" },
          {
            label: "Wait for Original Guardians",
            action: "wait_for_guardians",
          },
          { label: "Cancel Operation", action: "cancel_operation" },
        ],
      };
    }

    if (fallback?.type === "emergency_recovery") {
      return {
        title: "Guardian Consensus Failed - Emergency Recovery Available",
        message: `Guardian consensus has failed. Emergency recovery is available with a 72-hour time lock for security.`,
        severity: "critical",
        actions: [
          {
            label: "Activate Emergency Recovery",
            action: "activate_emergency_recovery",
          },
          { label: "Contact Support", action: "contact_support" },
          { label: "Cancel Operation", action: "cancel_operation" },
        ],
      };
    }

    return {
      title: "Guardian Consensus Timeout",
      message: `Consensus request has timed out. ${unresponsiveCount} guardians did not respond.`,
      severity: "error",
      actions: [
        { label: "Retry", action: "retry_consensus" },
        { label: "Contact Support", action: "contact_support" },
        { label: "Cancel Operation", action: "cancel_operation" },
      ],
    };
  }

  /**
   * Update consensus state with timeout information
   */
  static updateStateWithTimeout(
    state: GuardianConsensusState,
    unresponsiveGuardians: string[]
  ): GuardianConsensusState {
    return {
      ...state,
      unresponsiveGuardians,
      status: "timeout",
      lastWarningAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Activate emergency recovery in consensus state
   */
  static activateEmergencyRecovery(
    state: GuardianConsensusState
  ): GuardianConsensusState {
    return {
      ...state,
      status: "emergency_recovery",
      emergencyActivatedAt: Math.floor(Date.now() / 1000),
    };
  }
}
