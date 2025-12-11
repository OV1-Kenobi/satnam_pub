/**
 * Unified NFC Setup Flow Component
 * Main orchestrator for NFC card setup (Boltcard and Tapsigner)
 * 
 * Steps:
 * 1. Card Type Selection (NFCCardTypeSelector)
 * 2. Device-Specific Setup (embedded component)
 * 3. MFA Configuration (NFCMFAConfigurationStep)
 * 4. Completion
 * 
 * Features:
 * - Step navigation with progress indicator
 * - Card type routing to appropriate setup flows
 * - Shared MFA configuration step
 * - Skip/Cancel functionality
 * - Feature flag integration
 */

import { ArrowLeft, CheckCircle, X } from "lucide-react";
import React, { useCallback, useState } from "react";
import { getEnvVar } from "../../config/env.client";
import { NFCCardType, NFCCardTypeSelector } from "./NFCCardTypeSelector";
import { NFCMFAConfigurationStep, type MFAConfiguration } from "./NFCMFAConfigurationStep";

/** Result of completed NFC setup */
export interface NFCSetupResult {
  cardType: NFCCardType;
  cardId: string;
  mfaConfiguration: MFAConfiguration;
  success: boolean;
}

/** Props for UnifiedNFCSetupFlow */
export interface UnifiedNFCSetupFlowProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when setup completes successfully */
  onComplete?: (result: NFCSetupResult) => void;
  /** Pre-select a card type (skips step 1 if provided with skipCardSelection) */
  defaultCardType?: NFCCardType;
  /** Skip the card selection step (requires defaultCardType) */
  skipCardSelection?: boolean;
}

type SetupStep = "card-selection" | "device-setup" | "mfa-config" | "complete";

const STEP_LABELS: Record<SetupStep, string> = {
  "card-selection": "Select Card Type",
  "device-setup": "Card Setup",
  "mfa-config": "MFA Settings",
  "complete": "Complete",
};

const STEP_ORDER: SetupStep[] = ["card-selection", "device-setup", "mfa-config", "complete"];

/**
 * UnifiedNFCSetupFlow Component
 * Orchestrates the complete NFC card setup flow
 */
