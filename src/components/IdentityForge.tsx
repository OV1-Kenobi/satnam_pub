import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Users, 
  Check, 
  X, 
  ArrowLeft, 
  ArrowRight, 
  Key, 
  Sparkles,
  QrCode,
  AlertTriangle,
  Wifi
} from 'lucide-react';

interface FormData {
  username: string;
  pubkey: string;
  lightningEnabled: boolean;
  familyRelay: string;
  useCitadelRelay: boolean;
}

interface IdentityForgeProps {
  onComplete: () => void;
  onBack: () => void;
}

const IdentityForge: React.FC<IdentityForgeProps> = ({ onComplete, onBack }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    username: '',
    pubkey: '',
    lightningEnabled: true,
    familyRelay: '',
    useCitadelRelay: true
  });
  
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStep, setGenerationStep] = useState('');
  const [isComplete, setIsComplete] = useState(false);

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

  // Key generation simulation
  const generateKeys = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    
    // Step 1: Generating entropy
    setGenerationStep('Generating entropy...');
    for (let i = 0; i <= 33; i++) {
      setGenerationProgress(i);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    
    // Step 2: Creating keypair
    setGenerationStep('Creating keypair...');
    for (let i = 33; i <= 66; i++) {
      setGenerationProgress(i);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    
    // Step 3: Securing identity
    setGenerationStep('Securing identity...');
    for (let i = 66; i <= 100; i++) {
      setGenerationProgress(i);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    
    // Generate mock pubkey
    const mockPubkey = 'npub1' + Math.random().toString(36).substring(2, 50) + Math.random().toString(36).substring(2, 10);
    setFormData(prev => ({ ...prev, pubkey: mockPubkey }));
    setIsGenerating(false);
  };

  const nextStep = () => {
    if (currentStep < 4) {
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
      case 4:
        return true;
      default:
        return false;
    }
  };

  if (isComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-12 text-center max-w-2xl border border-white/20">
          <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce">
            <Sparkles className="h-12 w-12 text-white" />
          </div>
          <h2 className="text-4xl font-bold text-white mb-6">Identity Forged Successfully!</h2>
          <p className="text-xl text-purple-100 mb-8">
            Welcome to true digital sovereignty, <span className="font-bold text-yellow-400">{formData.username}</span>
          </p>
          <div className="bg-white/10 rounded-lg p-6 mb-8">
            <p className="text-purple-100 mb-2">Your sovereign identity:</p>
            <p className="text-white font-mono text-lg">{formData.username}@satnam.pub</p>
          </div>
          <div className="flex space-x-4 justify-center">
            <button 
              onClick={onComplete}
              className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-8 rounded-lg transition-all duration-300"
            >
              Explore Nostr Ecosystem
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-8 rounded-lg transition-all duration-300"
            >
              Forge Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 pt-8">
          <div className="flex items-center justify-center space-x-3 mb-6">
            <img src="/ID forge icon.png" alt="Identity Forge" className="h-10 w-10" />
            <h1 className="text-4xl font-bold text-white">Identity Forge</h1>
          </div>
          <p className="text-purple-100 text-lg">Forge your sovereign digital identity</p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-4">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${
                  step <= currentStep 
                    ? 'bg-yellow-400 text-purple-900' 
                    : 'bg-white/20 text-white'
                }`}>
                  {step < currentStep ? <Check className="h-5 w-5" /> : step}
                </div>
                {step < 4 && (
                  <div className={`h-1 w-20 mx-4 transition-all duration-300 ${
                    step < currentStep ? 'bg-yellow-400' : 'bg-white/20'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm text-purple-100">
            <span>Choose Name</span>
            <span>Generate Keys</span>
            <span>Lightning Setup</span>
            <span>Family Federation</span>
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
          {/* Step 1: Choose Your True Name */}
          {currentStep === 1 && (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-white mb-4">Choose Your True Name</h2>
                <p className="text-purple-100">This will be your sovereign identity across the Bitcoin network</p>
              </div>
              
              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="Enter your username"
                    className="w-full px-6 py-4 text-xl bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-yellow-400 transition-all duration-300"
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
                  <div className="bg-white/10 rounded-lg p-4">
                    <p className="text-purple-100 mb-2">Your identity will be:</p>
                    <p className="text-white font-mono text-lg">{formData.username}@satnam.pub</p>
                    {usernameAvailable === false && (
                      <p className="text-red-400 mt-2">This name is already taken</p>
                    )}
                    {!validateUsername(formData.username) && (
                      <p className="text-red-400 mt-2">3-20 characters, letters, numbers, and underscores only</p>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-purple-900/50 rounded-lg p-6">
                <h3 className="text-white font-bold mb-2">Your keys, your identity</h3>
                <p className="text-purple-100">No email required, no data collection. Sovereign from day one.</p>
              </div>
            </div>
          )}

          {/* Step 2: Generate Your Keys */}
          {currentStep === 2 && (
            <div className="space-y-8">
              <div className="text-center">
                <Key className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-3xl font-bold text-white mb-4">Generate Your Keys</h2>
                <p className="text-purple-100">Creating your cryptographic identity</p>
              </div>

              {isGenerating ? (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-24 h-24 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-white font-semibold">{generationStep}</p>
                  </div>
                  
                  <div className="bg-white/10 rounded-lg p-4">
                    <div className="flex justify-between text-sm text-purple-100 mb-2">
                      <span>Progress</span>
                      <span>{generationProgress}%</span>
                    </div>
                    <div className="w-full bg-white/20 rounded-full h-3">
                      <div 
                        className="bg-gradient-to-r from-yellow-400 to-orange-500 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${generationProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : formData.pubkey ? (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="h-8 w-8 text-white" />
                    </div>
                    <p className="text-green-400 font-semibold">Keys generated successfully!</p>
                  </div>
                  
                  <div className="bg-white/10 rounded-lg p-6">
                    <h3 className="text-white font-bold mb-3">Your Public Key</h3>
                    <p className="text-purple-100 font-mono break-all">
                      {formData.pubkey.substring(0, 8)}...{formData.pubkey.substring(formData.pubkey.length - 8)}
                    </p>
                  </div>

                  <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-6">
                    <div className="flex items-start space-x-3">
                      <AlertTriangle className="h-6 w-6 text-red-400 flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="text-red-400 font-bold mb-2">Save Your Recovery Phrase Securely</h3>
                        <p className="text-red-200">Your recovery phrase is the only way to restore your identity. Write it down and store it safely offline.</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Step 3: Lightning Address Setup */}
          {currentStep === 3 && (
            <div className="space-y-8">
              <div className="text-center">
                <div className="relative">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                    <img src="/LN Bitcoin icon.png" alt="Lightning Bitcoin" className="h-12 w-12" />
                  </div>
                </div>
                <h2 className="text-3xl font-bold text-white mb-4">Lightning Address Setup</h2>
                <p className="text-purple-100">Receive Bitcoin payments instantly</p>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between bg-white/10 rounded-lg p-6">
                  <div>
                    <h3 className="text-white font-bold mb-2">Enable Lightning Address</h3>
                    <p className="text-purple-100">Allow others to send you Bitcoin payments</p>
                  </div>
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, lightningEnabled: !prev.lightningEnabled }))}
                    className={`w-14 h-8 rounded-full transition-all duration-300 ${
                      formData.lightningEnabled ? 'bg-yellow-400' : 'bg-white/20'
                    }`}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full transition-all duration-300 ${
                      formData.lightningEnabled ? 'translate-x-7' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                {formData.lightningEnabled && (
                  <>
                    <div className="bg-white/10 rounded-lg p-6">
                      <h3 className="text-white font-bold mb-3">Your Lightning Address</h3>
                      <p className="text-yellow-400 font-mono text-lg">{formData.username}@satnam.pub</p>
                      <p className="text-purple-100 mt-2">This address can receive Bitcoin payments</p>
                    </div>

                    <div className="bg-white/10 rounded-lg p-6 text-center">
                      <QrCode className="h-24 w-24 text-white mx-auto mb-4 opacity-50" />
                      <p className="text-purple-100">QR code will be generated after setup</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Family Federation */}
          {currentStep === 4 && (
            <div className="space-y-8">
              <div className="text-center">
                <img src="/Rebuilding_Camelot_logo__transparency_v3.png" alt="Rebuilding Camelot" className="h-16 w-16 mx-auto mb-4" />
                <h2 className="text-3xl font-bold text-white mb-4">Family Federation</h2>
                <p className="text-purple-100">Connect to your family's private network</p>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between bg-white/10 rounded-lg p-6">
                  <div>
                    <h3 className="text-white font-bold mb-2">Use Citadel Academy Public Relay</h3>
                    <p className="text-purple-100">Connect to our secure, family-friendly relay</p>
                  </div>
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, useCitadelRelay: !prev.useCitadelRelay }))}
                    className={`w-14 h-8 rounded-full transition-all duration-300 ${
                      formData.useCitadelRelay ? 'bg-yellow-400' : 'bg-white/20'
                    }`}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full transition-all duration-300 ${
                      formData.useCitadelRelay ? 'translate-x-7' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                {!formData.useCitadelRelay && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-white font-bold mb-2">Family Relay URL</label>
                      <input
                        type="url"
                        value={formData.familyRelay}
                        onChange={(e) => setFormData(prev => ({ ...prev, familyRelay: e.target.value }))}
                        placeholder="wss://relay.yourfamily.com"
                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-yellow-400 transition-all duration-300"
                      />
                    </div>
                    <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <Wifi className="h-5 w-5 text-blue-400 flex-shrink-0 mt-1" />
                        <div>
                          <h4 className="text-blue-400 font-bold mb-1">Private Family Relay</h4>
                          <p className="text-blue-200 text-sm">Connect to your family's private Nostr relay for enhanced privacy and coordination.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white/10 rounded-lg p-6">
                  <h3 className="text-white font-bold mb-3">Family Federation Benefits</h3>
                  <ul className="space-y-2 text-purple-100">
                    <li className="flex items-center space-x-2">
                      <Check className="h-4 w-4 text-green-400" />
                      <span>Shared family identity verification</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <Check className="h-4 w-4 text-green-400" />
                      <span>Coordinated Lightning payments</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <Check className="h-4 w-4 text-green-400" />
                      <span>Multi-generational sovereignty</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-12">
            <button
              onClick={prevStep}
              className="flex items-center space-x-2 px-6 py-3 rounded-lg font-bold transition-all duration-300 bg-purple-700 hover:bg-purple-800 text-white"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Back</span>
            </button>

            <button
              onClick={nextStep}
              disabled={!canContinue()}
              className={`flex items-center space-x-2 px-8 py-3 rounded-lg font-bold transition-all duration-300 ${
                canContinue()
                  ? 'bg-purple-700 hover:bg-purple-800 text-white transform hover:scale-105'
                  : 'bg-white/10 text-purple-300 cursor-not-allowed'
              }`}
            >
              <span>{currentStep === 4 ? 'Complete Forge' : 'Continue'}</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Security Messaging */}
        <div className="text-center mt-8">
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-8 text-purple-200">
            <span className="flex items-center space-x-2">
              <img src="/Citadel Academy Logo.png" alt="Citadel Academy" className="h-4 w-4" />
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