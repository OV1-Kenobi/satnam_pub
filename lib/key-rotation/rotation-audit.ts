/**
 * Key Rotation Audit Trail Module
 * Maintains comprehensive audit trail for all key rotation events
 */

export interface RotationAuditEntry {
  entryId: string;
  rotationId: string;
  userId: string;
  eventType: 'initiated' | 'published' | 'verified' | 'completed' | 'failed' | 'rolled_back' | 'cancelled';
  timestamp: number;
  actor: string; // User or system
  details: {
    oldNpub?: string;
    newNpub?: string;
    nip05?: string;
    lightningAddress?: string;
    eventIds?: string[];
    errorMessage?: string;
    rollbackReason?: string;
    [key: string]: unknown;
  };
  ipAddress?: string;
  userAgent?: string;
}

export interface RotationAuditTrail {
  rotationId: string;
  userId: string;
  entries: RotationAuditEntry[];
  createdAt: number;
  completedAt?: number;
  status: 'in_progress' | 'completed' | 'failed' | 'rolled_back';
}

/**
 * Key Rotation Audit Manager
 * Manages audit trail for key rotation operations
 */
export class RotationAuditManager {
  /**
   * Create new audit trail for rotation
   */
  static createAuditTrail(rotationId: string, userId: string): RotationAuditTrail {
    return {
      rotationId,
      userId,
      entries: [],
      createdAt: Math.floor(Date.now() / 1000),
      status: 'in_progress',
    };
  }

