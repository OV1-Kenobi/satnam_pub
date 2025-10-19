// Individual Authentication Component
// File: src/components/IndividualAuth.tsx
// Supports Lightning/Cashu wallet authentication for individual access

import { AlertTriangle, ArrowRight, Clock, RefreshCw, Shield, Wallet, X, Zap } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { IndividualUser } from '../types/auth';
import AmberConnectButton from "./auth/AmberConnectButton";



interface IndividualAuthProps {
  mode?: 'modal' | 'page';
  onClose?: () => void;
  onSuccess?: (user: IndividualUser) => void;
  redirectUrl?: string;
}

interface AuthContentProps {
  mode: 'modal' | 'page';
  onClose?: () => void;
  authStep: 'method-selection' | 'lightning-auth' | 'cashu-auth' | 'authenticated';
  authMethod: 'lightning' | 'cashu' | 'nwc' | null;
  lightningAddress: string;
  cashuToken: string;
  loading: boolean;
  message: string;
  error: string;
  contentClasses: string;
  setAuthMethod: (method: 'lightning' | 'cashu' | 'nwc' | null) => void;
  setAuthStep: (step: 'method-selection' | 'lightning-auth' | 'cashu-auth' | 'authenticated') => void;
  setLightningAddress: (address: string) => void;
  setCashuToken: (token: string) => void;
  handleLightningAuth: () => Promise<void>;
  handleCashuAuth: () => Promise<void>;
  resetForm: () => void;
}

const AuthContent = React.memo<AuthContentProps>(({
  mode,
  onClose,
  authStep,
  authMethod,
  lightningAddress,
  cashuToken,
  loading,
  message,
  error,
  contentClasses,
  setAuthMethod,
  setAuthStep,
  setLightningAddress,
  setCashuToken,
  handleLightningAuth,
  handleCashuAuth,
  resetForm
}) => {
  const renderMethodSelection = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <Wallet className="h-8 w-8 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-white mb-2">Individual Wallet Access</h3>
        <p className="text-purple-200">
          Choose your authentication method to access your personal Lightning/Cashu wallet
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:border-orange-500/50 transition-all duration-300">
          <div className="flex items-start space-x-4 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-white font-bold text-lg mb-2">Lightning Wallet</h4>
              <p className="text-purple-200 text-sm mb-4">username@my.satnam.pub</p>
            </div>
          </div>
          <button
            onClick={() => {
              setAuthMethod('lightning');
              setAuthStep('lightning-auth');
            }}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
          >
            <Zap className="h-5 w-5" />
            <span>Connect Lightning Wallet</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:border-orange-500/50 transition-all duration-300">
          <div className="flex items-start space-x-4 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-white font-bold text-lg mb-2">Cashu Bearer Token</h4>
              <p className="text-purple-200 text-sm mb-4">Private ecash authentication</p>
            </div>
          </div>
          <button
            onClick={() => {
              setAuthMethod('cashu');
              setAuthStep('cashu-auth');
            }}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
          >
            <Shield className="h-5 w-5" />
            <span>Verify Cashu Token</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>

        {/* Android Amber signer quick connect (feature-flagged) */}
        <AmberConnectButton />

      </div>
    </div>
  );

  const renderLightningAuth = () => (
    <div className="space-y-6">
      <div className="flex items-center space-x-4 mb-6">
        <button
          onClick={() => {
            setAuthStep('method-selection');
            setAuthMethod(null);
          }}
          className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
          disabled={loading}
        >
          <ArrowRight className="h-5 w-5 text-white rotate-180" />
        </button>
        <h3 className="text-lg font-semibold text-white">
          Lightning Wallet Authentication
        </h3>
      </div>

      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-6">
        <div className="flex items-start space-x-3 mb-4">
          <Zap className="h-6 w-6 text-orange-400 flex-shrink-0 mt-1" />
          <div>
            <h4 className="text-white font-semibold mb-2">
              Connect Your Lightning Wallet
            </h4>
            <p className="text-purple-200 text-sm mb-4">
              Enter your Lightning address to access your personal wallet
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-white font-medium mb-2">
              Lightning Address
            </label>
            <input
              type="email"
              value={lightningAddress}
              onChange={(e) => setLightningAddress(e.target.value)}
              placeholder="username@my.satnam.pub"
              className="w-full bg-white/10 border border-white/20 rounded-lg p-4 text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          <button
            onClick={handleLightningAuth}
            disabled={loading || !lightningAddress}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <Zap className="h-5 w-5" />
                <span>Connect Lightning Wallet</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  const renderCashuAuth = () => (
    <div className="space-y-6">
      <div className="flex items-center space-x-4 mb-6">
        <button
          onClick={() => {
            setAuthStep('method-selection');
            setAuthMethod(null);
          }}
          className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
          disabled={loading}
        >
          <ArrowRight className="h-5 w-5 text-white rotate-180" />
        </button>
        <h3 className="text-lg font-semibold text-white">
          Cashu Bearer Authentication
        </h3>
      </div>

      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-6">
        <div className="flex items-start space-x-3 mb-4">
          <Shield className="h-6 w-6 text-orange-400 flex-shrink-0 mt-1" />
          <div>
            <h4 className="text-white font-semibold mb-2">
              Verify Your Cashu Bearer Token
            </h4>
            <p className="text-purple-200 text-sm mb-4">
              Enter your Cashu bearer token for private ecash access
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-white font-medium mb-2">
              Cashu Bearer Token
            </label>
            <textarea
              value={cashuToken}
              onChange={(e) => setCashuToken(e.target.value)}
              placeholder="cashuAeyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
              className="w-full bg-white/10 border border-white/20 rounded-lg p-4 text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
              rows={3}
              disabled={loading}
            />
          </div>

          <button
            onClick={handleCashuAuth}
            disabled={loading || !cashuToken}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <Shield className="h-5 w-5" />
                <span>Verify Cashu Token</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  const renderError = () => error && (
    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-4">
      <div className="flex items-center space-x-2">
        <AlertTriangle className="h-5 w-5 text-red-200" />
        <span className="text-red-200 font-medium">Authentication Error</span>
      </div>
      <p className="text-red-200 mt-2">{error}</p>
      <button
        onClick={resetForm}
        className="mt-3 text-red-200 hover:text-red-100 underline text-sm"
      >
        Try Again
      </button>
    </div>
  );

  const renderMessage = () => message && (
    <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-4 mb-4">
      <div className="flex items-center space-x-2">
        <Clock className="h-5 w-5 text-blue-200" />
        <span className="text-blue-200 font-medium">Status</span>
      </div>
      <p className="text-blue-200 mt-2">{message}</p>
    </div>
  );

  return (
    <div className={contentClasses}>
      {mode === 'modal' && onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-purple-200 transition-colors duration-200 z-10"
        >
          <X className="h-6 w-6" />
        </button>
      )}

      <div className="text-center mb-8">
        <img
          src="/SatNam-logo.png"
          alt="SatNam.Pub"
          className="h-12 w-12 mx-auto mb-4 rounded-full"
        />
        <h2 className="text-3xl font-bold text-white mb-2">Individual Access</h2>
        <p className="text-purple-200">
          Secure access to your personal Lightning/Cashu wallet
        </p>
      </div>

      {renderError()}
      {renderMessage()}

      {authStep === 'method-selection' && renderMethodSelection()}
      {authStep === 'lightning-auth' && renderLightningAuth()}
      {authStep === 'cashu-auth' && renderCashuAuth()}
    </div>
  );
});

