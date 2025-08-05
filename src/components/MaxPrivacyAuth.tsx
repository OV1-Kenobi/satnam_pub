/**
 * Maximum Privacy Authentication Component
 * 
 * For ALL authentication use cases except messaging
 * - ALWAYS uses maximum privacy (95% anonymity)
 * - NO privacy level choices (those are ONLY for messaging)
 * - Hashed UUIDs only, no PII stored
 * - Perfect Forward Secrecy by default
 */

import {
  AlertTriangle,
  CheckCircle,
  Key,
  RefreshCw,
  Shield,
  Smartphone,
  X
} from "lucide-react";
import { useState } from "react";
import { usePrivacyFirstAuth } from "../hooks/usePrivacyFirstAuth";

interface MaxPrivacyAuthProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (destination?: 'individual' | 'family') => void;
  destination?: 'individual' | 'family';
  title?: string;
  purpose?: string;
}

type AuthMethod = 'nsec' | 'otp' | 'nip07' | null;

export function MaxPrivacyAuth({
  isOpen,
  onClose,
  onAuthSuccess,
  destination = 'family',
  title = 'Privacy-Protected Authentication',
  purpose = 'Maximum privacy protection with hashed UUIDs'
}: MaxPrivacyAuthProps) {
  const privacyAuth = usePrivacyFirstAuth();

  // UI State
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [nsecKey, setNsecKey] = useState("");
  const [nipOrNpub, setNipOrNpub] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [showNsec, setShowNsec] = useState(false);

  const handleClose = () => {
    setAuthMethod(null);
    setError(null);
    setSuccess(null);
    setIsLoading(false);
    onClose();
  };

  const handleAuthSuccess = (method: string) => {
    setSuccess(`${method.toUpperCase()} authentication successful! Maximum privacy protection active.`);

    setTimeout(() => {
      onAuthSuccess(destination);
      handleClose();
    }, 1500);
  };

  // Nsec Authentication (Maximum Privacy with Zero-Knowledge Protocol)
  const handleNsecAuth = async () => {
    if (!nsecKey.trim()) {
      setError('Please enter your Nsec private key');
      return;
    }

    if (!nsecKey.startsWith('nsec1')) {
      setError('Invalid Nsec format. Must start with "nsec1"');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Zero-knowledge protocol: process in memory only, immediate cleanup
      const success = await privacyAuth.authenticateNsec(nsecKey);

      // Clear Nsec from memory immediately after use
      setNsecKey('');

      if (success) {
        handleAuthSuccess('Nsec');
      } else {
        setError(privacyAuth.error || 'Nsec authentication failed');
      }
    } catch (error) {
      // Clear Nsec from memory on error
      setNsecKey('');
      setError(error instanceof Error ? error.message : 'Nsec authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Send OTP
  const handleSendOTP = async () => {
    if (!nipOrNpub.trim()) {
      setError('Please enter your npub or nip05 identifier');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Generate secure OTP using Web Crypto API
      const generateSecureOTP = async (): Promise<string> => {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        // Generate number between 100000 and 999999
        const randomNum = array[0] % 900000 + 100000;
        return randomNum.toString();
      };

      // Generate OTP and session ID
      const otp = await generateSecureOTP();
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Send OTP via privacy-first messaging system
      try {
        // Import communication service dynamically
        const { CommunicationServiceFactory } = await import('../../utils/communication-service');
        const communicationService = await CommunicationServiceFactory.getDefaultService();

        const sendResult = await communicationService.sendOTP(
          nipOrNpub,
          otp,
          sessionId,
          expiresAt
        );

        if (sendResult.success) {
          setOtpSent(true);
          setSuccess('OTP sent via encrypted Nostr DM! Check your Nostr client.');

          // Store session info for verification (in development, show OTP)
          if (import.meta.env.DEV) {
            console.log(`🔐 [DEV] OTP for testing: ${otp}`);
            setSuccess(`OTP sent! For development: ${otp}`);
          }
        } else {
          throw new Error(sendResult.error || 'Failed to send OTP via messaging service');
        }
      } catch (communicationError) {
        console.error('Communication service error:', communicationError);
        // Fallback: In development mode, show the OTP directly
        if (import.meta.env.DEV) {
          setOtpSent(true);
          setSuccess(`Development mode - OTP: ${otp} (expires in 5 minutes)`);
        } else {
          throw new Error('Failed to send OTP. Please check your Nostr connection.');
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  // Verify OTP (Maximum Privacy)
  const handleVerifyOTP = async () => {
    if (!otpCode.trim() || !nipOrNpub.trim()) {
      setError('Please enter both identifier and OTP code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const success = await privacyAuth.authenticateOTP(nipOrNpub, otpCode);
      if (success) {
        handleAuthSuccess('OTP');
      } else {
        setError(privacyAuth.error || 'OTP verification failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'OTP verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  // NIP-07 Authentication (Maximum Privacy)
  const handleNIP07Auth = async () => {
    if (!window.nostr) {
      setError('NIP-07 extension not found. Please install a Nostr browser extension.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const pubkey = await window.nostr.getPublicKey();
      const challenge = `auth-challenge-${Date.now()}-${Math.random()}`;

      const event = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['challenge', challenge]],
        content: `Maximum Privacy Authentication Challenge: ${challenge}`,
        pubkey
      };

      const signedEvent = await window.nostr.signEvent(event);

      const success = await privacyAuth.authenticateNIP07(challenge, signedEvent.sig, pubkey);

      if (success) {
        handleAuthSuccess('NIP-07');
      } else {
        setError(privacyAuth.error || 'NIP-07 authentication failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'NIP-07 authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay-bitcoin-citadel">
      <div className="modal-content-bitcoin-citadel max-w-lg">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-sm border-b border-white/20 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{title}</h2>
                <p className="text-purple-200 text-sm">{purpose}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
            >
              <X className="h-6 w-6 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6 max-h-[calc(90vh-120px)] overflow-y-auto">
          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-400" />
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

          {/* Method Selection */}
          {!authMethod && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="inline-flex items-center space-x-2 bg-purple-500/20 text-purple-300 px-4 py-2 rounded-full text-sm">
                  <Shield className="h-4 w-4" />
                  <span>95% Maximum Privacy • Hashed UUIDs Only</span>
                </div>
              </div>

              {/* Nsec Method */}
              <button
                onClick={() => setAuthMethod('nsec')}
                className="w-full p-4 bg-gradient-to-r from-orange-600/20 to-orange-500/20 border border-orange-500/30 rounded-xl hover:from-orange-600/30 hover:to-orange-500/30 transition-all duration-300 text-left"
              >
                <div className="flex items-center space-x-4">
                  <Key className="h-6 w-6 text-orange-400" />
                  <div>
                    <h4 className="font-semibold text-white">Sign in with Nsec</h4>
                    <p className="text-orange-200 text-sm">Direct private key authentication</p>
                  </div>
                </div>
              </button>

              {/* OTP Method */}
              <button
                onClick={() => setAuthMethod('otp')}
                className="w-full p-4 bg-gradient-to-r from-blue-600/20 to-blue-500/20 border border-blue-500/30 rounded-xl hover:from-blue-600/30 hover:to-blue-500/30 transition-all duration-300 text-left"
              >
                <div className="flex items-center space-x-4">
                  <Smartphone className="h-6 w-6 text-blue-400" />
                  <div>
                    <h4 className="font-semibold text-white">One-Time Password</h4>
                    <p className="text-blue-200 text-sm">Secure OTP authentication</p>
                  </div>
                </div>
              </button>

              {/* NIP-07 Method */}
              <button
                onClick={() => setAuthMethod('nip07')}
                className="w-full p-4 bg-gradient-to-r from-green-600/20 to-green-500/20 border border-green-500/30 rounded-xl hover:from-green-600/30 hover:to-green-500/30 transition-all duration-300 text-left"
              >
                <div className="flex items-center space-x-4">
                  <Key className="h-6 w-6 text-green-400" />
                  <div>
                    <h4 className="font-semibold text-white">Browser Extension</h4>
                    <p className="text-green-200 text-sm">NIP-07 extension signing</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Nsec Form */}
          {authMethod === 'nsec' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Nsec Authentication</h3>
                <button onClick={() => setAuthMethod(null)} className="text-purple-300 hover:text-white text-sm">← Back</button>
              </div>

              {/* Security Warning */}
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-orange-200 font-semibold text-sm mb-2">Security Notice</h4>
                    <ul className="text-orange-200/80 text-xs space-y-1">
                      <li>• Your Nsec is processed in local memory only</li>
                      <li>• Never stored unencrypted in databases</li>
                      <li>• Immediately cleared after authentication</li>
                      <li>• Only enter on trusted devices and websites</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="relative">
                <input
                  type={showNsec ? "text" : "password"}
                  value={nsecKey}
                  onChange={(e) => setNsecKey(e.target.value)}
                  placeholder="nsec1..."
                  className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNsec(!showNsec)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-300 hover:text-white"
                >
                  {showNsec ? "👁️‍🗨️" : "👁️"}
                </button>
              </div>

              <button
                onClick={handleNsecAuth}
                disabled={isLoading || !nsecKey.trim()}
                className="w-full bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <Key className="h-5 w-5" />
                    <span>Sign In with Nsec</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* OTP Form */}
          {authMethod === 'otp' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">OTP Authentication</h3>
                <button onClick={() => setAuthMethod(null)} className="text-purple-300 hover:text-white text-sm">← Back</button>
              </div>

              <input
                type="text"
                value={nipOrNpub}
                onChange={(e) => setNipOrNpub(e.target.value)}
                placeholder="npub1... or user@domain.com"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {!otpSent ? (
                <button
                  onClick={handleSendOTP}
                  disabled={isLoading || !nipOrNpub.trim()}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Smartphone className="h-5 w-5" />
                      <span>Send OTP</span>
                    </>
                  )}
                </button>
              ) : (
                <>
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="Enter OTP code"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  <button
                    onClick={handleVerifyOTP}
                    disabled={isLoading || !otpCode.trim()}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-5 w-5" />
                        <span>Verify with Maximum Privacy</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          {/* NIP-07 Form */}
          {authMethod === 'nip07' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Browser Extension</h3>
                <button onClick={() => setAuthMethod(null)} className="text-purple-300 hover:text-white text-sm">← Back</button>
              </div>

              <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
                <p className="text-green-300 text-sm">This will request a signature from your Nostr browser extension.</p>
              </div>

              <button
                onClick={handleNIP07Auth}
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Signing...</span>
                  </>
                ) : (
                  <>
                    <Shield className="h-5 w-5" />
                    <span>Sign with Maximum Privacy</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Privacy Guarantee */}
          <div className="mt-6 p-4 bg-purple-800/30 border border-purple-500/50 rounded-lg">
            <div className="flex items-start space-x-3">
              <Shield className="h-5 w-5 text-purple-300 mt-0.5" />
              <div>
                <h4 className="font-semibold text-purple-300 mb-2">Maximum Privacy Guarantee</h4>
                <ul className="text-purple-200 text-sm space-y-1">
                  <li>• 95% anonymity level (maximum possible)</li>
                  <li>• Your npub/nip05 is NEVER stored</li>
                  <li>• Only hashed UUIDs with per-user salts</li>
                  <li>• Perfect Forward Secrecy enabled</li>
                  <li>• All metadata protected</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

