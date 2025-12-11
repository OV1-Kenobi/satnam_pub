/**
 * NFC Card Type Selector Component
 * Part of the Unified NFC Setup Flow
 * 
 * Allows users to select between Boltcard (NTAG424) and Tapsigner card types
 * before proceeding with device-specific setup flows.
 * 
 * Features:
 * - Two card option tiles with descriptions
 * - Visual icons and capability lists
 * - Selection state management
 * - Continue/Cancel buttons
 */

import { CheckCircle, CreditCard, Key, Zap } from "lucide-react";
import React from "react";

export type NFCCardType = "boltcard" | "tapsigner";

interface CardTypeOption {
  type: NFCCardType;
  name: string;
  tagline: string;
  description: string;
  icon: React.ReactNode;
  capabilities: string[];
  color: string;
  borderColor: string;
  bgGradient: string;
}

const CARD_OPTIONS: CardTypeOption[] = [
  {
    type: "boltcard",
    name: "Boltcard",
    tagline: "Lightning NFC Payments + MFA",
    description: "NTAG424-based card for tap-to-pay Lightning transactions and physical multi-factor authentication.",
    icon: <Zap className="w-8 h-8" />,
    capabilities: [
      "Tap-to-pay Lightning payments",
      "Physical MFA for account security",
      "LNbits wallet integration",
      "Spending limits & controls",
    ],
    color: "text-orange-500",
    borderColor: "border-orange-500",
    bgGradient: "from-orange-500/10 to-yellow-500/10",
  },
  {
    type: "tapsigner",
    name: "Tapsigner",
    tagline: "Bitcoin Cold Storage + Signing",
    description: "Coinkite Tapsigner for Bitcoin key storage, ECDSA signing, and Nostr event authentication.",
    icon: <Key className="w-8 h-8" />,
    capabilities: [
      "BIP32 HD key derivation",
      "ECDSA secp256k1 signing",
      "Nostr event signing",
      "Cold storage security",
    ],
    color: "text-blue-500",
    borderColor: "border-blue-500",
    bgGradient: "from-blue-500/10 to-cyan-500/10",
  },
];

interface NFCCardTypeSelectorProps {
  /** Currently selected card type */
  selectedType: NFCCardType | null;
  /** Callback when card type selection changes */
  onSelect: (type: NFCCardType) => void;
  /** Callback when user confirms selection and continues */
  onContinue: () => void;
  /** Callback when user cancels selection */
  onCancel: () => void;
  /** Whether the continue action is disabled */
  continueDisabled?: boolean;
  /** Show loading state on continue button */
  isLoading?: boolean;
}

/**
 * NFCCardTypeSelector Component
 * Displays card type options for user selection
 */
export const NFCCardTypeSelector: React.FC<NFCCardTypeSelectorProps> = ({
  selectedType,
  onSelect,
  onContinue,
  onCancel,
  continueDisabled = false,
  isLoading = false,
}) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex justify-center mb-3">
          <CreditCard className="w-12 h-12 text-purple-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          Select Your NFC Card Type
        </h2>
        <p className="text-purple-200">
          Choose the type of NFC card you want to set up for authentication and payments.
        </p>
      </div>

      {/* Card Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CARD_OPTIONS.map((option) => {
          const isSelected = selectedType === option.type;
          return (
            <button
              key={option.type}
              onClick={() => onSelect(option.type)}
              className={`
                relative p-5 rounded-xl border-2 text-left transition-all duration-200
                bg-gradient-to-br ${option.bgGradient}
                ${isSelected
                  ? `${option.borderColor} ring-2 ring-offset-2 ring-offset-gray-900 ${option.type === 'boltcard' ? 'ring-orange-400' : 'ring-blue-400'}`
                  : 'border-white/20 hover:border-white/40'
                }
              `}
            >
              {/* Selection indicator */}
              {isSelected && (
                <div className={`absolute top-3 right-3 ${option.color}`}>
                  <CheckCircle className="w-6 h-6" />
                </div>
              )}

              {/* Card content */}
              <div className="space-y-3">
                {/* Icon and name */}
                <div className="flex items-center gap-3">
                  <div className={option.color}>{option.icon}</div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{option.name}</h3>
                    <p className="text-sm text-purple-200">{option.tagline}</p>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-300">{option.description}</p>

                {/* Capabilities list */}
                <ul className="space-y-1">
                  {option.capabilities.map((cap, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-purple-100">
                      <span className={`w-1.5 h-1.5 rounded-full ${option.type === 'boltcard' ? 'bg-orange-400' : 'bg-blue-400'}`} />
                      {cap}
                    </li>
                  ))}
                </ul>
              </div>
            </button>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4 border-t border-white/10">
        <button
          onClick={onCancel}
          className="px-5 py-2.5 text-purple-200 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onContinue}
          disabled={!selectedType || continueDisabled || isLoading}
          className={`
            px-6 py-2.5 rounded-lg font-semibold transition-all duration-200
            ${selectedType && !continueDisabled && !isLoading
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
              Loading...
            </span>
          ) : (
            `Continue with ${selectedType === 'boltcard' ? 'Boltcard' : selectedType === 'tapsigner' ? 'Tapsigner' : 'Selected Card'}`
          )}
        </button>
      </div>
    </div>
  );
};

export default NFCCardTypeSelector;

