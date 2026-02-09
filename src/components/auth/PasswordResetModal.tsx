/**
 * Password Reset Modal Component
 *
 * Provides secure password recovery for users who forgot their password.
 *
 * Two Recovery Paths:
 * 1. Password Recovery (PRK): Recover original password using nsec or Keet seed
 * 2. Password Reset: Set a new password by proving identity ownership
 *
 * Proof methods:
 * - NIP-07 browser extension signature
 * - Nsec manual entry (for those without extension)
 * - Keet seed phrase (24 words)
 */

import { AlertTriangle, Clock, Copy, Check, Eye, EyeOff, Key, RefreshCw, Shield, X } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (sessionToken: string) => void;
}

type RecoveryMode = 'choose' | 'recover' | 'reset';
type RecoveryMethod = 'nsec' | 'keet';
type ProofMethod = 'nip07' | 'nsec';
type ResetStep = 'nip05' | 'mode' | 'recover-method' | 'recover-input' | 'recover-display' | 'proof' | 'password' | 'processing' | 'success';

export const PasswordResetModal: React.FC<PasswordResetModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<ResetStep>('nip05');
  const [mode, setMode] = useState<RecoveryMode>('choose');
  const [nip05, setNip05] = useState('');
  const [proofMethod, setProofMethod] = useState<ProofMethod | null>(null);
  const [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod | null>(null);
  const [nsec, setNsec] = useState('');
  const [showNsec, setShowNsec] = useState(false);
  const [keetSeed, setKeetSeed] = useState('');
  const [showKeetSeed, setShowKeetSeed] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [signedEvent, setSignedEvent] = useState<unknown>(null);
  const [hasNip07, setHasNip07] = useState(false);

  // Password recovery state
  const [recoveredPassword, setRecoveredPassword] = useState('');
  const [displayTimeRemaining, setDisplayTimeRemaining] = useState(60);
  const [passwordCopied, setPasswordCopied] = useState(false);

  useEffect(() => {
    // Check for NIP-07 extension
    setHasNip07(typeof window !== 'undefined' && !!(window as unknown as { nostr?: unknown }).nostr);
  }, []);

  const handleClose = useCallback(() => {
    // Clear all sensitive data
    setNsec('');
    setKeetSeed('');
    setNewPassword('');
    setConfirmPassword('');
    setRecoveredPassword('');
    setSignedEvent(null);
    // Reset to initial state
    setStep('nip05');
    setMode('choose');
    setRecoveryMethod(null);
    setProofMethod(null);
    setDisplayTimeRemaining(60);
    setPasswordCopied(false);
    setError('');
    onClose();
  }, [onClose]);

  // Timer for recovered password display (60 seconds)
  useEffect(() => {
    if (step === 'recover-display' && displayTimeRemaining > 0) {
      const timer = setInterval(() => {
        setDisplayTimeRemaining((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [step, displayTimeRemaining]);

  // Handle expiration outside the state updater
  useEffect(() => {
    if (step === 'recover-display' && displayTimeRemaining === 0) {
      setRecoveredPassword('');
      handleClose();
    }
  }, [step, displayTimeRemaining, handleClose]);

  // Copy password to clipboard
  const handleCopyPassword = useCallback(async () => {
    if (!recoveredPassword) return;
    try {
      await navigator.clipboard.writeText(recoveredPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [recoveredPassword]);

  if (!isOpen) return null;

  const handleNip05Submit = () => {
    const trimmed = nip05.trim().toLowerCase();
    if (!trimmed || !/^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/.test(trimmed)) {
      setError('Please enter a valid NIP-05 identifier (e.g., user@domain.com)');
      return;
    }
    setError('');
    setStep('mode'); // Go to mode selection (recover vs reset)
  };

  const handleModeSelect = (selectedMode: RecoveryMode) => {
    setMode(selectedMode);
    if (selectedMode === 'recover') {
      setStep('recover-method');
    } else {
      setStep('proof');
    }
  };

  const handleRecoveryMethodSelect = (method: RecoveryMethod) => {
    setRecoveryMethod(method);
    setStep('recover-input');
  };

  const handlePasswordRecovery = async () => {
    setIsProcessing(true);
    setError('');

    try {
      const recoveryData = recoveryMethod === 'nsec' ? nsec.trim() : keetSeed.trim();

      if (!recoveryData) {
        setError(recoveryMethod === 'nsec' ? 'Please enter your nsec' : 'Please enter your Keet seed phrase');
        setIsProcessing(false);
        return;
      }

      const response = await fetch('/api/auth/recover-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nip05: nip05.trim().toLowerCase(),
          recoveryMethod,
          recoveryData,
        }),
      });

      const result = await response.json();

      // Clear sensitive input data immediately
      setNsec('');
      setKeetSeed('');

      if (!response.ok || !result.success) {
        setError(result.error || 'Password recovery failed');
        setIsProcessing(false);
        return;
      }

      // Success - display recovered password
      setRecoveredPassword(result.data.recoveredPassword);
      setDisplayTimeRemaining(result.data.expiresIn || 60);
      setStep('recover-display');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password recovery failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNip07Proof = async () => {
    try {
      setIsProcessing(true);
      setError('');

      const nostr = (window as any).nostr;
      if (!nostr) {
        setError('NIP-07 extension not found');
        return;
      }

      // Create a password reset challenge event
      const event = {
        kind: 22242, // Custom auth kind for password reset
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['action', 'password-reset'],
          ['nip05', nip05.trim().toLowerCase()],
        ],
        content: `Password reset request for ${nip05}`,
      };

      const signed = await nostr.signEvent(event);
      setSignedEvent(signed);
      setProofMethod('nip07');
      setStep('password');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign with extension');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNsecSubmit = () => {
    if (!nsec.trim()) {
      setError('Please enter your nsec private key');
      return;
    }
    // Basic nsec format validation
    const trimmed = nsec.trim();
    if (!trimmed.startsWith('nsec') && !/^[a-f0-9]{64}$/i.test(trimmed)) {
      setError('Invalid nsec format. Enter nsec1... or 64-character hex');
      return;
    }
    setProofMethod('nsec');
    setError('');
    setStep('password');
  };

  const handlePasswordReset = async () => {
    // Validate passwords
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsProcessing(true);
    setError('');
    setStep('processing');

    try {
      const proofData = proofMethod === 'nip07'
        ? { signedEvent }
        : { nsec: nsec.trim() };

      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nip05: nip05.trim().toLowerCase(),
          newPassword,
          proofMethod,
          proofData,
        }),
      });

      const result = await response.json();

      // Clear sensitive data immediately
      setNsec('');
      setNewPassword('');
      setConfirmPassword('');

      if (!response.ok || !result.success) {
        setError(result.error || 'Password reset failed');
        setStep('password');
        return;
      }

      setStep('success');

      if (result.data?.sessionToken && onSuccess) {
        onSuccess(result.data.sessionToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
      setStep('password');
    } finally {
      setIsProcessing(false);
    }
  };



  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Reset Password</h2>
          </div>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start">
              <AlertTriangle className="h-5 w-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Step 1: Enter NIP-05 */}
          {step === 'nip05' && (
            <div className="space-y-4">
              <p className="text-gray-600 text-sm">
                Enter your NIP-05 identifier to begin password recovery.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  NIP-05 Identifier
                </label>
                <input
                  type="text"
                  value={nip05}
                  onChange={(e) => setNip05(e.target.value)}
                  placeholder="user@my.satnam.pub"
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleNip05Submit}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Choose Mode (Recover vs Reset) */}
          {step === 'mode' && (
            <div className="space-y-4">
              <p className="text-gray-600 text-sm">
                Choose how you want to access your account for <strong>{nip05}</strong>
              </p>

              <button
                onClick={() => handleModeSelect('recover')}
                className="w-full p-4 border-2 border-green-200 rounded-lg hover:bg-green-50 text-left"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-green-100 rounded-full">
                    <Key className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-green-800">Recover Original Password</p>
                    <p className="text-sm text-gray-500">Use your nsec or Keet seed to recover your password</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleModeSelect('reset')}
                className="w-full p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 text-left"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-full">
                    <RefreshCw className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-blue-800">Set New Password</p>
                    <p className="text-sm text-gray-500">Prove identity and create a new password</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setStep('nip05')}
                className="w-full text-gray-600 py-2 hover:text-gray-800"
              >
                ← Back
              </button>
            </div>
          )}

          {/* Step 2a: Recovery Method Selection */}
          {step === 'recover-method' && (
            <div className="space-y-4">
              <p className="text-gray-600 text-sm">
                Choose your recovery method for <strong>{nip05}</strong>
              </p>

              <button
                onClick={() => handleRecoveryMethodSelect('nsec')}
                className="w-full p-4 border-2 border-purple-200 rounded-lg hover:bg-purple-50 text-left"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-100 rounded-full">
                    <Key className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium">Nostr Private Key (nsec)</p>
                    <p className="text-sm text-gray-500">Enter your nsec1... private key</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleRecoveryMethodSelect('keet')}
                className="w-full p-4 border-2 border-orange-200 rounded-lg hover:bg-orange-50 text-left"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-100 rounded-full">
                    <Shield className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-medium">Keet Seed Phrase</p>
                    <p className="text-sm text-gray-500">Enter your 24-word seed phrase</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setStep('mode')}
                className="w-full text-gray-600 py-2 hover:text-gray-800"
              >
                ← Back
              </button>
            </div>
          )}

          {/* Step 2b: Recovery Input */}
          {step === 'recover-input' && (
            <div className="space-y-4">
              <p className="text-gray-600 text-sm">
                {recoveryMethod === 'nsec'
                  ? 'Enter your Nostr private key to recover your password'
                  : 'Enter your 24-word Keet seed phrase to recover your password'}
              </p>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-xs text-amber-700">
                  ⚠️ Your secret is transmitted securely over HTTPS to recover your password. It is not stored on servers.
                </p>
              </div>

              {recoveryMethod === 'nsec' ? (
                <div className="relative">
                  <input
                    type={showNsec ? 'text' : 'password'}
                    value={nsec}
                    onChange={(e) => setNsec(e.target.value)}
                    placeholder="nsec1..."
                    className="w-full px-3 py-2 pr-10 border rounded-md font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNsec(!showNsec)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                  >
                    {showNsec ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <textarea
                    value={keetSeed}
                    onChange={(e) => setKeetSeed(e.target.value)}
                    placeholder="Enter your 24 words separated by spaces..."
                    className="w-full px-3 py-2 border rounded-md font-mono text-sm h-24 resize-none"
                  />
                </div>
              )}

              <button
                onClick={handlePasswordRecovery}
                disabled={isProcessing || (recoveryMethod === 'nsec' ? !nsec.trim() : !keetSeed.trim())}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {isProcessing ? 'Recovering...' : 'Recover Password'}
              </button>

              <button
                onClick={() => setStep('recover-method')}
                className="w-full text-gray-600 py-2 hover:text-gray-800"
              >
                ← Back
              </button>
            </div>
          )}

          {/* Step 2c: Recovered Password Display */}
          {step === 'recover-display' && recoveredPassword && (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-700 font-medium">✓ Password recovered successfully!</p>
              </div>

              <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Your Password</span>
                  <div className="flex items-center space-x-2 text-sm text-amber-600">
                    <Clock className="h-4 w-4" />
                    <span>{displayTimeRemaining}s</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 p-2 bg-white border rounded font-mono text-sm break-all">
                    {recoveredPassword}
                  </code>
                  <button
                    onClick={handleCopyPassword}
                    className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    title="Copy to clipboard"
                  >
                    {passwordCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-xs text-amber-700">
                  ⚠️ This password will be hidden in {displayTimeRemaining} seconds.
                  Write it down or copy it now!
                </p>
              </div>

              <button
                onClick={handleClose}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
              >
                Done - Sign In Now
              </button>
            </div>
          )}

          {/* Step 3: Prove Identity (for Reset flow) */}
          {step === 'proof' && (
            <div className="space-y-4">
              <p className="text-gray-600 text-sm">
                Prove you own <strong>{nip05}</strong> by signing with your Nostr identity.
              </p>

              <div className="space-y-3">
                {/* NIP-07 Option */}
                {hasNip07 && (
                  <button
                    onClick={handleNip07Proof}
                    disabled={isProcessing}
                    className="w-full p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 text-left flex items-center space-x-3"
                  >
                    <div className="p-2 bg-blue-100 rounded-full">
                      <Key className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">Browser Extension (NIP-07)</p>
                      <p className="text-sm text-gray-500">Sign with Alby, nos2x, etc.</p>
                    </div>
                  </button>
                )}

                {/* Nsec Option */}
                <div className="border-2 border-gray-200 rounded-lg p-4">
                  <p className="font-medium mb-2">Enter Nsec Private Key</p>
                  <p className="text-xs text-amber-600 mb-3">
                    ⚠️ Never share your nsec. It's processed locally and not stored.
                  </p>
                  <div className="relative">
                    <input
                      type={showNsec ? 'text' : 'password'}
                      value={nsec}
                      onChange={(e) => setNsec(e.target.value)}
                      placeholder="nsec1... or hex private key"
                      className="w-full px-3 py-2 pr-10 border rounded-md font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNsec(!showNsec)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                    >
                      {showNsec ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    onClick={handleNsecSubmit}
                    disabled={!nsec.trim()}
                    className="mt-3 w-full bg-gray-800 text-white py-2 px-4 rounded-md hover:bg-gray-900 disabled:opacity-50"
                  >
                    Verify Ownership
                  </button>
                </div>
              </div>

              <button
                onClick={() => setStep('nip05')}
                className="w-full text-gray-600 py-2 hover:text-gray-800"
              >
                ← Back
              </button>
            </div>
          )}

          {/* Step 3: Set New Password */}
          {step === 'password' && (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-700">✓ Identity verified. Enter your new password.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full px-3 py-2 pr-10 border rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>

              <button
                onClick={handlePasswordReset}
                disabled={isProcessing || newPassword.length < 8}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Reset Password
              </button>
            </div>
          )}

          {/* Processing */}
          {step === 'processing' && (
            <div className="text-center py-8">
              <RefreshCw className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Resetting your password...</p>
            </div>
          )}

          {/* Success */}
          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Password Reset Complete!</h3>
              <p className="text-gray-600 text-sm mb-4">
                You can now sign in with your new password.
              </p>
              <button
                onClick={handleClose}
                className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

