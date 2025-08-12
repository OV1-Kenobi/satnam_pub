// Enhanced Signin Modal for Satnam.pub
// File: src/components/SignInModal.tsx
// Integrates existing NWC/OTP functionality with NIP-07 browser extension support

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Globe,
  Key,
  RefreshCw,
  Shield,
  Smartphone,
  User,
  X
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import React, { useEffect, useRef, useState } from 'react';
import { NIP07AuthChallenge } from '../types/auth';

// Lazy import to prevent client creation on page load
const getSessionInfo = async () => {
  const { getSessionInfo: sessionInfoFn } = await import('../utils/secureSession');
  return sessionInfoFn();
};

import NIP05PasswordAuth from './auth/NIP05PasswordAuth';
import ErrorBoundary from './ErrorBoundary';
import { MaxPrivacyAuth } from './MaxPrivacyAuth';
import { PostAuthInvitationModal } from './PostAuthInvitationModal';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignInSuccess: (destination?: 'individual' | 'family') => void;
  onCreateNew: () => void;
  destination?: 'individual' | 'family';
}

interface ExtensionStatus {
  available: boolean;
  name?: string;
  error?: string;
}

interface SignedAuthEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey: string;
  id: string;
  sig: string;
}

type AuthStep = 'method-selection' | 'nip07-auth' | 'nwc-otp-auth' | 'post-auth-invitation';

