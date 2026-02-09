/**
 * Password Change Modal for NIP-05/Password Authenticated Users
 * 
 * Provides comprehensive password change functionality with:
 * - Current password verification
 * - New password validation (phrase-based and complex)
 * - Re-encryption of encrypted_nsec and encrypted_keet_seed
 * - Zero-knowledge security with immediate memory cleanup
 * 
 * @module PasswordChangeModal
 */

import { useState, useCallback, useEffect, type FC } from 'react';
import { Eye, EyeOff, Lock, AlertCircle, CheckCircle, X } from 'lucide-react';
import { validateOnboardingPassword } from '../../lib/onboarding/password-validator';
import { SecretCleanupManager } from '../../lib/onboarding/secret-cleanup';
import { showToast } from '../../services/toastService';
import type { PasswordValidationResult, PasswordStrength } from '../../types/onboarding';

interface PasswordChangeModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** User's NIP-05 identifier */
  nip05: string;
  /** Session token for authentication */
  sessionToken: string;
}

interface PasswordFieldState {
  value: string;
  visible: boolean;
}

const strengthColors: Record<PasswordStrength, string> = {
  weak: 'bg-red-500',
  medium: 'bg-yellow-500',
  strong: 'bg-blue-500',
  very_strong: 'bg-green-500',
};

const strengthLabels: Record<PasswordStrength, string> = {
  weak: 'Weak',
  medium: 'Medium',
  strong: 'Strong',
  very_strong: 'Very Strong',
};

