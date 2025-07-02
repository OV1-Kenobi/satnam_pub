import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle,
  Eye,
  EyeOff,
  Globe,
  RefreshCw,
  Settings,
  Shield,
  TrendingUp,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';

// Import our new dual-protocol components
import FamilyFedimintGovernance from './FamilyFedimintGovernance.tsx';
import FamilyLightningTreasury from './FamilyLightningTreasury.tsx';
import PhoenixDFamilyManager from './PhoenixDFamilyManager.tsx';
import SmartPaymentModal from './SmartPaymentModal.tsx';
import UnifiedFamilyPayments from './UnifiedFamilyPayments.tsx';

// Import new privacy-enhanced components
import PrivacyDashboardIndicators from './enhanced/PrivacyDashboardIndicators.tsx';
import PrivacyEnhancedPaymentModal from './enhanced/PrivacyEnhancedPaymentModal.tsx';
import PrivacyPreferencesModal from './enhanced/PrivacyPreferencesModal.tsx';

// Import enhanced types
import {
  DualProtocolFamilyMember,
  EnhancedFamilyTreasury
} from '../../types/family';

interface EnhancedFamilyDashboardProps {
  onBack: () => void;
}

type DashboardView = 'overview' | 'lightning' | 'fedimint' | 'payments' | 'phoenixd' | 'settings';

