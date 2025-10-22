/**
 * Automated Key Rotation Scheduler
 * Implements automated key rotation scheduling with configurable intervals
 */

export interface KeyRotationSchedule {
  scheduleId: string;
  userId: string;
  rotationIntervalDays: number; // Default: 90 days
  lastRotationAt: number;
  nextRotationAt: number;
  isEnabled: boolean;
  createdAt: number;
  updatedAt: number;
  metadata: {
    rotationCount: number;
    averageRotationTimeMs: number;
    lastRotationStatus: "success" | "failed" | "pending";
  };
}

export interface RotationScheduleNotification {
  notificationId: string;
  userId: string;
  scheduleId: string;
  notificationType: "upcoming" | "due" | "overdue" | "failed";
  daysUntilRotation: number;
  sentAt: number;
  acknowledged: boolean;
}

export interface RotationScheduleMetrics {
  totalSchedules: number;
  enabledSchedules: number;
  upcomingRotations: number;
  overdueRotations: number;
  failedRotations: number;
  averageRotationInterval: number;
}

/**
 * Automated Key Rotation Scheduler
 * Manages scheduled key rotations with notifications and metrics
 */
export class AutomatedKeyRotationScheduler {
  private static readonly DEFAULT_ROTATION_INTERVAL_DAYS = 90;
  private static readonly NOTIFICATION_THRESHOLDS = {
    upcoming: 14, // Notify 14 days before
    due: 0, // Notify on due date
    overdue: 7, // Notify 7 days after due date
  };

  /**
   * Create a new key rotation schedule for a user
   */
  static createRotationSchedule(
    userId: string,
    rotationIntervalDays: number = this.DEFAULT_ROTATION_INTERVAL_DAYS,
    startDate: number = Math.floor(Date.now() / 1000)
  ): KeyRotationSchedule {
    const now = Math.floor(Date.now() / 1000);

    return {
      scheduleId: `schedule_${Date.now()}_${Math.random()
        .toString(36)
        .substring(7)}`,
      userId,
      rotationIntervalDays,
      lastRotationAt: startDate,
      nextRotationAt: startDate + rotationIntervalDays * 86400,
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
      metadata: {
        rotationCount: 0,
        averageRotationTimeMs: 0,
        lastRotationStatus: "pending",
      },
    };
  }

  /**
   * Check if a rotation is due
   */
  static isRotationDue(schedule: KeyRotationSchedule): boolean {
    const now = Math.floor(Date.now() / 1000);
    return now >= schedule.nextRotationAt && schedule.isEnabled;
  }

  /**
   * Check if a rotation is overdue
   */
  static isRotationOverdue(
    schedule: KeyRotationSchedule,
    overdueDays: number = 7
  ): boolean {
    const now = Math.floor(Date.now() / 1000);
    const overdueThreshold = schedule.nextRotationAt + overdueDays * 86400;
    return now > overdueThreshold && schedule.isEnabled;
  }

  /**
   * Get days until next rotation (returns 0 for overdue)
   */
  static getDaysUntilRotation(schedule: KeyRotationSchedule): number {
    const now = Math.floor(Date.now() / 1000);
    const daysRemaining = (schedule.nextRotationAt - now) / 86400;
    return Math.max(0, Math.ceil(daysRemaining));
  }

  /**
   * Determine notification type based on schedule state
   */
  static getNotificationType(
    schedule: KeyRotationSchedule
  ): RotationScheduleNotification["notificationType"] | null {
    const now = Math.floor(Date.now() / 1000);
    const daysUntil = (schedule.nextRotationAt - now) / 86400;

    // Overdue: more than 7 days past due
    if (daysUntil < -7) {
      return "overdue";
    }

    // Due: within 1 day of due date (including past due up to 7 days)
    if (daysUntil <= 1 && daysUntil > -7) {
      return "due";
    }

    // Upcoming: 1 to 14 days away
    if (daysUntil > 1 && daysUntil <= this.NOTIFICATION_THRESHOLDS.upcoming) {
      return "upcoming";
    }

    return null;
  }

  /**
   * Create notification for rotation schedule
   */
  static createNotification(
    schedule: KeyRotationSchedule,
    notificationType: RotationScheduleNotification["notificationType"]
  ): RotationScheduleNotification {
    return {
      notificationId: `notif_${Date.now()}_${Math.random()
        .toString(36)
        .substring(7)}`,
      userId: schedule.userId,
      scheduleId: schedule.scheduleId,
      notificationType,
      daysUntilRotation: this.getDaysUntilRotation(schedule),
      sentAt: Math.floor(Date.now() / 1000),
      acknowledged: false,
    };
  }

  /**
   * Update schedule after successful rotation
   */
  static updateScheduleAfterRotation(
    schedule: KeyRotationSchedule,
    rotationTimeMs: number
  ): KeyRotationSchedule {
    const now = Math.floor(Date.now() / 1000);
    const rotationCount = schedule.metadata.rotationCount + 1;
    const totalTimeMs =
      schedule.metadata.averageRotationTimeMs *
        schedule.metadata.rotationCount +
      rotationTimeMs;
    const averageTimeMs = Math.round(totalTimeMs / rotationCount);

    return {
      ...schedule,
      lastRotationAt: now,
      nextRotationAt: now + schedule.rotationIntervalDays * 86400,
      updatedAt: now,
      metadata: {
        rotationCount,
        averageRotationTimeMs: averageTimeMs,
        lastRotationStatus: "success",
      },
    };
  }

