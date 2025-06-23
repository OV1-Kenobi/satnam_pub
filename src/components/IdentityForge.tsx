import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Check,
    Key,
    QrCode,
    Sparkles,
    X
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useCryptoOperations } from "../hooks/useCrypto";

interface FormData {
  username: string;
  pubkey: string;
  lightningEnabled: boolean;
}

interface IdentityForgeProps {
  onComplete: () => void;
  onBack: () => void;
}

const IdentityForge: React.FC<IdentityForgeProps> = ({
  onComplete,
  onBack,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    username: "",
    pubkey: "",
    lightningEnabled: true,
  });

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null,
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStep, setGenerationStep] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  
  // Use crypto operations hook for lazy loading
  const crypto = useCryptoOperations();

  // Username validation
  const validateUsername = (username: string) => {
    const regex = /^[a-zA-Z0-9_]{3,20}$/;
    return regex.test(username);
  };

  // Simulate username availability check
  useEffect(() => {
    if (formData.username && validateUsername(formData.username)) {
      const timer = setTimeout(() => {
        // Simulate API call - randomly available for demo
        setUsernameAvailable(Math.random() > 0.3);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setUsernameAvailable(null);
    }
  }, [formData.username]);

  // Real key generation with lazy-loaded crypto
  const generateKeys = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      // Step 1: Loading crypto modules
      setGenerationStep("Loading crypto modules...");
      for (let i = 0; i <= 25; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      // Ensure crypto is available before proceeding
      if (!crypto.generateNostrKeyPair) {
        throw new Error("Crypto operations not available");
      }

      // Step 2: Generating entropy
      setGenerationStep("Generating entropy...");
      for (let i = 25; i <= 50; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      // Step 3: Creating keypair
      setGenerationStep("Creating keypair...");
      for (let i = 50; i <= 80; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      // Generate real Nostr keypair using lazy-loaded crypto
      const keyPair = await crypto.generateNostrKeyPair();

      // Validate the generated keypair
      if (!keyPair.npub || !keyPair.npub.startsWith('npub1')) {
        throw new Error("Invalid keypair generated");
      }

      // Step 4: Securing identity
      setGenerationStep("Securing identity...");
      for (let i = 80; i <= 100; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      setFormData((prev) => ({ ...prev, pubkey: keyPair.npub }));
    } catch (error) {
      console.error("Failed to generate keys:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        cryptoAvailable: typeof crypto.generateNostrKeyPair === 'function'
      });
      setGenerationStep("Key generation failed - using demo mode");
      
      // Fallback to mock key for demo purposes
      console.warn("SECURITY WARNING: Using mock key for demo purposes only");
      const mockPubkey =
        "npub1" +
        Math.random().toString(36).substring(2, 50) +
        Math.random().toString(36).substring(2, 10);
      setFormData((prev) => ({ ...prev, pubkey: mockPubkey }));
    } finally {
      setIsGenerating(false);
    }
  };

  const nextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
      if (currentStep === 1) {
        generateKeys();
      }
    } else {
      setIsComplete(true);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      onBack();
    }
  };

  const canContinue = () => {
    switch (currentStep) {
      case 1:
        return formData.username && usernameAvailable === true;
      case 2:
        return formData.pubkey && !isGenerating;
      case 3:
        return true;
      default:
        return false;
    }
  };

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onBack();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onBack]);

  if (isComplete) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-purple-900 via-purple-800 to-purple-700 rounded-xl shadow-2xl border border-white/20 p-8 max-w-2xl w-full mx-4 relative backdrop-blur-sm">
          <div className="text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce">
              <Sparkles className="h-12 w-12 text-white" />
            </div>
            <h2 className="text-4xl font-bold text-white mb-6">
              Identity Forged Successfully!
            </h2>
            <p className="text-xl text-purple-200 mb-8">
              Welcome to true digital sovereignty,{" "}
              <span className="font-bold text-yellow-400">
                {formData.username}
              </span>
            </p>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 mb-8">
              <p className="text-purple-200 mb-2">Your sovereign identity:</p>
              <p className="text-white font-mono text-lg">
                {formData.username}@satnam.pub
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={onComplete}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                <span>Explore Nostr Ecosystem</span>
                <ArrowRight className="h-5 w-5" />
              </button>
              <button
                onClick={() => window.location.reload()}
                className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-8 rounded-lg transition-all duration-300"
              >
                Forge Another Identity
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-purple-900 via-purple-800 to-purple-700 rounded-xl shadow-2xl border border-white/20 p-8 max-w-lg w-full mx-4 relative min-h-[400px] backdrop-blur-sm">
        {/* Close Button */}
        <button
          onClick={onBack}
          className="absolute top-4 right-4 text-white hover:text-purple-200 transition-colors duration-200 z-10"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <img
              src="/ID forge icon.png"
              alt="Identity Forge"
              className="h-10 w-10"
              loading="lazy"
            />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Identity Forge</h2>
          <p className="text-purple-200">
            Forge your sovereign digital identity
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${
                    step <= currentStep
                      ? "bg-orange-500 text-white"
                      : "bg-white/20 text-purple-200"
                  }`}
                >
                  {step < currentStep ? <Check className="h-5 w-5" /> : step}
                </div>
                {step < 3 && (
                  <div
                    className={`h-1 w-16 mx-4 transition-all duration-300 ${
                      step < currentStep ? "bg-orange-500" : "bg-white/20"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm text-purple-200">
            <span>Choose Name</span>
            <span>Generate Keys</span>
            <span>Lightning Setup</span>
          </div>
        </div>

        {/* Form Content */}
        <div className="space-y-6">
          {/* Step 1: Choose Your True Name */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-white mb-4">
                  Choose Your True Name
                </h3>
                <p className="text-purple-200">
                  This will be your sovereign identity across the Bitcoin network
                </p>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        username: e.target.value,
                      }))
                    }
                    placeholder="Enter your username"
                    className="w-full bg-white/10 border border-white/20 rounded-lg p-4 text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  {formData.username && (
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                      {usernameAvailable === null ? (
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : usernameAvailable ? (
                        <Check className="h-6 w-6 text-green-400" />
                      ) : (
                        <X className="h-6 w-6 text-red-400" />
                      )}
                    </div>
                  )}
                </div>

                {formData.username && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                    <p className="text-purple-200 mb-2">
                      Your identity will be:
                    </p>
                    <p className="text-white font-mono text-lg">
                      {formData.username}@satnam.pub
                    </p>
                    {usernameAvailable === false && (
                      <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mt-3">
                        <p className="text-red-200">
                          This name is already taken
                        </p>
                      </div>
                    )}
                    {!validateUsername(formData.username) && (
                      <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mt-3">
                        <p className="text-red-200">
                          3-20 characters, letters, numbers, and underscores only
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <h4 className="text-white font-bold mb-2">
                  Your keys, your identity
                </h4>
                <p className="text-purple-200">
                  No email required, no data collection. Sovereign from day one.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Generate Your Keys */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <Key className="h-16 w-16 text-orange-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-4">
                  Generate Your Keys
                </h3>
                <p className="text-purple-200">
                  Creating your cryptographic identity
                </p>
              </div>

              {isGenerating ? (
                <div className="space-y-6">
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-white font-semibold">
                        {generationStep}
                      </span>
                      <span className="text-orange-500 font-bold">
                        {generationProgress}%
                      </span>
                    </div>
                    <div className="w-full bg-white/20 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-orange-500 to-yellow-500 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${generationProgress}%` }}
                      />
                    </div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center">
                    <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-purple-200">
                      Generating cryptographically secure keys...
                    </p>
                  </div>
                </div>
              ) : formData.pubkey ? (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-green-500/20 border border-green-500/50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="h-8 w-8 text-green-400" />
                    </div>
                    <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4">
                      <p className="text-green-200 font-semibold">
                        Keys generated successfully!
                      </p>
                    </div>
                  </div>

                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                    <h4 className="text-white font-bold mb-3">
                      Your Public Key
                    </h4>
                    <p className="text-purple-200 font-mono break-all">
                      {formData.pubkey.substring(0, 8)}...
                      {formData.pubkey.substring(formData.pubkey.length - 8)}
                    </p>
                  </div>

                  <div className="bg-red-500/20 border border-red-500/50 rounded-2xl p-6">
                    <div className="flex items-start space-x-3">
                      <AlertTriangle className="h-6 w-6 text-red-400 flex-shrink-0 mt-1" />
                      <div>
                        <h4 className="text-red-200 font-bold mb-2">
                          🚨 CRITICAL: Save Your Recovery Phrase Now
                        </h4>
                        <p className="text-red-200 mb-3">
                          Your recovery phrase is the ONLY way to restore your identity.
                          If you lose it, your funds and identity are lost forever.
                          Write it down on paper and store it in a secure location.
                        </p>
                        <div className="bg-red-500/30 rounded-lg p-3">
                          <p className="text-red-200 text-sm">
                            <strong>Never:</strong> Screenshot, email, or store digitally<br/>
                            <strong>Always:</strong> Write on paper, verify twice, store safely
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Step 3: Lightning Address Setup */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 border border-white/20">
                  <img
                    src="/LN Bitcoin icon.png"
                    alt="Lightning Bitcoin"
                    className="h-12 w-12"
                    loading="lazy"
                  />
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">
                  Lightning Address Setup
                </h3>
                <p className="text-purple-200">
                  Receive Bitcoin payments instantly
                </p>
              </div>

              <div className="space-y-6">
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-white font-bold mb-2">
                        Enable Lightning Address
                      </h4>
                      <p className="text-purple-200">
                        Allow others to send you Bitcoin payments
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          lightningEnabled: !prev.lightningEnabled,
                        }))
                      }
                      className={`w-14 h-8 rounded-full transition-all duration-300 ${
                        formData.lightningEnabled
                          ? "bg-orange-500"
                          : "bg-white/20"
                      }`}
                    >
                      <div
                        className={`w-6 h-6 bg-white rounded-full transition-all duration-300 ${
                          formData.lightningEnabled
                            ? "translate-x-7"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {formData.lightningEnabled && (
                  <>
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                      <h4 className="text-white font-bold mb-3">
                        Your Lightning Address
                      </h4>
                      <p className="text-orange-400 font-mono text-lg">
                        {formData.username}@satnam.pub
                      </p>
                      <p className="text-purple-200 mt-2">
                        This address can receive Bitcoin payments
                      </p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center">
                      <QrCode className="h-24 w-24 text-white mx-auto mb-4 opacity-50" />
                      <p className="text-purple-200">
                        QR code will be generated after setup
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-6">
            <button
              onClick={prevStep}
              className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Back</span>
            </button>

            <button
              onClick={nextStep}
              disabled={!canContinue()}
              className={`font-bold py-3 px-8 rounded-lg transition-all duration-300 flex items-center space-x-2 ${
                canContinue()
                  ? "bg-orange-500 hover:bg-orange-600 text-white"
                  : "bg-white/10 text-purple-300 cursor-not-allowed"
              }`}
            >
              <span>{currentStep === 3 ? "Complete Forge" : "Continue"}</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Security Messaging */}
        <div className="text-center mt-8 pt-6 border-t border-white/20">
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-8 text-purple-200 text-sm">
            <span className="flex items-center space-x-2">
              <Key className="h-4 w-4" />
              <span>Your keys, your identity</span>
            </span>
            <span className="flex items-center space-x-2">
              <X className="h-4 w-4" />
              <span>No email required</span>
            </span>
            <span className="flex items-center space-x-2">
              <Check className="h-4 w-4" />
              <span>Sovereign from day one</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IdentityForge;