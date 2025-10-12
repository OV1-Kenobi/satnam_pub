/**
 * Privacy Integration Demo Component
 * Demonstrates all the new privacy-enhanced components working together
 */

import { Send, Settings, Shield } from 'lucide-react';
import React, { useState } from 'react';
import { PrivacyLevel } from '../../types/privacy';
import { FamilyMember } from '../../types/shared';
import { PrivacyControls } from '../PrivacyControls';
import PrivacyDashboardIndicators from './PrivacyDashboardIndicators';
import PrivacyEnhancedPaymentModal from './PrivacyEnhancedPaymentModal';
import PrivacyPreferencesModal from './PrivacyPreferencesModal';

const PrivacyIntegrationDemo: React.FC = () => {
  const [currentPrivacyLevel, setCurrentPrivacyLevel] = useState<PrivacyLevel>(PrivacyLevel.GIFTWRAPPED);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string>('');

  // Mock family members
  const mockFamilyMembers: FamilyMember[] = [
    {
      id: 'parent1',
      username: 'alice',
      role: 'adult',
      balance: 500000,
      nip05Verified: true,
      lightningAddress: 'alice@my.satnam.pub',

    },
    {
      id: 'child1',
      username: 'bob',
      role: 'offspring',
      balance: 50000,
      nip05Verified: true,
      lightningAddress: 'bob@my.satnam.pub',

    },
    {
      id: 'guardian1',
      username: 'charlie',
      role: 'guardian',
      balance: 1000000,
      nip05Verified: true,
      lightningAddress: 'charlie@my.satnam.pub',

    }
  ];

  // Mock privacy metrics
  const mockPrivacyMetrics = {
    transactionsRouted: 127,
    privacyScore: 85,
    lnproxyUsage: '78%',
    cashuPrivacy: '92%'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-purple-900 to-blue-950 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-purple-700 rounded-full flex items-center justify-center">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white">Privacy Integration Demo</h1>
          </div>
          <p className="text-purple-200 max-w-2xl mx-auto">
            Experience the complete privacy-enhanced Bitcoin family banking system with standardized privacy levels,
            intelligent routing, and guardian approval workflows.
          </p>
        </div>

        {/* Demo Controls */}
        <div className="bg-white/10 rounded-2xl p-6 border border-white/20 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Demo Controls</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <button
              onClick={() => setPaymentModalOpen(true)}
              className="flex items-center space-x-2 bg-purple-700 hover:bg-purple-800 text-white px-4 py-3 rounded-lg transition-colors"
            >
              <Send className="h-5 w-5" />
              <span>Privacy Payment</span>
            </button>
            <button
              onClick={() => setPreferencesModalOpen(true)}
              className="flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white px-4 py-3 rounded-lg transition-colors"
            >
              <Settings className="h-5 w-5" />
              <span>Privacy Settings</span>
            </button>
            <div className="flex items-center space-x-2">
              <span className="text-white text-sm">Privacy Level:</span>
              <select
                value={currentPrivacyLevel}
                onChange={(e) => setCurrentPrivacyLevel(e.target.value as PrivacyLevel)}
                className="bg-white/10 border border-white/20 rounded text-white px-3 py-2 text-sm"
              >
                <option value={PrivacyLevel.GIFTWRAPPED}>Giftwrapped</option>
                <option value={PrivacyLevel.ENCRYPTED}>Encrypted</option>
                <option value={PrivacyLevel.MINIMAL}>Minimal</option>
              </select>
            </div>
            <div className="text-center">
              <div className="text-sm text-purple-200">Current User</div>
              <div className="text-white font-semibold">Alice (Parent)</div>
            </div>
          </div>
        </div>

        {/* Main Demo Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Privacy Dashboard */}
          <div className="space-y-6">
            <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
              <h3 className="text-lg font-bold text-white mb-4">Privacy Dashboard</h3>
              <PrivacyDashboardIndicators
                familyId="demo_family"
                showDetailedMetrics={true}
                onPrivacySettingsClick={() => setPreferencesModalOpen(true)}
              />
            </div>

            {/* Family Members Preview */}
            <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
              <h3 className="text-lg font-bold text-white mb-4">Family Members</h3>
              <div className="space-y-3">
                {mockFamilyMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between bg-white/5 rounded-lg p-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                        {member.username?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                      <div>
                        <div className="text-white font-medium">{member.username}</div>
                        <div className="text-purple-200 text-sm capitalize">{member.role}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-semibold">{member.balance?.toLocaleString()} sats</div>
                      <div className="text-green-400 text-sm">Verified</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Privacy Controls */}
          <div className="space-y-6">
            <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
              <h3 className="text-lg font-bold text-white mb-4">Privacy Controls</h3>
              <PrivacyControls
                currentLevel={currentPrivacyLevel}
                onLevelChange={setCurrentPrivacyLevel}
                userRole="adult"
                showMetrics={true}
                privacyMetrics={mockPrivacyMetrics}
              />
            </div>

            {/* Privacy Features */}
            <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
              <h3 className="text-lg font-bold text-white mb-4">Privacy Features</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3">
                    <div className="text-green-400 font-semibold">Cashu eCash</div>
                    <div className="text-green-200 text-sm">Bearer token privacy</div>
                  </div>
                  <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-3">
                    <div className="text-blue-400 font-semibold">LNProxy</div>
                    <div className="text-blue-200 text-sm">Payment routing privacy</div>
                  </div>
                  <div className="bg-purple-500/20 border border-purple-500/30 rounded-lg p-3">
                    <div className="text-purple-400 font-semibold">Fedimint</div>
                    <div className="text-purple-200 text-sm">Family federation</div>
                  </div>
                  <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-3">
                    <div className="text-yellow-400 font-semibold">Gift Wrapped</div>
                    <div className="text-yellow-200 text-sm">Nostr messaging</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Privacy Metrics */}
            <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
              <h3 className="text-lg font-bold text-white mb-4">Privacy Metrics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">85%</div>
                  <div className="text-purple-200 text-sm">Overall Score</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400">127</div>
                  <div className="text-purple-200 text-sm">Transactions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400">78%</div>
                  <div className="text-purple-200 text-sm">LNProxy Usage</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-400">92%</div>
                  <div className="text-purple-200 text-sm">Cashu Privacy</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Integration Status */}
        <div className="mt-8 bg-green-500/20 border border-green-500/30 rounded-2xl p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <h3 className="text-lg font-bold text-green-400">Integration Status: Complete</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-green-300 font-semibold">✅ Backend Integration</div>
              <div className="text-green-200">Privacy-enhanced API service active</div>
            </div>
            <div>
              <div className="text-green-300 font-semibold">✅ Frontend Components</div>
              <div className="text-green-200">All privacy UI components integrated</div>
            </div>
            <div>
              <div className="text-green-300 font-semibold">✅ User Experience</div>
              <div className="text-green-200">Seamless privacy controls available</div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <PrivacyEnhancedPaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        familyMembers={mockFamilyMembers}
        selectedMember={selectedMember}
        onSelectedMemberChange={setSelectedMember}
        onPaymentComplete={(result) => {
          console.log('Demo payment completed:', result);
        }}
      />

      <PrivacyPreferencesModal
        isOpen={preferencesModalOpen}
        onClose={() => setPreferencesModalOpen(false)}
        userRole="adult"
        onPreferencesUpdate={(preferences) => {
          console.log('Demo preferences updated:', preferences);
        }}
      />
    </div>
  );
};

export default PrivacyIntegrationDemo;