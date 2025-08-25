/**
 * Notification Service
 *
 * Manages dashboard notifications including NIP-59 message handling,
 * read/unread status tracking, and real-time updates.
 */

export interface DashboardNotification {
  id: string;
  type:
    | "payment_success"
    | "payment_failure"
    | "insufficient_funds"
    | "system_alert"
    | "general";
  title: string;
  content: string;
  timestamp: string;
  isRead: boolean;
  sender?: string;
  senderNpub?: string;
  scheduleId?: string;
  transactionId?: string;
  actionButtons?: NotificationAction[];
  metadata?: Record<string, any>;
}

export interface NotificationAction {
  label: string;
  action:
    | "retry_payment"
    | "add_funds"
    | "pause_schedule"
    | "view_schedule"
    | "dismiss"
    | "custom";
  data?: Record<string, any>;
  style?: "primary" | "secondary" | "danger";
}

export interface NotificationFilter {
  type?: DashboardNotification["type"];
  isRead?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  searchQuery?: string;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<DashboardNotification["type"], number>;
}

export class NotificationService {
  private static instance: NotificationService;
  private notifications: DashboardNotification[] = [];
  private listeners: Set<(notifications: DashboardNotification[]) => void> =
    new Set();
  private storageKey = "satnam_dashboard_notifications";

