import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Check,
    Copy,
    Download,
    Eye,
    EyeOff,
    Key,
    Lock,
    Shield,
    Sparkles,
    X
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { ApiClient } from "../../utils/api-client";
import { useCryptoOperations } from "../hooks/useCrypto";
import { IdentityRegistrationResult } from "../types/auth";
import { SessionInfo } from "../utils/secureSession";
import { PostAuthInvitationModal } from "./PostAuthInvitationModal";

interface FormData {
  username: string;
  password: string;
  confirmPassword: string;
  pubkey: string;
  lightningEnabled: boolean;
  recoveryPhrase: string;
  hasSecuredRecoveryPhrase: boolean;
  agreedToTerms: boolean;
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
    password: "",
    confirmPassword: "",
    pubkey: "",
    lightningEnabled: true,
    recoveryPhrase: "",
    hasSecuredRecoveryPhrase: false,
    agreedToTerms: false,
  });

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStep, setGenerationStep] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registrationResult, setRegistrationResult] = useState<IdentityRegistrationResult | null>(null);
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  
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

  // Generate recovery phrase and keys
  const generateKeysAndPhrase = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      // Step 1: Loading crypto modules
      setGenerationStep("Loading crypto modules...");
      console.log("Starting key generation process...");
      
      for (let i = 0; i <= 20; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Step 2: Generating recovery phrase
      setGenerationStep("Generating recovery phrase...");
      console.log("About to generate recovery phrase...");
      
      for (let i = 20; i <= 40; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      console.log("Calling crypto.generateRecoveryPhrase()...");
      console.log("Crypto state:", {
        isLoaded: crypto.isLoaded,
        isLoading: crypto.isLoading,
        error: crypto.error
      });
      
      const recoveryPhrase = await Promise.race([
        crypto.generateRecoveryPhrase(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Recovery phrase timeout after 15 seconds")), 15000)
        )
      ]) as string;
      console.log("Recovery phrase generated successfully:", recoveryPhrase ? "✓" : "✗");

      // Step 3: Generating entropy
      setGenerationStep("Generating entropy...");
      for (let i = 40; i <= 60; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Step 4: Creating keypair from recovery phrase
      setGenerationStep("Creating keypair...");
      console.log("About to generate keypair...");
      
      for (let i = 60; i <= 80; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      console.log("Calling crypto.generateNostrKeyPair()...");
      const keyPair = await Promise.race([
        crypto.generateNostrKeyPair(recoveryPhrase),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Keypair generation timeout after 15 seconds")), 15000)
        )
      ]) as { npub: string; nsec: string };
      console.log("Keypair generated successfully:", keyPair ? "✓" : "✗");

      // Validate the generated keypair
      if (!keyPair.npub || !keyPair.npub.startsWith('npub1')) {
        throw new Error("Invalid keypair generated");
      }

      // Step 5: Securing identity
      setGenerationStep("Securing identity...");
      for (let i = 80; i <= 100; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      console.log("Key generation completed successfully");
      setFormData((prev) => ({ 
        ...prev, 
        pubkey: keyPair.npub,
        recoveryPhrase: recoveryPhrase
      }));
    } catch (error) {
      console.error("Failed to generate keys:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        cryptoIsLoaded: crypto.isLoaded,
        cryptoIsLoading: crypto.isLoading,
        cryptoError: crypto.error
      });
      setGenerationStep("Key generation failed - please try again");
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  // Register identity with the backend
  const registerIdentity = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStep("Registering identity...");

    try {
      for (let i = 0; i <= 30; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      const apiClient = new ApiClient();
      const result = await apiClient.storeUserData({
        username: formData.username,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        recoveryPhrase: formData.recoveryPhrase,
        nip05: `${formData.username}@satnam.pub`,
        lightningAddress: formData.lightningEnabled ? `${formData.username}@satnam.pub` : undefined,
        generateInviteToken: true,
      });

      for (let i = 30; i <= 80; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      if (!result.success) {
        throw new Error(result.error || 'Registration failed');
      }

      setGenerationStep("Identity secured successfully!");
      for (let i = 80; i <= 100; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 15));
      }

      setRegistrationResult(result);
      
      // Create session info for PostAuth modal
      setSessionInfo({
        isAuthenticated: true,
        user: {
          id: result.profile.id,
          username: result.profile.username,
          npub: result.npub,
          nip05: result.profile.nip05,
          federationRole: 'member',
          authMethod: 'password',
        },
        sessionToken: 'temp-session-token', // This would be set by the backend
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      return result;
    } catch (error) {
      console.error("Registration failed:", error);
      setGenerationStep("Registration failed - please try again");
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  const nextStep = async () => {
    if (currentStep < 5) {
      if (currentStep === 2) {
        // Generate keys and recovery phrase when moving to step 3
        try {
          await generateKeysAndPhrase();
          setCurrentStep(currentStep + 1);
        } catch (error) {
          // Error is already handled in generateKeysAndPhrase
          console.error("Failed to generate keys:", error);
        }
      } else if (currentStep === 4) {
        // Register identity when moving to step 5
        try {
          await registerIdentity();
          setCurrentStep(currentStep + 1);
        } catch (error) {
          // Error is already handled in registerIdentity
          console.error("Failed to register identity:", error);
        }
      } else {
        setCurrentStep(currentStep + 1);
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
        return formData.password && 
               formData.confirmPassword && 
               formData.password === formData.confirmPassword &&
               formData.password.length >= 8;
      case 3:
        return formData.pubkey && formData.recoveryPhrase && !isGenerating;
      case 4:
        return formData.hasSecuredRecoveryPhrase && formData.agreedToTerms;
      case 5:
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
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}
      >
        <div className="bg-gradient-to-br from-purple-900 via-purple-800 to-purple-700 rounded-xl shadow-2xl border border-white/20 p-8 max-w-2xl w-full mx-4 relative">
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
                onClick={() => setShowInvitationModal(true)}
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-8 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                <span>🎁 Invite a Peer</span>
                <ArrowRight className="h-5 w-5" />
              </button>
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
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div className="bg-gradient-to-br from-purple-900 via-purple-800 to-purple-700 rounded-xl shadow-2xl border border-white/20 p-8 max-w-lg w-full mx-4 relative min-h-[400px]">
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
            {[1, 2, 3, 4, 5].map((step) => (
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
                {step < 5 && (
                  <div
                    className={`h-1 w-8 mx-2 transition-all duration-300 ${
                      step < currentStep ? "bg-orange-500" : "bg-white/20"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-purple-200">
            <span>Name</span>
            <span>Password</span>
            <span>Keys</span>
            <span>Security</span>
            <span>Complete</span>
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

              {/* Lightning Address Option */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-bold mb-2">
                      Enable Lightning Address
                    </h4>
                    <p className="text-purple-200 text-sm">
                      Allow others to send you Bitcoin payments at {formData.username}@satnam.pub
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
                {formData.lightningEnabled && (
                  <div className="mt-4 p-3 bg-orange-500/20 border border-orange-500/30 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <div className="h-8 w-8 bg-orange-500 rounded-full flex items-center justify-center">
                        ⚡
                      </div>
                      <div>
                        <p className="text-orange-200 font-mono text-sm">
                          {formData.username}@satnam.pub
                        </p>
                        <p className="text-orange-300 text-xs">
                          Ready for Bitcoin payments
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Create Password */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <Lock className="h-16 w-16 text-orange-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-4">
                  Create Your Password
                </h3>
                <p className="text-purple-200">
                  This password will encrypt your private keys securely
                </p>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        password: e.target.value,
                      }))
                    }
                    placeholder="Create a strong password"
                    className="w-full bg-white/10 border border-white/20 rounded-lg p-4 pr-12 text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-purple-200 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        confirmPassword: e.target.value,
                      }))
                    }
                    placeholder="Confirm your password"
                    className="w-full bg-white/10 border border-white/20 rounded-lg p-4 pr-12 text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-purple-200 hover:text-white"
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                {/* Password validation indicators */}
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                  <h4 className="text-white font-bold mb-3">Password Requirements</h4>
                  <div className="space-y-2 text-sm">
                    <div className={`flex items-center space-x-2 ${formData.password.length >= 8 ? 'text-green-400' : 'text-purple-200'}`}>
                      <div className={`w-2 h-2 rounded-full ${formData.password.length >= 8 ? 'bg-green-400' : 'bg-purple-200'}`} />
                      <span>At least 8 characters</span>
                    </div>
                    <div className={`flex items-center space-x-2 ${formData.password === formData.confirmPassword && formData.confirmPassword ? 'text-green-400' : 'text-purple-200'}`}>
                      <div className={`w-2 h-2 rounded-full ${formData.password === formData.confirmPassword && formData.confirmPassword ? 'bg-green-400' : 'bg-purple-200'}`} />
                      <span>Passwords match</span>
                    </div>
                  </div>
                </div>

                <div className="bg-red-500/20 border border-red-500/50 rounded-2xl p-4">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-red-200 font-bold mb-2">Important Security Notice</h4>
                      <p className="text-red-200 text-sm">
                        Your password encrypts your private keys. If you lose this password, 
                        you can only recover your account using your recovery phrase. 
                        Choose a strong, memorable password.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Generate Your Keys */}
          {currentStep === 3 && (
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
                      Your Public Key (npub)
                    </h4>
                    <p className="text-purple-200 font-mono break-all text-sm">
                      {formData.pubkey.substring(0, 16)}...
                      {formData.pubkey.substring(formData.pubkey.length - 16)}
                    </p>
                    <button
                      onClick={() => navigator.clipboard.writeText(formData.pubkey)}
                      className="mt-2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm flex items-center space-x-1"
                    >
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </button>
                  </div>

                  <div className="bg-green-500/20 border border-green-500/50 rounded-2xl p-6">
                    <div className="flex items-start space-x-3">
                      <Shield className="h-6 w-6 text-green-400 flex-shrink-0 mt-1" />
                      <div>
                        <h4 className="text-green-200 font-bold mb-2">
                          🔐 Your Recovery Phrase
                        </h4>
                        <p className="text-green-200 mb-3 text-sm">
                          This 12-word phrase can restore your identity. Write it down and store it safely.
                        </p>
                        <div className="bg-green-500/20 rounded-lg p-4 mb-4">
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            {formData.recoveryPhrase.split(' ').map((word, index) => (
                              <div key={index} className="bg-white/10 rounded px-2 py-1 text-green-100 font-mono">
                                <span className="text-xs text-green-300 mr-1">{index + 1}.</span>
                                {word}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => navigator.clipboard.writeText(formData.recoveryPhrase)}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm flex items-center space-x-1"
                          >
                            <Copy className="h-3 w-3" />
                            <span>Copy Phrase</span>
                          </button>
                          <button
                            onClick={() => {
                              const blob = new Blob([`Satnam.pub Recovery Phrase\n\n${formData.recoveryPhrase}\n\nCreated: ${new Date().toISOString()}\nUsername: ${formData.username}\nPublic Key: ${formData.pubkey}`], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `satnam-recovery-${formData.username}.txt`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded text-sm flex items-center space-x-1"
                          >
                            <Download className="h-3 w-3" />
                            <span>Download</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Step 4: Security Confirmation */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="text-center">
                <Shield className="h-16 w-16 text-orange-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-4">
                  Secure Your Identity
                </h3>
                <p className="text-purple-200">
                  Confirm you've secured your recovery information
                </p>
              </div>

              <div className="space-y-4">
                <div className="bg-red-500/20 border border-red-500/50 rounded-2xl p-6">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="h-6 w-6 text-red-400 flex-shrink-0 mt-1" />
                    <div>
                      <h4 className="text-red-200 font-bold mb-2">
                        🚨 CRITICAL: Security Checklist
                      </h4>
                      <div className="text-red-200 text-sm space-y-2">
                        <p>• Your recovery phrase has been written down on paper</p>
                        <p>• You've stored it in a secure, offline location</p>
                        <p>• You understand losing it means losing access forever</p>
                        <p>• You've never shared it with anyone</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.hasSecuredRecoveryPhrase}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          hasSecuredRecoveryPhrase: e.target.checked,
                        }))
                      }
                      className="mt-1 rounded border-white/30 bg-white/10 text-orange-500 focus:ring-orange-500"
                    />
                    <div>
                      <label className="text-white font-bold cursor-pointer">
                        I have securely stored my recovery phrase
                      </label>
                      <p className="text-purple-200 text-sm mt-1">
                        I understand that this recovery phrase is my only way to restore access to my identity
                        if I lose my password or device.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.agreedToTerms}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          agreedToTerms: e.target.checked,
                        }))
                      }
                      className="mt-1 rounded border-white/30 bg-white/10 text-orange-500 focus:ring-orange-500"
                    />
                    <div>
                      <label className="text-white font-bold cursor-pointer">
                        I agree to the Terms of Service
                      </label>
                      <p className="text-purple-200 text-sm mt-1">
                        I understand that Satnam.pub is a sovereign platform and I'm responsible 
                        for my own security and key management.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-500/20 border border-blue-500/50 rounded-2xl p-4">
                  <div className="flex items-start space-x-3">
                    <Key className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-blue-200 font-bold mb-2">What happens next?</h4>
                      <div className="text-blue-200 text-sm space-y-1">
                        <p>• Your identity will be registered on the Satnam.pub network</p>
                        <p>• Your keys will be encrypted with your password</p>
                        <p>• You'll get access to Bitcoin education courses</p>
                        <p>• You can invite friends and earn course credits</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Complete Registration */}
          {currentStep === 5 && (
            <div className="space-y-6">
              {isGenerating ? (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <h3 className="text-2xl font-bold text-white mb-4">
                      Forging Your Identity
                    </h3>
                    <p className="text-purple-200">
                      Registering your sovereign identity...
                    </p>
                  </div>
                  
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
                </div>
              ) : registrationResult ? (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-green-500/20 border-2 border-green-500/50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="h-10 w-10 text-green-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4">
                      Identity Forged Successfully! 🎉
                    </h3>
                    <p className="text-green-200">
                      Welcome to the sovereign Bitcoin education community
                    </p>
                  </div>

                  <div className="bg-green-500/20 border border-green-500/50 rounded-2xl p-6">
                    <h4 className="text-green-200 font-bold mb-3">Your Identity Summary</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-green-300">Username:</span>
                        <span className="text-green-100 font-mono">{registrationResult.profile.username}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-300">NIP-05:</span>
                        <span className="text-green-100 font-mono">{registrationResult.profile.nip05}</span>
                      </div>
                      {formData.lightningEnabled && (
                        <div className="flex justify-between">
                          <span className="text-green-300">Lightning:</span>
                          <span className="text-green-100 font-mono">{registrationResult.profile.lightning_address}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-orange-500/20 border border-orange-500/50 rounded-2xl p-6">
                    <h4 className="text-orange-200 font-bold mb-3">🎓 Next Steps</h4>
                    <div className="text-orange-200 text-sm space-y-2">
                      <p>• Explore Bitcoin education courses</p>
                      <p>• Invite friends to earn course credits</p>
                      <p>• Join family federations</p>
                      <p>• Start your sovereign journey</p>
                    </div>
                  </div>

                  <div className="text-center">
                    <button
                      onClick={() => setShowInvitationModal(true)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 mr-4"
                    >
                      🎁 Invite a Friend
                    </button>
                    <button
                      onClick={onComplete}
                      className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
                    >
                      Enter Satnam.pub
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}



          {/* Navigation Buttons */}
          {!(currentStep === 5 && registrationResult) && (
            <div className="flex justify-between pt-6">
              <button
                onClick={prevStep}
                disabled={isGenerating}
                className="bg-purple-700 hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back</span>
              </button>

              <button
                onClick={nextStep}
                disabled={!canContinue() || isGenerating}
                className={`font-bold py-3 px-8 rounded-lg transition-all duration-300 flex items-center space-x-2 ${
                  canContinue() && !isGenerating
                    ? "bg-orange-500 hover:bg-orange-600 text-white"
                    : "bg-white/10 text-purple-300 cursor-not-allowed"
                }`}
              >
                <span>
                  {currentStep === 2 ? "Generate Keys" : 
                   currentStep === 4 ? "Forge Identity" : 
                   currentStep === 5 && !registrationResult ? "Processing..." :
                   "Continue"}
                </span>
                {!isGenerating && <ArrowRight className="h-5 w-5" />}
                {isGenerating && (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
              </button>
            </div>
          )}
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

      {/* PostAuth Invitation Modal */}
      {showInvitationModal && sessionInfo && (
        <PostAuthInvitationModal
          isOpen={showInvitationModal}
          onClose={() => {
            setShowInvitationModal(false);
            onComplete();
          }}
          onSkip={() => {
            setShowInvitationModal(false);
            onComplete();
          }}
          sessionInfo={sessionInfo}
        />
      )}
    </div>
  );
};

export default IdentityForge;