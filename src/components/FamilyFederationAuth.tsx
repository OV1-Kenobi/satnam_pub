// Family Federation Authentication Component
// File: src/components/FamilyFederationAuth.tsx
// Supports both modal and dedicated page modes with enhanced security messaging
// Now includes dual authentication: Traditional OTP and NWC (Nostr Wallet Connect)

import { AlertTriangle, ArrowRight, Clock, MessageCircle, RefreshCw, Shield, Wallet, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthResponse, FamilyFederationUser, NWCAuthResponse, VerificationResponse } from '../types/auth';
import { handleAuthenticationSuccess, isSuccessfulAuthResponse } from '../utils/authSuccessHandler';
import { useAuth } from './auth/FamilyFederationAuth';
import NWCModal from './NWCModal';

interface FamilyFederationAuthProps {
  mode?: 'modal' | 'page';
  onClose?: () => void;
  onSuccess?: (user: FamilyFederationUser) => void;
  redirectUrl?: string;
}

interface AuthContentProps {
  mode: 'modal' | 'page';
  onClose?: () => void;
  authStep: 'method-selection' | 'input' | 'otp' | 'nwc-auth' | 'authenticated';
  authMethod: 'otp' | 'nwc' | null;
  npub: string;
  nip05: string;
  otp: string;
  loading: boolean;
  message: string;
  expiresIn: number;
  attemptsRemaining: number;
  contentClasses: string;
  setAuthMethod: (method: 'otp' | 'nwc' | null) => void;
  setAuthStep: (step: 'method-selection' | 'input' | 'otp' | 'nwc-auth' | 'authenticated') => void;
  setNpub: (npub: string) => void;
  setNip05: (nip05: string) => void;
  setOtp: (otp: string) => void;
  handleOTPRequest: () => Promise<void>;
  handleOTPVerification: () => Promise<void>;
  handleNWCSignIn: () => Promise<void>;
  resetForm: () => void;
  formatTime: (seconds: number) => string;
}

