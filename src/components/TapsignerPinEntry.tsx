/**
 * Tapsigner PIN Entry Component
 * Phase 3 Task 3.1: Secure 6-digit PIN entry for Tapsigner 2FA authentication
 *
 * Features:
 * - 6-digit PIN input with validation (digits only)
 * - PIN visibility toggle (show/hide)
 * - Attempt counter display (3 attempts max)
 * - Lockout timer display (15 minutes)
 * - Security warnings and help text
 * - Integration with TapsignerAdapter
 * - Keyboard navigation and accessibility
 * - Responsive design with dark mode support
 *
 * Security Requirements:
 * - PIN NEVER stored in React state after submission
 * - PIN NEVER logged to console
 * - PIN NEVER stored in localStorage/sessionStorage
 * - PIN cleared from memory after use
 * - Constant-time comparison on backend
 * - Rate limiting enforced (3 attempts, 15-minute lockout)
 */

import React, { useCallback, useEffect, useState } from "react";
import { getEnvVar } from "../config/env.client";

/**
 * Props for TapsignerPinEntry component
 */
interface TapsignerPinEntryProps {
  /** Callback when PIN is submitted */
  onSubmit: (pin: string) => Promise<void>;

  /** Callback when user cancels */
  onCancel: () => void;

  /** Current attempt number (1-3) */
  attemptNumber?: number;

  /** Remaining attempts (0-3) */
  attemptsRemaining?: number;

  /** Is card currently locked? */
  isLocked?: boolean;

  /** Lockout expiry timestamp (ISO string) */
  lockoutExpiresAt?: string;

  /** Loading state during submission */
  isLoading?: boolean;

  /** Error message to display */
  error?: string | null;

  /** Help text or instructions */
  helpText?: string;
}

/**
 * Internal state for PIN entry component
 */
interface PinEntryState {
  pin: string;
  showPin: boolean;
  isSubmitting: boolean;
  error: string | null;
  lockoutTimeRemaining: number;
}

/**
 * TapsignerPinEntry Component
 * Secure 6-digit PIN entry for Tapsigner 2FA authentication
 *
 * @param props - Component props
 * @returns React component
 */
