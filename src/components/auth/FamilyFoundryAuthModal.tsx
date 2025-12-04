import { ArrowLeft, Crown, Key, RefreshCw, Shield, Users } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import IdentityForge from '../IdentityForge';
import { useAuth } from './AuthProvider';

interface FamilyFoundryAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: () => void;
  onExistingUserSignIn: () => void;
}

const FamilyFoundryAuthModal: React.FC<FamilyFoundryAuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  onExistingUserSignIn
}) => {
  const [currentStep, setCurrentStep] = useState<'intro' | 'identity-forge'>('intro');
  const mountedRef = useRef(true);
  const transitionTimerRef = useRef<number | null>(null);
  const authCheckDoneRef = useRef(false);
  const auth = useAuth();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (transitionTimerRef.current !== null) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    };
  }, []);

  // Reset auth check when modal closes
  useEffect(() => {
    if (!isOpen) {
      authCheckDoneRef.current = false;
    }
  }, [isOpen]);

  // Check if user is already authenticated when modal opens
  useEffect(() => {
    if (!isOpen || authCheckDoneRef.current) return;

    // Skip if auth is still loading
    if (auth.loading) {
      console.log('🔄 FamilyFoundryAuthModal: Auth still loading, waiting...');
      return;
    }

    authCheckDoneRef.current = true;

    // If user is authenticated with valid session, skip auth modal and proceed
    if (auth.authenticated && auth.sessionValid && auth.user) {
      console.log('✅ FamilyFoundryAuthModal: User already authenticated, proceeding to foundry');
      onAuthSuccess();
      return;
    }

    console.log('🔐 FamilyFoundryAuthModal: User not authenticated, showing auth options', {
      authenticated: auth.authenticated,
      sessionValid: auth.sessionValid,
      hasUser: !!auth.user
    });
  }, [isOpen, auth.loading, auth.authenticated, auth.sessionValid, auth.user, onAuthSuccess]);

  if (!isOpen) return null;

  // Show loading state while auth is being checked
  if (auth.loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 p-8">
          <div className="flex flex-col items-center space-y-4">
            <RefreshCw className="h-8 w-8 text-purple-400 animate-spin" />
            <p className="text-white text-lg">Checking authentication status...</p>
          </div>
        </div>
      </div>
    );
  }

  // If authenticated, show brief transition message (the useEffect will handle redirect)
  if (auth.authenticated && auth.sessionValid && auth.user) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 p-8">
          <div className="flex flex-col items-center space-y-4">
            <Crown className="h-8 w-8 text-yellow-400" />
            <p className="text-white text-lg">Welcome back! Proceeding to Family Foundry...</p>
          </div>
        </div>
      </div>
    );
  }

  const handleIdentityForgeComplete = () => {
    // After Identity Forge is complete, proceed to Family Foundry
    onAuthSuccess();
  };



  const handleReturnToIntro = () => {
    if (!mountedRef.current) return;
    setCurrentStep('intro');
  };

  const handleStartIdentityForge = () => {
    if (!mountedRef.current) return;
    setCurrentStep('identity-forge');
  };

  const handleExistingUserSignIn = () => {
    onClose(); // Close this modal
    onExistingUserSignIn(); // Trigger the main Nostrich Sign-in modal
  };

  const handleNewUserSignUp = () => {
    if (!mountedRef.current) return;
    setCurrentStep('identity-forge');
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="bg-purple-800/40 backdrop-blur-sm border-b border-white/30 p-6 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {currentStep !== 'intro' && (
                  <button
                    onClick={handleReturnToIntro}
                    className="text-white hover:text-purple-200 transition-colors duration-200"
                  >
                    <ArrowLeft className="h-6 w-6" />
                  </button>
                )}
                <div>
                  <h1 className="text-3xl font-bold text-white font-medieval">Family Foundry Authentication</h1>
                  <p className="text-purple-200 text-lg">Complete your identity setup to access Family Foundry</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:text-purple-200 transition-colors duration-200"
              >
                <span className="text-2xl">×</span>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {currentStep === 'intro' && (
              <div className="space-y-8">
                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Crown className="h-10 w-10 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-4">Authentication Required</h2>
                  <p className="text-purple-200 text-lg mb-8">
                    To access the Family Foundry and create your family federation, you need to complete your identity setup.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-green-800/30 rounded-xl p-6 border border-green-500/30">
                    <div className="flex items-center space-x-3 mb-4">
                      <Shield className="h-8 w-8 text-green-400" />
                      <h3 className="text-xl font-bold text-white">New User? Create Identity</h3>
                    </div>
                    <p className="text-purple-200 mb-4">
                      First time here? Create your decentralized identity using Nostr protocols to establish your True Name and cryptographic verification.
                    </p>
                    <button
                      onClick={handleNewUserSignUp}
                      className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
                    >
                      Start Identity Forge
                    </button>
                  </div>

                  <div className="bg-blue-800/30 rounded-xl p-6 border border-blue-500/30">
                    <div className="flex items-center space-x-3 mb-4">
                      <Users className="h-8 w-8 text-blue-400" />
                      <h3 className="text-xl font-bold text-white">Returning User? Sign In</h3>
                    </div>
                    <p className="text-purple-200 mb-4">
                      Already have a Satnam.pub account? Sign in with your existing Nostr identity to access Family Foundry features.
                    </p>
                    <button
                      onClick={handleExistingUserSignIn}
                      className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
                    >
                      Nostrich Sign-in
                    </button>
                  </div>
                </div>

                <div className="bg-yellow-800/30 rounded-xl p-6 border border-yellow-500/30">
                  <div className="flex items-start space-x-4">
                    <Key className="h-8 w-8 text-yellow-400 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Why Authentication?</h3>
                      <p className="text-purple-200">
                        Family Foundry requires authentication to ensure secure family federation creation,
                        protect sensitive family data, and enable collaborative features like role-based access control
                        and family treasury management.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 'identity-forge' && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-white mb-2">Claim Your Name</h2>
                  <p className="text-purple-200">Create your decentralized identity to proceed</p>
                </div>
                <IdentityForge
                  onComplete={handleIdentityForgeComplete}
                  onBack={handleReturnToIntro}
                />
              </div>
            )}


          </div>
        </div>
      </div>


    </>
  );
};

export default FamilyFoundryAuthModal; 