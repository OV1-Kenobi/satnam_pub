# Comprehensive Notification System Implementation Guide

## Overview

The notification system provides comprehensive handling for scheduled payment failures, dashboard message management, and real-time user notifications. This implementation includes insufficient funds notifications, dashboard notifications tabs, message status management, and seamless integration with the existing NIP-59 gift-wrapped messaging system.

## Architecture

### **Core Components**

1. **AutomatedSigningManager** - Enhanced with insufficient funds detection and notification
2. **NotificationService** - Centralized notification management and persistence
3. **NotificationsTab** - Dashboard UI component for both individual and family contexts
4. **Dashboard Integration** - Seamless integration with existing dashboard components

## Insufficient Funds Notification System

### **✅ Enhanced AutomatedSigningManager**

#### **Error Type Detection**
```typescript
private determineErrorType(error: any): PaymentExecutionResult['errorType'] {
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  
  if (errorMessage.includes('insufficient') || errorMessage.includes('balance') || errorMessage.includes('funds')) {
    return 'insufficient_funds';
  }
  
  if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('timeout')) {
    return 'network_error';
  }
  
  // ... other error types
  
  return 'unknown';
}
```

#### **Balance Context Integration**
```typescript
private async getBalanceInfo(requiredAmount: number): Promise<{
  currentBalance?: number;
  requiredAmount: number;
}> {
  try {
    const currentBalance = await this.getCurrentWalletBalance();
    return { currentBalance, requiredAmount };
  } catch (error) {
    return { requiredAmount };
  }
}
```

#### **Insufficient Funds Notification Content**
```typescript
private buildInsufficientFundsNotificationContent(
  config: AutomatedNotificationConfig,
  paymentData: any,
  result: PaymentExecutionResult
): string {
  const parts: string[] = [];

  // Header with clear indication
  parts.push('⚠️ SCHEDULED PAYMENT FAILED - INSUFFICIENT FUNDS');
  parts.push('');

  // Payment details
  if (config.includeAmount) {
    parts.push(`💰 Payment Amount: ${paymentData.amount.toLocaleString()} sats`);
  }

  if (config.includeRecipient) {
    parts.push(`👤 Recipient: ${paymentData.recipientName}`);
  }

  // Balance information
  if (result.currentBalance !== undefined) {
    parts.push(`💳 Current Balance: ${result.currentBalance.toLocaleString()} sats`);
    const shortfall = (result.requiredAmount || paymentData.amount) - result.currentBalance;
    parts.push(`📉 Shortfall: ${shortfall.toLocaleString()} sats`);
  }

  // Suggested actions
  parts.push('');
  parts.push('💡 SUGGESTED ACTIONS:');
  parts.push('• Add funds to your wallet');
  parts.push('• Reduce the payment amount');
  parts.push('• Pause the payment schedule');
  parts.push('• Check your wallet balance');

  return parts.join('\n');
}
```

### **✅ NIP-59 Gift-Wrapped Integration**

#### **Automated Notification Delivery**
```typescript
private async sendInsufficientFundsNotification(
  notificationConfig: AutomatedNotificationConfig,
  paymentData: any,
  result: PaymentExecutionResult
): Promise<void> {
  try {
    const notificationContent = this.buildInsufficientFundsNotificationContent(
      notificationConfig,
      paymentData,
      result
    );

    await this.centralEventPublisher.sendGiftWrappedMessage(
      notificationConfig.notificationNpub,
      notificationContent,
      "⚠️ Insufficient Funds - Payment Failed"
    );
  } catch (error) {
    console.error("Failed to send insufficient funds notification:", error);
  }
}
```

## Dashboard Notifications Tab Implementation

### **✅ NotificationsTab Component**

#### **Context-Aware Styling**
```typescript
interface NotificationsTabProps {
  context: 'individual' | 'family';
  className?: string;
}

// Individual context (blue theme)
className={`${context === 'individual' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}

// Family context (orange theme)
className={`${context === 'individual' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'} text-white`}
```

#### **Real-Time Updates**
```typescript
useEffect(() => {
  // Subscribe to notification updates
  const unsubscribe = notificationService.subscribe((updatedNotifications) => {
    setNotifications(updatedNotifications);
    setStats(notificationService.getStats());
  });

  // Initial load
  loadNotifications();

  return unsubscribe;
}, []);
```

#### **Comprehensive Filtering**
```typescript
const applyFilters = () => {
  const filter: NotificationFilter = {
    ...activeFilter,
    searchQuery: searchQuery || undefined
  };

  const filtered = notificationService.getNotifications(filter);
  setFilteredNotifications(filtered);
};

