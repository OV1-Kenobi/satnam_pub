/**
 * ParticipantIntakeStep Component
 * @description Collects participant intake data for high-volume physical peer onboarding
 *
 * Features:
 * - True name (required) and display name (optional)
 * - Language selection (required, default 'en')
 * - Existing Nostr account detection (drives migration flow)
 * - Existing Lightning wallet detection
 * - Technical comfort level assessment
 * - Form validation with clear error messages
 * - Backend integration with onboarding-participant-register Netlify function
 *
 * @module ParticipantIntakeStep
 */

import { AlertCircle, Loader2, User } from 'lucide-react';
import { useCallback, useState, type FC } from 'react';
import { useOnboardingSession } from '../../../contexts/OnboardingSessionContext';
import type {
  OnboardingParticipant,
  RegisterParticipantRequest,
  TechnicalComfort,
} from '../../../types/onboarding';
import { authenticatedFetch } from '../../../utils/secureSession';

// ============================================================================
// Types
// ============================================================================

interface ParticipantIntakeStepProps {
  /** Callback when intake step is completed and ready to advance */
  onNext: () => void;
  /** Callback when user wants to go back */
  onBack?: () => void;
}

interface FormState {
  trueName: string;
  displayName: string;
  language: string;
  existingNostrAccount: boolean;
  oldNpub: string;
  existingLightningWallet: boolean;
  technicalComfort: TechnicalComfort;
}

interface FormErrors {
  trueName?: string;
  language?: string;
  oldNpub?: string;
  general?: string;
}

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
];

const INITIAL_FORM_STATE: FormState = {
  trueName: '',
  displayName: '',
  language: 'en',
  existingNostrAccount: false,
  oldNpub: '',
  existingLightningWallet: false,
  technicalComfort: 'medium',
};

// ============================================================================
// Component
// ============================================================================

