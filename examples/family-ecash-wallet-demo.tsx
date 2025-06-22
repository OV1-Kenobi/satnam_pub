/**
 * @fileoverview Family eCash Wallet Demo
 * @description Example usage of the FamilyEcashWallet component
 */

import React from "react";
import { FamilyEcashWallet } from "../src/components/FamilyEcashWallet";
import { FamilyMember } from "../types/family";

// Example family members
const exampleFamilyMembers: FamilyMember[] = [
  {
    id: "member_1",
    name: "Satoshi Nakamoto",
    username: "satoshi@satnam.pub",
    role: "parent",
    avatar: "S",
    spendingLimits: {
      daily: 1000000, // 1M sats daily limit for parents
      weekly: 5000000,
      monthly: 20000000,
    },
  },
  {
    id: "member_2",
    name: "Hal Finney",
    username: "hal@satnam.pub",
    role: "parent",
    avatar: "H",
    spendingLimits: {
      daily: 1000000,
      weekly: 5000000,
      monthly: 20000000,
    },
  },
  {
    id: "member_3",
    name: "Alice Nakamoto",
    username: "alice@satnam.pub",
    role: "child",
    avatar: "A",
    spendingLimits: {
      daily: 10000, // 10K sats daily limit for children
      weekly: 50000,
      monthly: 200000,
    },
  },
  {
    id: "member_4",
    name: "Bob Nakamoto",
    username: "bob@satnam.pub",
    role: "child",
    avatar: "B",
    spendingLimits: {
      daily: 5000, // 5K sats daily limit for younger children
      weekly: 25000,
      monthly: 100000,
    },
  },
];

/**
 * Demo component showing FamilyEcashWallet usage
 */
export const FamilyEcashWalletDemo: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-purple-900 rounded-2xl p-6 mb-8 border border-yellow-400/20">
          <h1 className="text-3xl font-bold text-white mb-2">
            Family eCash Wallet Demo
          </h1>
          <p className="text-purple-200">
            Demonstrating federated banking with Lightning and eCash integration
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {exampleFamilyMembers.map((member) => (
            <FamilyEcashWallet key={member.id} familyMember={member} />
          ))}
        </div>

        <div className="mt-8 bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <h2 className="text-xl font-bold text-white mb-4">
            Features Demonstrated
          </h2>
          <div className="grid md:grid-cols-2 gap-4 text-white">
            <div>
              <h3 className="font-semibold text-yellow-400 mb-2">
                🔒 Privacy Features
              </h3>
              <ul className="text-sm text-purple-200 space-y-1">
                <li>• Lightning → eCash for private transactions</li>
                <li>• Federation-based privacy protection</li>
                <li>• Zero-knowledge balance management</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-yellow-400 mb-2">
                👨‍👩‍👧‍👦 Family Governance
              </h3>
              <ul className="text-sm text-purple-200 space-y-1">
                <li>• Role-based spending limits</li>
                <li>• Guardian approval for large transactions</li>
                <li>• Child-friendly financial education</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-yellow-400 mb-2">
                ⚡ Lightning Integration
              </h3>
              <ul className="text-sm text-purple-200 space-y-1">
                <li>• Seamless eCash ↔ Lightning transfers</li>
                <li>• Real-time balance updates</li>
                <li>• External payment capabilities</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-yellow-400 mb-2">
                🛡️ Federation Security
              </h3>
              <ul className="text-sm text-purple-200 space-y-1">
                <li>• Multi-guardian consensus</li>
                <li>• Distributed trust model</li>
                <li>• Censorship resistance</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FamilyEcashWalletDemo;
