import { AlertCircle, CheckCircle, Clock, DollarSign, Zap } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import PaymentAutomationService, { PaymentNotification, PaymentSchedule } from '../../lib/payment-automation.js';

const PaymentAutomationTest: React.FC = () => {
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);
  const [notifications, setNotifications] = useState<PaymentNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [testFamilyId] = useState('test-family-123');

  useEffect(() => {
    // Subscribe to notifications
    const subscriptionId = PaymentAutomationService.subscribeToNotifications((notification: PaymentNotification) => {
      setNotifications(prev => [notification, ...prev]);
    });

    // Load existing schedules
    loadSchedules();

    return () => {
      PaymentAutomationService.unsubscribeFromNotifications(subscriptionId);
    };
  }, []);

  const loadSchedules = async () => {
    try {
      const data = await PaymentAutomationService.getPaymentSchedules(testFamilyId);
      setSchedules(data);
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  };

  const createTestSchedule = async () => {
    setIsLoading(true);
    try {
      const testSchedule: any = {
        familyId: testFamilyId,
        recipientId: 'test-recipient-1',
        recipientNpub: 'npub1test123456789abcdefghijklmnopqrstuvwxyz',
        amount: 50000, // 50k sats
        currency: 'sats',
        frequency: 'weekly',
        startDate: new Date().toISOString(),
        nextPaymentDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
        status: 'active',
        requiresApproval: true,
        approvalThreshold: 100000, // 100k sats
        createdBy: 'test-user',
        metadata: {
          description: 'Test weekly allowance',
          category: 'allowance',
          tags: ['test', 'weekly']
        }
      };

      const newSchedule = await PaymentAutomationService.createPaymentSchedule(testSchedule);
      setSchedules(prev => [...prev, newSchedule]);

      console.log('✅ Test payment schedule created:', newSchedule);
    } catch (error) {
      console.error('❌ Error creating test schedule:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadNotifications = async () => {
    try {
      const data = await PaymentAutomationService.getNotifications('npub1test123456789abcdefghijklmnopqrstuvwxyz');
      setNotifications(data);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'paused':
        return <Clock className="h-4 w-4 text-yellow-400" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-blue-400" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'payment_sent':
        return <DollarSign className="h-4 w-4 text-green-400" />;
      case 'payment_received':
        return <DollarSign className="h-4 w-4 text-blue-400" />;
      case 'approval_required':
        return <AlertCircle className="h-4 w-4 text-yellow-400" />;
      case 'approval_granted':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'approval_rejected':
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      default:
        return <Zap className="h-4 w-4 text-purple-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full mb-4">
            <Zap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Payment Automation Test</h1>
          <p className="text-purple-200">Test the automated family treasury and payments management system</p>
        </div>

        {/* Test Controls */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Test Controls</h2>
          <div className="flex gap-4 flex-wrap">
            <button
              onClick={createTestSchedule}
              disabled={isLoading}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 disabled:opacity-50"
            >
              <Zap className="h-4 w-4" />
              {isLoading ? 'Creating...' : 'Create Test Schedule'}
            </button>
            <button
              onClick={loadSchedules}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
            >
              <Clock className="h-4 w-4" />
              Refresh Schedules
            </button>
            <button
              onClick={loadNotifications}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
            >
              <AlertCircle className="h-4 w-4" />
              Load Notifications
            </button>
          </div>
        </div>

        {/* Payment Schedules */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Payment Schedules ({schedules.length})</h3>
            {schedules.length === 0 ? (
              <div className="text-center py-8 text-purple-200">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No payment schedules found</p>
                <p className="text-sm">Create a test schedule to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                {schedules.map((schedule) => (
                  <div key={schedule.id} className="bg-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(schedule.status)}
                        <span className="text-white font-semibold">{schedule.metadata.description}</span>
                      </div>
                      <span className="text-purple-200 text-sm capitalize">{schedule.status}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-purple-300">Amount:</span>
                        <span className="text-white ml-2">{schedule.amount.toLocaleString()} {schedule.currency}</span>
                      </div>
                      <div>
                        <span className="text-purple-300">Frequency:</span>
                        <span className="text-white ml-2 capitalize">{schedule.frequency}</span>
                      </div>
                      <div>
                        <span className="text-purple-300">Next Payment:</span>
                        <span className="text-white ml-2">{new Date(schedule.nextPaymentDate).toLocaleDateString()}</span>
                      </div>
                      <div>
                        <span className="text-purple-300">Approval:</span>
                        <span className="text-white ml-2">{schedule.requiresApproval ? 'Required' : 'Auto'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Real-time Notifications ({notifications.length})</h3>
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-purple-200">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No notifications yet</p>
                <p className="text-sm">Create a schedule to see notifications</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {notifications.map((notification) => (
                  <div key={notification.id} className="bg-white/10 rounded-lg p-3">
                    <div className="flex items-start gap-3">
                      {getNotificationIcon(notification.type)}
                      <div className="flex-1">
                        <h4 className="text-white font-semibold text-sm">{notification.title}</h4>
                        <p className="text-purple-200 text-sm">{notification.message}</p>
                        {notification.amount && (
                          <p className="text-green-400 text-xs mt-1">
                            {notification.amount.toLocaleString()} {notification.currency}
                          </p>
                        )}
                        <p className="text-purple-300 text-xs mt-1">
                          {new Date(notification.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Features Overview */}
        <div className="mt-8 bg-white/5 border border-white/10 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-4">Payment Automation Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white/10 rounded-lg p-4">
              <Zap className="h-6 w-6 text-yellow-400 mb-2" />
              <h4 className="text-white font-semibold mb-2">Recurring Payments</h4>
              <p className="text-purple-200 text-sm">Schedule daily, weekly, monthly, or custom interval payments</p>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <DollarSign className="h-6 w-6 text-green-400 mb-2" />
              <h4 className="text-white font-semibold mb-2">Multi-Currency Support</h4>
              <p className="text-purple-200 text-sm">Lightning (sats), eCash, and Fedimint payments</p>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <AlertCircle className="h-6 w-6 text-blue-400 mb-2" />
              <h4 className="text-white font-semibold mb-2">Approval Workflows</h4>
              <p className="text-purple-200 text-sm">Guardian/steward/adult approval for large payments</p>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <Clock className="h-6 w-6 text-purple-400 mb-2" />
              <h4 className="text-white font-semibold mb-2">PhoenixD Integration</h4>
              <p className="text-purple-200 text-sm">Automated liquidity management and replenishment</p>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <CheckCircle className="h-6 w-6 text-green-400 mb-2" />
              <h4 className="text-white font-semibold mb-2">Real-time Notifications</h4>
              <p className="text-purple-200 text-sm">Instant updates on payments, approvals, and limits</p>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <Zap className="h-6 w-6 text-orange-400 mb-2" />
              <h4 className="text-white font-semibold mb-2">Privacy-First</h4>
              <p className="text-purple-200 text-sm">NIP-59 Gift Wrapped messaging, no external logging</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentAutomationTest; 