import React, { useState } from 'react';
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
  TrendingUp
} from 'lucide-react';

interface FamilyMember {
  id: string;
  name: string;
  avatar: string;
  nipStatus: 'verified' | 'pending' | 'none';
  lightningBalance: number;
  role: 'parent' | 'child' | 'guardian';
}

interface Transaction {
  id: string;
  type: 'sent' | 'received';
  amount: number;
  from: string;
  to: string;
  timestamp: Date;
}

const FamilyDashboard: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [familyName] = useState("Johnson");
  const [relayStatus] = useState<'connected' | 'disconnected' | 'syncing'>('connected');
  
  const [familyMembers] = useState<FamilyMember[]>([
    {
      id: '1',
      name: 'David',
      avatar: 'D',
      nipStatus: 'verified',
      lightningBalance: 125000,
      role: 'parent'
    },
    {
      id: '2',
      name: 'Sarah',
      avatar: 'S',
      nipStatus: 'verified',
      lightningBalance: 87500,
      role: 'parent'
    },
    {
      id: '3',
      name: 'Emma',
      avatar: 'E',
      nipStatus: 'pending',
      lightningBalance: 25000,
      role: 'child'
    },
    {
      id: '4',
      name: 'Luke',
      avatar: 'L',
      nipStatus: 'none',
      lightningBalance: 0,
      role: 'child'
    }
  ]);

  const [recentTransactions] = useState<Transaction[]>([
    {
      id: '1',
      type: 'received',
      amount: 50000,
      from: 'alice@getalby.com',
      to: 'david@satnam.pub',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000)
    },
    {
      id: '2',
      type: 'sent',
      amount: 25000,
      from: 'sarah@satnam.pub',
      to: 'emma@satnam.pub',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000)
    },
    {
      id: '3',
      type: 'received',
      amount: 100000,
      from: 'bob@strike.me',
      to: 'sarah@satnam.pub',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000)
    }
  ]);

  const totalBalance = familyMembers.reduce((sum, member) => sum + member.lightningBalance, 0);
  const verifiedMembers = familyMembers.filter(m => m.nipStatus === 'verified').length;
  const educationProgress = 73;
  const lastBackup = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const formatSats = (sats: number) => {
    return new Intl.NumberFormat().format(sats);
  };

  const formatTimeAgo = (date: Date) => {
    const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'verified':
        return 'text-green-400';
      case 'pending':
      case 'syncing':
        return 'text-yellow-400';
      default:
        return 'text-red-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
      case 'verified':
        return <CheckCircle className="h-4 w-4" />;
      case 'pending':
      case 'syncing':
        return <Clock className="h-4 w-4" />;
      default:
        return <XCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-purple-900 rounded-2xl p-6 mb-8 border border-yellow-400/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
              >
                <ArrowLeft className="h-5 w-5 text-white" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-white">{familyName} Citadel</h1>
                <div className="flex items-center space-x-4 mt-2">
                  <span className="text-purple-200">{familyMembers.length} family members</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      relayStatus === 'connected' ? 'bg-green-400' : 
                      relayStatus === 'syncing' ? 'bg-yellow-400' : 'bg-red-400'
                    } animate-pulse`} />
                    <span className="text-purple-200 capitalize">{relayStatus}</span>
                  </div>
                </div>
              </div>
            </div>
            <button className="p-3 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300">
              <Settings className="h-6 w-6 text-white" />
            </button>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-6">
          {/* Family Members Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <img src="/Rebuilding_Camelot_logo__transparency_v3.png" alt="Rebuilding Camelot" className="h-6 w-6" />
                <h2 className="text-xl font-bold text-white">Family Members</h2>
              </div>
              <span className="text-purple-200">{verifiedMembers}/{familyMembers.length} verified</span>
            </div>
            
            <div className="space-y-4 mb-6">
              {familyMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between bg-white/10 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white font-bold">
                      {member.avatar}
                    </div>
                    <div>
                      <p className="text-white font-semibold">{member.name}</p>
                      <div className="flex items-center space-x-2">
                        <span className={`text-sm ${getStatusColor(member.nipStatus)}`}>
                          {member.nipStatus === 'verified' ? 'Verified' : 
                           member.nipStatus === 'pending' ? 'Pending' : 'Not Set'}
                        </span>
                        {getStatusIcon(member.nipStatus)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-semibold">{formatSats(member.lightningBalance)}</p>
                    <p className="text-purple-200 text-sm">sats</p>
                  </div>
                </div>
              ))}
            </div>
            
            <button className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2">
              <Plus className="h-5 w-5" />
              <span>Add Member</span>
            </button>
          </div>

          {/* Lightning Treasury Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
            <div className="flex items-center space-x-3 mb-6">
              <img src="/LN Bitcoin icon.png" alt="Lightning Bitcoin" className="h-6 w-6" />
              <h2 className="text-xl font-bold text-white">Lightning Treasury</h2>
            </div>
            
            <div className="mb-6">
              <div className="flex items-center space-x-2 mb-2">
                <Bitcoin className="h-5 w-5 text-orange-500" />
                <span className="text-2xl font-bold text-white">{formatSats(totalBalance)}</span>
                <span className="text-purple-200">sats</span>
              </div>
              <div className="flex items-center space-x-2 text-green-400">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm">+12.5% this week</span>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-white font-semibold mb-3">Recent Transactions</h3>
              <div className="space-y-2">
                {recentTransactions.slice(0, 3).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between bg-white/10 rounded-lg p-3">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        tx.type === 'received' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {tx.type === 'received' ? '↓' : '↑'}
                      </div>
                      <div>
                        <p className="text-white text-sm font-semibold">
                          {tx.type === 'received' ? 'Received' : 'Sent'}
                        </p>
                        <p className="text-purple-200 text-xs">{formatTimeAgo(tx.timestamp)}</p>
                      </div>
                    </div>
                    <span className={`font-semibold ${
                      tx.type === 'received' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {tx.type === 'received' ? '+' : '-'}{formatSats(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex space-x-3">
              <button className="flex-1 bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2">
                <Send className="h-4 w-4" />
                <span>Send</span>
              </button>
              <button className="flex-1 bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2">
                <FileText className="h-4 w-4" />
                <span>Invoice</span>
              </button>
            </div>
          </div>

          {/* Relay Health Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
            <div className="flex items-center space-x-3 mb-6">
              <Wifi className="h-6 w-6 text-yellow-400" />
              <h2 className="text-xl font-bold text-white">Relay Health</h2>
            </div>
            
            <div className="space-y-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-purple-200">Connection Status</span>
                <div className={`flex items-center space-x-2 ${getStatusColor(relayStatus)}`}>
                  {getStatusIcon(relayStatus)}
                  <span className="capitalize font-semibold">{relayStatus}</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-purple-200">Messages Today</span>
                <span className="text-white font-semibold">1,247</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-purple-200">Uptime</span>
                <span className="text-green-400 font-semibold">99.8%</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-purple-200">Last Sync</span>
                <span className="text-white font-semibold">2 min ago</span>
              </div>
            </div>

            <button className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2">
              <Eye className="h-5 w-5" />
              <span>View Relay Logs</span>
            </button>
          </div>

          {/* Education Progress Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
            <div className="flex items-center space-x-3 mb-6">
              <BookOpen className="h-6 w-6 text-yellow-400" />
              <h2 className="text-xl font-bold text-white">Education Progress</h2>
            </div>
            
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-purple-200">Family Progress</span>
                <span className="text-white font-semibold">{educationProgress}%</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-3">
                <div 
                  className="bg-gradient-to-r from-yellow-400 to-orange-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${educationProgress}%` }}
                />
              </div>
            </div>

            <div className="bg-white/10 rounded-lg p-4 mb-6">
              <h3 className="text-white font-semibold mb-2">Next Lesson</h3>
              <p className="text-purple-200 text-sm mb-3">Understanding Lightning Network Channels</p>
              <div className="flex items-center space-x-2 text-yellow-400">
                <Play className="h-4 w-4" />
                <span className="text-sm">15 min remaining</span>
              </div>
            </div>

            <button className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2">
              <Play className="h-5 w-5" />
              <span>Continue Learning</span>
            </button>
          </div>

          {/* Backup Status Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
            <div className="flex items-center space-x-3 mb-6">
              <img src="/Citadel Academy Logo.png" alt="Citadel Academy" className="h-6 w-6" />
              <h2 className="text-xl font-bold text-white">Backup Status</h2>
            </div>
            
            <div className="space-y-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-purple-200">Last Backup</span>
                <span className="text-white font-semibold">{formatTimeAgo(lastBackup)}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-purple-200">Safebox Status</span>
                <div className="flex items-center space-x-2 text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-semibold">Encrypted</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-purple-200">Recovery Phrase</span>
                <div className="flex items-center space-x-2 text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-semibold">Secured</span>
                </div>
              </div>
            </div>

            <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-yellow-400 font-semibold text-sm">Backup Recommended</p>
                  <p className="text-yellow-200 text-xs">Create a fresh backup with recent changes</p>
                </div>
              </div>
            </div>

            <button className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2">
              <img src="/Citadel Academy Logo.png" alt="Citadel Academy" className="h-5 w-5" />
              <span>Create Backup</span>
            </button>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
            <div className="flex items-center space-x-3 mb-6">
              <Zap className="h-6 w-6 text-yellow-400" />
              <h2 className="text-xl font-bold text-white">Quick Actions</h2>
            </div>
            
            <div className="space-y-3">
              <button className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center space-x-3">
                <UserPlus className="h-5 w-5 text-yellow-400" />
                <span>Invite Family Member</span>
              </button>
              
              <button className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center space-x-3">
                <Download className="h-5 w-5 text-yellow-400" />
                <span>Export Family Data</span>
              </button>
              
              <button className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center space-x-3">
                <AlertTriangle className="h-5 w-5" />
                <span>Emergency Recovery</span>
              </button>
            </div>

            <div className="mt-6 bg-white/10 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-2">Family Stats</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-purple-200">Total Transactions</p>
                  <p className="text-white font-semibold">1,247</p>
                </div>
                <div>
                  <p className="text-purple-200">Active Days</p>
                  <p className="text-white font-semibold">89</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12">
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-8 text-purple-200">
            <span className="flex items-center space-x-2">
              <img src="/Citadel Academy Logo.png" alt="Citadel Academy" className="h-4 w-4" />
              <span>Family sovereignty secured</span>
            </span>
            <span className="flex items-center space-x-2">
              <Bitcoin className="h-4 w-4" />
              <span>Bitcoin-only treasury</span>
            </span>
            <span className="flex items-center space-x-2">
              <img src="/Rebuilding_Camelot_logo__transparency_v3.png" alt="Rebuilding Camelot" className="h-4 w-4" />
              <span>Multi-generational wealth</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FamilyDashboard;