export const UnifiedNFCSetupFlow: React.FC<UnifiedNFCSetupFlowProps> = ({
  isOpen,
  onClose,
  onComplete,
  defaultCardType,
  skipCardSelection = false,
}) => {
  // Feature flags
  const NFC_MFA_ENABLED = getEnvVar("VITE_ENABLE_NFC_MFA") === "true";
  const TAPSIGNER_ENABLED = getEnvVar("VITE_TAPSIGNER_ENABLED") === "true";

  // State
  const [currentStep, setCurrentStep] = useState<SetupStep>(
    skipCardSelection && defaultCardType ? "device-setup" : "card-selection"
  );
  const [selectedCardType, setSelectedCardType] = useState<NFCCardType | null>(
    defaultCardType || null
  );
  const [cardId, setCardId] = useState<string | null>(null);
  const [mfaConfig, setMfaConfig] = useState<MFAConfiguration>({
    walletUnlock: false,
    nostrSigning: false,
    guardianApproval: false,
    nostrichSignin: false,
  });
  const [isProcessing, setIsProcessing] = useState(false);

  // Get current step index for progress
  const currentStepIndex = STEP_ORDER.indexOf(currentStep);

  // Navigate to next step
  const goToNextStep = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      setCurrentStep(STEP_ORDER[nextIndex]);
    }
  }, [currentStepIndex]);

  // Navigate to previous step
  const goToPreviousStep = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      // If we're going back from device-setup and skipCardSelection is true, close instead
      if (currentStep === "device-setup" && skipCardSelection) {
        onClose();
        return;
      }
      setCurrentStep(STEP_ORDER[prevIndex]);
    }
  }, [currentStepIndex, currentStep, skipCardSelection, onClose]);

  // Handle card type selection
  const handleCardTypeSelect = useCallback((type: NFCCardType) => {
    setSelectedCardType(type);
  }, []);

  // Handle card type confirmation
  const handleCardTypeContinue = useCallback(() => {
    if (selectedCardType) {
      goToNextStep();
    }
  }, [selectedCardType, goToNextStep]);

  // Handle device setup completion
  const handleDeviceSetupComplete = useCallback((newCardId: string) => {
    setCardId(newCardId);
    // If MFA is enabled, go to MFA config; otherwise, complete
    if (NFC_MFA_ENABLED) {
      goToNextStep();
    } else {
      setCurrentStep("complete");
    }
  }, [NFC_MFA_ENABLED, goToNextStep]);

  // Handle MFA configuration save
  const handleMFAConfigSave = useCallback((config: MFAConfiguration) => {
    setMfaConfig(config);
    setCurrentStep("complete");
  }, []);

  // Handle skip MFA configuration
  const handleMFAConfigSkip = useCallback(() => {
    setCurrentStep("complete");
  }, []);

  // Handle completion
  const handleComplete = useCallback(() => {
    if (selectedCardType && cardId) {
      onComplete?.({
        cardType: selectedCardType,
        cardId,
        mfaConfiguration: mfaConfig,
        success: true,
      });
    }
    onClose();
  }, [selectedCardType, cardId, mfaConfig, onComplete, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-gray-900 to-purple-900 rounded-2xl shadow-2xl border border-purple-500/30">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-purple-900 to-gray-900 px-6 py-4 border-b border-purple-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {currentStep !== "card-selection" && currentStep !== "complete" && (
                <button
                  onClick={goToPreviousStep}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  title="Go back"
                >
                  <ArrowLeft className="w-5 h-5 text-purple-200" />
                </button>
              )}
              <h1 className="text-xl font-bold text-white">
                NFC Card Setup
              </h1>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5 text-purple-200" />
            </button>
          </div>

          {/* Progress Steps */}
          <div className="mt-4 flex items-center gap-2">
            {STEP_ORDER.filter(step => {
              // Filter out card-selection if skipped
              if (step === "card-selection" && skipCardSelection) return false;
              // Filter out mfa-config if MFA not enabled
              if (step === "mfa-config" && !NFC_MFA_ENABLED) return false;
              return true;
            }).map((step, idx, arr) => {
              const stepIndex = STEP_ORDER.indexOf(step);
              const isActive = currentStep === step;
              const isCompleted = currentStepIndex > stepIndex;

              return (
                <React.Fragment key={step}>
                  <div className="flex items-center gap-2">
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
                      ${isCompleted ? 'bg-green-500 text-white' : isActive ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-400'}
                    `}>
                      {isCompleted ? <CheckCircle className="w-5 h-5" /> : idx + 1}
                    </div>
                    <span className={`text-sm hidden sm:block ${isActive ? 'text-white font-medium' : 'text-gray-400'}`}>
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                  {idx < arr.length - 1 && (
                    <div className={`flex-1 h-0.5 ${isCompleted ? 'bg-green-500' : 'bg-gray-700'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Card Type Selection */}
          {currentStep === "card-selection" && (
            <NFCCardTypeSelector
              selectedType={selectedCardType}
              onSelect={handleCardTypeSelect}
              onContinue={handleCardTypeContinue}
              onCancel={onClose}
              isLoading={isProcessing}
            />
          )}

          {/* Step 2: Device-Specific Setup */}
          {currentStep === "device-setup" && selectedCardType && (
            <DeviceSetupStep
              cardType={selectedCardType}
              onComplete={handleDeviceSetupComplete}
              onCancel={goToPreviousStep}
              tapsignerEnabled={TAPSIGNER_ENABLED}
            />
          )}

          {/* Step 3: MFA Configuration */}
          {currentStep === "mfa-config" && (
            <NFCMFAConfigurationStep
              initialConfig={mfaConfig}
              onSave={handleMFAConfigSave}
              onSkip={handleMFAConfigSkip}
              isLoading={isProcessing}
            />
          )}

          {/* Step 4: Completion */}
          {currentStep === "complete" && (
            <CompletionStep
              cardType={selectedCardType}
              cardId={cardId}
              mfaConfig={mfaConfig}
              onFinish={handleComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Device Setup Step - Routes to card-specific setup components
 */
interface DeviceSetupStepProps {
  cardType: NFCCardType;
  onComplete: (cardId: string) => void;
  onCancel: () => void;
  tapsignerEnabled: boolean;
}

const DeviceSetupStep: React.FC<DeviceSetupStepProps> = ({
  cardType,
  onComplete,
  onCancel,
  tapsignerEnabled,
}) => {
  // Lazy load the appropriate setup component
  const [SetupComponent, setSetupComponent] = useState<React.ComponentType<any> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  React.useEffect(() => {
    const loadComponent = async () => {
      try {
        if (cardType === "boltcard") {
          // Load NFCProvisioningGuide for Boltcard
          const module = await import("../NFCProvisioningGuide");
          setSetupComponent(() => module.default);
        } else if (cardType === "tapsigner" && tapsignerEnabled) {
          // Load TapsignerSetupFlow for Tapsigner
          const module = await import("../TapsignerSetupFlow");
          setSetupComponent(() => module.TapsignerSetupFlow);
        } else {
          setLoadError("Tapsigner support is not enabled");
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load setup component");
      }
    };
    loadComponent();
  }, [cardType, tapsignerEnabled]);

  if (loadError) {
    return (
      <div className="text-center py-8">
        <p className="text-red-400 mb-4">{loadError}</p>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!SetupComponent) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4" />
          <p className="text-purple-200">Loading {cardType === "boltcard" ? "Boltcard" : "Tapsigner"} setup...</p>
        </div>
      </div>
    );
  }

  // Render the appropriate setup component with callbacks
  if (cardType === "boltcard") {
    return (
      <SetupComponent
        onBack={onCancel}
        onComplete={(cardId: string) => onComplete(cardId)}
      />
    );
  }

  return (
    <SetupComponent
      onComplete={(cardId: string) => onComplete(cardId)}
      onCancel={onCancel}
      onError={(error: string) => setLoadError(error)}
    />
  );
};

/**
 * Completion Step - Shows success message and summary
 */
interface CompletionStepProps {
  cardType: NFCCardType | null;
  cardId: string | null;
  mfaConfig: MFAConfiguration;
  onFinish: () => void;
}

const CompletionStep: React.FC<CompletionStepProps> = ({
  cardType,
  cardId,
  mfaConfig,
  onFinish,
}) => {
  const enabledMFAOptions = Object.entries(mfaConfig)
    .filter(([_, enabled]) => enabled)
    .map(([key]) => {
      switch (key) {
        case "walletUnlock": return "Wallet Unlock";
        case "nostrSigning": return "Nostr Signing";
        case "guardianApproval": return "Guardian Approval";
        case "nostrichSignin": return "Nostrich Sign-in";
        default: return key;
      }
    });

  return (
    <div className="text-center py-8 space-y-6">
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle className="w-12 h-12 text-green-500" />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Setup Complete!</h2>
        <p className="text-purple-200">
          Your {cardType === "boltcard" ? "Boltcard" : "Tapsigner"} has been successfully configured.
        </p>
      </div>

      {cardId && (
        <div className="bg-white/5 rounded-lg p-4 text-left">
          <p className="text-sm text-gray-400 mb-1">Card ID</p>
          <p className="text-white font-mono text-sm truncate">{cardId}</p>
        </div>
      )}

      {enabledMFAOptions.length > 0 && (
        <div className="bg-white/5 rounded-lg p-4 text-left">
          <p className="text-sm text-gray-400 mb-2">MFA Enabled For:</p>
          <ul className="space-y-1">
            {enabledMFAOptions.map((option) => (
              <li key={option} className="flex items-center gap-2 text-purple-200">
                <CheckCircle className="w-4 h-4 text-green-400" />
                {option}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onFinish}
        className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
      >
        Done
      </button>
    </div>
  );
};

export default UnifiedNFCSetupFlow;

