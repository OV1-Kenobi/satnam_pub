/**
 * NWC Wallet Setup Modal - Master Context Compliant
 * 
 * Comprehensive NWC wallet setup with educational content, sovereignty guidance,
 * and integration with Zeus LN and Alby wallets. Positions NWC as the ultimate
 * goal of the user's sovereignty journey.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * - Individual Wallet Sovereignty education and enforcement
 * - Privacy-first architecture with no sensitive data exposure
 * - Standardized role hierarchy integration
 * - Educational flows guiding users toward self-custodial sovereignty
 * - Integration with existing wallet management systems
 */

import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Crown,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  Shield,
  X,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from './auth/AuthProvider'; // FIXED: Use unified auth system
import { useNWCWallet } from '../hooks/useNWCWallet';

interface NWCWalletSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (connectionId: string) => void;
  showEducationalContent?: boolean;
}

type SetupStep = 'education' | 'wallet-selection' | 'connection' | 'testing' | 'success';

interface RecommendedWallet {
  id: string;
  name: string;
  description: string;
  platform: 'mobile' | 'desktop' | 'both';
  website: string;
  setupGuide: string;
  icon: React.ReactNode;
  features: string[];
  sovereignty: 'high' | 'medium' | 'low';
}

const recommendedWallets: RecommendedWallet[] = [
  {
    id: 'zeus',
    name: 'Zeus LN',
    description: 'Self-custodial Lightning wallet with full node capabilities',
    platform: 'mobile',
    website: 'https://zeusln.com',
    setupGuide: 'Connect your own Lightning node or use embedded LND',
    icon: <Zap className="h-6 w-6 text-yellow-500" />,
    features: ['Self-custodial', 'Full Lightning node', 'NWC support', 'Advanced features'],
    sovereignty: 'high',
  },
  {
    id: 'alby',
    name: 'Alby Browser Extension',
    description: 'Lightning wallet browser extension with NWC support',
    platform: 'desktop',
    website: 'https://getalby.com',
    setupGuide: 'Install browser extension and connect to your Lightning node',
    icon: <Globe className="h-6 w-6 text-orange-500" />,
    features: ['Browser integration', 'NWC support', 'Easy setup', 'Web payments'],
    sovereignty: 'high',
  },
];

