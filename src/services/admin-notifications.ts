/**
 * Admin Notifications Service
 * Handles platform admin notifications via Nostr DM and email
 * 
 * Phase 5: Automation & Monitoring
 * 
 * Features:
 * - Nostr DM notifications (NIP-04/NIP-59)
 * - Email notifications (via configured SMTP)
 * - Rate limiting to prevent notification spam
 * - Notification severity levels
 * - Read/unread tracking
 * - Notification history
 * 
 * @compliance Privacy-first, zero-knowledge
 */

export type NotificationSeverity = "info" | "warning" | "error" | "critical";
export type NotificationType =
  | "orphan_detection"
  | "account_removal"
  | "security_alert"
  | "system_health"
  | "rate_limit_exceeded"
  | "backup_reminder";

export interface AdminNotification {
  id: string;
  notification_type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  read: boolean;
  read_at?: string;
}

export interface NotificationConfig {
  enableNostrDM: boolean;
  enableEmail: boolean;
  adminNpubs: string[];
  adminEmails: string[];
  rateLimitPerHour: number;
  minSeverityForEmail: NotificationSeverity;
}

// Rate limiting state
const notificationCounts: Map<string, { count: number; resetAt: number }> =
  new Map();

const SEVERITY_PRIORITY: Record<NotificationSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

/**
 * Check if notification is rate limited
 */
function isRateLimited(
  type: NotificationType,
  config: NotificationConfig
): boolean {
  const key = type;
  const now = Date.now();
  const state = notificationCounts.get(key);

  if (!state || now > state.resetAt) {
    notificationCounts.set(key, {
      count: 1,
      resetAt: now + 60 * 60 * 1000, // 1 hour
    });
    return false;
  }

  if (state.count >= config.rateLimitPerHour) {
    return true;
  }

  state.count++;
  return false;
}

/**
 * Get default notification configuration
 */
export function getDefaultConfig(): NotificationConfig {
  return {
    enableNostrDM: true,
    enableEmail: false,
    adminNpubs: [],
    adminEmails: [],
    rateLimitPerHour: 10,
    minSeverityForEmail: "error",
  };
}

/**
 * Create a notification object
 */
export function createNotification(
  type: NotificationType,
  severity: NotificationSeverity,
  title: string,
  message: string,
  metadata?: Record<string, unknown>
): Omit<AdminNotification, "id"> {
  return {
    notification_type: type,
    severity,
    title,
    message,
    metadata,
    created_at: new Date().toISOString(),
    read: false,
  };
}

/**
 * Check if notification should trigger email based on severity
 */
export function shouldSendEmail(
  severity: NotificationSeverity,
  config: NotificationConfig
): boolean {
  if (!config.enableEmail || config.adminEmails.length === 0) {
    return false;
  }
  return (
    SEVERITY_PRIORITY[severity] >= SEVERITY_PRIORITY[config.minSeverityForEmail]
  );
}

/**
 * Format notification for Nostr DM
 */
export function formatNostrDM(notification: Omit<AdminNotification, "id">): string {
  const severityEmoji: Record<NotificationSeverity, string> = {
    info: "ℹ️",
    warning: "⚠️",
    error: "❌",
    critical: "🚨",
  };

  return `${severityEmoji[notification.severity]} ${notification.title}\n\n${notification.message}\n\nTime: ${notification.created_at}`;
}

/**
 * Send notification (client-side stub - actual sending happens server-side)
 */
export async function sendNotification(
  notification: Omit<AdminNotification, "id">,
  config: NotificationConfig,
  sessionToken: string
): Promise<{ success: boolean; error?: string }> {
  if (isRateLimited(notification.notification_type, config)) {
    return { success: false, error: "Rate limited" };
  }

  try {
    const response = await fetch("/api/admin/notifications", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notification, config }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: false, error: data.error || "Failed to send" };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