// Filter options
- Type: payment_success, payment_failure, insufficient_funds, system_alert, general
- Status: read, unread, all
- Date range: custom date filtering
- Search: text search across title, content, sender
```

#### **Action Button Integration**
```typescript
{notification.actionButtons && notification.actionButtons.length > 0 && (
  <div className="flex items-center space-x-2 mt-3">
    {notification.actionButtons.map((action, index) => (
      <button
        key={index}
        onClick={() => handleNotificationAction(notification.id, action)}
        className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
          action.style === 'primary'
            ? `${context === 'individual' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-orange-600 text-white hover:bg-orange-700'}`
            : action.style === 'danger'
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        {action.label}
      </button>
    ))}
  </div>
)}
```

### **✅ Dashboard Integration**

#### **IndividualFinancesDashboard Integration**
```typescript
// Tab navigation with notification badge
{
  key: 'notifications', 
  label: `Notifications${notificationStats.unread > 0 ? ` (${notificationStats.unread})` : ''}`, 
  color: 'blue',
  badge: notificationStats.unread > 0 ? notificationStats.unread : undefined
}

// Tab content
{activeTab === 'notifications' && <NotificationsTab context="individual" />}

// Notification service initialization
useEffect(() => {
  const notificationService = NotificationService.getInstance();
  
  const unsubscribe = notificationService.subscribe((notifications) => {
    const stats = notificationService.getStats();
    setNotificationStats({ unread: stats.unread, total: stats.total });
  });

  const stats = notificationService.getStats();
  setNotificationStats({ unread: stats.unread, total: stats.total });

  return unsubscribe;
}, []);
```

#### **FamilyFinancialsDashboard Integration**
```typescript
// Similar integration with family context
{activeTab === 'notifications' && <NotificationsTab context="family" />}
```

## Message Status Management

### **✅ NotificationService**

#### **Persistent Storage**
```typescript
export class NotificationService {
  private notifications: DashboardNotification[] = [];
  private storageKey = 'satnam_dashboard_notifications';

  private loadNotifications(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.notifications = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load notifications from storage:', error);
      this.notifications = [];
    }
  }

  private saveNotifications(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.notifications));
    } catch (error) {
      console.error('Failed to save notifications to storage:', error);
    }
  }
}
```

#### **Status Management**
```typescript
// Mark single notification as read
public markAsRead(notificationId: string): void {
  const notification = this.notifications.find(n => n.id === notificationId);
  if (notification && !notification.isRead) {
    notification.isRead = true;
    this.saveNotifications();
    this.notifyListeners();
  }
}

