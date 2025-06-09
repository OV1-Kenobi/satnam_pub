import React, { useState } from 'react';
import { 
  X, 
  Wallet, 
  MessageCircle, 
  Key, 
  ArrowRight, 
  Send, 
  RefreshCw,
  Info,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignInSuccess: () => void;
  onCreateNew: () => void;
}

const SignInModal: React.FC<SignInModalProps> = ({ isOpen, onClose, onSignInSuccess, onCreateNew }) => {
  const [showOTPFlow, setShowOTPFlow] = useState(false);
  const [nipOrNpub, setNipOrNpub] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  if (!isOpen) return null;

  const handleNWCSignIn = async () => {
    setIsLoading(true);
    try {
      // Placeholder for NWC implementation
      console.log('Initiating Nostr Wallet Connect sign-in...');
      // This would integrate with NWC protocol
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
      onSignInSuccess();
    } catch (error) {
      console.error('NWC sign-in failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (!nipOrNpub.trim()) return;
    
    setIsLoading(true);
    try {
      // Placeholder for OTP sending implementation
      console.log('Sending OTP to:', nipOrNpub);
      // This would send a DM via Nostr relay
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call
      setOtpSent(true);
    } catch (error) {
      console.error('Failed to send OTP:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPSubmit = async () => {
    if (!otpCode.trim()) return;
    
    setIsLoading(true);
    try {
      // Placeholder for OTP verification implementation
      console.log('Verifying OTP:', otpCode);
      // This would verify the OTP code
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      onSignInSuccess();
    } catch (error) {
      console.error('OTP verification failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetOTPFlow = () => {
    setShowOTPFlow(false);
    setNipOrNpub('');
    setOtpCode('');
    setOtpSent(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-purple-900 rounded-2xl p-8 max-w-2xl w-full border border-yellow-400/20 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
        >
          <X className="h-5 w-5 text-white" />
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <img src="/SatNam.Pub logo.png" alt="SatNam.Pub" className="h-10 w-10 rounded-full" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
          <p className="text-purple-200">Sign in with your existing Nostr account or create a new identity</p>
        </div>

        {!showOTPFlow ? (
          <>
            {/* Existing User Sign-in Options */}
            <div className="space-y-6 mb-8">
              <h3 className="text-white font-bold text-xl mb-4">Sign in with your existing Nostr account</h3>
              
              {/* Nostr Wallet Connect Option */}
              <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
                <div className="flex items-start space-x-4 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <Wallet className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-bold text-lg mb-2">Sign in with Nostr Wallet Connect</h4>
                    <p className="text-purple-200 text-sm mb-4">
                      Fast and secure authentication using your compatible Nostr wallet. Perfect for users with NWC-enabled wallets.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleNWCSignIn}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                >
                  {isLoading ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <Wallet className="h-5 w-5" />
                  )}
                  <span>{isLoading ? 'Connecting...' : 'Sign in with Nostr Wallet Connect'}</span>
                </button>
              </div>

              {/* OTP via Nostr DM Option */}
              <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
                <div className="flex items-start space-x-4 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-bold text-lg mb-2">Sign in with One-Time Password (OTP) via Nostr DM</h4>
                    <p className="text-purple-200 text-sm mb-4">
                      Receive a secure code via direct message on Nostr. Works with any Nostr client that supports DMs.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowOTPFlow(true)}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                >
                  <MessageCircle className="h-5 w-5" />
                  <span>Sign in with Nostr DM (One-Time Password)</span>
                </button>
              </div>

              {/* Why Two Options Tooltip */}
              <div className="relative">
                <button
                  onClick={() => setShowTooltip(!showTooltip)}
                  className="flex items-center space-x-2 text-purple-200 hover:text-white transition-colors duration-200"
                >
                  <Info className="h-4 w-4" />
                  <span className="text-sm">Why two sign-in options?</span>
                </button>
                
                {showTooltip && (
                  <div className="absolute top-8 left-0 bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 max-w-md z-10">
                    <p className="text-purple-100 text-sm">
                      Nostr Wallet Connect is fast and secure for users with compatible wallets. One-Time Password via Nostr DM lets you sign in using any Nostr client that supports direct messages.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center space-x-4 mb-8">
              <div className="flex-1 h-px bg-white/20" />
              <span className="text-purple-200 text-sm">OR</span>
              <div className="flex-1 h-px bg-white/20" />
            </div>

            {/* New User Section */}
            <div className="text-center">
              <h3 className="text-white font-bold text-xl mb-4">New to Nostr?</h3>
              <p className="text-purple-200 mb-6">
                Forge your identity and join the decentralized future with Satnam.pub.
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
          </>
        ) : (
          /* OTP Flow */
          <div className="space-y-6">
            <div className="flex items-center space-x-4 mb-6">
              <button
                onClick={resetOTPFlow}
                className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
              >
                <ArrowRight className="h-5 w-5 text-white rotate-180" />
              </button>
              <h3 className="text-white font-bold text-xl">Sign in with Nostr DM</h3>
            </div>

            {!otpSent ? (
              /* Step 1: Enter NIP-05 or npub */
              <div className="space-y-4">
                <div>
                  <label className="block text-white font-semibold mb-2">
                    Enter your NIP-05 identifier or npub
                  </label>
                  <input
                    type="text"
                    value={nipOrNpub}
                    onChange={(e) => setNipOrNpub(e.target.value)}
                    placeholder="yourname@domain.com or npub1..."
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-yellow-400 transition-all duration-300"
                  />
                  <p className="text-purple-200 text-sm mt-2">
                    We'll send a secure one-time code to your Nostr account via direct message.
                  </p>
                </div>

                <button
                  onClick={handleSendOTP}
                  disabled={!nipOrNpub.trim() || isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                >
                  {isLoading ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                  <span>{isLoading ? 'Sending...' : 'Send One-Time Code'}</span>
                </button>
              </div>
            ) : (
              /* Step 2: Enter OTP Code */
              <div className="space-y-4">
                <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-green-400 font-semibold">Code Sent!</p>
                      <p className="text-green-200 text-sm">
                        We've sent a one-time code to your Nostr account via DM. Please check your favorite Nostr client and enter the code below.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-white font-semibold mb-2">
                    Enter the verification code
                  </label>
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-yellow-400 transition-all duration-300 text-center text-lg tracking-widest"
                    maxLength={6}
                  />
                  <p className="text-purple-200 text-sm mt-2">
                    Use any Nostr app that supports DMs (like Amethyst, Damus, Iris.to, or Snort.social) to retrieve your code.
                  </p>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={handleOTPSubmit}
                    disabled={!otpCode.trim() || isLoading}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    {isLoading ? (
                      <RefreshCw className="h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-5 w-5" />
                    )}
                    <span>{isLoading ? 'Verifying...' : 'Submit'}</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode('');
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2"
                  >
                    <RefreshCw className="h-5 w-5" />
                    <span>Resend</span>
                  </button>
                </div>

                <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-blue-400 font-semibold">Didn't receive the code?</p>
                      <p className="text-blue-200 text-sm">
                        Make sure your Nostr client is connected and can receive direct messages. You can also try requesting a new code.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SignInModal;