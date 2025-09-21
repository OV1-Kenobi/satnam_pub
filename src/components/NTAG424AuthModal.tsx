/**
 * @fileoverview NTAG424 Authentication Modal for Physical Multi-Factor Authentication
 * @description Integrates NFC-based authentication with existing signin/signon, payments, and communication flows
 * @compliance Master Context - Privacy-first, Bitcoin-only, browser-compatible
 * @integration Existing SignInModal, PaymentModal, CommunicationModal patterns
 */

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Crown,
  Eye,
  EyeOff,
  Info,
  Key,
  Loader2,
  Lock,
  QrCode,
  RefreshCw,
  Shield,
  Smartphone,
  Users,
  X,
  XCircle,
  Zap
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useProductionNTAG424 } from "../hooks/useProductionNTAG424";
import { FederationRole } from '../types/auth';


interface NTAG424AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess?: (authResult: any) => void;
  mode?: 'authentication' | 'registration' | 'both';
  destination?: 'individual' | 'family';
  title?: string;
  purpose?: string;
}

type AuthStep = 'input' | 'nfc-scan' | 'processing' | 'success' | 'error';

export const NTAG424AuthModal: React.FC<NTAG424AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  mode = 'both',
  destination,
  title = "NTAG424 Physical Authentication",
  purpose = "Secure multi-factor authentication with physical NFC tag"
}) => {
  // Form state
  const [pin, setPin] = useState("");
  const [userNpub, setUserNpub] = useState("");
  const [familyRole, setFamilyRole] = useState<FederationRole>("offspring");
  const [showPin, setShowPin] = useState(false);
  const [currentStep, setCurrentStep] = useState<AuthStep>('input');
  const [operationType, setOperationType] = useState<'auth' | 'register' | 'init'>('auth');

  const auth = useAuth();

  // NTAG424 hook
  const { authState, isProcessing, authenticateWithNFC, registerNewTag, initializeTag, resetAuthState } = useProductionNTAG424();

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

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep('input');
      setOperationType('auth');
      setPin("");
      setUserNpub("");
      setFamilyRole("offspring");
      setShowPin(false);
      resetAuthState();
    }
  }, [isOpen, resetAuthState]);

  // Handle authentication success
  useEffect(() => {
    if (authState.isAuthenticated && currentStep === 'processing') {
      setCurrentStep('success');
      successTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        onAuthSuccess?.(authState);
        onClose();
      }, 2000);
    }
  }, [authState.isAuthenticated, currentStep, onAuthSuccess, onClose]);

  // Handle errors
  useEffect(() => {
    if (authState.error && currentStep === 'processing') {
      setCurrentStep('error');
    }
  }, [authState.error, currentStep]);

  const handleClose = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isProcessing) {
      handleClose();
    }
  };

  const handleRegister = async () => {
    if (!pin.trim() || !userNpub.trim()) {
      setCurrentStep('error');
      return;
    }

    setOperationType('register');
    setCurrentStep('nfc-scan');

    try {
      const success = await registerNewTag(pin, userNpub, familyRole);
      if (success) {
        setCurrentStep('success');
        setTimeout(() => {
          setCurrentStep('input');
          setOperationType('auth');
        }, 2000);
      } else {
        setCurrentStep('error');
      }
    } catch (error: any) {
      console.error('NTAG424 registration failed:', error);
      setCurrentStep('error');
    }
  };


  const handleInitialize = async () => {
    setOperationType('init');
    setCurrentStep('nfc-scan');
    try {
      const ok = await initializeTag();
      if (ok) {
        setCurrentStep('success');
      } else {
        setCurrentStep('error');
      }
    } catch (e) {
      setCurrentStep('error');
    }
  };

  const handleAuthenticate = async () => {
    const trimmed = pin.trim();
    const validPin = /^[0-9]{6}$/.test(trimmed);
    if (!validPin) {
      setCurrentStep('error');
      return;
    }

    setOperationType('auth');
    setCurrentStep('nfc-scan');

    try {
      const result = await authenticateWithNFC(trimmed);
      if (result.success) {
        if (!mountedRef.current) return;
        setCurrentStep('processing');
      } else {
        setCurrentStep('error');
      }
    } catch (error: any) {
      console.error('NTAG424 authentication failed:', error);
      setCurrentStep('error');
    }
  };

  const handleRetry = () => {
    setCurrentStep('input');
    resetAuthState();
  };

  const getRoleDescription = (role: FederationRole): string => {
    const descriptions: Record<FederationRole, string> = {
      private: "Individual user with full control",
      offspring: "Younger family member with basic privileges",
      adult: "Mature family member with offspring management",
      steward: "Family leader with high-level permissions",
      guardian: "Highest authority with emergency override"
    };
    return descriptions[role];
  };

  const getRoleIcon = (role: FederationRole) => {
    switch (role) {
      case 'private': return <Lock className="h-4 w-4" />;
      case 'offspring': return <Users className="h-4 w-4" />;
      case 'adult': return <Shield className="h-4 w-4" />;
      case 'steward': return <Crown className="h-4 w-4" />;
      case 'guardian': return <Zap className="h-4 w-4" />;
      default: return <Users className="h-4 w-4" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-purple-900 rounded-2xl p-8 max-w-md w-full border border-yellow-400/20 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Smartphone className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
          <p className="text-purple-200 text-sm">{purpose}</p>
          {destination && (
            <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-800 text-purple-200">
              <Shield className="h-3 w-3 mr-1" />
              {destination === 'individual' ? 'Individual Access' : 'Family Access'}
            </div>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={handleClose}
          disabled={isProcessing}
          className="absolute top-4 right-4 p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300 disabled:opacity-50"
          aria-label="Close modal"
        >
          <X className="h-5 w-5 text-white" />
        </button>

        {/* Content based on current step */}
        {currentStep === 'input' && (
          <div className="space-y-6">
            {!auth.authenticated ? (
              <div className="space-y-4">
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-4">
                  <p className="text-purple-100 text-sm">
                    To program your NTAG424 (n424) Physical MFA card, we must securely access your credentials from your Client Session Vault.
                    Please sign in (Nostrich) or claim your identity first so we can bind your tag to the correct self-credentialed identity.
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      try { window.dispatchEvent(new CustomEvent('satnam:open-signin')); } catch { }
                      onClose();
                    }}
                    className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 shadow-lg"
                  >
                    <Smartphone className="h-4 w-4" />
                    <span>Nostrich Sign-in</span>
                  </button>
                  <button
                    onClick={() => {
                      try { window.dispatchEvent(new CustomEvent('satnam:navigate', { detail: { view: 'forge' } })); } catch { }
                      onClose();
                    }}
                    className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 shadow-lg"
                  >
                    <Key className="h-4 w-4" />
                    <span>Claim Your True Name</span>
                  </button>
                </div>
                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-start space-x-2 text-blue-300 text-sm">
                    <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium mb-2">Need help Flashing your NFC Physical MFA card?</p>
                      <div className="space-y-1">
                        <a href="/docs/satnam-nfc-provisioning-guide.html" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline block">📖 Provisioning Guide</a>
                        <a href="/docs/ntag424-blob-viewer.html" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline block">🔧 Blob Viewer Tool</a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* PIN Input */}
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-2">
                    PIN Code
                  </label>
                  <div className="relative">
                    <input
                      type={showPin ? "text" : "password"}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Enter your 6-digit PIN"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-full bg-purple-800 border border-purple-600 rounded-lg px-4 py-3 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                      maxLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-300 hover:text-white"
                    >
                      {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-purple-300 mt-1">
                    PIN authenticates your NFC tag locally. Your private keys are never stored on the tag.
                  </p>
                </div>

                {/* Registration fields (only show if mode allows registration) */}
                {(mode === 'registration' || mode === 'both') && operationType === 'register' && (
                  <>
                    {/* Nostr Public Key */}
                    <div>
                      <label className="block text-sm font-medium text-purple-200 mb-2">
                        Nostr Public Key (npub)
                      </label>
                      <input
                        type="text"
                        value={userNpub}
                        onChange={(e) => setUserNpub(e.target.value)}
                        placeholder="npub1..."
                        className="w-full bg-purple-800 border border-purple-600 rounded-lg px-4 py-3 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                      />
                      <p className="text-xs text-purple-300 mt-1">
                        Your Nostr public key for identity verification
                      </p>
                    </div>

                    {/* Family Role Selection */}
                    <div>
                      <label className="block text-sm font-medium text-purple-200 mb-2">
                        Family Role
                      </label>
                      <select
                        value={familyRole}
                        onChange={(e) => setFamilyRole(e.target.value as FederationRole)}
                        className="w-full bg-purple-800 border border-purple-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                      >
                        <option value="private">Private (Individual)</option>
                        <option value="offspring">Offspring</option>
                        <option value="adult">Adult</option>
                        <option value="steward">Steward</option>
                        <option value="guardian">Guardian</option>
                      </select>
                      <div className="mt-2 flex items-start space-x-2 text-xs text-purple-300">
                        {getRoleIcon(familyRole)}
                        <span>{getRoleDescription(familyRole)}</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Initialization guidance */}
                <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
                  <div className="flex items-start space-x-2 text-yellow-300 text-sm">
                    <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold">Two-phase setup required</p>
                      <p className="mt-1">
                        Phase 1: Initialize your NTAG424 tag using the hardware bridge to set AES keys, SUN, and permissions. Phase 2: Return here and complete registration.
                      </p>
                      <a
                        href="https://www.satnam.pub/docs/ntag424-initialization"
                        target="_blank"
                        rel="noreferrer"
                        className="underline text-yellow-300 hover:text-yellow-200 mt-1 inline-block"
                      >
                        Learn how to initialize your tag
                      </a>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  {(mode === 'authentication' || mode === 'both') && (
                    <button
                      onClick={handleAuthenticate}
                      disabled={!/^[0-9]{6}$/.test(pin.trim()) || isProcessing}
                      className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                    >
                      <Smartphone className="h-4 w-4" />
                      <span>Sign In with NFC</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}

                  {(mode === 'registration' || mode === 'both') && (
                    <button
                      onClick={handleInitialize}
                      disabled={isProcessing}
                      className="w-full bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                    >
                      <Smartphone className="h-4 w-4" />
                      <span>Initialize Tag (Mobile PWA)</span>
                    </button>
                  )}

                  {(mode === 'registration' || mode === 'both') && (
                    <button
                      onClick={() => setOperationType('register')}
                      disabled={isProcessing}
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                    >
                      <Key className="h-4 w-4" />
                      <span>Register New Tag</span>
                    </button>
                  )}

                  {mode === 'both' && operationType === 'register' && (
                    <button
                      onClick={handleRegister}
                      disabled={!pin.trim() || !userNpub.trim() || isProcessing}
                      className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                    >
                      <QrCode className="h-4 w-4" />
                      <span>Complete Registration</span>
                    </button>
                  )}
                </div>

                {/* Mode Toggle for 'both' mode */}
                {mode === 'both' && (
                  <div className="text-center">
                    <button
                      onClick={() => setOperationType(operationType === 'auth' ? 'register' : 'auth')}
                      className="text-purple-300 hover:text-white text-sm underline transition-colors"
                    >
                      {operationType === 'auth' ? 'Need to register a new tag?' : 'Already have a registered tag?'}
                    </button>
                  </div>
                )}

                {/* Documentation Links */}
                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-start space-x-2 text-blue-300 text-sm">
                    <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium mb-2">Need help Flashing your NFC Physical MFA card?</p>
                      <div className="space-y-1">
                        <a href="/docs/satnam-nfc-provisioning-guide.html" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline block">📖 Provisioning Guide</a>
                        <a href="/docs/ntag424-blob-viewer.html" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline block">🔧 Blob Viewer Tool</a>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* NFC Scan Step */}
        {currentStep === 'nfc-scan' && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto">
              <RefreshCw className="h-8 w-8 text-white animate-spin" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">
                {operationType === 'auth'
                  ? 'Tap Your NFC Tag'
                  : operationType === 'init'
                    ? 'Initialize Your NFC Tag'
                    : 'Register Your NFC Tag'}
              </h3>
              <p className="text-purple-200">
                {operationType === 'auth'
                  ? 'Hold your registered NFC tag near your device to authenticate'
                  : operationType === 'init'
                    ? 'Hold your factory-fresh NFC tag near your device to initialize it for secure use'
                    : 'Hold your new NFC tag near your device to register it'
                }
              </p>
            </div>
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-center space-x-2 text-blue-300 text-sm">
                <Info className="h-4 w-4" />
                <span>NFC scanning active - tap your tag now</span>
              </div>
            </div>
          </div>
        )}

        {/* Processing Step */}
        {currentStep === 'processing' && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center mx-auto">
              <Loader2 className="h-8 w-8 text-white animate-spin" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Processing Authentication</h3>
              <p className="text-purple-200">Verifying your credentials and setting up your session...</p>
            </div>
          </div>
        )}

        {/* Success Step */}
        {currentStep === 'success' && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">
                {operationType === 'auth'
                  ? 'Authentication Successful!'
                  : operationType === 'init'
                    ? 'Initialization Complete!'
                    : 'Registration Successful!'}
              </h3>
              <p className="text-purple-200">
                {operationType === 'auth'
                  ? 'Welcome back! Redirecting to your dashboard...'
                  : operationType === 'init'
                    ? 'Your NFC tag is initialized and ready. You can now complete registration.'
                    : 'Your NFC tag has been registered successfully!'}
              </p>
              <div className="mt-6 grid sm:grid-cols-2 gap-3">
                <button
                  onClick={() => { try { window.dispatchEvent(new CustomEvent('satnam:navigate', { detail: { view: 'forge' } })); } catch { } onClose(); }}
                  className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 shadow-lg"
                >
                  <Crown className="h-4 w-4" />
                  <span>Claim Your True Name (ID Badge)</span>
                </button>
                <button
                  onClick={() => { try { window.dispatchEvent(new CustomEvent('satnam:navigate', { detail: { view: 'individual-finances' } })); } catch { } onClose(); }}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 shadow-lg"
                >
                  <Zap className="h-4 w-4" />
                  <span>Open Wallet & Payments</span>
                </button>
              </div>

              {authState.userNpub && (
                <div className="mt-4 bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                  <p className="text-green-300 text-sm">
                    Authenticated as: {authState.userNpub.substring(0, 16)}...
                  </p>
                  {authState.familyRole && (
                    <p className="text-green-300 text-sm">
                      Role: {authState.familyRole}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Step */}
        {currentStep === 'error' && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="h-8 w-8 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">
                {operationType === 'auth' ? 'Authentication Failed' : 'Registration Failed'}
              </h3>
              <p className="text-purple-200 mb-4">
                {authState.error || 'An unexpected error occurred. Please try again.'}
              </p>
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-left">
                <div className="flex items-start space-x-2 text-red-300 text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Common issues:</p>
                    <ul className="mt-1 space-y-1">
                      <li>• Check if your PIN is correct</li>
                      <li>• If registering a new tag, ensure it has been initialized (Phase 1) before registration</li>
                      <li>• Ensure NFC is enabled on your device</li>
                      <li>• Hold the tag closer to your device</li>
                      <li>• Try a different browser if using desktop</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={handleRetry}
              className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Export for use in other components
export default NTAG424AuthModal;