import { AlertTriangle, Bitcoin, Shield, Users, Zap } from "lucide-react";
import React, { useState } from "react";

interface SovereignFamilyBankingProps {
  familyId: string;
}

const SovereignFamilyBanking: React.FC<SovereignFamilyBankingProps> = ({ familyId }) => {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="space-y-6">
      {/* Main Banking Section */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 relative">
        {/* DEMO MODE Badge - Top Right Corner */}
        <div className="absolute top-4 right-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1 shadow-lg">
          <AlertTriangle className="h-3 w-3" />
          <span>DEMO MODE</span>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-full flex items-center justify-center">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Sovereign Family Banking</h2>
              <p className="text-purple-200">Manage your family's Bitcoin with PhoenixD</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white/10 rounded-lg p-6 animate-pulse">
                <div className="w-12 h-12 bg-white/20 rounded-full mb-4"></div>
                <div className="h-4 bg-white/20 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-white/20 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Lightning Network Card */}
            <div className="bg-white/10 rounded-lg p-6 hover:bg-white/15 transition-all duration-300 border border-orange-500/20">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-full flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-white font-bold text-lg mb-1">Lightning Network</h3>
              <p className="text-purple-200 text-sm">Instant Bitcoin payments with PhoenixD</p>
            </div>

            {/* Family Wallets Card */}
            <div className="bg-white/10 rounded-lg p-6 hover:bg-white/15 transition-all duration-300 border border-amber-500/20">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-white font-bold text-lg mb-1">Family Wallets</h3>
              <p className="text-purple-200 text-sm">Manage allowances and spending limits</p>
            </div>

            {/* Bitcoin Treasury Card */}
            <div className="bg-white/10 rounded-lg p-6 hover:bg-white/15 transition-all duration-300 border border-orange-500/20">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-amber-600 rounded-full flex items-center justify-center mb-4">
                <Bitcoin className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-white font-bold text-lg mb-1">Bitcoin Treasury</h3>
              <p className="text-purple-200 text-sm">Secure family savings and long-term holdings</p>
            </div>

            {/* Privacy Protection Card */}
            <div className="bg-white/10 rounded-lg p-6 hover:bg-white/15 transition-all duration-300 border border-amber-500/20">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-white font-bold text-lg mb-1">Privacy Protection</h3>
              <p className="text-purple-200 text-sm">LNProxy privacy routing for all transactions</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SovereignFamilyBanking;