export const TapsignerPinEntry: React.FC<TapsignerPinEntryProps> = ({
  onSubmit,
  onCancel,
  attemptNumber = 1,
  attemptsRemaining = 3,
  isLocked = false,
  lockoutExpiresAt,
  isLoading = false,
  error: externalError = null,
  helpText = "Enter the 6-digit PIN from your Tapsigner card",
}) => {
  // Feature flag check
  const TAPSIGNER_ENABLED =
    (getEnvVar("VITE_TAPSIGNER_ENABLED") || "true").toLowerCase() === "true";

  if (!TAPSIGNER_ENABLED) {
    return null;
  }

  // Component state
  const [state, setState] = useState<PinEntryState>({
    pin: "",
    showPin: false,
    isSubmitting: false,
    error: externalError,
    lockoutTimeRemaining: 0,
  });

  const inputRef = React.useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Update error when external error changes
  useEffect(() => {
    setState((prev) => ({ ...prev, error: externalError }));
  }, [externalError]);

  // Lockout timer effect
  useEffect(() => {
    if (!isLocked || !lockoutExpiresAt) {
      setState((prev) => ({ ...prev, lockoutTimeRemaining: 0 }));
      return;
    }

    const updateTimer = () => {
      const now = new Date();
      const expiresAt = new Date(lockoutExpiresAt);
      const remainingMs = expiresAt.getTime() - now.getTime();
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

      setState((prev) => ({ ...prev, lockoutTimeRemaining: remainingSeconds }));

      if (remainingSeconds <= 0) {
        clearInterval(timerId);
      }
    };

    updateTimer();
    const timerId = setInterval(updateTimer, 1000);

    return () => clearInterval(timerId);
  }, [isLocked, lockoutExpiresAt]);

  /**
   * Format lockout time as MM:SS
   */
  const formatLockoutTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  /**
   * Handle PIN input change
   * Only allow digits, max 6 characters
   */
  const handlePinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\D/g, "").slice(0, 6);
      setState((prev) => ({
        ...prev,
        pin: value,
        error: null, // Clear error on new input
      }));
    },
    []
  );

  /**
   * Handle paste event
   * Extract digits only from pasted content
   */
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    const digits = pastedText.replace(/\D/g, "").slice(0, 6);
    setState((prev) => ({
      ...prev,
      pin: digits,
      error: null,
    }));
  }, []);

  /**
   * Handle PIN submission
   * CRITICAL: Clear PIN from state immediately after extraction
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Validate PIN format
      if (state.pin.length !== 6) {
        setState((prev) => ({
          ...prev,
          error: "PIN must be exactly 6 digits",
        }));
        return;
      }

      if (isLocked) {
        setState((prev) => ({
          ...prev,
          error: `Card is locked. Try again in ${formatLockoutTime(state.lockoutTimeRemaining)}`,
        }));
        return;
      }

      // Extract PIN before clearing state
      const pinToSubmit = state.pin;

      // CRITICAL: Clear PIN from state immediately
      setState((prev) => ({
        ...prev,
        pin: "",
        isSubmitting: true,
        error: null,
      }));

      try {
        // Submit PIN to backend
        await onSubmit(pinToSubmit);
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "PIN submission failed";
        setState((prev) => ({
          ...prev,
          error: errorMsg,
          isSubmitting: false,
        }));
      }
    },
    [state.pin, state.lockoutTimeRemaining, isLocked, onSubmit]
  );

  /**
   * Handle cancel button
   */
  const handleCancel = useCallback(() => {
    // Clear PIN from state before canceling
    setState((prev) => ({
      ...prev,
      pin: "",
      error: null,
    }));
    onCancel();
  }, [onCancel]);

  /**
   * Get attempt counter color
   */
  const getAttemptColor = (): string => {
    if (attemptsRemaining === 3) return "bg-green-100 text-green-800";
    if (attemptsRemaining === 2) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  /**
   * Get PIN display (masked or visible)
   */
  const displayPin = state.showPin ? state.pin : "●".repeat(state.pin.length);

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Enter PIN
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">{helpText}</p>
      </div>

      {/* Security Warning */}
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-1">Security Notice</p>
            <p>Never share your PIN. It is validated on your card, never stored on servers.</p>
          </div>
        </div>
      </div>

      {/* PIN Input Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* PIN Input Field */}
        <div className="relative">
          <label
            htmlFor="pin-input"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            6-Digit PIN
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              id="pin-input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={displayPin}
              onChange={handlePinChange}
              onPaste={handlePaste}
              disabled={isLocked || isLoading || state.isSubmitting}
              placeholder="000000"
              className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed transition-colors"
              aria-label="6-digit PIN"
              aria-describedby="pin-help"
            />
            {/* PIN Visibility Toggle */}
            <button
              type="button"
              onClick={() =>
                setState((prev) => ({ ...prev, showPin: !prev.showPin }))
              }
              disabled={state.pin.length === 0 || isLocked || isLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label={state.showPin ? "Hide PIN" : "Show PIN"}
            >
              {state.showPin ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-4.803m5.596-3.856a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
            </button>
          </div>
          <p id="pin-help" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Enter digits only. Maximum 6 characters.
          </p>
        </div>

        {/* Attempt Counter */}
        {!isLocked && (
          <div className={`p-3 rounded-lg ${getAttemptColor()}`}>
            <p className="text-sm font-medium">
              {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining
            </p>
          </div>
        )}

        {/* Lockout Timer */}
        {isLocked && (
          <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200">
            <p className="text-sm font-medium">
              Card locked. Try again in {formatLockoutTime(state.lockoutTimeRemaining)}
            </p>
          </div>
        )}

        {/* Error Message */}
        {state.error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-800 dark:text-red-200">{state.error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isLoading || state.isSubmitting}
            className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              state.pin.length !== 6 ||
              isLocked ||
              isLoading ||
              state.isSubmitting
            }
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {state.isSubmitting || isLoading ? (
              <>
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Verifying...
              </>
            ) : (
              "Submit PIN"
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TapsignerPinEntry;

