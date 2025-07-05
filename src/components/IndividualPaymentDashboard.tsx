import {
  Activity,
  ArrowLeft,
  BarChart3,
  CreditCard,
  DollarSign,
  Eye,
  EyeOff,
  Zap,
  RefreshCw,
  Settings,
  TrendingUp,
  Wallet
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { PaymentSchedule } from '../lib/payment-automation';
import PaymentAutomationCard from './PaymentAutomationCard.tsx';
import PaymentAutomationModal from './PaymentAutomationModal.tsx';

interface IndividualPaymentDashboardProps {
  onBack: () => void;
  userId: string;
  userProfile: {
    username: string;
    lightningAddress: string;
    nip05: string;
    npub: string;
    avatar: string;
  };
}

const IndividualPaymentDashboard: React.FC<IndividualPaymentDashboardProps> = ({
  onBack,
  userId,
  userProfile
}) => {
  // State management
  const [currentView, setCurrentView] = useState<'overview' | 'schedules' | 'history' | 'settings'>('overview');
  const [showPrivateBalances, setShowPrivateBalances] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Payment Automation state
  const [showPaymentAutomationModal, setShowPaymentAutomationModal] = useState(false);
  const [editingPaymentSchedule, setEditingPaymentSchedule] = useState<PaymentSchedule | undefined>(undefined);
  const [paymentSchedules, setPaymentSchedules] = useState<PaymentSchedule[]>([]);
  
  // Mock individual balances - in production these would come from Breez SDK and Cashu mints
  const [breezBalance] = useState(750000); // 750k sats
  const [cashuBalance] = useState(320000); // 320k sats
  const totalBalance = breezBalance + cashuBalance;

  // Mock statistics
  const [monthlySpent] = useState(850000); // 850k sats
  const [avgPaymentSize] = useState(45000); // 45k sats
  const [scheduledPayments] = useState(3);

  // Load payment schedules on mount
  useEffect(() => {
    loadPaymentSchedules();
  }, [userId]);

  const loadPaymentSchedules = async () => {
    try {
      // In production: const schedules = await paymentAutomationSystem.getPaymentSchedulesByContext('individual', userId);
      // Mock schedules for demo
      const mockSchedules: PaymentSchedule[] = [
        {
          id: 'schedule_1',
          context: 'individual',
          userId,
          recipientType: 'ln_address',
          recipientAddress: 'podcast@fountain.fm',
          recipientName: 'Fountain Podcast',
          amount: 21000,
          frequency: 'weekly',
          dayOfWeek: 1,
          enabled: true,
          paymentRouting: 'breez',
          routingPreferences: {
            maxFeePercent: 1.0,
            privacyMode: true,
            routingStrategy: 'balanced'
          },
          protocolPreferences: {
            primary: 'lightning',
            fallback: ['cashu']
          },
          paymentPurpose: 'subscription',
          memo: 'Weekly podcast boost',
          nextDistribution: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
          distributionCount: 8,
          totalDistributed: 168000,
          conditions: {
            maxDailySpend: 200000,
            maxTransactionSize: 100000,
            requireApprovalAbove: 500000,
            pauseOnSuspiciousActivity: true,
            maxLightningAmount: 1000000,
            maxCashuAmount: 500000,
            maxFedimintAmount: 0,
            minimumPrivacyScore: 80,
            requireTorRouting: false,
            avoidKYCNodes: true
          },
          autoApprovalLimit: 100000,
          // Individual context - no guardian approval needed
          preferredMethod: 'auto',
          maxRetries: 3,
          retryDelay: 30,
          notificationSettings: {
            notifyOnDistribution: true,
            notifyOnFailure: true,
            notifyOnSuspiciousActivity: true,
            notificationMethods: ['email']
          },
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date()
        },
        {
          id: 'schedule_2',
          context: 'individual',
          userId,
          recipientType: 'npub',
          recipientAddress: 'npub1sat0sh1nak0m0t0...',
          recipientName: 'Satoshi Tips',
          amount: 5000,
          frequency: 'daily',
          enabled: true,
          paymentRouting: 'cashu_mint',
          routingPreferences: {
            maxFeePercent: 0.5,
            privacyMode: true,
            routingStrategy: 'most_private'
          },
          protocolPreferences: {
            primary: 'cashu',
            fallback: ['lightning'],
            cashuMintUrl: 'https://mint.satnam.pub'
          },
          paymentPurpose: 'donation',
          memo: 'Daily developer appreciation',
          nextDistribution: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours from now
          distributionCount: 45,
          totalDistributed: 225000,
          conditions: {
            maxDailySpend: 50000,
            maxTransactionSize: 10000,
            requireApprovalAbove: 25000,
            pauseOnSuspiciousActivity: true,
            maxLightningAmount: 100000,
            maxCashuAmount: 200000,
            maxFedimintAmount: 0,
            minimumPrivacyScore: 95,
            requireTorRouting: true,
            avoidKYCNodes: true
          },
          autoApprovalLimit: 25000,
          // Individual context - no guardian approval needed
          preferredMethod: 'cashu',
          maxRetries: 2,
          retryDelay: 15,
          notificationSettings: {
            notifyOnDistribution: false,
            notifyOnFailure: true,
            notifyOnSuspiciousActivity: true,
            notificationMethods: ['nostr_dm']
          },
          createdAt: new Date('2024-02-15'),
          updatedAt: new Date()
        }
      ];
      
      setPaymentSchedules(mockSchedules);
    } catch (error) {
      console.error('Failed to load payment schedules:', error);
    }
  };

  // Payment Automation Handlers
  const handleCreatePaymentSchedule = () => {
    setEditingPaymentSchedule(undefined);
    setShowPaymentAutomationModal(true);
  };

  const handleEditPaymentSchedule = (schedule: PaymentSchedule) => {
    setEditingPaymentSchedule(schedule);
    setShowPaymentAutomationModal(true);
  };

  const handleSavePaymentSchedule = async (scheduleData: Partial<PaymentSchedule>) => {
    try {
      if (editingPaymentSchedule) {
        console.log('Updating individual payment schedule:', scheduleData);
        // In production: await paymentAutomationSystem.updatePaymentSchedule(editingPaymentSchedule.id, scheduleData);
        
        // Update local state
        setPaymentSchedules(prev => 
          prev.map(schedule => 
            schedule.id === editingPaymentSchedule.id 
              ? { ...schedule, ...scheduleData, updatedAt: new Date() }
              : schedule
          )
        );
      } else {
        console.log('Creating new individual payment schedule:', scheduleData);
        // In production: const newSchedule = await paymentAutomationSystem.createPaymentSchedule('individual', userId, undefined, scheduleData);
        
        // Mock new schedule
        const newSchedule: PaymentSchedule = {
          id: `schedule_${Date.now()}`,
          context: 'individual',
          userId,
          ...scheduleData,
          distributionCount: 0,
          totalDistributed: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        } as PaymentSchedule;
        
        setPaymentSchedules(prev => [...prev, newSchedule]);
      }
    } catch (error) {
      console.error('Failed to save individual payment schedule:', error);
    }
  };

  const handleTogglePaymentSchedule = async (scheduleId: string, enabled: boolean) => {
    try {
      console.log(`${enabled ? 'Enabling' : 'Disabling'} individual payment schedule:`, scheduleId);
      // In production: await paymentAutomationSystem.togglePaymentSchedule(scheduleId, enabled);
      
      setPaymentSchedules(prev => 
        prev.map(schedule => 
          schedule.id === scheduleId ? { ...schedule, enabled, updatedAt: new Date() } : schedule
        )
      );
    } catch (error) {
      console.error('Failed to toggle individual payment schedule:', error);
    }
  };

  const handleDeletePaymentSchedule = async (scheduleId: string) => {
    try {
      console.log('Deleting individual payment schedule:', scheduleId);
      // In production: await paymentAutomationSystem.deletePaymentSchedule(scheduleId);
      
      setPaymentSchedules(prev => prev.filter(schedule => schedule.id !== scheduleId));
    } catch (error) {
      console.error('Failed to delete individual payment schedule:', error);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    await Promise.all([
      loadPaymentSchedules(),
      new Promise(resolve => setTimeout(resolve, 1500)) // Simulate API calls
    ]);
    setRefreshing(false);
  };

  const formatSats = (sats: number): string => {
    return new Intl.NumberFormat().format(sats);
  };

  // Navigation tabs
  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'schedules', label: 'Automated Payments', icon: CreditCard },
    { id: 'history', label: 'Payment History', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const renderOverview = () => (
    <div className="space-y-8">
      {/* Balance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-blue-900">
              Breez Lightning
            </h3>
            <Zap className="h-6 w-6 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-blue-700 mb-2">
            {showPrivateBalances ? formatSats(breezBalance) : '•••••••'} sats
          </div>
          <div className="text-sm text-blue-600 mb-3">
            ⚡ Primary Lightning Node • External Payments
          </div>
          <div className="bg-blue-100 rounded-lg p-3">
            <div className="text-xs text-blue-700 font-medium">Lightning Address</div>
            <div className="text-sm text-blue-800 font-mono">{userProfile.lightningAddress}</div>
          </div>
        </div>

        <div className="bg-purple-50 rounded-xl p-6 border border-purple-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-purple-900">
              Cashu eCash
            </h3>
            <Wallet className="h-6 w-6 text-purple-500" />
          </div>
          <div className="text-3xl font-bold text-purple-700 mb-2">
            {showPrivateBalances ? formatSats(cashuBalance) : '•••••••'} sats
          </div>
          <div className="text-sm text-purple-600 mb-3">
            🔒 Maximum Privacy • Bearer Tokens
          </div>
          <div className="bg-purple-100 rounded-lg p-3">
            <div className="text-xs text-purple-700 font-medium">Active Mints</div>
            <div className="text-sm text-purple-800">2 connected • Ready</div>
          </div>
        </div>

        <div className="bg-green-50 rounded-xl p-6 border border-green-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-green-900">
              Total Balance
            </h3>
            <DollarSign className="h-6 w-6 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-green-700 mb-2">
            {showPrivateBalances ? formatSats(totalBalance) : '•••••••'} sats
          </div>
          <div className="text-sm text-green-600 mb-3">
            ≈ ${((totalBalance * 0.0005)).toFixed(2)} USD
          </div>
          <div className="bg-green-100 rounded-lg p-3">
            <div className="text-xs text-green-700 font-medium">Exchange Rate</div>
            <div className="text-sm text-green-800">1 sat = $0.0005</div>
          </div>
        </div>

        <div className="bg-orange-50 rounded-xl p-6 border border-orange-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-orange-900">
              Monthly Spent
            </h3>
            <TrendingUp className="h-6 w-6 text-orange-500" />
          </div>
          <div className="text-3xl font-bold text-orange-700 mb-2">
            {formatSats(monthlySpent)} sats
          </div>
          <div className="text-sm text-orange-600 mb-3">
            Avg: {formatSats(avgPaymentSize)} sats/payment
          </div>
          <div className="bg-orange-100 rounded-lg p-3">
            <div className="text-xs text-orange-700 font-medium">Scheduled Payments</div>
            <div className="text-sm text-orange-800">{scheduledPayments} active</div>
          </div>
        </div>
      </div>

      {/* Payment Automation Card */}
      <PaymentAutomationCard
        context="individual"
        schedules={paymentSchedules}
        onCreateSchedule={handleCreatePaymentSchedule}
        onEditSchedule={handleEditPaymentSchedule}
        onToggleSchedule={handleTogglePaymentSchedule}
        onDeleteSchedule={handleDeletePaymentSchedule}
      />

      {/* Quick Stats */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Individual Payment Stats</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {paymentSchedules.filter(s => s.enabled).length}
            </div>
            <div className="text-sm text-gray-500">Active Schedules</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {paymentSchedules.reduce((sum, s) => sum + s.distributionCount, 0)}
            </div>
            <div className="text-sm text-gray-500">Total Payments Sent</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {Math.floor(paymentSchedules.reduce((sum, s) => sum + s.totalDistributed, 0) / 1000)}k
            </div>
            <div className="text-sm text-gray-500">Sats Distributed</div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSchedules = () => (
    <div className="space-y-6">
      <PaymentAutomationCard
        context="individual"
        schedules={paymentSchedules}
        onCreateSchedule={handleCreatePaymentSchedule}
        onEditSchedule={handleEditPaymentSchedule}
        onToggleSchedule={handleTogglePaymentSchedule}
        onDeleteSchedule={handleDeletePaymentSchedule}
      />
    </div>
  );

  const renderHistory = () => (
    <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Payment History</h3>
      <div className="text-center py-8 text-gray-500">
        <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p>Payment history will appear here once payments are executed</p>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Routing Preferences</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">Privacy Mode</div>
              <div className="text-sm text-gray-500">Use enhanced privacy routing by default</div>
            </div>
            <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600">
              <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-6" />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">Avoid KYC Nodes</div>
              <div className="text-sm text-gray-500">Route around nodes requiring identity verification</div>
            </div>
            <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600">
              <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-6" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">Payment Confirmations</div>
              <div className="text-sm text-gray-500">Get notified when scheduled payments execute</div>
            </div>
            <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600">
              <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-6" />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">Failure Alerts</div>
              <div className="text-sm text-gray-500">Alert when payments fail to execute</div>
            </div>
            <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600">
              <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (currentView) {
      case 'overview':
        return renderOverview();
      case 'schedules':
        return renderSchedules();
      case 'history':
        return renderHistory();
      case 'settings':
        return renderSettings();
      default:
        return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back</span>
              </button>
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-600">
                  {userProfile.avatar}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    Individual Payment Automation
                  </h1>
                  <p className="text-gray-600">
                    @{userProfile.username} • {userProfile.nip05}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowPrivateBalances(!showPrivateBalances)}
                className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                {showPrivateBalances ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                <span>{showPrivateBalances ? 'Hide' : 'Show'} Balances</span>
              </button>
              <button
                onClick={handleRefreshAll}
                disabled={refreshing}
                className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-6">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setCurrentView(tab.id as any)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                    currentView === tab.id
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        {renderContent()}
      </div>

      {/* Payment Automation Modal */}
      <PaymentAutomationModal
        isOpen={showPaymentAutomationModal}
        onClose={() => {
          setShowPaymentAutomationModal(false);
          setEditingPaymentSchedule(undefined);
        }}
        onSave={handleSavePaymentSchedule}
        context="individual"
        userId={userId}
        existingSchedule={editingPaymentSchedule}
      />
    </div>
  );
};

export default IndividualPaymentDashboard;