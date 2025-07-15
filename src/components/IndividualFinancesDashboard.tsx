/**
 * Enhanced Individual Finances Dashboard with Privacy Controls
 * Consolidated dashboard combining lightning, cashu, and privacy features
 */
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Brain,
  CheckCircle,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Gift,
  Globe,
  QrCode,
  RefreshCw,
  Send,
  Shield,
  Split,
  Wallet,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

// Transaction type defined locally below

// Import Credits Balance
import { CreditsBalance } from './CreditsBalance';

// Import API service
import { IndividualApiService, handleApiError } from '../services/individualApi';

// Import Cross-Mint Manager
import { CrossMintSettings, MultiNutPayment, NutSwapTransaction, SatnamCrossMintCashuManager } from '../lib/cross-mint-cashu-manager';

// Import Payment Cascade Modal
import { PaymentCascadeNode } from '../lib/payment-automation';
import PaymentCascadeModal from './PaymentCascadeModal';

// Import Emergency Recovery Modal
import { useAuth } from '../hooks/useAuth';
import { FederationRole } from '../types/auth';
import EmergencyRecoveryModal from './EmergencyRecoveryModal';

// Import our enhanced dual-protocol components
import EducationalDashboard from './education/EducationalDashboard';
import IndividualPaymentAutomationModal from './IndividualPaymentAutomationModal';
import SimplePaymentModal from './SimplePaymentModal';

// Import Privacy Components
import { PrivacyLevel } from '../types/privacy';
import Argon2SecurityTest from './Argon2SecurityTest';
import PrivacyEnhancedPaymentModal from './enhanced/PrivacyEnhancedPaymentModal';
import PrivacyPreferencesModal from './enhanced/PrivacyPreferencesModal';

// Import API service

// Utils

// Define Transaction type locally
interface Transaction {
  id: string;
  type: 'sent' | 'received' | 'payment' | 'receive' | 'zap' | 'mint' | 'melt';
  amount: number;
  from: string;
  to: string;
  fee?: number;
  memo?: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed' | string;
  privacyRouted: boolean;
  paymentMethod?: 'lightning' | 'ecash';
  hash?: string;
  tokenId?: string;
}

interface IndividualFinancesDashboardProps {
  memberId: string;
  memberData: {
    id: string;
    username: string; // Added username property from User interface
    auth_hash: string; // Privacy-first authentication hash
    encrypted_profile?: string; // User-encrypted optional data
    lightningAddress?: string;
    role: 'offspring' | 'adult' | 'steward' | 'guardian';
    familyId?: string;
    is_discoverable: boolean;
    balance?: number;
    spendingLimits?: {
      daily: number;
      weekly: number;
      requiresApproval: number;
    };
    avatar?: string;
    created_at: number;
    last_login?: number;
  };
  onBack?: () => void;
}

interface IndividualWallet {
  memberId: string;
  username: string;
  lightningAddress: string;
  lightningBalance: number;
  ecashBalance: number;
  spendingLimits?: {
    daily: number;
    weekly: number;
    requiresApproval: number;
  };
  recentTransactions: Transaction[];
  privacySettings: {
    defaultRouting: 'lightning' | 'ecash';
    lnproxyEnabled: boolean;
    guardianProtected: boolean;
  };
}

interface EnhancedIndividualWallet extends IndividualWallet {
  lightning_balance: number;
  cashu_balance: number;
  fedimint_balance: number;
  total_balance: number;
  pending_transactions: number;
  privacy_score: number;
  default_privacy_level: PrivacyLevel;
  transactions_this_month: number;
  privacy_routing_success: number;
  lastUpdated: Date;

  // Lightning-specific properties
  zapHistory: NostrZap[];
  lightningTransactions: LightningTransaction[];

  // Cashu-specific properties
  bearerInstruments: BearerNote[];
  cashuTransactions: CashuTransaction[];

  // Enhanced routing preferences
  routingRules: {
    zaps: 'lightning'; // Always use Lightning for Nostr zaps
    external: 'lightning' | 'cashu' | 'auto';
    gifts: 'cashu'; // Always use Cashu for bearer gifts
    savings: 'cashu'; // Use Cashu for offline storage
  };
}

// Consolidated Cross-Mint Individual Wallet interface
interface CrossMintIndividualWallet extends EnhancedIndividualWallet {
  // Multi-mint balance tracking
  cross_mint_balance: number;
  externalMintBalances: Map<string, number>; // mint URL -> balance
  supportedMints: string[];

  // Cross-mint tokens
  cross_mint_tokens: Array<{
    mint_url: string;
    token_count: number;
    total_value: number;
    is_trusted: boolean;
  }>;

  // Multi-nut payment capabilities
  multiNutPayments: MultiNutPayment[];
  multi_nut_transactions: MultiNutPayment[];
  nutSwapHistory: NutSwapTransaction[];
  pending_swaps: NutSwapTransaction[];

  // Cross-mint preferences
  crossMintSettings: CrossMintSettings;
  cross_mint_settings: CrossMintSettings;
}

interface NostrZap {
  id: string;
  amount: number;
  recipient: string;
  memo?: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
}

interface BearerNote {
  id: string;
  amount: number;
  formFactor: 'qr' | 'nfc' | 'dm' | 'physical';
  created: Date;
  redeemed: boolean;
  token: string;
}

interface LightningTransaction {
  id: string;
  type: 'zap' | 'payment' | 'invoice';
  amount: number;
  fee: number;
  recipient?: string;
  sender?: string;
  memo?: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  paymentHash: string;
}

interface CashuTransaction {
  id: string;
  type: 'mint' | 'melt' | 'send' | 'receive';
  amount: number;
  fee: number;
  recipient?: string;
  sender?: string;
  memo?: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  tokenId: string;
}