  /**
   * Update schedule after failed rotation
   */
  static updateScheduleAfterFailure(
    schedule: KeyRotationSchedule
  ): KeyRotationSchedule {
    return {
      ...schedule,
      updatedAt: Math.floor(Date.now() / 1000),
      metadata: {
        ...schedule.metadata,
        lastRotationStatus: "failed",
      },
    };
  }

  /**
   * Enable or disable rotation schedule
   */
  static setScheduleEnabled(
    schedule: KeyRotationSchedule,
    enabled: boolean
  ): KeyRotationSchedule {
    return {
      ...schedule,
      isEnabled: enabled,
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Update rotation interval
   */
  static updateRotationInterval(
    schedule: KeyRotationSchedule,
    newIntervalDays: number
  ): KeyRotationSchedule {
    if (newIntervalDays < 30 || newIntervalDays > 365) {
      throw new Error("Rotation interval must be between 30 and 365 days");
    }

    const now = Math.floor(Date.now() / 1000);
    const nextRotation = now + newIntervalDays * 86400;

    return {
      ...schedule,
      rotationIntervalDays: newIntervalDays,
      nextRotationAt: nextRotation,
      updatedAt: now,
    };
  }

  /**
   * Get all schedules due for rotation
   */
  static filterDueSchedules(
    schedules: KeyRotationSchedule[]
  ): KeyRotationSchedule[] {
    return schedules.filter((s) => this.isRotationDue(s));
  }

  /**
   * Get all overdue schedules
   */
  static filterOverdueSchedules(
    schedules: KeyRotationSchedule[],
    overdueDays: number = 7
  ): KeyRotationSchedule[] {
    return schedules.filter((s) => this.isRotationOverdue(s, overdueDays));
  }

  /**
   * Calculate metrics for rotation schedules
   */
  static calculateMetrics(
    schedules: KeyRotationSchedule[]
  ): RotationScheduleMetrics {
    const enabledSchedules = schedules.filter((s) => s.isEnabled);
    const upcomingRotations = schedules.filter((s) => {
      const daysUntil = this.getDaysUntilRotation(s);
      return (
        daysUntil > 0 && daysUntil <= this.NOTIFICATION_THRESHOLDS.upcoming
      );
    });
    const overdueRotations = schedules.filter((s) => this.isRotationOverdue(s));
    const failedRotations = schedules.filter(
      (s) => s.metadata.lastRotationStatus === "failed"
    );

    const averageInterval =
      schedules.length > 0
        ? Math.round(
            schedules.reduce((sum, s) => sum + s.rotationIntervalDays, 0) /
              schedules.length
          )
        : 0;

    return {
      totalSchedules: schedules.length,
      enabledSchedules: enabledSchedules.length,
      upcomingRotations: upcomingRotations.length,
      overdueRotations: overdueRotations.length,
      failedRotations: failedRotations.length,
      averageRotationInterval: averageInterval,
    };
  }

  /**
   * Generate user-friendly notification message
   */
  static generateNotificationMessage(
    notification: RotationScheduleNotification
  ): { title: string; message: string; actionUrl: string } {
    switch (notification.notificationType) {
      case "upcoming":
        return {
          title: "Upcoming Key Rotation",
          message: `Your Nostr key rotation is scheduled in ${notification.daysUntilRotation} days. Plan ahead to ensure a smooth transition.`,
          actionUrl: "/settings/key-rotation",
        };

      case "due":
        return {
          title: "Key Rotation Due",
          message:
            "Your Nostr key rotation is due today. Rotating your keys regularly improves security.",
          actionUrl: "/settings/key-rotation",
        };

      case "overdue":
        return {
          title: "Key Rotation Overdue",
          message: `Your key rotation is ${Math.abs(
            notification.daysUntilRotation
          )} days overdue. Please rotate your keys as soon as possible.`,
          actionUrl: "/settings/key-rotation",
        };

      case "failed":
        return {
          title: "Key Rotation Failed",
          message:
            "Your scheduled key rotation failed. Please try again or contact support.",
          actionUrl: "/settings/key-rotation",
        };

      default:
        return {
          title: "Key Rotation Notification",
          message: "Check your key rotation schedule.",
          actionUrl: "/settings/key-rotation",
        };
    }
  }

  /**
   * Validate rotation interval
   */
  static validateRotationInterval(intervalDays: number): {
    valid: boolean;
    error?: string;
  } {
    if (intervalDays < 30) {
      return {
        valid: false,
        error: "Rotation interval must be at least 30 days",
      };
    }

    if (intervalDays > 365) {
      return {
        valid: false,
        error: "Rotation interval cannot exceed 365 days",
      };
    }

    return { valid: true };
  }
}
