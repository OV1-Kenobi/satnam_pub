import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOnboardingSession } from '../../../contexts/OnboardingSessionContext';
import { authenticatedFetch } from '../../../utils/secureSession';

interface NostrMigrationOTPStepProps {
  onNext: () => void;
  onBack: () => void;
  allowSkip?: boolean;
}

const NostrMigrationOTPStep: React.FC<NostrMigrationOTPStepProps> = ({
  onNext,
  onBack,
  allowSkip = false,
}) => {
  const { currentParticipant, updateParticipant, completeStep } = useOnboardingSession();

  // OTP session state
  const [sessionId, setSessionId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [code, setCode] = useState('');
  const [period, setPeriod] = useState(120);
  const [digits, setDigits] = useState(6);

  // UI state
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [canResend, setCanResend] = useState(true);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Countdown timer
  const [remaining, setRemaining] = useState(0);
  const timer = useRef<number | null>(null);
  const resendTimer = useRef<number | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      if (resendTimer.current) window.clearInterval(resendTimer.current);
    };
  }, []);

  // Start countdown timer for OTP expiration
  const startCountdown = useCallback((expIso: string) => {
    if (timer.current) window.clearInterval(timer.current);
    const exp = Date.parse(expIso);
    timer.current = window.setInterval(() => {
      const diff = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      setRemaining(diff);
      if (diff <= 0 && timer.current) {
        window.clearInterval(timer.current);
        timer.current = null;
      }
    }, 1000);
  }, []);

  // Start resend cooldown timer (60 seconds)
  const startResendCooldown = useCallback(() => {
    setCanResend(false);
    setResendCooldown(60);
    if (resendTimer.current) window.clearInterval(resendTimer.current);
    resendTimer.current = window.setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (resendTimer.current) {
            window.clearInterval(resendTimer.current);
            resendTimer.current = null;
          }
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Generate OTP and send via Nostr DM
  const handleGenerateOTP = useCallback(async () => {
    if (!currentParticipant?.npub || !currentParticipant?.nip05) {
      setError('Missing participant data (npub or NIP-05)');
      return;
    }

    setIsGenerating(true);
    setError('');
    setSuccess('');

    try {
      const response = await authenticatedFetch('/.netlify/functions/auth-migration-otp-generate', {
        method: 'POST',
        body: JSON.stringify({
          npub: currentParticipant.npub,
          nip05: currentParticipant.nip05,
          // lightningAddress is optional and stored in lightning_links table, not on participant
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate OTP');
      }

      setSessionId(data.sessionId);
      setExpiresAt(data.expiresAt);
      setPeriod(data.period || 120);
      setDigits(data.digits || 6);
      startCountdown(data.expiresAt);
      startResendCooldown();
      setSuccess('Verification code sent to your Nostr account via encrypted DM. Check your Nostr DMs for a message from Satnam.');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send verification code';
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  }, [currentParticipant, startCountdown, startResendCooldown]);

  // Verify OTP code
  const handleVerifyOTP = useCallback(async () => {
    if (!sessionId || !currentParticipant?.npub || code.length !== digits) {
      return;
    }

    setIsVerifying(true);
    setError('');
    setSuccess('');

    try {
      const response = await authenticatedFetch('/.netlify/functions/auth-migration-otp-verify', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          npub: currentParticipant.npub,
          code,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.expired) {
          throw new Error('Verification code has expired. Please request a new code.');
        }
        if (errorData.replayAttack) {
          throw new Error('This code has already been used. Please request a new code.');
        }
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success || !data.verified) {
        throw new Error('Invalid verification code');
      }

      // Update participant with migration verified flag
      await updateParticipant(currentParticipant.participantId, {
        currentStep: 'nfc',
        migrationFlag: true,
      });

      // Complete the migration step (Migration data stored in nostr_migrations table via API)
      await completeStep('migration');

      setSuccess('Account ownership verified successfully!');

      // Navigate to next step after brief delay
      setTimeout(() => {
        onNext();
      }, 1500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Verification failed';
      setError(errorMessage);
    } finally {
      setIsVerifying(false);
    }
  }, [sessionId, currentParticipant, code, digits, updateParticipant, completeStep, onNext]);

  // Skip migration (fallback to manual migration)
  const handleSkip = useCallback(async () => {
    if (!currentParticipant) return;

    try {
      await updateParticipant(currentParticipant.participantId, {
        currentStep: 'nfc',
        migrationFlag: false,
      });

      onNext();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to skip migration';
      setError(errorMessage);
    }
  }, [currentParticipant, updateParticipant, onNext]);

  // Handle code input (digits only)
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D+/g, '').slice(0, digits);
    setCode(value);
  };

  if (!currentParticipant) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg bg-red-50 p-4 text-red-800">
          <p className="text-sm font-medium">Error: No participant data found</p>
        </div>
      </div>
    );
  }

  const isLoading = isGenerating || isVerifying;
  const canVerify = sessionId && code.length === digits && !isLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Verify Nostr Account Ownership</h2>
        <p className="text-sm text-gray-600">
          We'll send a verification code to your existing Nostr account to confirm ownership before migration.
        </p>
      </div>

      {/* Participant Info */}
      <div className="rounded-lg bg-blue-50 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-blue-900">Existing Nostr Account:</span>
          <span className="text-sm font-mono text-blue-700">
            {currentParticipant.npub?.slice(0, 12)}...{currentParticipant.npub?.slice(-8)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-blue-900">New NIP-05:</span>
          <span className="text-sm text-blue-700">{currentParticipant.nip05}</span>
        </div>
      </div>

      {/* Instructions */}
      <div className="rounded-lg bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">How it works:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
          <li>Click "Send Verification Code" to receive a 6-digit code via Nostr DM</li>
          <li>Check your Nostr DMs for a message from Satnam</li>
          <li>Enter the 6-digit code below</li>
          <li>Click "Verify Code" to confirm ownership</li>
        </ol>
      </div>

      {/* OTP Generation */}
      {!sessionId && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGenerateOTP}
            disabled={isLoading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? 'Sending Code...' : 'Send Verification Code'}
          </button>
        </div>
      )}

      {/* OTP Verification */}
      {sessionId && (
        <div className="space-y-4">
          {/* Expiration Timer */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Code expires in:</span>
            <span className={`font-mono font-semibold ${remaining < 60 ? 'text-red-600' : 'text-gray-900'}`}>
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </span>
          </div>

          {/* Code Input */}
          <div className="space-y-2">
            <label htmlFor="otp-code" className="block text-sm font-medium text-gray-700">
              Verification Code
            </label>
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={digits}
              value={code}
              onChange={handleCodeChange}
              placeholder={''.padStart(digits, '•')}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl font-mono tracking-widest focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              disabled={isLoading}
            />
          </div>

          {/* Verify Button */}
          <button
            type="button"
            onClick={handleVerifyOTP}
            disabled={!canVerify}
            className="w-full rounded-lg bg-green-600 px-4 py-3 text-white font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isVerifying ? 'Verifying...' : 'Verify Code'}
          </button>

          {/* Resend Button */}
          <button
            type="button"
            onClick={handleGenerateOTP}
            disabled={!canResend || isLoading}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {canResend ? 'Resend Code' : `Resend in ${resendCooldown}s`}
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="rounded-lg bg-green-50 p-4">
          <p className="text-sm font-medium text-green-800">{success}</p>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Back
        </button>

        {allowSkip && (
          <button
            type="button"
            onClick={handleSkip}
            disabled={isLoading}
            className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Skip for Now
          </button>
        )}
      </div>
    </div>
  );
};

export default NostrMigrationOTPStep;

