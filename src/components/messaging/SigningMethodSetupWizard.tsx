/**
 * Signing Method Setup Wizard
 * 
 * Guided onboarding flow that helps users understand and configure
 * their preferred message signing method. Eliminates unexpected
 * browser extension prompts by setting clear user preferences.
 */

import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle, Clock, Shield, Smartphone } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { SigningMethod, SigningMethodInfo, userSigningPreferences } from '../../lib/user-signing-preferences';

interface SigningMethodSetupWizardProps {
  onComplete?: (selectedMethod: SigningMethod) => void;
  onCancel?: () => void;
  showSkip?: boolean;
}

const SecurityLevelBadge: React.FC<{ level: 'maximum' | 'high' | 'medium' }> = ({ level }) => {
  const config = {
    maximum: { color: 'bg-green-100 text-green-800 border-green-200', icon: Shield, label: 'Maximum Security' },
    high: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Shield, label: 'High Security' },
    medium: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: AlertTriangle, label: 'Medium Security' }
  };

  const { color, icon: Icon, label } = config[level];

  return (
    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${color}`}>
      <Icon className="w-3 h-3 mr-1" />
      {label}
    </div>
  );
};

const ConvenienceBadge: React.FC<{ level: 'high' | 'medium' | 'low' }> = ({ level }) => {
  const config = {
    high: { color: 'bg-green-100 text-green-700', label: 'Very Convenient' },
    medium: { color: 'bg-yellow-100 text-yellow-700', label: 'Moderately Convenient' },
    low: { color: 'bg-red-100 text-red-700', label: 'Less Convenient' }
  };

  const { color, label } = config[level];

  return (
    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${color}`}>
      <Clock className="w-3 h-3 mr-1" />
      {label}
    </div>
  );
};

