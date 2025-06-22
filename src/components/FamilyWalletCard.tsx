import {
    Activity,
    CheckCircle,
    Clock,
    Copy,
    Download,
    QrCode,
    Send,
    Shield,
    TrendingUp,
    Zap
} from "lucide-react";
import React, { useState } from "react";

// Updated interface to match requirements
interface FamilyMember {
  id: string;
  username: string;
  lightningAddress: string;
  role: 'parent' | 'child';
  spendingLimits?: {
    daily: number;
    weekly: number;
  };
  nip05Verified: boolean;
  balance?: number;
  recentActivity?: {
    lastTransaction: string;
    transactionCount24h: number;
  };
}

interface FamilyWalletCardProps {
  member: FamilyMember;
  onCopyAddress: () => void;
  onSend?: (memberId: string) => void;
  onReceive?: (memberId: string) => void;
  onShowQR?: (memberId: string, address: string) => void;
}

const FamilyWalletCard: React.FC<FamilyWalletCardProps> = ({ 
  member, 
  onCopyAddress,
  onSend, 
  onReceive, 
  onShowQR 
}) => {
  const [copiedAddress, setCopiedAddress] = useState(false);

  const formatSats = (sats: number): string => {
    return new Intl.NumberFormat().format(sats);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(member.lightningAddress);
      setCopiedAddress(true);
      onCopyAddress(); // Call the callback
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const getStatusColor = (verified: boolean): string => {
    return verified ? "text-green-400" : "text-amber-400";
  };

  const getStatusIcon = (verified: boolean) => {
    return verified ? (
      <CheckCircle className="h-4 w-4" />
    ) : (
      <Clock className="h-4 w-4" />
    );
  };

  const getRoleColor = (role: string): string => {
    return role === "parent" 
      ? "from-orange-500 to-amber-500" 
      : "from-amber-400 to-orange-400";
  };

  const getSpendingLimitDisplay = () => {
    if (member.role === 'parent') {
      return "Unlimited";
    }
    if (member.spendingLimits) {
      return `${formatSats(member.spendingLimits.daily)} sats/day`;
    }
    return "Not set";
  };

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 hover:bg-white/15 transition-all duration-300 border border-white/20 hover:border-orange-500/30">
      {/* Header Section */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold bg-gradient-to-br ${getRoleColor(member.role)}`}>
            {member.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">{member.username}</h3>
            <div className="flex items-center space-x-2">
              <span className="text-orange-200 text-sm capitalize font-medium">{member.role}</span>
              <div className={`flex items-center space-x-1 ${getStatusColor(member.nip05Verified)}`}>
                {getStatusIcon(member.nip05Verified)}
                <span className="text-xs font-medium">
                  {member.nip05Verified ? "NIP-05 Verified" : "Pending Verification"}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Balance Display */}
        {member.balance !== undefined && (
          <div className="text-right">
            <p className="text-white font-bold text-lg">{formatSats(member.balance)}</p>
            <p className="text-amber-200 text-sm">sats</p>
          </div>
        )}
      </div>

      {/* Lightning Address Section */}
      <div className="bg-gradient-to-r from-orange-900/40 to-amber-900/40 rounded-lg p-4 mb-4 border border-orange-500/20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Zap className="h-4 w-4 text-orange-400" />
            <span className="text-orange-200 text-sm font-medium">Lightning Address</span>
          </div>
          <button 
            onClick={copyToClipboard}
            className="text-orange-200 hover:text-white transition-colors duration-200 p-1 hover:bg-white/10 rounded"
            title="Copy Lightning Address"
          >
            {copiedAddress ? (
              <CheckCircle className="h-4 w-4 text-green-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <p className="text-amber-300 font-mono text-sm break-all">{member.lightningAddress}</p>
          {member.nip05Verified && (
            <div className="bg-green-500/20 rounded-full p-1 flex-shrink-0">
              <CheckCircle className="h-3 w-3 text-green-400" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-2 text-xs">
          <div className="flex items-center space-x-1 text-orange-300">
            <Shield className="h-3 w-3" />
            <span>Privacy Protected • Sovereign Banking</span>
          </div>
          <div className="flex items-center space-x-1 text-purple-300">
            <span>🆔</span>
            <span>Nostr Identity</span>
          </div>
        </div>
      </div>

      {/* Spending Limits Section */}
      <div className="bg-white/10 rounded-lg p-4 mb-4">
        <h4 className="text-white font-semibold mb-2 text-sm flex items-center space-x-2">
          <Shield className="h-4 w-4 text-amber-400" />
          <span>Spending Limits</span>
        </h4>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-amber-200">Status</span>
            <span className={`font-medium ${member.role === 'parent' ? 'text-green-400' : 'text-amber-400'}`}>
              {getSpendingLimitDisplay()}
            </span>
          </div>
          {member.spendingLimits && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-amber-200">Daily Limit</span>
                <span className="text-white">{formatSats(member.spendingLimits.daily)} sats</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-amber-200">Weekly Limit</span>
                <span className="text-white">{formatSats(member.spendingLimits.weekly)} sats</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent Activity Section */}
      {member.recentActivity && (
        <div className="bg-white/10 rounded-lg p-4 mb-4">
          <h4 className="text-white font-semibold mb-2 text-sm flex items-center space-x-2">
            <Activity className="h-4 w-4 text-amber-400" />
            <span>Recent Activity</span>
          </h4>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-amber-200">Last Transaction</span>
              <span className="text-white">{member.recentActivity.lastTransaction}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-amber-200">24h Transactions</span>
              <div className="flex items-center space-x-1">
                <span className="text-white">{member.recentActivity.transactionCount24h}</span>
                <TrendingUp className="h-3 w-3 text-green-400" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-2">
        {onSend && (
          <button 
            onClick={() => onSend(member.id)}
            className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-bold py-2 px-3 rounded-lg transition-all duration-300 text-sm flex items-center justify-center space-x-1 shadow-lg hover:shadow-orange-500/25"
          >
            <Send className="h-3 w-3" />
            <span>Send</span>
          </button>
        )}
        {onReceive && (
          <button 
            onClick={() => onReceive(member.id)}
            className="flex-1 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold py-2 px-3 rounded-lg transition-all duration-300 text-sm flex items-center justify-center space-x-1 shadow-lg hover:shadow-amber-500/25"
          >
            <Download className="h-3 w-3" />
            <span>Receive</span>
          </button>
        )}
        {onShowQR && (
          <button 
            onClick={() => onShowQR(member.id, member.lightningAddress)}
            className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-bold py-2 px-3 rounded-lg transition-all duration-300 text-sm flex items-center justify-center shadow-lg hover:shadow-orange-500/25"
            title="Show QR Code"
          >
            <QrCode className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
};

// Mock data for demonstration
export const mockFamilyMembers: FamilyMember[] = [
  {
    id: "1",
    username: "satnam_dad",
    lightningAddress: "satnam_dad@satnam.pub",
    role: "parent",
    nip05Verified: true,
    balance: 5000000,
    recentActivity: {
      lastTransaction: "2 hours ago",
      transactionCount24h: 12
    }
  },
  {
    id: "2",
    username: "satnam_mom",
    lightningAddress: "satnam_mom@satnam.pub",
    role: "parent",
    nip05Verified: true,
    balance: 3500000,
    recentActivity: {
      lastTransaction: "5 minutes ago",
      transactionCount24h: 8
    }
  },
  {
    id: "3",
    username: "arjun_teen",
    lightningAddress: "arjun_teen@satnam.pub",
    role: "child",
    spendingLimits: {
      daily: 100000,
      weekly: 500000
    },
    nip05Verified: true,
    balance: 150000,
    recentActivity: {
      lastTransaction: "1 hour ago",
      transactionCount24h: 3
    }
  },
  {
    id: "4",
    username: "priya_kid",
    lightningAddress: "priya_kid@satnam.pub",
    role: "child",
    spendingLimits: {
      daily: 50000,
      weekly: 200000
    },
    nip05Verified: false,
    balance: 75000,
    recentActivity: {
      lastTransaction: "3 hours ago",
      transactionCount24h: 1
    }
  }
];

export default FamilyWalletCard;