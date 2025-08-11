import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Eye,
  EyeOff,
  Info,
  Key,
  MessageCircle,
  RefreshCw,
  Send,
  Shield,
  Wallet,
  X,
} from "lucide-react";
import React, { useState } from "react";
import { useFamilyFederationAuth } from "../../hooks/useFamilyFederationAuth";
import type { NWCAuthResponse, VerificationResponse } from "../../types/auth";
import { handleAuthenticationSuccess, isSuccessfulAuthResponse } from '../../utils/authSuccessHandler.js';

interface NWCOTPSignInProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNew?: () => void;
}

const NWCOTPSignIn: React.FC<NWCOTPSignInProps> = ({
  isOpen,
  onClose,
  onCreateNew,
}) => {
  const { login } = useFamilyFederationAuth();

  // UI State
  const [showOTPFlow, setShowOTPFlow] = useState(false);
  const [showNWCFlow, setShowNWCFlow] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // NWC State
  const [nwcUrl, setNwcUrl] = useState("");
  const [showNwcUrl, setShowNwcUrl] = useState(false);

  // OTP State
  const [nipOrNpub, setNipOrNpub] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpKey, setOtpKey] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  if (!isOpen) return null;

  const resetState = () => {
    setShowOTPFlow(false);
    setShowNWCFlow(false);
    setNipOrNpub("");
    setOtpCode("");
    setOtpKey("");
    setOtpSent(false);
    setNwcUrl("");
    setError(null);
    setSuccess(null);
    setIsLoading(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleNWCSignIn = async (): Promise<void> => {
    if (!nwcUrl.trim()) {
      setError("Please enter your NWC URL");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/nwc-signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nwcUrl }),
      });

      const result: NWCAuthResponse = await response.json();

      if (isSuccessfulAuthResponse(result)) {
        const { message } = handleAuthenticationSuccess(result, 'nwc', {
          login,
          onClose: handleClose,
          mode: 'modal',
          messagePrefix: "NWC authentication successful!"
        });
        setSuccess(message);
      } else {
        setError(result.error || "NWC authentication failed");
      }
    } catch (error) {
      console.error("NWC sign-in failed:", error);
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (!nipOrNpub.trim()) {
      setError("Please enter your NIP-05 or npub");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const requestBody: any = {};

      if (nipOrNpub.includes("@")) {
        requestBody.nip05 = nipOrNpub;
      } else if (nipOrNpub.startsWith("npub")) {
        requestBody.npub = nipOrNpub;
      } else {
        requestBody.pubkey = nipOrNpub;
      }

      const response = await fetch("/api/auth/otp/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (result.success) {
        setOtpKey(result.data.otpKey);
        setOtpSent(true);
        setSuccess("OTP sent successfully! Check your Nostr DMs.");

        // For demo purposes, show the OTP
        if (result.data._demo_otp) {
          setSuccess(`Demo OTP: ${result.data._demo_otp} (Check your Nostr DMs in production)`);
        }
      } else {
        setError(result.error || "Failed to send OTP");
      }
    } catch (error) {
      console.error("Failed to send OTP:", error);
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPSubmit = async (): Promise<void> => {
    if (!otpCode.trim()) {
      setError("Please enter the OTP code");
      return;
    }

    if (!otpKey) {
      setError("Invalid OTP session. Please request a new code.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          otpKey,
          otp: otpCode,
        }),
      });

      const result: VerificationResponse = await response.json();

      if (isSuccessfulAuthResponse(result)) {
        const { message } = handleAuthenticationSuccess(result, 'otp', {
          login,
          onClose: handleClose,
          mode: 'modal',
          messagePrefix: "OTP verification successful!"
        });
        setSuccess(message);
      } else {
        setError(result.error || "OTP verification failed");
        if (result.attemptsRemaining !== undefined) {
          setError(`${result.error} (${result.attemptsRemaining} attempts remaining)`);
        }
      }
    } catch (error) {
      console.error("OTP verification failed:", error);
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const resetOTPFlow = () => {
    setShowOTPFlow(false);
    setNipOrNpub("");
    setOtpCode("");
    setOtpKey("");
    setOtpSent(false);
    setError(null);
    setSuccess(null);
  };

  const resetNWCFlow = () => {
    setShowNWCFlow(false);
    setNwcUrl("");
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-purple-900 rounded-2xl p-8 max-w-2xl w-full border border-purple-400/20 relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
        >
          <X className="h-5 w-5 text-white" />
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Nostr Identity Authentication</h2>
          <div className="flex items-center justify-center space-x-2 mb-2">
            <div className="bg-purple-800 text-purple-200 px-3 py-1 rounded-full text-sm font-medium flex items-center space-x-1">
              <span>🆔</span>
              <span>Identity</span>
            </div>
          </div>
          <p className="text-purple-200">
            Authenticate your Nostr identity to access Family Federation
          </p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-green-400 text-sm">{success}</p>
            </div>
          </div>
        )}

        {!showOTPFlow && !showNWCFlow ? (
          <>
            {/* Main Sign-in Options */}
            <div className="space-y-6 mb-8">
              <h3 className="text-white font-bold text-xl mb-4">
                Choose your authentication method
              </h3>

              {/* Nostr Wallet Connect Option */}
              <div className="bg-white/10 rounded-2xl p-6 border border-purple-500/20">
                <div className="flex items-start space-x-4 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center flex-shrink-0">
                    <Wallet className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-bold text-lg mb-2">
                      Nostr Wallet Connect (NWC)
                    </h4>
                    <p className="text-purple-200 text-sm mb-4">
                      Fast and secure authentication using your NWC-enabled wallet.
                      Perfect for users with compatible Nostr wallets.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowNWCFlow(true)}
                  className="w-full bg-purple-800 hover:bg-purple-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                >
                  <Wallet className="h-5 w-5" />
                  <span>Sign in with NWC</span>
                </button>
              </div>

              {/* OTP via Nostr DM Option */}
              <div className="bg-white/10 rounded-2xl p-6 border border-purple-500/20">
                <div className="flex items-start space-x-4 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-bold text-lg mb-2">
                      One-Time Password (OTP)
                    </h4>
                    <p className="text-purple-200 text-sm mb-4">
                      Receive a secure code via Nostr DM. Works with any Nostr
                      client that supports direct messages.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowOTPFlow(true)}
                  className="w-full bg-purple-800 hover:bg-purple-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                >
                  <MessageCircle className="h-5 w-5" />
                  <span>Sign in with OTP</span>
                </button>
              </div>

              {/* Info Tooltip */}
              <div className="relative">
                <button
                  onClick={() => setShowTooltip(!showTooltip)}
                  className="flex items-center space-x-2 text-purple-200 hover:text-white transition-colors duration-200"
                >
                  <Info className="h-4 w-4" />
                  <span className="text-sm">Why two authentication methods?</span>
                </button>

                {showTooltip && (
                  <div className="absolute top-8 left-0 bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 max-w-md z-10">
                    <p className="text-purple-100 text-sm">
                      NWC is fast and secure for users with compatible wallets.
                      OTP via Nostr DM works with any Nostr client that supports
                      direct messages. Both methods verify your identity and
                      check Family Federation whitelist status.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            {onCreateNew && (
              <>
                <div className="flex items-center space-x-4 mb-8">
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
                    Create your sovereign identity and join the decentralized future.
                  </p>
                  <button
                    onClick={onCreateNew}
                    className="bg-purple-800 hover:bg-purple-700 text-white font-bold py-4 px-8 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-2 mx-auto"
                  >
                    <Key className="h-5 w-5" />
                    <span>Create New Identity</span>
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </div>
              </>
            )}
          </>
        ) : showNWCFlow ? (
          /* NWC Flow */
          <div className="space-y-6">
            <div className="flex items-center space-x-4 mb-6">
              <button
                onClick={resetNWCFlow}
                className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
              >
                <ArrowRight className="h-5 w-5 text-white rotate-180" />
              </button>
              <h3 className="text-white font-bold text-xl">
                Sign in with Nostr Wallet Connect
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-white font-semibold mb-2">
                  Enter your NWC URL
                </label>
                <div className="relative">
                  <input
                    type={showNwcUrl ? "text" : "password"}
                    value={nwcUrl}
                    onChange={(e) => setNwcUrl(e.target.value)}
                    placeholder="nostr+walletconnect://..."
                    className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-purple-400 transition-all duration-300"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNwcUrl(!showNwcUrl)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-200 hover:text-white"
                  >
                    {showNwcUrl ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
                <p className="text-purple-200 text-sm mt-2">
                  Your NWC URL from a compatible wallet (e.g., Alby, Mutiny, etc.)
                </p>
              </div>

              <button
                onClick={handleNWCSignIn}
                disabled={!nwcUrl.trim() || isLoading}
                className="w-full bg-purple-800 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <Wallet className="h-5 w-5" />
                )}
                <span>{isLoading ? "Connecting..." : "Connect with NWC"}</span>
              </button>
            </div>
          </div>
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
              <h3 className="text-white font-bold text-xl">
                Sign in with OTP
              </h3>
            </div>

            {!otpSent ? (
              /* Step 1: Enter NIP-05 or npub */
              <div className="space-y-4">
                <div>
                  <label className="block text-white font-semibold mb-2">
                    Enter your NIP-05 or npub
                  </label>
                  <input
                    type="text"
                    value={nipOrNpub}
                    onChange={(e) => setNipOrNpub(e.target.value)}
                    placeholder="yourname@domain.com or npub1..."
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-purple-400 transition-all duration-300"
                  />
                  <p className="text-purple-200 text-sm mt-2">
                    We'll send a secure one-time code to your Nostr account via
                    direct message.
                  </p>
                </div>

                <button
                  onClick={handleSendOTP}
                  disabled={!nipOrNpub.trim() || isLoading}
                  className="w-full bg-purple-800 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                >
                  {isLoading ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                  <span>{isLoading ? "Sending..." : "Send OTP Code"}</span>
                </button>
              </div>
            ) : (
              /* Step 2: Enter OTP Code */
              <div className="space-y-4">
                <div>
                  <label className="block text-white font-semibold mb-2">
                    Enter the 6-digit code
                  </label>
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-purple-400 transition-all duration-300 text-center text-2xl tracking-widest"
                    maxLength={6}
                  />
                  <p className="text-purple-200 text-sm mt-2">
                    Check your Nostr DMs for the verification code.
                  </p>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode("");
                      setError(null);
                    }}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
                  >
                    Resend Code
                  </button>
                  <button
                    onClick={handleOTPSubmit}
                    disabled={otpCode.length !== 6 || isLoading}
                    className="flex-1 bg-purple-800 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    {isLoading ? (
                      <RefreshCw className="h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-5 w-5" />
                    )}
                    <span>{isLoading ? "Verifying..." : "Verify"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NWCOTPSignIn;