const AuthContent = React.memo<AuthContentProps>(({
  mode,
  onClose,
  authStep,
  authMethod,
  npub,
  nip05,
  otp,
  loading,
  message,
  expiresIn,
  attemptsRemaining,
  contentClasses,
  setAuthMethod,
  setAuthStep,
  setNpub,
  setNip05,
  setOtp,
  handleOTPRequest,
  handleOTPVerification,
  handleNWCSignIn,
  resetForm,
  formatTime
}) => (
  <div className={mode === 'page' ? contentClasses : ''}>
    {/* Modal Close Button */}
    {mode === 'modal' && onClose && (
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Close authentication modal"
      >
        <X className="h-6 w-6" />
      </button>
    )}

    {/* Header */}
    <div className="text-center mb-6">
      <div className="text-4xl mb-2">🏰</div>
      <h1 className="text-2xl font-bold text-gray-900">Family Federation Access</h1>
      <p className="text-gray-600 mt-2">
      Choose your preferred authentication method
      </p>
    </div>

    {/* Method Selection Step */}
    {authStep === 'method-selection' && (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-gray-900 text-center mb-6">
          Select Authentication Method
        </h3>
        
        {/* NWC Option */}
        <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-2xl p-6 border border-orange-200 hover:border-orange-300 transition-all duration-300">
          <div className="flex items-start space-x-4 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Wallet className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-gray-900 font-bold text-lg mb-2">
                Nostr Wallet Connect (NWC)
              </h4>
              <p className="text-gray-600 text-sm mb-4">
                Fast and secure authentication using your compatible Nostr wallet. 
                Perfect for users with NWC-enabled wallets like Alby, Zeus, or Mutiny.
              </p>
              <div className="flex items-center space-x-2 text-orange-600 text-sm">
                <Shield className="h-4 w-4" />
                <span>Instant • Secure • No OTP required</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setAuthMethod('nwc');
              setAuthStep('nwc-auth');
            }}
            className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
          >
            <Wallet className="h-5 w-5" />
            <span>Sign in with NWC</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>

        {/* Traditional OTP Option */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-6 border border-purple-200 hover:border-purple-300 transition-all duration-300">
          <div className="flex items-start space-x-4 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
              <MessageCircle className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-gray-900 font-bold text-lg mb-2">
                One-Time Password via Nostr DM
              </h4>
              <p className="text-gray-600 text-sm mb-4">
                Receive a secure verification code via direct message on Nostr. 
                Works with any Nostr client that supports DMs.
              </p>
              <div className="flex items-center space-x-2 text-purple-600 text-sm">
                <Shield className="h-4 w-4" />
                <span>Secure • Universal • Works with any Nostr client</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setAuthMethod('otp');
              setAuthStep('input');
            }}
            className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
          >
            <MessageCircle className="h-5 w-5" />
            <span>Sign in with Nostr DM</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-500">
            🔒 Both methods are secured by Nostr cryptography and Supabase Vault
          </p>
        </div>
      </div>
    )}

    {/* NWC Authentication Step */}
    {authStep === 'nwc-auth' && (
      <div className="space-y-6">
        <div className="flex items-center space-x-4 mb-6">
          <button
            onClick={() => setAuthStep('method-selection')}
            className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all duration-300"
          >
            <ArrowRight className="h-5 w-5 text-gray-600 rotate-180" />
          </button>
          <h3 className="text-lg font-semibold text-gray-900">
            Nostr Wallet Connect Authentication
          </h3>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
          <div className="flex items-start space-x-3">
            <Wallet className="h-6 w-6 text-orange-600 flex-shrink-0 mt-1" />
            <div>
              <h4 className="text-orange-900 font-semibold mb-2">
                Connect Your Nostr Wallet
              </h4>
              <p className="text-orange-800 text-sm mb-4">
                You'll be prompted to enter your Nostr Wallet Connect URI. This can be found in:
              </p>
              <ul className="text-orange-700 text-sm space-y-1 mb-4">
                <li>• <strong>Alby:</strong> Settings → Wallet Connect</li>
                <li>• <strong>Zeus:</strong> Settings → NWC</li>
                <li>• <strong>Mutiny:</strong> Settings → Nostr Wallet Connect</li>
                <li>• <strong>Other wallets:</strong> Look for "NWC" or "Wallet Connect"</li>
              </ul>
              <p className="text-orange-600 text-xs">
                ⚠️ Only share your NWC URI with trusted applications
                </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleNWCSignIn}
          disabled={loading}
          className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
        >
          {loading ? (
            <RefreshCw className="h-5 w-5 animate-spin" />
          ) : (
            <Wallet className="h-5 w-5" />
          )}
          <span>
            {loading ? "Connecting..." : "Connect Wallet & Authenticate"}
          </span>
        </button>
      </div>
    )}

    {/* Traditional OTP Input Step */}
    {authStep === 'input' && (
      <div className="space-y-4">
        <div className="flex items-center space-x-4 mb-6">
          <button
            onClick={() => setAuthStep('method-selection')}
            className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all duration-300"
          >
            <ArrowRight className="h-5 w-5 text-gray-600 rotate-180" />
          </button>
          <h3 className="text-lg font-semibold text-gray-900">
            Nostr DM Authentication
          </h3>
        </div>
        
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
          <p className="text-purple-800 text-sm">
            <span className="font-semibold">Secure authentication via</span> <span className="font-mono text-purple-900">RebuildingCamelot@satnam.pub</span>
          </p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nostr Public Key (npub) *
          </label>
          <input
            type="text"
            value={npub}
            onChange={(e) => setNpub(e.target.value)}
            placeholder="npub1..."
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
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
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
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
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
              Sending OTP...
            </span>
          ) : (
            '🔐 Send OTP via Nostr DM'
          )}
        </button>
      </div>
    )}

    {/* OTP Step */}
    {authStep === 'otp' && (
      <div className="space-y-4">
        <div className="flex items-center space-x-4 mb-6">
          <button
            onClick={() => setAuthStep('input')}
            className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all duration-300"
          >
            <ArrowRight className="h-5 w-5 text-gray-600 rotate-180" />
          </button>
          <h3 className="text-lg font-semibold text-gray-900">
            Enter Verification Code
          </h3>
        </div>
        
        {/* Security Notice */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-purple-600" />
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

        {/* OTP Instructions */}
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
              <div className="flex items-center justify-center space-x-2 text-purple-600 text-xs font-mono">
                <Clock className="h-4 w-4" />
                <span>Expires in: {formatTime(expiresIn)}</span>
              </div>
            )}
          </div>
        </div>

        {/* OTP Input */}
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
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-center text-lg font-mono tracking-wider"
            autoComplete="one-time-code"
          />
          {attemptsRemaining < 3 && (
            <p className="text-xs text-amber-600 mt-1">
              ⚠️ {attemptsRemaining} attempts remaining
            </p>
          )}
        </div>

        {/* Verify Button */}
        <button
          onClick={handleOTPVerification}
          disabled={loading || otp.length !== 6 || expiresIn <= 0}
          className="w-full bg-purple-800 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
              Verifying...
            </span>
          ) : (
            '✅ Verify OTP'
          )}
        </button>

        {/* Action Buttons */}
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

    {/* Success Step */}
    {authStep === 'authenticated' && (
      <div className="text-center space-y-4">
        <div className="text-6xl">🎉</div>
        <h2 className="text-xl font-bold text-green-700">Authentication Successful!</h2>
        <p className="text-gray-600">
          {mode === 'modal' ? 'Access granted!' : 'Redirecting to Family Financials dashboard...'}
        </p>
        <button
          onClick={resetForm}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Start over
        </button>
      </div>
    )}

    {/* Message Display */}
    {message && (
      <div className={`mt-4 p-3 rounded-lg border ${
        message.includes('❌') 
          ? 'bg-red-50 border-red-200 text-red-800' 
          : message.includes('✅') || message.includes('🎉')
          ? 'bg-green-50 border-green-200 text-green-800'
          : 'bg-blue-50 border-blue-200 text-blue-800'
      }`}>
        <p className="text-sm whitespace-pre-line">{message}</p>
      </div>
    )}

    {/* Footer */}
    <div className="mt-6 pt-4 border-t border-gray-200">
      <p className="text-xs text-gray-500 text-center">
        🔒 Secured by Nostr cryptography and Supabase Vault
      </p>
    </div>
  </div>
));

