// Enhanced Signin Modal for Satnam.pub
// File: src/components/SignInModal.tsx
// Integrates existing NWC/OTP functionality with NIP-07 browser extension support

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Globe,
  Info,
  Key,
  MessageCircle,
  RefreshCw,
  Shield,
  Wallet,
  X
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import React, { useEffect, useState } from 'react';
import { NIP07AuthChallenge, NostrExtension } from '../types/auth';
import NWCOTPSignIn from './auth/NWCOTPSignIn';

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

type AuthStep = 'method-selection' | 'nip07-auth' | 'nwc-otp-auth';

const SignInModal: React.FC<SignInModalProps> = ({
  isOpen,
  onClose,
  onSignInSuccess,
  onCreateNew,
  destination,
}) => {
  const [authStep, setAuthStep] = useState<AuthStep>('method-selection');
  const [showNWCOTPModal, setShowNWCOTPModal] = useState(false);
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus>({
    available: false
  });
  const [showTooltip, setShowTooltip] = useState(false);
  const [isCheckingExtension, setIsCheckingExtension] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  
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
      if (event.key === 'Escape' && isOpen && !showNWCOTPModal) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, showNWCOTPModal]);

  // Check for NIP-07 browser extensions on component mount
  useEffect(() => {
    if (isOpen) {
      const checkExtensions = async () => {
        setIsCheckingExtension(true);
        
        try {
          if (typeof window !== 'undefined' && (window as any).nostr) {
            const nostr = (window as any).nostr as NostrExtension;
            
            if (typeof nostr.getPublicKey === 'function') {
              setExtensionStatus({
                available: true,
                name: 'Nostr Extension'
              });
            } else {
              setExtensionStatus({
                available: false,
                error: 'Extension not fully compatible'
              });
            }
          } else {
            setExtensionStatus({
              available: false,
              error: 'No Nostr extension detected'
            });
          }
        } catch (error) {
          setExtensionStatus({
            available: false,
            error: 'Extension check failed'
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
      setShowNWCOTPModal(false);
      setIsClosing(false);
      setShowTooltip(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 150);
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !showNWCOTPModal) {
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

      if (typeof window === 'undefined' || !(window as any).nostr) {
        throw new Error('No Nostr extension detected');
      }

      const nostr = (window as any).nostr as NostrExtension;

      // Get public key from extension
      let publicKey: string;
      try {
        publicKey = await nostr.getPublicKey();
      } catch (error) {
        throw new Error('Extension access denied. Please allow access and try again.');
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

      setTimeout(() => {
        onSignInSuccess(destination);
        handleClose();
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

  const verifyAuthentication = async (signedEvent: any, challenge: NIP07AuthChallenge) => {
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
    setShowNWCOTPModal(false);
  };

  if (!isOpen) return null;

  // Show NWC/OTP modal if selected
  if (showNWCOTPModal) {
    return (
      <NWCOTPSignIn
        isOpen={showNWCOTPModal}
        onClose={handleBackToMethods}
        onCreateNew={onCreateNew}
      />
    );
  }

  return (
    <div 
      className={`modal-overlay transition-opacity duration-300 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleBackdropClick}
    >
      <div 
        className={`modal-content transform transition-all duration-300 ${
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
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
            <h3 className="text-white font-bold text-xl mb-6 text-center">
              Choose Your Authentication Method
            </h3>

            {/* NIP-07 Browser Extension Option */}
            <div className="bg-white/10 rounded-2xl p-6 border border-white/20 hover:border-purple-500/50 transition-all duration-300">
              <div className="flex items-start space-x-4 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Globe className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="text-white font-bold text-lg mb-2 flex items-center space-x-2">
                    <span>Browser Extension (NIP-07)</span>
                    {isCheckingExtension ? (
                      <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    ) : extensionStatus.available ? (
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-400" />
                    )}
                  </h4>
                  <p className="text-purple-200 text-sm mb-4">
                    Sign in using your browser extension like Alby, nos2x, or other NIP-07 compatible extensions. 
                    Fast, secure, and no additional setup required.
                  </p>
                  <div className="flex items-center space-x-2 text-purple-400 text-sm mb-2">
                    <Shield className="h-4 w-4" />
                    <span>
                      {extensionStatus.available 
                        ? 'Extension detected • Ready to use' 
                        : 'No extension detected • Installation required'
                      }
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleNIP07SignIn}
                disabled={!extensionStatus.available}
                className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-gray-500 disabled:to-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                <Globe className="h-5 w-5" />
                <span>
                  {extensionStatus.available 
                    ? 'Sign in with Browser Extension' 
                    : 'Install Extension First'
                  }
                </span>
                {extensionStatus.available && <ArrowRight className="h-5 w-5" />}
              </button>
            </div>

            {/* NWC & OTP Combined Option */}
            <div className="bg-white/10 rounded-2xl p-6 border border-white/20 hover:border-orange-500/50 transition-all duration-300">
              <div className="flex items-start space-x-4 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <div className="flex items-center space-x-1">
                    <Wallet className="h-4 w-4 text-white" />
                    <MessageCircle className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="text-white font-bold text-lg mb-2">
                    Nostr Wallet Connect & OTP
                  </h4>
                  <p className="text-purple-200 text-sm mb-4">
                    Connect using your NWC-enabled wallet (Alby, Zeus, Mutiny) or receive a secure 
                    verification code via Nostr DM. Perfect for Family Federation access.
                  </p>
                  <div className="flex items-center space-x-2 text-orange-400 text-sm">
                    <Shield className="h-4 w-4" />
                    <span>Wallet integration • Gift wrapped DMs • Family Federation ready</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowNWCOTPModal(true)}
                className="w-full bg-gradient-to-r from-orange-500 to-blue-500 hover:from-orange-600 hover:to-blue-600 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                <Wallet className="h-5 w-5" />
                <span>Sign in with NWC or OTP</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>

            {/* Why Multiple Options Tooltip */}
            <div className="relative">
              <button
                onClick={() => setShowTooltip(!showTooltip)}
                className="flex items-center space-x-2 text-purple-200 hover:text-white transition-colors duration-200"
              >
                <Info className="h-4 w-4" />
                <span className="text-sm">Why multiple authentication options?</span>
              </button>

              {showTooltip && (
                <div className="absolute top-8 left-0 bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 max-w-md z-10">
                  <p className="text-purple-100 text-sm mb-3">
                    <strong>Browser Extensions (NIP-07):</strong> Fastest and most convenient for regular users with extensions installed.
                  </p>
                  <p className="text-purple-100 text-sm">
                    <strong>NWC & OTP:</strong> Perfect for Family Federation users, provides Lightning wallet integration and universal DM-based fallback.
                  </p>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center space-x-4 my-8">
              <div className="flex-1 h-px bg-white/20" />
              <span className="text-purple-200 text-sm">OR</span>
              <div className="flex-1 h-px bg-white/20" />
            </div>

            {/* New User Section */}
            <div className="text-center">
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
    </div>
  );
};

export default SignInModal;