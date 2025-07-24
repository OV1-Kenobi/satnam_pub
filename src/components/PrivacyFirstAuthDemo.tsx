/**
 * Privacy-First Authentication Demo
 * 
 * Demonstrates the 3 authentication methods:
 * 1. NWC (Nostr Wallet Connect)
 * 2. OTP (One-Time Password)
 * 3. NIP-07 (Browser Extension)
 * 
 * All methods use hashed UUIDs - NO npubs/nip05 stored in database
 */

import { AlertTriangle, Check, Key, Lock, Shield, Smartphone, Wallet, Zap } from 'lucide-react';
import { useState } from 'react';
import { usePrivacyFirstAuth } from '../hooks/usePrivacyFirstAuth';

interface PrivacyFirstAuthDemoProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess?: (method: string) => void;
}

export function PrivacyFirstAuthDemo({
  isOpen,
  onClose,
  onAuthSuccess
}: PrivacyFirstAuthDemoProps) {
  const [authMethod, setAuthMethod] = useState<'nwc' | 'otp' | 'nip07' | null>(null);
  const [privacyLevel, setPrivacyLevel] = useState<'standard' | 'enhanced' | 'maximum'>('enhanced');

  // Form states
  const [nwcString, setNwcString] = useState('');
  const [otpIdentifier, setOtpIdentifier] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [nip07Challenge, setNip07Challenge] = useState('');

  // UI state
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const privacyAuth = usePrivacyFirstAuth();

  // Privacy level descriptions
  const privacyLevels = [
    {
      level: 'standard' as const,
      name: 'Standard Protection',
      description: 'Basic privacy with hashed UUIDs',
      anonymity: 30,
      features: ['Hashed UUID storage', 'Basic encryption', 'Standard session security']
    },
    {
      level: 'enhanced' as const,
      name: 'Enhanced Privacy',
      description: 'Advanced privacy with metadata protection',
      anonymity: 70,
      features: ['Dynamic salt generation', 'Metadata obfuscation', 'Session key rotation']
    },
    {
      level: 'maximum' as const,
      name: 'Maximum Anonymity',
      description: 'Complete anonymity with Perfect Forward Secrecy',
      anonymity: 95,
      features: ['Perfect Forward Secrecy', 'Zero-knowledge storage', 'Advanced timing protection']
    }
  ];

  // Handle NWC Authentication
  const handleNWCAuth = async () => {
    if (!nwcString.trim()) {
      setError('Please enter a valid NWC connection string');
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      const success = await privacyAuth.authenticateNWC(nwcString, privacyLevel);

      if (success) {
        setSuccess('NWC authentication successful! Your identity is now protected with hashed UUIDs.');
        onAuthSuccess?.('nwc');
        setTimeout(() => onClose(), 2000);
      } else {
        setError(privacyAuth.error || 'NWC authentication failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'NWC authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Handle OTP Authentication
  const handleOTPAuth = async () => {
    if (!otpIdentifier.trim() || !otpCode.trim()) {
      setError('Please enter both identifier and OTP code');
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      const success = await privacyAuth.authenticateOTP(otpIdentifier, otpCode, privacyLevel);

      if (success) {
        setSuccess('OTP authentication successful! Your identity is secured with privacy-first protocols.');
        onAuthSuccess?.('otp');
        setTimeout(() => onClose(), 2000);
      } else {
        setError(privacyAuth.error || 'OTP authentication failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'OTP authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Handle NIP-07 Authentication
  const handleNIP07Auth = async () => {
    if (!window.nostr) {
      setError('NIP-07 extension not found. Please install a Nostr browser extension.');
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      // Get public key from extension
      const pubkey = await window.nostr.getPublicKey();

      // Generate challenge
      const challenge = `auth-challenge-${Date.now()}-${Math.random()}`;

      // Create event to sign
      const event = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['challenge', challenge]],
        content: `Privacy-First Authentication Challenge: ${challenge}`,
        pubkey
      };

      // Sign the event
      const signedEvent = await window.nostr.signEvent(event);

      const success = await privacyAuth.authenticateNIP07(
        challenge,
        signedEvent.sig,
        pubkey,
        privacyLevel
      );

      if (success) {
        setSuccess('NIP-07 authentication successful! Your browser extension identity is now privacy-protected.');
        onAuthSuccess?.('nip07');
        setTimeout(() => onClose(), 2000);
      } else {
        setError(privacyAuth.error || 'NIP-07 authentication failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'NIP-07 authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl max-h-[90vh] bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-sm border-b border-white/20 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Privacy-First Authentication</h2>
                <p className="text-purple-200 text-sm">
                  Hashed UUIDs • Perfect Forward Secrecy • Zero PII Storage
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 max-h-[calc(90vh-120px)] overflow-y-auto">
          {/* Privacy Level Selection */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">Choose Privacy Level</h3>
            <div className="grid gap-4 md:grid-cols-3">
              {privacyLevels.map((level) => (
                <button
                  key={level.level}
                  onClick={() => setPrivacyLevel(level.level)}
                  className={`p-4 rounded-xl border-2 transition-all duration-300 text-left ${privacyLevel === level.level
                      ? 'border-purple-400 bg-purple-500/20'
                      : 'border-white/20 bg-white/5 hover:bg-white/10'
                    }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-white">{level.name}</h4>
                    <div className="text-xs bg-purple-600 text-white px-2 py-1 rounded">
                      {level.anonymity}% Anonymous
                    </div>
                  </div>
                  <p className="text-purple-200 text-sm mb-3">{level.description}</p>
                  <ul className="space-y-1">
                    {level.features.map((feature, idx) => (
                      <li key={idx} className="text-xs text-purple-300 flex items-center">
                        <Check className="h-3 w-3 mr-1" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>

          {/* Authentication Methods */}
          {!authMethod && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white mb-4">Select Authentication Method</h3>

              {/* NWC Method */}
              <button
                onClick={() => setAuthMethod('nwc')}
                className="w-full p-6 bg-gradient-to-r from-yellow-600/20 to-yellow-500/20 border border-yellow-500/30 rounded-xl hover:from-yellow-600/30 hover:to-yellow-500/30 transition-all duration-300 text-left"
              >
                <div className="flex items-center space-x-4">
                  <Wallet className="h-8 w-8 text-yellow-400" />
                  <div>
                    <h4 className="text-lg font-semibold text-white">Nostr Wallet Connect (NWC)</h4>
                    <p className="text-yellow-200 text-sm">
                      Connect using your Lightning wallet with NWC string
                    </p>
                  </div>
                </div>
              </button>

              {/* OTP Method */}
              <button
                onClick={() => setAuthMethod('otp')}
                className="w-full p-6 bg-gradient-to-r from-blue-600/20 to-blue-500/20 border border-blue-500/30 rounded-xl hover:from-blue-600/30 hover:to-blue-500/30 transition-all duration-300 text-left"
              >
                <div className="flex items-center space-x-4">
                  <Smartphone className="h-8 w-8 text-blue-400" />
                  <div>
                    <h4 className="text-lg font-semibold text-white">One-Time Password (OTP)</h4>
                    <p className="text-blue-200 text-sm">
                      Secure authentication with temporary codes
                    </p>
                  </div>
                </div>
              </button>

              {/* NIP-07 Method */}
              <button
                onClick={() => setAuthMethod('nip07')}
                className="w-full p-6 bg-gradient-to-r from-green-600/20 to-green-500/20 border border-green-500/30 rounded-xl hover:from-green-600/30 hover:to-green-500/30 transition-all duration-300 text-left"
              >
                <div className="flex items-center space-x-4">
                  <Key className="h-8 w-8 text-green-400" />
                  <div>
                    <h4 className="text-lg font-semibold text-white">NIP-07 Browser Extension</h4>
                    <p className="text-green-200 text-sm">
                      Sign in with your Nostr browser extension
                    </p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
              <div className="flex items-center space-x-2">
                <Check className="h-5 w-5 text-green-400" />
                <span className="text-green-400 font-medium">Success</span>
              </div>
              <p className="text-green-300 text-sm mt-1">{success}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <span className="text-red-400 font-medium">Error</span>
              </div>
              <p className="text-red-300 text-sm mt-1">{error}</p>
            </div>
          )}

          {/* NWC Authentication Form */}
          {authMethod === 'nwc' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">NWC Authentication</h3>
                <button
                  onClick={() => setAuthMethod(null)}
                  className="text-purple-300 hover:text-white text-sm"
                >
                  ← Back
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-purple-200 mb-2">
                  NWC Connection String
                </label>
                <input
                  type="text"
                  value={nwcString}
                  onChange={(e) => setNwcString(e.target.value)}
                  placeholder="nostr+walletconnect://..."
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <button
                onClick={handleNWCAuth}
                disabled={isAuthenticating || !nwcString.trim()}
                className="w-full bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                {isAuthenticating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5" />
                    <span>Connect with NWC</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* OTP Authentication Form */}
          {authMethod === 'otp' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">OTP Authentication</h3>
                <button
                  onClick={() => setAuthMethod(null)}
                  className="text-purple-300 hover:text-white text-sm"
                >
                  ← Back
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-purple-200 mb-2">
                  Identifier (npub or nip05)
                </label>
                <input
                  type="text"
                  value={otpIdentifier}
                  onChange={(e) => setOtpIdentifier(e.target.value)}
                  placeholder="npub1... or user@domain.com"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-purple-200 mb-2">
                  OTP Code (Demo: use 123456)
                </label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <button
                onClick={handleOTPAuth}
                disabled={isAuthenticating || !otpIdentifier.trim() || !otpCode.trim()}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                {isAuthenticating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-5 w-5" />
                    <span>Verify OTP</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* NIP-07 Authentication Form */}
          {authMethod === 'nip07' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">NIP-07 Extension Authentication</h3>
                <button
                  onClick={() => setAuthMethod(null)}
                  className="text-purple-300 hover:text-white text-sm"
                >
                  ← Back
                </button>
              </div>

              <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
                <div className="flex items-start space-x-3">
                  <Key className="h-5 w-5 text-green-400 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-green-400 mb-2">Browser Extension Required</h4>
                    <p className="text-green-300 text-sm">
                      This method requires a NIP-07 compatible Nostr extension like Alby, nos2x, or similar.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleNIP07Auth}
                disabled={isAuthenticating}
                className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                {isAuthenticating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Signing Challenge...</span>
                  </>
                ) : (
                  <>
                    <Shield className="h-5 w-5" />
                    <span>Sign with Extension</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Privacy Information */}
          <div className="mt-8 p-4 bg-purple-800/30 border border-purple-500/50 rounded-lg">
            <div className="flex items-start space-x-3">
              <Shield className="h-5 w-5 text-purple-300 mt-0.5" />
              <div>
                <h4 className="font-semibold text-purple-300 mb-2">Privacy-First Guarantee</h4>
                <ul className="text-purple-200 text-sm space-y-1">
                  <li>• Your npub/nip05 is NEVER stored in our database</li>
                  <li>• Only dynamically hashed UUIDs with per-user salts</li>
                  <li>• Perfect Forward Secrecy with rotating encryption keys</li>
                  <li>• Anonymous by default, user-controlled exposure</li>
                  <li>• Zero-knowledge contact and message storage</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

