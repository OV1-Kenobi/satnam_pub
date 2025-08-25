/**
 * Notifications Tab Component
 * 
 * Displays dashboard notifications with filtering, search, and action handling.
 * Used in both FamilyFinancialsDashboard and IndividualFinancesDashboard.
 */

import {
  AlertCircle,
  Bell,
  CheckCircle,
  DollarSign,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { DashboardNotification, NotificationFilter, NotificationService, NotificationStats } from '../services/notificationService';

interface NotificationsTabProps {
  context: 'individual' | 'family';
  className?: string;
}

const NotificationsTab: React.FC<NotificationsTabProps> = ({ context, className = '' }) => {
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [filteredNotifications, setFilteredNotifications] = useState<DashboardNotification[]>([]);
  const [stats, setStats] = useState<NotificationStats>({
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
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>({});
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());

  const notificationService = NotificationService.getInstance();

  useEffect(() => {
    // Subscribe to notification updates
    const unsubscribe = notificationService.subscribe((updatedNotifications) => {
      setNotifications(updatedNotifications);
      setStats(notificationService.getStats());
    });

    // Initial load
    loadNotifications();

    return unsubscribe;
  }, [notificationService]);

  useEffect(() => {
    // Apply filters when notifications or filters change
    const filter: NotificationFilter = {
      ...activeFilter,
      searchQuery: searchQuery || undefined
    };

    const filtered = notificationService.getNotifications(filter);
    setFilteredNotifications(filtered);
  }, [notifications, searchQuery, activeFilter, notificationService]);

  const loadNotifications = () => {
    setLoading(true);
    try {
      const allNotifications = notificationService.getNotifications();
      setNotifications(allNotifications);
      setStats(notificationService.getStats());
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = (notificationId: string) => {
    notificationService.markAsRead(notificationId);
  };

  const handleMarkAllAsRead = () => {
    notificationService.markAllAsRead();
  };

  const handleDeleteNotification = (notificationId: string) => {
    notificationService.deleteNotification(notificationId);
  };

  const handleBulkAction = (action: 'read' | 'delete') => {
    const selectedIds = Array.from(selectedNotifications);

    if (action === 'read') {
      notificationService.markMultipleAsRead(selectedIds);
    } else if (action === 'delete') {
      selectedIds.forEach(id => notificationService.deleteNotification(id));
    }

    setSelectedNotifications(new Set());
  };

  const handleNotificationAction = async (notificationId: string, action: any) => {
    try {
      await notificationService.handleNotificationAction(notificationId, action);
    } catch (error) {
      console.error('Failed to handle notification action:', error);
    }
  };

  const toggleNotificationSelection = (notificationId: string) => {
    const newSelection = new Set(selectedNotifications);
    if (newSelection.has(notificationId)) {
      newSelection.delete(notificationId);
    } else {
      newSelection.add(notificationId);
    }
    setSelectedNotifications(newSelection);
  };

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

  const getNotificationTypeLabel = (type: DashboardNotification['type']) => {
    switch (type) {
      case 'payment_success':
        return 'Payment Success';
      case 'payment_failure':
        return 'Payment Failed';
      case 'insufficient_funds':
        return 'Insufficient Funds';
      case 'system_alert':
        return 'System Alert';
      default:
        return 'General';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${Math.floor(diffHours)}h ago`;
    } else if (diffDays < 7) {
      return `${Math.floor(diffDays)}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <RefreshCw className="w-6 h-6 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-600">Loading notifications...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${stats.unread > 0
              ? `${context === 'individual' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`
              : 'bg-gray-100 text-gray-600'
              }`}>
              {stats.unread} unread
            </span>
            <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
              {stats.total} total
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleMarkAllAsRead}
            disabled={stats.unread === 0}
            className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${stats.unread > 0
              ? `${context === 'individual' ? 'text-blue-600 hover:bg-blue-50' : 'text-orange-600 hover:bg-orange-50'}`
              : 'text-gray-400 cursor-not-allowed'
              }`}
          >
            Mark all read
          </button>
          <button
            onClick={loadNotifications}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search notifications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={activeFilter.type || ''}
            onChange={(e) => setActiveFilter({ ...activeFilter, type: e.target.value as DashboardNotification['type'] || undefined })}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All types</option>
            <option value="payment_success">Payment Success</option>
            <option value="payment_failure">Payment Failed</option>
            <option value="insufficient_funds">Insufficient Funds</option>
            <option value="system_alert">System Alerts</option>
            <option value="general">General</option>
          </select>

          <select
            value={activeFilter.isRead === undefined ? '' : activeFilter.isRead.toString()}
            onChange={(e) => setActiveFilter({
              ...activeFilter,
              isRead: e.target.value === '' ? undefined : e.target.value === 'true'
            })}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All status</option>
            <option value="false">Unread</option>
            <option value="true">Read</option>
          </select>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedNotifications.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="text-sm text-gray-600">
            {selectedNotifications.size} notification{selectedNotifications.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleBulkAction('read')}
              className="px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Mark as read
            </button>
            <button
              onClick={() => handleBulkAction('delete')}
              className="px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Notifications list */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No notifications</h3>
            <p className="text-gray-500">
              {searchQuery || activeFilter.type || activeFilter.isRead !== undefined
                ? 'No notifications match your current filters.'
                : 'You\'ll see payment updates and system alerts here.'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-4 border rounded-lg transition-colors ${notification.isRead
                ? 'bg-white border-gray-200'
                : `${context === 'individual' ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`
                }`}
            >
              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  checked={selectedNotifications.has(notification.id)}
                  onChange={() => toggleNotificationSelection(notification.id)}
                  className="mt-1"
                />

                <div className="flex-shrink-0 mt-1">
                  {getNotificationIcon(notification.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className={`text-sm font-medium ${notification.isRead ? 'text-gray-900' : 'text-gray-900 font-semibold'
                        }`}>
                        {notification.title}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {getNotificationTypeLabel(notification.type)} • {formatTimestamp(notification.timestamp)}
                        {notification.sender && ` • from ${notification.sender}`}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      {!notification.isRead && (
                        <button
                          onClick={() => handleMarkAsRead(notification.id)}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          Mark read
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteNotification(notification.id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2">
                    <p className="text-sm text-gray-700 whitespace-pre-line">
                      {notification.content}
                    </p>
                  </div>

                  {/* Action buttons */}
                  {notification.actionButtons && notification.actionButtons.length > 0 && (
                    <div className="flex items-center space-x-2 mt-3">
                      {notification.actionButtons.map((action, index) => (
                        <button
                          key={index}
                          onClick={() => handleNotificationAction(notification.id, action)}
                          className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${action.style === 'primary'
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
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationsTab;