  private constructor() {
    this.loadNotifications();
    this.setupMessageListener();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Add a new notification
   */
  public addNotification(
    notification: Omit<DashboardNotification, "id" | "timestamp" | "isRead">
  ): void {
    const newNotification: DashboardNotification = {
      ...notification,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      isRead: false,
    };

    this.notifications.unshift(newNotification);
    this.saveNotifications();
    this.notifyListeners();

    // Show toast for new notifications if user is active
    this.showToastForNewNotification(newNotification);
  }

  /**
   * Get all notifications with optional filtering
   */
  public getNotifications(
    filter?: NotificationFilter
  ): DashboardNotification[] {
    let filtered = [...this.notifications];

    if (filter) {
      if (filter.type) {
        filtered = filtered.filter((n) => n.type === filter.type);
      }

      if (filter.isRead !== undefined) {
        filtered = filtered.filter((n) => n.isRead === filter.isRead);
      }

      if (filter.dateRange) {
        filtered = filtered.filter((n) => {
          const notificationDate = new Date(n.timestamp);
          return (
            notificationDate >= filter.dateRange!.start &&
            notificationDate <= filter.dateRange!.end
          );
        });
      }

      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase();
        filtered = filtered.filter(
          (n) =>
            n.title.toLowerCase().includes(query) ||
            n.content.toLowerCase().includes(query) ||
            (n.sender && n.sender.toLowerCase().includes(query))
        );
      }
    }

    return filtered.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Mark notification as read
   */
  public markAsRead(notificationId: string): void {
    const notification = this.notifications.find(
      (n) => n.id === notificationId
    );
    if (notification && !notification.isRead) {
      notification.isRead = true;
      this.saveNotifications();
      this.notifyListeners();
    }
  }

  /**
   * Mark multiple notifications as read
   */
  public markMultipleAsRead(notificationIds: string[]): void {
    let changed = false;
    notificationIds.forEach((id) => {
      const notification = this.notifications.find((n) => n.id === id);
      if (notification && !notification.isRead) {
        notification.isRead = true;
        changed = true;
      }
    });

    if (changed) {
      this.saveNotifications();
      this.notifyListeners();
    }
  }

  /**
   * Mark all notifications as read
   */
  public markAllAsRead(): void {
    let changed = false;
    this.notifications.forEach((notification) => {
      if (!notification.isRead) {
        notification.isRead = true;
        changed = true;
      }
    });

    if (changed) {
      this.saveNotifications();
      this.notifyListeners();
    }
  }

  /**
   * Delete notification
   */
  public deleteNotification(notificationId: string): void {
    const index = this.notifications.findIndex((n) => n.id === notificationId);
    if (index !== -1) {
      this.notifications.splice(index, 1);
      this.saveNotifications();
      this.notifyListeners();
    }
  }

  /**
   * Delete old notifications (older than specified days)
   */
  public deleteOldNotifications(daysOld: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const initialLength = this.notifications.length;
    this.notifications = this.notifications.filter(
      (n) => new Date(n.timestamp) > cutoffDate
    );

    if (this.notifications.length !== initialLength) {
      this.saveNotifications();
      this.notifyListeners();
    }
  }

  /**
   * Get notification statistics
   */
  public getStats(): NotificationStats {
    const stats: NotificationStats = {
      total: this.notifications.length,
      unread: this.notifications.filter((n) => !n.isRead).length,
      byType: {
        payment_success: 0,
        payment_failure: 0,
        insufficient_funds: 0,
        system_alert: 0,
        general: 0,
      },
    };

    this.notifications.forEach((notification) => {
      stats.byType[notification.type]++;
    });

    return stats;
  }

  /**
   * Subscribe to notification updates
   */
  public subscribe(
    listener: (notifications: DashboardNotification[]) => void
  ): () => void {
    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Process incoming NIP-59 message as notification
   */
  public processIncomingMessage(
    content: string,
    sender?: string,
    senderNpub?: string,
    metadata?: Record<string, any>
  ): void {
    // Determine notification type from content
    const type = this.determineNotificationType(content);

    // Extract title from content
    const title = this.extractTitleFromContent(content, type);

    // Create action buttons based on type
    const actionButtons = this.createActionButtons(type, metadata);

    this.addNotification({
      type,
      title,
      content,
      sender,
      senderNpub,
      scheduleId: metadata?.scheduleId,
      transactionId: metadata?.transactionId,
      actionButtons,
      metadata,
    });
  }

  /**
   * Handle notification actions
   */
  public async handleNotificationAction(
    notificationId: string,
    action: NotificationAction
  ): Promise<void> {
    const notification = this.notifications.find(
      (n) => n.id === notificationId
    );
    if (!notification) return;

    try {
      switch (action.action) {
        case "retry_payment":
          await this.handleRetryPayment(notification, action.data);
          break;
        case "add_funds":
          await this.handleAddFunds(notification, action.data);
          break;
        case "pause_schedule":
          await this.handlePauseSchedule(notification, action.data);
          break;
        case "view_schedule":
          await this.handleViewSchedule(notification, action.data);
          break;
        case "dismiss":
          this.markAsRead(notificationId);
          break;
        case "custom":
          // Handle custom actions based on action.data
          break;
        default:
          console.warn(`Unknown notification action: ${action.action}`);
      }
    } catch (error) {
      console.error(
        `Failed to handle notification action ${action.action} for notification ${notificationId}:`,
        error
      );
      // Re-throw to allow calling code to handle the error appropriately
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private generateId(): string {
    return `notification_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  private loadNotifications(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.notifications = JSON.parse(stored);
      }
    } catch (error) {
      console.error("Failed to load notifications from storage:", error);
      this.notifications = [];
    }
  }

  private saveNotifications(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.notifications));
    } catch (error) {
      console.error("Failed to save notifications to storage:", error);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener([...this.notifications]);
      } catch (error) {
        console.error("Error notifying notification listener:", error);
      }
    });
  }

  private setupMessageListener(): void {
    // This would integrate with the NIP-59 message receiving system
    // For now, it's a placeholder for the integration point
  }

  private determineNotificationType(
    content: string
  ): DashboardNotification["type"] {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes("insufficient funds")) {
      return "insufficient_funds";
    }

    if (
      lowerContent.includes("payment failed") ||
      lowerContent.includes("failed")
    ) {
      return "payment_failure";
    }

    if (
      lowerContent.includes("payment sent") ||
      lowerContent.includes("successfully")
    ) {
      return "payment_success";
    }

    if (lowerContent.includes("system") || lowerContent.includes("alert")) {
      return "system_alert";
    }

    return "general";
  }

  private extractTitleFromContent(
    content: string,
    type: DashboardNotification["type"]
  ): string {
    const lines = content.split("\n");
    const firstLine = lines[0]?.trim();

    if (firstLine && firstLine.length > 0) {
      return firstLine.replace(/^[⚠️✅❌💰🔔]+\s*/, ""); // Remove emoji prefixes
    }

    // Fallback titles based on type
    switch (type) {
      case "payment_success":
        return "Payment Sent Successfully";
      case "payment_failure":
        return "Payment Failed";
      case "insufficient_funds":
        return "Insufficient Funds";
      case "system_alert":
        return "System Alert";
      default:
        return "New Message";
    }
  }

  private createActionButtons(
    type: DashboardNotification["type"],
    metadata?: Record<string, any>
  ): NotificationAction[] {
    const actions: NotificationAction[] = [];

    switch (type) {
      case "insufficient_funds":
        actions.push(
          { label: "Add Funds", action: "add_funds", style: "primary" },
          {
            label: "Pause Schedule",
            action: "pause_schedule",
            style: "secondary",
          },
          {
            label: "View Schedule",
            action: "view_schedule",
            style: "secondary",
          }
        );
        break;
      case "payment_failure":
        actions.push(
          { label: "Retry Payment", action: "retry_payment", style: "primary" },
          {
            label: "View Schedule",
            action: "view_schedule",
            style: "secondary",
          }
        );
        break;
      case "payment_success":
        actions.push({
          label: "View Schedule",
          action: "view_schedule",
          style: "secondary",
        });
        break;
    }

    actions.push({ label: "Dismiss", action: "dismiss", style: "secondary" });
    return actions;
  }

  private async showToastForNewNotification(
    notification: DashboardNotification
  ): Promise<void> {
    // This would integrate with the existing toast service
    // For now, it's a placeholder for the integration point
    try {
      const { showToast } = await import("./toastService");

      const icon = this.getNotificationIcon(notification.type);

      showToast.info(notification.title, {
        title: `${icon} New Notification`,
        duration: 5000,
        action: {
          label: "View",
          onClick: () => {
            // Navigate to notifications tab
            window.dispatchEvent(
              new CustomEvent("navigate-to-notifications", {
                detail: { notificationId: notification.id },
              })
            );
          },
        },
      });
    } catch (error) {
      console.error("Failed to show toast for new notification:", error);
    }
  }

  private getNotificationIcon(type: DashboardNotification["type"]): string {
    switch (type) {
      case "payment_success":
        return "✅";
      case "payment_failure":
        return "❌";
      case "insufficient_funds":
        return "⚠️";
      case "system_alert":
        return "🔔";
      default:
        return "💬";
    }
  }

  private async handleRetryPayment(
    notification: DashboardNotification,
    data?: Record<string, any>
  ): Promise<void> {
    // Implementation would integrate with payment retry system
    console.log("Retry payment for notification:", notification.id, data);
  }

  private async handleAddFunds(
    notification: DashboardNotification,
    data?: Record<string, any>
  ): Promise<void> {
    // Implementation would navigate to add funds interface
    console.log("Add funds for notification:", notification.id, data);
  }

  private async handlePauseSchedule(
    notification: DashboardNotification,
    data?: Record<string, any>
  ): Promise<void> {
    // Implementation would pause the payment schedule
    console.log("Pause schedule for notification:", notification.id, data);
  }

  private async handleViewSchedule(
    notification: DashboardNotification,
    data?: Record<string, any>
  ): Promise<void> {
    // Implementation would navigate to schedule view
    console.log("View schedule for notification:", notification.id, data);
  }
}
