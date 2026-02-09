/**
 * PasswordSelectionUI Component for High-Volume Onboarding
 * 
 * Provides UI for password selection in both:
 * - Coordinator-led onboarding (phrase generation)
 * - Individual self-service (user-chosen password)
 * 
 * @module PasswordSelectionUI
 */

import { useState, useCallback, type FC } from 'react';
import { Eye, EyeOff, RefreshCw, Copy, Check, AlertCircle, Shield } from 'lucide-react';
import type { PasswordMode, PasswordStrength, PasswordValidationResult } from '../../types/onboarding';
import { generatePasswordPhrase } from '../../lib/onboarding/password-generator';
import { validateOnboardingPassword } from '../../lib/onboarding/password-validator';

interface PasswordSelectionUIProps {
  /** Current password mode */
  mode: PasswordMode;
  /** Callback when mode changes */
  onModeChange?: (mode: PasswordMode) => void;
  /** Callback when password is validated and ready */
  onPasswordReady: (password: string, validation: PasswordValidationResult) => void;
  /** Whether the component is in loading state */
  isLoading?: boolean;
  /** Whether to show mode toggle (false for coordinator-only flows) */
  showModeToggle?: boolean;
  /** Initial password value */
  initialPassword?: string;
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

export const PasswordSelectionUI: FC<PasswordSelectionUIProps> = ({
  mode,
  onModeChange,
  onPasswordReady,
  isLoading = false,
  showModeToggle = true,
  initialPassword = '',
}) => {
  const [password, setPassword] = useState(initialPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [validation, setValidation] = useState<PasswordValidationResult | null>(null);

  // Generate a new password phrase
  const handleGenerate = useCallback(() => {
    const result = generatePasswordPhrase(4);
    setPassword(result.phrase);
    setShowPassword(true);

    const validationResult = validateOnboardingPassword(result.phrase, mode);
    setValidation(validationResult);

    if (validationResult.valid) {
      onPasswordReady(result.phrase, validationResult);
    }
  }, [mode, onPasswordReady]);

  // Handle password input change
  const handlePasswordChange = useCallback((value: string) => {
    setPassword(value);

    if (value.length > 0) {
      const validationResult = validateOnboardingPassword(value, mode);
      setValidation(validationResult);

      if (validationResult.valid) {
        onPasswordReady(value, validationResult);
      }
    } else {
      setValidation(null);
    }
  }, [mode, onPasswordReady]);

  // Copy password to clipboard
  const handleCopy = useCallback(async () => {
    if (password) {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [password]);

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      {showModeToggle && onModeChange && (
        <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
          <span className="text-sm text-purple-200">Password Mode</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onModeChange('coordinator-assigned')}
              disabled={isLoading}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${mode === 'coordinator-assigned'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/10 text-purple-300 hover:bg-white/20'
                }`}
            >
              Generate Phrase
            </button>
            <button
              type="button"
              onClick={() => onModeChange('user-chosen')}
              disabled={isLoading}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${mode === 'user-chosen'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/10 text-purple-300 hover:bg-white/20'
                }`}
            >
              Choose Password
            </button>
          </div>
        </div>
      )}

      {/* Coordinator-Assigned Mode */}
      {mode === 'coordinator-assigned' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-purple-200">
            <Shield className="h-4 w-4" />
            <span>Auto-generated 4-5 word passphrase (recommended)</span>
          </div>

          {/* Generated Password Display */}
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="flex-1 p-4 bg-white/10 border border-white/20 rounded-lg font-mono text-lg text-white min-h-[3.5rem] flex items-center">
                {password ? (
                  showPassword ? password : '•'.repeat(password.length)
                ) : (
                  <span className="text-purple-300">Click "Generate" to create a passphrase</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-2 text-purple-300 hover:text-white"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>

              <button
                type="button"
                onClick={handleCopy}
                disabled={!password}
                className="p-2 text-purple-300 hover:text-white disabled:opacity-50"
                title="Copy to clipboard"
              >
                {copied ? <Check className="h-5 w-5 text-green-400" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
            {password ? 'Regenerate Passphrase' : 'Generate Passphrase'}
          </button>
        </div>
      )}

      {/* User-Chosen Mode */}
      {mode === 'user-chosen' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-purple-200">
            <Shield className="h-4 w-4" />
            <span>Enter 4-5 words (26+ chars) OR 12+ chars with mixed case, numbers, symbols</span>
          </div>

          {/* Password Input */}
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder="Enter your password..."
              disabled={isLoading}
              className="w-full p-4 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-300 hover:text-white"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          {/* Strength Indicator */}
          {validation && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${strengthColors[validation.strength]} transition-all`}
                    style={{
                      width: validation.strength === 'weak' ? '25%' :
                        validation.strength === 'medium' ? '50%' :
                          validation.strength === 'strong' ? '75%' : '100%'
                    }}
                  />
                </div>
                <span className="text-sm text-purple-200">
                  {strengthLabels[validation.strength]}
                </span>
              </div>

              {/* Entropy Display */}
              <div className="text-xs text-purple-300">
                Entropy: {validation.entropyBits.toFixed(1)} bits
              </div>

              {/* Validation Errors */}
              {!validation.valid && validation.errors.length > 0 && (
                <div className="space-y-1">
                  {validation.errors.map((error, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm text-red-400">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Success Message */}
              {validation.valid && (
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <Check className="h-4 w-4" />
                  <span>Password meets requirements ({validation.type === 'phrase' ? 'Phrase' : 'Complex'})</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PasswordSelectionUI;

