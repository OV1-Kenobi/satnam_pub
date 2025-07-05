import { AlertTriangle, RefreshCw, Users, Zap } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import FamilyWalletCard, { mockFamilyMembers } from './FamilyWalletCard';

// Import the FamilyMember interface from FamilyWalletCard
interface FamilyMember {
  id: string;
  username: string;
  lightningAddress: string;
  role: 'private' | 'offspring' | 'adult' | 'steward' | 'guardian';
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

interface ApiResponse {
  success: boolean;
  data: FamilyMember[];
  meta: {
    total: number;
    timestamp: string;
    demo: boolean;
  };
}

const FamilyWalletDemo: React.FC = () => {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [useMockData, setUseMockData] = useState(true);

  // Fetch family members from API
  const fetchFamilyMembers = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (useMockData) {
        // Use local mock data
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
        setMembers(mockFamilyMembers);
      } else {
        // Fetch from API
        const response = await fetch('/api/family/members');
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: ApiResponse = await response.json();
        setMembers(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch family members:', err);
      setError(err instanceof Error ? err.message : 'Failed to load family members');
      // Fallback to mock data on error
      setMembers(mockFamilyMembers);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFamilyMembers();
  }, [useMockData]);

  const handleCopyAddress = (username: string) => {
    setCopyMessage(`Copied ${username}'s Lightning Address!`);
    setTimeout(() => setCopyMessage(null), 3000);
  };

  const handleSend = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    alert(`Send Lightning payment to ${member?.username || 'member'}`);
  };

  const handleReceive = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    alert(`Generate Lightning invoice for ${member?.username || 'member'}`);
  };

  const handleShowQR = (memberId: string, address: string) => {
    alert(`Show QR code for Lightning Address: ${address}`);
  };

  const adultMembers = members.filter(member => member.role === 'adult' || member.role === 'steward' || member.role === 'guardian');
  const offspringMembers = members.filter(member => member.role === 'offspring');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-orange-400 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-white text-lg">Loading Satnam Family Wallets...</p>
            <p className="text-amber-200 text-sm mt-2">Connecting to sovereign banking platform</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-full flex items-center justify-center">
              <Zap className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Satnam Family Banking</h1>
              <p className="text-amber-200">Sovereign Lightning Wallets for Every Family Member</p>
            </div>
          </div>
          
          {/* Controls */}
          <div className="flex items-center justify-center space-x-4 mb-6">
            <button
              onClick={fetchFamilyMembers}
              disabled={isLoading}
              className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 flex items-center space-x-2 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            
            <button
              onClick={() => setUseMockData(!useMockData)}
              className="bg-white/10 hover:bg-white/20 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 border border-white/20"
            >
              {useMockData ? 'Use API Data' : 'Use Mock Data'}
            </button>
          </div>

          {/* Copy Message */}
          {copyMessage && (
            <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3 mb-6 max-w-md mx-auto">
              <p className="text-green-300 font-medium">{copyMessage}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6 max-w-md mx-auto">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <p className="text-red-300 font-medium">API Error (using fallback data)</p>
              </div>
              <p className="text-red-200 text-sm mt-1">{error}</p>
            </div>
          )}
        </div>

        {/* Adults Section */}
        {adultMembers.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center space-x-2 mb-6">
              <Users className="h-6 w-6 text-orange-400" />
              <h2 className="text-2xl font-bold text-white">Adults</h2>
              <span className="bg-orange-500/20 text-orange-300 px-3 py-1 rounded-full text-sm font-medium">
                Unlimited Spending
              </span>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {adultMembers.map((member) => (
                <FamilyWalletCard
                  key={member.id}
                  member={member}
                  onCopyAddress={() => handleCopyAddress(member.username)}
                  onSend={handleSend}
                  onReceive={handleReceive}
                  onShowQR={handleShowQR}
                />
              ))}
            </div>
          </div>
        )}

        {/* Offspring Section */}
        {offspringMembers.length > 0 && (
          <div>
            <div className="flex items-center space-x-2 mb-6">
              <Users className="h-6 w-6 text-amber-400" />
              <h2 className="text-2xl font-bold text-white">Offspring</h2>
              <span className="bg-amber-500/20 text-amber-300 px-3 py-1 rounded-full text-sm font-medium">
                Spending Limits Applied
              </span>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {offspringMembers.map((member) => (
                <FamilyWalletCard
                  key={member.id}
                  member={member}
                  onCopyAddress={() => handleCopyAddress(member.username)}
                  onSend={handleSend}
                  onReceive={handleReceive}
                  onShowQR={handleShowQR}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {members.length === 0 && !isLoading && (
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 text-center">
            <Users className="h-16 w-16 text-amber-400 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-white mb-2">No Family Members Found</h3>
            <p className="text-amber-200 mb-6">Add family members to start using Satnam sovereign banking.</p>
            <button className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300">
              Add Family Member
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-amber-200 text-sm">
            Powered by Lightning Network • Privacy-First • Self-Sovereign
          </p>
          <p className="text-white/60 text-xs mt-2">
            Demo Mode: {useMockData ? 'Mock Data' : 'API Data'} • 
            Total Members: {members.length} • 
            Last Updated: {new Date().toLocaleTimeString()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default FamilyWalletDemo;