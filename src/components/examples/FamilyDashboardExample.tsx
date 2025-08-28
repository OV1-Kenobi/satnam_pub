// Example Family Dashboard with Rebuilding Camelot Authentication
// File: src/components/examples/FamilyDashboardExample.tsx

import React from 'react';
import { useAuth } from '../auth/AuthProvider'; // FIXED: Use unified auth system
import ProtectedFamilyRoute from '../auth/ProtectedFamilyRoute';

const FamilyFinancialsDashboard: React.FC = () => {
  const { userAuth, logout } = useFamilyFederationAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <div className="text-2xl">🏰</div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Family Financials</h1>
                <p className="text-sm text-gray-500">Sovereign Family Banking</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {userAuth?.nip05 || 'Family Member'}
                </p>
                <p className="text-xs text-gray-500">
                  {userAuth?.federationRole || 'Member'} • {userAuth?.votingPower} votes
                </p>
              </div>
              <button
                onClick={logout}
                className="text-sm text-red-600 hover:text-red-800 font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Welcome Card */}
          <div className="bg-white rounded-lg shadow p-6 md:col-span-2 lg:col-span-3">
            <div className="flex items-center space-x-3 mb-4">
              <div className="text-3xl">🎉</div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Welcome to Family Financials!
                </h2>
                <p className="text-gray-600">
                  Authenticated via RebuildingCamelot@satnam.pub
                </p>
              </div>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-medium text-green-800 mb-2">Authentication Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-green-700 font-medium">Nostr Identity:</span>
                  <p className="text-green-600 font-mono text-xs break-all">
                    {userAuth?.npub}
                  </p>
                </div>
                <div>
                  <span className="text-green-700 font-medium">NIP-05:</span>
                  <p className="text-green-600">{userAuth?.nip05 || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-green-700 font-medium">Federation Role:</span>
                  <p className="text-green-600">{userAuth?.federationRole || 'Member'}</p>
                </div>
                <div>
                  <span className="text-green-700 font-medium">Status:</span>
                  <p className="text-green-600">
                    {userAuth?.isWhitelisted ? '✅ Whitelisted' : '❌ Not Whitelisted'} • 
                    {userAuth?.guardianApproved ? ' ✅ Guardian Approved' : ' ⏳ Pending Approval'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Family Treasury */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="text-2xl">💰</div>
              <h3 className="text-lg font-semibold text-gray-900">Family Treasury</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Balance:</span>
                <span className="font-semibold">1,234,567 sats</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Your Allowance:</span>
                <span className="font-semibold">50,000 sats</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Voting Power:</span>
                <span className="font-semibold">{userAuth?.votingPower || 0} votes</span>
              </div>
            </div>
          </div>

          {/* Lightning Channels */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="text-2xl">⚡</div>
              <h3 className="text-lg font-semibold text-gray-900">Lightning Network</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Active Channels:</span>
                <span className="font-semibold">3</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Capacity:</span>
                <span className="font-semibold">5,000,000 sats</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Available:</span>
                <span className="font-semibold text-green-600">4,750,000 sats</span>
              </div>
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="text-2xl">📊</div>
              <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">Family Allowance</p>
                  <p className="text-xs text-gray-500">2 hours ago</p>
                </div>
                <span className="text-green-600 font-semibold">+50,000</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">Coffee Purchase</p>
                  <p className="text-xs text-gray-500">1 day ago</p>
                </div>
                <span className="text-red-600 font-semibold">-2,100</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">Savings Deposit</p>
                  <p className="text-xs text-gray-500">3 days ago</p>
                </div>
                <span className="text-blue-600 font-semibold">+25,000</span>
              </div>
            </div>
          </div>

        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-wrap gap-4">
          <button className="bg-orange-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-orange-600 transition-colors">
            💸 Send Payment
          </button>
          <button className="bg-green-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-600 transition-colors">
            📥 Receive Payment
          </button>
          <button className="bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors">
            🗳️ Family Governance
          </button>
          <button className="bg-purple-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-purple-600 transition-colors">
            📈 Analytics
          </button>
        </div>
      </main>
    </div>
  );
};

// Example of how to use the protected route
const FamilyDashboardExample: React.FC = () => {
  return (
    <ProtectedFamilyRoute 
      requireWhitelist={true}
      requireGuardianApproval={false}
    >
      <FamilyFinancialsDashboard />
    </ProtectedFamilyRoute>
  );
};

export default FamilyDashboardExample;