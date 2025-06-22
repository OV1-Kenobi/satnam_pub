// Family Federation Sign-In UI Component
// File: src/components/auth/FamilyFederationSignIn.tsx

import React, { useEffect, useState } from 'react';
import { useFamilyFederationAuth } from '../../hooks/useFamilyFederationAuth';

const FamilyFederationSignIn: React.FC = () => {
  const [authStep, setAuthStep] = useState<'input' | 'otp' | 'authenticated'>('input');
  const [npub, setNpub] = useState('');
  const [nip05, setNip05] = useState('');
  const [otp, setOtp] = useState('');
  const [otpKey, setOtpKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [expiresIn, setExpiresIn] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);

  const { sendOTP, verifyOTP, isAuthenticated, user, error, clearError } = useFamilyFederationAuth();

  // Handle authentication success
  useEffect(() => {
    if (isAuthenticated && user) {
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
  }, [isAuthenticated, user]);

  const handleOTPRequest = async () => {
    setLoading(true);
    setMessage('');
    clearError();
    
    try {
      await sendOTP(npub, nip05);
      
      // If we get here, OTP was sent successfully
      setAuthStep('otp');
      setExpiresIn(300); // 5 minutes default
      setMessage(
        `✅ OTP sent successfully! Check your Nostr DMs for a message from rebuildingcamelot@satnam.pub. ` +
        `The code expires in 5 minutes.`
      );
      
      // Start countdown timer
      const timer = setInterval(() => {
        setExpiresIn(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setMessage('⏰ OTP has expired. Please request a new one.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
    } catch (error) {
      console.error('OTP request error:', error);
      setMessage(`❌ Failed to send OTP: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOTPVerification = async () => {
    setLoading(true);
    clearError();
    
    try {
      await verifyOTP(otpKey, otp);
      // Success is handled by the useEffect above
    } catch (error) {
      console.error('OTP verification error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Verification failed';
      
      // Extract attempts remaining from error message if present
      const attemptsMatch = errorMessage.match(/\((\d+) attempts remaining\)/);
      if (attemptsMatch) {
        const remaining = parseInt(attemptsMatch[1]);
        setAttemptsRemaining(remaining);
        
        if (remaining === 0) {
          setMessage(prev => `${errorMessage}\nPlease request a new OTP.`);
          setAuthStep('input');
          setOtp('');
          setOtpKey('');
        } else {
          setMessage(`❌ ${errorMessage}`);
        }
      } else {
        setMessage(`❌ ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setAuthStep('input');
    setNpub('');
    setNip05('');
    setOtp('');
    setOtpKey('');
    setMessage('');
    setExpiresIn(0);
    setAttemptsRemaining(3);
    clearError();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg border border-orange-200 p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏰</div>
          <h1 className="text-2xl font-bold text-gray-900">Family Federation Access</h1>
          <p className="text-gray-600 mt-2">
            Secure authentication via <span className="font-semibold">RebuildingCamelot@satnam.pub</span>
          </p>
        </div>

        {authStep === 'input' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nostr Public Key (npub) *
              </label>
              <input
                type="text"
                value={npub}
                onChange={(e) => setNpub(e.target.value)}
                placeholder="npub1..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                NIP-05 Address (optional)
              </label>
              <input
                type="email"
                value={nip05}
                onChange={(e) => setNip05(e.target.value)}
                placeholder="username@satnam.pub"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Helps verify your identity in the federation
              </p>
            </div>

            <button
              onClick={handleOTPRequest}
              disabled={loading || !npub.trim()}
              className="w-full bg-purple-800 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending OTP...
                </span>
              ) : (
                '🔐 Send OTP via Nostr DM'
              )}
            </button>
          </div>
        )}

        {authStep === 'otp' && (
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-purple-800">
                    🔐 SECURITY NOTICE - Verify Message Source
                  </h3>
                  <div className="mt-2 text-sm text-purple-700">
                    <p className="font-semibold">Your OTP will ONLY come from:</p>
                    <p className="bg-white px-2 py-1 rounded border font-mono text-purple-900 mt-1">
                      rebuildingcamelot@satnam.pub
                    </p>
                    <p className="mt-2">
                      ⚠️ Do NOT trust OTP messages from any other Nostr account
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="text-center">
                <h4 className="font-semibold text-purple-900 mb-2">
                  📩 Check Your Nostr DMs
                </h4>
                <p className="text-purple-800 text-sm mb-3">
                  Look for a message from the verified account:
                </p>
                <div className="bg-white border-2 border-purple-300 rounded-lg p-3 mb-3">
                  <p className="font-mono font-bold text-purple-900 text-lg">
                    rebuildingcamelot@satnam.pub
                  </p>
                </div>
                <p className="text-purple-700 text-xs mb-2">
                  This is the ONLY authorized source for Family Federation OTP codes
                </p>
                {expiresIn > 0 && (
                  <p className="text-purple-600 text-xs font-mono">
                    ⏰ Expires in: {formatTime(expiresIn)}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter 6-Digit OTP Code
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500 text-center text-lg font-mono tracking-wider"
                autoComplete="one-time-code"
              />
              {attemptsRemaining < 3 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ {attemptsRemaining} attempts remaining
                </p>
              )}
            </div>

            <button
              onClick={handleOTPVerification}
              disabled={loading || otp.length !== 6 || expiresIn <= 0}
              className="w-full bg-purple-800 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Verifying...
                </span>
              ) : (
                '✅ Verify OTP'
              )}
            </button>

            <div className="flex space-x-2">
              <button
                onClick={() => setAuthStep('input')}
                className="flex-1 border border-purple-300 text-purple-700 py-3 px-4 rounded-lg font-medium hover:bg-purple-50 transition-colors"
              >
                ← Back to Input
              </button>
              <button
                onClick={handleOTPRequest}
                disabled={loading}
                className="flex-1 border border-purple-300 text-purple-700 py-3 px-4 rounded-lg font-medium hover:bg-purple-50 transition-colors disabled:opacity-50"
              >
                🔄 Resend OTP
              </button>
            </div>
          </div>
        )}

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

        {/* Reset Button */}
        {authStep !== 'input' && authStep !== 'authenticated' && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={resetForm}
              className="w-full text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
            >
              Start Over
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FamilyFederationSignIn;