const IndividualAuth: React.FC<IndividualAuthProps> = ({
  mode = 'page',
  onClose,
  onSuccess,
  redirectUrl
}) => {
  const [authStep, setAuthStep] = useState<'method-selection' | 'lightning-auth' | 'cashu-auth' | 'authenticated'>('method-selection');
  const [authMethod, setAuthMethod] = useState<'lightning' | 'cashu' | 'nwc' | null>(null);
  const [lightningAddress, setLightningAddress] = useState('');
  const [cashuToken, setCashuToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const resetForm = useCallback(() => {
    setAuthStep('method-selection');
    setAuthMethod(null);
    setLightningAddress('');
    setCashuToken('');
    setLoading(false);
    setMessage('');
    setError('');
  }, []);

  const handleLightningAuth = useCallback(async () => {
    if (!lightningAddress) return;

    setLoading(true);
    setError('');
    setMessage('Connecting to Lightning wallet...');

    try {
      // Simulate Lightning wallet authentication
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mock successful authentication
      const mockUser: IndividualUser = {
        npub: 'npub1mock...',
        lightningAddress,
        authMethod: 'lightning',
        walletType: 'personal',
        sessionToken: 'mock-session-token',
        balance: {
          lightning: 50000,
          cashu: 0
        },
        spendingLimits: {
          daily: 100000,
          weekly: 500000,
          requiresApproval: 1000000
        }
      };

      setMessage('Lightning wallet connected successfully!');
      setAuthStep('authenticated');

      if (onSuccess) {
        onSuccess(mockUser);
      }
    } catch (err) {
      setError('Failed to connect Lightning wallet. Please check your address and try again.');
    } finally {
      setLoading(false);
    }
  }, [lightningAddress, onSuccess]);

  const handleCashuAuth = useCallback(async () => {
    if (!cashuToken) return;

    setLoading(true);
    setError('');
    setMessage('Verifying Cashu bearer token...');

    try {
      // Simulate Cashu token verification
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Mock successful authentication
      const mockUser: IndividualUser = {
        npub: 'npub1mock...',
        lightningAddress: 'cashu-user@my.satnam.pub',
        authMethod: 'cashu',
        walletType: 'personal',
        sessionToken: 'mock-cashu-session-token',
        balance: {
          lightning: 0,
          cashu: 25000
        },
        spendingLimits: {
          daily: 50000,
          weekly: 250000,
          requiresApproval: 500000
        }
      };

      setMessage('Cashu bearer token verified successfully!');
      setAuthStep('authenticated');

      if (onSuccess) {
        onSuccess(mockUser);
      }
    } catch (err) {
      setError('Invalid Cashu bearer token. Please check your token and try again.');
    } finally {
      setLoading(false);
    }
  }, [cashuToken, onSuccess]);

  const containerClasses = mode === 'modal'
    ? "bg-gradient-to-br from-purple-900 via-purple-800 to-purple-700 rounded-xl shadow-2xl border border-white/20 p-8 max-w-lg w-full mx-4 relative min-h-[400px] backdrop-blur-sm"
    : "min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-purple-700 flex items-center justify-center p-4";

  const contentClasses = mode === 'modal'
    ? ""
    : "bg-white/10 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-8 max-w-lg w-full";

  const content = (
    <AuthContent
      mode={mode}
      onClose={onClose}
      authStep={authStep}
      authMethod={authMethod}
      lightningAddress={lightningAddress}
      cashuToken={cashuToken}
      loading={loading}
      message={message}
      error={error}
      contentClasses={contentClasses}
      setAuthMethod={setAuthMethod}
      setAuthStep={setAuthStep}
      setLightningAddress={setLightningAddress}
      setCashuToken={setCashuToken}
      handleLightningAuth={handleLightningAuth}
      handleCashuAuth={handleCashuAuth}
      resetForm={resetForm}
    />
  );

  if (mode === 'modal') {
    return (
      <div className={containerClasses}>
        {content}
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      {content}
    </div>
  );
};

export default IndividualAuth;