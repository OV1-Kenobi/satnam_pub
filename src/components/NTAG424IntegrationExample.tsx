/**
 * @fileoverview NTAG424 Integration Example Component
 * @description Demonstrates integration of NTAG424 authentication with existing flows
 * @compliance Master Context - Privacy-first, Bitcoin-only, browser-compatible
 * @integration SignInModal, PaymentModal, CommunicationModal patterns
 */

import React, { useState } from "react";
import {
  Shield,
  Smartphone,
  CreditCard,
  MessageCircle,
  Zap,
  Users,
  Lock,
  Unlock,
  Settings,
  Plus,
  ArrowRight,
  CheckCircle,
  AlertTriangle
} from "lucide-react";
import NTAG424AuthModal from "./NTAG424AuthModal";

interface NTAG424IntegrationExampleProps {
  onAuthSuccess?: (authResult: any) => void;
  onPaymentSuccess?: (paymentResult: any) => void;
  onCommunicationSuccess?: (commResult: any) => void;
}

export const NTAG424IntegrationExample: React.FC<NTAG424IntegrationExampleProps> = ({
  onAuthSuccess,
  onPaymentSuccess,
  onCommunicationSuccess
}) => {
  // Modal states
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCommunicationModal, setShowCommunicationModal] = useState(false);
  
  // Authentication state
  const [authState, setAuthState] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Handle authentication success
  const handleAuthSuccess = (result: any) => {
    setAuthState(result);
    setIsAuthenticated(true);
    onAuthSuccess?.(result);
    console.log('✅ NTAG424 Authentication successful:', result);
  };

  // Handle payment authentication
  const handlePaymentAuth = () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    // Proceed with payment flow
    console.log('💰 Proceeding with payment flow...');
    onPaymentSuccess?.({ status: 'ready', authState });
  };

  // Handle communication authentication
  const handleCommunicationAuth = () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    // Proceed with communication flow
    console.log('💬 Proceeding with communication flow...');
    onCommunicationSuccess?.({ status: 'ready', authState });
  };

  // Handle sign out
  const handleSignOut = () => {
    setAuthState(null);
    setIsAuthenticated(false);
    console.log('🔒 Signed out from NTAG424 authentication');
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <Smartphone className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">
          NTAG424 Physical Authentication Integration
        </h1>
        <p className="text-purple-200 text-lg">
          Secure multi-factor authentication for Bitcoin-only family banking
        </p>
      </div>

      {/* Authentication Status */}
      <div className="bg-purple-900/50 rounded-xl p-6 border border-purple-600/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {isAuthenticated ? (
              <>
                <CheckCircle className="h-6 w-6 text-green-400" />
                <div>
                  <h3 className="text-lg font-semibold text-white">Authenticated</h3>
                  <p className="text-purple-200 text-sm">
                    {authState?.userNpub ? `${authState.userNpub.substring(0, 16)}...` : 'Unknown user'}
                    {authState?.familyRole && ` • ${authState.familyRole}`}
                  </p>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="h-6 w-6 text-yellow-400" />
                <div>
                  <h3 className="text-lg font-semibold text-white">Not Authenticated</h3>
                  <p className="text-purple-200 text-sm">
                    Tap your NFC tag to authenticate
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex space-x-2">
            {!isAuthenticated ? (
              <button
                onClick={() => setShowAuthModal(true)}
                className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 flex items-center space-x-2"
              >
                <Smartphone className="h-4 w-4" />
                <span>Authenticate</span>
              </button>
            ) : (
              <button
                onClick={handleSignOut}
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 flex items-center space-x-2"
              >
                <Lock className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Integration Examples */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sign In / Sign On Integration */}
        <div className="bg-purple-900/30 rounded-xl p-6 border border-purple-600/20 hover:border-purple-500/40 transition-all duration-300">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Sign In / Sign On</h3>
              <p className="text-purple-200 text-sm">Secure authentication flow</p>
            </div>
          </div>
          <p className="text-purple-300 text-sm mb-4">
            Use your physical NFC tag to authenticate and access your sovereign family banking account.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            disabled={isAuthenticated}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
          >
            {isAuthenticated ? (
              <>
                <CheckCircle className="h-4 w-4" />
                <span>Already Authenticated</span>
              </>
            ) : (
              <>
                <Smartphone className="h-4 w-4" />
                <span>Sign In with NFC</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>

        {/* Payment Integration */}
        <div className="bg-purple-900/30 rounded-xl p-6 border border-purple-600/20 hover:border-purple-500/40 transition-all duration-300">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Tap to Spend</h3>
              <p className="text-purple-200 text-sm">Lightning & eCash payments</p>
            </div>
          </div>
          <p className="text-purple-300 text-sm mb-4">
            Authorize Lightning Network and eCash payments with a simple tap of your NFC tag.
          </p>
          <button
            onClick={handlePaymentAuth}
            className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
          >
            <Zap className="h-4 w-4" />
            <span>Authorize Payment</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Communication Integration */}
        <div className="bg-purple-900/30 rounded-xl p-6 border border-purple-600/20 hover:border-purple-500/40 transition-all duration-300">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
              <MessageCircle className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Secure Communication</h3>
              <p className="text-purple-200 text-sm">Nostr & family messaging</p>
            </div>
          </div>
          <p className="text-purple-300 text-sm mb-4">
            Sign Nostr events and access encrypted family communications with NFC authentication.
          </p>
          <button
            onClick={handleCommunicationAuth}
            className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
          >
            <MessageCircle className="h-4 w-4" />
            <span>Secure Communication</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Advanced Features */}
      <div className="bg-purple-900/20 rounded-xl p-6 border border-purple-600/20">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
          <Settings className="h-5 w-5" />
          <span>Advanced NTAG424 Features</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg flex items-center justify-center">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Multi-Factor Security</h4>
                <p className="text-purple-200 text-sm">PIN + NFC tag authentication</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <Users className="h-4 w-4 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Family Role Management</h4>
                <p className="text-purple-200 text-sm">Hierarchical RBAC support</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Tap to Sign</h4>
                <p className="text-purple-200 text-sm">Nostr event signing</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Tap to Spend</h4>
                <p className="text-purple-200 text-sm">Lightning & eCash authorization</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
                <Lock className="h-4 w-4 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Guardian Approval</h4>
                <p className="text-purple-200 text-sm">Multi-party authorization</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <Plus className="h-4 w-4 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Tag Registration</h4>
                <p className="text-purple-200 text-sm">Secure onboarding process</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-6">
        <h3 className="text-xl font-bold text-yellow-300 mb-4 flex items-center space-x-2">
          <AlertTriangle className="h-5 w-5" />
          <span>How to Use NTAG424 Authentication</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-200">1. Registration</h4>
            <ul className="text-yellow-100 space-y-1">
              <li>• Enter your PIN code</li>
              <li>• Provide your Nostr public key</li>
              <li>• Select your family role</li>
              <li>• Tap your NFC tag to register</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-200">2. Authentication</h4>
            <ul className="text-yellow-100 space-y-1">
              <li>• Enter your PIN code</li>
              <li>• Tap your registered NFC tag</li>
              <li>• Wait for verification</li>
              <li>• Access your account</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-200">3. Usage</h4>
            <ul className="text-yellow-100 space-y-1">
              <li>• Tap to sign Nostr events</li>
              <li>• Tap to authorize payments</li>
              <li>• Tap for guardian approval</li>
              <li>• Secure family communications</li>
            </ul>
          </div>
        </div>
      </div>

      {/* NTAG424 Authentication Modal */}
      <NTAG424AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
        mode="both"
        destination={authState?.familyRole === 'private' ? 'individual' : 'family'}
        title="NTAG424 Physical Authentication"
        purpose="Secure multi-factor authentication with your physical NFC tag"
      />
    </div>
  );
};

export default NTAG424IntegrationExample; 