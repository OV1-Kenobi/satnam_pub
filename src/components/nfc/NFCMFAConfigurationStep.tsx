/**
 * NFC MFA Configuration Step Component
 * Part of the Unified NFC Setup Flow
 * 
 * Allows users to configure which operations require NFC Multi-Factor Authentication.
 * 
 * MFA Options:
 * 1. Wallet Unlock - Require NFC tap to unlock wallet/vault
 * 2. Nostr Signing - Require NFC tap for signing Nostr events/messages
 * 3. Guardian Approval - Require NFC tap for guardian/steward approval operations
 * 4. Nostrich Sign-in - Require NFC tap for authentication
 */

import { Lock, MessageSquare, Shield, UserCheck } from "lucide-react";
import React, { useState } from "react";

/** MFA configuration options */
export interface MFAConfiguration {
  walletUnlock: boolean;
  nostrSigning: boolean;
  guardianApproval: boolean;
  nostrichSignin: boolean;
}

interface MFAOption {
  key: keyof MFAConfiguration;
  label: string;
  description: string;
  icon: React.ReactNode;
  recommended?: boolean;
}

const MFA_OPTIONS: MFAOption[] = [
  {
    key: "walletUnlock",
    label: "Wallet Unlock",
    description: "Require NFC tap to unlock your wallet or session vault. Adds physical security to accessing funds.",
    icon: <Lock className="w-5 h-5" />,
    recommended: true,
  },
  {
    key: "nostrSigning",
    label: "Nostr Event Signing",
    description: "Require NFC tap when signing Nostr events and encrypted messages. Prevents unauthorized posting.",
    icon: <MessageSquare className="w-5 h-5" />,
    recommended: false,
  },
  {
    key: "guardianApproval",
    label: "Guardian/Steward Approval",
    description: "Require NFC tap for guardian or steward approval operations in family federations.",
    icon: <UserCheck className="w-5 h-5" />,
    recommended: true,
  },
  {
    key: "nostrichSignin",
    label: "Nostrich Sign-in",
    description: "Require NFC tap when signing in to your account. Strongest authentication security.",
    icon: <Shield className="w-5 h-5" />,
    recommended: false,
  },
];

interface NFCMFAConfigurationStepProps {
  /** Initial configuration values */
  initialConfig?: MFAConfiguration;
  /** Callback when configuration is saved */
  onSave: (config: MFAConfiguration) => void;
  /** Callback when user skips configuration */
  onSkip: () => void;
  /** Whether save is in progress */
  isLoading?: boolean;
}

/**
 * NFCMFAConfigurationStep Component
 * Configure which operations require NFC MFA
 */
export const NFCMFAConfigurationStep: React.FC<NFCMFAConfigurationStepProps> = ({
  initialConfig,
  onSave,
  onSkip,
  isLoading = false,
}) => {
  const [config, setConfig] = useState<MFAConfiguration>(initialConfig || {
    walletUnlock: false,
    nostrSigning: false,
    guardianApproval: false,
    nostrichSignin: false,
  });

  // Toggle a specific MFA option
  const toggleOption = (key: keyof MFAConfiguration) => {
    setConfig(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Check if any option is enabled
  const hasEnabledOptions = Object.values(config).some(v => v);

  // Handle save
  const handleSave = () => {
    onSave(config);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex justify-center mb-3">
          <Shield className="w-12 h-12 text-purple-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          Configure NFC MFA
        </h2>
        <p className="text-purple-200">
          Choose which operations should require physical NFC card authentication for extra security.
        </p>
      </div>

      {/* MFA Options */}
      <div className="space-y-3">
        {MFA_OPTIONS.map((option) => {
          const isEnabled = config[option.key];
          return (
            <button
              key={option.key}
              onClick={() => toggleOption(option.key)}
              className={`
                w-full p-4 rounded-xl border text-left transition-all duration-200
                ${isEnabled
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-white/20 bg-white/5 hover:border-white/40'
                }
              `}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={`
                  p-2 rounded-lg
                  ${isEnabled ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-400'}
                `}>
                  {option.icon}
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{option.label}</h3>
                    {option.recommended && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mt-1">{option.description}</p>
                </div>

                {/* Toggle */}
                <div className={`
                  w-12 h-7 rounded-full p-1 transition-colors
                  ${isEnabled ? 'bg-purple-500' : 'bg-gray-600'}
                `}>
                  <div className={`
                    w-5 h-5 rounded-full bg-white shadow transition-transform
                    ${isEnabled ? 'translate-x-5' : 'translate-x-0'}
                  `} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Info Note */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <p className="text-sm text-blue-200">
          <strong>Note:</strong> You can change these settings later in your Privacy & Security preferences.
          MFA adds an extra layer of security but requires your NFC card for each protected operation.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4 border-t border-white/10">
        <button
          onClick={onSkip}
          className="px-5 py-2.5 text-purple-200 hover:text-white transition-colors"
        >
          Skip for Now
        </button>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className={`
            px-6 py-2.5 rounded-lg font-semibold transition-all duration-200
            ${!isLoading
              ? 'bg-purple-600 hover:bg-purple-700 text-white'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </span>
          ) : hasEnabledOptions ? (
            "Save MFA Settings"
          ) : (
            "Continue Without MFA"
          )}
        </button>
      </div>
    </div>
  );
};

export default NFCMFAConfigurationStep;

