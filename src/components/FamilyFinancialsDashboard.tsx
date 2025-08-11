import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle,
  Eye,
  EyeOff,
  Globe,
  QrCode,
  RefreshCw,
  Send,
  Shield,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNWCWallet } from '../hooks/useNWCWallet';
import NWCWalletSetupModal from './NWCWalletSetupModal';
import SovereigntyEducationFlow from './SovereigntyEducationFlow';

// Import our enhanced dual-protocol components
import AtomicSwapModal from './AtomicSwapModal';
import ContextualAvatar from './ContextualAvatar';
import EducationalDashboard from './education/EducationalDashboard';
import EnhancedLiquidityDashboard from './EnhancedLiquidityDashboard';
import FamilyFedimintGovernance from './FamilyFedimintGovernance';
import FamilyLightningTreasury from './FamilyLightningTreasury';
import PaymentAutomationCard from './PaymentAutomationCard';
import PaymentAutomationModal from './PaymentAutomationModal';
import { PaymentModal } from './shared';
import UnifiedFamilyPayments from './UnifiedFamilyPayments';

// Import Credits Balance
import { CreditsBalance } from './CreditsBalance';

// Import NWC Wallet Integration

// Import Payment Automation System
import { PaymentSchedule } from '../lib/payment-automation.js';

// Import Privacy-First Family Federation API
import {
  checkFamilyPermissions,
  getFamilyFederationMembers,
  getPendingSpendingApprovals
} from '../services/familyFederationApi';

// Import enhanced types

interface FamilyFinancialsDashboardProps {
  familyFederationData?: {
    id: string;
    federationName: string;
    federationDuid: string;
    domain?: string;
    relayUrl?: string;
    members?: Array<{
      id: string;
      userDuid: string;
      familyRole: 'offspring' | 'adult' | 'steward' | 'guardian';
      spendingApprovalRequired: boolean;
      votingPower: number;
    }>;
  };
  onBack: () => void;
}

interface GuardianConsensusProps {
  pendingApprovals: any[];
  onApproval: (approvalId: string, approved: boolean) => void;
}

interface UnifiedPaymentProps {
  lightningBalance: number;
  fedimintBalance: number;
  onPayment: (payment: any) => void;
  showPaymentModal: boolean;
  setShowPaymentModal: (show: boolean) => void;
}