export const ParticipantIntakeStep: FC<ParticipantIntakeStepProps> = ({
  onNext,
  onBack,
}) => {
  const {
    session,
    addParticipant,
    completeStep,
    setError: setContextError,
  } = useOnboardingSession();

  const [formData, setFormData] = useState<FormState>(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ============================================================================
  // Form Validation
  // ============================================================================

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    // True name is required
    if (!formData.trueName.trim()) {
      newErrors.trueName = 'True name is required';
    } else if (formData.trueName.trim().length < 2) {
      newErrors.trueName = 'True name must be at least 2 characters';
    }

    // Language is required
    if (!formData.language) {
      newErrors.language = 'Language selection is required';
    }

    // If existing Nostr account is checked, oldNpub should be valid if provided
    if (formData.existingNostrAccount && formData.oldNpub.trim()) {
      const npubPattern = /^npub1[a-z0-9]{58}$/i;
      if (!npubPattern.test(formData.oldNpub.trim())) {
        newErrors.oldNpub = 'Invalid npub format (should start with npub1 and be 63 characters)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // ============================================================================
  // Form Handlers
  // ============================================================================

  const handleInputChange = useCallback((
    field: keyof FormState,
    value: string | boolean,
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field as keyof FormErrors];
        return newErrors;
      });
    }
  }, [errors]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (!session) {
      setErrors({ general: 'No active onboarding session' });
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Prepare request payload
      const payload: RegisterParticipantRequest = {
        sessionId: session.sessionId,
        trueName: formData.trueName.trim(),
        displayName: formData.displayName.trim() || undefined,
        language: formData.language,
        existingNostrAccount: formData.existingNostrAccount,
        existingLightningWallet: formData.existingLightningWallet,
        migrationFlag: formData.existingNostrAccount,
        oldNpub: formData.existingNostrAccount && formData.oldNpub.trim()
          ? formData.oldNpub.trim()
          : undefined,
        technicalComfort: formData.technicalComfort,
      };

      // Call backend to register participant
      const response = await authenticatedFetch(
        '/.netlify/functions/onboarding-participant-register',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Registration failed: ${response.status}`);
      }

      const { participant: registeredParticipant } = await response.json();

      // Create participant data for context (mapping API response to OnboardingParticipant)
      const participantData: Omit<OnboardingParticipant, 'participantId' | 'sessionId' | 'createdAt' | 'updatedAt'> = {
        trueName: registeredParticipant.trueName,
        displayName: registeredParticipant.displayName,
        language: registeredParticipant.language,
        npub: 'pending', // Will be set during identity step
        existingNostrAccount: registeredParticipant.existingNostrAccount,
        existingLightningWallet: registeredParticipant.existingLightningWallet,
        migrationFlag: registeredParticipant.migrationFlag,
        oldNpub: registeredParticipant.oldNpub,
        technicalComfort: registeredParticipant.technicalComfort,
        currentStep: 'intake',
        completedSteps: [],
        status: 'pending',
      };

      // Add participant to context
      await addParticipant(participantData);

      // Mark intake step as completed
      await completeStep('intake');

      // Advance to next step
      onNext();

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to register participant';
      setErrors({ general: errorMessage });
      setContextError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, session, validateForm, addParticipant, completeStep, onNext, setContextError]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* General Error Display */}
      {errors.general && (
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-300 text-sm">{errors.general}</p>
        </div>
      )}

      {/* True Name (Required) */}
      <div className="space-y-2">
        <label htmlFor="trueName" className="block text-sm font-medium text-purple-200">
          True Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          id="trueName"
          value={formData.trueName}
          onChange={(e) => handleInputChange('trueName', e.target.value)}
          placeholder="Enter participant's true name"
          disabled={isSubmitting}
          className={`w-full p-3 bg-white/10 border rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 ${errors.trueName ? 'border-red-500' : 'border-white/20'
            }`}
        />
        {errors.trueName && (
          <p className="text-red-400 text-sm flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {errors.trueName}
          </p>
        )}
      </div>

      {/* Display Name (Optional) */}
      <div className="space-y-2">
        <label htmlFor="displayName" className="block text-sm font-medium text-purple-200">
          Display Name <span className="text-purple-400">(optional)</span>
        </label>
        <input
          type="text"
          id="displayName"
          value={formData.displayName}
          onChange={(e) => handleInputChange('displayName', e.target.value)}
          placeholder="Enter preferred display name"
          disabled={isSubmitting}
          className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
        />
      </div>

      {/* Language Selection (Required) */}
      <div className="space-y-2">
        <label htmlFor="language" className="block text-sm font-medium text-purple-200">
          Preferred Language <span className="text-red-400">*</span>
        </label>
        <select
          id="language"
          value={formData.language}
          onChange={(e) => handleInputChange('language', e.target.value)}
          disabled={isSubmitting}
          className={`w-full p-3 bg-white/10 border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 ${errors.language ? 'border-red-500' : 'border-white/20'
            }`}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code} className="bg-purple-900">
              {lang.label}
            </option>
          ))}
        </select>
        {errors.language && (
          <p className="text-red-400 text-sm flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {errors.language}
          </p>
        )}
      </div>

      {/* Existing Nostr Account Checkbox */}
      <div className="space-y-3">
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="existingNostrAccount"
            checked={formData.existingNostrAccount}
            onChange={(e) => handleInputChange('existingNostrAccount', e.target.checked)}
            disabled={isSubmitting}
            className="w-5 h-5 rounded border-white/20 bg-white/10 text-purple-600 focus:ring-purple-500"
          />
          <label htmlFor="existingNostrAccount" className="text-sm font-medium text-purple-200">
            I already have a Nostr account (npub)
          </label>
        </div>

        {/* Old Npub Input (shown when existing account checked) */}
        {formData.existingNostrAccount && (
          <div className="ml-8 space-y-2">
            <label htmlFor="oldNpub" className="block text-sm font-medium text-purple-200">
              Existing npub <span className="text-purple-400">(optional, for migration)</span>
            </label>
            <input
              type="text"
              id="oldNpub"
              value={formData.oldNpub}
              onChange={(e) => handleInputChange('oldNpub', e.target.value)}
              placeholder="npub1..."
              disabled={isSubmitting}
              className={`w-full p-3 bg-white/10 border rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 font-mono text-sm ${errors.oldNpub ? 'border-red-500' : 'border-white/20'
                }`}
            />
            {errors.oldNpub && (
              <p className="text-red-400 text-sm flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {errors.oldNpub}
              </p>
            )}
            <p className="text-xs text-purple-300">
              If provided, we can help migrate your existing identity to this new setup.
            </p>
          </div>
        )}
      </div>

      {/* Existing Lightning Wallet Checkbox */}
      <div className="flex items-center space-x-3">
        <input
          type="checkbox"
          id="existingLightningWallet"
          checked={formData.existingLightningWallet}
          onChange={(e) => handleInputChange('existingLightningWallet', e.target.checked)}
          disabled={isSubmitting}
          className="w-5 h-5 rounded border-white/20 bg-white/10 text-purple-600 focus:ring-purple-500"
        />
        <label htmlFor="existingLightningWallet" className="text-sm font-medium text-purple-200">
          I already have a Lightning wallet
        </label>
      </div>

      {/* Technical Comfort Level */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-purple-200">
          Technical Comfort Level
        </label>
        <div className="flex flex-wrap gap-3">
          {(['low', 'medium', 'high'] as TechnicalComfort[]).map((level) => (
            <label
              key={level}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg cursor-pointer transition-colors ${formData.technicalComfort === level
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/10 text-purple-200 hover:bg-white/20'
                } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="technicalComfort"
                value={level}
                checked={formData.technicalComfort === level}
                onChange={(e) => handleInputChange('technicalComfort', e.target.value as TechnicalComfort)}
                disabled={isSubmitting}
                className="sr-only"
              />
              <User className="h-4 w-4" />
              <span className="capitalize">{level}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-purple-300">
          This helps us adjust the onboarding experience to your comfort level with technology.
        </p>
      </div>

      {/* Submit Button */}
      <div className="pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Registering...
            </>
          ) : (
            'Continue to Password Setup'
          )}
        </button>
      </div>
    </form>
  );
};

export default ParticipantIntakeStep;