const EnhancedFamilyDashboard: React.FC<EnhancedFamilyDashboardProps> = ({ onBack }) => {
  // State management
  const [currentView, setCurrentView] = useState<DashboardView>('overview');
  const [familyName] = useState("Nakamoto");
  const [familyId] = useState("nakamoto_family_001");
  const [showPrivateBalances, setShowPrivateBalances] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentModalType, setPaymentModalType] = useState<"send" | "receive">("send");
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [satsToDollars] = useState(0.00003); // Mock exchange rate
  const [refreshing, setRefreshing] = useState(false);
  
  // Privacy modal states
  const [privacyPaymentModalOpen, setPrivacyPaymentModalOpen] = useState(false);
  const [privacyPreferencesModalOpen, setPrivacyPreferencesModalOpen] = useState(false);
  const [showPrivacyDashboard, setShowPrivacyDashboard] = useState(true);

  // Enhanced family treasury data
  const [enhancedTreasury, setEnhancedTreasury] = useState<EnhancedFamilyTreasury>({
    lightningBalance: 5435000,
    lightningAddress: "family@satnam.pub",
    phoenixdStatus: {
      connected: true,
      automatedLiquidity: true,
      channelCount: 8,
      totalCapacity: 50000000,
      liquidityRatio: 0.72,
    },
    fedimintEcashBalance: 3335000,
    guardiansOnline: 4,
    guardiansTotal: 5,
    consensusThreshold: 3,
    pendingApprovals: [],
    recentTransactions: [],
    monthlySpending: {
      lightning: 125000,
      fedimint: 75000,
      total: 200000,
    },
    weeklyGrowth: 12.5,
    monthlyGrowth: 45.2,
    lastUpdated: new Date(),
  });

  // Enhanced family members with dual-protocol support
  const [familyMembers] = useState<DualProtocolFamilyMember[]>([
    {
      id: "1",
      username: "satoshi",
      lightningAddress: "satoshi@satnam.pub",
      role: "adult",
      spendingLimits: { daily: 100000, weekly: 500000 },
      nip05Verified: true,
      balance: 5000000,
      lightningBalance: 3200000,
      phoenixdChannels: [],
      zapReceived24h: 150000,
      zapSent24h: 25000,
      fedimintBalance: 1800000,
      guardianStatus: 'active',
      votingPower: 2,
      pendingApprovals: [],
      totalBalance: 5000000,
      preferredProtocol: 'auto',
      privacySettings: {
        enableLNProxy: true,
        enableFedimintPrivacy: true,
      },
      recentActivity: {
        lastTransaction: "2 hours ago",
        transactionCount24h: 5,
      },
    },
    {
      id: "2",
      username: "hal",
      lightningAddress: "hal@satnam.pub",
      role: "adult",
      spendingLimits: { daily: 100000, weekly: 500000 },
      nip05Verified: true,
      balance: 3500000,
      lightningBalance: 2100000,
      phoenixdChannels: [],
      zapReceived24h: 75000,
      zapSent24h: 50000,
      fedimintBalance: 1400000,
      guardianStatus: 'active',
      votingPower: 2,
      pendingApprovals: [],
      totalBalance: 3500000,
      preferredProtocol: 'auto',
      privacySettings: {
        enableLNProxy: true,
        enableFedimintPrivacy: true,
      },
      recentActivity: {
        lastTransaction: "30 minutes ago",
        transactionCount24h: 3,
      },
    },
    {
      id: "3",
      username: "alice",
      lightningAddress: "alice@satnam.pub",
      role: "child",
      spendingLimits: { daily: 15000, weekly: 75000 },
      nip05Verified: true,
      balance: 150000,
      lightningBalance: 90000,
      phoenixdChannels: [],
      zapReceived24h: 5000,
      zapSent24h: 2000,
      fedimintBalance: 60000,
      pendingApprovals: [],
      totalBalance: 150000,
      preferredProtocol: 'fedimint',
      privacySettings: {
        enableLNProxy: true,
        enableFedimintPrivacy: true,
      },
      recentActivity: {
        lastTransaction: "1 hour ago",
        transactionCount24h: 2,
      },
    },
    {
      id: "4",
      username: "bob",
      lightningAddress: "bob@satnam.pub",
      role: "child",
      spendingLimits: { daily: 10000, weekly: 50000 },
      nip05Verified: false,
      balance: 75000,
      lightningBalance: 25000,
      phoenixdChannels: [],
      zapReceived24h: 1000,
      zapSent24h: 500,
      fedimintBalance: 50000,
      pendingApprovals: [],
      totalBalance: 75000,
      preferredProtocol: 'fedimint',
      privacySettings: {
        enableLNProxy: false,
        enableFedimintPrivacy: true,
      },
      recentActivity: {
        lastTransaction: "3 hours ago",
        transactionCount24h: 1,
      },
    },
  ]);

  // Refresh all data
  const handleRefreshAll = async () => {
    setRefreshing(true);
    // In real implementation, this would refresh all component data
    await new Promise(resolve => setTimeout(resolve, 2000));
    setRefreshing(false);
  };

  // Handle payment completion
  const handlePaymentComplete = (paymentResult: any) => {
    console.log('Payment completed:', paymentResult);
    // Refresh treasury data
    setEnhancedTreasury(prev => ({
      ...prev,
      lastUpdated: new Date(),
    }));
  };

  // Format numbers
  const formatSats = (sats: number): string => {
    return new Intl.NumberFormat().format(sats);
  };

  const formatUSD = (sats: number): string => {
    return (sats * satsToDollars).toFixed(2);
  };

  // Calculate totals
  const totalBalance = enhancedTreasury.lightningBalance + enhancedTreasury.fedimintEcashBalance;
  const totalMembers = familyMembers.length;
  const verifiedMembers = familyMembers.filter(m => m.nip05Verified).length;
  const activeGuardians = enhancedTreasury.guardiansOnline;

  // Navigation items
  const navigationItems = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'lightning', label: 'Lightning Treasury', icon: Zap },
    { id: 'fedimint', label: 'Fedimint Governance', icon: Shield },
    { id: 'payments', label: 'Unified Payments', icon: Activity },
    { id: 'phoenixd', label: 'PhoenixD Manager', icon: Globe },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  // Render navigation
  const renderNavigation = () => (
    <div className="bg-orange-900 rounded-2xl p-4 border border-orange-400/20 mb-6">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-orange-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Home</span>
        </button>
        
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-white">{familyName} Family Banking</h1>
          <button
            onClick={handleRefreshAll}
            disabled={refreshing}
            className="p-2 text-orange-400 hover:text-orange-300 transition-colors"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id as DashboardView)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                currentView === item.id
                  ? 'bg-orange-600 text-white'
                  : 'bg-orange-800/50 text-orange-300 hover:bg-orange-700 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // Render overview dashboard
  const renderOverview = () => (
    <div className="space-y-6">
      {/* Treasury Overview */}
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Family Treasury Overview</h2>
          <button
            onClick={() => setShowPrivateBalances(!showPrivateBalances)}
            className="flex items-center space-x-2 text-orange-400 hover:text-orange-300 transition-colors"
          >
            {showPrivateBalances ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span>{showPrivateBalances ? 'Hide' : 'Show'} Details</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-300">Total Balance</span>
              <BarChart3 className="h-5 w-5 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {showPrivateBalances ? formatSats(totalBalance) : '•••••••'} sats
            </div>
            <div className="text-sm text-orange-300">
              ≈ ${showPrivateBalances ? formatUSD(totalBalance) : '•••••'} USD
            </div>
          </div>

          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-300">Lightning Balance</span>
              <Zap className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {showPrivateBalances ? formatSats(enhancedTreasury.lightningBalance) : '•••••••'} sats
            </div>
            <div className="text-sm text-orange-300">
              External payments & zaps
            </div>
          </div>

          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-300">eCash Balance</span>
              <Shield className="h-5 w-5 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {showPrivateBalances ? formatSats(enhancedTreasury.fedimintEcashBalance) : '•••••••'} sats
            </div>
            <div className="text-sm text-orange-300">
              Internal governance
            </div>
          </div>

          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-300">Monthly Growth</span>
              <TrendingUp className="h-5 w-5 text-green-400" />
            </div>
            <div className="text-2xl font-bold text-green-400">
              +{enhancedTreasury.monthlyGrowth}%
            </div>
            <div className="text-sm text-orange-300">
              Last 30 days
            </div>
          </div>
        </div>
      </div>

      {/* Protocol Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
          <h3 className="text-lg font-semibold text-white mb-4">Lightning Network Status</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-orange-300">PhoenixD Connection</span>
              <div className={`flex items-center space-x-2 ${
                enhancedTreasury.phoenixdStatus.connected ? 'text-green-400' : 'text-red-400'
              }`}>
                <CheckCircle className="h-4 w-4" />
                <span>{enhancedTreasury.phoenixdStatus.connected ? 'Connected' : 'Disconnected'}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-orange-300">Active Channels</span>
              <span className="text-white font-semibold">{enhancedTreasury.phoenixdStatus.channelCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-orange-300">Auto Liquidity</span>
              <div className={`flex items-center space-x-2 ${
                enhancedTreasury.phoenixdStatus.automatedLiquidity ? 'text-green-400' : 'text-yellow-400'
              }`}>
                {enhancedTreasury.phoenixdStatus.automatedLiquidity ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                <span>{enhancedTreasury.phoenixdStatus.automatedLiquidity ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-orange-300">Liquidity Ratio</span>
              <span className="text-white font-semibold">{(enhancedTreasury.phoenixdStatus.liquidityRatio * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
          <h3 className="text-lg font-semibold text-white mb-4">Fedimint Governance Status</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-orange-300">Guardian Consensus</span>
              <span className="text-white font-semibold">
                {enhancedTreasury.guardiansOnline}/{enhancedTreasury.guardiansTotal}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-orange-300">Consensus Threshold</span>
              <span className="text-white font-semibold">{enhancedTreasury.consensusThreshold}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-orange-300">Pending Approvals</span>
              <span className="text-white font-semibold">{enhancedTreasury.pendingApprovals.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-orange-300">Federation Health</span>
              <div className="flex items-center space-x-2 text-green-400">
                <CheckCircle className="h-4 w-4" />
                <span>Excellent</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Family Members */}
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Family Members</h3>
          <div className="text-orange-300 text-sm">
            {verifiedMembers}/{totalMembers} verified
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {familyMembers.map((member) => (
            <div key={member.id} className="bg-orange-800/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white font-semibold">
                    {member.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-white font-medium">{member.username}</span>
                </div>
                <div className={`w-2 h-2 rounded-full ${
                  member.nip05Verified ? 'bg-green-400' : 'bg-yellow-400'
                }`} />
              </div>
              <div className="text-sm text-orange-300 mb-1">
                Role: {member.role}
              </div>
              <div className="text-sm text-orange-300 mb-2">
                Balance: {showPrivateBalances ? formatSats(member.totalBalance) : '•••••'} sats
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    setSelectedMemberId(member.id);
                    setPaymentModalType("send");
                    setPaymentModalOpen(true);
                  }}
                  className="flex-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors"
                >
                  Send
                </button>
                <button
                  onClick={() => {
                    setSelectedMemberId(member.id);
                    setPaymentModalType("receive");
                    setPaymentModalOpen(true);
                  }}
                  className="flex-1 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                >
                  Request
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <button
            onClick={() => setCurrentView('lightning')}
            className="flex flex-col items-center space-y-2 p-4 bg-orange-800/50 rounded-lg hover:bg-orange-700 transition-colors"
          >
            <Zap className="h-6 w-6 text-yellow-400" />
            <span className="text-white text-sm">Lightning Treasury</span>
          </button>
          <button
            onClick={() => setCurrentView('fedimint')}
            className="flex flex-col items-center space-y-2 p-4 bg-orange-800/50 rounded-lg hover:bg-orange-700 transition-colors"
          >
            <Shield className="h-6 w-6 text-purple-400" />
            <span className="text-white text-sm">Governance</span>
          </button>
          <button
            onClick={() => setCurrentView('payments')}
            className="flex flex-col items-center space-y-2 p-4 bg-orange-800/50 rounded-lg hover:bg-orange-700 transition-colors"
          >
            <Activity className="h-6 w-6 text-blue-400" />
            <span className="text-white text-sm">Unified Payments</span>
          </button>
          <button
            onClick={() => setCurrentView('phoenixd')}
            className="flex flex-col items-center space-y-2 p-4 bg-orange-800/50 rounded-lg hover:bg-orange-700 transition-colors"
          >
            <Globe className="h-6 w-6 text-green-400" />
            <span className="text-white text-sm">PhoenixD Manager</span>
          </button>
          <button
            onClick={() => setPrivacyPaymentModalOpen(true)}
            className="flex flex-col items-center space-y-2 p-4 bg-orange-800/50 rounded-lg hover:bg-orange-700 transition-colors border-2 border-purple-500/30"
          >
            <Shield className="h-6 w-6 text-purple-400" />
            <span className="text-white text-sm">Privacy Payment</span>
          </button>
        </div>
      </div>

      {/* Privacy Dashboard Section */}
      {showPrivacyDashboard && (
        <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Privacy Dashboard</h3>
            <button
              onClick={() => setPrivacyPreferencesModalOpen(true)}
              className="text-orange-300 hover:text-white transition-colors text-sm flex items-center space-x-1"
            >
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </button>
          </div>
          <PrivacyDashboardIndicators
            familyId={familyId}
            showDetailedMetrics={true}
            onPrivacySettingsClick={() => setPrivacyPreferencesModalOpen(true)}
          />
        </div>
      )}
    </div>
  );

  // Render current view
  const renderCurrentView = () => {
    switch (currentView) {
      case 'overview':
        return renderOverview();
      case 'lightning':
        return (
          <FamilyLightningTreasury
            familyId={familyId}
            onSendZap={(recipient, amount, message) => {
              console.log('Zap sent:', { recipient, amount, message });
            }}
            onGenerateInvoice={(amount, description) => {
              console.log('Invoice generated:', { amount, description });
            }}
          />
        );
      case 'fedimint':
        return (
          <FamilyFedimintGovernance
            familyId={familyId}
            onCreateProposal={(type, description, amount, recipient) => {
              console.log('Proposal created:', { type, description, amount, recipient });
            }}
            onApproveProposal={(proposalId, approved) => {
              console.log('Proposal approval:', { proposalId, approved });
            }}
          />
        );
      case 'payments':
        return (
          <UnifiedFamilyPayments
            familyId={familyId}
            familyMembers={familyMembers}
            onPaymentComplete={handlePaymentComplete}
          />
        );
      case 'phoenixd':
        return (
          <PhoenixDFamilyManager
            familyId={familyId}
            onChannelAction={(action, channelId) => {
              console.log('Channel action:', { action, channelId });
            }}
          />
        );
      case 'settings':
        return (
          <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
            <h2 className="text-xl font-bold text-white mb-4">Family Settings</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-orange-300">Show Private Balances</span>
                <button
                  onClick={() => setShowPrivateBalances(!showPrivateBalances)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    showPrivateBalances ? 'bg-green-600' : 'bg-gray-600'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    showPrivateBalances ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              <div className="text-orange-300 text-sm">
                More settings coming soon...
              </div>
            </div>
          </div>
        );
      default:
        return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-950 via-orange-900 to-red-950 p-4">
      <div className="max-w-7xl mx-auto">
        {renderNavigation()}
        {renderCurrentView()}
      </div>

      {/* Smart Payment Modal */}
      <SmartPaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        type={paymentModalType}
        familyMembers={familyMembers}
        selectedMemberId={selectedMemberId}
        satsToDollars={satsToDollars}
        onPaymentSuccess={(payment) => {
          console.log('Payment success:', payment);
          handlePaymentComplete(payment);
        }}
        onInvoiceGenerated={(invoice, qrCode) => {
          console.log('Invoice generated:', { invoice, qrCode });
        }}
      />

      {/* Privacy-Enhanced Payment Modal */}
      <PrivacyEnhancedPaymentModal
        isOpen={privacyPaymentModalOpen}
        onClose={() => setPrivacyPaymentModalOpen(false)}
        familyMembers={familyMembers}
        selectedMember={selectedMemberId}
        onSelectedMemberChange={setSelectedMemberId}
        onPaymentComplete={(result) => {
          console.log('Privacy payment completed:', result);
          handlePaymentComplete(result);
        }}
      />

      {/* Privacy Preferences Modal */}
      <PrivacyPreferencesModal
        isOpen={privacyPreferencesModalOpen}
        onClose={() => setPrivacyPreferencesModalOpen(false)}
        userId="current_user_id" // In real implementation, get from auth context
        userRole="adult" // In real implementation, get from user data
        onPreferencesUpdated={(preferences) => {
          console.log('Privacy preferences updated:', preferences);
          // Refresh privacy dashboard
          setShowPrivacyDashboard(false);
          setTimeout(() => setShowPrivacyDashboard(true), 100);
        }}
      />
    </div>
  );
};

export default EnhancedFamilyDashboard;