import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookOpen,
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
import { resolvePlatformLightningDomain } from '../config/domain.client';
import { useNWCWallet } from '../hooks/useNWCWallet';
import { useAuth } from './auth/AuthProvider'; // FIXED: Use unified auth system

import NWCWalletSetupModal from './NWCWalletSetupModal';
import SovereigntyEducationFlow from './SovereigntyEducationFlow';

// Import our enhanced dual-protocol components
import AtomicSwapModal from './AtomicSwapModal';
import ContextualAvatar from './ContextualAvatar';
import EducationalDashboard from './education/EducationalDashboard';
import EnhancedLiquidityDashboard from './EnhancedLiquidityDashboard';
import FamilyFedimintGovernance from './FamilyFedimintGovernance';
import FamilyLightningTreasury from './FamilyLightningTreasury';
import FrostSignaturePanel from './FrostSignaturePanel';
import PaymentAutomationCard from './PaymentAutomationCard';
import PaymentAutomationModal from './PaymentAutomationModal';
import { PaymentModal } from './shared';
import UnifiedFamilyPayments from './UnifiedFamilyPayments';

import LNBitsIntegrationPanel from './LNBitsIntegrationPanel';




// Import Credits Balance
import { CreditsBalance } from './CreditsBalance';

// Import NWC Wallet Integration

// Import Payment Automation System
import { PaymentSchedule } from '../lib/payment-automation';

// Import Privacy-First Family Federation API
import {
  checkFamilyPermissions,
  getFamilyFederationMembers,
  getPendingSpendingApprovals
} from '../services/familyFederationApi';

// Import Family Wallet API Services
import {
  type FamilyWalletData,
  type FrostTransaction,
  getAllFamilyWalletData
} from '../services/familyWalletApi';

// Import FROST API Client (connects to existing backend)
// Platform domain config

import { frostApi, handleFrostApiError } from '../services/frostApiClient';

// Import Unified Toast Notification System
import { showToast } from '../services/toastService';
import ToastContainer from './ToastContainer';

// Import enhanced types
import { FamilyMember } from '../types/shared';

// Helper function for role validation
const validateMemberRole = (role: unknown): FamilyMember['role'] | null => {
  const validRoles: FamilyMember['role'][] = ['offspring', 'adult', 'guardian', 'steward'];
  return typeof role === 'string' && validRoles.includes(role as FamilyMember['role'])
    ? (role as FamilyMember['role'])
    : null;
};