// Guardian Consensus Panel Component
const GuardianConsensusPanel: React.FC<GuardianConsensusProps> = ({
  pendingApprovals,
  onApproval
}) => {
  return (
    <div className="bg-white rounded-xl p-6 border border-purple-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-purple-900">Guardian Consensus</h3>
        <div className="flex items-center space-x-2 text-purple-600">
          <Shield className="h-5 w-5" />
          <span className="text-sm">{pendingApprovals.length} pending</span>
        </div>
      </div>

      {pendingApprovals.length === 0 ? (
        <div className="text-center py-8 text-purple-500">
          <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No pending approvals</p>
          <p className="text-sm">All family governance is up to date</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingApprovals.map((approval) => (
            <div key={approval.id} className="bg-purple-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-purple-900">{approval.type}</span>
                <span className="text-sm text-purple-600">{approval.amount?.toLocaleString()} sats</span>
              </div>
              <p className="text-sm text-purple-700 mb-3">{approval.description}</p>
              <div className="flex space-x-2">
                <button
                  onClick={() => onApproval(approval.id, true)}
                  className="flex-1 bg-green-500 text-white px-3 py-2 rounded text-sm hover:bg-green-600 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => onApproval(approval.id, false)}
                  className="flex-1 bg-red-500 text-white px-3 py-2 rounded text-sm hover:bg-red-600 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Enhanced Unified Family Payments Component
const EnhancedUnifiedPayments: React.FC<UnifiedPaymentProps> = ({
  lightningBalance,
  fedimintBalance,
  onPayment,
  showPaymentModal,
  setShowPaymentModal
}) => {
  const [paymentType, setPaymentType] = useState<'lightning' | 'fedimint' | 'auto'>('auto');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [showAtomicSwapModal, setShowAtomicSwapModal] = useState(false);

  const handlePayment = () => {
    const payment = {
      type: paymentType,
      recipient,
      amount: parseInt(amount),
      description,
      timestamp: new Date(),
    };
    onPayment(payment);

    // Reset form
    setRecipient('');
    setAmount('');
    setDescription('');
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-green-200 shadow-sm">
      <h3 className="text-lg font-semibold text-green-900 mb-4">Smart Protocol Bridge</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recipient</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="user@domain.com or family member"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (sats)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Protocol</label>
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="auto">Auto-Select (Recommended)</option>
              <option value="lightning">Lightning Network</option>
              <option value="fedimint">Fedimint eCash</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Payment description..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="flex space-x-3 mb-4">
        <button
          onClick={() => setShowPaymentModal(true)}
          className="flex-1 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center space-x-2"
        >
          <Send className="h-4 w-4" />
          <span>Send Lightning Payment</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button className="w-full bg-orange-500 text-white px-3 py-2 rounded text-sm hover:bg-orange-600 transition-colors flex items-center justify-center space-x-2">
          <Zap className="h-4 w-4" />
          <span>Lightning → Individual</span>
        </button>
        <button
          onClick={() => setShowAtomicSwapModal(true)}
          className="w-full bg-purple-500 text-white px-3 py-2 rounded text-sm hover:bg-purple-600 transition-colors flex items-center justify-center space-x-2"
        >
          <Shield className="h-4 w-4" />
          <span>Fedimint → Individual</span>
        </button>
      </div>

      {/* Atomic Swap Modal */}
      <AtomicSwapModal
        isOpen={showAtomicSwapModal}
        onClose={() => setShowAtomicSwapModal(false)}
        fromContext="family"
        toContext="individual"
        fromMemberId="family_treasury"
        toMemberId="demo_individual_member"
        purpose="transfer"
      />
    </div>
  );
};

// Main Family Financials Dashboard Component
export const FamilyFinancialsDashboard: React.FC<FamilyFinancialsDashboardProps> = ({
  familyFederationData,
  onBack
}) => {
  // NWC Wallet Integration Hooks
  const { userRole, userDuid } = useAuth();
  const {
    connections: nwcConnections,
    primaryConnection,
    balance: nwcBalance,
    isConnected: nwcConnected
  } = useNWCWallet();

  // State management - using privacy-first federation data
  const [currentView, setCurrentView] = useState<'overview' | 'lightning' | 'fedimint' | 'payments' | 'phoenixd'>('overview');
  const [familyName] = useState(familyFederationData?.federationName || "Family Federation");
  const [familyFederationId] = useState(familyFederationData?.id);
  const [federationDuid] = useState(familyFederationData?.federationDuid);

  // Family member data state
  const [familyMembers, setFamilyMembers] = useState(familyFederationData?.members || []);
  const [userPermissions, setUserPermissions] = useState({
    canApproveSpending: false,
    votingPower: 0,
    familyRole: 'offspring' as 'offspring' | 'adult' | 'steward' | 'guardian'
  });
  const [showPrivateBalances, setShowPrivateBalances] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Payment Modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  // Education Progress state (from Bolt integration)
  const [educationProgress, setEducationProgress] = useState(73);

  // Payment Automation state
  const [showPaymentAutomationModal, setShowPaymentAutomationModal] = useState(false);
  const [editingPaymentSchedule, setEditingPaymentSchedule] = useState<PaymentSchedule | undefined>(undefined);
  const [paymentSchedules, setPaymentSchedules] = useState<PaymentSchedule[]>([]);

  // QR Modal state (from Bolt integration)
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrAddress, setQrAddress] = useState('');

  // NWC Integration Modal States
  const [showNWCSetup, setShowNWCSetup] = useState(false);
  const [showSovereigntyEducation, setShowSovereigntyEducation] = useState(false);

  // Enhanced treasury state
  const [lightningBalance, setLightningBalance] = useState(5435000);
  const [fedimintBalance, setFedimintBalance] = useState(3335000);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);

  // Load family federation data on component mount
  useEffect(() => {
    const loadFamilyData = async () => {
      if (!familyFederationId || !userDuid) return;

      try {
        setRefreshing(true);

        // Fetch family members
        const members = await getFamilyFederationMembers(familyFederationId);
        setFamilyMembers(members);

        // Check user permissions
        const permissions = await checkFamilyPermissions(familyFederationId, userDuid);
        setUserPermissions(permissions);

        // Get pending spending approvals
        const approvals = await getPendingSpendingApprovals(familyFederationId);
        setPendingApprovals(approvals);

      } catch (error) {
        console.error('Error loading family federation data:', error);
      } finally {
        setRefreshing(false);
      }
    };

    loadFamilyData();
  }, [familyFederationId, userDuid]);

  const [phoenixdStatus, setPhoenixdStatus] = useState({
    connected: true,
    automatedLiquidity: true,
    channelCount: 8,
    totalCapacity: 50000000,
    liquidityRatio: 0.72,
  });

  const [showEducationalDashboard, setShowEducationalDashboard] = useState(false);

  // Privacy-first family members data loaded from API

  // Handlers
  const handleUnifiedPayment = (payment: any) => {
    console.log('Unified payment:', payment);
    // In real implementation, this would process the payment
    // and update balances accordingly
  };

  const handleGuardianApproval = (approvalId: string, approved: boolean) => {
    console.log('Guardian approval:', { approvalId, approved });
    setPendingApprovals(prev =>
      prev.filter(approval => approval.id !== approvalId)
    );
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    // Simulate data refresh
    await new Promise(resolve => setTimeout(resolve, 2000));
    setRefreshing(false);
  };

  const formatSats = (sats: number): string => {
    return new Intl.NumberFormat().format(sats);
  };

  // QR Modal handler (from Bolt integration)
  const handleShowQR = (memberId: string, address: string) => {
    setQrAddress(address);
    setSelectedMember(memberId);
    setShowQRModal(true);
  };

  // Copy NIP-05 to clipboard
  const handleCopyNIP05 = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      // You could add a toast notification here
      console.log('NIP-05 copied to clipboard:', address);
    } catch (err) {
      console.error('Failed to copy NIP-05:', err);
    }
  };

  // Handle Zap payment from QR modal
  const handleZapPayment = () => {
    setShowQRModal(false);
    setShowPaymentModal(true);
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
        // Update existing schedule
        console.log('Updating payment schedule:', scheduleData);
        // In production: await paymentAutomationSystem.updatePaymentSchedule(editingPaymentSchedule.id, scheduleData);
      } else {
        // Create new schedule
        console.log('Creating new payment schedule:', scheduleData);
        // In production: await paymentAutomationSystem.createPaymentSchedule('family', userId, familyId, scheduleData);
      }

      // Refresh schedules list
      // In production: setPaymentSchedules(await paymentAutomationSystem.getPaymentSchedulesByContext('family', userId, familyId));

    } catch (error) {
      console.error('Failed to save payment schedule:', error);
    }
  };

  const handleTogglePaymentSchedule = async (scheduleId: string, enabled: boolean) => {
    try {
      console.log(`${enabled ? 'Enabling' : 'Disabling'} payment schedule:`, scheduleId);
      // In production: await paymentAutomationSystem.togglePaymentSchedule(scheduleId, enabled);

      // Update local state
      setPaymentSchedules(prev =>
        prev.map(schedule =>
          schedule.id === scheduleId ? { ...schedule, enabled } : schedule
        )
      );
    } catch (error) {
      console.error('Failed to toggle payment schedule:', error);
    }
  };

  const handleDeletePaymentSchedule = async (scheduleId: string) => {
    try {
      console.log('Deleting payment schedule:', scheduleId);
      // In production: await paymentAutomationSystem.deletePaymentSchedule(scheduleId);

      // Update local state
      setPaymentSchedules(prev => prev.filter(schedule => schedule.id !== scheduleId));
    } catch (error) {
      console.error('Failed to delete payment schedule:', error);
    }
  };

  const totalBalance = lightningBalance + fedimintBalance;

  // Navigation tabs
  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'lightning', label: 'Lightning', icon: Zap },
    { id: 'fedimint', label: 'Fedimint', icon: Shield },
    { id: 'payments', label: 'Payments', icon: Activity },
    { id: 'phoenixd', label: 'PhoenixD', icon: Globe },
  ];

  const renderOverview = () => (
    <div className="space-y-8">
      {/* Dual Protocol Treasury Overview with Credits */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-orange-50 rounded-xl p-6 border border-orange-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-orange-900">
              Family Lightning Treasury
            </h3>
            <Zap className="h-6 w-6 text-orange-500" />
          </div>
          <div className="text-3xl font-bold text-orange-700 mb-2">
            {showPrivateBalances ? formatSats(lightningBalance) : '•••••••'} sats
          </div>
          <div className="text-sm text-orange-600 mb-3">
            ⚡ External Payments • Nostr Zaps • PhoenixD Automated
          </div>
          <div className="bg-orange-100 rounded-lg p-3">
            <div className="text-xs text-orange-700 font-medium">Family Lightning Address</div>
            <div className="text-sm text-orange-800 font-mono">family@satnam.pub</div>
          </div>
        </div>

        <div className="bg-purple-50 rounded-xl p-6 border border-purple-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-purple-900">
              Family Fedimint eCash
            </h3>
            <Shield className="h-6 w-6 text-purple-500" />
          </div>
          <div className="text-3xl font-bold text-purple-700 mb-2">
            {showPrivateBalances ? formatSats(fedimintBalance) : '•••••••'} sats
          </div>
          <div className="text-sm text-purple-600 mb-3">
            🛡️ Guardian Protected • Internal Governance
          </div>
          <div className="bg-purple-100 rounded-lg p-3">
            <div className="text-xs text-purple-700 font-medium">Guardian Status</div>
            <div className="text-sm text-purple-800">4/5 Online • Consensus Ready</div>
          </div>
        </div>

        <div className="bg-green-50 rounded-xl p-6 border border-green-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-green-900">
              Total Family Treasury
            </h3>
            <BarChart3 className="h-6 w-6 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-green-700 mb-2">
            {showPrivateBalances ? formatSats(totalBalance) : '•••••••'} sats
          </div>
          <div className="text-sm text-green-600 mb-3">
            Combined Lightning + eCash Balance
          </div>
          <div className="space-y-2">
            <button
              onClick={() => setCurrentView('payments')}
              className="w-full bg-green-500 text-white px-3 py-2 rounded text-sm hover:bg-green-600 transition-colors flex items-center justify-center space-x-2"
            >
              <Activity className="h-4 w-4" />
              <span>Unified Payments</span>
            </button>
          </div>
        </div>

        <CreditsBalance variant="family" />
      </div>

      {/* Education Progress Card (from Bolt integration) */}
      <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-6 border border-yellow-200 shadow-sm">
        <div className="flex items-center space-x-3 mb-4">
          <BookOpen className="h-6 w-6 text-yellow-600" />
          <h3 className="text-lg font-semibold text-yellow-900">Education Progress</h3>
        </div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-yellow-700">Family Progress</span>
          <span className="text-yellow-900 font-semibold">{educationProgress}%</span>
        </div>
        <div className="bg-yellow-200 rounded-full h-3 mb-4">
          <div
            className="bg-gradient-to-r from-yellow-400 to-orange-500 h-3 rounded-full transition-all duration-300"
            style={{ width: `${educationProgress}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-yellow-600">Bitcoin education modules completed by family members</span>
          <button className="text-yellow-800 hover:text-yellow-900 font-medium">
            View Details →
          </button>
        </div>
      </div>

      {/* Enhanced Unified Family Payment Interface */}
      <EnhancedUnifiedPayments
        lightningBalance={lightningBalance}
        fedimintBalance={fedimintBalance}
        onPayment={handleUnifiedPayment}
        showPaymentModal={showPaymentModal}
        setShowPaymentModal={setShowPaymentModal}
      />

      {/* Guardian Consensus Panel */}
      <GuardianConsensusPanel
        pendingApprovals={pendingApprovals}
        onApproval={handleGuardianApproval}
      />

      {/* Protocol Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Lightning Network Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">PhoenixD Connection</span>
              <div className={`flex items-center space-x-2 ${phoenixdStatus.connected ? 'text-green-600' : 'text-red-600'
                }`}>
                <CheckCircle className="h-4 w-4" />
                <span>{phoenixdStatus.connected ? 'Connected' : 'Disconnected'}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Active Channels</span>
              <span className="font-semibold">{phoenixdStatus.channelCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Auto Liquidity</span>
              <div className={`flex items-center space-x-2 ${phoenixdStatus.automatedLiquidity ? 'text-green-600' : 'text-yellow-600'
                }`}>
                {phoenixdStatus.automatedLiquidity ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                <span>{phoenixdStatus.automatedLiquidity ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Family Members</h3>
          <div className="space-y-3">
            {familyMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <ContextualAvatar
                    member={member}
                    context="financial"
                    onFinancialClick={(memberId) => {
                      setSelectedMember(memberId);
                      setShowPaymentModal(true);
                    }}
                    size="md"
                  />
                  <div>
                    <div className="font-medium text-gray-900">{member.username}</div>
                    <div className="text-sm text-gray-500 capitalize">{member.role}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleShowQR(member.id, member.lightningAddress)}
                    className="p-1 text-gray-400 hover:text-orange-600 transition-colors"
                    title="Show Lightning Address QR Code"
                  >
                    <QrCode className="h-4 w-4" />
                  </button>
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Automation Section */}
      <PaymentAutomationCard
        context="family"
        schedules={paymentSchedules}
        onCreateSchedule={handleCreatePaymentSchedule}
        onEditSchedule={handleEditPaymentSchedule}
        onToggleSchedule={handleTogglePaymentSchedule}
        onDeleteSchedule={handleDeletePaymentSchedule}
      />
    </div>
  );

  const renderContent = () => {
    switch (currentView) {
      case 'overview':
        return renderOverview();
      case 'lightning':
        return <FamilyLightningTreasury familyId={familyId} />;
      case 'fedimint':
        return <FamilyFedimintGovernance familyId={familyId} />;
      case 'payments':
        return <UnifiedFamilyPayments familyId={familyId} familyMembers={familyMembers} />;
      case 'phoenixd':
        return <EnhancedLiquidityDashboard familyId={familyId} />;
      default:
        return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Home</span>
              </button>
              <div className="h-6 w-px bg-gray-300"></div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{familyName} Family Financials</h1>
                <p className="text-gray-600">Dual-protocol Lightning + Fedimint sovereign banking</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowPrivateBalances(!showPrivateBalances)}
                className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                {showPrivateBalances ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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

        {/* NWC Family Sovereignty Status Banner */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-6 border border-purple-200 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Shield className="h-6 w-6 text-purple-600" />
              <div>
                <h3 className="text-lg font-semibold text-purple-900">Family Sovereignty Status</h3>
                <p className="text-sm text-purple-700">Track your family's journey to financial independence</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowSovereigntyEducation(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
              >
                Learn More
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Family NWC Connection Status */}
            <div className="bg-white rounded-lg p-4 border border-purple-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">NWC Connections</span>
                <Zap className="h-4 w-4 text-purple-600" />
              </div>
              <div className="text-2xl font-bold text-purple-900">
                {nwcConnections.length}/{familyMembers.length}
              </div>
              <div className="text-xs text-gray-600">Family members connected</div>
            </div>

            {/* Sovereignty Progress */}
            <div className="bg-white rounded-lg p-4 border border-purple-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Sovereignty Level</span>
                <Activity className="h-4 w-4 text-purple-600" />
              </div>
              <div className="text-2xl font-bold text-purple-900">
                {Math.round((nwcConnections.length / familyMembers.length) * 100)}%
              </div>
              <div className="text-xs text-gray-600">Self-custodial progress</div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg p-4 border border-purple-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Quick Setup</span>
                <Globe className="h-4 w-4 text-purple-600" />
              </div>
              <button
                onClick={() => setShowNWCSetup(true)}
                className="w-full px-3 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg text-sm font-medium transition-all"
              >
                Setup NWC Wallet
              </button>
            </div>
          </div>

          {/* Family Member Sovereignty Status */}
          {nwcConnections.length > 0 && (
            <div className="mt-4 pt-4 border-t border-purple-200">
              <h4 className="text-sm font-medium text-purple-900 mb-3">Connected Members</h4>
              <div className="flex flex-wrap gap-2">
                {familyMembers.map((member) => {
                  // For demo purposes, assume some members have NWC based on role
                  const hasNWC = member.role === 'adult' || member.role === 'guardian';
                  return (
                    <div
                      key={member.id}
                      className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium ${hasNWC
                        ? 'bg-green-100 text-green-800 border border-green-200'
                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}
                    >
                      <div className="w-2 h-2 rounded-full bg-current"></div>
                      <span>{member.username}</span>
                      {hasNWC && <CheckCircle className="h-3 w-3" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${currentView === tab.id
                    ? 'bg-orange-500 text-white'
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

        {/* Quick Actions Section */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Family Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <button
              onClick={() => setCurrentView('payments')}
              className="flex items-center justify-center space-x-2 bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              <Send className="h-5 w-5" />
              <span>Send Family Payment</span>
            </button>
            <button
              onClick={() => setCurrentView('fedimint')}
              className="flex items-center justify-center space-x-2 bg-purple-500 hover:bg-purple-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              <Shield className="h-5 w-5" />
              <span>Family Governance</span>
            </button>
            <button
              onClick={() => setCurrentView('phoenixd')}
              className="flex items-center justify-center space-x-2 bg-green-500 hover:bg-green-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              <Globe className="h-5 w-5" />
              <span>Liquidity Management</span>
            </button>
            <button
              onClick={() => setShowEducationalDashboard(true)}
              className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              <Brain className="h-5 w-5" />
              <span>Cognitive Capital Accounting</span>
            </button>
          </div>
        </div>

      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        familyMembers={familyMembers}
        selectedMember={selectedMember}
        onSelectedMemberChange={setSelectedMember}
      />

      {/* Enhanced QR Code Modal with NIP-05 and Zap Integration */}
      {showQRModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full border border-gray-200 relative">
            <button
              onClick={() => setShowQRModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 transition-colors"
            >
              ✕
            </button>

            <div className="text-center">
              <div className="bg-gray-100 p-4 rounded-lg inline-block mb-4">
                <QrCode className="h-48 w-48 text-gray-700" />
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-2">Lightning Address</h3>
              <p className="text-gray-600 mb-2">Scan to pay or copy address:</p>

              {/* Lightning Address with Copy Button */}
              <div className="bg-orange-50 rounded-lg p-3 mb-4">
                <p className="text-orange-700 font-mono text-sm mb-2 break-all">{qrAddress}</p>
                <button
                  onClick={() => handleCopyNIP05(qrAddress)}
                  className="text-orange-600 hover:text-orange-700 text-sm font-medium underline"
                >
                  📋 Copy Lightning Address
                </button>
              </div>

              {/* NIP-05 Address Section */}
              <div className="bg-purple-50 rounded-lg p-3 mb-6">
                <p className="text-purple-700 text-sm font-medium mb-1">NIP-05 Nostr Address:</p>
                <p className="text-purple-600 font-mono text-sm mb-2 break-all">{qrAddress}</p>
                <button
                  onClick={() => handleCopyNIP05(qrAddress)}
                  className="text-purple-600 hover:text-purple-700 text-sm font-medium underline"
                >
                  📋 Copy NIP-05 Address
                </button>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleZapPayment}
                  className="w-full bg-orange-500 text-white px-4 py-3 rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center space-x-2"
                >
                  <Zap className="h-4 w-4" />
                  <span>Send Zap Payment</span>
                </button>

                <div className="flex items-center justify-center space-x-2 text-green-600 text-sm">
                  <CheckCircle className="h-4 w-4" />
                  <span>Ready for Lightning & Nostr payments</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Automation Modal */}
      <PaymentAutomationModal
        isOpen={showPaymentAutomationModal}
        onClose={() => {
          setShowPaymentAutomationModal(false);
          setEditingPaymentSchedule(undefined);
        }}
        onSave={handleSavePaymentSchedule}
        context="family"
        userId="current_user_id" // In production: get from auth context
        familyId={familyId}
        familyMembers={familyMembers.map(member => ({
          id: member.id,
          name: member.username,
          role: member.role,
          avatar: member.avatar,
          lightningAddress: member.lightningAddress,
          npub: `npub1${member.id}` // Mock npub - in production get real npub
        }))}
        existingSchedule={editingPaymentSchedule}
      />

      {/* Educational Dashboard Modal */}
      {showEducationalDashboard && (
        <EducationalDashboard
          userPubkey={familyData?.adminPubkey || 'demo_family_admin'}
          familyId={familyData?.id || 'demo_family_id'}
          onClose={() => setShowEducationalDashboard(false)}
        />
      )}

      {/* NWC Wallet Setup Modal */}
      <NWCWalletSetupModal
        isOpen={showNWCSetup}
        onClose={() => setShowNWCSetup(false)}
        onSuccess={(connectionId: string) => {
          console.log('Family NWC wallet connected:', connectionId);
          setShowNWCSetup(false);
          // Refresh family wallet data
        }}
        showEducationalContent={true}
      />

      {/* Sovereignty Education Flow Modal */}
      <SovereigntyEducationFlow
        isOpen={showSovereigntyEducation}
        onClose={() => setShowSovereigntyEducation(false)}
        onStartNWCSetup={() => {
          setShowSovereigntyEducation(false);
          setShowNWCSetup(true);
        }}
      />
    </div>
  );
};

export default FamilyFinancialsDashboard;