AuthContent.displayName = 'AuthContent';

const FamilyFederationAuth: React.FC<FamilyFederationAuthProps> = ({
  mode = 'page',
  onClose,
  onSuccess,
  redirectUrl = '/dashboard/family-financials'
}) => {
  const { login } = useAuth();
  const [authStep, setAuthStep] = useState<'method-selection' | 'input' | 'otp' | 'nwc-auth' | 'authenticated'>('method-selection');
  const [authMethod, setAuthMethod] = useState<'otp' | 'nwc' | null>(null);
  const [npub, setNpub] = useState('');
  const [nip05, setNip05] = useState('');
  const [otp, setOtp] = useState('');
  const [otpKey, setOtpKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [expiresIn, setExpiresIn] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [showNWCModal, setShowNWCModal] = useState(false);

  // Timer ref for better cleanup management
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Timer cleanup
  useEffect(() => {
    // Clear any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (expiresIn > 0) {
      timerRef.current = setInterval(() => {
        setExpiresIn(prev => {
          if (prev <= 1) {
            setMessage('⏰ OTP has expired. Please request a new one.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [expiresIn]);

  // Cleanup timer on component unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const handleOTPRequest = async () => {
    setLoading(true);
    setMessage('');
    
    try {
      const response = await fetch('/api/auth/otp/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          npub: npub.trim(),
          nip05: nip05.trim() || undefined
        })
      });
      
      const result: AuthResponse = await response.json();
      
      if (result.success && result.data) {
        setAuthStep('otp');
        setOtpKey(result.data.otpKey);
        setExpiresIn(result.data.expiresIn);
        setMessage(
          `✅ OTP sent successfully! Check your Nostr DMs for a message from ${result.data.sender}. ` +
          `The code expires in ${Math.floor(result.data.expiresIn / 60)} minutes.`
        );
      } else {
        setMessage(`❌ Failed to send OTP: ${result.error || 'Unknown error'}`);
        if (result.details) {
          setMessage(prev => `${prev}\nDetails: ${result.details}`);
        }
      }
    } catch (error) {
      console.error('OTP request error:', error);
      setMessage('❌ Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPVerification = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          otpKey,
          otp: otp.trim()
        })
      });
      
      const result: VerificationResponse = await response.json();
      
      if (isSuccessfulAuthResponse(result)) {
        handleAuthenticationSuccess(result, 'otp', {
          setAuthStep,
          setMessage,
          login,
          onSuccess,
          onClose,
          mode,
          redirectUrl
        });
      } else {
        setAttemptsRemaining(result.attemptsRemaining || 0);
        setMessage(
          `❌ ${result.error || 'Verification failed'}` +
          (result.attemptsRemaining ? ` (${result.attemptsRemaining} attempts remaining)` : '')
        );
        
        if (result.attemptsRemaining === 0) {
          setMessage(prev => `${prev}\nPlease request a new OTP.`);
          setAuthStep('input');
          setOtp('');
          setOtpKey('');
        }
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      setMessage('❌ Network error during verification. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleNWCSignIn = async () => {
    // Show the NWC modal instead of using prompt
    setShowNWCModal(true);
  };

  const handleNWCSubmit = async (nwcUri: string): Promise<void> => {
    setLoading(true);
    setMessage('');
    setShowNWCModal(false);
    
    try {

      const response = await fetch("/api/auth/nwc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nwcUri }),
      });

      const result: NWCAuthResponse = await response.json();

      if (isSuccessfulAuthResponse(result)) {
        handleAuthenticationSuccess(result, 'nwc', {
          setAuthStep,
          setMessage,
          login,
          onSuccess,
          onClose,
          mode,
          redirectUrl
        });
      } else {
        setMessage(`❌ NWC authentication failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("NWC sign-in failed:", error);
      setMessage("❌ NWC authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    // Clear timer immediately for better cleanup
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    setAuthStep('method-selection');
    setAuthMethod(null);
    setNpub('');
    setNip05('');
    setOtp('');
    setOtpKey('');
    setMessage('');
    setExpiresIn(0);
    setAttemptsRemaining(3);
    setShowNWCModal(false);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const containerClasses = mode === 'modal' 
    ? "bg-white rounded-xl shadow-2xl border border-purple-200 p-8 max-w-lg w-full mx-4 relative min-h-[400px]"
    : "min-h-screen bg-gradient-to-br from-purple-50 to-purple-100 flex items-center justify-center p-4";

  const contentClasses = mode === 'modal' 
    ? ""
    : "bg-white rounded-xl shadow-lg border border-purple-200 p-8 max-w-lg w-full";

  // Memoize handler functions to prevent unnecessary re-renders
  const memoizedHandleOTPRequest = useCallback(handleOTPRequest, [npub, nip05]);
  const memoizedHandleOTPVerification = useCallback(handleOTPVerification, [otpKey, otp]);
  const memoizedHandleNWCSignIn = useCallback(handleNWCSignIn, []);
  const memoizedResetForm = useCallback(resetForm, []);
  const memoizedFormatTime = useCallback(formatTime, []);

  // Memoize AuthContent props to prevent unnecessary re-renders
  const authContentProps = useMemo(() => ({
    mode,
    onClose,
    authStep,
    authMethod,
    npub,
    nip05,
    otp,
    loading,
    message,
    expiresIn,
    attemptsRemaining,
    contentClasses,
    setAuthMethod,
    setAuthStep,
    setNpub,
    setNip05,
    setOtp,
    handleOTPRequest: memoizedHandleOTPRequest,
    handleOTPVerification: memoizedHandleOTPVerification,
    handleNWCSignIn: memoizedHandleNWCSignIn,
    resetForm: memoizedResetForm,
    formatTime: memoizedFormatTime
  }), [
    mode,
    onClose,
    authStep,
    authMethod,
    npub,
    nip05,
    otp,
    loading,
    message,
    expiresIn,
    attemptsRemaining,
    contentClasses,
    memoizedHandleOTPRequest,
    memoizedHandleOTPVerification,
    memoizedHandleNWCSignIn,
    memoizedResetForm,
    memoizedFormatTime
  ]);

  if (mode === 'modal') {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className={containerClasses}>
            <AuthContent {...authContentProps} />
          </div>
        </div>
        
        {/* NWC Modal */}
        <NWCModal
          isOpen={showNWCModal}
          onClose={() => setShowNWCModal(false)}
          onSubmit={handleNWCSubmit}
          isLoading={loading}
        />
      </>
    );
  }

  return (
    <>
      <div className={containerClasses}>
        <AuthContent {...authContentProps} />
      </div>
      
      {/* NWC Modal */}
      <NWCModal
        isOpen={showNWCModal}
        onClose={() => setShowNWCModal(false)}
        onSubmit={handleNWCSubmit}
        isLoading={loading}
      />
    </>
  );
};

export default FamilyFederationAuth;