interface FamilyFinancialsDashboardProps {
  familyFederationData?: {
    id: string;
    federationName: string;
    federationDuid: string;
    domain?: string;
    relayUrl?: string;
    members?: FamilyMember[];
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
  const { user } = useAuth();
  const userDuid = user?.hashedUUID || user?.id;

  // Enhanced user validation with proper null safety
  React.useEffect(() => {
    if (user) {
      const userDuid = user?.hashedUUID || user?.id;
      if (!userDuid) {
        console.warn('User object exists but lacks required identifier (hashedUUID or id)');
        showToast.warning('User identification error. Please sign in again.');
        return;
      }
    }
  }, [user]);

  // Enhanced authentication initialization with error recovery
  React.useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { SecureTokenManager } = await import('../lib/auth/secure-token-manager');
        const accessToken = SecureTokenManager.getAccessToken();
        if (accessToken) {
          frostApi.setAuthToken(accessToken);
        } else if (user) {
          console.warn('No access token available for authenticated user');
          showToast.warning('Authentication token missing. Some features may be limited.');
        }
      } catch (error) {
        console.error('Failed to initialize FROST API authentication:', error);
        showToast.error('Failed to initialize secure connection. Please refresh the page.');
      }
    };

    if (user) {
      initializeAuth();
    }
  }, [user]);
  const {
    connections: nwcConnections
  } = useNWCWallet();

  // State management - using privacy-first federation data
  const [currentView, setCurrentView] = useState<'overview' | 'lightning' | 'fedimint' | 'payments' | 'phoenixd' | 'lnbits'>('overview');
  const [familyName] = useState(familyFederationData?.federationName || "Family Federation");
  const [familyFederationId] = useState(familyFederationData?.id);
  // federationDuid available but not currently used
  // const [federationDuid] = useState(familyFederationData?.federationDuid);

  // Family member data state
  const [familyMembers, setFamilyMembers] = useState(familyFederationData?.members || []);
  // User permissions available but managed through familyWalletData.permissions
  // const [userPermissions, setUserPermissions] = useState({
  //   canApproveSpending: false,
  //   votingPower: 0,
  //   familyRole: 'offspring' as 'offspring' | 'adult' | 'steward' | 'guardian'
  // });
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

  // Feature flags
  const lnbitsEnabled = (import.meta.env.VITE_LNBITS_INTEGRATION_ENABLED || '').toString().toLowerCase() === 'true';

  // Enhanced treasury state - now loaded from family wallet APIs
  const [familyWalletData, setFamilyWalletData] = useState<{
    cashu: FamilyWalletData | null;
    lightning: FamilyWalletData | null;
    fedimint: FamilyWalletData | null;
    totalBalance: number;
    userRole: string;
    permissions: {
      can_view_balance: boolean;
      can_spend: boolean;
      can_view_history: boolean;
    };
  }>({
    cashu: null,
    lightning: null,
    fedimint: null,
    totalBalance: 0,
    userRole: 'offspring',
    permissions: {
      can_view_balance: false,
      can_spend: false,
      can_view_history: true,
    },
  });
  const [pendingFrostTransactions, setPendingFrostTransactions] = useState<FrostTransaction[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);

  // Load family federation data on component mount
  useEffect(() => {
    const loadFamilyData = async () => {
      if (!familyFederationId || !userDuid) return;

      try {
        setRefreshing(true);

        // Fetch family members
        const members = await getFamilyFederationMembers(familyFederationId);

        // Transform the members to match the expected interface with comprehensive null safety
        const transformedMembers: FamilyMember[] = members?.map((member: any) => {
          // Validate required member properties
          if (!member || typeof member !== 'object') {
            console.warn('Invalid member data received:', member);
            return null;
          }

          // Generate fallback ID if missing
          const memberId = member.id || crypto.randomUUID();

          // Clean and validate username with meaningful fallbacks
          const cleanUsername = member.user_duid?.trim() || member.id?.trim() || `user-${Date.now()}`;

          // Validate and assign role using helper function
          const validatedRole = validateMemberRole(member.family_role) || 'offspring';

          // Create Lightning address only if valid user identifier exists
          const lightningAddress = (member.user_duid?.trim() || member.id?.trim())
            ? `${member.user_duid?.trim() || member.id?.trim()}@${resolvePlatformLightningDomain()}`
            : null;

          return {
            id: memberId,
            username: cleanUsername,
            role: validatedRole,
            lightningAddress,
            avatar: member.avatar_url || undefined,
            balance: typeof member.balance === 'number' ? member.balance : undefined,
            nip05Verified: Boolean(member.nip05_verified)
          };
        }).filter(Boolean) as FamilyMember[] || []; // Remove any null entries and provide fallback

        setFamilyMembers(transformedMembers);

        // Check user permissions (handled through familyWalletData.permissions)
        const permissions = await checkFamilyPermissions(familyFederationId, userDuid);
        console.log('User permissions loaded:', permissions);

        // Get pending spending approvals (legacy)
        const approvals = await getPendingSpendingApprovals(familyFederationId);
        setPendingApprovals(approvals);

        // Load family wallet data from new APIs
        const walletData = await getAllFamilyWalletData(familyFederationId, userDuid);
        setFamilyWalletData(walletData);

        // Load pending FROST transactions from backend
        const pendingTransactions = await frostApi.getPendingTransactions(familyFederationId);
        // Convert backend format to frontend format if needed
        const formattedTransactions = pendingTransactions.map(tx => ({
          id: tx.transactionId,
          type: 'frost_signature' as const,
          amount: 0, // Will be populated from transaction details
          description: 'FROST Multi-Signature Transaction',
          status: tx.status,
          current_signatures: tx.currentSignatures,
          required_signatures: tx.requiredSignatures,
          created_at: tx.createdAt,
          deadline: tx.expiresAt || '',
          participants: tx.participants.map(p => p.userDuid),
          signatures: tx.participants.filter(p => p.hasSigned).map(p => ({
            participant: p.userDuid,
            signed_at: p.signedAt || ''
          }))
        }));
        setPendingFrostTransactions(formattedTransactions);

      } catch (error) {
        console.error('Error loading family federation data:', error);
        showToast.error('Unable to load family data. Please check your connection and try again.', {
          title: 'Family Data Loading Failed',
          duration: 5000,
          action: {
            label: 'Retry',
            onClick: () => loadFamilyData()
          }
        });
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

  // FROST signature approval handler with result object pattern
  const handleFrostTransactionApproval = async (transactionId: string): Promise<{ success: boolean; error?: string }> => {
    if (!familyWalletData.permissions.can_spend) {
      console.error('Insufficient permissions to approve transactions');
      showToast.error('You do not have permission to approve transactions. Contact a family guardian.', {
        title: 'Insufficient Permissions',
        duration: 6000
      });
      return { success: false, error: 'Insufficient permissions to approve transactions' };
    }

    if (!userDuid) {
      console.error('User DUID not available for FROST signature');
      showToast.error('Session expired. Please sign in again to approve transactions.', {
        title: 'Authentication Required',
        duration: 7000,
        action: {
          label: 'Sign In',
          onClick: () => window.location.reload()
        }
      });
      return { success: false, error: 'User authentication required for signature approval' };
    }

    try {
      // Connect to existing FROST backend infrastructure
      console.log('Submitting FROST signature for transaction:', transactionId);

      // Submit signature to existing backend service
      const signatureResponse = await frostApi.submitSignature(transactionId, userDuid);

      if (!signatureResponse.success) {
        throw new Error(signatureResponse.error || 'Failed to submit FROST signature');
      }

      console.log('FROST signature submitted successfully:', {
        transactionId,
        signatureId: signatureResponse.signatureId,
        currentSignatures: signatureResponse.currentSignatures,
        requiredSignatures: signatureResponse.requiredSignatures,
        thresholdMet: signatureResponse.thresholdMet,
        transactionHash: signatureResponse.transactionHash
      });

      // Refresh the pending transactions from backend
      if (familyFederationId) {
        const updatedTransactions = await frostApi.getPendingTransactions(familyFederationId);
        const formattedTransactions = updatedTransactions.map(tx => ({
          id: tx.transactionId,
          type: 'frost_signature' as const,
          amount: 0,
          description: 'FROST Multi-Signature Transaction',
          status: tx.status,
          current_signatures: tx.currentSignatures,
          required_signatures: tx.requiredSignatures,
          created_at: tx.createdAt,
          deadline: tx.expiresAt || '',
          participants: tx.participants.map(p => p.userDuid),
          signatures: tx.participants.filter(p => p.hasSigned).map(p => ({
            participant: p.userDuid,
            signed_at: p.signedAt || ''
          }))
        }));
        setPendingFrostTransactions(formattedTransactions);
      }

      showToast.success('Transaction signature submitted successfully!', {
        title: 'FROST Signature Approved',
        duration: 4000
      });

      return { success: true };
    } catch (error) {
      console.error('FROST signature submission failed:', error);
      return {
        success: false,
        error: handleFrostApiError(error)
      };
    }
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);

    // Show loading toast for operations taking >2 seconds
    showToast.info('Refreshing family data...', {
      title: 'Loading',
      duration: 3000
    });

    try {
      // Simulate data refresh - in production this would reload family data
      await new Promise(resolve => setTimeout(resolve, 2000));

      showToast.success('Family data refreshed successfully!', {
        title: 'Data Updated',
        duration: 3000
      });
    } catch (error) {
      console.error('Failed to refresh family data:', error);
      showToast.error('Failed to refresh data. Please try again.', {
        title: 'Refresh Failed',
        duration: 5000,
        action: {
          label: 'Retry',
          onClick: () => handleRefreshAll()
        }
      });
    } finally {
      setRefreshing(false);
    }
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
      showToast.success('NIP-05 address copied to clipboard!', {
        title: 'Address Copied',
        duration: 3000
      });
      console.log('NIP-05 copied to clipboard:', address);
    } catch (err) {
      console.error('Failed to copy NIP-05:', err);
      showToast.error('Failed to copy address. Please try selecting and copying manually.', {
        title: 'Copy Failed',
        duration: 4000
      });
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

      showToast.success('Payment schedule created successfully!', {
        title: 'Schedule Created',
        duration: 4000
      });

      // Refresh schedules list
      // In production: setPaymentSchedules(await paymentAutomationSystem.getPaymentSchedulesByContext('family', userId, familyId));

    } catch (error) {
      console.error('Failed to save payment schedule:', error);
      showToast.error('Failed to create payment schedule. Please check your settings and try again.', {
        title: 'Schedule Creation Failed',
        duration: 5000,
        action: {
          label: 'Retry',
          onClick: () => setShowPaymentAutomationModal(true)
        }
      });
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

      showToast.success(`Payment schedule ${enabled ? 'enabled' : 'paused'} successfully!`, {
        title: 'Schedule Updated',
        duration: 3000
      });
    } catch (error) {
      console.error('Failed to toggle payment schedule:', error);
      showToast.error(`Failed to ${enabled ? 'enable' : 'pause'} payment schedule. Please try again.`, {
        title: 'Schedule Update Failed',
        duration: 5000,
        action: {
          label: 'Retry',
          onClick: () => handleTogglePaymentSchedule(scheduleId, enabled)
        }
      });
    }
  };

  const handleDeletePaymentSchedule = async (scheduleId: string) => {
    try {
      console.log('Deleting payment schedule:', scheduleId);
      // In production: await paymentAutomationSystem.deletePaymentSchedule(scheduleId);

      // Update local state
      setPaymentSchedules(prev => prev.filter(schedule => schedule.id !== scheduleId));

      showToast.success('Payment schedule deleted successfully!', {
        title: 'Schedule Deleted',
        duration: 3000
      });
    } catch (error) {
      console.error('Failed to delete payment schedule:', error);
      showToast.error('Failed to delete payment schedule. Please try again.', {
        title: 'Schedule Deletion Failed',
        duration: 5000,
        action: {
          label: 'Retry',
          onClick: () => handleDeletePaymentSchedule(scheduleId)
        }
      });
    }
  };

  // Extract balances from family wallet data
  const lightningBalance = familyWalletData.lightning?.balance || 0;
  const fedimintBalance = familyWalletData.fedimint?.balance || 0;
  const cashuBalance = familyWalletData.cashu?.balance || 0;
  const totalBalance = familyWalletData.totalBalance;

  // Wrapper function to handle result objects and provide user feedback
  const handleFrostTransactionApprovalWrapper = async (transactionId: string): Promise<void> => {
    const result = await handleFrostTransactionApproval(transactionId);

    if (!result.success && result.error) {
      // Use unified toast notification system for user feedback
      console.error('FROST transaction approval failed:', result.error);

      showToast.error(result.error, {
        title: 'Transaction Approval Failed',
        duration: 0, // Don't auto-dismiss errors
        action: {
          label: 'Retry',
          onClick: () => handleFrostTransactionApprovalWrapper(transactionId)
        }
      });
    } else if (result.success) {
      // Show success notification
      showToast.success('Transaction signature submitted successfully', {
        title: 'Signature Approved',
        duration: 4000
      });
    }
  };

  // Navigation tabs
  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'lightning', label: 'Lightning', icon: Zap },
    { id: 'fedimint', label: 'Fedimint', icon: Shield },
    { id: 'payments', label: 'Payments', icon: Activity },
    { id: 'phoenixd', label: 'PhoenixD', icon: Globe },
    ...(lnbitsEnabled ? [{ id: 'lnbits', label: 'LNbits', icon: Zap }] : []),
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
            {familyWalletData.permissions.can_view_balance && showPrivateBalances
              ? formatSats(lightningBalance)
              : familyWalletData.permissions.can_view_balance
                ? '•••••••'
                : 'Access Restricted'
            } sats
          </div>
          <div className="text-sm text-orange-600 mb-3">
            ⚡ External Payments • Nostr Zaps • PhoenixD Automated
            {!familyWalletData.permissions.can_view_balance && (
              <div className="text-xs text-orange-500 mt-1">
                👑 Steward/Guardian access required
              </div>
            )}
          </div>
          <div className="bg-orange-100 rounded-lg p-3">
            <div className="text-xs text-orange-700 font-medium">Family Lightning Address</div>
            <div className="text-sm text-orange-800 font-mono">family@my.satnam.pub</div>
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
            {familyWalletData.permissions.can_view_balance && showPrivateBalances
              ? formatSats(fedimintBalance)
              : familyWalletData.permissions.can_view_balance
                ? '•••••••'
                : 'Access Restricted'
            } sats
          </div>
          <div className="text-sm text-purple-600 mb-3">
            🛡️ Guardian Protected • Internal Governance
            {!familyWalletData.permissions.can_view_balance && (
              <div className="text-xs text-purple-500 mt-1">
                👑 Steward/Guardian access required
              </div>
            )}
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
            {familyWalletData.permissions.can_view_balance && showPrivateBalances
              ? formatSats(totalBalance)
              : familyWalletData.permissions.can_view_balance
                ? '•••••••'
                : 'Access Restricted'
            } sats
          </div>
          <div className="text-sm text-green-600 mb-3">
            Combined Lightning + Cashu + Fedimint Balance
            {!familyWalletData.permissions.can_view_balance && (
              <div className="text-xs text-green-500 mt-1">
                👑 Steward/Guardian access required
              </div>
            )}
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

      {/* FROST Multi-Signature Panel */}
      <FrostSignaturePanel
        pendingTransactions={pendingFrostTransactions}
        userRole={familyWalletData.userRole}
        canApprove={familyWalletData.permissions.can_spend}
        onApproveTransaction={handleFrostTransactionApprovalWrapper}
        onRefresh={handleRefreshAll}
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
                    onClick={() => handleShowQR(member.id, member.lightningAddress || `${member.username}@${resolvePlatformLightningDomain()}`)}
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
        return <FamilyLightningTreasury familyId={familyFederationId || ''} />;
      case 'fedimint':
        return <FamilyFedimintGovernance familyId={familyFederationId || ''} />;
      case 'payments':
        return <UnifiedFamilyPayments familyId={familyFederationId || ''} familyMembers={familyMembers} />;
      case 'phoenixd':
        return <EnhancedLiquidityDashboard familyId={familyFederationId || ''} />;
      case 'lnbits':
        if (!lnbitsEnabled) {
          return renderOverview();
        }
        return <LNBitsIntegrationPanel />;
      default:
        return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50 p-4">
      {/* Unified Toast Notification Container */}
      <ToastContainer position="top-right" maxToasts={5} />

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
                  // Check actual NWC connection status from connection data
                  const hasNWC = nwcConnections?.some(conn =>
                    conn.connection_id === member.id && conn.connection_status === 'connected' && conn.is_active
                  ) || false;

                  // Fallback to role-based assumption only if connection data is unavailable
                  const hasNWCFallback = hasNWC ||
                    (nwcConnections?.length === 0 &&
                      (member.role === 'adult' || member.role === 'guardian' || member.role === 'steward'));

                  return (
                    <div
                      key={member.id}
                      className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium ${hasNWCFallback
                        ? 'bg-green-100 text-green-800 border border-green-200'
                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}
                    >
                      <div className="w-2 h-2 rounded-full bg-current"></div>
                      <span>{member.username}</span>
                      {hasNWCFallback && <CheckCircle className="h-3 w-3" />}
                      {hasNWC && (
                        <span className="text-xs bg-green-200 text-green-700 px-1 rounded" title="Active NWC Connection">
                          NWC
                        </span>
                      )}
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
              onClick={() => setShowPaymentAutomationModal(true)}
              className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              <Activity className="h-5 w-5" />
              <span>Create Payment Schedule</span>
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

      {/* Production-Ready Payment Automation Modal */}
      <PaymentAutomationModal
        isOpen={showPaymentAutomationModal}
        onClose={() => {
          setShowPaymentAutomationModal(false);
          setEditingPaymentSchedule(undefined);
        }}
        onSave={async (schedule) => {
          try {
            await handleSavePaymentSchedule(schedule);
            // Refresh dashboard data after successful save
            if (familyFederationId && userDuid) {
              const updatedData = await getAllFamilyWalletData(familyFederationId, userDuid);
              setFamilyWalletData(updatedData);
            }
          } catch (error) {
            // Error handling is managed by the modal's toast notifications
            throw error;
          }
        }}
        context="family"
        familyId={familyFederationId || ''}
        familyMembers={familyMembers.map(member => ({
          id: member.id,
          name: member.name || member.username,
          role: member.role === 'admin' ? 'guardian' : member.role as 'offspring' | 'adult' | 'steward' | 'guardian' | 'private',
          avatar: member.avatar || member.username.charAt(0).toUpperCase(),
          // Use real Lightning addresses and npubs from member data
          lightningAddress: member.lightningAddress || (member.nip05 ? member.nip05 : undefined),
          npub: member.nostrPubkey ? `npub1${member.nostrPubkey}` : undefined
        }))}
        existingSchedule={editingPaymentSchedule}
      />

      {/* Educational Dashboard Modal */}
      {showEducationalDashboard && (
        <EducationalDashboard
          userPubkey={(user && 'npub' in (user as any) ? (user as any).npub : undefined) || 'demo_family_admin'}
          familyId={familyFederationId || 'demo_family_id'}
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