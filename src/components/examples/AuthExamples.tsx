// Authentication Integration Examples
// File: src/components/examples/AuthExamples.tsx
// Demonstrates various ways to integrate Family Federation authentication

import React, { useState } from 'react';
import { useFamilyAuthOTP } from '../../hooks/useFamilyAuth';
import { FamilyFederationUser } from '../../types/auth';
import ProtectedRoute from '../ProtectedRoute';
import SignInModal from '../SignInModal';

// Example 1: Button that triggers authentication modal
export const AuthModalExample: React.FC = () => {
  const [showModal, setShowModal] = useState(false);

  const handleAuthSuccess = (user: FamilyFederationUser) => {
    console.log('User authenticated:', user);
    // Handle successful authentication
    // e.g., redirect to protected content, update UI state, etc.
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Modal Authentication Example</h2>
      <button
        onClick={() => setShowModal(true)}
        className="bg-purple-800 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors"
      >
        Access Family Financials
      </button>
      
      <SignInModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSignInSuccess={() => setShowModal(false)}
        onCreateNew={() => setShowModal(false)}
        destination="family"
      />
    </div>
  );
};

// Example 2: Protected content with automatic authentication
export const ProtectedContentExample: React.FC = () => {
  return (
    <ProtectedRoute
      requireAuth={true}
      allowedRoles={['parent', 'guardian']}
      authMode="modal"
    >
      <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
        <h2 className="text-xl font-bold text-green-800 mb-2">
          🎉 Protected Content
        </h2>
        <p className="text-green-700">
          This content is only visible to authenticated family members with parent or guardian roles.
        </p>
      </div>
    </ProtectedRoute>
  );
};

// Example 3: Custom authentication flow using the hook
export const CustomAuthExample: React.FC = () => {
  const { sendOTP, verifyOTP, isLoading, error, clearError } = useFamilyAuthOTP();
  const [step, setStep] = useState<'input' | 'otp'>('input');
  const [npub, setNpub] = useState('');
  const [otp, setOtp] = useState('');
  const [otpKey, setOtpKey] = useState('');

  const handleSendOTP = async () => {
    const result = await sendOTP(npub);
    if (result.success && result.otpKey) {
      setOtpKey(result.otpKey);
      setStep('otp');
    }
  };

  const handleVerifyOTP = async () => {
    const result = await verifyOTP(otpKey, otp);
    if (result.success && result.user) {
      console.log('Authentication successful:', result.user);
      // Handle success - user is now authenticated
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Custom Authentication Flow</h2>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg mb-4">
          <p className="text-sm">{error}</p>
          <button
            onClick={clearError}
            className="text-xs underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {step === 'input' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nostr Public Key (npub)
            </label>
            <input
              type="text"
              value={npub}
              onChange={(e) => setNpub(e.target.value)}
              placeholder="npub1..."
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <button
            onClick={handleSendOTP}
            disabled={isLoading || !npub.trim()}
            className="w-full bg-purple-800 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Sending...' : 'Send OTP'}
          </button>
        </div>
      )}

      {step === 'otp' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter OTP Code
            </label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-center text-lg font-mono"
            />
          </div>
          <button
            onClick={handleVerifyOTP}
            disabled={isLoading || otp.length !== 6}
            className="w-full bg-purple-800 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Verifying...' : 'Verify OTP'}
          </button>
          <button
            onClick={() => setStep('input')}
            className="w-full border border-purple-300 text-purple-700 py-3 px-4 rounded-lg font-medium hover:bg-purple-50 transition-colors"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
};

// Example 4: Navigation component with authentication
export const AuthenticatedNavExample: React.FC = () => {
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleFamilyFinancialsClick = () => {
    setShowAuthModal(true);
  };

  const handleAuthSuccess = (user: FamilyFederationUser) => {
    // Redirect to family financials dashboard
    window.location.href = '/dashboard/family-financials';
  };

  return (
    <nav className="bg-white shadow-lg p-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-bold text-gray-800">Satnam.pub</div>
        <div className="space-x-4">
          <button className="text-gray-600 hover:text-gray-800">
            Public Content
          </button>
          <button
            onClick={handleFamilyFinancialsClick}
            className="bg-purple-800 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Family Financials
          </button>
        </div>
      </div>

      <SignInModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSignInSuccess={() => setShowAuthModal(false)}
        onCreateNew={() => setShowAuthModal(false)}
        destination="family"
      />
    </nav>
  );
};

export default {
  AuthModalExample,
  ProtectedContentExample,
  CustomAuthExample,
  AuthenticatedNavExample
};