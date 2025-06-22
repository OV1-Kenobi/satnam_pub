import {
  ArrowRight,
  CheckCircle,
  Copy,
  ExternalLink,
  Info,
  Key,
  MessageCircle,
  QrCode,
  RefreshCw,
  Send,
  Wallet,
  X
} from "lucide-react";
import * as QRCode from "qrcode";
import React, { useEffect, useState } from "react";
import type { NWCAuthResponse } from "../types/auth";

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignInSuccess: () => void;
  onCreateNew: () => void;
}

const SignInModal: React.FC<SignInModalProps> = ({
  isOpen,
  onClose,
  onSignInSuccess,
  onCreateNew,
}) => {
  const [showOTPFlow, setShowOTPFlow] = useState(false);
  const [nipOrNpub, setNipOrNpub] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showNWCModal, setShowNWCModal] = useState(false);
  const [nwcUri, setNwcUri] = useState("");
  const [nwcMethod, setNwcMethod] = useState<'qr' | 'input'>('qr');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

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
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, onClose]);

  // Handle backdrop click to close modal
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const handleNWCSignIn = async (): Promise<void> => {
    setShowNWCModal(true);
  };

  const handleNWCConnect = async (uri: string): Promise<void> => {
    setIsLoading(true);
    try {
      if (!uri.startsWith('nostr+walletconnect://')) {
        alert("Invalid NWC URI format. It should start with 'nostr+walletconnect://'");
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/auth/nwc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nwcUri: uri }),
      });

      const result: NWCAuthResponse = await response.json();

      if (result.success && result.data) {
        console.log("NWC authentication successful:", result.data);
        setShowNWCModal(false);
        onSignInSuccess();
      } else {
        const errorMessage = result.error || "Unknown authentication error";
        console.error("NWC authentication failed:", errorMessage);
        alert(`NWC sign-in failed: ${errorMessage}\n\nPlease check your NWC URI and try again.`);
      }
    } catch (error) {
      console.error("NWC sign-in failed:", error);
      alert("NWC sign-in failed. Please check your internet connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (!nipOrNpub.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/otp/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          npub: nipOrNpub.startsWith("npub") ? nipOrNpub : undefined,
          pubkey: !nipOrNpub.startsWith("npub") ? nipOrNpub : undefined,
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log("OTP sent successfully:", result.data.message);
        setOtpSent(true);
      } else {
        console.error("Failed to send OTP:", result.error);
        alert(`Failed to send OTP: ${result.error}`);
      }
    } catch (error) {
      console.error("Failed to send OTP:", error);
      alert("Failed to send OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPSubmit = async () => {
    if (!otpCode.trim()) return;

    setIsLoading(true);
    try {
      // Convert npub to pubkey for verification
      let pubkey = nipOrNpub;
      if (nipOrNpub.startsWith("npub")) {
        // Would need to import nip19 and convert
        // For now, assuming backend handles both formats
        pubkey = nipOrNpub;
      }

      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pubkey: pubkey,
          otp_code: otpCode,
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log("OTP verification successful:", result.data);
        onSignInSuccess();
      } else {
        console.error("OTP verification failed:", result.error);
        alert(`OTP verification failed: ${result.error}`);
      }
    } catch (error) {
      console.error("OTP verification failed:", error);
      alert("OTP verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const resetOTPFlow = () => {
    setShowOTPFlow(false);
    setNipOrNpub("");
    setOtpCode("");
    setOtpSent(false);
  };

  const generateQRCode = async (text: string) => {
    try {
      const dataUrl = await QRCode.toDataURL(text, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      setQrCodeDataUrl(dataUrl);
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const resetNWCModal = () => {
    setShowNWCModal(false);
    setNwcUri("");
    setNwcMethod('qr');
    setQrCodeDataUrl("");
    setCopied(false);
  };

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
            <img
              src="/SatNam.Pub logo.png"
              alt="SatNam.Pub"
              className="h-10 w-10 rounded-full"
            />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
          <p className="text-purple-200">
            Sign in with your existing Nostr account or create a new identity
          </p>
        </div>

        {!showOTPFlow ? (
          <>
            {/* Existing User Sign-in Options */}
            <div className="space-y-6 mb-8">
              <h3 className="text-white font-bold text-xl mb-4">
                Sign in with your existing Nostr account
              </h3>

              {/* Nostr Wallet Connect Option */}
              <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
                <div className="flex items-start space-x-4 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <Wallet className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-bold text-lg mb-2">
                      Sign in with Nostr Wallet Connect
                    </h4>
                    <p className="text-purple-200 text-sm mb-4">
                      Fast and secure authentication using your compatible Nostr
                      wallet. Perfect for users with NWC-enabled wallets.
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
                  <span>
                    {isLoading
                      ? "Connecting..."
                      : "Sign in with Nostr Wallet Connect"}
                  </span>
                </button>
              </div>

              {/* OTP via Nostr DM Option */}
              <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
                <div className="flex items-start space-x-4 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-bold text-lg mb-2">
                      Sign in with One-Time Password (OTP) via Nostr DM
                    </h4>
                    <p className="text-purple-200 text-sm mb-4">
                      Receive a secure code via direct message on Nostr. Works
                      with any Nostr client that supports DMs.
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
                      Nostr Wallet Connect is fast and secure for users with
                      compatible wallets. One-Time Password via Nostr DM lets
                      you sign in using any Nostr client that supports direct
                      messages.
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
              <h3 className="text-white font-bold text-xl mb-4">
                New to Nostr?
              </h3>
              <p className="text-purple-200 mb-6">
                Forge your identity and join the decentralized future with
                Satnam.pub.
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
              <h3 className="text-white font-bold text-xl">
                Sign in with Nostr DM
              </h3>
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
                    We'll send a secure one-time code to your Nostr account via
                    direct message.
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
                  <span>{isLoading ? "Sending..." : "Send One-Time Code"}</span>
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
                        We've sent a one-time code to your Nostr account via DM.
                        Please check your favorite Nostr client and enter the
                        code below.
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
                    Use any Nostr app that supports DMs (like Amethyst, Damus,
                    Iris.to, or Snort.social) to retrieve your code.
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
                    <span>{isLoading ? "Verifying..." : "Submit"}</span>
                  </button>

                  <button
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode("");
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
                      <p className="text-blue-400 font-semibold">
                        Didn't receive the code?
                      </p>
                      <p className="text-blue-200 text-sm">
                        Make sure your Nostr client is connected and can receive
                        direct messages. You can also try requesting a new code.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* NWC Modal */}
      {showNWCModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
            {/* Close Button */}
            <button
              onClick={resetNWCModal}
              className="absolute top-4 right-4 p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
            >
              <X className="h-5 w-5 text-white" />
            </button>

            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Wallet className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">Nostr Wallet Connect</h2>
              <p className="text-purple-200">
                Connect your Lightning wallet to sign in securely
              </p>
            </div>

            {/* Method Selection */}
            <div className="flex space-x-4 mb-8">
              <button
                onClick={() => setNwcMethod('qr')}
                className={`flex-1 p-4 rounded-lg border-2 transition-all duration-300 ${
                  nwcMethod === 'qr'
                    ? 'border-orange-500 bg-orange-500/20'
                    : 'border-white/20 bg-white/10 hover:bg-white/20'
                }`}
              >
                <QrCode className="h-6 w-6 text-white mx-auto mb-2" />
                <p className="text-white font-semibold">Scan QR Code</p>
                <p className="text-purple-200 text-sm">Use Breez or compatible wallet</p>
              </button>
              <button
                onClick={() => setNwcMethod('input')}
                className={`flex-1 p-4 rounded-lg border-2 transition-all duration-300 ${
                  nwcMethod === 'input'
                    ? 'border-orange-500 bg-orange-500/20'
                    : 'border-white/20 bg-white/10 hover:bg-white/20'
                }`}
              >
                <Key className="h-6 w-6 text-white mx-auto mb-2" />
                <p className="text-white font-semibold">Enter NWC URI</p>
                <p className="text-purple-200 text-sm">For Alby Hub users</p>
              </button>
            </div>

            {nwcMethod === 'qr' ? (
              /* QR Code Method */
              <div className="space-y-6">
                <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
                  <h3 className="text-white font-bold text-lg mb-4 flex items-center space-x-2">
                    <QrCode className="h-5 w-5" />
                    <span>Scan with your Lightning Wallet</span>
                  </h3>
                  
                  <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4 mb-6">
                    <div className="flex items-start space-x-3">
                      <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-blue-400 font-semibold mb-2">Recommended: Breez Wallet</p>
                        <p className="text-blue-200 text-sm mb-3">
                          For the best experience, we recommend using Breez Wallet, which has excellent NWC support.
                        </p>
                        <a
                          href="https://breez.technology/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-2 text-blue-300 hover:text-blue-200 transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                          <span>Download Breez Wallet</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="bg-white rounded-lg p-4 inline-block mb-4">
                      {qrCodeDataUrl ? (
                        <img src={qrCodeDataUrl} alt="NWC QR Code" className="w-64 h-64" />
                      ) : (
                        <div className="w-64 h-64 bg-gray-200 rounded-lg flex items-center justify-center">
                          <p className="text-gray-500">Generate QR code below</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-4">
                      <input
                        type="text"
                        value={nwcUri}
                        onChange={(e) => setNwcUri(e.target.value)}
                        placeholder="Enter your NWC URI to generate QR code"
                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-orange-400 transition-all duration-300"
                      />
                      
                      <div className="flex space-x-3">
                        <button
                          onClick={() => generateQRCode(nwcUri)}
                          disabled={!nwcUri.trim()}
                          className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                        >
                          <QrCode className="h-5 w-5" />
                          <span>Generate QR Code</span>
                        </button>
                        
                        <button
                          onClick={() => copyToClipboard(nwcUri)}
                          disabled={!nwcUri.trim()}
                          className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2"
                        >
                          {copied ? <CheckCircle className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                          <span>{copied ? 'Copied!' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-purple-200 text-sm mb-4">
                    After scanning, your wallet will handle the connection automatically.
                  </p>
                  <button
                    onClick={() => handleNWCConnect(nwcUri)}
                    disabled={!nwcUri.trim() || isLoading}
                    className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-8 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 mx-auto"
                  >
                    {isLoading ? (
                      <RefreshCw className="h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-5 w-5" />
                    )}
                    <span>{isLoading ? "Connecting..." : "Complete Connection"}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Input Method */
              <div className="space-y-6">
                <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
                  <h3 className="text-white font-bold text-lg mb-4 flex items-center space-x-2">
                    <Key className="h-5 w-5" />
                    <span>Enter Your NWC URI</span>
                  </h3>
                  
                  <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-4 mb-6">
                    <div className="flex items-start space-x-3">
                      <Info className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-yellow-400 font-semibold mb-2">For Alby Hub Users</p>
                        <p className="text-yellow-200 text-sm">
                          If you're running your own Alby Hub, you can paste your NWC connection string directly here.
                          Your NWC URI should start with "nostr+walletconnect://".
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-white font-semibold mb-2">
                        Nostr Wallet Connect URI
                      </label>
                      <textarea
                        value={nwcUri}
                        onChange={(e) => setNwcUri(e.target.value)}
                        placeholder="nostr+walletconnect://..."
                        rows={4}
                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-orange-400 transition-all duration-300 resize-none"
                      />
                      <p className="text-purple-200 text-sm mt-2">
                        Paste your complete NWC connection string from your wallet or Alby Hub.
                      </p>
                    </div>

                    <button
                      onClick={() => handleNWCConnect(nwcUri)}
                      disabled={!nwcUri.trim() || isLoading}
                      className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                    >
                      {isLoading ? (
                        <RefreshCw className="h-5 w-5 animate-spin" />
                      ) : (
                        <Wallet className="h-5 w-5" />
                      )}
                      <span>{isLoading ? "Connecting..." : "Connect Wallet"}</span>
                    </button>
                  </div>
                </div>

                <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-blue-400 font-semibold mb-2">Need help finding your NWC URI?</p>
                      <ul className="text-blue-200 text-sm space-y-1">
                        <li>• <strong>Alby Hub:</strong> Go to Wallet → Connections → Create new connection</li>
                        <li>• <strong>Other wallets:</strong> Look for "Nostr Wallet Connect" or "NWC" in settings</li>
                        <li>• The URI should start with "nostr+walletconnect://"</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SignInModal;