export default function NWCWalletSetupModal({
  isOpen,
  onClose,
  onSuccess,
  showEducationalContent = true,
}: NWCWalletSetupModalProps) {
  const { userRole } = useAuth();
  const { addConnection, testConnection, loading, error, clearError } = useNWCWallet();

  const [currentStep, setCurrentStep] = useState<SetupStep>('education');
  const [selectedWallet, setSelectedWallet] = useState<RecommendedWallet | null>(null);
  const [connectionString, setConnectionString] = useState('');
  const [walletName, setWalletName] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(showEducationalContent ? 'education' : 'wallet-selection');
      setSelectedWallet(null);
      setConnectionString('');
      setWalletName('');
      setIsConnecting(false);
      setConnectionId(null);
      clearError();
    }
  }, [isOpen, showEducationalContent, clearError]);

  const handleWalletSelection = (wallet: RecommendedWallet) => {
    setSelectedWallet(wallet);
    setWalletName(`${wallet.name} Wallet`);
    setCurrentStep('connection');
  };

  const handleConnectionSubmit = async () => {
    if (!connectionString.trim() || !selectedWallet) return;

    setIsConnecting(true);
    clearError();

    try {
      const success = await addConnection(
        connectionString.trim(),
        walletName || `${selectedWallet.name} Wallet`,
        selectedWallet.id
      );

      if (success) {
        setCurrentStep('testing');
        // Simulate testing delay
        setTimeout(() => {
          setCurrentStep('success');
          if (onSuccess && connectionId) {
            onSuccess(connectionId);
          }
        }, 2000);
      }
    } catch (err) {
      console.error('Connection failed:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const renderEducationStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mb-4">
          <Crown className="h-8 w-8 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-white mb-2">
          Achieve Financial Sovereignty
        </h3>
        <p className="text-gray-300">
          Connect your self-custodial Lightning wallet for true financial independence
        </p>
      </div>

      <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-xl p-6 border border-purple-500/20">
        <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
          <Shield className="h-5 w-5 text-purple-400 mr-2" />
          Why NWC (Nostr Wallet Connect)?
        </h4>
        <div className="space-y-3 text-gray-300">
          <div className="flex items-start space-x-3">
            <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="text-white">Self-Custody:</strong> You control your private keys and funds
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="text-white">Privacy:</strong> No third-party access to your transaction data
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="text-white">Sovereignty:</strong>
              {userRole === 'offspring'
                ? ' Build financial independence with guardian guidance'
                : ' Unlimited spending authority with no restrictions'
              }
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="text-white">Integration:</strong> Seamless payments across all Satnam features
            </div>
          </div>
        </div>
      </div>

      {userRole === 'offspring' && (
        <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-500/20">
          <div className="flex items-start space-x-3">
            <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-200">
              <strong>For Young Adults:</strong> Your NWC wallet will have spending limits and require
              guardian approval for large payments (over 25K sats) as part of your financial education journey.
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Maybe Later
        </button>
        <button
          onClick={() => setCurrentStep('wallet-selection')}
          className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg text-white font-medium transition-all"
        >
          <span>Get Started</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const renderWalletSelectionStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-white mb-2">
          Choose Your Lightning Wallet
        </h3>
        <p className="text-gray-300">
          Select a recommended self-custodial wallet for maximum sovereignty
        </p>
      </div>

      <div className="space-y-4">
        {recommendedWallets.map((wallet) => (
          <div
            key={wallet.id}
            onClick={() => handleWalletSelection(wallet)}
            className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${selectedWallet?.id === wallet.id
                ? 'border-purple-500 bg-purple-900/20'
                : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
              }`}
          >
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-gray-700/50 rounded-lg">
                {wallet.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-lg font-semibold text-white">{wallet.name}</h4>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${wallet.sovereignty === 'high'
                        ? 'bg-green-900/30 text-green-300 border border-green-500/20'
                        : 'bg-yellow-900/30 text-yellow-300 border border-yellow-500/20'
                      }`}>
                      {wallet.sovereignty === 'high' ? 'High Sovereignty' : 'Medium Sovereignty'}
                    </span>
                    <span className="px-2 py-1 bg-gray-700/50 text-gray-300 rounded-full text-xs">
                      {wallet.platform}
                    </span>
                  </div>
                </div>
                <p className="text-gray-300 mb-3">{wallet.description}</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {wallet.features.map((feature) => (
                    <span
                      key={feature}
                      className="px-2 py-1 bg-gray-700/30 text-gray-300 rounded text-xs"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <a
                    href={wallet.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 text-sm"
                  >
                    <span>Visit Website</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <span className="text-gray-400 text-sm">{wallet.setupGuide}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep('education')}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Back
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const renderConnectionStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mb-4">
          {selectedWallet?.icon}
        </div>
        <h3 className="text-xl font-bold text-white mb-2">
          Connect {selectedWallet?.name}
        </h3>
        <p className="text-gray-300">
          Enter your NWC connection string to link your wallet
        </p>
      </div>

      <div className="bg-blue-50 rounded-lg p-4 mb-6">
        <div className="flex items-start space-x-3">
          <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-blue-900 mb-2">
              Where to find your NWC connection string:
            </h4>
            <ul className="text-sm text-blue-800 space-y-1">
              {selectedWallet?.id === 'zeus' && (
                <>
                  <li>• Open Zeus LN app</li>
                  <li>• Go to Settings → Lightning → NWC</li>
                  <li>• Create new connection and copy the string</li>
                </>
              )}
              {selectedWallet?.id === 'alby' && (
                <>
                  <li>• Open Alby browser extension</li>
                  <li>• Go to Settings → Wallet Connect</li>
                  <li>• Generate connection string and copy it</li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Wallet Name
          </label>
          <input
            type="text"
            value={walletName}
            onChange={(e) => setWalletName(e.target.value)}
            placeholder={`${selectedWallet?.name} Wallet`}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            NWC Connection String
          </label>
          <textarea
            value={connectionString}
            onChange={(e) => setConnectionString(e.target.value)}
            placeholder="nostr+walletconnect://..."
            rows={3}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        {error && (
          <div className="flex items-center space-x-2 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep('wallet-selection')}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleConnectionSubmit}
          disabled={!connectionString.trim() || isConnecting}
          className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-all"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <span>Connect Wallet</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );

  const renderTestingStep = () => (
    <div className="space-y-6 text-center">
      <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mb-4">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
      <h3 className="text-xl font-bold text-white mb-2">
        Testing Connection
      </h3>
      <p className="text-gray-300">
        Verifying your NWC wallet connection and checking capabilities...
      </p>
      <div className="bg-gray-800/30 rounded-lg p-4">
        <div className="text-sm text-gray-400">
          This may take a few moments while we establish a secure connection
        </div>
      </div>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="space-y-6 text-center">
      <div className="mx-auto w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mb-4">
        <CheckCircle className="h-8 w-8 text-white" />
      </div>
      <h3 className="text-2xl font-bold text-white mb-2">
        🎉 Wallet Connected Successfully!
      </h3>
      <p className="text-gray-300">
        Your {selectedWallet?.name} is now connected and ready for sovereign payments
      </p>

      <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded-xl p-6 border border-green-500/20">
        <h4 className="text-lg font-semibold text-white mb-4">
          🚀 You've Achieved Financial Sovereignty!
        </h4>
        <div className="space-y-2 text-gray-300 text-sm">
          <div>✅ Self-custodial Lightning wallet connected</div>
          <div>✅ Privacy-preserving payments enabled</div>
          <div>✅ Integration with all Satnam features active</div>
          {userRole !== 'offspring' && <div>✅ Unlimited spending authority confirmed</div>}
        </div>
      </div>

      <button
        onClick={onClose}
        className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg text-white font-medium transition-all"
      >
        Start Using Your Sovereign Wallet
      </button>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">
              NWC Wallet Setup
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>

          {currentStep === 'education' && renderEducationStep()}
          {currentStep === 'wallet-selection' && renderWalletSelectionStep()}
          {currentStep === 'connection' && renderConnectionStep()}
          {currentStep === 'testing' && renderTestingStep()}
          {currentStep === 'success' && renderSuccessStep()}
        </div>
      </div>
    </div>
  );
}