export const PasswordChangeModal: FC<PasswordChangeModalProps> = ({
  isOpen,
  onClose,
  nip05,
  sessionToken,
}) => {
  // Password field states
  const [currentPassword, setCurrentPassword] = useState<PasswordFieldState>({
    value: '',
    visible: false,
  });
  const [newPassword, setNewPassword] = useState<PasswordFieldState>({
    value: '',
    visible: false,
  });
  const [confirmPassword, setConfirmPassword] = useState<PasswordFieldState>({
    value: '',
    visible: false,
  });

  // Validation and UI states
  const [validation, setValidation] = useState<PasswordValidationResult | null>(null);
  const [confirmError, setConfirmError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);

  // Secret cleanup manager
  const [cleanupManager] = useState(() => new SecretCleanupManager());

  // Validate new password on change
  useEffect(() => {
    if (newPassword.value.length > 0) {
      const result = validateOnboardingPassword(newPassword.value, 'auto');
      setValidation(result);
    } else {
      setValidation(null);
    }
  }, [newPassword.value]);

  // Validate password confirmation
  useEffect(() => {
    if (confirmPassword.value.length > 0) {
      if (confirmPassword.value !== newPassword.value) {
        setConfirmError('Passwords do not match');
      } else {
        setConfirmError('');
      }
    } else {
      setConfirmError('');
    }
  }, [confirmPassword.value, newPassword.value]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Clear all password fields from memory
      cleanupManager.clearMultipleSecrets([
        { secret: currentPassword.value, type: 'password' },
        { secret: newPassword.value, type: 'password' },
        { secret: confirmPassword.value, type: 'password' },
      ], 'modal_close');

      setCurrentPassword({ value: '', visible: false });
      setNewPassword({ value: '', visible: false });
      setConfirmPassword({ value: '', visible: false });
      setValidation(null);
      setConfirmError('');
      setError('');
      setSuccess(false);
      setIsSubmitting(false);

      cleanupManager.triggerBrowserMemoryCleanup();
    }
  }, [isOpen, cleanupManager, currentPassword.value, newPassword.value, confirmPassword.value]);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation checks
    if (!currentPassword.value) {
      setError('Please enter your current password');
      return;
    }

    if (!newPassword.value) {
      setError('Please enter a new password');
      return;
    }

    if (!validation || !validation.valid) {
      setError('Please enter a valid password that meets the requirements');
      return;
    }

    if (confirmPassword.value !== newPassword.value) {
      setError('Passwords do not match');
      return;
    }

    if (currentPassword.value === newPassword.value) {
      setError('New password must be different from current password');
      return;
    }

    setIsSubmitting(true);

    try {
      // Call password change API
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          nip05,
          currentPassword: currentPassword.value,
          newPassword: newPassword.value,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to change password');
      }

      // Success! Clear passwords from memory
      cleanupManager.clearMultipleSecrets([
        { secret: currentPassword.value, type: 'password' },
        { secret: newPassword.value, type: 'password' },
        { secret: confirmPassword.value, type: 'password' },
      ], 'password_change_success');

      cleanupManager.triggerBrowserMemoryCleanup();

      setSuccess(true);
      showToast.success('Password changed successfully! Your Nostr key and Keet seed have been re-encrypted.', {
        duration: 5000,
      });

      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to change password';
      setError(errorMessage);
      showToast.error(errorMessage, { duration: 5000 });
    } finally {
      setIsSubmitting(false);
    }
  }, [currentPassword.value, newPassword.value, confirmPassword.value, validation, nip05, sessionToken, cleanupManager, onClose]);

  // Toggle password visibility
  const toggleVisibility = useCallback((field: 'current' | 'new' | 'confirm') => {
    if (field === 'current') {
      setCurrentPassword(prev => ({ ...prev, visible: !prev.visible }));
    } else if (field === 'new') {
      setNewPassword(prev => ({ ...prev, visible: !prev.visible }));
    } else {
      setConfirmPassword(prev => ({ ...prev, visible: !prev.visible }));
    }
  }, []);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isSubmitting) {
      onClose();
    }
  }, [isSubmitting, onClose]);

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-change-title"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative">
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute right-3 top-3 text-gray-500 hover:text-gray-800 disabled:opacity-50 z-10"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Lock className="w-6 h-6 text-purple-600" />
            <h2 id="password-change-title" className="text-xl font-semibold text-gray-900">
              Change Password
            </h2>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Update your password and re-encrypt your secrets
          </p>
        </div>

        {/* Success state */}
        {success ? (
          <div className="px-6 py-8">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Password Changed Successfully!
                </h3>
                <p className="text-sm text-gray-600">
                  Your password has been updated and both your Nostr key and Keet seed have been re-encrypted with the new password.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
            {/* Error message */}
            {error && (
              <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Current Password */}
            <div>
              <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1">
                Current Password
              </label>
              <div className="relative">
                <input
                  id="current-password"
                  type={currentPassword.visible ? 'text' : 'password'}
                  value={currentPassword.value}
                  onChange={(e) => setCurrentPassword(prev => ({ ...prev, value: e.target.value }))}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Enter your current password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => toggleVisibility('current')}
                  disabled={isSubmitting}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  aria-label={currentPassword.visible ? 'Hide password' : 'Show password'}
                >
                  {currentPassword.visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={newPassword.visible ? 'text' : 'password'}
                  value={newPassword.value}
                  onChange={(e) => setNewPassword(prev => ({ ...prev, value: e.target.value }))}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Enter your new password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => toggleVisibility('new')}
                  disabled={isSubmitting}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  aria-label={newPassword.visible ? 'Hide password' : 'Show password'}
                >
                  {newPassword.visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {/* Password strength indicator */}
              {validation && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Password Strength:</span>
                    <span className={`font-medium ${validation.valid ? 'text-green-600' : 'text-red-600'}`}>
                      {strengthLabels[validation.strength]}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${strengthColors[validation.strength]}`}
                      style={{
                        width: validation.strength === 'weak' ? '25%' :
                          validation.strength === 'medium' ? '50%' :
                            validation.strength === 'strong' ? '75%' : '100%'
                      }}
                    />
                  </div>
                  <div className="text-xs text-gray-600">
                    Type: <span className="font-medium">{validation.type === 'phrase' ? 'Phrase-based' : validation.type === 'complex' ? 'Complex' : 'Invalid'}</span>
                    {validation.entropyBits > 0 && (
                      <span className="ml-2">({validation.entropyBits} bits entropy)</span>
                    )}
                  </div>
                  {validation.errors.length > 0 && (
                    <ul className="text-xs text-red-600 space-y-1">
                      {validation.errors.map((err, idx) => (
                        <li key={idx}>• {err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Password requirements */}
              {!validation && newPassword.value.length === 0 && (
                <div className="mt-2 text-xs text-gray-600 space-y-1">
                  <p className="font-medium">Password must be either:</p>
                  <ul className="ml-4 space-y-0.5">
                    <li>• Phrase-based: ≥26 chars, 4-5 words</li>
                    <li>• Complex: ≥12 chars with uppercase, lowercase, numbers, symbols</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={confirmPassword.visible ? 'text' : 'password'}
                  value={confirmPassword.value}
                  onChange={(e) => setConfirmPassword(prev => ({ ...prev, value: e.target.value }))}
                  disabled={isSubmitting}
                  className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed ${confirmError ? 'border-red-300' : 'border-gray-300'
                    }`}
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => toggleVisibility('confirm')}
                  disabled={isSubmitting}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  aria-label={confirmPassword.visible ? 'Hide password' : 'Show password'}
                >
                  {confirmPassword.visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {confirmError && (
                <p className="mt-1 text-xs text-red-600">{confirmError}</p>
              )}
            </div>

            {/* Submit button */}
            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !validation?.valid || !!confirmError || !currentPassword.value}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isSubmitting ? 'Changing Password...' : 'Change Password'}
              </button>
            </div>

            {/* Security notice */}
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-800">
                <strong>Security Notice:</strong> Changing your password will re-encrypt both your Nostr private key and Keet seed with the new password. This process is secure and happens entirely in your browser.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default PasswordChangeModal;