const SignInModal: React.FC<SignInModalProps> = ({
  isOpen,
  onClose,
  onSignInSuccess,
  onCreateNew,
  destination,
}) => {
  const [authStep, setAuthStep] = useState<AuthStep>('method-selection');
  const [showMaxPrivacyAuth, setShowMaxPrivacyAuth] = useState(false);
  const [showNIP05PasswordAuth, setShowNIP05PasswordAuth] = useState(false);
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus>({
    available: false
  });
  const [showTooltip, setShowTooltip] = useState(false);
  const [isCheckingExtension, setIsCheckingExtension] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [showPostAuthInvitation, setShowPostAuthInvitation] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<any | null>(null);

  // NIP-07 auth state
  const [nip07State, setNip07State] = useState<{
    step: 'connecting' | 'signing' | 'verifying' | 'success' | 'error';
    message: string;
    error?: string;
    npub?: string;
  }>({
    step: 'connecting',
    message: 'Connecting to extension...'
  });

  // Track mounted state and pending timers to avoid race conditions
  const mountedRef = useRef(true);
  const postAuthTimerRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (postAuthTimerRef.current !== null) {
        clearTimeout(postAuthTimerRef.current);
        postAuthTimerRef.current = null;
      }
    };
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open');
      return () => {
        document.body.classList.remove('modal-open');
      };
    }
  }, [isOpen]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen]);

  // Check for NIP-07 browser extensions on component mount
  useEffect(() => {
    if (isOpen) {
      const checkExtensions = async () => {
        setIsCheckingExtension(true);

        try {
          // Add timeout to prevent hanging on unresponsive extensions
          const extensionCheckPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Extension check timeout'));
            }, 3000); // 3 second timeout

            try {
              if (typeof window !== 'undefined' && window.nostr) {
                const nostr = window.nostr;

                if (typeof nostr.getPublicKey === 'function') {
                  clearTimeout(timeout);
                  resolve({
                    available: true,
                    name: 'Nostr Extension'
                  });
                } else {
                  clearTimeout(timeout);
                  resolve({
                    available: false,
                    error: 'Extension not fully compatible'
                  });
                }
              } else {
                clearTimeout(timeout);
                resolve({
                  available: false,
                  error: 'No Nostr extension detected'
                });
              }
            } catch (error) {
              clearTimeout(timeout);
              reject(error);
            }
          });

          const result = await extensionCheckPromise;
          setExtensionStatus(result as any);
        } catch (error) {
          console.warn('Browser extension check failed (non-critical):', error);
          setExtensionStatus({
            available: false,
            error: 'Extension check failed - this is normal if no Nostr extension is installed'
          });
        } finally {
          setIsCheckingExtension(false);
        }
      };

      const timer = setTimeout(checkExtensions, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAuthStep('method-selection');
      setIsClosing(false);
      setShowTooltip(false);
      setShowPostAuthInvitation(false);
      setSessionInfo(null);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
      // Ensure any pending post-auth timer is cleared when closing
      if (postAuthTimerRef.current !== null) {
        clearTimeout(postAuthTimerRef.current);
        postAuthTimerRef.current = null;
      }
    }, 150);
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  };

  const handleNIP07SignIn = async () => {
    setAuthStep('nip07-auth');

    try {
      setNip07State({
        step: 'connecting',
        message: 'Connecting to your Nostr extension...'
      });

      if (typeof window === 'undefined' || !window.nostr) {
        throw new Error('No Nostr extension detected');
      }

      const nostr = window.nostr;

      // Get public key from extension with timeout
      let publicKey: string;
      try {
        const getPublicKeyPromise = new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Extension response timeout - please try again'));
          }, 10000); // 10 second timeout

          nostr.getPublicKey()
            .then((key: string) => {
              clearTimeout(timeout);
              resolve(key);
            })
            .catch((error: any) => {
              clearTimeout(timeout);
              reject(error);
            });
        });

        publicKey = await getPublicKeyPromise;
      } catch (error) {
        console.warn('NIP-07 getPublicKey failed:', error);
        throw new Error('Extension access denied or timed out. Please allow access and try again.');
      }

      const npub = nip19.npubEncode(publicKey);

      setNip07State({
        step: 'signing',
        message: 'Please sign the authentication challenge in your extension...',
        npub
      });

      // Generate authentication challenge
      const challenge = await generateAuthChallenge();

      // Create event to sign (NIP-22242 authentication event)
      const authEvent = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['challenge', challenge.challenge],
          ['domain', challenge.domain],
          ['expires', challenge.expiresAt.toString()]
        ],
        content: `Authenticate to ${challenge.domain}`,
        pubkey: publicKey
      };

      // Sign the event
      let signedEvent;
      try {
        signedEvent = await nostr.signEvent(authEvent);
      } catch (error) {
        throw new Error('Signing cancelled. Please sign the authentication challenge to continue.');
      }

      setNip07State(prev => ({
        ...prev,
        step: 'verifying',
        message: 'Verifying signed authentication...'
      }));

      // Verify with backend
      await verifyAuthentication(signedEvent, challenge);

      setNip07State({
        step: 'success',
        message: 'Authentication successful!'
      });

      // Get session info and show invitation modal
      // Schedule showing the invitation modal slightly after success
      // Store timer so it can be cancelled on unmount/close
      postAuthTimerRef.current = window.setTimeout(() => {
        const loadSessionInfo = async () => {
          try {
            const session = await getSessionInfo();
            if (!mountedRef.current) return;
            setSessionInfo(session);
            setShowPostAuthInvitation(true);
          } catch (error) {
            console.error('Failed to get session info:', error);
            if (!mountedRef.current) return;
            onSignInSuccess(destination);
            handleClose();
          }
        };
        loadSessionInfo();
      }, 1000);


    } catch (error) {
      console.error('NIP-07 authentication error:', error);
      setNip07State({
        step: 'error',
        message: 'Authentication failed',
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
    }
  };

  const generateAuthChallenge = async (): Promise<NIP07AuthChallenge> => {
    const response = await fetch('/api/auth/nip07-challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to generate authentication challenge');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Challenge generation failed');
    }

    return result.data;
  };

  const verifyAuthentication = async (signedEvent: SignedAuthEvent, challenge: NIP07AuthChallenge) => {
    const response = await fetch('/api/auth/nip07-signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signedEvent,
        challenge: challenge.challenge,
        domain: challenge.domain
      }),
    });

    if (!response.ok) {
      throw new Error('Authentication verification failed');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Authentication failed');
    }
  };

  const handleBackToMethods = () => {
    setAuthStep('method-selection');
  };

  const handleInvitationComplete = () => {
    setShowPostAuthInvitation(false);
    onSignInSuccess(destination);
    handleClose();
  };

  const handleSkipInvitation = () => {
    setShowPostAuthInvitation(false);
    onSignInSuccess(destination);
    handleClose();
  };



  if (!isOpen) return null;



  // Show Post-Auth Invitation Modal after successful authentication
  if (showPostAuthInvitation && sessionInfo) {
    return (
      <PostAuthInvitationModal
        isOpen={showPostAuthInvitation}
        onClose={handleInvitationComplete}
        onSkip={handleSkipInvitation}
        sessionInfo={sessionInfo}
      />
    );
  }

  return (
    <ErrorBoundary>
      <div
        className={`modal-overlay-bitcoin-citadel transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'
          }`}
        onClick={handleBackdropClick}
      >
        <div
          className={`modal-content-bitcoin-citadel transform transition-all duration-300 ${isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
            }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300 z-10"
            aria-label="Close signin modal"
          >
            <X className="h-5 w-5 text-white" />
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <img
                src="/SatNam.Pub logo.png"
                alt="SatNam.Pub"
                className="h-10 w-10 rounded-full"
              />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">Welcome to Satnam.pub</h2>
            <p className="text-purple-200">
              {destination === 'individual'
                ? 'Sign in to access your Individual Finances dashboard'
                : destination === 'family'
                  ? 'Sign in to access your Family Financials dashboard'
                  : 'Sign in with your Nostr identity or create a new sovereign account'
              }
            </p>
          </div>

          {/* Method Selection */}
          {authStep === 'method-selection' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-white font-bold text-xl mb-4">
                  Privacy-Protected Authentication
                </h3>
                <div className="inline-flex items-center space-x-2 bg-purple-500/20 text-purple-300 px-4 py-2 rounded-full text-sm mb-4">
                  <Shield className="h-4 w-4" />
                  <span>Maximum Privacy • Hashed UUIDs Only • Perfect Forward Secrecy</span>
                </div>

                {/* Zero-Knowledge Nsec Protocol Information */}
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 mb-6">
                  <div className="flex items-start space-x-3">
                    <Key className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
                    <div className="text-left">
                      <h4 className="text-orange-200 font-semibold text-sm mb-2">Zero-Knowledge Nsec Protocol</h4>
                      <ul className="text-orange-200/80 text-xs space-y-1">
                        <li>• Unencrypted Nsec keys are NEVER stored in databases</li>
                        <li>• Private keys are processed in local memory only</li>
                        <li>• Immediate encryption and memory cleanup after use</li>
                        <li>• Only hashed UUIDs are stored for authentication</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Primary Method: NIP-07 Browser Extension */}
              <div className="bg-gradient-to-r from-green-600/20 to-green-500/20 rounded-2xl p-6 border-2 border-green-500/50 relative">
                <div className="absolute -top-3 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                  RECOMMENDED
                </div>
                <button
                  onClick={handleNIP07SignIn}
                  className="w-full text-left"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <Key className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white font-bold text-lg mb-2">Browser Extension</h4>
                      <p className="text-green-200 text-sm">
                        Sign in with your Nostr browser extension (Alby, nos2x, etc.)
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-green-400" />
                  </div>
                </button>
              </div>

              {/* Primary Method for Returning Users */}
              <div className="relative p-4 bg-gradient-to-r from-purple-600/20 to-purple-500/20 border border-purple-500/30 rounded-xl hover:from-purple-600/30 hover:to-purple-500/30 transition-all duration-300">
                <div className="absolute -top-3 left-4 bg-purple-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                  RETURNING USERS
                </div>
                <button
                  onClick={() => setShowNIP05PasswordAuth(true)}
                  className="w-full text-left"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white font-bold text-lg mb-2">NIP-05 + Password</h4>
                      <p className="text-purple-200 text-sm">
                        Sign in with your username@satnam.pub and password
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-purple-400" />
                  </div>
                </button>
              </div>

              {/* Secondary Methods */}
              <div className="space-y-3">
                <p className="text-purple-300 text-sm text-center">Alternative Methods</p>

                {/* Account Migration Method */}
                <button
                  onClick={() => setShowMaxPrivacyAuth(true)}
                  className="w-full p-4 bg-gradient-to-r from-orange-600/20 to-orange-500/20 border border-orange-500/30 rounded-xl hover:from-orange-600/30 hover:to-orange-500/30 transition-all duration-300 text-left"
                >
                  <div className="flex items-center space-x-4">
                    <Key className="h-6 w-6 text-orange-400" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-white">Account Migration</h4>
                      <p className="text-orange-200 text-sm">Import existing Nostr identity with nsec</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-orange-400" />
                  </div>
                </button>

                {/* OTP Fallback Method */}
                <button
                  onClick={() => setShowMaxPrivacyAuth(true)}
                  className="w-full p-4 bg-gradient-to-r from-blue-600/20 to-blue-500/20 border border-blue-500/30 rounded-xl hover:from-blue-600/30 hover:to-blue-500/30 transition-all duration-300 text-left"
                >
                  <div className="flex items-center space-x-4">
                    <Smartphone className="h-6 w-6 text-blue-400" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-white">One-Time Password</h4>
                      <p className="text-blue-200 text-sm">Secure OTP fallback authentication</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-blue-400" />
                  </div>
                </button>
              </div>



              {/* New User Section */}
              <div className="text-center mt-8">
                <h3 className="text-white font-bold text-xl mb-4">
                  New to Nostr?
                </h3>
                <p className="text-purple-200 mb-6">
                  Create your sovereign digital identity and join the decentralized future with Satnam.pub.
                </p>
                <button
                  onClick={onCreateNew}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-4 px-8 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-2 mx-auto"
                >
                  <Key className="h-5 w-5" />
                  <span>Create New Identity</span>
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* NIP-07 Authentication Flow */}
          {authStep === 'nip07-auth' && (
            <div className="space-y-6">
              <div className="flex items-center space-x-4 mb-6">
                <button
                  onClick={handleBackToMethods}
                  className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
                >
                  <ArrowRight className="h-5 w-5 text-white rotate-180" />
                </button>
                <div className="flex items-center space-x-3">
                  <Globe className="h-6 w-6 text-purple-400" />
                  <h2 className="text-lg font-semibold text-white">
                    Browser Extension Authentication
                  </h2>
                </div>
              </div>

              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center mx-auto">
                  {nip07State.step === 'success' ? (
                    <CheckCircle className="h-8 w-8 text-white" />
                  ) : nip07State.step === 'error' ? (
                    <AlertTriangle className="h-8 w-8 text-white" />
                  ) : (
                    <RefreshCw className="h-8 w-8 text-white animate-spin" />
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">
                    {nip07State.step === 'connecting' && 'Connecting to Extension'}
                    {nip07State.step === 'signing' && 'Waiting for Signature'}
                    {nip07State.step === 'verifying' && 'Verifying Authentication'}
                    {nip07State.step === 'success' && 'Authentication Successful!'}
                    {nip07State.step === 'error' && 'Authentication Failed'}
                  </h3>
                  <p className="text-purple-200">{nip07State.message}</p>
                  {nip07State.npub && (
                    <p className="text-purple-300 text-sm mt-2 font-mono">
                      {nip07State.npub.substring(0, 16)}...
                    </p>
                  )}
                </div>
                {nip07State.error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left">
                    <p className="text-sm text-red-800">{nip07State.error}</p>
                  </div>
                )}
                {nip07State.step === 'error' && (
                  <button
                    onClick={handleBackToMethods}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
                  >
                    Back to Methods
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Maximum Privacy Authentication Modal */}
        <MaxPrivacyAuth
          isOpen={showMaxPrivacyAuth}
          onClose={() => setShowMaxPrivacyAuth(false)}
          onAuthSuccess={onSignInSuccess}
          destination={destination}
          title="Sign In to Satnam.pub"
          purpose="Maximum privacy protection with hashed UUIDs and Perfect Forward Secrecy"
        />

        {/* NIP-05/Password Authentication Modal */}
        <NIP05PasswordAuth
          isOpen={showNIP05PasswordAuth}
          onClose={() => setShowNIP05PasswordAuth(false)}
          onAuthSuccess={onSignInSuccess}
          destination={destination}
          title="Sign In with NIP-05 + Password"
          purpose="Secure authentication with your NIP-05 identifier and password"
        />

        {/* Post-Auth Invitation Modal */}
        {showPostAuthInvitation && sessionInfo && (
          <ErrorBoundary>
            <PostAuthInvitationModal
              isOpen={showPostAuthInvitation}
              onClose={() => setShowPostAuthInvitation(false)}
              onSkip={() => setShowPostAuthInvitation(false)}
              sessionInfo={sessionInfo}
            />
          </ErrorBoundary>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default SignInModal;