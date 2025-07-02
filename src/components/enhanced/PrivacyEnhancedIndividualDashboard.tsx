/**
 * Privacy-Enhanced Individual Dashboard
 * Individual member dashboard with integrated privacy controls
 */

import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  RefreshCw,
  Send,
  Settings,
  Shield,
  Wallet,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { formatSats } from '../../lib/utils';
import { PrivacyEnhancedApiService } from '../../services/privacyEnhancedApi';
import { PrivacyLevel } from '../../types/privacy';
import { SatnamFamilyMember, Transaction } from '../../types/shared';
import { PrivacyControls } from '../PrivacyControls';
import PrivacyDashboardIndicators from './PrivacyDashboardIndicators.tsx';
import PrivacyEnhancedPaymentModal from './PrivacyEnhancedPaymentModal.tsx';
import PrivacyPreferencesModal from './PrivacyPreferencesModal.tsx';

interface PrivacyEnhancedIndividualDashboardProps {
  memberId: string;
  memberData: SatnamFamilyMember;
  onBack?: () => void;
}

interface PrivacyAwareWallet {
  lightning_balance: number;
  cashu_balance: number;
  fedimint_balance: number;
  total_balance: number;
  pending_transactions: number;
  privacy_score: number;
  default_privacy_level: PrivacyLevel;
  transactions_this_month: number;
  privacy_routing_success: number;
}

