// Family Federation Sign-In UI Component
// File: src/components/auth/FamilyFederationSignIn.tsx
// FIXED: Removed deprecated OTP functionality, using unified auth system

import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider'; // FIXED: Use unified auth system

const FamilyFederationSignIn: React.FC = () => {
  const [authStep, setAuthStep] = useState<'input' | 'authenticated'>('input');
  const [nip05, setNip05] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // FIXED: Use unified auth system instead of deprecated family federation auth
  const { authenticated, user, loading: authLoading, error, authenticateNIP05Password, clearError } = useAuth();

  // Handle authentication success
  useEffect(() => {
    if (authenticated && user) {
      setAuthStep('authenticated');
      setMessage(
        `🎉 Successfully authenticated! Welcome to Family Financials.\n` +
        `Role: ${user.federationRole || 'Member'}\n` +
        `Voting power: ${user.votingPower}`
      );

      // Redirect after a brief delay to show success message
      setTimeout(() => {
        window.location.href = '/dashboard/family-financials';
      }, 2000);
    }
  }, [authenticated, user]);

  // FIXED: Replace deprecated OTP with NIP-05/password authentication
  const handleAuthentication = async () => {
    if (!nip05.trim() || !password.trim()) {
      setMessage('❌ Please enter both NIP-05 and password');
      return;
    }

    setLoading(true);
    setMessage('');
    clearError();

    try {
      const success = await authenticateNIP05Password(nip05, password);
      if (success) {
        setMessage('✅ Authentication successful! Redirecting...');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      setMessage(`❌ Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // FIXED: Clean form reset for NIP-05/password authentication
  const resetForm = () => {
    setAuthStep('input');
    setNip05('');
    setPassword('');
    setMessage('');
    clearError();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg border border-orange-200 p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏰</div>
          <h1 className="text-2xl font-bold text-gray-900">Family Federation Access</h1>
          <p className="text-gray-600 mt-2">
            Secure authentication via <span className="font-semibold">RebuildingCamelot@my.satnam.pub</span>
          </p>
        </div>

        {authStep === 'input' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                NIP-05 Address *
              </label>
              <input
                type="email"
                value={nip05}
                onChange={(e) => setNip05(e.target.value)}
                placeholder="username@my.satnam.pub"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Your family federation NIP-05 identifier
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password *
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                required
              />
            </div>

            <button
              onClick={handleAuthentication}
              disabled={loading || !nip05.trim() || !password.trim()}
              className="w-full bg-purple-800 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Authenticating...
                </span>
              ) : (
                '🔐 Sign In to Family Federation'
              )}
            </button>
          </div>
        )}

        {/* FIXED: Removed deprecated OTP UI - using NIP-05/password authentication only */}

        {authStep === 'authenticated' && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">Authentication Successful!</h2>
            <p className="text-gray-600">Redirecting to Family Financials...</p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 text-sm">
                Welcome to the Family Federation! You now have access to secure family financial tools.
              </p>
            </div>
          </div>
        )}

        {/* Error Display */}
        {(error || message) && (
          <div className="mt-4 p-4 rounded-lg bg-gray-50 border">
            <p className="text-sm whitespace-pre-line text-gray-700">
              {error || message}
            </p>
          </div>
        )}

        {/* Reset Button - FIXED: Only show for authenticated state */}
        {authStep === 'authenticated' && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={resetForm}
              className="w-full text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
            >
              Sign In as Different User
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FamilyFederationSignIn;