  /**
   * Add entry to audit trail
   */
  static addAuditEntry(
    trail: RotationAuditTrail,
    eventType: RotationAuditEntry['eventType'],
    actor: string,
    details: RotationAuditEntry['details'],
    ipAddress?: string,
    userAgent?: string
  ): RotationAuditTrail {
    const entry: RotationAuditEntry = {
      entryId: `audit_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      rotationId: trail.rotationId,
      userId: trail.userId,
      eventType,
      timestamp: Math.floor(Date.now() / 1000),
      actor,
      details,
      ipAddress,
      userAgent,
    };

    return {
      ...trail,
      entries: [...trail.entries, entry],
    };
  }

  /**
   * Mark rotation as completed in audit trail
   */
  static markRotationCompleted(trail: RotationAuditTrail): RotationAuditTrail {
    return {
      ...trail,
      status: 'completed',
      completedAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Mark rotation as failed in audit trail
   */
  static markRotationFailed(trail: RotationAuditTrail, errorMessage: string): RotationAuditTrail {
    const updatedTrail = this.addAuditEntry(
      trail,
      'failed',
      'system',
      { errorMessage }
    );

    return {
      ...updatedTrail,
      status: 'failed',
      completedAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Mark rotation as rolled back in audit trail
   */
  static markRotationRolledBack(
    trail: RotationAuditTrail,
    rollbackReason: string,
    actor: string
  ): RotationAuditTrail {
    const updatedTrail = this.addAuditEntry(
      trail,
      'rolled_back',
      actor,
      { rollbackReason }
    );

    return {
      ...updatedTrail,
      status: 'rolled_back',
      completedAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Get audit entries by event type
   */
  static getEntriesByType(
    trail: RotationAuditTrail,
    eventType: RotationAuditEntry['eventType']
  ): RotationAuditEntry[] {
    return trail.entries.filter((e) => e.eventType === eventType);
  }

  /**
   * Get audit entries by actor
   */
  static getEntriesByActor(trail: RotationAuditTrail, actor: string): RotationAuditEntry[] {
    return trail.entries.filter((e) => e.actor === actor);
  }

  /**
   * Get audit entries within time range
   */
  static getEntriesInTimeRange(
    trail: RotationAuditTrail,
    startTime: number,
    endTime: number
  ): RotationAuditEntry[] {
    return trail.entries.filter((e) => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  /**
   * Calculate rotation duration
   */
  static calculateRotationDuration(trail: RotationAuditTrail): number {
    if (!trail.completedAt) {
      return Math.floor(Date.now() / 1000) - trail.createdAt;
    }
    return trail.completedAt - trail.createdAt;
  }

  /**
   * Get rotation timeline
   */
  static getRotationTimeline(trail: RotationAuditTrail): Array<{
    eventType: string;
    timestamp: number;
    actor: string;
    description: string;
  }> {
    return trail.entries.map((entry) => ({
      eventType: entry.eventType,
      timestamp: entry.timestamp,
      actor: entry.actor,
      description: this.getEventDescription(entry),
    }));
  }

  /**
   * Get human-readable event description
   */
  private static getEventDescription(entry: RotationAuditEntry): string {
    switch (entry.eventType) {
      case 'initiated':
        return `Key rotation initiated by ${entry.actor}`;
      case 'published':
        return `Rotation events published (${entry.details.eventIds?.length || 0} events)`;
      case 'verified':
        return 'Rotation verified successfully';
      case 'completed':
        return `Rotation completed (old: ${entry.details.oldNpub?.substring(0, 16)}..., new: ${entry.details.newNpub?.substring(0, 16)}...)`;
      case 'failed':
        return `Rotation failed: ${entry.details.errorMessage}`;
      case 'rolled_back':
        return `Rotation rolled back: ${entry.details.rollbackReason}`;
      case 'cancelled':
        return 'Rotation cancelled';
      default:
        return 'Unknown event';
    }
  }

  /**
   * Generate audit report
   */
  static generateAuditReport(trail: RotationAuditTrail): string {
    const duration = this.calculateRotationDuration(trail);
    const durationMinutes = Math.round(duration / 60);

    const lines = [
      '=== Key Rotation Audit Report ===',
      `Rotation ID: ${trail.rotationId}`,
      `User ID: ${trail.userId}`,
      `Status: ${trail.status.toUpperCase()}`,
      `Duration: ${durationMinutes} minutes`,
      `Total Events: ${trail.entries.length}`,
      '',
      '--- Timeline ---',
    ];

    const timeline = this.getRotationTimeline(trail);
    timeline.forEach((event) => {
      const date = new Date(event.timestamp * 1000).toISOString();
      lines.push(`[${date}] ${event.eventType.toUpperCase()}: ${event.description}`);
    });

    lines.push('', '--- Event Summary ---');
    const eventCounts = new Map<string, number>();
    trail.entries.forEach((entry) => {
      eventCounts.set(entry.eventType, (eventCounts.get(entry.eventType) || 0) + 1);
    });

    eventCounts.forEach((count, type) => {
      lines.push(`${type}: ${count}`);
    });

    return lines.join('\n');
  }

  /**
   * Check for suspicious activity in audit trail
   */
  static checkForSuspiciousActivity(trail: RotationAuditTrail): Array<{
    severity: 'warning' | 'critical';
    message: string;
  }> {
    const issues: Array<{ severity: 'warning' | 'critical'; message: string }> = [];

    // Check for multiple failed attempts
    const failedEntries = this.getEntriesByType(trail, 'failed');
    if (failedEntries.length > 2) {
      issues.push({
        severity: 'warning',
        message: `Multiple rotation failures detected (${failedEntries.length} failures)`,
      });
    }

    // Check for rollbacks
    const rolledBackEntries = this.getEntriesByType(trail, 'rolled_back');
    if (rolledBackEntries.length > 0) {
      issues.push({
        severity: 'warning',
        message: `Rotation was rolled back ${rolledBackEntries.length} time(s)`,
      });
    }

    // Check for unusual actors
    const actors = new Set(trail.entries.map((e) => e.actor));
    if (actors.size > 2) {
      issues.push({
        severity: 'warning',
        message: `Rotation involved multiple actors: ${Array.from(actors).join(', ')}`,
      });
    }

    // Check for very long duration
    const duration = this.calculateRotationDuration(trail);
    if (duration > 86400) {
      // More than 24 hours
      issues.push({
        severity: 'warning',
        message: `Rotation took unusually long (${Math.round(duration / 3600)} hours)`,
      });
    }

    return issues;
  }

  /**
   * Export audit trail as JSON
   */
  static exportAsJSON(trail: RotationAuditTrail): string {
    return JSON.stringify(trail, null, 2);
  }

  /**
   * Export audit trail as CSV
   */
  static exportAsCSV(trail: RotationAuditTrail): string {
    const headers = ['Entry ID', 'Event Type', 'Timestamp', 'Actor', 'Details'];
    const rows = trail.entries.map((entry) => [
      entry.entryId,
      entry.eventType,
      new Date(entry.timestamp * 1000).toISOString(),
      entry.actor,
      JSON.stringify(entry.details),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csvContent;
  }
}