export const SigningMethodSetupWizard: React.FC<SigningMethodSetupWizardProps> = ({
  onComplete,
  onCancel,
  showSkip = true
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedMethod, setSelectedMethod] = useState<SigningMethod>('session');
  const [availableMethods, setAvailableMethods] = useState<SigningMethodInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionCreated, setSessionCreated] = useState(false);

  useEffect(() => {
    loadAvailableMethods();
  }, []);

  const loadAvailableMethods = async () => {
    const methods = await userSigningPreferences.getAvailableSigningMethods();
    setAvailableMethods(methods);
  };

  const steps = [
    {
      title: 'Choose Your Signing Method',
      description: 'Select how you want to sign messages. You can change this later in settings.',
      component: 'method-selection'
    },
    {
      title: 'Setup Your Chosen Method',
      description: 'Let\'s configure your selected signing method.',
      component: 'method-setup'
    },
    {
      title: 'All Set!',
      description: 'Your signing method is configured and ready to use.',
      component: 'completion'
    }
  ];

  const handleMethodSelect = (method: SigningMethod) => {
    setSelectedMethod(method);
  };

  const handleNext = async () => {
    if (currentStep === 0) {
      // Moving to setup step
      setCurrentStep(1);
    } else if (currentStep === 1) {
      // Setup the selected method
      setLoading(true);

      if (selectedMethod === 'session') {
        // For session-based, we need to ensure user understands they need to sign in
        // In a real implementation, this would integrate with the auth flow
        console.log('🔐 SigningMethodSetupWizard: Session-based method selected');
        setSessionCreated(true);
      }

      // Save user preference
      const currentPrefs = await userSigningPreferences.getUserPreferences();
      if (currentPrefs) {
        await userSigningPreferences.updatePreferences({
          ...currentPrefs,
          preferredMethod: selectedMethod,
          fallbackMethod: selectedMethod === 'session' ? 'nip07' : 'session'
        });
      }

      setLoading(false);
      setCurrentStep(2);
    } else {
      // Complete the wizard
      onComplete?.(selectedMethod);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderMethodSelection = () => (
    <div className="space-y-4">
      {availableMethods.map((method) => (
        <div
          key={method.id}
          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${selectedMethod === method.id
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 hover:border-gray-300'
            } ${!method.available && method.id !== 'session' ? 'opacity-50' : ''}`}
          onClick={() => method.available || method.id === 'session' ? handleMethodSelect(method.id) : null}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                {method.id === 'session' && <Smartphone className="w-5 h-5 text-blue-600" />}
                {method.id === 'nip07' && <Shield className="w-5 h-5 text-purple-600" />}
                {method.id === 'nfc' && <Shield className="w-5 h-5 text-green-600" />}
                <h3 className="font-medium text-gray-900">{method.name}</h3>
                {selectedMethod === method.id && <CheckCircle className="w-5 h-5 text-blue-600" />}
              </div>

              <p className="text-sm text-gray-600 mb-3">{method.description}</p>

              <div className="flex items-center space-x-2 mb-2">
                <SecurityLevelBadge level={method.securityLevel} />
                <ConvenienceBadge level={method.convenience} />
              </div>

              {!method.available && method.requiresSetup && (
                <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  {method.setupInstructions}
                </div>
              )}

              {method.available && (
                <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
                  <CheckCircle className="w-3 h-3 inline mr-1" />
                  Ready to use
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">💡 Recommendation</h4>
        <p className="text-sm text-blue-800">
          <strong>Session-based signing</strong> is recommended for most users. It provides a good balance
          of security and convenience. You can always upgrade to NIP-07 or NFC Physical MFA later.
        </p>
      </div>
    </div>
  );

  const renderMethodSetup = () => {
    const method = availableMethods.find(m => m.id === selectedMethod);
    if (!method) return null;

    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            {selectedMethod === 'session' && <Smartphone className="w-8 h-8 text-blue-600" />}
            {selectedMethod === 'nip07' && <Shield className="w-8 h-8 text-purple-600" />}
            {selectedMethod === 'nfc' && <Shield className="w-8 h-8 text-green-600" />}
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Setting up {method.name}</h3>
        </div>

        {selectedMethod === 'session' && (
          <div className="bg-gray-50 rounded-lg p-6">
            <h4 className="font-medium text-gray-900 mb-3">Session-Based Signing Setup</h4>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>You're already signed in, so session-based signing is available</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Sessions automatically expire after 15 minutes for security</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>You can extend sessions or create new ones as needed</span>
              </div>
            </div>
          </div>
        )}

        {selectedMethod === 'nip07' && (
          <div className="bg-gray-50 rounded-lg p-6">
            <h4 className="font-medium text-gray-900 mb-3">NIP-07 Extension Setup</h4>
            {method.available ? (
              <div className="space-y-3 text-sm text-gray-700">
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>NIP-07 extension detected and ready to use</span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Your private keys stay secure in the browser extension</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-gray-700">
                <p>To use NIP-07 signing, you'll need to install a compatible browser extension:</p>
                <div className="space-y-2">
                  <a href="https://getalby.com" target="_blank" rel="noopener noreferrer"
                    className="flex items-center space-x-2 text-blue-600 hover:text-blue-800">
                    <span>• Alby Extension (Recommended)</span>
                    <ArrowRight className="w-3 h-3" />
                  </a>
                  <a href="https://github.com/fiatjaf/nos2x" target="_blank" rel="noopener noreferrer"
                    className="flex items-center space-x-2 text-blue-600 hover:text-blue-800">
                    <span>• nos2x Extension</span>
                    <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {selectedMethod === 'nfc' && (
          <div className="bg-gray-50 rounded-lg p-6">
            <h4 className="font-medium text-gray-900 mb-3">NFC Physical MFA</h4>
            <div className="text-sm text-gray-700">
              <p className="mb-3">NFC Physical MFA provides the highest level of security by requiring a physical device for each signing operation.</p>
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-blue-800">
                  <strong>Coming Soon:</strong> NFC Physical MFA will be available in a future update.
                  For now, we recommend using Session-based signing.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCompletion = () => (
    <div className="text-center space-y-6">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle className="w-8 h-8 text-green-600" />
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">You're All Set!</h3>
        <p className="text-gray-600">
          Your preferred signing method has been configured. You can change this anytime in your
          Privacy & Security settings.
        </p>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h4 className="font-medium text-green-900 mb-2">What happens next?</h4>
        <div className="text-sm text-green-800 space-y-1">
          <p>• Messages will be signed using your preferred method</p>
          <p>• No unexpected browser extension prompts</p>
          <p>• Automatic fallback if your preferred method isn't available</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Message Signing Setup</h2>
            <p className="text-sm text-gray-600 mt-1">{steps[currentStep].description}</p>
          </div>
          {showSkip && currentStep < 2 && (
            <button
              onClick={onCancel}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Skip for now
            </button>
          )}
        </div>

        {/* Progress indicator */}
        <div className="flex items-center space-x-2 mt-4">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`h-2 flex-1 rounded-full ${index <= currentStep ? 'bg-blue-600' : 'bg-gray-200'
                }`}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {currentStep === 0 && renderMethodSelection()}
        {currentStep === 1 && renderMethodSetup()}
        {currentStep === 2 && renderCompletion()}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
        <button
          onClick={handleBack}
          disabled={currentStep === 0}
          className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <button
          onClick={handleNext}
          disabled={loading}
          className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>
            {loading ? 'Setting up...' : currentStep === 2 ? 'Complete' : 'Next'}
          </span>
          {!loading && currentStep < 2 && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

export default SigningMethodSetupWizard;