// Cashu Wallet Card Component
const CashuWalletCard: React.FC<{ wallet: EnhancedIndividualWallet }> = ({ wallet }) => {
  const [showBalance, setShowBalance] = useState(false);

  return (
    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Shield className="h-6 w-6 text-blue-600" />
          <h3 className="text-lg font-semibold text-blue-900">Cashu Wallet</h3>
        </div>
        <button
          onClick={() => setShowBalance(!showBalance)}
          className="text-blue-600 hover:text-blue-700"
        >
          {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-2xl font-bold text-blue-900">
            {showBalance ? `${wallet.ecashBalance.toLocaleString()} sats` : '••••••'}
          </p>
          <p className="text-sm text-blue-600">Private bearer instruments</p>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-blue-700">Bearer Notes:</span>
          <span className="font-medium text-blue-900">{wallet.bearerInstruments?.length || 0}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-blue-700">Privacy Level:</span>
          <span className="font-medium text-blue-900">Maximum</span>
        </div>
      </div>
    </div>
  );
};

// Lightning Wallet Card Component
const LightningWalletCard: React.FC<{ wallet: EnhancedIndividualWallet }> = ({ wallet }) => {
  const [showBalance, setShowBalance] = useState(false);

  return (
    <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Zap className="h-6 w-6 text-orange-600" />
          <h3 className="text-lg font-semibold text-orange-900">Lightning Wallet</h3>
        </div>
        <button
          onClick={() => setShowBalance(!showBalance)}
          className="text-orange-600 hover:text-orange-700"
        >
          {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-2xl font-bold text-orange-900">
            {showBalance ? `${wallet.lightningBalance.toLocaleString()} sats` : '••••••'}
          </p>
          <p className="text-sm text-orange-600">Available for instant payments</p>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-orange-700">Recent Zaps:</span>
          <span className="font-medium text-orange-900">{wallet.zapHistory?.length || 0}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-orange-700">Lightning Address:</span>
          <span className="font-mono text-xs text-orange-800 truncate ml-2">
            {wallet.lightningAddress}
          </span>
        </div>
      </div>
    </div>
  );
};

// External Mints Card Component
const ExternalMintsCard: React.FC<{ wallet: CrossMintIndividualWallet }> = ({ wallet }) => {
  const [showBalance, setShowBalance] = useState(false);

  const totalExternalBalance = Array.from(wallet.externalMintBalances?.values() || [])
    .reduce((sum, balance) => sum + balance, 0);

  const activeMints = wallet.externalMintBalances?.size || 0;

  return (
    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Globe className="h-6 w-6 text-purple-600" />
          <h3 className="text-lg font-semibold text-purple-900">External Mints</h3>
        </div>
        <button
          onClick={() => setShowBalance(!showBalance)}
          className="text-purple-600 hover:text-purple-700"
        >
          {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-2xl font-bold text-purple-900">
            {showBalance ? `${totalExternalBalance.toLocaleString()} sats` : '••••••'}
          </p>
          <p className="text-sm text-purple-600">Cross-mint balances</p>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-purple-700">Active Mints:</span>
          <span className="font-medium text-purple-900">{activeMints}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-purple-700">Multi-Nut Ready:</span>
          <CheckCircle className="h-4 w-4 text-green-600" />
        </div>
      </div>
    </div>
  );
};

// Enhanced Overview Tab
const EnhancedOverviewTab: React.FC<{ wallet: EnhancedIndividualWallet }> = ({ wallet }) => {
  const totalBalance = wallet.lightningBalance + wallet.ecashBalance;
  const recentActivity = [
    ...(wallet.lightningTransactions || []).map(tx => ({ ...tx, protocol: 'lightning' })),
    ...(wallet.cashuTransactions || []).map(tx => ({ ...tx, protocol: 'cashu' }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Total Balance Overview */}
      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
        <div className="flex items-center space-x-2 mb-4">
          <Wallet className="h-6 w-6 text-green-600" />
          <h3 className="text-lg font-semibold text-green-900">Total Balance</h3>
        </div>
        <p className="text-3xl font-bold text-green-900 mb-2">
          {totalBalance.toLocaleString()} sats
        </p>
        <div className="flex space-x-4 text-sm text-green-700">
          <span>Lightning: {((wallet.lightningBalance / totalBalance) * 100).toFixed(1)}%</span>
          <span>Cashu: {((wallet.ecashBalance / totalBalance) * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* Protocol Usage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center space-x-2 mb-2">
            <Zap className="h-5 w-5 text-orange-600" />
            <span className="font-medium text-gray-900">Lightning Activity</span>
          </div>
          <p className="text-xl font-bold text-orange-900">
            {wallet.lightningTransactions?.length || 0}
          </p>
          <p className="text-sm text-gray-600">Recent transactions</p>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center space-x-2 mb-2">
            <Gift className="h-5 w-5 text-blue-600" />
            <span className="font-medium text-gray-900">Bearer Notes</span>
          </div>
          <p className="text-xl font-bold text-blue-900">
            {wallet.bearerInstruments?.length || 0}
          </p>
          <p className="text-sm text-gray-600">Created & active</p>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center space-x-2 mb-2">
            <Activity className="h-5 w-5 text-purple-600" />
            <span className="font-medium text-gray-900">Zaps Sent</span>
          </div>
          <p className="text-xl font-bold text-purple-900">
            {wallet.zapHistory?.length || 0}
          </p>
          <p className="text-sm text-gray-600">Nostr interactions</p>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {recentActivity.map((activity, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-full ${activity.protocol === 'lightning' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                  {activity.protocol === 'lightning' ?
                    <Zap className="h-4 w-4" /> :
                    <Shield className="h-4 w-4" />
                  }
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {activity.type} • {activity.protocol}
                  </p>
                  <p className="text-sm text-gray-500">{activity.memo || 'No description'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">
                  {activity.amount.toLocaleString()} sats
                </p>
                <p className="text-sm text-gray-500">
                  {new Date(activity.timestamp).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Cross-Mint Overview Tab
const CrossMintOverviewTab: React.FC<{ wallet: CrossMintIndividualWallet }> = ({ wallet }) => {
  const totalBalance = wallet.lightningBalance + wallet.ecashBalance;
  const totalExternalBalance = Array.from(wallet.externalMintBalances?.values() || [])
    .reduce((sum, balance) => sum + balance, 0);
  const grandTotalBalance = totalBalance + totalExternalBalance;

  const recentActivity = [
    ...(wallet.lightningTransactions || []).map(tx => ({ ...tx, protocol: 'lightning' })),
    ...(wallet.cashuTransactions || []).map(tx => ({ ...tx, protocol: 'cashu' })),
    ...(wallet.multiNutPayments || []).map(payment => ({
      id: payment.id,
      type: 'multi-nut',
      amount: payment.totalAmount,
      timestamp: payment.created,
      status: payment.status,
      protocol: 'cross-mint',
      memo: `Multi-nut payment across ${payment.mintSources.length} mints`
    }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Total Balance Overview with Cross-Mint */}
      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
        <div className="flex items-center space-x-2 mb-4">
          <Wallet className="h-6 w-6 text-green-600" />
          <h3 className="text-lg font-semibold text-green-900">Total Cross-Mint Balance</h3>
        </div>
        <p className="text-3xl font-bold text-green-900 mb-2">
          {grandTotalBalance.toLocaleString()} sats
        </p>
        <div className="flex space-x-4 text-sm text-green-700">
          <span>Lightning: {((wallet.lightningBalance / grandTotalBalance) * 100).toFixed(1)}%</span>
          <span>Satnam Cashu: {((wallet.ecashBalance / grandTotalBalance) * 100).toFixed(1)}%</span>
          <span>External Mints: {((totalExternalBalance / grandTotalBalance) * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* Cross-Mint Protocol Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center space-x-2 mb-2">
            <Zap className="h-5 w-5 text-orange-600" />
            <span className="font-medium text-gray-900">Lightning</span>
          </div>
          <p className="text-xl font-bold text-orange-900">
            {wallet.lightningTransactions?.length || 0}
          </p>
          <p className="text-sm text-gray-600">Transactions</p>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center space-x-2 mb-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <span className="font-medium text-gray-900">Satnam Cashu</span>
          </div>
          <p className="text-xl font-bold text-blue-900">
            {wallet.bearerInstruments?.length || 0}
          </p>
          <p className="text-sm text-gray-600">Bearer notes</p>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center space-x-2 mb-2">
            <Globe className="h-5 w-5 text-purple-600" />
            <span className="font-medium text-gray-900">External Mints</span>
          </div>
          <p className="text-xl font-bold text-purple-900">
            {wallet.externalMintBalances?.size || 0}
          </p>
          <p className="text-sm text-gray-600">Active mints</p>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center space-x-2 mb-2">
            <Activity className="h-5 w-5 text-green-600" />
            <span className="font-medium text-gray-900">Multi-Nut</span>
          </div>
          <p className="text-xl font-bold text-green-900">
            {wallet.multiNutPayments?.length || 0}
          </p>
          <p className="text-sm text-gray-600">Cross-mint payments</p>
        </div>
      </div>

      {/* Recent Cross-Mint Activity */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Cross-Mint Activity</h3>
        <div className="space-y-3">
          {recentActivity.map((activity, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-full ${activity.protocol === 'lightning' ? 'bg-orange-100 text-orange-600' :
                  activity.protocol === 'cashu' ? 'bg-blue-100 text-blue-600' :
                    'bg-purple-100 text-purple-600'
                  }`}>
                  {activity.protocol === 'lightning' ? <Zap className="h-4 w-4" /> :
                    activity.protocol === 'cashu' ? <Shield className="h-4 w-4" /> :
                      <Globe className="h-4 w-4" />}
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {activity.type} • {activity.protocol}
                  </p>
                  <p className="text-sm text-gray-500">{activity.memo || 'No description'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">
                  {activity.amount.toLocaleString()} sats
                </p>
                <p className="text-sm text-gray-500">
                  {new Date(activity.timestamp).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Enhanced Lightning Tab Component
const LightningTab: React.FC<{ wallet: EnhancedIndividualWallet }> = ({ wallet }) => {
  const [zapAmount, setZapAmount] = useState('');
  const [zapRecipient, setZapRecipient] = useState('');
  const [zapMemo, setZapMemo] = useState('');

  const handleSendZap = async () => {
    if (!zapAmount || !zapRecipient) return;
    try {
      const result = await IndividualApiService.sendLightningZap({
        memberId: wallet.memberId,
        amount: parseInt(zapAmount),
        recipient: zapRecipient,
        memo: zapMemo
      });
      if (result.success) {
        setZapAmount('');
        setZapRecipient('');
        setZapMemo('');
        // Refresh wallet data
      }
    } catch (error) {
      console.error('Zap failed:', handleApiError(error));
    }
  };

  return (
    <div className="lightning-tab space-y-6">
      {/* Lightning Address Display */}
      <div className="bg-orange-50 rounded-xl p-6 border border-orange-200">
        <h3 className="text-lg font-semibold text-orange-900 mb-4">
          Your Lightning Address
        </h3>
        <div className="flex items-center space-x-3">
          <code className="flex-1 bg-white px-4 py-3 rounded-lg border border-orange-300 font-mono text-orange-800">
            {wallet.lightningAddress}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(wallet.lightningAddress)}
            className="bg-orange-500 text-white px-4 py-3 rounded-lg hover:bg-orange-600 transition-colors flex items-center space-x-2"
          >
            <Copy className="h-4 w-4" />
            <span>Copy</span>
          </button>
        </div>
      </div>

      {/* Nostr Zapping Interface */}
      <div className="bg-yellow-50 rounded-xl p-6 border border-yellow-200">
        <h3 className="text-lg font-semibold text-yellow-900 mb-4">
          Send Nostr Zap
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            value={zapRecipient}
            onChange={(e) => setZapRecipient(e.target.value)}
            placeholder="npub or Lightning Address"
            className="p-3 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
          />
          <div className="flex space-x-2">
            <input
              type="number"
              value={zapAmount}
              onChange={(e) => setZapAmount(e.target.value)}
              placeholder="Amount (sats)"
              className="flex-1 p-3 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
            />
            <button
              onClick={handleSendZap}
              disabled={!zapAmount || !zapRecipient}
              className="bg-yellow-500 text-white px-6 py-3 rounded-lg hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ⚡ Zap
            </button>
          </div>
        </div>
        <input
          type="text"
          value={zapMemo}
          onChange={(e) => setZapMemo(e.target.value)}
          placeholder="Optional memo"
          className="w-full mt-3 p-3 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
        />
      </div>

      {/* Recent Zaps */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Zaps
        </h3>
        <div className="space-y-3">
          {(wallet.zapHistory || []).slice(0, 5).map(zap => (
            <div key={zap.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">{zap.amount.toLocaleString()} sats</div>
                <div className="text-sm text-gray-600">To: {zap.recipient.substring(0, 20)}...</div>
                {zap.memo && <div className="text-sm text-gray-500">"{zap.memo}"</div>}
              </div>
              <div className="text-right">
                <div className={`text-sm font-medium ${zap.status === 'completed' ? 'text-green-600' :
                  zap.status === 'failed' ? 'text-red-600' : 'text-yellow-600'
                  }`}>
                  {zap.status}
                </div>
                <div className="text-xs text-gray-500">
                  {zap.timestamp.toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lightning Actions */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Lightning Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 border-2 border-orange-200 rounded-xl hover:border-orange-300 transition-colors">
            <Send className="h-8 w-8 text-orange-600 mx-auto mb-2" />
            <h4 className="font-semibold text-gray-900 mb-1">Lightning Payment</h4>
            <p className="text-sm text-gray-600">Fast payments</p>
          </button>

          <button className="p-4 border-2 border-orange-200 rounded-xl hover:border-orange-300 transition-colors">
            <QrCode className="h-8 w-8 text-orange-600 mx-auto mb-2" />
            <h4 className="font-semibold text-gray-900 mb-1">Create Invoice</h4>
            <p className="text-sm text-gray-600">Receive payments</p>
          </button>

          <button className="p-4 border-2 border-orange-200 rounded-xl hover:border-orange-300 transition-colors">
            <Activity className="h-8 w-8 text-orange-600 mx-auto mb-2" />
            <h4 className="font-semibold text-gray-900 mb-1">Channel Status</h4>
            <p className="text-sm text-gray-600">View channels</p>
          </button>
        </div>
      </div>

      {/* Lightning Transactions */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Lightning Transactions</h3>
        <div className="space-y-3">
          {(wallet.lightningTransactions || []).map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-4 border border-gray-100 rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="p-2 rounded-full bg-orange-100 text-orange-600">
                  {tx.type === 'payment' ? <Send className="h-4 w-4" /> :
                    tx.type === 'invoice' ? <QrCode className="h-4 w-4" /> :
                      <Zap className="h-4 w-4" />}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{tx.type}</p>
                  <p className="text-sm text-gray-500">{tx.memo || 'No description'}</p>
                  <p className="text-xs text-gray-400 font-mono">
                    {tx.paymentHash.substring(0, 16)}...
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-orange-600">
                  {tx.amount.toLocaleString()} sats
                </p>
                <p className="text-xs text-gray-500">
                  Fee: {tx.fee} sats
                </p>
                <p className={`text-xs px-2 py-1 rounded-full ${tx.status === 'completed' ? 'bg-green-100 text-green-700' :
                  tx.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                  {tx.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Enhanced Cashu Tab Component
const CashuTab: React.FC<{ wallet: EnhancedIndividualWallet }> = ({ wallet }) => {
  const [bearerAmount, setBearerAmount] = useState('');
  const [bearerFormat, setBearerFormat] = useState<'qr' | 'nfc' | 'dm'>('qr');
  const [recipientNpub, setRecipientNpub] = useState('');

  const handleCreateBearerNote = async () => {
    if (!bearerAmount) return;
    try {
      const result = await IndividualApiService.createBearerNote({
        memberId: wallet.memberId,
        amount: parseInt(bearerAmount),
        formFactor: bearerFormat,
        recipientNpub: bearerFormat === 'dm' ? recipientNpub : undefined
      });
      if (result.success) {
        setBearerAmount('');
        setRecipientNpub('');
        // Refresh wallet data
      }
    } catch (error) {
      console.error('Bearer note creation failed:', error);
    }
  };

  return (
    <div className="cashu-tab space-y-6">
      {/* Cashu Balance Display */}
      <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">
          Cashu Wallet Balance
        </h3>
        <div className="text-3xl font-bold text-blue-700 mb-2">
          {wallet.ecashBalance.toLocaleString()} sats
        </div>
        <div className="text-sm text-blue-600">
          🔒 Private • Offline Capable • Bearer Instruments
        </div>
      </div>

      {/* Bearer Instrument Creator */}
      <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-200">
        <h3 className="text-lg font-semibold text-indigo-900 mb-4">
          Create Bearer Instrument
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input
              type="number"
              value={bearerAmount}
              onChange={(e) => setBearerAmount(e.target.value)}
              placeholder="Amount (sats)"
              className="p-3 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <select
              value={bearerFormat}
              onChange={(e) => setBearerFormat(e.target.value as any)}
              className="p-3 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="qr">QR Code (Printable)</option>
              <option value="nfc">NFC Tag (Physical)</option>
              <option value="dm">Gift Wrapped DM</option>
            </select>
          </div>
          {bearerFormat === 'dm' && (
            <input
              type="text"
              value={recipientNpub}
              onChange={(e) => setRecipientNpub(e.target.value)}
              placeholder="Recipient npub for Gift Wrapped DM"
              className="w-full p-3 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          )}
          <button
            onClick={handleCreateBearerNote}
            disabled={!bearerAmount || (bearerFormat === 'dm' && !recipientNpub)}
            className="w-full bg-indigo-500 text-white py-3 px-4 rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Create Bearer Instrument
          </button>
        </div>
      </div>

      {/* Active Bearer Instruments */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Your Bearer Instruments
        </h3>
        <div className="space-y-3">
          {(wallet.bearerInstruments || []).map(note => (
            <div key={note.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">{note.amount.toLocaleString()} sats</div>
                <div className="text-sm text-gray-600">
                  {note.formFactor.toUpperCase()} • Created {note.created.toLocaleDateString()}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-medium ${note.redeemed ? 'text-gray-500' : 'text-green-600'
                  }`}>
                  {note.redeemed ? 'Redeemed' : 'Active'}
                </div>
                {!note.redeemed && (
                  <button className="text-xs text-blue-600 hover:text-blue-800 transition-colors">
                    View Details
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Protocol Conversion */}
      <div className="bg-purple-50 rounded-xl p-6 border border-purple-200">
        <h3 className="text-lg font-semibold text-purple-900 mb-4">
          Protocol Conversion
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <button className="bg-purple-500 text-white py-3 px-4 rounded-lg hover:bg-purple-600 transition-colors">
            Lightning → Cashu
          </button>
          <button className="bg-purple-500 text-white py-3 px-4 rounded-lg hover:bg-purple-600 transition-colors">
            Cashu → Lightning
          </button>
        </div>
        <div className="mt-3 text-sm text-purple-700">
          Convert between protocols based on your privacy and usage needs
        </div>
      </div>

      {/* Cashu Transactions */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cashu Transactions</h3>
        <div className="space-y-3">
          {(wallet.cashuTransactions || []).map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-4 border border-gray-100 rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="p-2 rounded-full bg-blue-100 text-blue-600">
                  {tx.type === 'mint' ? <ArrowDownLeft className="h-4 w-4" /> :
                    tx.type === 'melt' ? <ArrowUpRight className="h-4 w-4" /> :
                      tx.type === 'send' ? <Send className="h-4 w-4" /> :
                        <Gift className="h-4 w-4" />}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{tx.type}</p>
                  <p className="text-sm text-gray-500">{tx.memo || 'No description'}</p>
                  <p className="text-xs text-gray-400 font-mono">
                    {tx.tokenId.substring(0, 16)}...
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-blue-600">
                  {tx.amount.toLocaleString()} sats
                </p>
                <p className="text-xs text-gray-500">
                  Fee: {tx.fee} sats
                </p>
                <p className={`text-xs px-2 py-1 rounded-full ${tx.status === 'completed' ? 'bg-green-100 text-green-700' :
                  tx.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                  {tx.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Cross-Mint Operations Tab
const CrossMintOperationsTab: React.FC<{ wallet: CrossMintIndividualWallet }> = ({ wallet }) => {
  const [multiNutAmount, setMultiNutAmount] = useState('');
  const [multiNutRecipient, setMultiNutRecipient] = useState('');
  const [multiNutMemo, setMultiNutMemo] = useState('');
  const [swapFromMint, setSwapFromMint] = useState('');
  const [swapToMint, setSwapToMint] = useState('');
  const [swapAmount, setSwapAmount] = useState('');
  const [externalToken, setExternalToken] = useState('');
  const [storagePreference, setStoragePreference] = useState<'satnam-mint' | 'keep-external' | 'auto'>('auto');

  const handleMultiNutPayment = async () => {
    if (!multiNutAmount || !multiNutRecipient) return;

    try {
      const response = await IndividualApiService.createMultiNutPayment({
        memberId: wallet.memberId,
        amount: parseInt(multiNutAmount),
        recipient: multiNutRecipient,
        memo: multiNutMemo,
        mintPreference: 'balanced' // Could be made configurable
      });

      if (response.success) {
        // Reset form
        setMultiNutAmount('');
        setMultiNutRecipient('');
        setMultiNutMemo('');

        // Refresh wallet data to show new payment
        // This would trigger a re-render with updated data
        console.log('Multi-nut payment successful:', response);
      }
    } catch (error) {
      console.error('Multi-nut payment failed:', handleApiError(error));
      // You could add user-facing error handling here
    }
  };

  const handleNutSwap = async () => {
    if (!swapFromMint || !swapToMint || !swapAmount) return;

    try {
      const response = await IndividualApiService.performNutSwap({
        memberId: wallet.memberId,
        fromMint: swapFromMint,
        toMint: swapToMint,
        amount: parseInt(swapAmount)
      });

      if (response.success) {
        // Reset form
        setSwapFromMint('');
        setSwapToMint('');
        setSwapAmount('');

        // Refresh wallet data to show new swap
        console.log('Nut swap successful:', response);
      }
    } catch (error) {
      console.error('Nut swap failed:', handleApiError(error));
      // You could add user-facing error handling here
    }
  };

  const handleReceiveExternalNuts = async () => {
    if (!externalToken) return;

    try {
      const response = await IndividualApiService.receiveExternalNuts({
        memberId: wallet.memberId,
        externalToken,
        storagePreference
      });

      if (response.success) {
        // Reset form
        setExternalToken('');
        setStoragePreference('auto');

        // Refresh wallet data to show received nuts
        console.log('External nuts received successfully:', response);
      }
    } catch (error) {
      console.error('External nuts reception failed:', handleApiError(error));
      // You could add user-facing error handling here
    }
  };

  return (
    <div className="space-y-6">
      {/* External Mint Balances */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">External Mint Balances</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from(wallet.externalMintBalances?.entries() || []).map(([mint, balance]) => (
            <div key={mint} className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-purple-900">
                  {mint.includes('satnam.pub') ? 'Satnam Family Mint' :
                    mint.includes('minibits.cash') ? 'Minibits Mint' :
                      mint.includes('coinos.io') ? 'Coinos Mint' :
                        'External Mint'}
                </h4>
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-xs text-green-600">Online</span>
                </div>
              </div>
              <p className="text-2xl font-bold text-purple-700 mb-1">
                {balance.toLocaleString()} sats
              </p>
              <p className="text-xs text-purple-600 font-mono truncate">
                {mint}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Multi-Nut Payment Interface */}
      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
        <h3 className="text-lg font-semibold text-green-900 mb-4">
          Multi-Nut Payment
        </h3>
        <p className="text-sm text-green-700 mb-4">
          Send payments using multiple mints automatically for optimal privacy and liquidity
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recipient</label>
            <input
              type="text"
              value={multiNutRecipient}
              onChange={(e) => setMultiNutRecipient(e.target.value)}
              placeholder="Lightning address or Cashu token"
              className="w-full px-3 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (sats)</label>
            <input
              type="number"
              value={multiNutAmount}
              onChange={(e) => setMultiNutAmount(e.target.value)}
              placeholder="10000"
              className="w-full px-3 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Memo (optional)</label>
          <input
            type="text"
            value={multiNutMemo}
            onChange={(e) => setMultiNutMemo(e.target.value)}
            placeholder="Payment description..."
            className="w-full px-3 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>

        <button
          onClick={handleMultiNutPayment}
          disabled={!multiNutAmount || !multiNutRecipient}
          className="w-full bg-green-500 text-white py-3 px-4 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
        >
          <Send className="h-4 w-4" />
          <span>Send Multi-Nut Payment</span>
        </button>
      </div>

      {/* Nut Swap Interface */}
      <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
        <h3 className="text-lg font-semibold text-purple-900 mb-4">
          Nut Swap Operations
        </h3>
        <p className="text-sm text-purple-700 mb-4">
          Swap tokens between different mints for better distribution and privacy
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Mint</label>
            <select
              value={swapFromMint}
              onChange={(e) => setSwapFromMint(e.target.value)}
              className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="">Select source mint</option>
              {Array.from(wallet.externalMintBalances?.keys() || []).map(mint => (
                <option key={mint} value={mint}>
                  {mint.includes('satnam.pub') ? 'Satnam Family' :
                    mint.includes('minibits.cash') ? 'Minibits' :
                      mint.includes('coinos.io') ? 'Coinos' : 'External'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Mint</label>
            <select
              value={swapToMint}
              onChange={(e) => setSwapToMint(e.target.value)}
              className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="">Select destination mint</option>
              {Array.from(wallet.externalMintBalances?.keys() || []).map(mint => (
                <option key={mint} value={mint} disabled={mint === swapFromMint}>
                  {mint.includes('satnam.pub') ? 'Satnam Family' :
                    mint.includes('minibits.cash') ? 'Minibits' :
                      mint.includes('coinos.io') ? 'Coinos' : 'External'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (sats)</label>
            <input
              type="number"
              value={swapAmount}
              onChange={(e) => setSwapAmount(e.target.value)}
              placeholder="5000"
              className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
        </div>

        <button
          onClick={handleNutSwap}
          disabled={!swapFromMint || !swapToMint || !swapAmount}
          className="w-full bg-purple-500 text-white py-3 px-4 rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Execute Nut Swap</span>
        </button>
      </div>

      {/* External Nuts Reception Interface */}
      <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-6 border border-indigo-200">
        <h3 className="text-lg font-semibold text-indigo-900 mb-4">
          Receive External Nuts
        </h3>
        <p className="text-sm text-indigo-700 mb-4">
          Import Cashu tokens from external mints and choose how to store them
        </p>

        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">External Token</label>
            <textarea
              value={externalToken}
              onChange={(e) => setExternalToken(e.target.value)}
              placeholder="Paste your Cashu token here..."
              rows={3}
              className="w-full px-3 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Storage Preference</label>
            <select
              value={storagePreference}
              onChange={(e) => setStoragePreference(e.target.value as 'satnam-mint' | 'keep-external' | 'auto')}
              className="w-full px-3 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="auto">Auto (Recommended)</option>
              <option value="satnam-mint">Move to Satnam Mint</option>
              <option value="keep-external">Keep in External Mint</option>
            </select>
            <p className="text-xs text-indigo-600 mt-1">
              Auto mode will optimize for privacy and liquidity
            </p>
          </div>
        </div>

        <button
          onClick={handleReceiveExternalNuts}
          disabled={!externalToken}
          className="w-full bg-indigo-500 text-white py-3 px-4 rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
        >
          <ArrowDownLeft className="h-4 w-4" />
          <span>Receive External Nuts</span>
        </button>
      </div>

      {/* Multi-Nut Payment History */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Multi-Nut Payment History</h3>
        <div className="space-y-3">
          {(wallet.multiNutPayments || []).map((payment) => (
            <div key={payment.id} className="flex items-center justify-between p-4 border border-gray-100 rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="p-2 rounded-full bg-green-100 text-green-600">
                  <Globe className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Multi-Nut Payment</p>
                  <p className="text-sm text-gray-500">
                    Used {payment.mintSources.length} mints
                  </p>
                  <p className="text-xs text-gray-400">
                    {payment.created.toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-green-600">
                  {payment.totalAmount.toLocaleString()} sats
                </p>
                <p className={`text-xs px-2 py-1 rounded-full ${payment.status === 'completed' ? 'bg-green-100 text-green-700' :
                  payment.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                  {payment.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Nut Swap History */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Nut Swap History</h3>
        <div className="space-y-3">
          {(wallet.nutSwapHistory || []).map((swap) => (
            <div key={swap.id} className="flex items-center justify-between p-4 border border-gray-100 rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="p-2 rounded-full bg-purple-100 text-purple-600">
                  <RefreshCw className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Nut Swap</p>
                  <p className="text-sm text-gray-500">
                    {swap.fromMint.includes('satnam.pub') ? 'Satnam' : 'External'} → {swap.toMint.includes('satnam.pub') ? 'Satnam' : 'External'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {swap.created.toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-purple-600">
                  {swap.amount.toLocaleString()} sats
                </p>
                <p className={`text-xs px-2 py-1 rounded-full ${swap.status === 'completed' ? 'bg-green-100 text-green-700' :
                  swap.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                  {swap.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Enhanced Privacy Tab
const EnhancedPrivacyTab: React.FC<{ wallet: EnhancedIndividualWallet }> = ({ wallet }) => {
  const [routingRules, setRoutingRules] = useState(wallet.routingRules);
  const [privacySettings, setPrivacySettings] = useState(wallet.privacySettings);

  const handleRoutingChange = (key: keyof typeof routingRules, value: string) => {
    setRoutingRules(prev => ({ ...prev, [key]: value }));
  };

  const handlePrivacyChange = (key: keyof typeof privacySettings, value: boolean | string) => {
    setPrivacySettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Routing Rules */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Routing Rules</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nostr Zaps
            </label>
            <select
              value={routingRules.zaps}
              disabled
              className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50"
            >
              <option value="lightning">Lightning Network (Required)</option>
            </select>
            <p className="text-sm text-gray-500 mt-1">
              Zaps must use Lightning for Nostr compatibility
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              External Payments
            </label>
            <select
              value={routingRules.external}
              onChange={(e) => handleRoutingChange('external', e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="lightning">Lightning Network</option>
              <option value="cashu">Cashu eCash</option>
              <option value="auto">Auto-select</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Gift & Bearer Notes
            </label>
            <select
              value={routingRules.gifts}
              disabled
              className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50"
            >
              <option value="cashu">Cashu eCash (Recommended)</option>
            </select>
            <p className="text-sm text-gray-500 mt-1">
              Bearer instruments work best with Cashu
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Savings & Storage
            </label>
            <select
              value={routingRules.savings}
              onChange={(e) => handleRoutingChange('savings', e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="cashu">Cashu eCash (Offline)</option>
              <option value="lightning">Lightning Network</option>
            </select>
          </div>
        </div>
      </div>

      {/* Privacy Controls */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Privacy Controls</h3>
        <div className="space-y-4">
          {/* LNProxy Toggle */}
          <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900">LNProxy Privacy</h4>
              <p className="text-sm text-gray-600">Route Lightning payments through privacy proxies</p>
            </div>
            <button
              onClick={() => handlePrivacyChange('lnproxyEnabled', !privacySettings.lnproxyEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${privacySettings.lnproxyEnabled ? 'bg-orange-600' : 'bg-gray-200'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${privacySettings.lnproxyEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>

          {/* Guardian Protection Toggle */}
          <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900">Guardian Protection</h4>
              <p className="text-sm text-gray-600">Require guardian approval for large transactions</p>
            </div>
            <button
              onClick={() => handlePrivacyChange('guardianProtected', !privacySettings.guardianProtected)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${privacySettings.guardianProtected ? 'bg-purple-600' : 'bg-gray-200'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${privacySettings.guardianProtected ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>

          {/* Cashu Privacy Info */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <Shield className="h-5 w-5 text-blue-600" />
              <h4 className="font-medium text-gray-900">Cashu Privacy</h4>
            </div>
            <p className="text-sm text-gray-600">
              Cashu transactions are inherently private and don't require additional routing
            </p>
          </div>
        </div>
      </div>

      {/* Privacy Status Overview */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Privacy Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <Zap className="h-8 w-8 text-orange-600 mx-auto mb-2" />
            <p className="font-medium text-orange-900">Lightning</p>
            <p className="text-sm text-orange-600">
              {privacySettings.lnproxyEnabled ? 'Privacy routing active' : 'Direct routing'}
            </p>
          </div>

          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <Shield className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <p className="font-medium text-blue-900">Cashu</p>
            <p className="text-sm text-blue-600">Inherently private</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Enhanced Component
export function IndividualFinancesDashboard({ memberId, memberData, onBack }: IndividualFinancesDashboardProps) {
  const [wallet, setWallet] = useState<EnhancedIndividualWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'lightning' | 'cashu' | 'privacy'>('overview');
  const [showCascadeModal, setShowCascadeModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showEducationalDashboard, setShowEducationalDashboard] = useState(false);
  const [showSimplePaymentModal, setShowSimplePaymentModal] = useState(false);
  const [showAutomatedPaymentsModal, setShowAutomatedPaymentsModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Privacy-related state
  const [currentPrivacyLevel, setCurrentPrivacyLevel] = useState<PrivacyLevel>(PrivacyLevel.ENCRYPTED);
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
  const [securityTestOpen, setSecurityTestOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  // Auth context
  const { user, userRole, familyId } = useAuth();

  // Create family members array for PaymentCascadeModal using privacy-first principles
  const familyMembersForCascade = wallet ? [{
    id: user?.hashedUUID?.slice(0, 16) || memberId, // Use encrypted UUID per Master Context
    npub: '', // Never expose npub per Master Context privacy protocols
    name: memberData.username, // Required by FamilyMember interface
    username: memberData.username,
    role: memberData.role,
    lightningAddress: memberData.lightningAddress,
    balance: wallet.lightningBalance + wallet.ecashBalance,
    nip05Verified: true,
    spendingLimits: memberData.spendingLimits,
  }] : [];

  // Enhanced wallet loading with Lightning + Cashu data
  const loadEnhancedWallet = async () => {
    try {
      const [walletData, lightningData, cashuData] = await Promise.all([
        IndividualApiService.getWalletData(memberId),
        IndividualApiService.getLightningWalletData(memberId),
        IndividualApiService.getCashuWalletData(memberId)
      ]);

      const enhancedWallet: EnhancedIndividualWallet = {
        lightning_balance: walletData.lightningBalance || 0,
        cashu_balance: walletData.ecashBalance || 0,
        fedimint_balance: 0, // Default value since fedimintBalance doesn't exist in IndividualWalletData
        total_balance: (walletData.lightningBalance || 0) + (walletData.ecashBalance || 0),
        pending_transactions: 0, // Default value since pendingTransactions doesn't exist in IndividualWalletData
        privacy_score: 85,
        default_privacy_level: PrivacyLevel.ENCRYPTED,
        transactions_this_month: 23,
        privacy_routing_success: 92,
        lastUpdated: new Date(),

        // Required properties from EnhancedIndividualWallet
        zapHistory: lightningData.zapHistory || [],
        lightningTransactions: lightningData.transactions || [],
        bearerInstruments: cashuData.bearerInstruments || [],
        cashuTransactions: cashuData.transactions || [],
        routingRules: {
          zaps: 'lightning',
          external: 'auto',
          gifts: 'cashu',
          savings: 'cashu'
        },

        // Required properties from IndividualWallet base
        memberId: walletData.memberId || memberId,
        username: walletData.username || '',
        lightningAddress: walletData.lightningAddress || '',
        lightningBalance: walletData.lightningBalance || 0,
        ecashBalance: walletData.ecashBalance || 0,
        spendingLimits: walletData.spendingLimits,
        recentTransactions: (walletData.recentTransactions || []).map(tx => ({
          ...tx,
          from: tx.type === 'received' ? 'external' : memberId,
          to: tx.type === 'sent' ? 'external' : memberId,
          privacyRouted: true, // Default to privacy-routed per Master Context
          paymentMethod: 'lightning' as const
        })),
        privacySettings: walletData.privacySettings || {
          defaultRouting: 'lightning',
          lnproxyEnabled: false,
          guardianProtected: false
        }
      };

      setWallet(enhancedWallet);
    } catch (error) {
      console.error('Failed to load enhanced wallet:', handleApiError(error));
      // You could add user-facing error handling here
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEnhancedWallet();
    loadTransactionHistory();
  }, [memberId]);



  const handleCascadeSave = (cascade: PaymentCascadeNode[]) => {
    setShowCascadeModal(false);
    // Here you would integrate with the payment automation service
    console.log('Payment cascade configured:', cascade);
  };

  const handleEmergencyRecovery = () => {
    setShowRecoveryModal(true);
  };

  const handleCloseRecoveryModal = () => {
    setShowRecoveryModal(false);
  };

  // Privacy-related functions
  const handlePrivacyLevelChange = (newLevel: PrivacyLevel) => {
    setCurrentPrivacyLevel(newLevel);
    console.log('Privacy level changed to:', newLevel);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEnhancedWallet();
    setRefreshing(false);
  };

  const loadTransactionHistory = async () => {
    try {
      // Mock privacy-aware transaction history
      const mockTransactions: Transaction[] = [
        {
          id: 'tx1',
          type: 'sent',
          amount: 50000,
          from: memberId,
          to: 'merchant1',
          status: 'completed',
          timestamp: new Date(Date.now() - 1000 * 60 * 30),
          memo: 'Coffee payment',
          privacyRouted: true
        },
        {
          id: 'tx2',
          type: 'received',
          amount: 100000,
          from: 'family_treasury',
          to: memberId,
          status: 'completed',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
          memo: 'Weekly payment',
          privacyRouted: true
        }
      ];
      setTransactions(mockTransactions);
    } catch (error) {
      console.error('Failed to load transaction history:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
          <span className="text-gray-600">Loading enhanced wallet...</span>
        </div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">
          <CreditCard className="h-12 w-12 mx-auto mb-2" />
          <p className="text-lg font-semibold">Failed to load wallet data</p>
          <p className="text-sm text-gray-500">Please try refreshing the page</p>
        </div>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="enhanced-individual-finances-dashboard max-w-7xl mx-auto p-6">
      {/* Enhanced Header with Recovery Button */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Individual Finances
            </h1>
            <p className="text-gray-600 mb-4">
              Personal Lightning + Cashu wallet for {wallet?.username || memberData.username}
            </p>

            {/* Protocol Status Indicators */}
            <div className="flex space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                <span className="text-sm text-gray-600">Lightning Active</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-sm text-gray-600">Cashu Ready</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* Emergency Recovery Button */}
            <button
              onClick={handleEmergencyRecovery}
              className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm"
            >
              <Shield className="h-4 w-4" />
              <span className="text-sm font-medium">Emergency Recovery</span>
            </button>

            {onBack && (
              <button
                onClick={onBack}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Back to home"
              >
                <ArrowDownLeft className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={handleRefresh}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh wallet data"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Dual Protocol Balance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <LightningWalletCard wallet={wallet} />
        <CashuWalletCard wallet={wallet} />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button
            onClick={() => setShowSimplePaymentModal(true)}
            className="flex items-center justify-center space-x-2 bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            <Send className="h-5 w-5" />
            <span>Send Lightning Payment</span>
          </button>
          <button
            onClick={() => setShowCascadeModal(true)}
            className="flex items-center justify-center space-x-2 bg-green-500 hover:bg-green-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            <Split className="h-5 w-5" />
            <span>Setup Payment Cascade</span>
          </button>
          <button
            className="flex items-center justify-center space-x-2 bg-purple-500 hover:bg-purple-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            <QrCode className="h-5 w-5" />
            <span>Receive Payment</span>
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

      {/* Enhanced Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'overview', label: 'Overview', color: 'gray' },
            { key: 'lightning', label: 'Lightning & Zaps', color: 'orange' },
            { key: 'cashu', label: 'Cashu & Bearer Notes', color: 'blue' },
            { key: 'privacy', label: 'Privacy Controls', color: 'purple' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.key
                ? `border-${tab.color}-500 text-${tab.color}-600`
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Enhanced Tab Content */}
      {activeTab === 'overview' && <EnhancedOverviewTab wallet={wallet} />}
      {activeTab === 'lightning' && <LightningTab wallet={wallet} />}
      {activeTab === 'cashu' && <CashuTab wallet={wallet} />}
      {activeTab === 'privacy' && <EnhancedPrivacyTab wallet={wallet} />}

      {/* Payment Cascade Modal */}
      <PaymentCascadeModal
        isOpen={showCascadeModal}
        onClose={() => setShowCascadeModal(false)}
        onSave={handleCascadeSave}
        familyMembers={familyMembersForCascade}
        totalAmount={wallet?.lightningBalance || 0}
        defaultCurrency="sats"
        title="Individual Payment Cascade Setup"
      />

      {/* Emergency Recovery Modal - Privacy-First Implementation */}
      {showRecoveryModal && (
        <EmergencyRecoveryModal
          isOpen={showRecoveryModal}
          onClose={handleCloseRecoveryModal}
          userRole={(userRole as FederationRole) || 'private'} // Default to 'private' per Master Context
          userId={user?.hashedUUID?.slice(0, 16) || 'anon'} // Use encrypted UUID, never expose raw IDs
          userNpub={''} // Never expose npub per Master Context zero-knowledge protocols
          familyId={familyId || undefined} // Handle null properly
        />
      )}

      {/* Educational Dashboard Modal */}
      {showEducationalDashboard && (
        <EducationalDashboard
          userPubkey={memberData.auth_hash || 'demo_user_hash'}
          familyId={memberData.familyId}
          onClose={() => setShowEducationalDashboard(false)}
        />
      )}

      {/* Simple Payment Modal */}
      <SimplePaymentModal
        isOpen={showSimplePaymentModal}
        onClose={() => setShowSimplePaymentModal(false)}
        onOpenAutomatedPayments={() => {
          setShowSimplePaymentModal(false);
          setShowAutomatedPaymentsModal(true);
        }}
        wallet={wallet}
      />

      {/* Individual Payment Automation Modal - Privacy-First Implementation */}
      {showAutomatedPaymentsModal && (
        <IndividualPaymentAutomationModal
          isOpen={showAutomatedPaymentsModal}
          onClose={() => setShowAutomatedPaymentsModal(false)}
          onSave={(schedule) => {
            // Handle payment automation schedule per Master Context protocols
            console.log('Privacy-first payment schedule saved with encrypted identifiers');
            setShowAutomatedPaymentsModal(false);
          }}
          userId={user?.hashedUUID?.slice(0, 16) || 'anon'} // Use encrypted UUID per Master Context
        />
      )}

      {/* Privacy-Enhanced Payment Modal */}
      <PrivacyEnhancedPaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        familyMembers={[memberData]}
        selectedMember={memberId}
        onSelectedMemberChange={() => { }}
        onPaymentComplete={() => {
          setPaymentModalOpen(false);
          handleRefresh();
        }}
      />

      {/* Privacy Preferences Modal */}
      <PrivacyPreferencesModal
        isOpen={preferencesModalOpen}
        onClose={() => setPreferencesModalOpen(false)}
        userRole={memberData.role}
        onPreferencesUpdate={(preferences) => {
          console.log('Preferences updated:', preferences);
          handleRefresh();
        }}
      />

      {/* Argon2 Security Test Modal */}
      {securityTestOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Security Test</h2>
              <button
                onClick={() => setSecurityTestOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <Argon2SecurityTest />
          </div>
        </div>
      )}
    </div>
  );
}

// Cross-Mint Individual Dashboard Component
export function CrossMintIndividualDashboard({ memberId, memberData }: IndividualFinancesDashboardProps) {
  const [wallet, setWallet] = useState<CrossMintIndividualWallet | null>(null);
  const [crossMintManager] = useState(new SatnamCrossMintCashuManager());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'lightning' | 'cashu' | 'cross-mint' | 'privacy'>('overview');
  const [showSimplePaymentModal, setShowSimplePaymentModal] = useState(false);

  // Auth context
  const { user, userRole, familyId } = useAuth();

  // Create individual member for PaymentModal (representing self)
  const individualMember = wallet ? [{
    id: memberId,
    auth_hash: memberData.auth_hash || '', // Privacy-first authentication hash
    encrypted_profile: memberData.encrypted_profile,
    lightningAddress: memberData.lightningAddress,
    role: memberData.role,
    familyId: memberData.familyId,
    is_discoverable: memberData.is_discoverable || false,
    balance: wallet.lightningBalance + wallet.ecashBalance,
    spendingLimits: memberData.spendingLimits,
    avatar: memberData.avatar,
    created_at: memberData.created_at || Date.now(),
    last_login: memberData.last_login,
  }] : [];

  // Enhanced wallet loading with Cross-Mint data
  const loadCrossMintWallet = async () => {
    try {
      const [walletData, lightningData, cashuData, crossMintData] = await Promise.all([
        IndividualApiService.getWalletData(memberId),
        IndividualApiService.getLightningWalletData(memberId),
        IndividualApiService.getCashuWalletData(memberId),
        IndividualApiService.getCrossMintWalletData(memberId)
      ]);

      // Load cross-mint manager settings
      await crossMintManager.refreshAllMintData();
      const crossMintSettings = crossMintManager.getCrossMintSettings();

      // Convert external mint balances from Record to Map
      const externalMintBalances = new Map(Object.entries(crossMintData.externalMintBalances));

      const crossMintWallet: CrossMintIndividualWallet = {
        // Base IndividualWallet properties
        memberId: walletData.memberId || memberId,
        username: walletData.username || '',
        lightningAddress: walletData.lightningAddress || '',
        lightningBalance: walletData.lightningBalance || 0,
        ecashBalance: walletData.ecashBalance || 0,
        spendingLimits: walletData.spendingLimits,
        recentTransactions: (walletData.recentTransactions || []).map(tx => ({
          ...tx,
          from: tx.type === 'received' ? 'external' : memberId,
          to: tx.type === 'sent' ? 'external' : memberId,
          privacyRouted: true,
          paymentMethod: 'lightning' as const
        })),
        privacySettings: walletData.privacySettings || {
          defaultRouting: 'lightning',
          lnproxyEnabled: false,
          guardianProtected: false
        },

        // EnhancedIndividualWallet properties
        lightning_balance: walletData.lightningBalance || 0,
        cashu_balance: walletData.ecashBalance || 0,
        fedimint_balance: 0,
        total_balance: (walletData.lightningBalance || 0) + (walletData.ecashBalance || 0),
        pending_transactions: 0,
        privacy_score: 88,
        default_privacy_level: PrivacyLevel.GIFTWRAPPED,
        transactions_this_month: 18,
        privacy_routing_success: 94,
        lastUpdated: new Date(),

        // Lightning-specific properties
        zapHistory: [],
        lightningTransactions: [],

        // Cashu-specific properties
        bearerInstruments: [],
        cashuTransactions: [],

        // Enhanced routing preferences
        routingRules: {
          zaps: 'lightning' as const,
          external: 'lightning' as const,
          gifts: 'cashu' as const,
          savings: 'cashu' as const
        },

        // CrossMintIndividualWallet properties
        cross_mint_balance: 0,
        externalMintBalances,
        supportedMints: crossMintData.supportedMints || [],
        cross_mint_tokens: [],
        multiNutPayments: (crossMintData.multiNutPayments || []).map(payment => ({
          ...payment,
          created: new Date(payment.created)
        })),
        multi_nut_transactions: (crossMintData.multiNutPayments || []).map(payment => ({
          ...payment,
          created: new Date(payment.created)
        })),
        nutSwapHistory: (crossMintData.nutSwapHistory || []).map(swap => ({
          ...swap,
          swapId: swap.id,
          created: new Date(swap.created)
        })),
        pending_swaps: (crossMintData.nutSwapHistory || []).map(swap => ({
          ...swap,
          swapId: swap.id,
          created: new Date(swap.created)
        })),
        crossMintSettings: crossMintSettings,
        cross_mint_settings: crossMintSettings
      };

      setWallet(crossMintWallet);
    } catch (error) {
      console.error('Failed to load cross-mint wallet:', handleApiError(error));
      // You could add user-facing error handling here
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCrossMintWallet();
  }, [memberId]);

  const handleRefresh = () => {
    setLoading(true);
    loadCrossMintWallet();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
          <span className="text-gray-600">Loading cross-mint wallet...</span>
        </div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">
          <CreditCard className="h-12 w-12 mx-auto mb-2" />
          <p className="text-lg font-semibold">Failed to load wallet data</p>
          <p className="text-sm text-gray-500">Please try refreshing the page</p>
        </div>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="cross-mint-individual-finances-dashboard max-w-7xl mx-auto p-6">
      {/* Enhanced Header with Cross-Mint Display */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Cross-Mint Individual Finances
            </h1>
            <p className="text-gray-600 mb-4">
              Multi-mint Lightning + Cashu wallet for {wallet.username}
            </p>

            {/* Protocol Status Indicators */}
            <div className="flex space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                <span className="text-sm text-gray-600">Lightning Active</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-sm text-gray-600">Satnam Cashu Ready</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                <span className="text-sm text-gray-600">Cross-Mint Enabled</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh wallet data"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Balance Overview with Credits */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <CashuWalletCard wallet={wallet} />
        <ExternalMintsCard wallet={wallet} />
        <CreditsBalance variant="individual" />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button
            onClick={() => setShowSimplePaymentModal(true)}
            className="flex items-center justify-center space-x-2 bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            <Send className="h-5 w-5" />
            <span>Send Lightning Payment</span>
          </button>
          <button
            className="flex items-center justify-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            <Gift className="h-5 w-5" />
            <span>Create Bearer Note</span>
          </button>
          <button
            className="flex items-center justify-center space-x-2 bg-purple-500 hover:bg-purple-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            <Globe className="h-5 w-5" />
            <span>Cross-Mint Transfer</span>
          </button>
          <button
            className="flex items-center justify-center space-x-2 bg-green-500 hover:bg-green-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            <QrCode className="h-5 w-5" />
            <span>Receive Payment</span>
          </button>
        </div>
      </div>

      {/* Enhanced Navigation with Cross-Mint Tab */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'overview', label: 'Cross-Mint Overview', color: 'gray' },
            { key: 'lightning', label: 'Lightning & Zaps', color: 'orange' },
            { key: 'cashu', label: 'Cashu & Bearer Notes', color: 'blue' },
            { key: 'cross-mint', label: 'Cross-Mint Operations', color: 'purple' },
            { key: 'privacy', label: 'Privacy Controls', color: 'green' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.key
                ? `border-${tab.color}-500 text-${tab.color}-600`
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Enhanced Tab Content with Cross-Mint */}
      {activeTab === 'overview' && <CrossMintOverviewTab wallet={wallet} />}
      {activeTab === 'lightning' && <LightningTab wallet={wallet} />}
      {activeTab === 'cashu' && <CashuTab wallet={wallet} />}
      {activeTab === 'cross-mint' && <CrossMintOperationsTab wallet={wallet} />}
      {activeTab === 'privacy' && <EnhancedPrivacyTab wallet={wallet} />}
    </div>
  );
}

export default IndividualFinancesDashboard;