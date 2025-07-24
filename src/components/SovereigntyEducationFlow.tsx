/**
 * Sovereignty Education Flow - Master Context Compliant
 * 
 * Educational component that guides users through their sovereignty journey,
 * positioning NWC wallet connection as the ultimate goal for financial independence.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * - Individual Wallet Sovereignty education with role-based content
 * - Privacy-first architecture with no user data tracking
 * - Standardized role hierarchy integration
 * - Educational flows guiding users toward self-custodial sovereignty
 * - Integration with existing wallet management systems
 */

import {
  ArrowRight,
  CheckCircle,
  Crown,
  ExternalLink,
  Globe,
  Info,
  Lock,
  Shield,
  TrendingUp,
  Users,
  Wallet,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNWCWallet } from '../hooks/useNWCWallet';

interface SovereigntyEducationFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onStartNWCSetup: () => void;
  currentStep?: 'introduction' | 'benefits' | 'journey' | 'wallets' | 'action';
}

type SovereigntyLevel = 'custodial' | 'hybrid' | 'sovereign';

interface SovereigntyStage {
  level: SovereigntyLevel;
  title: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  color: string;
  current?: boolean;
}

export default function SovereigntyEducationFlow({
  isOpen,
  onClose,
  onStartNWCSetup,
  currentStep = 'introduction',
}: SovereigntyEducationFlowProps) {
  const { userRole } = useAuth();
  const { isConnected: nwcConnected, primaryConnection } = useNWCWallet();

  const [activeStep, setActiveStep] = useState(currentStep);
  const [userSovereigntyLevel, setUserSovereigntyLevel] = useState<SovereigntyLevel>('custodial');

  // Determine user's current sovereignty level
  useEffect(() => {
    if (nwcConnected && primaryConnection) {
      setUserSovereigntyLevel('sovereign');
    } else {
      setUserSovereigntyLevel('custodial');
    }
  }, [nwcConnected, primaryConnection]);

  const sovereigntyStages: SovereigntyStage[] = [
    {
      level: 'custodial',
      title: 'Custodial Wallet',
      description: 'Third-party controls your funds and private keys',
      features: ['Easy to use', 'No technical knowledge required', 'Limited control', 'Trust required'],
      icon: <Users className="h-6 w-6" />,
      color: 'orange',
      current: userSovereigntyLevel === 'custodial',
    },
    {
      level: 'hybrid',
      title: 'Hybrid Approach',
      description: 'Mix of custodial and self-custodial solutions',
      features: ['Gradual learning', 'Reduced risk', 'Partial control', 'Educational value'],
      icon: <TrendingUp className="h-6 w-6" />,
      color: 'yellow',
      current: userSovereigntyLevel === 'hybrid',
    },
    {
      level: 'sovereign',
      title: 'Full Sovereignty',
      description: 'Complete control over your funds and private keys',
      features: ['Full control', 'Maximum privacy', 'No counterparty risk', 'True ownership'],
      icon: <Crown className="h-6 w-6" />,
      color: 'green',
      current: userSovereigntyLevel === 'sovereign',
    },
  ];

  const recommendedWallets = [
    {
      name: 'Zeus LN',
      description: 'Self-custodial Lightning wallet with full node capabilities',
      platform: 'Mobile (iOS/Android)',
      website: 'https://zeusln.com',
      features: ['Self-custodial', 'Full Lightning node', 'NWC support', 'Advanced features'],
      icon: <Zap className="h-8 w-8 text-yellow-500" />,
      difficulty: 'Intermediate',
      sovereignty: 'High',
    },
    {
      name: 'Alby Browser Extension',
      description: 'Lightning wallet browser extension with NWC support',
      platform: 'Desktop (Chrome/Firefox)',
      website: 'https://getalby.com',
      features: ['Browser integration', 'NWC support', 'Easy setup', 'Web payments'],
      icon: <Globe className="h-8 w-8 text-orange-500" />,
      difficulty: 'Beginner',
      sovereignty: 'High',
    },
  ];

  const renderIntroductionStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mb-6">
          <Crown className="h-10 w-10 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-4">
          Your Journey to Financial Sovereignty
        </h2>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto">
          Take control of your financial future with self-custodial Lightning wallets
        </p>
      </div>

      <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-xl p-8 border border-purple-500/20">
        <h3 className="text-2xl font-semibold text-white mb-4">
          What is Financial Sovereignty?
        </h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <Shield className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
              <div>
                <h4 className="text-lg font-medium text-white mb-1">Self-Custody</h4>
                <p className="text-gray-300">You control your private keys and funds directly</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Lock className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
              <div>
                <h4 className="text-lg font-medium text-white mb-1">Privacy</h4>
                <p className="text-gray-300">No third-party access to your transaction data</p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <Zap className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
              <div>
                <h4 className="text-lg font-medium text-white mb-1">Lightning Fast</h4>
                <p className="text-gray-300">Instant payments with minimal fees</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Globe className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
              <div>
                <h4 className="text-lg font-medium text-white mb-1">Global Access</h4>
                <p className="text-gray-300">Send and receive payments anywhere in the world</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {userRole === 'offspring' && (
        <div className="bg-blue-900/30 rounded-xl p-6 border border-blue-500/20">
          <div className="flex items-start space-x-3">
            <Info className="h-6 w-6 text-blue-400 mt-1 flex-shrink-0" />
            <div>
              <h4 className="text-lg font-medium text-blue-200 mb-2">For Young Adults</h4>
              <p className="text-blue-200">
                Your sovereignty journey includes spending limits and guardian approval for large payments
                as part of your financial education. This helps you learn responsible money management
                while building toward full independence.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={onClose}
          className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Maybe Later
        </button>
        <button
          onClick={() => setActiveStep('benefits')}
          className="flex items-center space-x-2 px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg text-white font-medium transition-all"
        >
          <span>Learn More</span>
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  const renderBenefitsStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-4">
          Why Choose Self-Custodial Wallets?
        </h2>
        <p className="text-gray-300">
          Understand the benefits of taking control of your financial future
        </p>
      </div>

      <div className="grid gap-6">
        <div className="bg-green-900/20 rounded-xl p-6 border border-green-500/20">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Shield className="h-6 w-6 text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">Security & Control</h3>
          </div>
          <div className="space-y-3 text-gray-300">
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <span>Your private keys never leave your device</span>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <span>No risk of exchange hacks or third-party failures</span>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <span>Complete control over your funds 24/7</span>
            </div>
          </div>
        </div>

        <div className="bg-blue-900/20 rounded-xl p-6 border border-blue-500/20">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Lock className="h-6 w-6 text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">Privacy & Freedom</h3>
          </div>
          <div className="space-y-3 text-gray-300">
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <span>No KYC requirements or identity verification</span>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <span>Private transactions without surveillance</span>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <span>Censorship-resistant payments</span>
            </div>
          </div>
        </div>

        <div className="bg-purple-900/20 rounded-xl p-6 border border-purple-500/20">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Zap className="h-6 w-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">Lightning Network Benefits</h3>
          </div>
          <div className="space-y-3 text-gray-300">
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
              <span>Instant payments with sub-second confirmation</span>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
              <span>Extremely low fees (often less than 1 sat)</span>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
              <span>Scalable for millions of transactions per second</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setActiveStep('introduction')}
          className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => setActiveStep('journey')}
          className="flex items-center space-x-2 px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg text-white font-medium transition-all"
        >
          <span>See Your Journey</span>
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  const renderJourneyStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-4">
          Your Sovereignty Journey
        </h2>
        <p className="text-gray-300">
          Progress through different levels of financial independence
        </p>
      </div>

      <div className="space-y-4">
        {sovereigntyStages.map((stage, index) => (
          <div
            key={stage.level}
            className={`rounded-xl p-6 border-2 transition-all ${stage.current
              ? `border-${stage.color}-500 bg-${stage.color}-900/20`
              : 'border-gray-700 bg-gray-800/30'
              }`}
          >
            <div className="flex items-start space-x-4">
              <div className={`p-3 rounded-lg ${stage.current
                ? `bg-${stage.color}-500/20 text-${stage.color}-400`
                : 'bg-gray-700/50 text-gray-400'
                }`}>
                {stage.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`text-xl font-semibold ${stage.current ? 'text-white' : 'text-gray-300'
                    }`}>
                    {stage.title}
                  </h3>
                  {stage.current && (
                    <span className={`px-3 py-1 rounded-full text-sm font-medium bg-${stage.color}-500/20 text-${stage.color}-300 border border-${stage.color}-500/20`}>
                      Current Level
                    </span>
                  )}
                </div>
                <p className={`mb-4 ${stage.current ? 'text-gray-200' : 'text-gray-400'
                  }`}>
                  {stage.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {stage.features.map((feature) => (
                    <span
                      key={feature}
                      className={`px-3 py-1 rounded-full text-sm ${stage.current
                        ? 'bg-gray-700/50 text-gray-200'
                        : 'bg-gray-800/50 text-gray-400'
                        }`}
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded-xl p-6 border border-green-500/20">
        <div className="flex items-center space-x-3 mb-4">
          <Crown className="h-6 w-6 text-green-400" />
          <h3 className="text-lg font-semibold text-white">
            {userSovereigntyLevel === 'sovereign' ? 'Congratulations!' : 'Your Next Step'}
          </h3>
        </div>
        <p className="text-green-200 mb-4">
          {userSovereigntyLevel === 'sovereign'
            ? 'You have achieved full financial sovereignty with your NWC wallet connection!'
            : 'Connect a self-custodial Lightning wallet to achieve full sovereignty and take complete control of your financial future.'
          }
        </p>
        {userSovereigntyLevel !== 'sovereign' && (
          <div className="text-sm text-green-300">
            Recommended: Start with Zeus LN (mobile) or Alby (desktop) for the best experience
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setActiveStep('benefits')}
          className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => setActiveStep('wallets')}
          className="flex items-center space-x-2 px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg text-white font-medium transition-all"
        >
          <span>Choose Wallet</span>
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  const renderWalletsStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-4">
          Recommended Self-Custodial Wallets
        </h2>
        <p className="text-gray-300">
          Choose a wallet that supports NWC (Nostr Wallet Connect) for seamless integration
        </p>
      </div>

      <div className="space-y-6">
        {recommendedWallets.map((wallet) => (
          <div
            key={wallet.name}
            className="bg-gray-800/30 rounded-xl p-6 border border-gray-700 hover:border-gray-600 transition-all"
          >
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-gray-700/50 rounded-lg">
                {wallet.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-semibold text-white">{wallet.name}</h3>
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-1 bg-green-900/30 text-green-300 rounded-full text-xs font-medium border border-green-500/20">
                      {wallet.sovereignty} Sovereignty
                    </span>
                    <span className="px-2 py-1 bg-blue-900/30 text-blue-300 rounded-full text-xs font-medium border border-blue-500/20">
                      {wallet.difficulty}
                    </span>
                  </div>
                </div>
                <p className="text-gray-300 mb-3">{wallet.description}</p>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-400">{wallet.platform}</span>
                  <a
                    href={wallet.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 text-sm"
                  >
                    <span>Visit Website</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="flex flex-wrap gap-2">
                  {wallet.features.map((feature) => (
                    <span
                      key={feature}
                      className="px-2 py-1 bg-gray-700/30 text-gray-300 rounded text-xs"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-blue-900 mb-2">
              What is NWC (Nostr Wallet Connect)?
            </h4>
            <p className="text-sm text-blue-800 mb-2">
              NWC is a protocol that allows you to connect your self-custodial Lightning wallet
              to applications like Satnam while maintaining full control of your funds.
            </p>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Your private keys never leave your wallet</li>
              <li>• You approve each transaction on your device</li>
              <li>• Seamless integration with Satnam features</li>
              <li>• Works with Zeus LN, Alby, and other NWC-compatible wallets</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setActiveStep('journey')}
          className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => setActiveStep('action')}
          className="flex items-center space-x-2 px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg text-white font-medium transition-all"
        >
          <span>Get Started</span>
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  const renderActionStep = () => (
    <div className="space-y-6 text-center">
      <div className="mx-auto w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mb-6">
        <Wallet className="h-10 w-10 text-white" />
      </div>
      <h2 className="text-3xl font-bold text-white mb-4">
        Ready to Achieve Sovereignty?
      </h2>
      <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-8">
        Take the final step toward financial independence by connecting your self-custodial Lightning wallet
      </p>

      <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded-xl p-8 border border-green-500/20 mb-8">
        <h3 className="text-xl font-semibold text-white mb-4">
          What happens next?
        </h3>
        <div className="space-y-3 text-left max-w-md mx-auto">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold">1</div>
            <span className="text-green-200">Choose and download a recommended wallet</span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold">2</div>
            <span className="text-green-200">Set up your wallet and generate NWC connection</span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold">3</div>
            <span className="text-green-200">Connect your wallet to Satnam using NWC</span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold">4</div>
            <span className="text-green-200">Enjoy full financial sovereignty!</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={onClose}
          className="px-6 py-3 text-gray-400 hover:text-white transition-colors"
        >
          I'll Do This Later
        </button>
        <button
          onClick={() => {
            onStartNWCSetup();
            onClose();
          }}
          className="flex items-center justify-center space-x-2 px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg text-white font-medium transition-all"
        >
          <Wallet className="h-5 w-5" />
          <span>Setup NWC Wallet Now</span>
        </button>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-white">
              Financial Sovereignty Education
            </h1>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <span className="sr-only">Close</span>
              ✕
            </button>
          </div>

          {activeStep === 'introduction' && renderIntroductionStep()}
          {activeStep === 'benefits' && renderBenefitsStep()}
          {activeStep === 'journey' && renderJourneyStep()}
          {activeStep === 'wallets' && renderWalletsStep()}
          {activeStep === 'action' && renderActionStep()}
        </div>
      </div>
    </div>
  );
}
