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
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../components/auth/AuthProvider";

interface MaxPrivacyAuthProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (destination?: 'individual' | 'family') => void;
  destination?: 'individual' | 'family';
  title?: string;
  purpose?: string;
}

type AuthMethod = 'nsec' | 'otp' | 'nip07' | 'nip05-password' | null;

export function MaxPrivacyAuth({
  isOpen,
  onClose,
  onAuthSuccess,
  destination = 'family',
  title = 'Privacy-Protected Authentication',
  purpose = 'Maximum privacy protection with hashed UUIDs'
}: MaxPrivacyAuthProps) {
  const auth = useAuth();

  // UI State
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [nipOrNpub, setNipOrNpub] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  // NIP-05/Password form states
  const [nip05Username, setNip05Username] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // NIP-07 password state
  const [nip07Password, setNip07Password] = useState("");
  const [showNip07Password, setShowNip07Password] = useState(false);

  const mountedRef = useRef(true);
  const successTimerRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, []);

  const handleClose = () => {
    setAuthMethod(null);
    setError(null);
    setSuccess(null);
    setIsLoading(false);
    onClose();
  };

  const handleAuthSuccess = (method: string) => {
    setSuccess(`${method.toUpperCase()} authentication successful! Maximum privacy protection active.`);

    successTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return;
      onAuthSuccess(destination);
      handleClose();
    }, 1500);
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
      const result = await auth.initiateOTP(nipOrNpub);

      if (!mountedRef.current) return;
      if (result.success) {
        setOtpSent(true);
        setSuccess('OTP sent via encrypted Nostr DM! Check your Nostr client.');
      } else {
        throw new Error(result.error || 'Failed to send OTP');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send OTP');
    } finally {
      if (!mountedRef.current) return;
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
      const success = await auth.authenticateOTP(nipOrNpub, otpCode);

      if (!mountedRef.current) return;
      if (success) {
        handleAuthSuccess('OTP');
      } else {
        setError(auth.error || 'OTP verification failed. Please check your code and try again.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'OTP verification failed');
    } finally {
      if (!mountedRef.current) return;
      setIsLoading(false);
    }
  };

  // NIP-07 Authentication (Maximum Privacy with Password)
  const handleNIP07Auth = async () => {
    if (!window.nostr) {
      setError('NIP-07 extension not found. Please install a Nostr browser extension.');
      return;
    }

    if (!nip07Password.trim()) {
      setError('Password is required for maximum security and privacy protection.');
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

      // Use NIP-07 with password for DUID generation (same as NIP-05/Password)
      const success = await auth.authenticateNIP07(challenge, signedEvent.sig, pubkey, nip07Password);

      if (!mountedRef.current) return;
      if (success) {
        handleAuthSuccess('NIP-07');
      } else {
        setError(auth.error || 'NIP-07 authentication failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'NIP-07 authentication failed');
    } finally {
      if (!mountedRef.current) return;
      setIsLoading(false);
    }
  };

  // NIP-05/Password Authentication (Maximum Privacy)
  const handleNIP05PasswordAuth = async () => {
    if (!nip05Username || !password) {
      setError('Please enter both NIP-05 identifier and password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const success = await auth.authenticateNIP05Password(nip05Username, password);

      if (!mountedRef.current) return;
      if (success) {
        handleAuthSuccess('NIP-05/Password');
      } else {
        setError(auth.error || 'NIP-05/Password authentication failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'NIP-05/Password authentication failed');
    } finally {
      if (!mountedRef.current) return;
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

              {/* NIP-05/Password Method */}
              <button
                onClick={() => setAuthMethod('nip05-password')}
                className="w-full p-4 bg-gradient-to-r from-purple-600/20 to-purple-500/20 border border-purple-500/30 rounded-xl hover:from-purple-600/30 hover:to-purple-500/30 transition-all duration-300 text-left"
              >
                <div className="flex items-center space-x-4">
                  <Key className="h-6 w-6 text-purple-400" />
                  <div>
                    <h4 className="font-semibold text-white">NIP-05 + Password</h4>
                    <p className="text-purple-200 text-sm">Username/password with NIP-05 verification</p>
                  </div>
                </div>
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

              <div className="space-y-2">
                <label className="block text-sm text-green-200">Password (required)</label>
                <div className="relative">
                  <input
                    type={showNip07Password ? "text" : "password"}
                    value={nip07Password}
                    onChange={(e) => setNip07Password(e.target.value)}
                    placeholder="Password"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 pr-24"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNip07Password((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-green-300 hover:text-white px-2 py-1 rounded"
                  >
                    {showNip07Password ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <button
                onClick={handleNIP07Auth}
                disabled={isLoading || !nip07Password.trim()}
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

          {/* NIP-05/Password Form */}
          {authMethod === 'nip05-password' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">NIP-05 + Password</h3>
                <button onClick={() => setAuthMethod(null)} className="text-purple-300 hover:text-white text-sm">← Back</button>
              </div>

              <div className="p-4 bg-purple-500/20 border border-purple-500/30 rounded-lg">
                <p className="text-purple-300 text-sm">Sign in with your NIP-05 identifier and password.</p>
              </div>

              <input
                type="text"
                value={nip05Username}
                onChange={(e) => setNip05Username(e.target.value)}
                placeholder="your-username@domain.com"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />

              <button
                onClick={handleNIP05PasswordAuth}
                disabled={isLoading || !nip05Username || !password}
                className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <Shield className="h-5 w-5" />
                    <span>Sign In with Maximum Privacy</span>
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