// Mark multiple notifications as read
public markMultipleAsRead(notificationIds: string[]): void {
  let changed = false;
  notificationIds.forEach(id => {
    const notification = this.notifications.find(n => n.id === id);
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

// Mark all notifications as read
public markAllAsRead(): void {
  let changed = false;
  this.notifications.forEach(notification => {
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
```

#### **Bulk Operations**
```typescript
// Delete old notifications
public deleteOldNotifications(daysOld: number = 30): void {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const initialLength = this.notifications.length;
  this.notifications = this.notifications.filter(n => 
    new Date(n.timestamp) > cutoffDate
  );

  if (this.notifications.length !== initialLength) {
    this.saveNotifications();
    this.notifyListeners();
  }
}

// Get notification statistics
public getStats(): NotificationStats {
  const stats: NotificationStats = {
    total: this.notifications.length,
    unread: this.notifications.filter(n => !n.isRead).length,
    byType: {
      payment_success: 0,
      payment_failure: 0,
      insufficient_funds: 0,
      system_alert: 0,
      general: 0
    }
  };

  this.notifications.forEach(notification => {
    stats.byType[notification.type]++;
  });

  return stats;
}
```

### **✅ Action Handling System**

#### **Notification Actions**
```typescript
export interface NotificationAction {
  label: string;
  action: 'retry_payment' | 'add_funds' | 'pause_schedule' | 'view_schedule' | 'dismiss' | 'custom';
  data?: Record<string, any>;
  style?: 'primary' | 'secondary' | 'danger';
}

// Action handling
public async handleNotificationAction(
  notificationId: string,
  action: NotificationAction
): Promise<void> {
  const notification = this.notifications.find(n => n.id === notificationId);
  if (!notification) return;

  switch (action.action) {
    case 'retry_payment':
      await this.handleRetryPayment(notification, action.data);
      break;
    case 'add_funds':
      await this.handleAddFunds(notification, action.data);
      break;
    case 'pause_schedule':
      await this.handlePauseSchedule(notification, action.data);
      break;
    case 'view_schedule':
      await this.handleViewSchedule(notification, action.data);
      break;
    case 'dismiss':
      this.markAsRead(notificationId);
      break;
  }
}
```

#### **Context-Aware Action Buttons**
```typescript
private createActionButtons(
  type: DashboardNotification['type'],
  metadata?: Record<string, any>
): NotificationAction[] {
  const actions: NotificationAction[] = [];

  switch (type) {
    case 'insufficient_funds':
      actions.push(
        { label: 'Add Funds', action: 'add_funds', style: 'primary' },
        { label: 'Pause Schedule', action: 'pause_schedule', style: 'secondary' },
        { label: 'View Schedule', action: 'view_schedule', style: 'secondary' }
      );
      break;
    case 'payment_failure':
      actions.push(
        { label: 'Retry Payment', action: 'retry_payment', style: 'primary' },
        { label: 'View Schedule', action: 'view_schedule', style: 'secondary' }
      );
      break;
    case 'payment_success':
      actions.push(
        { label: 'View Schedule', action: 'view_schedule', style: 'secondary' }
      );
      break;
  }

  actions.push({ label: 'Dismiss', action: 'dismiss', style: 'secondary' });
  return actions;
}
```

## User Experience Enhancements

### **✅ Toast Notifications for New Messages**
```typescript
private async showToastForNewNotification(notification: DashboardNotification): Promise<void> {
  try {
    const { showToast } = await import('./toastService');
    
    const icon = this.getNotificationIcon(notification.type);
    
    showToast.info(
      notification.title,
      {
        title: `${icon} New Notification`,
        duration: 5000,
        action: {
          label: 'View',
          onClick: () => {
            window.dispatchEvent(new CustomEvent('navigate-to-notifications', {
              detail: { notificationId: notification.id }
            }));
          }
        }
      }
    );
  } catch (error) {
    console.error('Failed to show toast for new notification:', error);
  }
}
```

### **✅ Visual Indicators**
```typescript
const getNotificationIcon = (type: DashboardNotification['type']) => {
  switch (type) {
    case 'payment_success':
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'payment_failure':
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    case 'insufficient_funds':
      return <DollarSign className="w-5 h-5 text-yellow-500" />;
    case 'system_alert':
      return <Bell className="w-5 h-5 text-blue-500" />;
    default:
      return <Bell className="w-5 h-5 text-gray-500" />;
  }
};
```

### **✅ Accessibility Features**
- **ARIA Labels**: Proper labeling for screen readers
- **Keyboard Navigation**: Full keyboard support
- **Focus Management**: Proper focus handling
- **Color Contrast**: Accessible color schemes
- **Screen Reader Support**: Descriptive text for all elements

## Integration Requirements

### **✅ NIP-59 Message Integration**
```typescript
// Process incoming NIP-59 message as notification
public processIncomingMessage(
  content: string,
  sender?: string,
  senderNpub?: string,
  metadata?: Record<string, any>
): void {
  const type = this.determineNotificationType(content);
  const title = this.extractTitleFromContent(content, type);
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
    metadata
  });
}
```

### **✅ Real-Time Updates**
```typescript
// Subscribe to notification updates
public subscribe(listener: (notifications: DashboardNotification[]) => void): () => void {
  this.listeners.add(listener);
  
  return () => {
    this.listeners.delete(listener);
  };
}

// Notify all listeners of changes
private notifyListeners(): void {
  this.listeners.forEach(listener => {
    try {
      listener([...this.notifications]);
    } catch (error) {
      console.error('Error notifying notification listener:', error);
    }
  });
}
```

## Testing Implementation

### **✅ Comprehensive Test Coverage**

#### **Component Tests**
- NotificationsTab rendering and interaction
- Context-aware styling verification
- Filter and search functionality
- Bulk action handling
- Real-time update handling

#### **Service Tests**
- NotificationService CRUD operations
- Message processing and type detection
- Action button creation and handling
- Statistics calculation
- Persistence and loading

#### **Integration Tests**
- AutomatedSigningManager error detection
- Insufficient funds notification flow
- Dashboard integration
- NIP-59 message processing

## Deployment Checklist

### **✅ Core Features**
- ✅ Insufficient funds notification system
- ✅ Dashboard notifications tab (individual & family)
- ✅ Message status management
- ✅ Real-time updates
- ✅ NIP-59 integration
- ✅ Action button system
- ✅ Bulk operations
- ✅ Search and filtering
- ✅ Toast notifications
- ✅ Accessibility features

### **✅ Integration Points**
- ✅ AutomatedSigningManager enhancement
- ✅ IndividualFinancesDashboard integration
- ✅ FamilyFinancialsDashboard integration
- ✅ NotificationService singleton
- ✅ LocalStorage persistence
- ✅ Context-aware theming

### **✅ User Experience**
- ✅ Professional UI design
- ✅ Loading states and error handling
- ✅ Keyboard navigation support
- ✅ Screen reader compatibility
- ✅ Mobile-responsive design
- ✅ Consistent styling patterns

The comprehensive notification system provides a complete solution for handling scheduled payment failures, managing dashboard notifications, and delivering real-time user feedback through an intuitive, accessible interface that seamlessly integrates with the existing Satnam platform infrastructure.
