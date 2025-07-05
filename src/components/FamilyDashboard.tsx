import React, { useState } from "react";
import {
  Users,
  Zap,
  Wifi,
  BookOpen,
  Settings,
  Plus,
  Send,
  FileText,
  UserPlus,
  Download,
  AlertTriangle,
  Eye,
  Play,
  ArrowLeft,
  Bitcoin,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  QrCode,
} from "lucide-react";
import PhoenixDNodeStatus from "./PhoenixDNodeStatus";
import FamilyWalletCard from "./FamilyWalletCard";
import SmartPaymentModal from "./SmartPaymentModal";
import TransactionHistory from "./TransactionHistory";

interface FamilyMember {
  id: string;
  name: string;
  avatar: string;
  nipStatus: "verified" | "pending" | "none";
  lightningBalance: number;
  lightningAddress: string;
  role: "parent" | "child" | "teen" | "guardian";
  spendingLimits?: {
    daily?: number;
    weekly?: number;
    transaction?: number;
  };
}

interface Transaction {
  id: string;
  type: "sent" | "received";
  amount: number;
  from: string;
  to: string;
  timestamp: Date;
}

const FamilyDashboard: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [familyName] = useState("Johnson");
  const [relayStatus] = useState<"connected" | "disconnected" | "syncing">(
    "connected",
  );

  const [familyMembers] = useState<FamilyMember[]>([
    {
      id: "1",
      name: "David",
      avatar: "D",
      nipStatus: "verified",
      lightningBalance: 125000,
      lightningAddress: "david@satnam.pub",
      role: "parent",
    },
    {
      id: "2",
      name: "Sarah",
      avatar: "S",
      nipStatus: "verified",
      lightningBalance: 87500,
      lightningAddress: "sarah@satnam.pub",
      role: "parent",
    },
    {
      id: "3",
      name: "Emma",
      avatar: "E",
      nipStatus: "pending",
      lightningBalance: 25000,
      lightningAddress: "emma@satnam.pub",
      role: "teen",
      spendingLimits: {
        daily: 10000,
        weekly: 50000,
        transaction: 5000,
      },
    },
    {
      id: "4",
      name: "Luke",
      avatar: "L",
      nipStatus: "none",
      lightningBalance: 0,
      lightningAddress: "luke@satnam.pub",
      role: "child",
      spendingLimits: {
        daily: 5000,
        weekly: 25000,
        transaction: 2000,
      },
    },
  ]);

  const [recentTransactions] = useState<Transaction[]>([
    {
      id: "1",
      type: "received",
      amount: 50000,
      from: "alice@getalby.com",
      to: "david@satnam.pub",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
    {
      id: "2",
      type: "sent",
      amount: 25000,
      from: "sarah@satnam.pub",
      to: "emma@satnam.pub",
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
    },
    {
      id: "3",
      type: "received",
      amount: 100000,
      from: "bob@strike.me",
      to: "sarah@satnam.pub",
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
    },
  ]);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>();
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrAddress, setQrAddress] = useState("");

  const totalBalance = familyMembers.reduce(
    (sum, member) => sum + member.lightningBalance,
    0,
  );
  const verifiedMembers = familyMembers.filter(
    (m) => m.nipStatus === "verified",
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-purple-700">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-sm border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="text-white hover:text-yellow-400 transition-colors duration-200"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white">
                  {familyName} Family Dashboard
                </h1>
                <p className="text-purple-200 text-sm">
                  {familyMembers.length} members • {verifiedMembers} verified
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 flex items-center space-x-2">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {familyMembers.map((member) => (
            <FamilyWalletCard
              key={member.id}
              member={member}
              onSendPayment={() => handleSendPayment(member.id)}
              onReceivePayment={() => handleReceivePayment(member.id)}
              onShowQR={() => handleShowQR(member.lightningAddress)}
            />
          ))}
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
          recipientId={selectedMemberId}
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
    </div>
  );
};

export default FamilyDashboard; 