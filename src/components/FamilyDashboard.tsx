import {
  AlertCircle,
  ArrowLeft,
  Bitcoin,
  BookOpen,
  CheckCircle,
  Clock,
  Download,
  QrCode,
  Settings,
  Shield,
  Users,
  XCircle
} from "lucide-react";
import React, { useState } from "react";
import { FeatureFlags } from "../lib/feature-flags";
import { FederationRole } from "../types/auth";
import { useAuth } from "./auth/AuthProvider"; // FIXED: Use unified auth system
import EmergencyRecoveryModal from "./EmergencyRecoveryModal";
import FamilyWalletCard from "./FamilyWalletCard";
import PhoenixDNodeStatus from "./PhoenixDNodeStatus";
import SmartPaymentModal from "./SmartPaymentModal";
import TransactionHistory from "./TransactionHistory";

import { FamilyMember } from "../types/shared";

import { Transaction } from "../types/shared";

const FamilyDashboard: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user } = useAuth();
  const federationRole: FederationRole = (user?.federationRole as FederationRole) || 'private';
  const familyId = user?.familyId;
  const [familyName] = useState("Johnson");
  const [relayStatus] = useState<"connected" | "disconnected" | "syncing">(
    "connected",
  );

  const [familyMembers] = useState<FamilyMember[]>([
    {
      id: "1",
      username: "David",
      lightningAddress: "david@my.satnam.pub",
      role: "adult",
      balance: 125000,
      nip05Verified: true,
    },
    {
      id: "2",
      username: "Sarah",
      lightningAddress: "sarah@my.satnam.pub",
      role: "adult",
      balance: 87500,
      nip05Verified: true,
    },
    {
      id: "3",
      username: "Emma",
      lightningAddress: "emma@my.satnam.pub",
      role: "offspring",
      balance: 25000,
      nip05Verified: false,
      spendingLimits: {
        daily: 10000,
        weekly: 50000,
        requiresApproval: 5000,
      },
    },
    {
      id: "4",
      username: "Luke",
      lightningAddress: "luke@my.satnam.pub",
      role: "offspring",
      balance: 0,
      nip05Verified: false,
      spendingLimits: {
        daily: 5000,
        weekly: 25000,
        requiresApproval: 2000,
      },
    },
  ]);

  const [recentTransactions] = useState<Transaction[]>([
    {
      id: "1",
      type: "received",
      amount: 50000,
      from: "alice@getalby.com",
      to: "david@my.satnam.pub",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      privacyRouted: true,
      status: "completed",
    },
    {
      id: "2",
      type: "sent",
      amount: 25000,
      from: "sarah@my.satnam.pub",
      to: "emma@my.satnam.pub",
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
      privacyRouted: true,
      status: "completed",
    },
    {
      id: "3",
      type: "received",
      amount: 100000,
      from: "bob@strike.me",
      to: "sarah@my.satnam.pub",
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
      privacyRouted: true,
      status: "completed",
    },
  ]);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>();
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrAddress, setQrAddress] = useState("");
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  const totalBalance = familyMembers.reduce(
    (sum, member) => sum + (member.balance || 0),
    0,
  );
  const verifiedMembers = familyMembers.filter(
    (m) => m.nip05Verified,
  ).length;
  const educationProgress = 73;
  const lastBackup = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const formatSats = (sats: number) => {
    return new Intl.NumberFormat().format(sats);
  };

  const formatTimeAgo = (date: Date) => {
    const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
    if (hours < 1) return "Just now";
    if (hours === 1) return "1 hour ago";
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
      case "verified":
        return "text-green-400";
      case "pending":
      case "syncing":
        return "text-yellow-400";
      default:
        return "text-red-400";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "connected":
      case "verified":
        return <CheckCircle className="h-4 w-4" />;
      case "pending":
      case "syncing":
        return <Clock className="h-4 w-4" />;
      default:
        return <XCircle className="h-4 w-4" />;
    }
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
    <div className="min-h-screen bg-gray-50">
      {/* Enhanced Header with Recovery Button */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {familyName} Family Dashboard
                </h1>
                <p className="text-sm text-gray-600">
                  Sovereign family banking & coordination
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {/* Emergency Recovery Button */}
              <button
                onClick={handleEmergencyRecovery}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm"
              >
                <Shield className="h-4 w-4" />
                <span className="text-sm font-medium">Emergency Recovery</span>
              </button>

              {/* Settings Button */}
              <button className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
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
                <p className="text-purple-200 text-sm">Education Progress</p>
                <p className="text-2xl font-bold text-white">{educationProgress}%</p>
              </div>
              <BookOpen className="h-8 w-8 text-green-400" />
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-200 text-sm">Last Backup</p>
                <p className="text-2xl font-bold text-white">
                  {formatTimeAgo(lastBackup)}
                </p>
              </div>
              <Download className="h-8 w-8 text-purple-400" />
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
          userId={user?.id || 'unknown'}
          userNpub={user?.hashed_npub || ''}
          familyId={familyId || undefined}
        />
      )}
    </div>
  );
};

export default FamilyDashboard; 