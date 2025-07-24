/**
 * Enhanced Reward System Example
 * Demonstrates the enhanced reward system with anti-gaming protection
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import React, { useState } from 'react';
import { RewardRedemption } from '../../lib/citadel/reward-system.js';
import RewardSystem from '../citadel/RewardSystem';

const EnhancedRewardSystemExample: React.FC = () => {
  const [studentPubkey, setStudentPubkey] = useState('npub1example123456789abcdefghijklmnopqrstuvwxyz');
  const [familyId, setFamilyId] = useState('family_123');
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastRedemption, setLastRedemption] = useState<RewardRedemption | null>(null);

  const handleRewardRedeemed = (redemption: RewardRedemption) => {
    setLastRedemption(redemption);
    console.log('Reward redeemed:', redemption);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-purple-900 rounded-2xl p-6 mb-8 border border-yellow-400/20">
          <h1 className="text-3xl font-bold text-white mb-4">Enhanced Reward System Demo</h1>
          <p className="text-purple-200 mb-6">
            This demonstrates the enhanced reward system with comprehensive anti-gaming protection,
            course credit support, and privacy-first design.
          </p>

          {/* Configuration Panel */}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-purple-200 text-sm font-medium">Student Public Key</label>
              <input
                type="text"
                value={studentPubkey}
                onChange={(e) => setStudentPubkey(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:border-yellow-400"
                placeholder="npub1..."
              />
            </div>

            <div>
              <label className="text-purple-200 text-sm font-medium">Family ID (Optional)</label>
              <input
                type="text"
                value={familyId}
                onChange={(e) => setFamilyId(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:border-yellow-400"
                placeholder="family_123"
              />
            </div>

            <div className="flex items-center">
              <label className="flex items-center space-x-2 text-purple-200">
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                  className="rounded border-white/20 bg-white/10 text-yellow-400 focus:ring-yellow-400"
                />
                <span className="text-sm font-medium">Admin Mode</span>
              </label>
            </div>
          </div>
        </div>

        {/* Last Redemption Display */}
        {lastRedemption && (
          <div className="bg-green-500/10 backdrop-blur-sm rounded-2xl p-6 mb-8 border border-green-500/20">
            <h2 className="text-xl font-bold text-white mb-4">Last Reward Redeemed</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-green-200 text-sm">Reward Type</label>
                <div className="text-white font-medium capitalize">
                  {lastRedemption.reward_type.replace('-', ' ')}
                </div>
              </div>
              <div>
                <label className="text-green-200 text-sm">Value</label>
                <div className="text-white font-medium">
                  {lastRedemption.value} {lastRedemption.currency}
                </div>
              </div>
              <div>
                <label className="text-green-200 text-sm">Status</label>
                <div className="text-white font-medium capitalize">
                  {lastRedemption.status}
                </div>
              </div>
              <div>
                <label className="text-green-200 text-sm">Created</label>
                <div className="text-white font-medium">
                  {new Date(lastRedemption.created_at * 1000).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Feature Highlights */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-8 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6">Enhanced Features</h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white/10 rounded-xl p-4 border border-white/20">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <span className="text-blue-400 text-sm font-bold">1</span>
                </div>
                <h3 className="text-white font-bold">Anti-Gaming Protection</h3>
              </div>
              <ul className="text-purple-200 text-sm space-y-1">
                <li>• Browser fingerprint validation</li>
                <li>• Rate limiting & rapid submission detection</li>
                <li>• Invitation pattern analysis</li>
                <li>• Study time verification</li>
              </ul>
            </div>

            <div className="bg-white/10 rounded-xl p-4 border border-white/20">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center">
                  <span className="text-green-400 text-sm font-bold">2</span>
                </div>
                <h3 className="text-white font-bold">Course Credit Support</h3>
              </div>
              <ul className="text-purple-200 text-sm space-y-1">
                <li>• Course-specific reward types</li>
                <li>• Progress-based eligibility</li>
                <li>• Completion verification</li>
                <li>• Educational milestone tracking</li>
              </ul>
            </div>

            <div className="bg-white/10 rounded-xl p-4 border border-white/20">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-yellow-500/20 rounded-full flex items-center justify-center">
                  <span className="text-yellow-400 text-sm font-bold">3</span>
                </div>
                <h3 className="text-white font-bold">Privacy-First Design</h3>
              </div>
              <ul className="text-purple-200 text-sm space-y-1">
                <li>• Encrypted reward data</li>
                <li>• Browser-compatible only</li>
                <li>• No external dependencies</li>
                <li>• User-controlled data</li>
              </ul>
            </div>

            <div className="bg-white/10 rounded-xl p-4 border border-white/20">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center">
                  <span className="text-purple-400 text-sm font-bold">4</span>
                </div>
                <h3 className="text-white font-bold">Family Federation</h3>
              </div>
              <ul className="text-purple-200 text-sm space-y-1">
                <li>• Guardian approval system</li>
                <li>• Family credit rewards</li>
                <li>• Multi-signature support</li>
                <li>• Role-based access control</li>
              </ul>
            </div>

            <div className="bg-white/10 rounded-xl p-4 border border-white/20">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center">
                  <span className="text-red-400 text-sm font-bold">5</span>
                </div>
                <h3 className="text-white font-bold">Bitcoin-Only Rewards</h3>
              </div>
              <ul className="text-purple-200 text-sm space-y-1">
                <li>• Lightning Network payments</li>
                <li>• Fedimint integration</li>
                <li>• Cashu eCash support</li>
                <li>• Atomic swaps</li>
              </ul>
            </div>

            <div className="bg-white/10 rounded-xl p-4 border border-white/20">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center">
                  <span className="text-orange-400 text-sm font-bold">6</span>
                </div>
                <h3 className="text-white font-bold">Real-Time Security</h3>
              </div>
              <ul className="text-purple-200 text-sm space-y-1">
                <li>• Live risk assessment</li>
                <li>• Violation detection</li>
                <li>• Security recommendations</li>
                <li>• Automated blocking</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Enhanced Reward System Component */}
        <RewardSystem
          studentPubkey={studentPubkey}
          familyId={familyId}
          isAdmin={isAdmin}
          onRewardRedeemed={handleRewardRedeemed}
        />
      </div>
    </div>
  );
};

export default EnhancedRewardSystemExample;