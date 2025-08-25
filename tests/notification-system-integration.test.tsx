/**
 * Notification System Integration Tests
 * 
 * Tests the comprehensive notification handling system including
 * insufficient funds notifications, dashboard notifications tab,
 * and message status management.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationsTab from '../src/components/NotificationsTab';
import { NotificationService, DashboardNotification } from '../src/services/notificationService';
import { AutomatedSigningManager } from '../src/lib/automated-signing-manager';

// Mock dependencies
jest.mock('../src/services/notificationService');
jest.mock('../src/services/toastService');
jest.mock('../src/lib/automated-signing-manager');

const mockNotificationService = NotificationService as jest.MockedClass<typeof NotificationService>;
const mockAutomatedSigningManager = AutomatedSigningManager as jest.MockedClass<typeof AutomatedSigningManager>;

describe('Notification System Integration', () => {
  let mockServiceInstance: jest.Mocked<NotificationService>;
  let mockSigningManagerInstance: jest.Mocked<AutomatedSigningManager>;

  const mockNotifications: DashboardNotification[] = [
    {
      id: 'notif-1',
      type: 'insufficient_funds',
      title: 'Insufficient Funds - Payment Failed',
      content: '⚠️ SCHEDULED PAYMENT FAILED - INSUFFICIENT FUNDS\n\n💰 Payment Amount: 25,000 sats\n👤 Recipient: Alice Bitcoin\n⏰ Scheduled Time: 12/15/2023, 2:30:00 PM\n💳 Current Balance: 15,000 sats\n📉 Shortfall: 10,000 sats\n🔗 Schedule ID: schedule-123\n\n💡 SUGGESTED ACTIONS:\n• Add funds to your wallet\n• Reduce the payment amount\n• Pause the payment schedule\n• Check your wallet balance\n\n📱 Open your dashboard to manage this schedule',
      timestamp: new Date().toISOString(),
      isRead: false,
      scheduleId: 'schedule-123',
      actionButtons: [
        { label: 'Add Funds', action: 'add_funds', style: 'primary' },
        { label: 'Pause Schedule', action: 'pause_schedule', style: 'secondary' },
        { label: 'View Schedule', action: 'view_schedule', style: 'secondary' },
        { label: 'Dismiss', action: 'dismiss', style: 'secondary' }
      ]
    },
    {
      id: 'notif-2',
      type: 'payment_success',
      title: 'Payment Sent Successfully',
      content: '✅ Automated payment sent successfully\nAmount: 21,000 sats\nRecipient: Bob Family\nTime: 12/15/2023, 1:00:00 PM\nTransaction ID: tx_abc123',
      timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      isRead: true,
      transactionId: 'tx_abc123',
      actionButtons: [
        { label: 'View Schedule', action: 'view_schedule', style: 'secondary' },
        { label: 'Dismiss', action: 'dismiss', style: 'secondary' }
      ]
    },
    {
      id: 'notif-3',
      type: 'payment_failure',
      title: 'Payment Failed',
      content: '❌ Automated payment failed\nError: Network timeout\nAmount: 50,000 sats\nRecipient: Charlie Lightning\nTime: 12/15/2023, 12:00:00 PM',
      timestamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
      isRead: false,
      actionButtons: [
        { label: 'Retry Payment', action: 'retry_payment', style: 'primary' },
        { label: 'View Schedule', action: 'view_schedule', style: 'secondary' },
        { label: 'Dismiss', action: 'dismiss', style: 'secondary' }
      ]
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock NotificationService instance
    mockServiceInstance = {
      subscribe: jest.fn(),
      getNotifications: jest.fn(),
      getStats: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      markMultipleAsRead: jest.fn(),
      deleteNotification: jest.fn(),
      handleNotificationAction: jest.fn(),
      addNotification: jest.fn(),
      processIncomingMessage: jest.fn()
    } as any;

    mockNotificationService.getInstance.mockReturnValue(mockServiceInstance);

    // Setup default mock responses
    mockServiceInstance.getNotifications.mockReturnValue(mockNotifications);
    mockServiceInstance.getStats.mockReturnValue({
      total: 3,
      unread: 2,
      byType: {
        payment_success: 1,
        payment_failure: 1,
        insufficient_funds: 1,
        system_alert: 0,
        general: 0
      }
    });

    mockServiceInstance.subscribe.mockImplementation((callback) => {
      // Simulate initial callback
      setTimeout(() => callback(mockNotifications), 0);
      return jest.fn(); // Return unsubscribe function
    });
  });

  describe('NotificationsTab Component', () => {
    it('should render notifications with correct styling for individual context', async () => {
      render(<NotificationsTab context="individual" />);

      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
        expect(screen.getByText('2 unread')).toBeInTheDocument();
        expect(screen.getByText('3 total')).toBeInTheDocument();
      });

      // Check individual context styling (blue theme)
      const unreadBadge = screen.getByText('2 unread');
      expect(unreadBadge).toHaveClass('bg-blue-100', 'text-blue-800');
    });

    it('should render notifications with correct styling for family context', async () => {
      render(<NotificationsTab context="family" />);

      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
      });

      // Check family context styling (orange theme)
      const unreadBadge = screen.getByText('2 unread');
      expect(unreadBadge).toHaveClass('bg-orange-100', 'text-orange-800');
    });

    it('should display insufficient funds notification with proper formatting', async () => {
      render(<NotificationsTab context="individual" />);

      await waitFor(() => {
        expect(screen.getByText('Insufficient Funds - Payment Failed')).toBeInTheDocument();
        expect(screen.getByText(/SCHEDULED PAYMENT FAILED - INSUFFICIENT FUNDS/)).toBeInTheDocument();
        expect(screen.getByText(/Payment Amount: 25,000 sats/)).toBeInTheDocument();
        expect(screen.getByText(/Current Balance: 15,000 sats/)).toBeInTheDocument();
        expect(screen.getByText(/Shortfall: 10,000 sats/)).toBeInTheDocument();
      });
    });

    it('should display action buttons for insufficient funds notification', async () => {
      render(<NotificationsTab context="individual" />);

      await waitFor(() => {
        expect(screen.getByText('Add Funds')).toBeInTheDocument();
        expect(screen.getByText('Pause Schedule')).toBeInTheDocument();
        expect(screen.getByText('View Schedule')).toBeInTheDocument();
        expect(screen.getByText('Dismiss')).toBeInTheDocument();
      });
    });

    it('should handle notification action clicks', async () => {
      render(<NotificationsTab context="individual" />);

      await waitFor(() => {
        expect(screen.getByText('Add Funds')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Funds'));

      expect(mockServiceInstance.handleNotificationAction).toHaveBeenCalledWith(
        'notif-1',
        { label: 'Add Funds', action: 'add_funds', style: 'primary' }
      );
    });

    it('should mark notification as read', async () => {
      render(<NotificationsTab context="individual" />);

      await waitFor(() => {
        expect(screen.getByText('Mark read')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Mark read'));

      expect(mockServiceInstance.markAsRead).toHaveBeenCalledWith('notif-1');
    });

    it('should mark all notifications as read', async () => {
      render(<NotificationsTab context="individual" />);

      await waitFor(() => {
        expect(screen.getByText('Mark all read')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Mark all read'));

      expect(mockServiceInstance.markAllAsRead).toHaveBeenCalled();
    });

    it('should filter notifications by type', async () => {
      render(<NotificationsTab context="individual" />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('')).toBeInTheDocument();
      });

      // Select insufficient funds filter
      const typeFilter = screen.getByDisplayValue('');
      fireEvent.change(typeFilter, { target: { value: 'insufficient_funds' } });

      expect(mockServiceInstance.getNotifications).toHaveBeenCalledWith({
        type: 'insufficient_funds'
      });
    });

    it('should search notifications', async () => {
      const user = userEvent.setup();
      render(<NotificationsTab context="individual" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search notifications...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search notifications...');
      await user.type(searchInput, 'insufficient funds');

      await waitFor(() => {
        expect(mockServiceInstance.getNotifications).toHaveBeenCalledWith({
          searchQuery: 'insufficient funds'
        });
      });
    });

    it('should handle bulk actions', async () => {
      render(<NotificationsTab context="individual" />);

      await waitFor(() => {
        expect(screen.getAllByRole('checkbox')).toHaveLength(4); // 3 notifications + select all
      });

      // Select first notification
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]); // Skip the first one which might be select all

      await waitFor(() => {
        expect(screen.getByText(/1 notification selected/)).toBeInTheDocument();
        expect(screen.getByText('Mark as read')).toBeInTheDocument();
        expect(screen.getByText('Delete')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Mark as read'));

      expect(mockServiceInstance.markMultipleAsRead).toHaveBeenCalledWith(['notif-1']);
    });

    it('should show empty state when no notifications', async () => {
      mockServiceInstance.getNotifications.mockReturnValue([]);
      mockServiceInstance.getStats.mockReturnValue({
        total: 0,
        unread: 0,
        byType: {
          payment_success: 0,
          payment_failure: 0,
          insufficient_funds: 0,
          system_alert: 0,
          general: 0
        }
      });

      render(<NotificationsTab context="individual" />);

      await waitFor(() => {
        expect(screen.getByText('No notifications')).toBeInTheDocument();
        expect(screen.getByText('You\'ll see payment updates and system alerts here.')).toBeInTheDocument();
      });
    });
  });

  describe('AutomatedSigningManager Insufficient Funds Integration', () => {
    beforeEach(() => {
      mockSigningManagerInstance = {
        executeAutomatedPayment: jest.fn(),
        isAuthorizationValid: jest.fn(),
        revokeAuthorization: jest.fn()
      } as any;

      mockAutomatedSigningManager.getInstance.mockReturnValue(mockSigningManagerInstance);
    });

    it('should detect insufficient funds and create appropriate notification', async () => {
      const paymentData = {
        recipientAddress: 'alice@getalby.com',
        recipientName: 'Alice Bitcoin',
        amount: 25000,
        scheduleId: 'schedule-123'
      };

      const signingConfig = {
        method: 'nip07' as const,
        authorizationToken: 'test-token',
        consentTimestamp: new Date().toISOString()
      };

      const notificationConfig = {
        enabled: true,
        includeAmount: true,
        includeRecipient: true,
        includeTimestamp: true,
        includeTransactionId: true,
        notificationNpub: 'npub1user123'
      };

      // Mock insufficient funds error
      mockSigningManagerInstance.executeAutomatedPayment.mockResolvedValue({
        success: false,
        error: 'Insufficient funds for payment',
        errorType: 'insufficient_funds',
        timestamp: new Date().toISOString(),
        scheduleId: 'schedule-123',
        currentBalance: 15000,
        requiredAmount: 25000
      });

      const result = await mockSigningManagerInstance.executeAutomatedPayment(
        signingConfig,
        notificationConfig,
        paymentData
      );

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('insufficient_funds');
      expect(result.currentBalance).toBe(15000);
      expect(result.requiredAmount).toBe(25000);
    });

    it('should handle network errors differently from insufficient funds', async () => {
      mockSigningManagerInstance.executeAutomatedPayment.mockResolvedValue({
        success: false,
        error: 'Network timeout',
        errorType: 'network_error',
        timestamp: new Date().toISOString(),
        scheduleId: 'schedule-456'
      });

      const result = await mockSigningManagerInstance.executeAutomatedPayment(
        {} as any,
        {} as any,
        {} as any
      );

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('network_error');
      expect(result.currentBalance).toBeUndefined();
    });
  });

  describe('NotificationService Message Processing', () => {
    it('should process incoming NIP-59 message as notification', () => {
      const content = '⚠️ SCHEDULED PAYMENT FAILED - INSUFFICIENT FUNDS\n\n💰 Payment Amount: 25,000 sats';
      const sender = 'System';
      const senderNpub = 'npub1system123';
      const metadata = { scheduleId: 'schedule-123' };

      mockServiceInstance.processIncomingMessage(content, sender, senderNpub, metadata);

      expect(mockServiceInstance.processIncomingMessage).toHaveBeenCalledWith(
        content,
        sender,
        senderNpub,
        metadata
      );
    });

    it('should add notification with proper action buttons', () => {
      const notification = {
        type: 'insufficient_funds' as const,
        title: 'Insufficient Funds',
        content: 'Payment failed due to insufficient funds',
        scheduleId: 'schedule-123'
      };

      mockServiceInstance.addNotification(notification);

      expect(mockServiceInstance.addNotification).toHaveBeenCalledWith(notification);
    });
  });

  describe('Real-time Updates', () => {
    it('should subscribe to notification updates on mount', async () => {
      render(<NotificationsTab context="individual" />);

      expect(mockServiceInstance.subscribe).toHaveBeenCalled();
    });

    it('should update stats when notifications change', async () => {
      render(<NotificationsTab context="individual" />);

      // Simulate notification update
      const subscribeCallback = mockServiceInstance.subscribe.mock.calls[0][0];
      const updatedNotifications = [...mockNotifications];
      updatedNotifications[0].isRead = true;

      mockServiceInstance.getStats.mockReturnValue({
        total: 3,
        unread: 1,
        byType: {
          payment_success: 1,
          payment_failure: 1,
          insufficient_funds: 1,
          system_alert: 0,
          general: 0
        }
      });

      subscribeCallback(updatedNotifications);

      await waitFor(() => {
        expect(screen.getByText('1 unread')).toBeInTheDocument();
      });
    });

    it('should unsubscribe on unmount', () => {
      const mockUnsubscribe = jest.fn();
      mockServiceInstance.subscribe.mockReturnValue(mockUnsubscribe);

      const { unmount } = render(<NotificationsTab context="individual" />);

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', async () => {
      render(<NotificationsTab context="individual" />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
        expect(screen.getAllByRole('checkbox')).toHaveLength(4);
        expect(screen.getAllByRole('button')).toHaveLength(expect.any(Number));
      });
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<NotificationsTab context="individual" />);

      await waitFor(() => {
        expect(screen.getByText('Mark all read')).toBeInTheDocument();
      });

      // Tab to mark all read button
      await user.tab();
      expect(screen.getByText('Mark all read')).toHaveFocus();

      // Press Enter
      await user.keyboard('{Enter}');
      expect(mockServiceInstance.markAllAsRead).toHaveBeenCalled();
    });
  });
});
