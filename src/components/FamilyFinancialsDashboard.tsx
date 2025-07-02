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
  Send,
  Shield,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';

// Import our enhanced dual-protocol components
import AtomicSwapModal from './AtomicSwapModal.tsx';
import FamilyFedimintGovernance from './FamilyFedimintGovernance.tsx';
import FamilyLightningTreasury from './FamilyLightningTreasury.tsx';
import PhoenixDFamilyManager from './PhoenixDFamilyManager.tsx';
import { PaymentModal } from './shared';
import UnifiedFamilyPayments from './UnifiedFamilyPayments.tsx';

// Import Credits Balance
import { CreditsBalance } from './CreditsBalance.tsx';

// Import enhanced types

interface FamilyFinancialsDashboardProps {
  familyData?: any;
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
  familyData, 
  onBack 
}) => {
  // State management
  const [currentView, setCurrentView] = useState<'overview' | 'lightning' | 'fedimint' | 'payments' | 'phoenixd'>('overview');
  const [familyName] = useState("Nakamoto");
  const [familyId] = useState("nakamoto_family_001");
  const [showPrivateBalances, setShowPrivateBalances] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Payment Modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  // Enhanced treasury state
  const [lightningBalance, setLightningBalance] = useState(5435000);
  const [fedimintBalance, setFedimintBalance] = useState(3335000);
  const [pendingApprovals, setPendingApprovals] = useState([
    {
      id: 'approval_1',
      type: 'Allowance Distribution',
      description: 'Weekly allowance for Alice and Bob',
      amount: 25000,
      requiredSignatures: 3,
      currentSignatures: 1,
    },
    {
      id: 'approval_2',
      type: 'Emergency Withdrawal',
      description: 'Emergency fund access for medical expenses',
      amount: 100000,
      requiredSignatures: 3,
      currentSignatures: 2,
    },
  ]);

  const [phoenixdStatus, setPhoenixdStatus] = useState({
    connected: true,
    automatedLiquidity: true,
    channelCount: 8,
    totalCapacity: 50000000,
    liquidityRatio: 0.72,
  });

  // Mock family members
  const familyMembers = [
    {
      id: "1",
      username: "satoshi",
      lightningAddress: "satoshi@satnam.pub",
      role: "adult" as const,
      balance: 1250000,
      nip05Verified: true,
      spendingLimits: {
        daily: 100000,
        weekly: 500000
      }
    },
    {
      id: "2", 
      username: "hal",
      lightningAddress: "hal@satnam.pub",
      role: "adult" as const,
      balance: 850000,
      nip05Verified: true,
      spendingLimits: {
        daily: 100000,
        weekly: 500000
      }
    },
    {
      id: "3",
      username: "alice", 
      lightningAddress: "alice@satnam.pub",
      role: "child" as const,
      balance: 125000,
      nip05Verified: false,
      spendingLimits: {
        daily: 50000,
        weekly: 200000,
      },
    },
    {
      id: "4",
      username: "bob",
      lightningAddress: "bob@satnam.pub", 
      role: "child" as const,
      balance: 75000,
      nip05Verified: true,
      spendingLimits: {
        daily: 25000,
        weekly: 100000,
      },
    },
  ];

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
              <div className={`flex items-center space-x-2 ${
                phoenixdStatus.connected ? 'text-green-600' : 'text-red-600'
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
              <div className={`flex items-center space-x-2 ${
                phoenixdStatus.automatedLiquidity ? 'text-green-600' : 'text-yellow-600'
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
                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                    {member.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{member.username}</div>
                    <div className="text-sm text-gray-500">{member.role}</div>
                  </div>
                </div>
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
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
        return <PhoenixDFamilyManager familyId={familyId} />;
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
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        familyMembers={familyMembers}
        selectedMember={selectedMember}
        onSelectedMemberChange={setSelectedMember}
      />
    </div>
  );
};

export default FamilyFinancialsDashboard;