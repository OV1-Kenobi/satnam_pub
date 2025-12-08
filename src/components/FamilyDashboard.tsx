import {
  AlertCircle,
  ArrowLeft,
  Bitcoin,
  CheckCircle,
  Loader2,
  QrCode,
  Settings,
  Shield,
  UserPlus,
  Users,
  XCircle
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { FeatureFlags } from "../lib/feature-flags";
import { FederationRole } from "../types/auth";
import { useAuth } from "./auth/AuthProvider";
import EmergencyRecoveryModal from "./EmergencyRecoveryModal";
import FamilyWalletCard from "./FamilyWalletCard";
import PhoenixDNodeStatus from "./PhoenixDNodeStatus";
import SmartPaymentModal from "./SmartPaymentModal";
import TransactionHistory from "./TransactionHistory";
import { InvitationGenerator } from "./family-invitations/InvitationGenerator";
import { getFamilyFederationByDuid } from "../services/familyFederationApi";

import { FamilyMember, Transaction } from "../types/shared";

// Database FamilyMember type (from API responses)
interface DbFamilyMember {
  id: string;
  family_federation_id: string;
  user_duid: string;
  family_role: "offspring" | "adult" | "steward" | "guardian";
  spending_approval_required: boolean;
  voting_power: number;
  joined_at: string;
  is_active: boolean;
  // Optional fields that may be joined from user_identities
  username?: string;
  lightning_address?: string;
  nip05_verified?: boolean;
}

const FamilyDashboard: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user } = useAuth();
  const federationRole: FederationRole = (user?.federationRole as FederationRole) || 'private';
  const familyId = user?.familyId; // Federation DUID is stored in familyId

  // Real data state (no mock data)
  const [familyName, setFamilyName] = useState<string | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [recentTransactions] = useState<Transaction[]>([]); // Empty until API is ready
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>();
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrAddress, setQrAddress] = useState("");
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Fetch real federation data on mount
  useEffect(() => {
    async function fetchFederationData() {
      if (!familyId) {
        setIsLoading(false);
        setError("No federation found. Please create or join a family federation.");
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Fetch federation details
        const federation = await getFamilyFederationByDuid(familyId);
        if (federation) {
          setFamilyName(federation.federation_name || "Family Federation");
        }

        // Fetch federation members - returns database type
        const response = await fetch(`/api/family-federations/${familyId}/members`);
        if (response.ok) {
          const dbMembers: DbFamilyMember[] = await response.json();
          // Map database members to UI FamilyMember format
          const mappedMembers: FamilyMember[] = dbMembers.map((m) => ({
            id: m.id || m.user_duid || '',
            username: m.username || m.user_duid?.slice(0, 8) || 'Member',
            lightningAddress: m.lightning_address,
            role: m.family_role || 'adult',
            balance: undefined, // Balance fetched separately with proper auth
            nip05Verified: m.nip05_verified || false,
          }));
          setFamilyMembers(mappedMembers);
        }
      } catch (err) {
        console.error("Failed to fetch federation data:", err);
        setError("Failed to load family data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchFederationData();
  }, [familyId]);

  // Computed values from real data
  const totalBalance = familyMembers.reduce(
    (sum, member) => sum + (member.balance || 0),
    0,
  );
  const verifiedMembers = familyMembers.filter(
    (m) => m.nip05Verified,
  ).length;

  const formatSats = (sats: number) => {
    return new Intl.NumberFormat().format(sats);
  };

  const handleSendPayment = (memberId: string) => {
    setSelectedMemberId(memberId);
    setShowPaymentModal(true);
  };

  const handleReceivePayment = (memberId: string) => {
    setSelectedMemberId(memberId);
    setShowInvoiceModal(true);
  };

  const handleShowQR = (address: string) => {
    setQrAddress(address);
    setShowQRModal(true);
  };

  const handleEmergencyRecovery = () => {
    setShowRecoveryModal(true);
  };

  const handleCloseRecoveryModal = () => {
    setShowRecoveryModal(false);
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-purple-700"
      style={{
        backgroundImage: 'url(/citadel-fortress-bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center 20%',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Enhanced Header with Recovery Button */}
      <div className="bg-white/10 backdrop-blur-sm shadow-sm border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="p-2 text-purple-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-white">
                  {familyName} Family Dashboard
                </h1>
                <p className="text-sm text-purple-200">
                  Sovereign family banking & coordination
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {/* Invite Family Members Button */}
              {familyId && (federationRole === 'guardian' || federationRole === 'steward') && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors shadow-sm"
                >
                  <UserPlus className="h-4 w-4" />
                  <span className="text-sm font-medium">Invite Members</span>
                </button>
              )}

              {/* Emergency Recovery Button */}
              <button
                onClick={handleEmergencyRecovery}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm"
              >
                <Shield className="h-4 w-4" />
                <span className="text-sm font-medium">Emergency Recovery</span>
              </button>

              {/* Settings Button */}
              <button className="p-2 text-purple-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-200 text-sm">Total Balance</p>
                <p className="text-2xl font-bold text-white">
                  {formatSats(totalBalance)} sats
                </p>
              </div>
              <Bitcoin className="h-8 w-8 text-yellow-400" />
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-200 text-sm">Family Members</p>
                <p className="text-2xl font-bold text-white">
                  {familyMembers.length}
                </p>
              </div>
              <Users className="h-8 w-8 text-blue-400" />
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-200 text-sm">Verified Members</p>
                <p className="text-2xl font-bold text-white">{verifiedMembers}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-200 text-sm">Your Role</p>
                <p className="text-2xl font-bold text-white capitalize">
                  {federationRole}
                </p>
              </div>
              <Shield className="h-8 w-8 text-purple-400" />
            </div>
          </div>
        </div>

        {/* Family Members Grid */}
        <div className="mb-8">
          {!FeatureFlags.isFedimintEnabled() && (
            <div className="bg-amber-500/10 border border-amber-400/50 rounded-xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <AlertCircle className="h-6 w-6 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-lg font-semibold text-amber-300 mb-2">Payment Features Unavailable</h3>
                  <p className="text-amber-100 mb-4">
                    Family Federation is running in MVP mode. Payment features (send, receive, wallet operations) are currently disabled. Core federation, messaging, and member management features are fully functional.
                  </p>
                  <p className="text-sm text-amber-200">
                    To enable payment features, set <code className="bg-black/30 px-2 py-1 rounded">VITE_FEDIMINT_INTEGRATION_ENABLED=true</code> in your environment configuration.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 text-purple-300 animate-spin" />
              <span className="ml-3 text-purple-200">Loading family members...</span>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="bg-red-500/10 border border-red-400/50 rounded-xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <XCircle className="h-6 w-6 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-lg font-semibold text-red-300 mb-2">Error Loading Data</h3>
                  <p className="text-red-100">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && familyMembers.length === 0 && (
            <div className="bg-white/5 border border-white/20 rounded-xl p-12 text-center">
              <Users className="h-16 w-16 text-purple-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Family Members Yet</h3>
              <p className="text-purple-200 mb-6">
                Invite family members to join your federation and manage finances together.
              </p>
              {(federationRole === 'guardian' || federationRole === 'steward') && familyId && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  <UserPlus className="h-5 w-5" />
                  Invite Family Members
                </button>
              )}
            </div>
          )}

          {/* Members Grid */}
          {!isLoading && !error && familyMembers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {familyMembers.map((member) => (
                <FamilyWalletCard
                  key={member.id}
                  member={member}
                  onCopyAddress={() => { }}
                  onSend={() => FeatureFlags.isFedimintEnabled() && handleSendPayment(member.id)}
                  onReceive={() => FeatureFlags.isFedimintEnabled() && handleReceivePayment(member.id)}
                  onShowQR={() => FeatureFlags.isFedimintEnabled() && handleShowQR(member.lightningAddress || '')}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Recent Transactions</h2>
            <button className="text-purple-200 hover:text-yellow-400 transition-colors duration-200">
              View All
            </button>
          </div>
          <TransactionHistory transactions={recentTransactions} />
        </div>

        {/* PhoenixD Node Status */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
          <PhoenixDNodeStatus />
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <SmartPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          type="send"
          familyMembers={familyMembers}
          selectedMemberId={selectedMemberId}
          satsToDollars={0.0001}
        />
      )}

      {/* QR Code Modal */}
      {showQRModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <h3 className="text-xl font-bold mb-4">Receive Payment</h3>
              <div className="bg-gray-100 rounded-lg p-4 mb-4">
                <QrCode className="h-32 w-32 mx-auto" />
              </div>
              <p className="text-sm text-gray-600 mb-4">{qrAddress}</p>
              <button
                onClick={() => setShowQRModal(false)}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Recovery Modal */}
      {showRecoveryModal && (
        <EmergencyRecoveryModal
          isOpen={showRecoveryModal}
          onClose={handleCloseRecoveryModal}
          userRole={federationRole}
          userId={user?.hashedUUID?.slice(0, 16) || user?.id || 'unknown'} // Use hashed UUID, never expose raw IDs
          userNpub={''} // Never expose npub per Master Context zero-knowledge protocols
          familyId={familyId || undefined}
        />
      )}

      {/* Invite Family Members Modal */}
      {showInviteModal && familyId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-purple-900 rounded-xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Invite Family Members</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-purple-200 hover:text-white"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <InvitationGenerator
              federationDuid={familyId}
              federationName={familyName || 'Family Federation'}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyDashboard; 