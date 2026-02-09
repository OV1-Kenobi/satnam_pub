/**
 * PasswordSetupStep Component
 * @description Wraps PasswordSelectionUI for the onboarding wizard with confirmation field
 *
 * Features:
 * - Defaults to coordinator-assigned mode for physical peer onboarding
 * - Password confirmation field (especially for user-chosen mode)
 * - Secure password handling (ephemeral, in-memory only)
 * - Integration with OnboardingSessionContext
 *
 * Security:
 * - Password is NEVER stored in state, localStorage, or sessionStorage
 * - Password is passed to encryption helpers via callback only
 * - Uses Web Crypto API for any cryptographic operations
 *
 * @module PasswordSetupStep
 */

import { AlertCircle, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { useCallback, useRef, useState, type FC } from 'react';
import { useOnboardingSession } from '../../../contexts/OnboardingSessionContext';
import type {
  PasswordMode,
  PasswordValidationResult,
} from '../../../types/onboarding';
import PasswordSelectionUI from '../PasswordSelectionUI';

// ============================================================================
// Types
// ============================================================================

interface PasswordSetupStepProps {
  /** Callback when password step is completed with validated password */
  onPasswordReady: (password: string, validationResult: PasswordValidationResult) => void;
  /** Callback when step is completed and ready to advance */
  onNext: () => void;
  /** Callback when user wants to go back */
  onBack?: () => void;
  /** Default password mode (defaults to coordinator-assigned for physical peer onboarding) */
  defaultMode?: PasswordMode;
  /** Whether to allow switching between modes */
  allowModeSwitch?: boolean;
}

interface FormErrors {
  confirmPassword?: string;
  general?: string;
}

// ============================================================================
// Component
// ============================================================================

export const PasswordSetupStep: FC<PasswordSetupStepProps> = ({
  onPasswordReady,
  onNext,
  onBack,
  defaultMode = 'coordinator-assigned',
  allowModeSwitch = false,
}) => {
  const {
    completeStep,
    setError: setContextError,
    currentParticipant,
  } = useOnboardingSession();

  // Mode state
  const [mode, setMode] = useState<PasswordMode>(defaultMode);

  // Password state - stored in ref to avoid React state (security best practice)
  // The actual password value is ephemeral and only accessed during form submission
  const passwordRef = useRef<string>('');
  const validationRef = useRef<PasswordValidationResult | null>(null);

  // UI state
  const [hasValidPassword, setHasValidPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ============================================================================
  // Handlers
  // ============================================================================

  /**
   * Handle password ready from PasswordSelectionUI
   * Password is stored in ref (not state) for security
   */
  const handlePasswordReady = useCallback((password: string, validation: PasswordValidationResult) => {
    passwordRef.current = password;
    validationRef.current = validation;
    setHasValidPassword(validation.valid);

    // Clear confirm password if password changes
    if (confirmPassword !== password) {
      setErrors(prev => ({ ...prev, confirmPassword: undefined }));
    }
  }, [confirmPassword]);

  /**
   * Handle mode change
   */
  const handleModeChange = useCallback((newMode: PasswordMode) => {
    setMode(newMode);
    // Reset password state when mode changes
    passwordRef.current = '';
    validationRef.current = null;
    setHasValidPassword(false);
    setConfirmPassword('');
    setErrors({});
  }, []);

  /**
   * Validate confirm password matches
   */
  const validateConfirmPassword = useCallback((): boolean => {
    if (!passwordRef.current) {
      setErrors({ general: 'Please select or enter a password first' });
      return false;
    }

    if (confirmPassword !== passwordRef.current) {
      setErrors({ confirmPassword: 'Passwords do not match' });
      return false;
    }

    setErrors({});
    return true;
  }, [confirmPassword]);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateConfirmPassword()) {
      return;
    }

    if (!validationRef.current || !validationRef.current.valid) {
      setErrors({ general: 'Password validation failed' });
      return;
    }

    if (!currentParticipant) {
      setErrors({ general: 'No active participant' });
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Get the password from ref (ephemeral access)
      const password = passwordRef.current;
      const validation = validationRef.current;

      // Call the onPasswordReady callback to pass password to parent
      // This allows NostrIdentityStep to access the password for encryption
      onPasswordReady(password, validation);

      // Mark password step as completed
      await completeStep('password');

      // Clear password from memory after use
      passwordRef.current = '';
      validationRef.current = null;
      setConfirmPassword('');

      // Advance to next step
      onNext();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to complete password setup';
      setErrors({ general: errorMessage });
      setContextError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [validateConfirmPassword, currentParticipant, onPasswordReady, completeStep, onNext, setContextError]);

  // Check if continue button should be enabled
  const canContinue = hasValidPassword && confirmPassword.length > 0 && !errors.confirmPassword;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 bg-purple-600/20 rounded-full">
          <Lock className="h-6 w-6 text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Create Password</h3>
          <p className="text-sm text-purple-200">
            {currentParticipant?.trueName
              ? `Password for ${currentParticipant.trueName}`
              : 'This password will encrypt your Nostr identity'}
          </p>
        </div>
      </div>

      {/* General Error Display */}
      {errors.general && (
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-300 text-sm">{errors.general}</p>
        </div>
      )}

      {/* Password Selection UI */}
      <PasswordSelectionUI
        mode={mode}
        onModeChange={allowModeSwitch ? handleModeChange : undefined}
        onPasswordReady={handlePasswordReady}
        isLoading={isSubmitting}
        showModeToggle={allowModeSwitch}
      />

      {/* Confirm Password Field */}
      {hasValidPassword && (
        <div className="space-y-2 pt-4 border-t border-white/10">
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-purple-200">
            Confirm Password <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                // Clear error when typing
                if (errors.confirmPassword) {
                  setErrors(prev => ({ ...prev, confirmPassword: undefined }));
                }
              }}
              placeholder="Re-enter your password"
              disabled={isSubmitting}
              className={`w-full p-3 bg-white/10 border rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 pr-12 ${errors.confirmPassword ? 'border-red-500' : 'border-white/20'
                }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-300 hover:text-white"
            >
              {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-red-400 text-sm flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {errors.confirmPassword}
            </p>
          )}
        </div>
      )}

      {/* Security Notice */}
      <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <p className="text-xs text-yellow-200">
          <strong>Security Notice:</strong> Your password will be used to encrypt your Nostr private key.
          Make sure to remember it or write it down in a safe place.
          We cannot recover your password if you forget it.
        </p>
      </div>

      {/* Navigation Buttons */}
      <div className="flex gap-3 pt-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="px-4 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
          >
            Back
          </button>
        )}
        <button
          type="submit"
          disabled={!canContinue || isSubmitting}
          className="flex-1 py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Processing...
            </>
          ) : (
            'Continue to Identity Creation'
          )}
        </button>
      </div>
    </form>
  );
};

export default PasswordSetupStep;