const PrivacyEnhancedIndividualDashboard: React.FC<PrivacyEnhancedIndividualDashboardProps> = ({
  memberId,
  memberData,
  onBack,
}) => {
  const [wallet, setWallet] = useState<PrivacyAwareWallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPrivateBalances, setShowPrivateBalances] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
  const [currentPrivacyLevel, setCurrentPrivacyLevel] = useState<PrivacyLevel>(PrivacyLevel.GIFTWRAPPED);
  const [refreshing, setRefreshing] = useState(false);

  const apiService = new PrivacyEnhancedApiService();

  useEffect(() => {
    loadWalletData();
    loadTransactionHistory();
  }, [memberId]);

  const loadWalletData = async () => {
    try {
      setLoading(true);
      
      // Mock privacy-aware wallet data - in real implementation, this would call the API
      const mockWallet: PrivacyAwareWallet = {
        lightning_balance: 250000,
        cashu_balance: 75000,
        fedimint_balance: 50000,
        total_balance: 375000,
        pending_transactions: 2,
        privacy_score: 88,
        default_privacy_level: PrivacyLevel.GIFTWRAPPED,
        transactions_this_month: 23,
        privacy_routing_success: 94
      };

      setWallet(mockWallet);
      setCurrentPrivacyLevel(mockWallet.default_privacy_level);
      
    } catch (error) {
      console.error('Failed to load wallet data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactionHistory = async () => {
    try {
      // Mock privacy-aware transaction history
      const mockTransactions: Transaction[] = [
        {
          id: 'tx1',
          type: 'send',
          amount: 50000,
          status: 'completed',
          timestamp: new Date(Date.now() - 1000 * 60 * 30),
          description: 'Coffee payment',
          privacy_level: PrivacyLevel.GIFTWRAPPED,
          routing_method: 'cashu'
        },
        {
          id: 'tx2',
          type: 'receive',
          amount: 100000,
          status: 'completed',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
          description: 'Weekly allowance',
          privacy_level: PrivacyLevel.ENCRYPTED,
          routing_method: 'fedimint'
        },
        {
          id: 'tx3',
          type: 'send',
          amount: 25000,
          status: 'pending',
          timestamp: new Date(Date.now() - 1000 * 60 * 5),
          description: 'Lunch payment',
          privacy_level: PrivacyLevel.GIFTWRAPPED,
          routing_method: 'lnproxy'
        }
      ];

      setTransactions(mockTransactions);
    } catch (error) {
      console.error('Failed to load transaction history:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadWalletData(), loadTransactionHistory()]);
    setRefreshing(false);
  };

  const handlePrivacyLevelChange = (newLevel: PrivacyLevel) => {
    setCurrentPrivacyLevel(newLevel);
    // In real implementation, this would update user preferences
    console.log('Privacy level changed to:', newLevel);
  };

  const getPrivacyLevelColor = (level: PrivacyLevel) => {
    switch (level) {
      case PrivacyLevel.GIFTWRAPPED:
        return 'text-green-400';
      case PrivacyLevel.ENCRYPTED:
        return 'text-blue-400';
      case PrivacyLevel.MINIMAL:
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  const getPrivacyIcon = (level: PrivacyLevel) => {
    switch (level) {
      case PrivacyLevel.GIFTWRAPPED:
        return '🛡️';
      case PrivacyLevel.ENCRYPTED:
        return '🔒';
      case PrivacyLevel.MINIMAL:
        return '👁️';
      default:
        return '🔐';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-purple-900 to-blue-950 p-4 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-purple-900 to-blue-950 p-4 flex items-center justify-center text-white">
        Failed to load wallet data
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-purple-900 to-blue-950 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 rounded-2xl p-6 border border-white/20 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {onBack && (
                <button
                  onClick={onBack}
                  className="text-purple-300 hover:text-white transition-colors"
                >
                  ← Back
                </button>
              )}
              <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                {memberData.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{memberData.username}'s Wallet</h1>
                <p className="text-purple-200 capitalize">{memberData.role} • Privacy-Enhanced</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 text-purple-300 hover:text-white transition-colors"
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowPrivateBalances(!showPrivateBalances)}
                className="p-2 text-purple-300 hover:text-white transition-colors"
              >
                {showPrivateBalances ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
              <button
                onClick={() => setPreferencesModalOpen(true)}
                className="p-2 text-purple-300 hover:text-white transition-colors"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Wallet Balances & Actions */}
          <div className="space-y-6">
            {/* Total Balance */}
            <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Total Balance</h3>
                <div className={`flex items-center space-x-2 text-sm px-3 py-1 rounded-full ${
                  wallet.privacy_score >= 80 ? 'bg-green-500/20 text-green-400' : 
                  wallet.privacy_score >= 60 ? 'bg-yellow-500/20 text-yellow-400' : 
                  'bg-red-500/20 text-red-400'
                }`}>
                  <Shield className="h-4 w-4" />
                  <span>{wallet.privacy_score}%</span>
                </div>
              </div>
              <div className="text-3xl font-bold text-white mb-2">
                {showPrivateBalances ? formatSats(wallet.total_balance) : '•••••••'} sats
              </div>
              <div className="text-purple-200 text-sm mb-4">
                ≈ ${showPrivateBalances ? (wallet.total_balance * 0.00003).toFixed(2) : '•••••'} USD
              </div>
              
              {/* Balance Breakdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <Zap className="h-4 w-4 text-yellow-400" />
                    <span className="text-purple-200">Lightning</span>
                  </div>
                  <span className="text-white">
                    {showPrivateBalances ? formatSats(wallet.lightning_balance) : '•••••'} sats
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <span className="text-blue-400">🪙</span>
                    <span className="text-purple-200">Cashu</span>
                  </div>
                  <span className="text-white">
                    {showPrivateBalances ? formatSats(wallet.cashu_balance) : '•••••'} sats
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <Shield className="h-4 w-4 text-purple-400" />
                    <span className="text-purple-200">Fedimint</span>
                  </div>
                  <span className="text-white">
                    {showPrivateBalances ? formatSats(wallet.fedimint_balance) : '•••••'} sats
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
              <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setPaymentModalOpen(true)}
                  className="flex flex-col items-center space-y-2 p-4 bg-purple-700 hover:bg-purple-800 rounded-lg transition-colors"
                >
                  <Send className="h-6 w-6 text-white" />
                  <span className="text-white text-sm font-medium">Send Payment</span>
                </button>
                <button className="flex flex-col items-center space-y-2 p-4 bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors">
                  <ArrowDownLeft className="h-6 w-6 text-white" />
                  <span className="text-white text-sm font-medium">Request Payment</span>
                </button>
                <button className="flex flex-col items-center space-y-2 p-4 bg-green-700 hover:bg-green-800 rounded-lg transition-colors">
                  <Wallet className="h-6 w-6 text-white" />
                  <span className="text-white text-sm font-medium">Top Up</span>
                </button>
                <button className="flex flex-col items-center space-y-2 p-4 bg-orange-700 hover:bg-orange-800 rounded-lg transition-colors">
                  <CreditCard className="h-6 w-6 text-white" />
                  <span className="text-white text-sm font-medium">Exchange</span>
                </button>
              </div>
            </div>

            {/* Privacy Controls */}
            <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
              <PrivacyControls
                currentLevel={currentPrivacyLevel}
                onLevelChange={handlePrivacyLevelChange}
                userRole={memberData.role}
                showMetrics={true}
                privacyMetrics={{
                  transactionsRouted: wallet.transactions_this_month,
                  privacyScore: wallet.privacy_score,
                  lnproxyUsage: wallet.privacy_routing_success,
                  cashuPrivacy: 92
                }}
              />
            </div>
          </div>

          {/* Middle Column: Privacy Dashboard */}
          <div className="space-y-6">
            <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
              <h3 className="text-lg font-semibold text-white mb-4">Privacy Dashboard</h3>
              <PrivacyDashboardIndicators
                familyId="family_id"
                userId={memberId}
                showDetailedMetrics={true}
                onPrivacySettingsClick={() => setPreferencesModalOpen(true)}
              />
            </div>

            {/* Spending Limits */}
            {memberData.spendingLimits && (
              <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
                <h3 className="text-lg font-semibold text-white mb-4">Spending Limits</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-purple-200 text-sm">Daily Limit</span>
                      <span className="text-white font-semibold">
                        {formatSats(memberData.spendingLimits.daily)} sats
                      </span>
                    </div>
                    <div className="w-full bg-white/20 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: '35%' }} />
                    </div>
                    <div className="text-purple-300 text-xs mt-1">35% used today</div>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-purple-200 text-sm">Weekly Limit</span>
                      <span className="text-white font-semibold">
                        {formatSats(memberData.spendingLimits.weekly)} sats
                      </span>
                    </div>
                    <div className="w-full bg-white/20 rounded-full h-2">
                      <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '62%' }} />
                    </div>
                    <div className="text-purple-300 text-xs mt-1">62% used this week</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Transaction History */}
          <div className="space-y-6">
            <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Recent Transactions</h3>
                <div className="text-purple-200 text-sm">
                  {wallet.transactions_this_month} this month
                </div>
              </div>
              
              <div className="space-y-3">
                {transactions.slice(0, 10).map((tx) => (
                  <div key={tx.id} className="bg-white/5 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          tx.type === 'send' ? 'bg-red-500/20' : 'bg-green-500/20'
                        }`}>
                          {tx.type === 'send' ? 
                            <ArrowUpRight className="h-4 w-4 text-red-400" /> : 
                            <ArrowDownLeft className="h-4 w-4 text-green-400" />
                          }
                        </div>
                        <div>
                          <div className="text-white font-medium">{tx.description}</div>
                          <div className="flex items-center space-x-2 text-xs">
                            <span className={getPrivacyLevelColor(tx.privacy_level)}>
                              {getPrivacyIcon(tx.privacy_level)} {tx.privacy_level}
                            </span>
                            <span className="text-purple-300">• {tx.routing_method}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-semibold ${
                          tx.type === 'send' ? 'text-red-400' : 'text-green-400'
                        }`}>
                          {tx.type === 'send' ? '-' : '+'}{formatSats(tx.amount)} sats
                        </div>
                        <div className="text-purple-300 text-xs">
                          {tx.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className={`flex items-center space-x-2 text-xs px-2 py-1 rounded-full ${
                        tx.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        tx.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        <CheckCircle className="h-3 w-3" />
                        <span className="capitalize">{tx.status}</span>
                      </div>
                      <button className="text-purple-300 hover:text-white transition-colors">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <PrivacyEnhancedPaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        familyMembers={[memberData]}
        selectedMember={memberId}
        onSelectedMemberChange={() => {}}
        onPaymentComplete={(result) => {
          console.log('Payment completed:', result);
          handleRefresh();
        }}
      />

      <PrivacyPreferencesModal
        isOpen={preferencesModalOpen}
        onClose={() => setPreferencesModalOpen(false)}
        userId={memberId}
        userRole={memberData.role}
        onPreferencesUpdated={(preferences) => {
          console.log('Preferences updated:', preferences);
          setCurrentPrivacyLevel(preferences.default_privacy_level);
          handleRefresh();
        }}
      />
    </div>
  );
};

export default PrivacyEnhancedIndividualDashboard;